import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  Menu,
  nativeImage,
  type OpenDialogReturnValue,
  session,
  shell,
  Tray,
} from 'electron';

import { APP_NAME, DEFAULT_SOCKS_PORT, IPC_PING } from '../shared/constants';
import type {
  IpcPushChannel,
  LogsView,
  OperationResult,
  PingResult,
  ProfileImportResult,
  ProfileRemovalResult,
  ProfileSummary,
  ProfileView,
  ProxyState,
  ProxyToggleRequest,
  StatusSnapshot,
} from '../shared/ipc';
import { type AppError, type CoreState } from '../shared/status-machine';
import { createSupervisor } from './core-supervisor';
import { createCoreWiring } from './core-wiring';
import { assertTrustedSender } from './ipc-guard';
import { createLogCollector } from './log-collector';
import { validateClientConfig } from './profile-validator';
import {
  deleteStoredProfile,
  loadProfile,
  saveProfile,
  storedProfileModifiedAt,
} from './secret-store';
import {
  type CommandResult,
  restoreSystemProxy,
  type SystemProxyContext,
  type SystemProxySnapshot,
} from './system-proxy';
import { buildTrayMenu, createWindowLifecycle, type TrayMenuAction } from './window-lifecycle';

/** `status:changed` push channel (§4.2, FR-63) — a contract literal, never a free string. */
const STATUS_CHANGED = 'status:changed' satisfies IpcPushChannel;

/** `log:line` push channel (§4.2, FR-63) — same rule: a contract literal, never a free string. */
const LOG_LINE = 'log:line' satisfies IpcPushChannel;

/**
 * FR-63 (data-flows §4.2): pushes a status snapshot main → renderer with
 * `webContents.send` — the renderer never polls for state that main owns.
 * Called once the page is ready and on every future transition: every push
 * comes from the M1-17 wiring's injected `broadcast`, so a transition is
 * fanned out exactly once (FR-26, no double-send). The send is best-effort
 * so a window closing mid-push cannot break the notification path (same
 * rule as the `log:line` push below); the tray mirror runs first so a
 * closed window still leaves the state visible (AC-05.4, FR-43).
 */
function broadcastStatus(snapshot: StatusSnapshot): void {
  syncTray(snapshot.state);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(STATUS_CHANGED, snapshot);
    } catch {
      // The window is gone — the snapshot already reached the tray, and the
      // renderer re-fetches `status:get` on its next mount (data-flows §5).
    }
  }
}

/**
 * The bounded log buffer (FR-45/FR-46, M1-19): the single redaction entry
 * point (FR-47) every core/app line passes through — the renderer only ever
 * receives what this collector returns (data-flows (b) step 6).
 */
const logCollector = createLogCollector();

/**
 * FR-63 (data-flows (d) H4): each stored (post-redaction) line is pushed to
 * every window as it arrives — the renderer never polls the buffer. Mirrors
 * `broadcastStatus`; the send is best-effort so a window closing mid-push
 * cannot break the collector's notification path.
 */
logCollector.subscribe((line) => {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(LOG_LINE, line);
    } catch {
      // The window is gone — the line stays in the buffer for the next one.
    }
  }
});

// ————————————————————————————————————————————————————————————————
// Tray mirror (FR-24/FR-41, AC-05.4 — M1-17 wiring half): the state reaches
// the tray as TEXT (menu model + tooltip), never color-only (NFR-5/FR-41).
// Tray/window actions are main-internal, never IPC (data-flows §4.2 "Not
// IPC"); the close-to-tray / quit-teardown wiring is attached in the M1-23
// lifecycle section below.
// ————————————————————————————————————————————————————————————————

/**
 * 16×16 PNG icon embedded as a data URL — no icon asset ships with the repo
 * yet (packaging supplies the real icon later); an embedded image keeps the
 * tray working on macOS and Linux alike with no filesystem dependency.
 */
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVR42mNgoDbQMnX8jw8TpTl69n+sGK8h+DRiM4gkmwm6hBTNWF0xagCVDKAoGilOSFRJylTJTOQAAExzvBA3oawXAAAAAElFTkSuQmCC';

/** The tray instance, created once the app is ready (`app.whenReady`). */
let tray: Tray | null = null;

/**
 * FR-24/FR-41 + AC-05.4: rebuild the tray from the state alone — the menu
 * template comes from the pinned `buildTrayMenu(state)` model (all four
 * items always listed, `enabled` following the data-flows §2.3 guards) and
 * the tooltip carries the model's `statusText`, so the state is readable as
 * TEXT in both places (never icon/color only, NFR-5).
 *
 * @param state current core lifecycle state (every `status:changed` push
 *   fans out here before it reaches the windows)
 */
function syncTray(state: CoreState): void {
  const current = tray;
  if (current === null) {
    return;
  }
  const model = buildTrayMenu(state);
  current.setToolTip(model.statusText);
  current.setContextMenu(
    Menu.buildFromTemplate(
      model.items.map((item) => ({
        label: item.label,
        enabled: item.enabled,
        click: (): void => {
          void dispatchTrayAction(item.id);
        },
      })),
    ),
  );
}

/**
 * Tray "Show window" (FR-40 / AC-05.3): un-minimize + show + focus the main
 * window — one implementation shared by the tray menu dispatch and the
 * lifecycle's `showWindow` dep (data-flows §4.2 "Not IPC": no window handle
 * inside the pure policy).
 */
function showMainWindow(): void {
  const [win] = BrowserWindow.getAllWindows();
  if (win !== undefined) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
}

/**
 * Tray menu dispatch (data-flows §4.2 "Not IPC"): `start`/`stop` reuse the
 * very same wiring the `core:*` handlers delegate to, `open` shows the main
 * window (FR-40), and `quit` runs the ONE shared data-flows §5 teardown —
 * stop the core, then revert the system proxy, then request the exit (M1-23b,
 * FR-19/FR-35/FR-42: no shortcut route beside `before-quit`).
 */
async function dispatchTrayAction(action: TrayMenuAction): Promise<void> {
  switch (action) {
    case 'open':
      showMainWindow();
      return;
    case 'start':
      await coreWiring.handleStart();
      return;
    case 'stop':
      await coreWiring.handleStop();
      return;
    case 'quit':
      // Same teardown as `before-quit` (AC-05.5 single shared teardown) —
      // the policy stops the core, restores the proxy and requests the exit.
      beginQuit();
      return;
  }
}

/**
 * Creates the tray icon once the app is ready; `syncTray` fills menu + tooltip.
 * The tray is a best-effort affordance: a headless session may expose no
 * system tray at all, and a missing one must never break startup — with
 * `tray === null` the mirror simply stays off and the renderer status view
 * remains the source of truth.
 */
function createTray(): void {
  try {
    tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL));
  } catch {
    tray = null;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    title: APP_NAME,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Navigation guard (M0-19 / S3-1): the window may only stay on the local
  // renderer — the dev server URL in dev or a local file when packaged.
  // Remote navigation would keep the preload attached, so it is denied.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const isAllowedNavigation = (url: string): boolean =>
    url.startsWith('file://') || (devUrl !== undefined && url === devUrl);
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });

  // M1-23b (FR-39 / US-05 AC-05.2, PR-03 close-to-tray): every close request
  // routes through the lifecycle policy — verdict 'hide' (not quitting)
  // prevents the close and HIDES the window to tray (the process and a
  // running core stay alive); verdict 'close' (quitting) lets the window
  // really close so the exit can complete (AC-05.5). Registration is
  // best-effort like `createTray`: a window surface without native close
  // events must never break startup.
  try {
    win.on('close', (event) => {
      if (windowLifecycle.handleCloseRequest() === 'hide') {
        event.preventDefault();
        win.hide();
      }
    });
  } catch {
    // No native close events on this surface — there is nothing to gate.
  }

  // FR-63: hand the renderer main's current status by push as soon as the
  // page is ready (the renderer additionally calls `status:get` once at
  // startup per data-flows §5).
  win.webContents.on('did-finish-load', () => {
    broadcastStatus(coreWiring.getStatus());
  });

  // M0-19 / S4-3: never load a dev URL in a packaged app even if the env
  // var was inherited from the environment.
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

// ————————————————————————————————————————————————————————————————
// Import-pipeline helpers (M1-12, data-flows (a)) — main-internal, never
// bridged to the renderer (FR-55).
// ————————————————————————————————————————————————————————————————

/** `errors.md` §2: the picked file vanished between dialog and read (FR-06). */
const FILE_READ_FAILED: AppError = {
  code: 'E-IO-001',
  title: 'Could not read the profile file',
  cause:
    'The file could not be read — it may have been moved, deleted, or its permissions changed.',
  nextStep: 'Check the file still exists, then import again.',
};

/** `errors.md` §2 defensive entry: the native picker itself failed (FR-01). */
const DIALOG_FAILED: AppError = {
  code: 'E-IO-002',
  title: 'File dialog could not open',
  cause: 'The system file dialog failed to open.',
  nextStep: 'Try again; if it repeats, restart the app.',
};

/** `errors.md` §5 defensive entry: persisting the validated document failed (FR-54). */
const PROFILE_SAVE_FAILED: AppError = {
  code: 'E-STOR-005',
  title: 'Profile could not be saved',
  cause:
    'Writing the encrypted profile to the app data directory failed (disk full or permissions).',
  nextStep: 'Free disk space / fix permissions, then import again.',
};

/** Structural NFR-5 shape — the store throws `SecretStoreError implements AppError`. */
function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<AppError>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.cause === 'string' &&
    typeof candidate.nextStep === 'string'
  );
}

/**
 * FR-48 / NFR-5: only a documented triple may cross the bridge — a thrown
 * value that is not already an `AppError` degrades to `fallback` instead of
 * leaking its message or stack into the renderer.
 */
function asAppError(value: unknown, fallback: AppError): AppError {
  if (isAppError(value)) {
    return {
      code: value.code,
      title: value.title,
      cause: value.cause,
      nextStep: value.nextStep,
    };
  }
  return fallback;
}

/** Plain JSON object guard — arrays and null are never config documents. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The fedarisha outbound's `settings.storage`, or null when absent. */
function storageOf(doc: Record<string, unknown>): Record<string, unknown> | null {
  const outbounds = doc['outbounds'];
  if (!Array.isArray(outbounds)) {
    return null;
  }
  for (const entry of outbounds) {
    if (!isRecord(entry) || entry['protocol'] !== 'fedarisha') {
      continue;
    }
    const settings = entry['settings'];
    if (!isRecord(settings)) {
      return null;
    }
    const storage = settings['storage'];
    return isRecord(storage) ? storage : null;
  }
  return null;
}

/** A non-empty string field of the storage block — '' when absent. */
function stringField(storage: Record<string, unknown> | null, key: string): string {
  const value = storage === null ? undefined : storage[key];
  return typeof value === 'string' ? value : '';
}

/** Hostname only (§8.3) — never scheme, path or userinfo. */
function hostOf(endpoint: string): string {
  if (endpoint === '') {
    return '';
  }
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

/** Last path segment of `prefix` (fallback: bucket) — the profile's label (§8.3). */
function labelOf(prefix: string, bucket: string): string {
  const segments = prefix.split('/').filter((segment) => segment !== '');
  const last = segments[segments.length - 1];
  if (last !== undefined && last !== '.' && last !== '..') {
    return last;
  }
  return bucket === '' ? 'profile' : bucket;
}

/**
 * §8.3 `ProfileSummary` — the only config shape the renderer may receive
 * (FR-05/FR-55): internal display fields only — never accessKey, secretKey,
 * any `*token*` field and never the document itself (§8.4, §4.3 denylist).
 */
function buildProfileSummary(doc: Record<string, unknown>, importedAt: string): ProfileSummary {
  const storage = storageOf(doc);
  const bucket = stringField(storage, 'bucket');
  const prefix = stringField(storage, 'prefix');
  const endpointHost = hostOf(stringField(storage, 'endpoint'));
  const label = labelOf(prefix, bucket);
  return {
    displayName: endpointHost === '' ? label : `${label} @ ${endpointHost}`,
    endpointHost,
    bucket,
    prefix,
    region: stringField(storage, 'region'),
    importedAt,
    socksPort: DEFAULT_SOCKS_PORT,
  };
}

/** Parses a stored profile document; a damaged one means "no profile" (§5). */
function parseStoredProfile(raw: string): Record<string, unknown> | null {
  try {
    const doc: unknown = JSON.parse(raw);
    return isRecord(doc) ? doc : null;
  } catch {
    return null;
  }
}

// ————————————————————————————————————————————————————————————————
// M1-17 (data-flows (b)): supervisor → IPC status wiring — the HOST resolves
// every collaborator here, the glue itself stays pure node (DV-28).
// ————————————————————————————————————————————————————————————————

/**
 * S4-5 (docs/qa/security-m1-10.md): the `CORE_BINARY_PATH` dev override is
 * honored ONLY while `!app.isPackaged` — inside a package the bundled engine
 * path wins so the environment can never substitute the executable (M2 pins
 * the packaged name; until then the path simply does not exist and the
 * supervisor answers the documented E-IO-004 without spawning, risk R-1).
 */
function resolveCoreBinaryPath(): string {
  const override = process.env.CORE_BINARY_PATH;
  if (!app.isPackaged && override !== undefined && override.trim() !== '') {
    return override;
  }
  // `process.resourcesPath` exists only inside a real Electron process; the
  // unit-test harness loads this module under plain node where it is absent.
  // Falling back to the bare name keeps construction total — no such file
  // resolves from the test cwd, so the supervisor answers the documented
  // E-IO-004 without spawning (risk R-1), exactly like a missing bundle.
  const resources = process.resourcesPath;
  const dir = typeof resources === 'string' && resources !== '' ? resources : '.';
  return join(dir, 'fedarisha-xray-core');
}

/**
 * The M1-17 status wiring (FR-13/FR-25/FR-26/FR-63): `core:start`,
 * `core:stop` and `status:get` delegate to it, and every supervisor
 * transition reaches `broadcastStatus` (→ tray text mirror + the single
 * `status:changed` push) through the injected `broadcast` — exactly one
 * fan-out per transition, never a second `getStatus()` poll.
 */
const coreWiring = createCoreWiring({
  createSupervisor,
  binaryPath: resolveCoreBinaryPath(),
  loadConfig: (): string | null => {
    // Same degradation rule `profile:get` applies: an unreadable store
    // answers "no profile" (data-flows §5) — the step-0 guard refuses Start.
    try {
      return loadProfile();
    } catch {
      return null;
    }
  },
  logSink: (line): void => {
    // M1-19 (FR-47): the collector is main's single redaction entry point —
    // raw child lines reach it here, never a window (data-flows (b) step 6).
    logCollector.push(line);
  },
  broadcast: (snapshot): void => {
    broadcastStatus(snapshot);
  },
});

// ————————————————————————————————————————————————————————————————
// M1-23b (data-flows §5; FR-19/FR-35/FR-39/FR-42; US-05 AC-05.2/AC-05.5,
// US-04 AC-04.7; PR-03/PR-08): native window-lifecycle wiring — the M1-22
// policy (window-lifecycle.ts) attached to the real Electron close/quit
// events, with the system-proxy restore hook and the execFile executor seam.
// ————————————————————————————————————————————————————————————————

/**
 * PR-08 executor seam for `SystemProxyContext.run`: executes ONE argv array
 * through `execFile` (never a shell string — no `exec`/`execSync`/`shell:true`
 * anywhere in this file), resolving the `{code, stdout, stderr}` shape the
 * system-proxy module consumes. A non-zero exit maps to its numeric code; a
 * spawn failure (missing binary) degrades to `-1`, exactly the fail-closed
 * convention the module applies to a throwing executor (FR-35).
 *
 * @param args argv array — `[binary, ...args]`, no shell metacharacters
 */
function runExecFile(args: string[]): Promise<CommandResult> {
  const [command, ...argv] = args;
  if (command === undefined) {
    return Promise.resolve({ code: -1, stdout: '', stderr: 'execFile: empty argv' });
  }
  return new Promise((resolve) => {
    execFile(command, argv, { encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1;
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Host context handed to `restoreSystemProxy` (data-flows §3): `platform` is
 * PASSED IN as `process.platform` (never read by the pure module, PR-01) and
 * `run` is the injected `execFile` executor above (PR-08).
 */
const systemProxyContext: SystemProxyContext = {
  platform: process.platform,
  run: runExecFile,
};

/**
 * The snapshot `setSystemProxy` would replay on restore. Deliberately `null`
 * for now: set-on-start is NOT wired in M1-23b (DV-30(4) — US-04's ACs are
 * user-driven, automation needs an owner/PM spec decision first), so
 * `restoreSystemProxy(ctx, null)` is the module's documented idempotent
 * no-op — the restore HOOK itself is wired unconditionally below (FR-35).
 */
const proxySnapshot: SystemProxySnapshot | null = null;

/** Main's quit marker (FR-42): true once the app is on its way out. */
let quitting = false;

/**
 * True once the quit teardown reached `requestQuit` (the policy's LAST step).
 * Checked BEFORE `preventDefault` so Electron's re-fired `before-quit` — from
 * `requestQuit`'s own `app.quit()` — passes through instead of being gated
 * into a stranded exit (FR-42 "full app exit", AC-05.5).
 */
let teardownSettled = false;

/**
 * The M1-23 lifecycle policy over its Electron/host collaborators (plan
 * M1-23a deps contract, FR-19/FR-35): `stopCore` takes the very path
 * `core:stop` delegates to (single stop route), `restoreProxy` delegates to
 * the system-proxy restore hook UNCONDITIONALLY (no caller-side guard — the
 * module owns the `snapshot === null` no-op), and `requestQuit` opens the
 * before-quit gate before asking the host to exit.
 */
const windowLifecycle = createWindowLifecycle({
  isQuitting: () => quitting,
  stopCore: async (): Promise<void> => {
    // FR-19: the very path `core:stop` delegates to — one stop route, and
    // the `{ok:true}` payload of a no-op stop is irrelevant to teardown.
    await coreWiring.handleStop();
  },
  restoreProxy: async (): Promise<void> => {
    // FR-35 / AC-04.7: UNCONDITIONAL delegation — the module itself owns the
    // `snapshot === null` idempotent no-op, never a caller-side guard.
    await restoreSystemProxy(systemProxyContext, proxySnapshot);
  },
  showWindow: showMainWindow,
  startTunnel: async (): Promise<void> => {
    await coreWiring.handleStart();
  },
  stopTunnel: async (): Promise<void> => {
    await coreWiring.handleStop();
  },
  requestQuit: (): void => {
    // Gate open BEFORE the quit request (see `teardownSettled` above).
    teardownSettled = true;
    app.quit();
  },
});

/**
 * The single quit entry (FR-42 / AC-05.5): flips the quit marker — close
 * verdicts become 'close' from here on — and runs the ONE shared lifecycle
 * teardown (stop core → restore proxy → requestQuit), shared between the
 * tray Quit item and `before-quit`. Safe to call repeatedly (the policy is
 * idempotent: repeated calls await the SAME teardown, M1-22/AC-05.5).
 */
function beginQuit(): void {
  quitting = true;
  void windowLifecycle.handleBeforeQuit().catch(() => {
    // Fail closed (AC-05.5): every step is attempted and `requestQuit` is
    // LAST inside the policy — the rethrown first failure belongs to the
    // caller to surface, never to a hung or half-finished exit.
  });
}

// FR-19 / FR-42 (US-05 AC-05.5, data-flows §5): gate the exit — the FIRST
// before-quit is cancelled SYNCHRONOUSLY (before any await) so the async
// teardown can settle first; a before-quit arriving AFTER the teardown
// reached `requestQuit` is NOT gated again, or Electron would cancel its own
// re-fired event forever and FR-42's full app exit would never happen.
app.on('before-quit', (event) => {
  if (teardownSettled) {
    return;
  }
  event.preventDefault();
  beginQuit();
});

// ————————————————————————————————————————————————————————————————
// §4.2 invoke handlers: one `ipcMain.handle` per R→M channel (FR-61/FR-62).
// Feature logic lands with later M1 tasks; until then each handler returns
// the documented §4.2 payload shape — placeholder results where the feature
// does not exist yet, otherwise an NFR-5 `AppError` triple taken verbatim
// from docs/analysis/errors.md (no stacks, no secrets — FR-48/NFR-2).
// Sender validation (issue #1 / M1-10 S3-1): every callback calls the shared
// `assertTrustedSender(event)` FIRST — before any logic, dialog, or store
// access (src/main/ipc-guard.ts).
// ————————————————————————————————————————————————————————————————

ipcMain.handle(IPC_PING, (event: IpcMainInvokeEvent): PingResult => {
  assertTrustedSender(event);
  return { ok: true, app: APP_NAME, socksPort: DEFAULT_SOCKS_PORT };
});

// M1-12 (data-flows (a)): the picker is owned by `main` — the renderer never
// reads files (FR-01). Picker cancel is not an error (FR-01); the size gate
// lives inside the validator, so the raw text is handed over untouched (no
// double gate). M1-13 (FR-08, data-flows (a) step 6): after validation and
// before any write, an already-stored profile is confirmed — decline is a
// NON-error outcome, never an NFR-5 failure (FR-01 cancelled precedent).
ipcMain.handle(
  'profile:import-dialog',
  async (event: IpcMainInvokeEvent): Promise<ProfileImportResult> => {
    assertTrustedSender(event);
    let picked: OpenDialogReturnValue;
    try {
      picked = await dialog.showOpenDialog({
        title: 'Import profile',
        properties: ['openFile'],
        filters: [{ name: 'JSON profile', extensions: ['json'] }],
      });
    } catch {
      // errors.md §2 defensive entry — the dialog failure never escapes raw (FR-48).
      return { ok: false, error: DIALOG_FAILED };
    }

    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) {
      return { ok: false, reason: 'cancelled' };
    }

    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      // FR-06 / US-01 edge: deleted or unreadable between picker and read.
      return { ok: false, error: FILE_READ_FAILED };
    }

    // Steps 3-4: size/NUL/parse/schema gates answer here, each with exactly
    // one errors.md §1 triple (FR-11) — no raw parser text, no stack.
    const validation = validateClientConfig(raw);
    if (!validation.ok) {
      // Validation (data-flows (a) step 4) precedes the overwrite confirmation
      // (step 6): a known-invalid file never reaches the prompt.
      return { ok: false, error: validation.error };
    }

    // Step 6 (FR-08): the store is consulted BEFORE the write — `loadProfile()`
    // answers "is a profile already stored?" (an unreadable blob degrades to
    // "no profile", errors.md §6 recovery matrix, the rule profile:get applies).
    let stored: string | null;
    try {
      stored = loadProfile();
    } catch {
      stored = null;
    }

    if (stored !== null) {
      // An existing profile would be overwritten → explicit confirmation first
      // (FR-08 / AC-01.7), called with exactly the options object, no window.
      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        title: 'Overwrite stored profile',
        message: 'A profile is already stored on this computer.',
        detail:
          'Importing this file will overwrite the stored profile — the previous one will be replaced.',
        buttons: ['Overwrite', 'Cancel'],
        // Esc / window-close maps to Cancel (index 1): closing the dialog must
        // never overwrite a stored profile (FR-08 explicit confirmation).
        cancelId: 1,
      });
      if (confirmation.response !== 0) {
        // Response 1: refusal is a user CHOICE, not a failure (FR-01
        // cancelled precedent) — the non-error decline arm, no NFR-5 triple,
        // and the store is left untouched.
        return { ok: false, reason: 'declined' };
      }
    }

    // Steps 8-9: the whole document is encrypted at rest (§8.2, A-20);
    // a keychain or write failure surfaces as its documented E-STOR triple.
    try {
      saveProfile(raw);
    } catch (failure) {
      return { ok: false, error: asAppError(failure, PROFILE_SAVE_FAILED) };
    }

    // §8.3 / FR-05: the stored blob's mtime is the import (or re-import)
    // moment — the same signal profile:get reports. An absent stat falls back
    // to "now"; this runs only after a successful save and never raises
    // (FR-01: a completed import always resolves with its summary).
    let importedAt: string;
    try {
      importedAt = (storedProfileModifiedAt() ?? new Date()).toISOString();
    } catch {
      importedAt = new Date().toISOString();
    }

    return {
      ok: true,
      summary: buildProfileSummary(validation.config, importedAt),
    };
  },
);

// M1-12: main decrypts (FR-55) and returns only the §8.3 summary — never the
// config document. An unreadable store or a document that no longer parses
// degrades to "no profile" instead of crashing (data-flows §5, FR-59).
ipcMain.handle('profile:get', (event: IpcMainInvokeEvent): ProfileView => {
  assertTrustedSender(event);
  let raw: string | null;
  try {
    raw = loadProfile();
  } catch {
    return { summary: null };
  }
  if (raw === null) {
    return { summary: null };
  }
  const doc = parseStoredProfile(raw);
  if (doc === null) {
    return { summary: null };
  }
  // The blob's mtime is the import (or re-import) moment of §8.3.
  const modifiedAt = storedProfileModifiedAt() ?? new Date();
  return { summary: buildProfileSummary(doc, modifiedAt.toISOString()) };
});

// M1-12: removal deletes the stored blob itself, not a UI flag (FR-60,
// AC-07.7); a store failure answers its documented triple, never a raw one.
ipcMain.handle('profile:remove', (event: IpcMainInvokeEvent): ProfileRemovalResult => {
  assertTrustedSender(event);
  try {
    deleteStoredProfile();
    return { ok: true };
  } catch (failure) {
    return { ok: false, error: asAppError(failure, PROFILE_SAVE_FAILED) };
  }
});

// M1-17 (FR-13, data-flows (b) step 0): Start delegates to the status
// wiring — the no-profile guard refuses BEFORE any supervisor exists, and a
// start failure comes back verbatim from the M1-15 pre-checks (the M1-07
// inline E-IO-004 placeholder is gone).
ipcMain.handle('core:start', (event: IpcMainInvokeEvent): Promise<OperationResult> => {
  assertTrustedSender(event);
  return coreWiring.handleStart();
});

// M1-17 (§4.2): Stop delegates to the wiring — without a constructed
// supervisor this is the documented idempotent `{ok:true}` no-op.
ipcMain.handle('core:stop', (event: IpcMainInvokeEvent): Promise<OperationResult> => {
  assertTrustedSender(event);
  return coreWiring.handleStop();
});

// M1-17 (FR-25): status:get answers the wiring's LIVE snapshot — the latest
// pushed transition, not a frozen placeholder (data-flows §4.2).
ipcMain.handle('status:get', (event: IpcMainInvokeEvent): StatusSnapshot => {
  assertTrustedSender(event);
  return coreWiring.getStatus();
});

// M1-19 (FR-45): `logs:get` answers with the collector's buffer — redacted
// lines, oldest-first, at most the FR-46 cap (§4.2) — never a literal.
ipcMain.handle('logs:get', (event: IpcMainInvokeEvent): LogsView => {
  assertTrustedSender(event);
  return logCollector.get();
});

// M1-19 (FR-46, AC-06.6 data half): clearing empties the collector buffer;
// the cap still applies to the lines pushed afterwards.
ipcMain.handle('logs:clear', (event: IpcMainInvokeEvent): { ok: true } => {
  assertTrustedSender(event);
  logCollector.clear();
  return { ok: true };
});

// Placeholder until M1-21 (system-proxy module): no automatic control exists
// yet, so report `supported: false` with the E-PLAT-001 manual-setup values
// (127.0.0.1:10808 — errors.md §4, AC-04.5).
ipcMain.handle('proxy:get', (event: IpcMainInvokeEvent): ProxyState => {
  assertTrustedSender(event);
  return {
    supported: false,
    active: false,
    hint: { host: '127.0.0.1', port: DEFAULT_SOCKS_PORT },
  };
});

// Placeholder until M1-21: never touch the system proxy blindly — return the
// documented manual-setup hint instead (errors.md §4, E-PLAT-001). The
// `{ enabled }` payload (§4.2) is honored by the real handler in M1-21.
ipcMain.handle(
  'proxy:set',
  (event: IpcMainInvokeEvent, _request: ProxyToggleRequest): OperationResult => {
    assertTrustedSender(event);
    return {
      ok: false,
      error: {
        code: 'E-PLAT-001',
        title: 'Manual proxy setup required',
        cause: 'Automatic system-proxy control is not supported on this desktop environment.',
        nextStep: `Set it manually: SOCKS proxy 127.0.0.1, port ${DEFAULT_SOCKS_PORT}.`,
      },
    };
  },
);

app.whenReady().then(() => {
  // S3-2 (issue #1 second half): deny every renderer permission request by
  // default — Electron is allow-by-default for several permissions, and no
  // feature needs one yet. An allowlist arrives with the first feature that
  // does. Registered inside the whenReady path: Electron exposes `session`
  // only once the ready event has fired.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // M1-17 (FR-24/FR-41, AC-05.4): the tray exists from launch and mirrors
  // the CURRENT state as text (menu model + tooltip) — every later
  // transition re-syncs it through broadcastStatus above.
  createTray();
  syncTray(coreWiring.getStatus().state);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // M1-23b (PR-03 "Must be changed"; FR-39 / US-05 AC-05.2): while the tray
  // exists the process STAYS ALIVE — the scaffold's quit-on-last-window for
  // non-darwin is the documented conflict with close-to-tray. Fall back to
  // the platform default only when there is no tray to keep running for.
  if (tray !== null) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

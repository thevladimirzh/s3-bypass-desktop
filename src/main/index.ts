import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogReturnValue,
  session,
  shell,
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
import type { AppError } from '../shared/status-machine';
import { assertTrustedSender } from './ipc-guard';
import { validateClientConfig } from './profile-validator';
import {
  deleteStoredProfile,
  loadProfile,
  saveProfile,
  storedProfileModifiedAt,
} from './secret-store';

/** `status:changed` push channel (§4.2, FR-63) — a contract literal, never a free string. */
const STATUS_CHANGED = 'status:changed' satisfies IpcPushChannel;

/**
 * The status main currently owns (FR-25/FR-26): status machine snapshot plus
 * the fixed local SOCKS port. The supervisor (M1-15) and its IPC wiring
 * (M1-17) will reassign this on every transition; until then nothing changes
 * it (hence `const`).
 */
const currentStatus: StatusSnapshot = {
  state: 'stopped',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};

/**
 * FR-63 (data-flows §4.2): pushes a status snapshot main → renderer with
 * `webContents.send` — the renderer never polls for state that main owns.
 * Called once the page is ready and on every future transition (M1-17).
 */
function broadcastStatus(snapshot: StatusSnapshot = currentStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(STATUS_CHANGED, snapshot);
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

  // FR-63: hand the renderer main's current status by push as soon as the
  // page is ready (the renderer may additionally call `status:get` once at
  // startup per data-flows §5).
  win.webContents.on('did-finish-load', () => {
    broadcastStatus();
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
// double gate). Overwrite confirmation (FR-08, step 6) lands with M1-13.
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
      return { ok: false, error: validation.error };
    }

    // Steps 8-9: the whole document is encrypted at rest (§8.2, A-20);
    // a keychain or write failure surfaces as its documented E-STOR triple.
    try {
      saveProfile(raw);
    } catch (failure) {
      return { ok: false, error: asAppError(failure, PROFILE_SAVE_FAILED) };
    }

    return {
      ok: true,
      summary: buildProfileSummary(validation.config, new Date().toISOString()),
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

// Placeholder until the supervisor lands (M1-15): nothing can be spawned
// yet, so Start reports the documented "engine not found" triple (errors.md
// §2; risk R-1 — the pinned binary arrives with M2). No status transition
// happens here; M1-17 owns transitions and their `status:changed` pushes.
ipcMain.handle('core:start', (event: IpcMainInvokeEvent): OperationResult => {
  assertTrustedSender(event);
  return {
    ok: false,
    error: {
      code: 'E-IO-004',
      title: 'Core binary check failed',
      cause: 'The tunnel engine (Xray-core) was not found in the app installation.',
      nextStep: 'Reinstall the app.',
    },
  };
});

// Placeholder until M1-15: there is no supervisor, hence nothing running —
// stopping is already satisfied (idempotent no-op success).
ipcMain.handle('core:stop', (event: IpcMainInvokeEvent): OperationResult => {
  assertTrustedSender(event);
  return { ok: true };
});

ipcMain.handle('status:get', (event: IpcMainInvokeEvent): StatusSnapshot => {
  assertTrustedSender(event);
  return currentStatus;
});

// Placeholder until M1-19 (log collector): the buffer does not exist yet —
// an empty, trivially redacted result beats a fabricated line (FR-45).
ipcMain.handle('logs:get', (event: IpcMainInvokeEvent): LogsView => {
  assertTrustedSender(event);
  return { lines: [] };
});

// Placeholder until M1-19: clearing an empty buffer succeeds (FR-46).
ipcMain.handle('logs:clear', (event: IpcMainInvokeEvent): { ok: true } => {
  assertTrustedSender(event);
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

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

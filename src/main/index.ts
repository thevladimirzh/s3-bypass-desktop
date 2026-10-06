import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, shell } from 'electron';

import { APP_NAME, DEFAULT_SOCKS_PORT, IPC_PING } from '../shared/constants';
import type {
  IpcPushChannel,
  LogsView,
  OperationResult,
  PingResult,
  ProfileImportResult,
  ProfileRemovalResult,
  ProfileView,
  ProxyState,
  ProxyToggleRequest,
  StatusSnapshot,
} from '../shared/ipc';

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
// §4.2 invoke handlers: one `ipcMain.handle` per R→M channel (FR-61/FR-62).
// Feature logic lands with later M1 tasks; until then each handler returns
// the documented §4.2 payload shape — placeholder results where the feature
// does not exist yet, otherwise an NFR-5 `AppError` triple taken verbatim
// from docs/analysis/errors.md (no stacks, no secrets — FR-48/NFR-2).
// Sender validation (`event.senderFrame`) is added with security review
// M1-10; handlers keep their event parameter available for it.
// ————————————————————————————————————————————————————————————————

ipcMain.handle(IPC_PING, (): PingResult => {
  return { ok: true, app: APP_NAME, socksPort: DEFAULT_SOCKS_PORT };
});

// Placeholder until M1-12 (picker + validation): no dialog exists yet, so
// report §4.2's cancel outcome — FR-01 defines cancel as "not an error".
ipcMain.handle('profile:import-dialog', (): ProfileImportResult => {
  return { ok: false, reason: 'cancelled' };
});

// Placeholder until M1-13 (secret store): no profile is stored yet — the
// renderer gets `summary: null`, never a config document (FR-55).
ipcMain.handle('profile:get', (): ProfileView => {
  return { summary: null };
});

// Placeholder until M1-13: nothing is stored, so removal is already
// satisfied — a safe no-op success instead of a fabricated error.
ipcMain.handle('profile:remove', (): ProfileRemovalResult => {
  return { ok: true };
});

// Placeholder until the supervisor lands (M1-15): nothing can be spawned
// yet, so Start reports the documented "engine not found" triple (errors.md
// §2; risk R-1 — the pinned binary arrives with M2). No status transition
// happens here; M1-17 owns transitions and their `status:changed` pushes.
ipcMain.handle('core:start', (): OperationResult => {
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
ipcMain.handle('core:stop', (): OperationResult => {
  return { ok: true };
});

ipcMain.handle('status:get', (): StatusSnapshot => {
  return currentStatus;
});

// Placeholder until M1-19 (log collector): the buffer does not exist yet —
// an empty, trivially redacted result beats a fabricated line (FR-45).
ipcMain.handle('logs:get', (): LogsView => {
  return { lines: [] };
});

// Placeholder until M1-19: clearing an empty buffer succeeds (FR-46).
ipcMain.handle('logs:clear', (): { ok: true } => {
  return { ok: true };
});

// Placeholder until M1-21 (system-proxy module): no automatic control exists
// yet, so report `supported: false` with the E-PLAT-001 manual-setup values
// (127.0.0.1:10808 — errors.md §4, AC-04.5).
ipcMain.handle('proxy:get', (): ProxyState => {
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
  (_event: IpcMainInvokeEvent, _request: ProxyToggleRequest): OperationResult => {
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

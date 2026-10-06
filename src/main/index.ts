import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { APP_NAME, DEFAULT_SOCKS_PORT, IPC_PING } from '../shared/constants';
import type { PingResult } from '../shared/ipc';

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

  // M0-19 / S4-3: never load a dev URL in a packaged app even if the env
  // var was inherited from the environment.
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

ipcMain.handle(IPC_PING, (): PingResult => {
  return { ok: true, app: APP_NAME, socksPort: DEFAULT_SOCKS_PORT };
});

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

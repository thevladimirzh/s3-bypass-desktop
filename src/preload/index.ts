import { contextBridge, ipcRenderer } from 'electron';
import { IPC_PING } from '../shared/constants';
import type { S3BypassApi } from '../shared/ipc';

const api: S3BypassApi = {
  ping: () => ipcRenderer.invoke(IPC_PING),
  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
};

contextBridge.exposeInMainWorld('s3Bypass', api);

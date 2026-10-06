import { contextBridge, ipcRenderer } from 'electron';

import { IPC_PING } from '../shared/constants';
import type { S3BypassApi } from '../shared/ipc';

// Renderer-only access pattern: the renderer may call exactly the methods
// exposed on this object — it never touches ipcRenderer directly. The full
// IPC contract is defined by docs/analysis/data-flows.md (M1 gate).
const api: S3BypassApi = {
  ping: () => ipcRenderer.invoke(IPC_PING),
  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
};

contextBridge.exposeInMainWorld('s3Bypass', api);

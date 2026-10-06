import type { S3BypassApi } from '../../shared/ipc';

/**
 * The bridge as the renderer window sees it. The complete FR-61 surface is
 * declared by `S3BypassApi` and always provided by the real preload, but the
 * window binding is relaxed on purpose: outside Electron `window.s3Bypass`
 * is absent entirely (hence `?`), and test stubs may exercise only the M0
 * baseline (`ping` + `versions`) without being forced to fabricate the full
 * §4.2 surface (hence `Partial` + `Pick`).
 */
type WindowBridge = Partial<S3BypassApi> & Pick<S3BypassApi, 'ping' | 'versions'>;

declare global {
  interface Window {
    s3Bypass?: WindowBridge;
  }
}

export {};

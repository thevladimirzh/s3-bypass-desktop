import type { S3BypassApi } from '../../shared/ipc';

declare global {
  interface Window {
    s3Bypass?: S3BypassApi;
  }
}

export {};

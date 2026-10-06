export interface PingResult {
  ok: boolean;
  app: string;
  socksPort: number;
}

export interface AppVersions {
  electron: string;
  chrome: string;
  node: string;
}

export interface S3BypassApi {
  ping(): Promise<PingResult>;
  versions: AppVersions;
}

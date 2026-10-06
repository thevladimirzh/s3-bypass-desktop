import { describe, expect, it } from 'vitest';

import { APP_NAME, DEFAULT_SOCKS_PORT, IPC_PING } from '../../src/shared/constants';

describe('shared constants', () => {
  it('keeps the app name used for the window title', () => {
    expect(APP_NAME).toBe('S3 Bypass Desktop');
  });

  it('defaults the local SOCKS inbound to port 10808', () => {
    expect(DEFAULT_SOCKS_PORT).toBe(10808);
  });

  it('namespaces the ping IPC channel under app:', () => {
    expect(IPC_PING).toBe('app:ping');
  });
});

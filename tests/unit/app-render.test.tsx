// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import App from '../../src/renderer/src/App';

afterEach(cleanup);

describe('App', () => {
  it('renders the product title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'S3 Bypass Desktop' })).toBeTruthy();
  });

  it('shows the disconnected state when the preload API is absent', () => {
    delete window.s3Bypass;
    render(<App />);
    expect(screen.getByText(/not connected/i)).toBeTruthy();
  });

  it('shows the ready state with the default port after ping resolves', async () => {
    window.s3Bypass = {
      ping: async () => ({ ok: true, app: 'S3 Bypass Desktop', socksPort: 10808 }),
      versions: { electron: '0', chrome: '0', node: '0' },
    };
    render(<App />);
    expect(await screen.findByText(/ready/i)).toBeTruthy();
    expect(screen.getByText(/10808/)).toBeTruthy();
  });
});

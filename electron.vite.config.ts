import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * Dev-only CSP relaxation (M0-19 / S3-3): the Vite dev server injects an
 * inline React-refresh preamble and uses a WebSocket for HMR, both of which
 * the strict production CSP (src/renderer/index.html) blocks. Applied only
 * when a dev server is attached — the built artifact keeps the strict policy.
 */
const devCspRelaxation: Plugin = {
  name: 'dev-csp-relaxation',
  transformIndexHtml(html, ctx) {
    if (!ctx?.server) return html;
    return html
      .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
      .replace("connect-src 'self';", "connect-src 'self' ws://localhost:* http://localhost:*;")
      .replace("img-src 'self' data:;", "img-src 'self' data:; worker-src 'self' blob:;");
  },
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), devCspRelaxation],
  },
});

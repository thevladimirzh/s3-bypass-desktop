// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

/**
 * M3-05 (RED) — the surface audit of `docs/plans/m3-polish.md` Phase B,
 * test plan TC-POL-03 (docs/qa/m3-test-plan.md §3).
 *
 * Findings pinned here:
 *  - AC-04.5: the renderer ignored `ProxyState.supported`/`hint` entirely —
 *    an unsupported desktop saw a broken toggle and NO honest hint;
 *  - the footer still carried the M0 scaffold note ("M0 scaffold — tunnel
 *    features land in M1.") long after M1..M2 shipped;
 *  - the "not connected" IPC line printed the dev-only "(run inside
 *    Electron)" parenthetical even when the bridge EXISTS (a packaged app
 *    whose ping failed would show dev text — the parenthetical belongs to
 *    the plain-browser/dev context only);
 *  - the renderer's status-label map and the tray's `statusText` map are
 *    duplicated literals that can drift (AC-03.1/FR-41: one text badge,
 *    never color-only — both surfaces must say the same words).
 */
describe('App — M3-05 surface audit pins (TC-POL-03)', () => {
  const MANUAL_HINT_TEXT =
    'Not supported on this desktop — set it manually: SOCKS proxy 127.0.0.1, port 10808.';

  function pingBridge(): {
    ping: () => Promise<{ ok: boolean; app: string; socksPort: number }>;
    versions: { electron: string; chrome: string; node: string };
  } {
    return {
      ping: async () => ({ ok: true, app: 'S3 Bypass Desktop', socksPort: 10808 }),
      versions: { electron: '0', chrome: '0', node: '0' },
    };
  }

  it('app.footer.shippedProductCopyNotM0ScaffoldNote (TC-POL-03)', () => {
    delete window.s3Bypass;
    render(<App />);
    const footer = document.querySelector('footer');
    expect(footer, 'the App renders a footer').toBeTruthy();
    expect(
      footer?.textContent,
      'M3-05 (audit): the footer must carry shipped copy — the M0 scaffold note ' +
        'describes a milestone that closed before M1 (BRIEF §9 productName)',
    ).toBe('S3 Bypass Desktop');
    expect(footer?.textContent).not.toMatch(/M0 scaffold/);
  });

  it('app.proxy.unsupportedDesktopRendersExactManualHint (AC-04.5, TC-POL-03)', async () => {
    let proxyRead = false;
    window.s3Bypass = {
      ...pingBridge(),
      getProxy: async () => {
        proxyRead = true;
        return {
          supported: false,
          active: false,
          hint: { host: '127.0.0.1' as const, port: 10808 },
        };
      },
    };
    render(<App />);
    await waitFor(() => expect(proxyRead, 'proxy:get must be read at mount').toBe(true));
    expect(
      await screen.findByText(MANUAL_HINT_TEXT),
      'AC-04.5 (audit B-11): an unsupported desktop MUST see the exact data-flows §3.3 ' +
        'manual-proxy hint — the renderer used to ignore supported/hint entirely',
    ).toBeTruthy();
  });

  it('app.proxy.supportedDesktopShowsNoManualHint (AC-04.5, TC-POL-03)', async () => {
    let proxyRead = false;
    window.s3Bypass = {
      ...pingBridge(),
      getProxy: async () => {
        proxyRead = true;
        return { supported: true, active: false };
      },
    };
    render(<App />);
    await waitFor(() => expect(proxyRead, 'proxy:get must be read at mount').toBe(true));
    expect(
      screen.queryByText(/Not supported on this desktop/),
      'AC-04.5: the manual hint is an UNSUPPORTED-desktop answer — never shown when ' +
        'automatic control exists (no per-start spam, data-flows §3.3)',
    ).toBeNull();
  });

  it('app.statusIpcLine.noBridgeKeepsDevParenthetical (TC-POL-03)', () => {
    // The plain-browser/dev context — the parenthetical is honest HERE
    // (a preload bridge cannot be absent inside packaged Electron).
    delete window.s3Bypass;
    render(<App />);
    expect(screen.getByText(/run inside Electron/)).toBeTruthy();
  });

  it('app.statusIpcLine.bridgePresentShowsNoDevText (TC-POL-03)', async () => {
    window.s3Bypass = {
      ...pingBridge(),
      ping: async () => {
        throw new Error('bridge alive but main did not answer');
      },
    };
    render(<App />);
    expect(await screen.findByText(/not connected/i)).toBeTruthy();
    expect(
      screen.queryByText(/run inside Electron/),
      'M3-05 (audit): with a bridge present the parenthetical is DEV text — a packaged ' +
        'user whose ping failed must not see "run inside Electron"',
    ).toBeNull();
  });

  it('app.statusLabels.rendererAndTrayMapsIdentical (AC-03.1, FR-41, TC-POL-03)', async () => {
    // Duplicated literals (renderer badge vs tray menu) — ABSENCE RED until
    // M3-06 exports both maps for this comparison (strategy §5.1): the gate
    // below names the missing export instead of a raw TypeError.
    const rendererModule = (await import('../../src/renderer/src/App')) as unknown as Record<
      string,
      unknown
    >;
    if (typeof rendererModule.STATUS_LABELS !== 'object' || rendererModule.STATUS_LABELS === null) {
      throw new Error(
        'src/renderer/src/App.tsx must export STATUS_LABELS — M3-06 GREEN pins the ' +
          'renderer badge and the tray statusText to ONE source (TC-POL-03 absence RED)',
      );
    }
    const trayModule = (await import(
      /* @vite-ignore */ ['..', '..', 'src', 'main', 'window-lifecycle'].join('/')
    )) as unknown as Record<string, unknown>;
    if (typeof trayModule.STATUS_TEXT !== 'object' || trayModule.STATUS_TEXT === null) {
      throw new Error(
        'src/main/window-lifecycle.ts must export STATUS_TEXT — M3-06 GREEN (TC-POL-03)',
      );
    }
    expect(
      rendererModule.STATUS_LABELS,
      'AC-03.1/FR-41: the text badge and the tray menu must say the SAME words for ' +
        'every state — duplicated maps drift (audit)',
    ).toEqual(trayModule.STATUS_TEXT);
  });
});

// @vitest-environment jsdom
/**
 * M1-27b (RED) — renderer half of acceptance remediation B-01 (M1-27 D-01,
 * GitHub issue #14): the US-04 "Use system proxy" checkbox must DRIVE the
 * `setProxy` bridge member and mirror the CONFIRMED state `proxy:get`
 * reports — today it is a local React boolean nobody ever syncs (decorative
 * toggle, acceptance-m1-27.md §2.4 D-01).
 *
 * Test plan ID: TC-04-18 (§4 US-04) — docs/qa/m1-test-plan.md, allocated in
 * §14 DV-35. Main half: tests/unit/proxy-wiring.test.ts (TC-04-16/17/19).
 *
 * Spec sources: docs/product/stories/US-04-system-proxy.md as amended
 * 2026-10-08 — AC-04.1 (auto-on-start with the toggle as the override — so
 * the mirror must reflect what MAIN applied, not what the user clicked),
 * AC-04.4 (disabled + exact hint while the core is not running; the
 * disabled-state pin itself stays with the GREEN TC-04-04, no re-pin of its
 * wording assertions), AC-04.6 (a failed apply attempt shows a plain-language
 * error and the toggle stays/returns Off — never optimistic), AC-04.7 (after
 * a stop the restored state reads back Off); docs/qa/acceptance-m1-27.md §8
 * (owner decisions Q1/Q2); docs/analysis/requirements.md FR-13 (enabled
 * control drives the bridge), FR-48 (failures render nothing raw), NFR-5
 * (the triple crosses untouched).
 *
 * Layer: L1 — jsdom component journey over a stubbed bridge (precedent
 * status-exposure.test.tsx; fixture rule §1: synthetic profiles/states only).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR TC-04-18 (header-contract style, DV-35(5); any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 * 1) MOUNT reads `proxy:get` once — the checkbox initial position is the
 *    MIRRORED main-side state, never a guessed default (absence RED: App
 *    never calls getProxy today);
 * 2) a status PUSH alone never flips the mirror (state ≠ proxy state);
 * 3) clicking the enabled toggle calls `setProxy({enabled:true})` through
 *    the BRIDGE — on `{ok:false, error}` the box stays Off AND the NFR-5
 *    triple renders in the existing `role="alert"` area (AC-04.6 —
 *    confirmed-state only, never optimistic);
 * 4) on `{ok:true}` the box flips to the confirmed applied state;
 * 5) after a successful Stop (main restored the host — AC-04.7) the
 *    renderer RE-READS `proxy:get` and mirrors Off (call count ≥ 2 —
 *    mount + post-action re-read).
 *
 * RED status: ASSERTION/absence RED — case fails at the first wait (mount
 * `getProxy` never called on the baseline), never a mock-setup error: the
 * stub bridge fully supports today's App. Strategy §5.2 — do not weaken,
 * skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/renderer/src/App';
import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import type {
  AppError,
  OperationResult,
  ProfileSummary,
  ProxyState,
  StatusSnapshot,
} from '../../src/shared/ipc';

afterEach(cleanup);

/** §2.3 snapshots — synthetic, wording mirrors the FR-41 labels (§1). */
const STOPPED: StatusSnapshot = {
  state: 'stopped',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};
const RUNNING: StatusSnapshot = {
  state: 'running',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};

/** Synthetic profile on reserved hosts (§1) — Start's AC-02.3 guard needs one. */
const PROFILE: ProfileSummary = {
  displayName: 'vlt-toggle @ s3.example.com',
  endpointHost: 's3.example.com',
  bucket: 'example-bucket',
  prefix: 'tunnels',
  region: 'eu-central-1',
  importedAt: '2026-01-01T00:00:00.000Z',
  socksPort: DEFAULT_SOCKS_PORT,
};

/** errors.md §4 E-PLAT-002 — a canned refusal the toggle must render verbatim. */
const E_PLAT_002: AppError = {
  code: 'E-PLAT-002',
  title: 'System proxy change failed',
  cause: 'The operating system command (networksetup) failed.',
  nextStep:
    'The toggle was returned to Off; set the proxy manually (SOCKS host 127.0.0.1, port 10808), or retry.',
};

/** FR-30 / AC-04.4 exact hint wording — verbatim, never reworded. */
const HINT_PROXY_NOT_RUNNING = 'Start the tunnel first';

interface ToggleRig {
  readonly getProxy: ReturnType<typeof vi.fn>;
  readonly setProxy: ReturnType<typeof vi.fn>;
  readonly startCore: ReturnType<typeof vi.fn>;
  readonly stopCore: ReturnType<typeof vi.fn>;
  /** Simulates main's `webContents.send('status:changed', snapshot)` (FR-63). */
  readonly push: (snapshot: StatusSnapshot) => void;
  /** Next `setProxy` answer — the failure arm sets `{ok:false, error}`. */
  setProxyResult(result: { readonly ok: boolean; readonly error?: AppError }): void;
  /** Emulates what MAIN did to the host state (auto-apply / restore). */
  setProxyActive(active: boolean): void;
}

/**
 * The §4.2 bridge stub: every member App may touch, with the knobs the case
 * needs. `startCore`/`stopCore` faithfully emulate the amended ACs — a
 * successful start means main AUTO-APPLIED the proxy, a successful stop
 * means main RESTORED it — each also pushing the §2.3 transition (FR-63),
 * exactly like the real index.ts journey.
 */
function installBridge(): ToggleRig {
  const listeners: Array<(snapshot: StatusSnapshot) => void> = [];
  const proxyState: { current: ProxyState } = {
    current: {
      supported: true,
      active: false,
      hint: { host: '127.0.0.1', port: DEFAULT_SOCKS_PORT },
    },
  };
  let setResult: { readonly ok: boolean; readonly error?: AppError } = { ok: true };

  const push = (snapshot: StatusSnapshot): void => {
    act(() => {
      for (const listener of [...listeners]) listener(snapshot);
    });
  };

  const getStatus = vi.fn(async (): Promise<StatusSnapshot> => STOPPED);
  const getProxy = vi.fn(async (): Promise<ProxyState> => proxyState.current);
  const setProxy = vi.fn(
    async (request: { readonly enabled: boolean }): Promise<OperationResult> => {
      void request;
      if (setResult.ok) {
        proxyState.current = { ...proxyState.current, active: true };
        return { ok: true };
      }
      return { ok: false, error: setResult.error ?? E_PLAT_002 };
    },
  );
  const startCore = vi.fn(async (): Promise<OperationResult> => {
    proxyState.current = { ...proxyState.current, active: true }; // AC-04.1 auto-on-start
    push(RUNNING);
    return { ok: true };
  });
  const stopCore = vi.fn(async (): Promise<OperationResult> => {
    proxyState.current = { ...proxyState.current, active: false }; // AC-04.7 restore
    push(STOPPED);
    return { ok: true };
  });

  window.s3Bypass = {
    ping: async () => ({ ok: true, app: 'S3 Bypass Desktop', socksPort: DEFAULT_SOCKS_PORT }),
    versions: { electron: '0', chrome: '0', node: '0' },
    getStatus,
    getProfile: async () => ({ summary: PROFILE }),
    startCore,
    stopCore,
    getProxy,
    setProxy,
    onStatusChanged: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
  };

  return {
    getProxy,
    setProxy,
    startCore,
    stopCore,
    push,
    setProxyResult: (result) => {
      setResult = result;
    },
    setProxyActive: (active) => {
      proxyState.current = { ...proxyState.current, active };
    },
  };
}

/** The checkbox — App renders exactly one (US-04 "One toggle"). */
function toggleBox(): HTMLInputElement {
  const [box] = screen.queryAllByRole<HTMLInputElement>('checkbox');
  if (box === undefined) {
    throw new Error(
      'TC-04-18 contract missing: no checkbox rendered — US-04 "One toggle" (absence RED)',
    );
  }
  return box;
}

describe('proxy toggle — bridge-driven confirmed-state mirror (TC-04-18, M1-27b)', () => {
  it('renderer.proxyToggle.confirmedStateMirrorViaIpc', async () => {
    const rig = installBridge();
    render(<App />);

    // (1) MOUNT reads the real applied state (RED trigger — never called today).
    await waitFor(() => {
      expect(
        rig.getProxy,
        'TC-04-18 (M1-27 D-01, issue #14): mount must read proxy:get to mirror the ' +
          'REAL main-side state — today the checkbox is a local boolean nobody ' +
          'syncs (absence RED, strategy §5.1)',
      ).toHaveBeenCalled();
    });
    const box = toggleBox();
    expect(box.checked, 'initial active:false → unchecked (mirrored, never guessed)').toBe(false);

    // (2) AC-04.4 control (TC-04-04's observed-GREEN twin): stopped → disabled + hint.
    expect(box.disabled, 'stopped → the toggle is disabled (AC-04.4)').toBe(true);
    expect(
      screen.getByText(HINT_PROXY_NOT_RUNNING).textContent?.trim(),
      'FR-30/AC-04.4: the exact guard hint is visible while the core is not running',
    ).toBe(HINT_PROXY_NOT_RUNNING);

    // (3) a pushed `running` enables the toggle — and never flips the mirror by itself.
    rig.push(RUNNING);
    await waitFor(() => {
      expect(box.disabled, 'running → the toggle is enabled (AC-04.4)').toBe(false);
    });
    expect(
      box.checked,
      'a status push alone never changes the proxy mirror — state ≠ proxy state',
    ).toBe(false);

    // (4) FAILED apply attempt → bridge call + error triple + box stays Off (AC-04.6).
    rig.setProxyResult({ ok: false, error: E_PLAT_002 });
    fireEvent.click(box);
    await waitFor(() => {
      expect(
        rig.setProxy,
        'D-01: the click must drive the BRIDGE setProxy({enabled:true}) — today it ' +
          'only flips local React state (decorative toggle, issue #14)',
      ).toHaveBeenCalledWith({ enabled: true });
    });
    await waitFor(() => {
      expect(
        screen.getByRole('alert').textContent ?? '',
        'AC-04.6 amended: a plain-language error is shown — the NFR-5 triple crosses ' +
          'the IPC untouched into the existing role="alert" area (FR-48: nothing raw)',
      ).toContain(E_PLAT_002.title);
    });
    expect(
      box.checked,
      'never optimistic: a FAILED apply keeps/returns the toggle to Off (AC-04.6)',
    ).toBe(false);

    // (5) SUCCESS → the box flips to the CONFIRMED applied state.
    rig.setProxyResult({ ok: true });
    fireEvent.click(box);
    await waitFor(() => {
      expect(box.checked, 'on {ok:true} the toggle reflects the CONFIRMED applied state').toBe(
        true,
      );
    });

    // (6) STOP → main restored (AC-04.7) → the re-read mirrors Off.
    const readsBeforeStop = rig.getProxy.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => {
      expect(
        rig.stopCore,
        'the Stop control drives the bridge (FR-13, GREEN today)',
      ).toHaveBeenCalled();
      expect(
        rig.getProxy.mock.calls.length,
        'after a successful stop the renderer RE-READS proxy:get — main restored the ' +
          'host state, the mirror must follow (DV-35(5), AC-04.7 visibility)',
      ).toBeGreaterThan(readsBeforeStop);
    });
    await waitFor(() => {
      expect(box.checked, 'restored host → the mirror reports Off (never a stale On)').toBe(false);
    });
    expect(
      rig.startCore,
      'control: the journey never started the core through Start (isolated stop arm)',
    ).not.toHaveBeenCalled();
  });
});

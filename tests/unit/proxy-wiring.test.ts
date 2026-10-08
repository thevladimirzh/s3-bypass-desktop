/**
 * M1-27b (RED) — acceptance remediation B-01 (M1-27 NO-GO blocker, GitHub
 * issue #14): the `proxy:get`/`proxy:set` placeholders in src/main/index.ts
 * must become the REAL handlers (M1-27 D-01), auto-applied on BOTH start
 * routes per the owner decision recorded in docs/qa/acceptance-m1-27.md §8
 * (Q1 = AUTO-ON-START, Q2 = SOCKS-only), with S4-4 payload validation
 * (GitHub issue #5) and the D-03/S5-10 `desktopEnv` wiring.
 *
 * Test plan IDs: TC-04-16, TC-04-17, TC-04-19 (§4 US-04) —
 * docs/qa/m1-test-plan.md, allocated in §14 DV-35. The renderer half
 * (TC-04-18) lives in tests/unit/proxy-toggle.test.tsx; the launch-hidden
 * native half (TC-05-23, blocker B-02 / issue #15) lives in
 * tests/unit/index-native-wiring.test.ts.
 *
 * Spec sources: docs/product/stories/US-04-system-proxy.md as amended
 * 2026-10-08 (AC-04.1 auto-on-start + toggle override, AC-04.2 desktopEnv,
 * AC-04.3 byte-for-byte restore, AC-04.6 apply-failure honesty, AC-04.7
 * stop/quit revert); docs/qa/acceptance-m1-27.md §2.4 (D-01/D-03 findings)
 * + §8 (owner decisions Q1/Q2/Q9); docs/qa/security-m1-10.md S4-4 (runtime
 * payload validation, deadline M1-21, tracked in issue #5); docs/qa/
 * security-m1-26b.md S5-10 (pass `$XDG_CURRENT_DESKTOP` into the context,
 * tracked in issue #16); docs/analysis/requirements.md FR-31 (set on
 * enable, restore prior on disable), FR-33 (unsupported → E-PLAT-001 hint,
 * no partial apply), FR-35 (restore on stop/quit, fail closed);
 * data-flows.md §3 (context = platform + desktopEnv + run — PR-01/PR-02/
 * PR-08), §4.2 (`proxy:get` / `proxy:set` rows — payload SHAPES stay pinned
 * by the ipc-contract suite, untouched here), §5 (quit restore).
 *
 * Layer: L1 — the house mocked-electron journey (precedent
 * quit-force-stop.test.ts) driving the REAL src/main/index.ts over the REAL
 * core-wiring with an injected fake supervisor (spawn-free, §1); the REAL
 * system-proxy `isSupportedPlatform` decides which canned apply branch runs,
 * so both CI platforms stay self-consistent; the `setSystemProxy`/
 * `restoreSystemProxy` spies never reach the OS (§1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-27b (header-contract style, DV-35; any deviation requires
 * an upstream spec note first — strategy §5.2, never a silent test edit):
 *
 * A) TC-04-16 — the real handlers:
 *    - `proxy:get` answers `{supported, active, hint}` with `supported`
 *      derived from the REAL `isSupportedPlatform(process.platform,
 *      $XDG_CURRENT_DESKTOP)` (today: hardcoded `false`) and `hint` the exact
 *      §4.2 loopback values `{host:'127.0.0.1', port:10808}`;
 *    - `proxy:set` validates the payload AFTER `assertTrustedSender` and
 *      BEFORE any module call — a non-boolean `enabled` REJECTS with
 *      `name === 'InvalidPayloadError'` (S4-4's house guard precedent:
 *      `UntrustedSenderError` — errors.md §0 documents no class for guards,
 *      so NO new E-* code, DV-19); Electron turns the throw into an invoke
 *      rejection and the renderer renders nothing raw (FR-48);
 *    - `{enabled:true}` drives `setSystemProxy(context)` exactly ONCE and
 *      passes the module result through (`{ok:true}` → `proxy:get` then
 *      reports `active:true`; a refusal → the module's own E-PLAT-001
 *      triple verbatim — AC-04.5);
 *    - `{enabled:false}` drives `restoreSystemProxy(context, SNAPSHOT)` with
 *      the IDENTITY of the snapshot the earlier apply returned (AC-04.3's
 *      byte-for-byte restore needs the stored value — DV-35(4)), then
 *      `proxy:get` reports `active:false`.
 *
 * B) TC-04-17 — auto-on-start + stop-restore on BOTH routes (amended
 *    AC-04.1/04.6/04.7):
 *    - structural: index.ts owns a `setSystemProxy(` call site (today it has
 *      ZERO — absence RED on every platform);
 *    - a FAILED `core:start` never touches the proxy ("Given the core is
 *      running");
 *    - a successful `core:start` auto-applies ONCE when the platform rule
 *      says supported, and does NOT call the module when it says unsupported
 *      (no dialog spam — AC-04.5's manual hint is the answer there);
 *    - a FAILED auto-apply still returns the start result `{ok:true}` (the
 *      core KEEPS RUNNING — AC-04.6) and surfaces the error through
 *      `dialog.showMessageBox` (pinned as CALLED, wording unpinned — A-14);
 *    - `core:stop` after an apply restores with the stored snapshot identity
 *      and `proxy:get` reports inactive (AC-04.7);
 *    - the tray `Start tunnel` / `Stop tunnel` clicks reach the very same
 *      apply/restore (data-flows §4.2 "Not IPC" route — AC-04.1/04.7 must
 *      hold regardless of the entry point).
 *
 * C) TC-04-19 — the context handed to `setSystemProxy` carries an OWN
 *    property `desktopEnv` equal to `$XDG_CURRENT_DESKTOP` (D-03/S5-10:
 *    without it `isSupportedPlatform('linux', undefined)` can never answer
 *    supported), plus the structural `XDG_CURRENT_DESKTOP` read in index.ts.
 *
 * Out of scope (tracked, never silently dropped): nothing from FR-35's
 * three restore arms anymore — the CRASH arm of FR-35 / errors.md §6
 * ("proxy reverted on E-CORE-*") was built by M2-11 (issue #19) on the
 * broadcast transition seam: `onStateChange` from this harness IS the
 * production exit path, and TC-04-21/22 pin revert + warning behaviorally.
 * The QUIT arm stays pinned by TC-04-15 (M1-23a — its `restoreProxy` dep
 * reads the same snapshot variable, straight to the restore hook) and is
 * now behaviorally pinned too by TC-04-20 (pre-exit E-PLAT-003 surfacing).
 *
 * RED status: ASSERTION/absence RED — the first expectation of every case
 * fails on the baseline (placeholder handlers, zero `setSystemProxy(` call
 * sites, no `desktopEnv` read), never a mock-setup error: the harness fully
 * supports today's index.ts. Strategy §5.2 — do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupervisorOptions } from '../../src/main/core-supervisor';
import type {
  SetSystemProxyResult,
  SystemProxyContext,
  SystemProxySnapshot,
} from '../../src/main/system-proxy';
import {
  isSupportedPlatform,
  restoreSystemProxy,
  setSystemProxy,
} from '../../src/main/system-proxy';
import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import type { OperationResult, ProxyState } from '../../src/shared/ipc';
import type { StatusSnapshot } from '../../src/shared/status-machine';
import { waitFor } from '../helpers/core-supervisor-stub';
import { stripComments } from '../helpers/log-collector-stub';

// ————————————————————————————————————————————————————————————————
// Mocked-electron harness for the index.ts journey (precedent:
// quit-force-stop.test.ts / index-native-wiring.test.ts).
// ————————————————————————————————————————————————————————————————

interface RecordedRegistration {
  readonly channel: string;
  readonly handler: (...args: unknown[]) => unknown;
}

/** One `Menu.buildFromTemplate` entry — syncTray maps items to this shape. */
interface TrayTemplateItem {
  readonly label: string;
  readonly enabled: boolean;
  readonly click: () => void;
}

const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    appEvents: [] as Array<{
      readonly event: string;
      readonly handler: (...args: unknown[]) => void;
    }>,
    windows: [] as unknown[],
    registrations: [] as RecordedRegistration[],
    templates: [] as unknown[],
    dialogCalls: [] as unknown[],
    /** TC-04-17: when true the injected supervisor refuses `start()`. */
    startFails: false,
    /** TC-04-17(3): when 'fail' the canned apply answers E-PLAT-002. */
    applyMode: 'ok' as 'ok' | 'fail',
    /** The canned snapshot the apply returns — identity-pinned by restore. */
    snapshotResult: null as SystemProxySnapshot | null,
    /** M2-11 (TC-04-20): order track — 'messageBox' before 'quit' pins the pre-exit dialog. */
    events: [] as string[],
    /** M2-11 (TC-04-21/22): options index.ts passed to the fake supervisor — the crash seam (`onStateChange`). */
    supervisorOptions: null as SupervisorOptions | null,
  };
});

vi.mock('electron', () => {
  class FakeWebContents {
    setWindowOpenHandler(): void {
      // test no-op: window-open policy is out of scope for this suite
    }

    on(): void {
      // test no-op: navigation events are out of scope for this suite
    }

    send(): void {
      // test no-op: status/log pushes are pinned by other suites
    }
  }

  class FakeBrowserWindow {
    readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    readonly events: string[] = [];
    readonly webContents = new FakeWebContents();

    constructor(_options?: unknown) {
      probe.windows.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      const listeners = this.handlers.get(event) ?? [];
      listeners.push(handler);
      this.handlers.set(event, listeners);
    }

    addListener(event: string, handler: (...args: unknown[]) => void): void {
      this.on(event, handler);
    }

    loadURL(): void {
      // test no-op: navigation is out of scope for this suite
    }

    loadFile(): void {
      // test no-op: navigation is out of scope for this suite
    }

    hide(): void {
      this.events.push('hide');
    }

    show(): void {
      this.events.push('show');
    }

    focus(): void {
      // test no-op: tray "Show window" focus is not asserted here
    }

    restore(): void {
      // test no-op: un-minimize is not asserted here
    }

    isMinimized(): boolean {
      return false;
    }

    static getAllWindows(): FakeBrowserWindow[] {
      return probe.windows as unknown as FakeBrowserWindow[];
    }
  }

  class FakeTray {
    constructor(_image?: unknown) {
      // test no-op: tray creation is pinned by other suites
    }

    setToolTip(): void {
      // test no-op: tooltip text is pinned by window-lifecycle.test.ts
    }

    setContextMenu(): void {
      // test no-op: the menu MODEL is pinned by window-lifecycle.test.ts
    }
  }

  const recordAppEvent = (event: string, handler: (...args: unknown[]) => void): void => {
    probe.appEvents.push({ event, handler });
  };

  return {
    app: {
      isPackaged: false,
      whenReady: () => Promise.resolve(),
      on: recordAppEvent,
      addListener: recordAppEvent,
      quit: () => {
        probe.events.push('quit'); // M2-11: the exit request itself
      },
      getPath: () => '/nonexistent-userdata-for-tests',
    },
    BrowserWindow: FakeBrowserWindow,
    Tray: FakeTray,
    nativeImage: { createFromDataURL: (_data: string): unknown => ({}) },
    Menu: {
      buildFromTemplate: (template: unknown): { template: unknown } => {
        probe.templates.push(template);
        return { template };
      },
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
      showMessageBox: vi.fn(async (...args: unknown[]) => {
        probe.dialogCalls.push(args);
        probe.events.push('messageBox'); // M2-11: order track vs 'quit'
        return { response: 0, checkboxChecked: false };
      }),
    },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown): void => {
        probe.registrations.push({ channel, handler });
      },
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (_handler: unknown) => undefined,
      },
    },
    shell: { openExternal: (_url: unknown) => undefined },
  };
});

/** The store answers a stored profile so `core:start` reaches the factory. */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => '{"outbounds":[{"protocol":"fedarisha","settings":{}}]}'),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/**
 * System proxy never touches the OS from tests (§1 — canned results only).
 * `isSupportedPlatform` stays REAL through the importOriginal spread: it is
 * the pure platform rule BOTH the handler and this canned branch mirror
 * (DV-35(2) — module internals stay pinned by system-proxy.test.ts).
 */
vi.mock('../../src/main/system-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/system-proxy')>();
  return {
    ...actual,
    setSystemProxy: vi.fn(async (context: SystemProxyContext): Promise<SetSystemProxyResult> => {
      const support = actual.isSupportedPlatform(context.platform, context.desktopEnv);
      if (!support.supported) {
        return {
          ok: false,
          error: {
            code: 'E-PLAT-001',
            title: 'Manual proxy setup required',
            cause: 'Automatic system-proxy control is not supported on this desktop environment.',
            nextStep: 'Set it manually: SOCKS proxy 127.0.0.1, port 10808.',
          },
        };
      }
      if (probe.applyMode === 'fail') {
        return {
          ok: false,
          error: {
            code: 'E-PLAT-002',
            title: 'System proxy change failed',
            cause: 'The operating system command (networksetup) failed.',
            nextStep:
              'The toggle was returned to Off; set the proxy manually per E-PLAT-001 values, or retry.',
          },
        };
      }
      return { ok: true, snapshot: probe.snapshotResult ?? SNAPSHOT };
    }),
    restoreSystemProxy: vi.fn(async (): Promise<OperationResult> => ({ ok: true })),
  };
});

/**
 * The supervisor factory is the start/stop seam: `start()` answers ok or a
 * synthetic refusal per `probe.startFails`; `stop()` always succeeds — the
 * REAL core-wiring state machine around them stays untouched (single child,
 * §2.3 guards).
 */
vi.mock('../../src/main/core-supervisor', () => ({
  createSupervisor: (options: SupervisorOptions) => {
    // M2-11: capture the wiring-provided options — `onStateChange` is the
    // crash seam (in production the supervisor fires it on child death).
    probe.supervisorOptions = options;
    return {
      start: (): Promise<OperationResult> =>
        probe.startFails
          ? Promise.resolve({
              ok: false,
              error: {
                code: 'E-CORE-003',
                title: 'Synthetic start failure',
                cause: 'Injected refusal — the harness startFails flag (fixture).',
                nextStep: 'n/a',
              },
            })
          : Promise.resolve({ ok: true }),
      stop: (): Promise<OperationResult> => Promise.resolve({ ok: true }),
      forceStop: (): Promise<OperationResult> => Promise.resolve({ ok: true }),
      isRunning: (): boolean => true,
    };
  },
}));

const DEV_URL = 'http://localhost:5173/';
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};

/** Synthetic mac-shaped prior state — only its IDENTITY is asserted (DV-35(2)). */
const SNAPSHOT: SystemProxySnapshot = {
  service: 'Wi-Fi',
  socks: { enabled: false, host: '', port: 0 },
  secureWeb: { enabled: false, host: '', port: 0 },
};

/** Lets the `app.whenReady()` path (tray creation) run to completion. */
async function flushAsync(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/**
 * Invoke a registered handler like Electron would (trusted sender, payload
 * after the event). Always a PROMISE: a synchronous guard throw (S4-4) is
 * observed as a rejection — exactly how Electron surfaces it to the
 * renderer's `.catch` (FR-48).
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const registration = probe.registrations.find((entry) => entry.channel === channel);
  if (registration === undefined) {
    throw new Error(`no ipcMain.handle registration captured for ${channel}`);
  }
  return (await Promise.resolve().then(() => registration.handler(TRUSTED_EVENT, ...args))) as T;
}

/**
 * QUIET baseline before each case: core stopped, proxy not applied, spies
 * cleared. Against today's placeholder handlers every step is a harmless
 * no-op — the calls still RESET main's state once GREEN lands, so the cases
 * stay order-independent (snapshot variable lives in index.ts module scope).
 */
async function settleQuietly(): Promise<void> {
  await flushAsync();
  await invoke('core:stop').catch(() => undefined);
  await invoke('proxy:set', { enabled: false }).catch(() => undefined);
  await flushAsync();
  vi.mocked(setSystemProxy).mockClear();
  vi.mocked(restoreSystemProxy).mockClear();
  probe.dialogCalls.length = 0;
  probe.startFails = false;
  probe.applyMode = 'ok';
}

/** The LAST tray template item with `label` (syncTray rebuilds on transition). */
function trayItem(label: string): TrayTemplateItem {
  const template = probe.templates.at(-1);
  if (!Array.isArray(template)) {
    throw new Error('no tray Menu.buildFromTemplate template captured from src/main/index.ts');
  }
  const item = (template as TrayTemplateItem[]).find((entry) => entry.label === label);
  if (item === undefined) {
    throw new Error(`the latest tray template has no "${label}" item`);
  }
  return item;
}

/** The comment-stripped source of src/main/index.ts (TC-06-15 scan style). */
function indexSource(): string {
  const path = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));
  expect(existsSync(path), 'src/main/index.ts must exist').toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

beforeEach(() => {
  probe.startFails = false;
  probe.applyMode = 'ok';
  probe.snapshotResult = SNAPSHOT;
});

// ————————————————————————————————————————————————————————————————
// TC-04-16 — real proxy:get / proxy:set handlers (D-01, issue #14, S4-4)
// ————————————————————————————————————————————————————————————————

describe('proxy IPC — real apply/restore/report + S4-4 guard (TC-04-16, M1-27b)', () => {
  it('proxy.ipc.realHandlersApplyRestoreReportAndValidate', async () => {
    await settleQuietly();
    const supported = isSupportedPlatform(
      process.platform,
      process.env.XDG_CURRENT_DESKTOP,
    ).supported;

    // Report: `supported` mirrors the REAL platform rule (today hardcoded false).
    const initial = await invoke<ProxyState>('proxy:get');
    expect(
      initial.supported,
      'TC-04-16 (M1-27 D-01): proxy:get must answer the REAL isSupportedPlatform(' +
        'process.platform, $XDG_CURRENT_DESKTOP) — the M1-06 placeholder hardcodes ' +
        'supported:false on every desktop (absence RED)',
    ).toBe(supported);
    expect(initial.active, 'fresh process: nothing applied yet').toBe(false);
    expect(initial.hint, '§4.2 loopback hint stays exact (AC-04.5 manual values)').toEqual({
      host: '127.0.0.1',
      port: DEFAULT_SOCKS_PORT,
    });

    // S4-4 guard: malformed payload rejects BEFORE any side effect.
    await expect(
      invoke('proxy:set', { enabled: 'yes' }),
      'S4-4 (issue #5): TS types are erased — proxy:set must runtime-validate that ' +
        'enabled is a boolean (house guard precedent: UntrustedSenderError — a ' +
        'synchronous throw surfaces as an invoke rejection, DV-35(1), no new E-* code)',
    ).rejects.toMatchObject({ name: 'InvalidPayloadError' });
    expect(
      vi.mocked(setSystemProxy).mock.calls.length,
      'S4-4: validation must run BEFORE any module call — a malformed payload has ' +
        'zero side effects on the host',
    ).toBe(0);

    // Apply: exactly one module call, the result passed through.
    const apply = await invoke<OperationResult>('proxy:set', { enabled: true });
    expect(
      vi.mocked(setSystemProxy).mock.calls.length,
      'AC-04.1/FR-31: the real proxy:set {enabled:true} must drive setSystemProxy ' +
        'exactly once (today: placeholder, zero calls)',
    ).toBe(1);
    if (supported) {
      expect(apply.ok, 'module ok → proxy:set answers ok').toBe(true);
      expect(
        (await invoke<ProxyState>('proxy:get')).active,
        'the APPLIED state is reported back through proxy:get — never a renderer-only flip',
      ).toBe(true);
    } else {
      expect(
        apply.ok,
        'unsupported desktop → the module refusal passes through verbatim (AC-04.5)',
      ).toBe(false);
      if (!apply.ok) {
        expect(apply.error.code, "the module's own E-PLAT-001 triple, unchanged").toBe(
          'E-PLAT-001',
        );
      }
      expect(
        (await invoke<ProxyState>('proxy:get')).active,
        'refused apply → reported inactive',
      ).toBe(false);
    }

    // Restore with the SNAPSHOT IDENTITY (supported leg — nothing applied above).
    if (supported) {
      const disable = await invoke<OperationResult>('proxy:set', { enabled: false });
      expect(
        vi.mocked(restoreSystemProxy).mock.calls.length,
        'AC-04.3/FR-31: disabling restores the captured prior state',
      ).toBe(1);
      const restoreCall = vi.mocked(restoreSystemProxy).mock.calls[0];
      expect(restoreCall, 'the restore call must be captured').toBeDefined();
      if (restoreCall !== undefined) {
        expect(
          restoreCall[1],
          'byte-for-byte restore needs the SNAPSHOT IDENTITY the earlier apply ' +
            'returned — stored and threaded through (AC-04.3, DV-35(4))',
        ).toBe(probe.snapshotResult);
        expect(
          restoreCall[0].platform,
          'same host context (PR-01 — platform passed in, never read by the module)',
        ).toBe(process.platform);
      }
      expect(disable.ok, 'restore ok → proxy:set {enabled:false} answers ok').toBe(true);
      expect(
        (await invoke<ProxyState>('proxy:get')).active,
        'reported inactive after the restore',
      ).toBe(false);
    }
  });
});

// ————————————————————————————————————————————————————————————————
// TC-04-17 — auto-on-start + stop-restore, BOTH routes (amended AC-04.1/04.6/04.7)
// ————————————————————————————————————————————————————————————————

describe('auto-on-start + stop-restore, both routes (TC-04-17, amended AC-04.1/04.6/04.7)', () => {
  it('startStop.autoApplyAndStopRestore.proxyHooksOnBothRoutes', async () => {
    await settleQuietly();
    const supported = isSupportedPlatform(
      process.platform,
      process.env.XDG_CURRENT_DESKTOP,
    ).supported;

    // Structural (universal RED trigger): index.ts must own the auto-apply.
    expect(
      /setSystemProxy\s*\(/.test(indexSource()),
      'TC-04-17 (M1-27 D-01, owner Q1 AUTO-ON-START): src/main/index.ts must call ' +
        'setSystemProxy( — today index.ts has ZERO call sites (placeholder-only ' +
        'wiring, issue #14; system-proxy.test.ts pins the module, this pins the ' +
        'integration)',
    ).toBe(true);

    // (1) FAILED start → the proxy is never touched.
    probe.startFails = true;
    const failedStart = await invoke<OperationResult>('core:start');
    expect(failedStart.ok, 'precondition: the injected supervisor refused the start').toBe(false);
    expect(
      vi.mocked(setSystemProxy).mock.calls.length,
      'AC-04.1 "Given the core is running" — a FAILED core:start must never apply ' +
        'the system proxy',
    ).toBe(0);
    probe.startFails = false;

    // (2) successful start → auto-apply ONCE (supported) / NOT AT ALL (unsupported).
    const started = await invoke<OperationResult>('core:start');
    expect(started.ok, 'precondition: the start succeeded').toBe(true);
    if (supported) {
      expect(
        vi.mocked(setSystemProxy).mock.calls.length,
        'amended AC-04.1 (owner Q1): the tunnel start AUTO-APPLIES the system ' +
          'proxy — the renderer toggle stays as the override',
      ).toBe(1);
    } else {
      expect(
        vi.mocked(setSystemProxy).mock.calls.length,
        'unsupported desktop: auto-apply must not run the module at all — no call, ' +
          'no error dialog (AC-04.5 manual hint stays the answer)',
      ).toBe(0);
    }

    // (3) FAILED auto-apply → the core KEEPS RUNNING + a plain-language surface.
    expect(
      (await invoke<OperationResult>('core:stop')).ok,
      'precondition: back to stopped before the failure phase',
    ).toBe(true);
    vi.mocked(setSystemProxy).mockClear();
    probe.dialogCalls.length = 0;
    probe.applyMode = 'fail';
    const restart = await invoke<OperationResult>('core:start');
    if (supported) {
      expect(
        restart.ok,
        'AC-04.6 amended: the start result stays ok:true when the auto-apply ' +
          'fails — the core KEEPS RUNNING (never a fake start failure)',
      ).toBe(true);
      expect(
        vi.mocked(setSystemProxy).mock.calls.length,
        'the apply ATTEMPT ran once (the canned refusal produced the failure)',
      ).toBe(1);
      expect(
        probe.dialogCalls.length,
        'AC-04.6 "a plain-language error is shown" — main must surface the apply ' +
          'failure through a dialog (precedent: the import-confirm showMessageBox; ' +
          'pinned as CALLED, wording unpinned, A-14)',
      ).toBeGreaterThan(0);
    }
    probe.applyMode = 'ok';
    expect(
      (await invoke<OperationResult>('core:stop')).ok,
      'precondition: back to stopped before the restore phase',
    ).toBe(true);
    vi.mocked(setSystemProxy).mockClear();
    vi.mocked(restoreSystemProxy).mockClear();

    // (4) stop after an apply → restore with the stored snapshot identity.
    if (supported) {
      expect(
        (await invoke<OperationResult>('core:start')).ok,
        'precondition: running with an auto-applied proxy',
      ).toBe(true);
      expect(vi.mocked(setSystemProxy).mock.calls.length, 'precondition: the auto-apply ran').toBe(
        1,
      );
      expect((await invoke<OperationResult>('core:stop')).ok, 'the stop succeeds').toBe(true);
      expect(
        vi.mocked(restoreSystemProxy).mock.calls.length,
        'AC-04.7: stopping the core reverts the applied system proxy',
      ).toBe(1);
      const restoreCall = vi.mocked(restoreSystemProxy).mock.calls[0];
      if (restoreCall !== undefined) {
        expect(restoreCall[1], 'the stored snapshot threads into the stop restore (DV-35(4))').toBe(
          probe.snapshotResult,
        );
      }
      expect(
        (await invoke<ProxyState>('proxy:get')).active,
        'reported inactive after the stop restore',
      ).toBe(false);
    }

    // (5) TRAY routes reach the very same hooks (data-flows §4.2 "Not IPC").
    vi.mocked(setSystemProxy).mockClear();
    vi.mocked(restoreSystemProxy).mockClear();
    trayItem('Start tunnel').click();
    if (supported) {
      await waitFor(
        () => vi.mocked(setSystemProxy).mock.calls.length >= 1,
        2000,
        "tray 'Start tunnel' click to reach the auto-apply (AC-04.1 — BOTH start routes)",
      );
      trayItem('Stop tunnel').click();
      await waitFor(
        () => vi.mocked(restoreSystemProxy).mock.calls.length >= 1,
        2000,
        "tray 'Stop tunnel' click to reach the restore (AC-04.7 — BOTH stop routes)",
      );
      expect(
        (await invoke<ProxyState>('proxy:get')).active,
        'reported inactive after the tray stop',
      ).toBe(false);
    } else {
      await flushAsync();
      expect(
        vi.mocked(setSystemProxy).mock.calls.length,
        'the tray auto-apply honours the platform rule too (no module call when ' + 'unsupported)',
      ).toBe(0);
    }
  }, 15_000);
});

// ————————————————————————————————————————————————————————————————
// TC-04-19 — desktopEnv into the context (D-03 / S5-10, issue #16)
// ————————————————————————————————————————————————————————————————

describe('desktopEnv into the system-proxy context (TC-04-19, D-03 / S5-10)', () => {
  it('proxyWiring.systemProxyContextCarriesDesktopEnvFromXdg', async () => {
    await settleQuietly();

    // Structural (universal RED trigger): index.ts must READ the XDG value.
    expect(
      indexSource().includes('XDG_CURRENT_DESKTOP'),
      'TC-04-19 (M1-27 D-03 / S5-10, issue #16): src/main/index.ts must feed ' +
        '$XDG_CURRENT_DESKTOP into the SystemProxyContext — without it ' +
        'isSupportedPlatform("linux", undefined) can never answer supported, so ' +
        'AC-04.2 would fail on GNOME even with D-01 fixed (data-flows §3 SUPPORT ' +
        'DETECT, absence RED)',
    ).toBe(true);

    // Behavioural: the context the REAL handler passes into setSystemProxy.
    await invoke('proxy:set', { enabled: true });
    const contextCall = vi.mocked(setSystemProxy).mock.calls[0];
    expect(
      contextCall,
      'the real proxy:set handler must pass the host context into setSystemProxy ' +
        '(today: placeholder, zero calls)',
    ).toBeDefined();
    if (contextCall !== undefined) {
      const context = contextCall[0];
      expect(
        Object.prototype.hasOwnProperty.call(context, 'desktopEnv'),
        'OWN-PROPERTY desktopEnv — the VALUE may be undefined on hosts without ' +
          '$XDG_CURRENT_DESKTOP (DV-35(2)), but the property must never be MISSING ' +
          'from the context',
      ).toBe(true);
      expect(
        context.desktopEnv,
        'value mirrors $XDG_CURRENT_DESKTOP verbatim (PR-01: passed in, never read ' +
          'by the pure module)',
      ).toBe(process.env.XDG_CURRENT_DESKTOP);
      expect(context.platform, 'PR-01: platform passed in').toBe(process.platform);
      expect(typeof context.run, 'PR-08: the execFile executor seam rides along').toBe('function');
    }

    // Cleanup: never leave an applied proxy behind for the next case.
    await invoke('proxy:set', { enabled: false });
  });
});

// ————————————————————————————————————————————————————————————————
// M2-11 / issue #19 — FR-35 fail-closed restore surfacing: a FAILED proxy
// revert on the QUIT, CRASH and STOP arms must show the persistent
// E-PLAT-003 warning (requirements FR-35, errors.md §4/§6, data-flows §5)
// — never a silent leftover. TC-04-20..23 (m2-test-plan §8, RED first).
// NOTE: `quit...` runs LAST on purpose — firing `before-quit` flips
// index.ts's module-level `quitting` marker for the rest of this file.
// ————————————————————————————————————————————————————————————————

/** Synthetic E-PLAT-003 refusal — the harness's restore-failure fixture. */
const RESTORE_FAILURE: Extract<OperationResult, { ok: false }> = {
  ok: false,
  error: {
    code: 'E-PLAT-003',
    title: 'System proxy could not be restored',
    cause: 'Synthetic restore refusal — the harness injects it (M2-11 fixture).',
    nextStep: 'Restore the proxy settings manually: SOCKS 127.0.0.1:10808 off.',
  },
};

/** Synthetic crash snapshot — emitted through the captured `onStateChange`. */
const CRASH_SNAPSHOT: StatusSnapshot = {
  state: 'crashed',
  lastError: {
    code: 'E-CORE-001',
    title: 'Core stopped unexpectedly',
    cause: 'Synthetic crash — the harness emitted it through the captured seam.',
    nextStep: 'Click Start to relaunch the core.',
  },
};

/** The captured `app.on(<event>)` handler — the before-quit gate itself. */
function appEventHandler(event: string): (...args: unknown[]) => void {
  const entry = probe.appEvents.find((candidate) => candidate.event === event);
  if (entry === undefined) {
    throw new Error(`no app.on("${event}") handler captured from src/main/index.ts`);
  }
  return entry.handler;
}

describe('FR-35 fail-closed restore surfacing (M2-11, issue #19) — TC-04-20..23', () => {
  /** Fires the captured supervisor `onStateChange` with the crash snapshot. */
  function emitCrash(): void {
    const options = probe.supervisorOptions;
    expect(
      options,
      'harness precondition: core:start must have constructed the supervisor (crash seam)',
    ).not.toBeNull();
    options?.onStateChange(CRASH_SNAPSHOT);
  }

  it('crash.proxyRestoreFailure.surfacesPersistentWarning', async () => {
    await settleQuietly();
    // Auto-apply on start (AC-04.1) stores the snapshot — the "toggle On"
    // precondition of FR-35's crash arm.
    await invoke('core:start');
    expect((await invoke<ProxyState>('proxy:get')).active, 'precondition: applied').toBe(true);

    vi.mocked(restoreSystemProxy).mockResolvedValueOnce(RESTORE_FAILURE);
    probe.events.length = 0;
    emitCrash();
    await flushAsync();

    expect(
      vi.mocked(restoreSystemProxy).mock.calls.length,
      'FR-35 crash arm: a crash while applied must revert the system proxy ' +
        '(errors.md §6 E-CORE-* automatic side effects)',
    ).toBe(1);
    expect(
      vi.mocked(restoreSystemProxy).mock.calls[0]?.[1],
      'the revert replays the stored snapshot (identity, AC-04.3)',
    ).toBe(SNAPSHOT);
    expect(
      probe.dialogCalls.length,
      'FR-35: a FAILED crash-arm revert must show the persistent E-PLAT-003 ' +
        'warning — never a silent leftover (issue #19 item 2)',
    ).toBe(1);
    const warning = ((probe.dialogCalls[0] as unknown[] | undefined)?.[0] ?? {}) as Record<
      string,
      unknown
    >;
    expect(
      warning,
      'the warning carries the E-PLAT-003 triple (auto-apply dialog precedent)',
    ).toMatchObject({
      title: RESTORE_FAILURE.error.title,
      message: RESTORE_FAILURE.error.cause,
      detail: RESTORE_FAILURE.error.nextStep,
    });
  });

  it('crash.proxyRestoreSuccess.clearsSnapshotWithoutWarning', async () => {
    await settleQuietly();
    await invoke('core:start');
    emitCrash(); // restore default: {ok: true}
    await flushAsync();

    expect(
      (await invoke<ProxyState>('proxy:get')).active,
      'FR-35 crash arm: a successful revert clears the snapshot (proxy:get tells the truth)',
    ).toBe(false);
    expect(probe.dialogCalls.length, 'no warning when the revert succeeds').toBe(0);
  });

  it('stop.proxyRestoreFailure.surfacesPersistentWarning', async () => {
    await settleQuietly();
    await invoke('core:start');
    vi.mocked(restoreSystemProxy).mockResolvedValueOnce(RESTORE_FAILURE);

    const stopped = await invoke<OperationResult>('core:stop');
    expect(
      stopped.ok,
      'AC-04.6 precedent: the stop result itself stays ok — the revert is a separate arm',
    ).toBe(true);
    expect(
      probe.dialogCalls.length,
      'FR-35 STOP arm: a failed revert must show the persistent E-PLAT-003 warning',
    ).toBe(1);
    expect(
      (await invoke<ProxyState>('proxy:get')).active,
      'a failed revert keeps proxy:get truthful (active:true — AC-04.7 contract)',
    ).toBe(true);
  });

  it('quit.proxyRestoreFailure.surfacesWarningBeforeExit', async () => {
    // LAST case on purpose: firing before-quit flips index.ts's module-level
    // `quitting` marker for the rest of this file's module instance.
    await settleQuietly();
    await invoke('core:start');
    vi.mocked(restoreSystemProxy).mockResolvedValueOnce(RESTORE_FAILURE);
    probe.events.length = 0;
    probe.dialogCalls.length = 0;

    const event = { preventDefault: vi.fn() };
    appEventHandler('before-quit')(event);
    await flushAsync(20);

    expect(
      event.preventDefault,
      'FR-42 gate: the first before-quit is cancelled synchronously',
    ).toHaveBeenCalled();
    expect(
      probe.dialogCalls.length,
      'FR-35 QUIT arm (issue #19 item 1): the failed revert shows the ' +
        'pre-exit E-PLAT-003 warning — beginQuit must not swallow it silently',
    ).toBe(1);
    const dialogAt = probe.events.indexOf('messageBox');
    const quitAt = probe.events.indexOf('quit');
    expect(dialogAt, 'the warning must actually be raised').toBeGreaterThanOrEqual(0);
    expect(
      quitAt,
      '...and the exit must still be requested (AC-05.5 exits fully)',
    ).toBeGreaterThanOrEqual(0);
    expect(dialogAt, 'PRE-exit dialog: warning raised BEFORE requestQuit').toBeLessThan(quitAt);
  });
});

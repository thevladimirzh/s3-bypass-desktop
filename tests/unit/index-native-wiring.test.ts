/**
 * M1-23a (RED) — native wiring of the window lifecycle and the system-proxy
 * restore hook into `src/main/index.ts` (Phase H follow-up row).
 *
 * Test plan IDs: TC-05-16, TC-05-17, TC-05-18, TC-05-19 (§5 US-05) +
 * TC-04-15 (§4 US-04) — docs/qa/m1-test-plan.md, the M1-23a row in §10,
 * allocations DV-30 in §14.
 *
 * Spec sources: docs/analysis/requirements.md F6 (FR-39 close hides / process
 * stays alive, FR-42 quit order stop → revert → exit, FR-19 quit stops the
 * core + reverts the proxy), F5 (FR-35 restore on stop/crash/quit, fail
 * closed) and platform rules PR-03 (the scaffold's quit-on-`window-all-closed`
 * for non-darwin conflicts with close-to-tray — "Must be changed") and PR-08
 * (`execFile` with argv arrays, never a shell string); docs/analysis/
 * data-flows.md §5 (quit ordering: stop core → revert proxy → delete T →
 * exit) and §3 (DISABLE/STOP/CRASH/QUIT replays the snapshot through the
 * injected executor); docs/product/stories/US-05-tray.md AC-05.2/AC-05.5,
 * US-04-system-proxy.md AC-04.7; docs/plans/m1-mvp.md M1-23a → M1-23b.
 *
 * Layer: L1 unit on the house mocked-electron harness (precedent
 * ipc-sender-guard.test.ts / profile-reimport.test.ts) + structural source
 * scans (precedent TC-06-15 / TC-IPC-10). The MODULE-level policy pins —
 * `handleCloseRequest` verdicts, the teardown ORDER stopCore → restoreProxy →
 * requestQuit, failure resilience, idempotence — are already GREEN in M1-22's
 * tests/unit/window-lifecycle.test.ts; this batch pins only the NATIVE
 * attachment (plan row: "module-level ACs already covered by M1-22" — §14
 * DV-30, no duplicate pins).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-23b (header-contract style; any deviation requires an
 * upstream spec note first — strategy §5.2; never weaken, skip, or delete):
 *
 * A) Window close → hide-to-tray (FR-39 / US-05 AC-05.2 / PR-03):
 *    `src/main/index.ts` registers a `close` listener on the created
 *    BrowserWindow that routes the request through the lifecycle policy:
 *    `handleCloseRequest()` answering `'hide'` (not quitting) →
 *    `event.preventDefault()` AND the window hides (process + running core
 *    stay alive); answering `'close'` (quitting) → nothing is prevented, so
 *    the window really closes and the exit can complete (AC-05.5).
 *
 * B) `before-quit` → `handleBeforeQuit()` (FR-19 / FR-42 / AC-05.5,
 *    data-flows §5): an `app.on('before-quit', …)` handler gates the exit —
 *    `event.preventDefault()` SYNCHRONOUSLY (before any await), then the
 *    teardown settles (restore hook observed, C), then the app exits
 *    (requestQuit → `app.quit()` wiring documented in
 *    window-lifecycle.ts's `requestQuit` dep). A `before-quit` arriving
 *    AFTER the teardown settled must NOT be gated again — otherwise Electron
 *    re-enters the event forever and FR-42's "full app exit" never happens.
 *    The teardown ORDER itself is M1-22's pin — deliberately not re-pinned.
 *
 * C) System-proxy restore hook + executor seam (FR-35 / US-04 AC-04.7 /
 *    data-flows §5; PR-08): the lifecycle's `restoreProxy` delegates to
 *    `restoreSystemProxy(context, snapshot)` from `src/main/system-proxy.ts`,
 *    called with the host context `{ platform: process.platform, run }`,
 *    where `run(args: string[]) => Promise<CommandResult>` is a REAL
 *    executor built on `node:child_process` `execFile` (argv arrays —
 *    `exec`, `execSync` and `shell: true` are forbidden anywhere in
 *    index.ts). Delegation is unconditional — `restoreSystemProxy(ctx, null)`
 *    is the module's documented idempotent no-op, so the hook may not be
 *    skipped by a caller-side guard.
 *
 * D) `window-all-closed` keeps the process alive while the tray exists
 *    (FR-39 / AC-05.2 / PR-03): on Linux — the exact PR-03 conflict case —
 *    the handler must NOT call `app.quit()` while the tray is up.
 *
 * E) deps construction (plan M1-23a explicit; FR-19 / FR-35): the
 *    `createWindowLifecycle({…})` deps object wires `stopCore` →
 *    `coreWiring.handleStop()` (the same path `core:stop` uses) and
 *    `restoreProxy` → `restoreSystemProxy(…)`, and index.ts references
 *    `handleCloseRequest(` / `handleBeforeQuit(` and registers
 *    `app.on('before-quit', …)`.
 *
 * OUT OF SCOPE, deliberately (DV-30): (1) the `proxy:set` IPC handler still
 * returns the M1-06/07 E-PLAT-001 placeholder — no plan row opens that swap
 * in M1-23a/b, `tests/unit/ipc-contract.test.ts` pins only the §4.2 payload
 * SHAPE (`{ ok } | { ok:false, error }` in: `{ enabled }`), never the
 * placeholder, and nothing existing may be weakened; (2) automatic
 * `setSystemProxy` on Start ("setSystemProxy on Start … as pinned by
 * M1-23a"): US-04's ACs are USER-DRIVEN (AC-04.1 "When the user turns the
 * toggle On"; AC-04.4 gates the toggle), so no automation is pinned — an
 * owner/PM spec decision would be needed first; (3) hidden-to-tray at LAUNCH
 * (FR-38 `show:false` wiring) — outside the M1-23a row text (reported in the
 * RED report).
 *
 * Fixture rule (strategy §1): synthetic data only — no real credentials, no
 * network, no live system-proxy change (the system-proxy module is mocked;
 * `setSystemProxy` gets a canned synthetic result as a defensive no-OS-call
 * guarantee). The ONE spawned process is the local `true` binary used to prove
 * the injected `run` executes an ARGV ARRAY without a shell (PR-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * M1-27b ADDENDUM (TC-05-23 · M1-27 blocker B-02 / D-02 / issue #15 · §14
 * DV-35, owner decisions in docs/qa/acceptance-m1-27.md §8): OUT-OF-SCOPE item
 * (3) below is CLOSED by this batch — the launch-hidden NATIVE pin joins this
 * file (the FakeBrowserWindow harness now records constructor options —
 * additive change): `show:false` in createWindow's options, a real
 * `shouldShowWindowOnLaunch()` call-site in index.ts, and no launch-time
 * `show` event while the policy answers `false` (hidden at EVERY launch —
 * DV-27(3); Q-C stays open but the unconditional BRIEF §2.5/FR-38 wording
 * governs). AMENDED 2026-10-08 (owner decision issue #25, FR-38 rewritten):
 * the policy now answers `true` and the launch path MUST `show()` the
 * window right after the consult — see the TC-05-23 case below. Items (1) and (2) are RESOLVED by the owner (Q1 auto-on-start, Q2
 * SOCKS-only — acceptance §8) and pin with the proxy batch:
 * tests/unit/proxy-wiring.test.ts (TC-04-16..19, issue #14/#5 S4-4). Nothing
 * in the contract above is weakened: every M1-23b case stays as written.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RED status: MIXED assertion/absence RED, every case failing because the
 * NATIVE wiring is absent — (A) no window `close` listener is registered;
 * (B) no `app.on('before-quit')` registration exists (helper absence RED);
 * (C) `restoreSystemProxy(` and `node:child_process`/`execFile` never appear
 * in index.ts; (D) assertion RED — today's handler quits on Linux while the
 * tray exists (the PR-03 conflict itself); (E) `createWindowLifecycle(`
 * absent. Never a mock-setup error: the harness fully supports today's
 * index.ts. Do not weaken, skip, or delete anything here; M1-23b implements
 * this contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restoreSystemProxy, setSystemProxy } from '../../src/main/system-proxy';
import { stripComments } from '../helpers/log-collector-stub';

/** One `app.on(…)` registration captured from `src/main/index.ts`. */
interface RecordedAppEvent {
  readonly event: string;
  readonly handler: (...args: unknown[]) => void;
}

/** What the fake BrowserWindow records: per-event listeners + named actions. */
interface RecordedWindow {
  readonly handlers: Map<string, Array<(...args: unknown[]) => void>>;
  readonly events: string[];
  /** Constructor options — recorded for TC-05-23 (M1-27b, DV-35). */
  readonly options: unknown;
}

/**
 * Observes what the mocked Electron APIs see. Registrations and windows are
 * module-lifetime (index.ts evaluates once per file), so they are NOT reset
 * per test; only per-test observables are. The dev URL is pinned in
 * `vi.hoisted`, which runs before every import — `src/main/index.ts` and
 * `src/main/ipc-guard.ts` read exactly this value (same technique as
 * ipc-sender-guard.test.ts).
 */
const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    appEvents: [] as RecordedAppEvent[],
    windows: [] as RecordedWindow[],
    /** Ordered teardown observables: 'restore' (system proxy) then 'quit'. */
    timeline: [] as string[],
    quitCount: 0,
    trayCreations: 0,
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
    /** Constructor options, recorded for TC-05-23 (M1-27b, DV-35 — additive). */
    readonly options: unknown;

    constructor(options?: unknown) {
      this.options = options;
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
      probe.trayCreations += 1;
    }

    setToolTip(): void {
      // tooltip text is pinned by TC-05-13's structural scan
    }

    setContextMenu(): void {
      // menu contents are pinned by the buildTrayMenu model tests
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
        probe.quitCount += 1;
        probe.timeline.push('quit');
      },
      getPath: () => '/nonexistent-userdata-for-tests',
    },
    BrowserWindow: FakeBrowserWindow,
    Tray: FakeTray,
    nativeImage: { createFromDataURL: (_data: string): unknown => ({}) },
    Menu: { buildFromTemplate: (template: unknown): unknown => ({ template }) },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
      showMessageBox: vi.fn(async () => ({ response: 1, checkboxChecked: false })),
    },
    ipcMain: {
      handle: (..._args: unknown[]) => undefined,
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (_handler: unknown) => undefined,
      },
    },
    shell: { openExternal: (_url: unknown) => undefined },
  };
});

/**
 * The secret store is a side-effect surface no case here exercises — mocked so
 * an accidental touch fails loudly instead of reaching a keychain (§1).
 */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => null),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/**
 * The system-proxy module is observed through spies (the restore-hook
 * attachment of pin C) — the implementations are overridden with canned
 * synthetic results in `beforeEach`, so NO `networksetup`/`gsettings` command
 * can ever run from this suite (strategy §1). The module's own behavior is
 * already GREEN in tests/unit/system-proxy.test.ts (M1-20/M1-21).
 */
vi.mock('../../src/main/system-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/system-proxy')>();
  return {
    ...actual,
    setSystemProxy: vi.fn(actual.setSystemProxy),
    restoreSystemProxy: vi.fn(actual.restoreSystemProxy),
  };
});

const INDEX_SOURCE = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));

/** Comment-stripped `src/main/index.ts` (precedent TC-06-15 / TC-IPC-10). */
function indexSource(): string {
  expect(existsSync(INDEX_SOURCE), 'src/main/index.ts must exist').toBe(true);
  return stripComments(readFileSync(INDEX_SOURCE, 'utf8'));
}

/** The LAST `app.on('<event>')` handler index.ts registered, or absence RED. */
function appEventHandler(event: string): (...args: unknown[]) => void {
  const registration = probe.appEvents.filter((entry) => entry.event === event).at(-1);
  if (registration === undefined) {
    throw new Error(
      `no app.on('${event}') registration captured from src/main/index.ts — plan M1-23a ` +
        `requires the native '${event}' wiring (FR-39/FR-42, AC-05.2/AC-05.5, data-flows ` +
        '§5); absence RED until M1-23b attaches it (strategy §5.1)',
    );
  }
  return registration.handler;
}

/** Lets the `app.whenReady()` path (tray + window creation) run to completion. */
async function flushAsync(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** The balanced `(...)` argument text of a call matched by `pattern`. */
function callArguments(source: string, pattern: RegExp): string {
  const at = source.search(pattern);
  if (at < 0) return '';
  const open = source.indexOf('(', at);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return '';
}

/**
 * The deps object of `createWindowLifecycle(…)` — primary: the inline literal
 * the plan row describes; fallback: a `WindowLifecycleDeps`-typed literal the
 * call site then passes by name (same pin, second construction style).
 */
function lifecycleDepsBlock(source: string): string {
  const inline = callArguments(source, /createWindowLifecycle\s*\(/);
  if (/\bstopCore\s*:/.test(inline)) return inline;
  const typed = source.search(/:\s*WindowLifecycleDeps\s*=/);
  if (typed >= 0) {
    const brace = source.indexOf('{', typed);
    if (brace >= 0) {
      let depth = 0;
      for (let index = brace; index < source.length; index += 1) {
        const character = source[index];
        if (character === '{') depth += 1;
        else if (character === '}') {
          depth -= 1;
          if (depth === 0) return source.slice(brace + 1, index);
        }
      }
    }
  }
  return inline;
}

beforeEach(() => {
  probe.quitCount = 0;
  probe.timeline.length = 0;
  for (const windowRecord of probe.windows) {
    // The launch-time `show` (FR-38 amended, issue #25: the policy answers
    // true at every launch, TC-05-23) is a ONE-SHOT module-load side effect —
    // it is preserved across the per-test wipe so the launch pin can observe
    // it; every per-test side effect (close/hide, …) still resets here.
    const launchShown = windowRecord.events.includes('show');
    windowRecord.events.length = 0;
    if (launchShown) windowRecord.events.push('show');
  }
  vi.mocked(restoreSystemProxy)
    .mockClear()
    .mockImplementation(async () => {
      probe.timeline.push('restore');
      return { ok: true };
    });
  // Defensive canned result: this suite never asserts the SET side (DV-30) and
  // must never touch the OS (strategy §1) — a synthetic mac snapshot keeps any
  // hypothetical call on the recorded path, with zero commands.
  vi.mocked(setSystemProxy)
    .mockClear()
    .mockImplementation(async () => ({
      ok: true,
      snapshot: {
        service: 'Wi-Fi',
        socks: { enabled: false, host: '', port: 0 },
        secureWeb: { enabled: false, host: '', port: 0 },
      },
    }));
});

describe('native window-lifecycle wiring in src/main/index.ts (plan M1-23a)', () => {
  it('windowLifecycle.wiring.closeEventConsultsLifecycleAndHidesToTray', async () => {
    // TC-05-16 — FR-39 / US-05 AC-05.2 / PR-03: a close request while NOT
    // quitting must route through the lifecycle's handleCloseRequest():
    // verdict 'hide' → preventDefault + the window hides, process and running
    // core stay alive. Declaration order matters: this case runs FIRST, while
    // the quit marker is still false (the quitting branch is TC-05-17's).
    await flushAsync();
    const main = probe.windows[0];
    expect(
      main,
      'precondition: app.whenReady created the main window (createWindow)',
    ).toBeDefined();
    if (main === undefined) throw new Error('unreachable: window precondition above');

    const closeHandlers = main.handlers.get('close') ?? [];
    expect(
      closeHandlers.length,
      "plan M1-23a/FR-39/AC-05.2: src/main/index.ts must register a window 'close' listener " +
        'routing through the lifecycle (handleCloseRequest) — without it a close destroys the ' +
        'window instead of hiding it to the tray (PR-03 close-to-tray)',
    ).toBeGreaterThan(0);

    const closeEvent = { preventDefault: vi.fn() };
    for (const handler of closeHandlers) handler(closeEvent);

    expect(
      closeEvent.preventDefault,
      "FR-39/AC-05.2: with verdict 'hide' the close must be prevented — the process " +
        '(and a running core) stays alive (close-to-tray, PR-03)',
    ).toHaveBeenCalled();
    expect(
      main.events,
      'FR-39/AC-05.2: the window HIDES to tray — hiding is the observable half of ' +
        'close-to-tray (preventDefault alone would leave the window on screen)',
    ).toContain('hide');
  });

  it('windowLifecycle.wiring.windowAllClosedKeepsProcessAliveWhileTrayExists', async () => {
    // TC-05-18 — FR-39 / US-05 AC-05.2 / PR-03: the scaffold's documented
    // conflict ("Linux: current scaffold quits on window-all-closed for
    // non-darwin — Must be changed") is exercised directly: with the tray up,
    // firing window-all-closed on Linux must NOT call app.quit(). RED today
    // precisely because PR-03's conflict is still present in index.ts.
    await flushAsync();
    expect(
      probe.trayCreations,
      'precondition: the tray exists from launch (FR-41/AC-05.4) — the "while the tray ' +
        'exists" premise of this pin',
    ).toBeGreaterThan(0);

    const handler = appEventHandler('window-all-closed');
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      writable: false,
      enumerable: true,
      configurable: true,
    });
    try {
      handler();
    } finally {
      if (originalPlatform !== undefined) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }

    expect(
      probe.quitCount,
      'PR-03 + FR-39/AC-05.2 + plan M1-23a: while the tray exists, window-all-closed must ' +
        'keep the process alive — app.quit() here is the documented PR-03 conflict ' +
        '(quit-on-last-window for non-darwin)',
    ).toBe(0);
  });

  it('windowLifecycle.wiring.beforeQuitGatesExitUntilWiredTeardownSettles', async () => {
    // TC-05-17 (+ TC-04-15 runtime half) — FR-19/FR-42, US-05 AC-05.5,
    // data-flows §5: the before-quit handler gates the exit SYNCHRONOUSLY
    // (preventDefault before any await), the wired teardown settles (restore
    // hook observed below), then the app exits; a before-quit arriving after
    // the settle must pass through, or Electron can never finish the quit
    // (FR-42 "full app exit"). Teardown ORDER is M1-22's pin — here the
    // attachment is what is asserted (which functions index.ts wired).
    await flushAsync();
    const beforeQuit = appEventHandler('before-quit');

    const firstQuit = { preventDefault: vi.fn() };
    beforeQuit(firstQuit);
    expect(
      firstQuit.preventDefault,
      'plan M1-23a/FR-42/AC-05.5: before-quit must call event.preventDefault() ' +
        'SYNCHRONOUSLY — the async teardown can only gate the exit if the first ' +
        'before-quit is cancelled before it settles',
    ).toHaveBeenCalled();
    expect(
      probe.quitCount,
      'the exit must not happen before the teardown settles — app.quit() may only run ' +
        'after stopCore → restoreProxy (data-flows §5, requestQuit is the LAST step)',
    ).toBe(0);

    await flushAsync();

    expect(
      vi.mocked(restoreSystemProxy).mock.calls.length,
      'FR-35 / AC-04.7 / data-flows §5: the quit teardown must revert the system proxy ' +
        'through restoreSystemProxy — the restore hook is NOT wired (M1-21 shipped the ' +
        'module; plan M1-23a wires the hook)',
    ).toBe(1);
    expect(
      probe.quitCount,
      'FR-42/AC-05.5: once the teardown settled the app must actually exit ' +
        '(requestQuit → app.quit() wiring)',
    ).toBeGreaterThan(0);
    expect(
      probe.timeline,
      'data-flows §5: revert the proxy BEFORE the exit, exactly once ' +
        "(AC-05.5 one shared teardown) — observed ['restore', 'quit']",
    ).toEqual(['restore', 'quit']);

    const restoreCall = vi.mocked(restoreSystemProxy).mock.calls[0];
    expect(restoreCall, 'precondition: the restore hook was called (asserted above)').toBeDefined();
    if (restoreCall === undefined) throw new Error('unreachable: restore call asserted above');
    const context = restoreCall[0];
    expect(
      context.platform,
      'SystemProxyContext.platform is PASSED IN by the host (data-flows §3 per-platform ' +
        'branching, PR-01) — index.ts must pass process.platform',
    ).toBe(process.platform);
    expect(
      typeof context.run,
      'PR-08 / system-proxy contract: index.ts must inject the run executor into the ' +
        'SystemProxyContext (the M1-21 module never spawns by itself)',
    ).toBe('function');

    // TC-04-15 runtime half: the injected run must EXECUTE an argv array
    // (PR-08: execFile, no shell string) — `true` is the local no-op binary,
    // no network, no OS proxy change (§1).
    const runResult = await context.run(['true']);
    expect(
      runResult.code,
      'PR-08: the injected run executes an ARGV ARRAY without a shell — the local `true` ' +
        'must exit 0 through the executor index.ts provides',
    ).toBe(0);

    const secondQuit = { preventDefault: vi.fn() };
    beforeQuit(secondQuit);
    expect(
      secondQuit.preventDefault,
      'FR-42/AC-05.5: a before-quit arriving AFTER the teardown settled must NOT be ' +
        'gated — Electron re-fires the event for requestQuit()s app.quit(), and gating it ' +
        'again would strand the exit (no full quit, orphan risk FR-19)',
    ).not.toHaveBeenCalled();

    const main = probe.windows[0];
    expect(main, 'precondition: the main window exists').toBeDefined();
    if (main === undefined) throw new Error('unreachable: window precondition above');
    const closeHandlers = main.handlers.get('close') ?? [];
    expect(
      closeHandlers.length,
      "precondition: the window 'close' listener asserted by TC-05-16",
    ).toBeGreaterThan(0);
    const quitClose = { preventDefault: vi.fn() };
    for (const handler of closeHandlers) handler(quitClose);
    expect(
      quitClose.preventDefault,
      "AC-05.5/FR-39: while quitting, handleCloseRequest must answer 'close' — the " +
        'window really closes so the exit can complete (the hide branch is for the ' +
        'not-quitting case only)',
    ).not.toHaveBeenCalled();
    expect(
      main.events,
      'AC-05.5: a close during quit must not hide the window again — hiding would ' +
        'keep a window alive through the exit',
    ).not.toContain('hide');
  });

  it('windowLifecycle.wiring.depsDelegateStopCoreAndRestoreProxyToPinnedModules', () => {
    // TC-05-19 — structural (plan M1-23a explicit: "structural +
    // mocked-electron tests"; precedent TC-06-15 / TC-IPC-10). Pins the DEPS
    // CONSTRUCTION: stopCore → coreWiring.handleStop() (FR-19: quit stops the
    // core through the same path core:stop uses) and restoreProxy →
    // restoreSystemProxy() (FR-35/data-flows §5). Teardown order and
    // idempotence stay M1-22's green pins — not re-pinned here.
    const source = indexSource();

    expect(
      /createWindowLifecycle\s*\(/.test(source),
      'plan M1-23a: index.ts must construct the lifecycle policy ' +
        '(createWindowLifecycle({…})) and wire it into the native close/quit paths',
    ).toBe(true);
    expect(
      /handleCloseRequest\s*\(/.test(source),
      'FR-39/AC-05.2: the native close path must consult handleCloseRequest() — the ' +
        "policy's 'hide'|'close' verdict is what makes close-to-tray observable",
    ).toBe(true);
    expect(
      /handleBeforeQuit\s*\(/.test(source),
      "plan M1-23a/FR-42: before-quit must run the policy's handleBeforeQuit() teardown — " +
        'hand-rolled exit logic would bypass the M1-22-pinned partial order',
    ).toBe(true);
    expect(
      /app\s*\.\s*on\s*\(\s*['"]before-quit['"]/.test(source),
      "FR-42/AC-05.5: index.ts must register app.on('before-quit', …) — without the " +
        'registration no teardown can gate the exit (data-flows §5)',
    ).toBe(true);

    const deps = lifecycleDepsBlock(source);
    expect(
      deps.length,
      'plan M1-23a: the createWindowLifecycle({…}) deps object must exist in index.ts ' +
        '(or a WindowLifecycleDeps-typed literal it passes by name)',
    ).toBeGreaterThan(0);
    expect(/\bstopCore\s*:/.test(deps), 'the deps object must provide stopCore (FR-19)').toBe(true);
    expect(
      /handleStop\s*\(/.test(deps),
      'FR-19/AC-05.5: stopCore must delegate to coreWiring.handleStop() — the very path ' +
        'the core:stop IPC handler uses (single stop, no parallel stop route)',
    ).toBe(true);
    expect(
      /\brestoreProxy\s*:/.test(deps),
      'the deps object must provide restoreProxy (FR-35)',
    ).toBe(true);
    expect(
      /restoreSystemProxy\s*\(/.test(deps),
      'FR-35 / AC-04.7 / data-flows §5: restoreProxy must delegate to ' +
        'restoreSystemProxy(…) — the system-proxy restore hook of plan M1-23a',
    ).toBe(true);
  });
});

describe('system-proxy restore hook + execFile executor seam (FR-35, PR-08)', () => {
  it('systemProxy.wiring.quitRestoreHookUsesExecFileArgvSeam', () => {
    // TC-04-15 — structural half (FR-35 / US-04 AC-04.7 / data-flows §5 for
    // the hook; PR-08 + plan M1-20's executor rule for the seam). The runtime
    // half — the context observed, and `run` executing an argv array — is
    // asserted in TC-05-17's before-quit journey above (one teardown per
    // process, so the halves share that journey — DV-30).
    const source = indexSource();

    expect(
      /restoreSystemProxy\s*\(/.test(source),
      'FR-35/AC-04.7/plan M1-23a: index.ts must call restoreSystemProxy(…) — the ' +
        'system-proxy restore hook is the missing integration half (M1-21 shipped the ' +
        'module only)',
    ).toBe(true);
    expect(
      /['"](?:node:)?child_process['"]/.test(source),
      'PR-08: the SystemProxyContext.run executor must be built on node:child_process — ' +
        'the pure policy modules never spawn, so index.ts owns the seam',
    ).toBe(true);
    expect(
      /\bexecFile\b/.test(source),
      'PR-08 (pinned seam, plan M1-23a): run must be built on execFile with an ARGV ' +
        'ARRAY — never a shell string',
    ).toBe(true);
    const shellPrimitive =
      /\bexecSync\s*\(/.test(source) ||
      /(?<![\w$.])exec\s*\(/.test(source) ||
      /shell\s*:\s*true/.test(source);
    expect(
      shellPrimitive,
      'PR-08: never a shell string — index.ts must not use exec( / execSync( / ' +
        'shell:true anywhere (injection guard, M1-20)',
    ).toBe(false);
  });
});

describe('launch-shows-window native wiring (FR-38 amended, issue #25, AC-05.1 — TC-05-23)', () => {
  it('indexNative.launch.policyConsultedAndWindowShown', async () => {
    // TC-05-23 (originally M1-27b / issue #15, now AMENDED by owner decision
    // issue #25): the launch window is still CREATED hidden (the constructor
    // never carries Electron's show-default) and the launch policy is
    // CONSULTED — but with the policy answering true (FR-38 amended: the
    // window shows on launch) the launch path must then show() it, instead of
    // deferring the first show to tray "Show window" (FR-40/AC-05.3).
    await flushAsync();

    const launchWindow = probe.windows.at(-1);
    expect(
      launchWindow,
      'precondition: the app.whenReady path created a window (M1-23b, GREEN today)',
    ).toBeDefined();
    const options = launchWindow?.options as { show?: unknown } | undefined;
    expect(
      options?.show,
      'TC-05-23 (issue #15): new BrowserWindow({…}) in createWindow must set show:false — ' +
        'BRIEF §2.5/FR-38/AC-05.1 (today the options carry no `show` key at all, so Electron ' +
        'displays the window on every launch — absence RED, strategy §5.1)',
    ).toBe(false);

    const source = indexSource();
    expect(
      /shouldShowWindowOnLaunch\s*\(/.test(source),
      'TC-05-23: src/main/index.ts must CONSULT the lifecycle launch policy ' +
        'shouldShowWindowOnLaunch() (window-lifecycle.ts answers it — GREEN TC-05-14 — but ' +
        'index.ts never calls it: absence RED)',
    ).toBe(true);

    expect(
      launchWindow?.events ?? [],
      'TC-05-23 (issue #25): the launch policy answers TRUE (FR-38 amended — the ' +
        'window shows on launch), so the launch path must show() the window right ' +
        'after consulting shouldShowWindowOnLaunch() — never leave it tray-only',
    ).toContain('show');
  });
});

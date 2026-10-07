/**
 * M1-26 (RED) — S5-3 (GitHub issue #9): the quit teardown must force-stop a
 * `starting`/`stopping` core and await any in-flight graceful stop, so quit
 * can never orphan the child or leave the materialized config T behind.
 *
 * Test plan IDs: TC-05-21 (wiring half — §5 US-05), TC-05-22 (native journey
 * + structural half) — docs/qa/m1-test-plan.md, allocated in §14 DV-32. The
 * supervisor half (TC-05-20, `forceStop()` itself) lives in
 * tests/unit/core-supervisor-hardening.test.ts.
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-3 (finding: the teardown
 * always runs stopCore → restoreProxy → requestQuit, but the state machine
 * accepts `stop` ONLY from `running` — quit during `starting` rejects with
 * E-VAL-015, sends no signal, orphans the child and never runs
 * cleanupMaterialized; quit during `stopping` does not await the in-flight
 * stop); fix: "Add a supervisor forceStop()/kill-from-any-state used by
 * teardown … Make teardown await any in-flight stop before requestQuit";
 * docs/analysis/requirements.md FR-19 (quit stops the core), FR-23 (T
 * deleted), FR-42 (quit order), A-13 (SIGTERM → 2 s → SIGKILL); docs/analysis/
 * data-flows.md §2.1 step 9 ("quit path … no orphan, no leftover") + §5;
 * docs/analysis/errors.md §6 (child reaped, T deleted on terminal paths);
 * docs/product/stories/US-05-tray.md AC-05.5 (one shared teardown).
 *
 * Layer: L1 — TC-05-21 runs the REAL `src/main/core-wiring.ts` over an
 * injected fake supervisor (spawn-free, strategy §1); TC-05-22 uses the house
 * mocked-electron harness (precedent index-native-wiring.test.ts) driving the
 * REAL `src/main/index.ts` quit path, plus the precedent TC-06-15 structural
 * scan of the `createWindowLifecycle({…})` deps.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 * A) `CoreWiring.handleStopForce(): Promise<OperationResult>` (S5-3):
 *    - awaits ANY in-flight `handleStop()` promise FIRST (a graceful stop
 *      already running must settle before the force route runs — "make
 *      teardown await any in-flight stop"), never re-issuing a second
 *      graceful `stop()`;
 *    - then calls the supervisor's `forceStop()` ONCE and returns its result
 *      VERBATIM (identity — no re-wrap);
 *    - with no constructed supervisor: `{ok:true}` and the factory is never
 *      called (the §4.2 idempotent no-op precedent).
 *
 * B) `src/main/index.ts` quit wiring (structural, TC-06-15 style): the
 *    `createWindowLifecycle({…})` deps object routes `stopCore` through
 *    `handleStopForce(` — the TRAY Stop action (`stopTunnel`) deliberately
 *    keeps the graceful `handleStop()` (S5-3 does not change stop()).
 *
 * C) Journey (TC-05-22): core:start leaves the fake supervisor pending (state
 *    `starting`); a `before-quit` then runs the ONE shared teardown, which
 *    must reach `forceStop()` on that supervisor before `app.quit()` — today
 *    the teardown only issues the state-machine-gated graceful stop, the
 *    pending child would be orphaned (S5-3 problem 1).
 *
 * RED status: ASSERTION RED — (TC-05-21) `handleStopForce` does not exist on
 * the wiring; (TC-05-22) `forceStop()` is never called by the quit teardown
 * and the deps still say `handleStop(`. Never a mock-setup error: the harness
 * fully supports today's index.ts (a pending start, a resolving graceful
 * stop). Strategy §5.2 — do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { OperationResult } from '../../src/shared/ipc';
import type {
  CoreLogLine,
  CoreSupervisor,
  SupervisorOptions,
} from '../helpers/core-supervisor-stub';
import { waitFor } from '../helpers/core-supervisor-stub';
import { type CoreWiring, loadCoreWiring } from '../helpers/core-wiring-stub';
import { stripComments } from '../helpers/log-collector-stub';

/** Synthetic stored profile for the wiring rig (§1 synthetic-only). */
const CONFIG_JSON = '{"outbounds":[{"protocol":"fedarisha","settings":{}}]}';

/** Synthetic core executable — never resolved or spawned by the wiring (§1). */
const BINARY_PATH = '/opt/s3-bypass/fedarisha-xray-core';

/** S5-3 contract A: the wiring surface this batch pins. */
interface ForceWiring extends CoreWiring {
  handleStopForce(): Promise<OperationResult>;
}

/** S5-3 contract A: the supervisor surface the rig injects. */
interface ForceSupervisor extends CoreSupervisor {
  forceStop(): Promise<OperationResult>;
}

/** Distinct result objects so "returned verbatim" is an IDENTITY pin. */
const STOP_RESULT: OperationResult = { ok: true };
const FORCE_RESULT: OperationResult = { ok: true };

interface WiringRig {
  readonly wiring: ForceWiring;
  readonly factory: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly forceStop: ReturnType<typeof vi.fn>;
  /** Ordered events: 'stop-called' → 'stop-settled' → 'forceStop-called'. */
  readonly events: string[];
  /** Lets the deferred graceful stop() settle. */
  settleStop(result: OperationResult): void;
}

async function makeWiringRig(config: string | null = CONFIG_JSON): Promise<WiringRig> {
  const events: string[] = [];
  let settleStop: (result: OperationResult) => void = () => undefined;
  const stopGate = new Promise<OperationResult>((resolve) => {
    settleStop = resolve;
  });
  const stop = vi.fn((): Promise<OperationResult> => {
    events.push('stop-called');
    return stopGate.then((result) => {
      events.push('stop-settled');
      return result;
    });
  });
  const forceStop = vi.fn((): Promise<OperationResult> => {
    events.push('forceStop-called');
    return Promise.resolve(FORCE_RESULT);
  });
  const supervisor: ForceSupervisor = {
    start: vi.fn(async (): Promise<OperationResult> => ({ ok: true })),
    stop,
    forceStop,
    isRunning: () => true,
  };
  const factory = vi.fn((): CoreSupervisor => supervisor);

  const { createCoreWiring } = await loadCoreWiring();
  const wiring = createCoreWiring({
    createSupervisor: factory,
    binaryPath: BINARY_PATH,
    loadConfig: () => config,
    logSink: (line: CoreLogLine) => {
      void line;
    },
    broadcast: () => undefined,
  }) as unknown as ForceWiring;

  return { wiring, factory, stop, forceStop, events, settleStop: (result) => settleStop(result) };
}

// ————————————————————————————————————————————————————————————————
// Mocked-electron harness for the index.ts journey (precedent:
// index-native-wiring.test.ts / profile-reimport.test.ts).
// ————————————————————————————————————————————————————————————————

interface RecordedAppEvent {
  readonly event: string;
  readonly handler: (...args: unknown[]) => void;
}

interface RecordedWindow {
  readonly handlers: Map<string, Array<(...args: unknown[]) => void>>;
  readonly events: string[];
}

const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    appEvents: [] as RecordedAppEvent[],
    windows: [] as RecordedWindow[],
    registrations: [] as Array<{ channel: string; handler: (...args: unknown[]) => unknown }>,
    quitCount: 0,
    supervisorConstructions: 0,
    forceStopCalls: 0,
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
      // test no-op
    }

    setContextMenu(): void {
      // test no-op
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
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
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

/** System proxy never touches the OS from tests (§1 — canned results only). */
vi.mock('../../src/main/system-proxy', () => ({
  setSystemProxy: vi.fn(async () => ({ ok: true })),
  restoreSystemProxy: vi.fn(async () => ({ ok: true })),
}));

/**
 * The supervisor factory is the S5-3 seam: `start()` stays PENDING (state
 * `starting` — the S5-3 orphan window), `forceStop()` is the call the quit
 * teardown must make. Counters live in the hoisted `probe`.
 */
vi.mock('../../src/main/core-supervisor', () => ({
  createSupervisor: (_options: SupervisorOptions): ForceSupervisor => {
    probe.supervisorConstructions += 1;
    return {
      start: () => new Promise<OperationResult>(() => undefined),
      stop: (): Promise<OperationResult> => Promise.resolve({ ok: true }),
      isRunning: () => true,
      forceStop: (): Promise<OperationResult> => {
        probe.forceStopCalls += 1;
        return Promise.resolve({ ok: true });
      },
    };
  },
}));

const DEV_URL = 'http://localhost:5173/';
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};

const INDEX_SOURCE = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));

/** The LAST `app.on('<event>')` handler index.ts registered, or absence RED. */
function appEventHandler(event: string): (...args: unknown[]) => void {
  const registration = probe.appEvents.filter((entry) => entry.event === event).at(-1);
  if (registration === undefined) {
    throw new Error(
      `no app.on('${event}') registration captured from src/main/index.ts — the M1-23b ` +
        'native wiring must exist (index-native-wiring.test.ts is GREEN today)',
    );
  }
  return registration.handler;
}

/** Lets the `app.whenReady()` path (window creation) run to completion. */
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

describe('core wiring — handleStopForce (S5-3, issue #9)', () => {
  it('coreWiring.forceStop.awaitsInFlightStopThenForceStopVerbatim', async () => {
    // TC-05-21 / S5-3 contract A. First pin: the method exists (today it does
    // not — absence RED with the contract named); then the two behaviors:
    // the no-supervisor no-op, and the in-flight ordering + verbatim result.
    const idle = await makeWiringRig();
    expect(
      typeof idle.wiring.handleStopForce,
      'S5-3/TC-05-21 (M1-26): createCoreWiring must expose handleStopForce() — the quit ' +
        'teardown needs a force-stop route usable from starting/stopping (issue #9, ' +
        'src/main/core-wiring.ts:175-182 handles only the graceful stop today)',
    ).toBe('function');

    // No constructed supervisor → the §4.2 idempotent no-op, factory untouched.
    expect(
      await idle.wiring.handleStopForce(),
      'S5-3/TC-05-21: without a supervisor handleStopForce answers {ok:true}',
    ).toEqual({ ok: true });
    expect(
      idle.factory,
      'the no-child forceStop must never construct a supervisor (nothing to kill)',
    ).not.toHaveBeenCalled();
    expect(
      idle.forceStop,
      'nothing to force-stop → forceStop() is never called',
    ).not.toHaveBeenCalled();

    // In-flight graceful stop → force route waits for it, then force-stops once.
    const rig = await makeWiringRig();
    const startResult = await rig.wiring.handleStart();
    expect(startResult.ok, `precondition: start failed — ${JSON.stringify(startResult)}`).toBe(
      true,
    );
    const inFlight = rig.wiring.handleStop();
    await waitFor(
      () => rig.stop.mock.calls.length === 1,
      1000,
      'handleStop() to reach supervisor.stop() (in-flight precondition)',
    );

    const forced = rig.wiring.handleStopForce();
    expect(
      rig.forceStop,
      'S5-3/TC-05-21: handleStopForce must AWAIT the in-flight graceful stop before ' +
        'force-stopping ("make teardown await any in-flight stop") — forceStop ran while ' +
        'stop() was still pending',
    ).not.toHaveBeenCalled();

    rig.settleStop(STOP_RESULT);
    const [inFlightResult, forcedResult] = await Promise.all([inFlight, forced]);
    expect(
      inFlightResult,
      'the in-flight handleStop settles with the supervisor stop() result (unchanged route)',
    ).toEqual(STOP_RESULT);
    expect(
      rig.events,
      'S5-3/TC-05-21 order: the graceful stop settles FIRST, only then forceStop() runs',
    ).toEqual(['stop-called', 'stop-settled', 'forceStop-called']);
    expect(
      rig.stop,
      'one graceful stop route — handleStopForce must not re-issue a second graceful stop()',
    ).toHaveBeenCalledTimes(1);
    expect(rig.forceStop, 'exactly one kill request').toHaveBeenCalledTimes(1);
    expect(
      forcedResult,
      'S5-3/TC-05-21: handleStopForce returns the forceStop() result VERBATIM — the very ' +
        'object forceStop resolved (no re-wrap)',
    ).toBe(FORCE_RESULT);
  });
});

describe('index quit wiring — force-stop during starting (S5-3, FR-19/FR-42)', () => {
  it('windowLifecycle.quitTeardown.forceStopsStartingCore', async () => {
    // TC-05-22 / S5-3 journey: core:start leaves the supervisor pending (the
    // `starting` orphan window of S5-3 problem 1), then before-quit runs the
    // ONE shared teardown. The teardown must reach forceStop() before
    // app.quit() — today it issues only the state-machine-gated graceful
    // stop, which cannot terminate a `starting` child (issue #9).
    await flushAsync();

    const startRegistration = probe.registrations.find((entry) => entry.channel === 'core:start');
    if (startRegistration === undefined) {
      throw new Error('no ipcMain.handle registration captured for core:start');
    }
    void Promise.resolve(startRegistration.handler(TRUSTED_EVENT)).catch(() => undefined); // start stays pending — state `starting`
    await waitFor(
      () => probe.supervisorConstructions > 0,
      1000,
      'core:start to construct the supervisor (starting-state precondition)',
    );

    const beforeQuit = appEventHandler('before-quit');
    beforeQuit({ preventDefault: vi.fn() });
    await waitFor(
      () => probe.quitCount > 0,
      5000,
      'the quit teardown to settle and reach app.quit()',
    );

    expect(
      probe.forceStopCalls,
      'S5-3/TC-05-22 (issue #9): the quit teardown must FORCE-stop a `starting` core — ' +
        'a graceful stop is refused by the state machine outside `running`, so today the ' +
        'pending child is orphaned and T is never deleted (FR-19/FR-23, data-flows §2.1 step 9)',
    ).toBeGreaterThan(0);

    // Structural twin (TC-06-15 style): the deps object routes stopCore through
    // handleStopForce — the tray Stop action (stopTunnel) keeps handleStop.
    expect(existsSync(INDEX_SOURCE), 'src/main/index.ts must exist').toBe(true);
    const source = stripComments(readFileSync(INDEX_SOURCE, 'utf8'));
    const deps = callArguments(source, /createWindowLifecycle\s*\(/);
    expect(
      deps.includes('stopCore'),
      'the createWindowLifecycle({…}) deps object exposes stopCore (M1-23b, GREEN today)',
    ).toBe(true);
    const stopCoreAt = deps.indexOf('stopCore');
    const restoreAt = deps.indexOf('restoreProxy', stopCoreAt);
    const stopCoreSegment = deps.slice(stopCoreAt, restoreAt > 0 ? restoreAt : deps.length);
    expect(
      /handleStopForce\s*\(/.test(stopCoreSegment),
      'S5-3 structural/TC-05-22: createWindowLifecycle deps must route stopCore through ' +
        'handleStopForce( (the quit teardown is the force-stop route; stopTunnel keeps the ' +
        'graceful handleStop() — src/main/index.ts:552-556 today)',
    ).toBe(true);
  }, 15_000);
});

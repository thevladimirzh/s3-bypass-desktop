/**
 * M1-16 (RED) — status exposure, main side: every supervisor transition must
 * reach the renderer-facing `status:changed` push, `core:start`/`core:stop`/
 * `status:get` must be backed by real wiring (no more placeholders), and the
 * tray must mirror the state as TEXT (never color-only).
 *
 * Test plan IDs: TC-03-15 (`status.exposure.rendererReceivesAllTransitions`,
 * main/push half + structural sibling `status.exposure.mainWiringBacksCoreStartStopAndGet`),
 * TC-03-16 (`status.exposure.rendererReceivesLastErrorString`, payload half),
 * TC-02-03 siblings (`supervisor.startControl.noProfileMainGuardNeverConstructsSupervisor`,
 * `supervisor.startControl.delegatesToSupervisorWithResolvedBinaryPathAndConfig`),
 * TC-05-13 (`tray.stateNotConveyedByColorOnly`, structural) — docs/qa/m1-test-plan.md
 * §2/§3/§5, the M1-16 row in §10, allocations DV-28 in §14. The renderer halves
 * live in `tests/unit/status-exposure.test.tsx`.
 *
 * Spec sources: docs/analysis/data-flows.md flow (b) §2.1/§2.3 (step 2/5/7
 * "push status:changed", one push per transition, `lastError` retained from
 * `crashed` and cleared only on successful `→ running`), §4.2 (`status:get` /
 * `status:changed` rows, `StatusSnapshot { state, lastError, socksPort }`),
 * §5 (startup path `profile:get → status:get → render`); docs/analysis/
 * requirements.md F4 (FR-25, FR-26, FR-27 — the ≤1 s budget's process-event
 * half is supervisor-side TC-NFR3-02, M1-14; this batch pins only the IPC hop,
 * so no duplicate timing ID, §14 DV-28), FR-12 (no-profile Start guard),
 * FR-24/FR-41 (tray mirror as text + tooltip), FR-63 (push, never polled);
 * docs/product/stories/US-03-status.md AC-03.1/AC-03.4, US-05 AC-05.4;
 * docs/plans/m1-mvp.md M1-16 → M1-17.
 *
 * Layer: L1 unit, pure node (strategy §2) — the supervisor arrives as an
 * INJECTED factory, so nothing here spawns a process (§1 synthetic-only), and
 * the structural cases scan `src/main/index.ts` source (precedent TC-06-15 /
 * TC-IPC-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-17 (declared here — header-contract style, cf. DV-09/DV-16/
 * DV-23/DV-25; any deviation requires an upstream spec note first, strategy
 * §5.2; full types mirrored in `tests/helpers/core-wiring-stub.ts`):
 *
 *  module  : src/main/core-wiring.ts   — pure node, NO electron import
 *            (the Electron fan-out stays in index.ts: `broadcastStatus`,
 *            mirroring the TC-06-14 log-collector boundary rule)
 *  export  : createCoreWiring(deps: CoreWiringDeps): CoreWiring
 *
 *  CoreWiringDeps {            // all injected by src/main/index.ts
 *    createSupervisor(options: SupervisorOptions): CoreSupervisor
 *        // the M1-15 factory (DV-23) — the spawn-free test seam
 *    binaryPath: string        // resolved by the HOST (S4-5 CORE_BINARY_PATH
 *                              // dev override is index.ts's business);
 *                              // pass-through, never re-derived here
 *    loadConfig(): string | null
 *        // stored-profile JSON (data-flows (b) step 0/3); null = no profile;
 *        // read on every handleStart so a re-import is picked up (AC-01.7)
 *    logSink(line: CoreLogLine): void
 *        // raw child lines → main's single redaction entry point (FR-47,
 *        // M1-19 note: supervisor logSink → collector wiring lands here)
 *    broadcast(snapshot: StatusSnapshot /* §4.2 ipc *\/): void
 *        // main's broadcastStatus → webContents.send('status:changed', …)
 *  }
 *  CoreWiring {
 *    handleStart(): Promise<OperationResult>   // body of core:start
 *    handleStop(): Promise<OperationResult>    // body of core:stop
 *    getStatus(): StatusSnapshot               // answer of status:get (§4.2)
 *  }
 *
 *  Behavior pinned below (data-flows (b), §2.3, FR-12/25/26/63):
 *  1. createCoreWiring(deps) has NO side effects — the factory is not called
 *     until a handleStart() that finds a profile (nothing spawns at import).
 *  2. handleStart(): config = loadConfig(); when null → { ok:false, error }
 *     with an NFR-5 triple (non-empty code/title/cause/nextStep, no stack),
 *     the factory is NOT called, nothing broadcasts, getStatus() stays
 *     `stopped` (step 0 / FR-12; errors.md documents NO code for this case —
 *     only the triple shape is pinned, no code may be invented, DV-28).
 *     With a profile → createSupervisor({ binaryPath: deps.binaryPath, config,
 *     onStateChange, logSink }) and the supervisor's start() result is
 *     returned VERBATIM ({ok:true} | {ok:false, error}) — wording lives in the
 *     M1-15 supervisor, never duplicated here.
 *  3. Every onStateChange snapshot is broadcast SYNCHRONOUSLY, exactly once,
 *     as the §4.2 StatusSnapshot { state, lastError, socksPort: 10808 } — the
 *     IPC hop of FR-26/NFR-3 (the ≤1 s process-event budget itself stays
 *     supervisor-side TC-NFR3-02, M1-14 — no duplicate timing ID).
 *  4. handleStop(): without a constructed supervisor → { ok:true } (the §4.2
 *     idempotent no-op the current placeholder promises); with one → stop()
 *     called once, result verbatim.
 *  5. getStatus(): initially { stopped, null, 10808 }; afterwards the latest
 *     broadcast snapshot (status:get answers the CURRENT status, FR-25).
 *  6. Wiring in src/main/index.ts (structural — precedent TC-06-15): the
 *     module is constructed with createCoreWiring(, the `core:start` body
 *     delegates to handleStart( (the inline E-IO-004 placeholder of M1-07 is
 *     gone), `core:stop` → handleStop(, `status:get` → getStatus(, and the
 *     existing broadcastStatus `send('status:changed'|STATUS_CHANGED)` push
 *     remains. assertTrustedSender-first is deliberately NOT re-pinned here
 *     (TC-IPC-10 re-scans every handler), and the allowlist/preload surface
 *     is untouched (checked: no new channel — tests/unit/ipc-contract.test.ts
 *     needs no extension, §14 DV-28).
 *  7. Tray mirror (TC-05-13, structural, AC-05.4/NFR-5/FR-24): index.ts builds
 *     the tray menu from the pinned buildTrayMenu(state) model and sets the
 *     tooltip from the model's statusText — state reaches the tray as TEXT,
 *     never color-only. (The Electron tray wiring deliberately lands with
 *     M1-17 — src/main/window-lifecycle.ts header: index.ts owns it.)
 *
 * RED status: ABSENCE RED — `src/main/core-wiring.ts` does not exist, so every
 * behavioral case fails through `makeRig()` (non-literal dynamic import with a
 * contract-named error, see the helper header); the structural cases fail on
 * the absent wiring/tray call sites. Strategy §5.2: legitimate
 * first-test-of-a-subsystem failure; do not weaken, skip, or delete.
 * Synthetic data only: fake binary path, fake stored profile, reserved
 * endpoint values, no live network, no real process (§1).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import type { OperationResult, StatusSnapshot as IpcStatusSnapshot } from '../../src/shared/ipc';
import type { AppError, StatusSnapshot } from '../../src/shared/status-machine';
import type {
  CoreLogLine,
  CoreSupervisor,
  SupervisorOptions,
} from '../helpers/core-supervisor-stub';
import { type CoreWiring, loadCoreWiring } from '../helpers/core-wiring-stub';
import { stripComments } from '../helpers/log-collector-stub';

/** Synthetic core executable — the wiring never resolves or spawns it (§1). */
const BINARY_PATH = '/opt/s3-bypass/fedarisha-xray-core';

/** Synthetic stored profile JSON — `loadConfig()`'s documented non-null answer. */
const CONFIG_JSON = '{"outbounds":[{"protocol":"fedarisha","settings":{}}]}';

/** errors.md §3 E-CORE-001 — the crash triple the supervisor captures (M1-15). */
const E_CORE_001: AppError = {
  code: 'E-CORE-001',
  title: 'The tunnel stopped unexpectedly',
  cause: 'The tunnel engine exited with code 3: fake-core: simulated fatal storage failure.',
  nextStep: 'Click Start to try again; if it repeats, check the Logs view.',
};

/** errors.md §2 E-IO-004 — a start pre-check failure result (M1-15, FR-14). */
const E_IO_004: AppError = {
  code: 'E-IO-004',
  title: 'Core binary check failed',
  cause: 'The tunnel engine (Xray-core) was not found in the app installation.',
  nextStep: 'Reinstall the app.',
};

/**
 * One wiring instance with everything observed: the factory record (what
 * supervisor options the wiring resolved), the broadcasts it pushed, the raw
 * log lines it forwarded, and the supervisor spies it called.
 */
interface Rig {
  readonly wiring: CoreWiring;
  readonly factory: ReturnType<typeof vi.fn>;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly broadcasts: IpcStatusSnapshot[];
  readonly logLines: CoreLogLine[];
  readonly supervisorOptions: SupervisorOptions[];
  /** Feed one supervisor transition through the captured onStateChange. */
  emit(snapshot: StatusSnapshot): void;
}

async function makeRig(
  config: string | null = CONFIG_JSON,
  startResult: OperationResult = { ok: true },
  stopResult: OperationResult = { ok: true },
): Promise<Rig> {
  const broadcasts: IpcStatusSnapshot[] = [];
  const logLines: CoreLogLine[] = [];
  const supervisorOptions: SupervisorOptions[] = [];
  const start = vi.fn(async (): Promise<OperationResult> => startResult);
  const stop = vi.fn(async (): Promise<OperationResult> => stopResult);
  const supervisor: CoreSupervisor = { start, stop, isRunning: () => false };
  const factory = vi.fn((options: SupervisorOptions): CoreSupervisor => {
    supervisorOptions.push(options);
    return supervisor;
  });

  const { createCoreWiring } = await loadCoreWiring();
  const wiring = createCoreWiring({
    createSupervisor: factory,
    binaryPath: BINARY_PATH,
    loadConfig: () => config,
    logSink: (line) => {
      logLines.push(line);
    },
    broadcast: (snapshot) => {
      broadcasts.push(snapshot);
    },
  });

  return {
    wiring,
    factory,
    start,
    stop,
    broadcasts,
    logLines,
    supervisorOptions,
    emit(snapshot) {
      const captured = supervisorOptions.at(-1);
      if (captured === undefined) {
        throw new Error(
          'test rig misuse: no supervisor was constructed yet — call handleStart() first ' +
            'so the wiring registers its onStateChange subscription',
        );
      }
      captured.onStateChange(snapshot);
    },
  };
}

// ————————————————————————————————————————————————————————————————
// Structural scan of src/main/index.ts (precedent TC-06-15 / TC-IPC-10).
// ————————————————————————————————————————————————————————————————

const INDEX_SOURCE = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));

/**
 * The callback body of `ipcMain.handle('<channel>', …)` by brace matching —
 * copied from the TC-06-15 precedent (log-buffer.test.ts) so both wiring scans
 * read handlers the same way.
 */
function handlerBody(source: string, channel: string): string {
  const at = source.indexOf(`handle('${channel}'`);
  if (at < 0) return '';
  const arrow = source.indexOf('=>', at);
  const open = source.indexOf('{', arrow);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

describe('status exposure — transitions reach the status:changed push (FR-26/FR-63, §4.2)', () => {
  it('status.exposure.rendererReceivesAllTransitions', async () => {
    // TC-03-15 main/push half: one synchronous broadcast per supervisor
    // transition, in emission order, each payload the EXACT §4.2 StatusSnapshot
    // ({ state, lastError, socksPort }) — this is the IPC hop whose
    // process-event budget (≤1 s) is already pinned supervisor-side by
    // TC-NFR3-02 (M1-14); no timing duplicate here (DV-28).
    const rig = await makeRig();
    await rig.wiring.handleStart();

    const CYCLE: StatusSnapshot[] = [
      { state: 'starting', lastError: null },
      { state: 'running', lastError: null },
      { state: 'stopping', lastError: null },
      { state: 'stopped', lastError: null },
      { state: 'starting', lastError: null },
      { state: 'crashed', lastError: E_CORE_001 },
    ];
    for (const snapshot of CYCLE) {
      // No await, no timer: the broadcast must be recorded by the time
      // onStateChange returns (FR-63 push; a deferred/async push fails here).
      rig.emit(snapshot);
    }

    expect(
      rig.broadcasts,
      'data-flows §2.3: EVERY transition emits exactly one status:changed push, ' +
        'in order, each carrying the full §4.2 StatusSnapshot (state + lastError + socksPort)',
    ).toEqual(
      CYCLE.map((snapshot) => ({
        state: snapshot.state,
        lastError: snapshot.lastError,
        socksPort: DEFAULT_SOCKS_PORT,
      })),
    );

    expect(
      rig.wiring.getStatus(),
      'FR-25: status:get answers the CURRENT status — the latest pushed snapshot',
    ).toEqual({
      state: 'crashed',
      lastError: E_CORE_001,
      socksPort: DEFAULT_SOCKS_PORT,
    });
  });

  it('status.exposure.rendererReceivesLastErrorString', async () => {
    // TC-03-16 payload half: the crash's last error string crosses the push
    // UNCHANGED (the exact E-CORE-001 triple, AC-03.4), is retained across the
    // recovery `starting` (§2.3), and is cleared only on a successful
    // `→ running` (never by stop/stopped).
    const rig = await makeRig();
    await rig.wiring.handleStart();

    rig.emit({ state: 'starting', lastError: null });
    rig.emit({ state: 'running', lastError: null });
    rig.emit({ state: 'crashed', lastError: E_CORE_001 });
    rig.emit({ state: 'starting', lastError: E_CORE_001 });
    rig.emit({ state: 'running', lastError: null });

    expect(
      rig.broadcasts.map((push) => push.lastError),
      '§2.3: lastError retained from `crashed` through the recovery start, ' +
        'cleared only on successful `→ running` — visible in every push payload',
    ).toEqual([null, null, E_CORE_001, E_CORE_001, null]);

    expect(
      rig.broadcasts[2],
      'TC-03-16: the crashed push carries the FULL NFR-5 triple the renderer displays ' +
        '(errors.md E-CORE-001, cause naming the exit code)',
    ).toEqual({
      state: 'crashed',
      lastError: E_CORE_001,
      socksPort: DEFAULT_SOCKS_PORT,
    });
  });

  it('status.exposure.mainWiringBacksCoreStartStopAndGet', () => {
    // TC-03-15 structural sibling (TC-06-15 style): src/main/index.ts must
    // actually WIRE the exposure path — construct the glue, delegate the three
    // handlers to it, and keep the existing status:changed send. Without this
    // scan the module could exist while the renderer keeps receiving the M1-07
    // placeholder answers forever.
    expect(existsSync(INDEX_SOURCE), 'src/main/index.ts must exist').toBe(true);
    const source = stripComments(readFileSync(INDEX_SOURCE, 'utf8'));

    expect(
      /createCoreWiring\s*\(/.test(source),
      'M1-17/data-flows (b): main constructs the status wiring (createCoreWiring) — ' +
        'supervisor → IPC glue lands with the GREEN task',
    ).toBe(true);

    const startBody = handlerBody(source, 'core:start');
    expect(
      startBody.length,
      'src/main/index.ts registers core:start (§4.2 allowlist)',
    ).toBeGreaterThan(0);
    expect(
      /handleStart\s*\(/.test(startBody),
      'M1-17/FR-13: core:start must delegate to the wiring (handleStart) — the inline ' +
        'E-IO-004 placeholder from M1-07 must go',
    ).toBe(true);
    expect(
      startBody.includes('E-IO-004'),
      'the inline E-IO-004 placeholder return must be gone from core:start — start ' +
        'failures come back from the supervisor through handleStart (M1-15/M1-17)',
    ).toBe(false);

    const stopBody = handlerBody(source, 'core:stop');
    expect(
      stopBody.length,
      'src/main/index.ts registers core:stop (§4.2 allowlist)',
    ).toBeGreaterThan(0);
    expect(
      /handleStop\s*\(/.test(stopBody),
      'M1-17: core:stop must delegate to the wiring (handleStop) — the {ok:true} ' +
        'placeholder must go',
    ).toBe(true);

    const statusBody = handlerBody(source, 'status:get');
    expect(
      statusBody.length,
      'src/main/index.ts registers status:get (§4.2 allowlist)',
    ).toBeGreaterThan(0);
    expect(
      /getStatus\s*\(/.test(statusBody),
      'FR-25: status:get must answer the wiring’s live getStatus() — the frozen ' +
        'module-const currentStatus placeholder must go',
    ).toBe(true);

    expect(
      /send\(\s*(?:['"]status:changed['"]|STATUS_CHANGED\b)/.test(source),
      'FR-63: main keeps pushing status:changed through webContents.send (the ' +
        'broadcastStatus path M1-06/07 established)',
    ).toBe(true);
  });
});

describe('start/stop control — main-side guards and delegation (FR-12, data-flows (b) step 0)', () => {
  it('supervisor.startControl.noProfileMainGuardNeverConstructsSupervisor', async () => {
    // TC-02-03 main half: with no stored profile, Start is refused BEFORE any
    // supervisor exists (step 0 guard) — no spawn, no status transition, no
    // push — and the refusal is an NFR-5 triple. errors.md documents NO code
    // for this case (FR-12 pins only the renderer hint), so only the triple
    // SHAPE is pinned here: no code may be invented (DV-19/DV-28).
    const rig = await makeRig(null);

    const result = await rig.wiring.handleStart();

    expect(result.ok, 'FR-12/step 0: Start without a profile must fail, not spawn').toBe(false);
    if (!result.ok) {
      for (const field of ['code', 'title', 'cause', 'nextStep'] as const) {
        expect(
          typeof result.error[field],
          `no-profile refusal must be an NFR-5 triple — error.${field} must be a string`,
        ).toBe('string');
        expect(
          result.error[field].length,
          `no-profile refusal must be an NFR-5 triple — error.${field} must not be empty`,
        ).toBeGreaterThan(0);
      }
      expect(
        JSON.stringify(result.error),
        'the refusal must not leak a stack trace (FR-48 / NFR-5)',
      ).not.toMatch(/\n\s+at\s+\S+\(/);
    }

    expect(
      rig.factory,
      'step 0: no profile → the supervisor is never constructed (nothing spawns)',
    ).not.toHaveBeenCalled();
    expect(rig.broadcasts, 'state stays stopped — no transition, no push (step 0)').toEqual([]);
    expect(
      rig.wiring.getStatus(),
      'status:get keeps answering the unchanged stopped snapshot',
    ).toEqual({ state: 'stopped', lastError: null, socksPort: DEFAULT_SOCKS_PORT });
  });

  it('supervisor.startControl.delegatesToSupervisorWithResolvedBinaryPathAndConfig', async () => {
    // TC-02-03 delegation sibling: stop-before-start is the §4.2 idempotent
    // {ok:true} no-op (the current placeholder's promise) with nothing
    // constructed; with a profile, handleStart builds the supervisor with the
    // HOST-resolved binaryPath + stored config + the log sink, and both
    // handler results pass through verbatim (all wording stays in M1-15).
    const rig = await makeRig();

    // stop before any start — idempotent no-op, supervisor never built.
    expect(await rig.wiring.handleStop(), '§4.2 core:stop payload while nothing runs').toEqual({
      ok: true,
    });
    expect(rig.factory, 'stop before start must not construct a supervisor').not.toHaveBeenCalled();

    const startResult = await rig.wiring.handleStart();
    expect(startResult, 'handleStart returns the supervisor result verbatim ({ok:true})').toEqual({
      ok: true,
    });
    expect(rig.start, 'handleStart calls supervisor.start() exactly once').toHaveBeenCalledTimes(1);

    expect(rig.supervisorOptions, 'the supervisor is built inside handleStart').toHaveLength(1);
    const options = rig.supervisorOptions[0];
    expect(options, 'SupervisorOptions recorded by the factory').toBeDefined();
    if (options !== undefined) {
      expect(
        options.binaryPath,
        'binaryPath is resolved by the HOST (index.ts, S4-5) and passed through untouched — ' +
          'the wiring must not invent its own path',
      ).toBe(BINARY_PATH);
      expect(options.config, 'the stored profile JSON reaches the supervisor unchanged').toBe(
        CONFIG_JSON,
      );
      expect(
        typeof options.onStateChange,
        'the wiring registers itself as onStateChange — the push source (FR-63)',
      ).toBe('function');
      expect(
        typeof options.logSink,
        'SupervisorOptions requires the raw log sink (M1-15) — the wiring forwards ' +
          "main's collector (M1-19 note: sink → collector lands here)",
      ).toBe('function');
      options.logSink({ stream: 'stderr', text: 'synthetic core line' });
      expect(
        rig.logLines,
        'the sink the supervisor was given must reach the injected logSink unchanged',
      ).toEqual([{ stream: 'stderr', text: 'synthetic core line' }]);
    }

    const stopResult = await rig.wiring.handleStop();
    expect(stopResult, 'handleStop returns the supervisor result verbatim').toEqual({ ok: true });
    expect(rig.stop, 'handleStop calls supervisor.stop() exactly once').toHaveBeenCalledTimes(1);

    // A failed start (documented errors.md triple from the M1-15 pre-checks)
    // must cross untouched as { ok:false, error } — §4.2 core:start payload.
    const failing = await makeRig(CONFIG_JSON, { ok: false, error: E_IO_004 });
    expect(
      await failing.wiring.handleStart(),
      '§4.2: start failure passes through verbatim',
    ).toEqual({ ok: false, error: E_IO_004 });
  });
});

describe('tray status mirror (FR-24, FR-41, AC-05.4 — NFR-5 never color-only)', () => {
  it('tray.stateNotConveyedByColorOnly', () => {
    // TC-05-13 structural: the tray must convey state as TEXT — menu items
    // from the pinned buildTrayMenu(state) model plus the FR-24 tooltip
    // mirror. The Electron tray wiring does not exist yet (M1-23's wiring half
    // is declared to land in index.ts with the supervisor wiring task), so this
    // fails for exactly that reason. window-lifecycle.test.ts TC-05-04 pins the
    // model's texts; this pins that index.ts actually uses it.
    expect(existsSync(INDEX_SOURCE), 'src/main/index.ts must exist').toBe(true);
    const source = stripComments(readFileSync(INDEX_SOURCE, 'utf8'));

    expect(
      /buildTrayMenu\s*\(/.test(source),
      'AC-05.4/NFR-5: the tray menu template is built from the pinned ' +
        'buildTrayMenu(state) model — status as TEXT (Running/Stopped/Core crashed), ' +
        'never color-only (FR-41)',
    ).toBe(true);
    expect(
      /\.setToolTip\s*\(/.test(source),
      'FR-24/AC-03.7: the state is mirrored in the tray tooltip (menu text + tooltip)',
    ).toBe(true);
    expect(
      /statusText\b/.test(source),
      'FR-24/FR-41: index.ts feeds the model statusText to the tray (tooltip/menu) — ' +
        'the tray never derives state from an icon alone',
    ).toBe(true);
  });
});

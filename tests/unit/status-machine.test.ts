/**
 * M1-04 (RED) — core status machine, executable specification.
 *
 * Test plan IDs: TC-03-01, TC-03-02 (machine half), TC-03-03, TC-03-05,
 * TC-03-10, TC-03-11, TC-03-12, TC-03-17, TC-03-18, TC-03-19, TC-03-20,
 * TC-03-21 (docs/qa/m1-test-plan.md §3; the last five are the plan M1-04
 * explicit cases — legal cycle, starting → crashed, purity, typing,
 * last-error retention — annotated in M1-27b batch C, D-08).
 * Spec sources: docs/analysis/data-flows.md §2.3 (transition table + guards,
 * "guards tested in M1-04"), docs/analysis/requirements.md FR-17, FR-20,
 * FR-25..FR-28, docs/product/stories/US-03-status.md AC-03.2..AC-03.6.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-05 (developer GREEN task) — expected API of
 * `src/shared/status-machine.ts` (module intentionally does not exist yet;
 * this file must fail with "module not found" until it does):
 *
 *   export type CoreState =
 *     | 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
 *   export type CoreEvent =
 *     | 'start' | 'ready' | 'stop' | 'stopped' | 'crash';
 *   export interface StatusSnapshot {
 *     state: CoreState;
 *     lastError: AppError | null;   // AppError = { code, title, cause, nextStep }
 *   }                               // (data-flows §4.2; re-export or define here)
 *   export type TransitionResult =
 *     | { ok: true;  snapshot: StatusSnapshot }
 *     | { ok: false; error: AppError };   // illegal transition — typed error result
 *
 *   export const INITIAL_STATUS: StatusSnapshot;  // { state: 'stopped', lastError: null }
 *   export function transition(
 *     snapshot: StatusSnapshot,
 *     event: CoreEvent,
 *     crashError?: AppError,        // detail for event 'crash' (FR-17)
 *   ): TransitionResult;            // pure: never mutates `snapshot`
 *
 * Legal transitions (data-flows §2.3 — everything else is an error result):
 *   stopped  + start   → starting
 *   starting + ready   → running      (clears lastError — "cleared only on
 *                                      successful → running", §2.3)
 *   starting + crash   → crashed      (FR-20 start timeout / spawn failure)
 *   running  + stop    → stopping
 *   running  + crash   → crashed      (FR-17 unexpected exit)
 *   stopping + stopped → stopped      (child exit observed, exit code ignored)
 *   crashed  + start   → starting     (manual recovery, AC-03.6 / FR-28;
 *                                      NO auto-restart: no other event may
 *                                      leave `crashed`)
 *
 * Guards: single-spawn — start in starting/running/stopping rejected (FR-18,
 * AC-02.7); stop ONLY in running (§2.3 guard 2: Stop in stopped/crashed and
 * outside `running` rejected as no-op); `crashed → running` illegal without
 * passing through `starting` (§2.3).
 * lastError: set to the crash event's error on every crash; retained across
 * the recovery `start`; the most recent crash wins (FR-27); cleared only on
 * successful `→ running`.
 * Errors returned for illegal transitions are AppError-shaped, non-empty
 * `code`, and never contain a raw stack trace (FR-48 / NFR-5).
 *
 * RED status: ABSENCE RED — `src/shared/status-machine` does not exist yet.
 * Do not weaken, skip, or delete anything here; M1-05 implements the module.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type CoreEvent,
  type CoreState,
  INITIAL_STATUS,
  type StatusSnapshot,
  transition,
  type TransitionResult,
} from '../../src/shared/status-machine';

/** Structural shape of AppError per data-flows §4.2 (NFR-5 triple + code). */
interface AppErrorShape {
  code: string;
  title: string;
  cause: string;
  nextStep: string;
}

function expectOk(result: TransitionResult): StatusSnapshot {
  if (!result.ok) {
    throw new Error(
      `expected a successful transition, got error result: ${JSON.stringify(result.error)}`,
    );
  }
  return result.snapshot;
}

function expectRejected(result: TransitionResult, context: string): AppErrorShape {
  expect(result.ok, `${context}: expected an error result for an illegal transition`).toBe(false);
  if (result.ok) {
    throw new Error('unreachable: expected the error branch of TransitionResult');
  }
  expect(typeof result.error.code, `${context}: error.code must be a string`).toBe('string');
  expect(result.error.code.length, `${context}: error.code must not be empty`).toBeGreaterThan(0);
  expect(
    JSON.stringify(result.error),
    `${context}: rejected-transition error must not contain a stack trace`,
  ).not.toMatch(/\n\s+at\s+\S+\(/);
  return result.error;
}

const startError: AppErrorShape = {
  code: 'E-CORE-002',
  title: 'Core did not become ready',
  cause: 'no listener on 127.0.0.1:10808 within 10 s',
  nextStep: 'Check the logs for details.',
};

const exitError: AppErrorShape = {
  code: 'E-CORE-001',
  title: 'Core exited unexpectedly',
  cause: 'core process exited with code 1',
  nextStep: 'Check the logs for details.',
};

const spawnError: AppErrorShape = {
  code: 'E-CORE-003',
  title: 'Core could not be started',
  cause: 'spawn failed',
  nextStep: 'Check the logs for details.',
};

describe('status.initialState (TC-03-01, AC-03.3)', () => {
  it('status.initialState.isStopped', () => {
    expect(INITIAL_STATUS.state).toBe('stopped');
    expect(INITIAL_STATUS.lastError).toBeNull();
  });
});

describe('legal lifecycle (plan M1-04: stopped → starting → running → stopped)', () => {
  it('status.afterStart.passesThroughStartingToReachRunning', () => {
    // TC-03-02 machine half: Start moves stopped → starting; readiness moves
    // starting → running (the ≤1 s timing half is pinned by TC-NFR3-02).
    let snapshot = expectOk(transition(INITIAL_STATUS, 'start'));
    expect(snapshot.state).toBe('starting');
    snapshot = expectOk(transition(snapshot, 'ready'));
    expect(snapshot.state).toBe('running');
  });

  it('status.lifecycle.fullCycleReturnsToStoppedThroughStopping (TC-03-17)', () => {
    // plan M1-04 explicit legal sequence incl. running → stopping → stopped
    // (data-flows §2.3; child exit observed while stopping, exit code ignored).
    let snapshot = expectOk(transition(INITIAL_STATUS, 'start'));
    expect(snapshot.state).toBe('starting');
    snapshot = expectOk(transition(snapshot, 'ready'));
    expect(snapshot.state).toBe('running');
    snapshot = expectOk(transition(snapshot, 'stop'));
    expect(snapshot.state).toBe('stopping');
    snapshot = expectOk(transition(snapshot, 'stopped'));
    expect(snapshot.state).toBe('stopped');
    expect(snapshot.lastError).toBeNull();
  });

  it('status.startFailure.crashFromStartingGoesCoreCrashedWithLastError (TC-03-18)', () => {
    // plan M1-04 explicit `starting → crashed` (spawn failure / start timeout,
    // FR-20 / AC-03.4).
    const starting = expectOk(transition(INITIAL_STATUS, 'start'));
    const snapshot = expectOk(transition(starting, 'crash', startError));
    expect(snapshot.state).toBe('crashed');
    expect(snapshot.lastError).toEqual(startError);
  });

  it('status.unexpectedExit.becomesCoreCrashedWithLastError', () => {
    // TC-03-03, AC-03.4 / FR-17: unexpected exit while running → crashed with
    // lastError retained.
    const starting = expectOk(transition(INITIAL_STATUS, 'start'));
    const running = expectOk(transition(starting, 'ready'));
    const snapshot = expectOk(transition(running, 'crash', exitError));
    expect(snapshot.state).toBe('crashed');
    expect(snapshot.lastError).toEqual(exitError);
  });

  it('status.startFromCoreCrashed.recoversToRunning', () => {
    // TC-03-05, AC-03.6 / FR-28: crashed + start → starting (manual recovery,
    // no auto-restart), then readiness → running.
    const starting = expectOk(transition(INITIAL_STATUS, 'start'));
    const running = expectOk(transition(starting, 'ready'));
    const crashed = expectOk(transition(running, 'crash', exitError));
    expect(crashed.state).toBe('crashed');

    const restarting = expectOk(transition(crashed, 'start'));
    expect(restarting.state).toBe('starting');
    const recovered = expectOk(transition(restarting, 'ready'));
    expect(recovered.state).toBe('running');
  });
});

describe('status.machine.rejectsInvalidTransitions (TC-03-10, data-flows §2.3 guards)', () => {
  // label, from, event, spec reason for illegality
  const illegal: Array<[string, CoreState, CoreEvent, string]> = [
    [
      'CrashedReady',
      'crashed',
      'ready',
      'crashed → running is illegal; recovery must pass through starting (§2.3)',
    ],
    [
      'CrashedStop',
      'crashed',
      'stop',
      'Stop is accepted only from running; no-op in crashed rejected (§2.3 guard 2)',
    ],
    ['StoppedReady', 'stopped', 'ready', 'cannot reach running while skipping starting (§2.3)'],
    ['StoppedStop', 'stopped', 'stop', 'Stop in stopped is a rejected no-op (§2.3 guard 2)'],
    [
      'RunningStart',
      'running',
      'start',
      'double-start rejected — single child (FR-18, AC-02.7, §2.3 guard 1)',
    ],
    [
      'StartingStart',
      'starting',
      'start',
      'double-start during starting rejected — single child (§2.3 guard 1)',
    ],
    [
      'RunningReady',
      'running',
      'ready',
      'duplicate readiness; running → running is not a transition (§2.3)',
    ],
    ['StartingStop', 'starting', 'stop', 'only running → stopping accepts Stop (§2.3 guard 2)'],
    [
      'StoppingStart',
      'stopping',
      'start',
      'start while shutting down rejected — single-spawn guard (§2.3)',
    ],
    [
      'StoppingStop',
      'stopping',
      'stop',
      'repeated Stop rejected — only running → stopping accepts Stop (§2.3 guard 2)',
    ],
  ];

  it.each(illegal)('status.machine.rejects%s', (label, from, event, reason) => {
    const snapshot: StatusSnapshot = { ...INITIAL_STATUS, state: from };
    const before: StatusSnapshot = { ...snapshot };
    const result = transition(snapshot, event);
    expectRejected(result, `${label}: ${reason}`);
    // Rejected transition is a no-op: input snapshot untouched (pure reducer).
    expect(snapshot).toEqual(before);
  });
});

describe('lastError lifecycle (FR-17, FR-27, data-flows §2.3)', () => {
  it('status.lastError.mostRecentCrashWins', () => {
    // TC-03-11, FR-27: on two consecutive crashes the most recent error wins.
    let snapshot = expectOk(
      transition(
        expectOk(transition(expectOk(transition(INITIAL_STATUS, 'start')), 'ready')),
        'crash',
        exitError,
      ),
    );
    expect(snapshot.lastError).toEqual(exitError);

    // Recovery attempt that fails again at spawn time.
    snapshot = expectOk(transition(snapshot, 'start'));
    snapshot = expectOk(transition(snapshot, 'crash', spawnError));
    expect(snapshot.state).toBe('crashed');
    expect(snapshot.lastError).toEqual(spawnError);
  });

  it('status.lastErrorRetention.startDoesNotClearUntilNewError', () => {
    // TC-03-12: a crash sets lastError; the recovery start (crashed → starting)
    // retains it — start itself never clears the error.
    let snapshot = expectOk(
      transition(
        expectOk(transition(expectOk(transition(INITIAL_STATUS, 'start')), 'ready')),
        'crash',
        exitError,
      ),
    );
    expect(snapshot.lastError).toEqual(exitError);

    snapshot = expectOk(transition(snapshot, 'start'));
    expect(snapshot.state).toBe('starting');
    expect(snapshot.lastError).toEqual(exitError);
  });

  it('status.lastErrorRetention.clearedOnlyOnSuccessfulRunning (TC-03-21)', () => {
    // data-flows §2.3: "lastError retained from crashed, cleared only on
    // successful → running". Not cleared by stop/stopped afterwards either.
    let snapshot = expectOk(
      transition(
        expectOk(transition(expectOk(transition(INITIAL_STATUS, 'start')), 'ready')),
        'crash',
        exitError,
      ),
    );
    snapshot = expectOk(transition(snapshot, 'start'));
    expect(snapshot.lastError).toEqual(exitError);

    snapshot = expectOk(transition(snapshot, 'ready'));
    expect(snapshot.state).toBe('running');
    expect(snapshot.lastError).toBeNull();

    snapshot = expectOk(transition(snapshot, 'stop'));
    expect(snapshot.lastError).toBeNull();
    snapshot = expectOk(transition(snapshot, 'stopped'));
    expect(snapshot.state).toBe('stopped');
    expect(snapshot.lastError).toBeNull();
  });
});

describe('transition purity (plan M1-04: pure reducer)', () => {
  it('status.machine.pureReducerLeavesInputSnapshotUnchanged (TC-03-19)', () => {
    const snapshot: StatusSnapshot = {
      state: 'running',
      lastError: null,
    };
    const before: StatusSnapshot = { ...snapshot };

    expectOk(transition(snapshot, 'crash', exitError));
    expect(snapshot).toEqual(before);

    expectRejected(transition(snapshot, 'ready'), 'purity: rejected call');
    expect(snapshot).toEqual(before);
  });
});

describe('typing contract (string-literal unions make misuse a compile error)', () => {
  it('status.types.statesAndEventsAreExactStringLiteralUnions (TC-03-20)', () => {
    expectTypeOf<CoreState>().toEqualTypeOf<
      'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'
    >();
    expectTypeOf<CoreEvent>().toEqualTypeOf<'start' | 'ready' | 'stop' | 'stopped' | 'crash'>();
    expectTypeOf<TransitionResult['ok']>().toEqualTypeOf<boolean>();
  });
});

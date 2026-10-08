/**
 * Core lifecycle status machine — a pure reducer over `StatusSnapshot`.
 *
 * Spec: docs/analysis/data-flows.md §2.3 (transition table + guards),
 * docs/analysis/requirements.md FR-17, FR-20, FR-25..FR-28,
 * docs/analysis/data-flows.md §4.2 (`AppError` triple carried as data).
 *
 * Pure module: no Electron imports, no side effects, never mutates the input
 * snapshot — safe to use from main, preload and renderer alike.
 */

/** Internal lifecycle states (data-flows §2.3). */
export type CoreState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

/** Lifecycle events fed to the machine: user actions plus process observations. */
export type CoreEvent = 'start' | 'ready' | 'stop' | 'stopped' | 'crash';

/** NFR-5 error triple carried as plain data across IPC (data-flows §4.2). */
export interface AppError {
  /** Internal code `E-CLASS-NNN`; never part of the user-facing title. */
  code: string;
  /** Plain language, ≤ 60 chars, no jargon, no error codes. */
  title: string;
  /** Exactly one sentence stating what happened (concrete facts allowed). */
  cause: string;
  /** A concrete action the user can take. */
  nextStep: string;
}

/** Current status of the supervised core process (data-flows §4.2). */
export interface StatusSnapshot {
  state: CoreState;
  /** Most recent error; cleared only on a successful transition to `running` (§2.3). */
  lastError: AppError | null;
}

/** Discriminated result: illegal transitions return a typed error instead of throwing. */
export type TransitionResult =
  { ok: true; snapshot: StatusSnapshot } | { ok: false; error: AppError };

/** Machine entry point: the app has never started the core yet (TC-03-01). */
export const INITIAL_STATUS: StatusSnapshot = {
  state: 'stopped',
  lastError: null,
};

/**
 * Code returned for a rejected (illegal) transition. `docs/analysis/errors.md`
 * defines no generic "invalid state transition" code — M3-A amendment (DV-64):
 * `E-VAL-017` is it (was mislabelled `E-VAL-015`, which stays the *import-gate*
 * code of FR-07), fired before any process is spawned, leaving app state
 * unchanged (errors.md §0, §1, §6 recovery matrix).
 */
const INVALID_TRANSITION_CODE = 'E-VAL-017';

/**
 * The complete legal transition table (data-flows §2.3). Every
 * `(state, event)` pair absent from this table is rejected by `transition`:
 * single-spawn guard (start only from `stopped`/`crashed`), Stop only from
 * `running`, and `crashed → running` only via `starting` (no auto-restart).
 */
const TRANSITIONS: Readonly<Record<CoreState, Partial<Record<CoreEvent, CoreState>>>> = {
  stopped: { start: 'starting' },
  starting: { ready: 'running', crash: 'crashed' },
  running: { stop: 'stopping', crash: 'crashed' },
  stopping: { stopped: 'stopped' },
  crashed: { start: 'starting' },
};

/** Builds the NFR-5 triple for a rejected transition (no stack, no secrets). */
function invalidTransition(from: CoreState, event: CoreEvent): AppError {
  return {
    code: INVALID_TRANSITION_CODE,
    title: 'Action unavailable in the current state',
    cause: `The request "${event}" is not valid while the core is ${from}.`,
    nextStep: 'Wait for the current step to finish, then try again.',
  };
}

/** `lastError` rules (§2.3): crash sets it, `ready` clears it, otherwise retained. */
function nextLastError(
  snapshot: StatusSnapshot,
  event: CoreEvent,
  crashError: AppError | undefined,
): AppError | null {
  if (event === 'crash') {
    // FR-17/FR-27: the crash event's error wins; without one keep the previous.
    return crashError ?? snapshot.lastError;
  }
  if (event === 'ready') {
    // Cleared only on a successful transition to `running`.
    return null;
  }
  return snapshot.lastError;
}

/**
 * Applies `event` to `snapshot` and returns the result — pure, never mutates
 * the input. Illegal transitions return `{ ok: false, error }` instead of
 * throwing; no edge may leave `crashed` except a manual `start` (FR-28).
 *
 * @param snapshot current status (untouched by this function)
 * @param event lifecycle event to apply
 * @param crashError detail for event `crash` (FR-17 / FR-20)
 */
export function transition(
  snapshot: StatusSnapshot,
  event: CoreEvent,
  crashError?: AppError,
): TransitionResult {
  const nextState = TRANSITIONS[snapshot.state][event];
  if (nextState === undefined) {
    return { ok: false, error: invalidTransition(snapshot.state, event) };
  }
  return {
    ok: true,
    snapshot: {
      state: nextState,
      lastError: nextLastError(snapshot, event, crashError),
    },
  };
}

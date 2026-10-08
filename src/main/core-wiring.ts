/**
 * Status wiring — M1-17 (GREEN half of the M1-16 contract declared in the
 * header of `tests/unit/core-wiring.test.ts` and mirrored as types in
 * `tests/helpers/core-wiring-stub.ts`, DV-28 in docs/qa/m1-test-plan.md §14).
 *
 * Spec: docs/analysis/data-flows.md flow (b) §2.1/§2.3 (step 0 no-profile
 * guard; one `status:changed` push per transition, `lastError` retained from
 * `crashed` and cleared only on a successful `→ running`), §4.2 (`status:get`
 * / `status:changed` rows and the `StatusSnapshot { state, lastError,
 * socksPort }` payload), §5 (startup path `profile:get → status:get →
 * render`); docs/analysis/requirements.md F4 (FR-25, FR-26, FR-27), FR-12
 * (no-profile Start guard), FR-13/FR-18 (start/stop controls, single child),
 * FR-63 (push, never polled); docs/product/stories/US-02 (Start/Stop),
 * US-03 (status exposure), US-05 AC-05.4 (tray text mirror — the Electron
 * fan-out itself stays in `src/main/index.ts`).
 *
 * Pure node on purpose (sibling of the TC-02-14 / TC-05-15 / TC-06-14 module
 * boundary rule): NO electron import — every collaborator arrives through the
 * injected `CoreWiringDeps`, so the whole glue runs in the plain node test
 * env (strategy §2, §1 synthetic-only: the supervisor factory is the
 * spawn-free test seam).
 *
 * `handleStart()` sequence (data-flows (b) steps 0–5):
 *   0. `loadConfig()` → null means "no profile" (FR-12): return an NFR-5
 *      triple BEFORE any supervisor exists — nothing spawns, nothing
 *      broadcasts, `getStatus()` stays `stopped`. errors.md documents NO
 *      code for this refusal (DV-19/DV-28: no code may be invented), so the
 *      triple carries data-flows §2.2's `E-VAL-*` branch designation as its
 *      internal `code` — codes are internal-only per errors.md §0 and never
 *      appear in the user-facing title.
 *   With a profile: build the M1-15 supervisor with the HOST-resolved
 *   `binaryPath` (S4-5 pass-through — never re-derived here), the freshly
 *   read stored-profile JSON, this module's `onStateChange` push source and
 *   the injected raw-line `logSink`; its `start()` result is returned
 *   VERBATIM (all wording lives in M1-15, never duplicated here).
 *
 * Instance rule (FR-18 single child vs AC-01.7 re-import pickup): a
 * supervisor is constructed fresh whenever the tracked state is terminal
 * (`stopped`/`crashed`) — so `loadConfig()` read on every `handleStart`
 * reaches the next spawn; while an instance is mid-flight
 * (`starting`/`running`/`stopping`) the EXISTING one is reused so its state
 * machine rejects a duplicate Start with M1-15's E-VAL-015 wording.
 *
 * Every `onStateChange` snapshot is widened with the fixed local SOCKS port
 * and handed to `deps.broadcast` SYNCHRONOUSLY, exactly once, in emission
 * order (the IPC hop of FR-26/NFR-3; the process-event budget itself stays
 * supervisor-side TC-NFR3-02) — and `getStatus()` answers the latest of
 * those snapshots (FR-25: `status:get` reports the CURRENT status).
 */
import { DEFAULT_SOCKS_PORT } from '../shared/constants';
import type { AppError, OperationResult, StatusSnapshot } from '../shared/ipc';
import { type CoreState, type StatusSnapshot as CoreSnapshot } from '../shared/status-machine';
import type { CoreLogLine, CoreSupervisor, SupervisorOptions } from './core-supervisor';

/**
 * Injected collaborators of the wiring — nothing global, nothing Electron:
 * `src/main/index.ts` passes its `broadcastStatus`, its log collector's
 * `push`, the resolved binary path (S4-5 `CORE_BINARY_PATH` dev override is
 * honored by the HOST, not re-derived here) and a stored-profile reader.
 */
export interface CoreWiringDeps {
  /**
   * Supervisor factory — the seam that keeps the whole glue spawn-free in
   * tests (the fake never touches a child process).
   */
  readonly createSupervisor: (options: SupervisorOptions) => CoreSupervisor;
  /**
   * Core executable path, passed through to `createSupervisor` untouched —
   * the wiring resolves nothing itself (data-flows (b) step 1a runs inside
   * the supervisor, M1-15 contract).
   */
  readonly binaryPath: string;
  /**
   * Stored-profile JSON for the supervisor, or `null` when no profile exists
   * (data-flows (b) step 0, FR-12). Called on every `handleStart` so a
   * re-imported profile is picked up (AC-01.7).
   */
  readonly loadConfig: () => string | null;
  /** Raw child lines → main's single redaction entry point (FR-47, M1-19 wiring). */
  readonly logSink: (line: CoreLogLine) => void;
  /** Main's `webContents.send('status:changed', …)` fan-out (FR-63). */
  readonly broadcast: (snapshot: StatusSnapshot) => void;
  /**
   * Host app's packaged flag, forwarded to the supervisor (issue #21) —
   * the child env admits the `FAKE_CORE_*` dev/test seam only un-packaged.
   * Optional so every existing deps literal (unit fakes) stays untouched;
   * the host supplies `app.isPackaged`.
   */
  readonly isPackaged?: boolean | undefined;
}

/** Behavior surface of `createCoreWiring(deps)` — what `src/main/index.ts` wires. */
export interface CoreWiring {
  /** Body of the `core:start` handler: guard → profile → `supervisor.start()`. */
  handleStart(): Promise<OperationResult>;
  /** Body of the `core:stop` handler: `supervisor.stop()` (idempotent no-op without one). */
  handleStop(): Promise<OperationResult>;
  /**
   * S5-3 (issue #9): the quit-teardown route — awaits any in-flight
   * `handleStop()` first, then `supervisor.forceStop()` verbatim (the §4.2
   * idempotent `{ok:true}` no-op without a constructed supervisor).
   */
  handleStopForce(): Promise<OperationResult>;
  /** Answer of `status:get` — the latest snapshot, `{state, lastError, socksPort}`. */
  getStatus(): StatusSnapshot;
}

/** States from which a NEW supervisor may be built (data-flows §2.3 guards). */
const TERMINAL_STATES: readonly CoreState[] = ['stopped', 'crashed'];

/**
 * FR-12 step-0 refusal (errors.md documents NO code for this case — DV-19:
 * no code may be invented, so the flowchart's `E-VAL-*` branch designation
 * travels as the internal `code`; only the triple SHAPE is user-facing,
 * NFR-5: plain title ≤ 60 chars, one-sentence cause, concrete next step,
 * no stack — FR-48).
 */
function noProfileError(): AppError {
  return {
    code: 'E-VAL-*',
    title: 'No profile imported yet',
    cause: 'The tunnel cannot start because no profile has been imported.',
    nextStep: 'Import a profile first, then click Start.',
  };
}

/**
 * Builds the supervisor → IPC glue over injected collaborators.
 *
 * Side-effect free on purpose (contract point 1): nothing spawns, no
 * supervisor exists and nothing broadcasts until a `handleStart()` that
 * finds a stored profile.
 *
 * @param deps every collaborator, injected by the host (`src/main/index.ts`)
 */
export function createCoreWiring(deps: CoreWiringDeps): CoreWiring {
  // The latest supervisor (null until the first profile-backed start) …
  let supervisor: CoreSupervisor | null = null;
  // … the latest exposed snapshot (FR-25: status:get answers CURRENT) …
  let current: StatusSnapshot = {
    state: 'stopped',
    lastError: null,
    socksPort: DEFAULT_SOCKS_PORT,
  };
  // … and the graceful stop currently in flight, if any — S5-3 (issue #9):
  // the quit teardown awaits it before taking the force route ("make teardown
  // await any in-flight stop"), never re-issuing a second graceful `stop()`.
  let inFlightStop: Promise<OperationResult> | null = null;

  /**
   * The push source registered as the supervisor's `onStateChange`
   * (data-flows (b) step 7): the M1-15 machine snapshot (state + lastError)
   * becomes exactly one synchronous `status:changed` payload — the §4.2
   * StatusSnapshot plus the fixed local SOCKS port (FR-26 IPC hop, FR-63
   * pushed never polled).
   */
  const pushTransition = (snapshot: CoreSnapshot): void => {
    current = {
      state: snapshot.state,
      lastError: snapshot.lastError,
      socksPort: DEFAULT_SOCKS_PORT,
    };
    deps.broadcast(current);
  };

  const handleStart = async (): Promise<OperationResult> => {
    // Step 0 (FR-12): the no-profile guard runs BEFORE any supervisor exists —
    // no factory call, no spawn, no transition, no push.
    const config = deps.loadConfig();
    if (config === null) {
      return { ok: false, error: noProfileError() };
    }

    // Terminal state (or first start) → build fresh with THIS handleStart's
    // config so a re-imported profile reaches the spawn (AC-01.7); a
    // mid-flight instance is reused so its state machine keeps enforcing the
    // single-child guard (FR-18) with M1-15's own wording.
    const active =
      supervisor !== null && !TERMINAL_STATES.includes(current.state)
        ? supervisor
        : deps.createSupervisor({
            binaryPath: deps.binaryPath,
            config,
            isPackaged: deps.isPackaged,
            onStateChange: pushTransition,
            logSink: deps.logSink,
          });
    supervisor = active;
    // The supervisor's result crosses verbatim ({ok:true} | {ok:false, error}).
    return active.start();
  };

  const handleStop = async (): Promise<OperationResult> => {
    // §4.2 idempotent no-op: without a constructed supervisor nothing runs,
    // so stopping is already satisfied — the factory is never called here.
    if (supervisor === null) {
      return { ok: true };
    }
    const run = supervisor.stop();
    inFlightStop = run;
    try {
      return await run;
    } finally {
      if (inFlightStop === run) {
        inFlightStop = null;
      }
    }
  };

  const handleStopForce = async (): Promise<OperationResult> => {
    // S5-3: teardown settles any in-flight graceful stop FIRST (it may be
    // halfway through SIGTERM + T cleanup), then takes the kill route once.
    const inFlight = inFlightStop;
    if (inFlight !== null) {
      await inFlight;
    }
    // §4.2 idempotent no-op: no supervisor was ever constructed — nothing to
    // kill, and the factory stays untouched (the no-child forceStop precedent).
    if (supervisor === null) {
      return { ok: true };
    }
    // The forceStop result crosses VERBATIM (identity, all wording is M1-15's).
    return supervisor.forceStop();
  };

  return {
    handleStart,
    handleStop,
    handleStopForce,
    getStatus: (): StatusSnapshot => current,
  };
}

/**
 * Shared machinery for the M1-16 (RED) status-exposure batch — the main-side
 * glue between the M1-15 supervisor and the M1-07 IPC push surface. No real
 * process is ever spawned here: the supervisor arrives as an injected factory
 * and every transition travels through injected callbacks (docs/qa/strategy.md
 * §1 synthetic-only rule).
 *
 * Declares the M1-17 contract surface (full text in the header of
 * `tests/unit/core-wiring.test.ts`): module `src/main/core-wiring.ts`
 * exporting `createCoreWiring(deps)` → `{ handleStart, handleStop, getStatus }`,
 * where the wiring owns supervisor construction (binaryPath/config pass-through)
 * and pushes every `onStateChange` transition to the injected `broadcast`
 * (main's `broadcastStatus`, FR-63).
 *
 * Loader note: `import(coreWiringModule)` takes a NON-LITERAL specifier on
 * purpose — `tests/**` is inside `tsconfig.node.json`'s `include`, so a
 * literal import of the not-yet-existing module would make `npm run typecheck`
 * fail (which must stay exit 0 during RED). At runtime Vitest resolves the
 * relative specifier against this file, so the moment M1-17 creates the module
 * the very same line loads it: absence RED becomes assertion RED with zero
 * test edits (strategy §5.2). Verified pattern: the identical non-literal
 * loader already ships for `system-proxy`, `core-supervisor` and
 * `window-lifecycle`.
 *
 * This file is a helper, not a suite: `vitest.config.ts` collects only
 * `*.test.ts(x)` under `tests/`.
 */
import type { OperationResult, StatusSnapshot as IpcStatusSnapshot } from '../../src/shared/ipc';
import type { CoreLogLine, CoreSupervisor, SupervisorOptions } from './core-supervisor-stub';

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
  readonly broadcast: (snapshot: IpcStatusSnapshot) => void;
}

/** Behavior surface of `createCoreWiring(deps)` — what `src/main/index.ts` wires. */
export interface CoreWiring {
  /** Body of the `core:start` handler: guard → profile → `supervisor.start()`. */
  handleStart(): Promise<OperationResult>;
  /** Body of the `core:stop` handler: `supervisor.stop()` (idempotent no-op without one). */
  handleStop(): Promise<OperationResult>;
  /** Answer of `status:get` — the latest snapshot, `{state, lastError, socksPort}`. */
  getStatus(): IpcStatusSnapshot;
}

/** Module surface QA declares for M1-17 (header-contract style, DV-28). */
export interface CoreWiringModule {
  createCoreWiring(deps: CoreWiringDeps): CoreWiring;
}

/**
 * Non-literal on purpose (see file header): typecheck stays green while
 * `src/main/core-wiring.ts` does not exist; the runtime resolution is the
 * legitimate *absence RED* reason for this batch (strategy §5.2) — never
 * weaken this path or the tests behind it.
 */
const coreWiringModule: string = '../../src/main/core-wiring';

export async function loadCoreWiring(): Promise<CoreWiringModule> {
  try {
    return (await import(/* @vite-ignore */ coreWiringModule)) as CoreWiringModule;
  } catch (failure) {
    throw new Error(
      'M1-16 contract missing: src/main/core-wiring.ts could not be loaded — ' +
        'M1-17 GREEN implements this module (plan M1-16 → M1-17, m1-test-plan §3). ' +
        'Absence RED is the expected failure until then (strategy §5.1). Cause: ' +
        (failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

/**
 * Shared machinery for the M1-22 (RED) tray & window-lifecycle batch — the
 * POLICY layer only: no Electron, no tray, no BrowserWindow ever runs here;
 * every side effect travels through injected callbacks (docs/qa/strategy.md §1
 * synthetic-only rule; plan M1-22 is policy-level, M1-23 does the wiring).
 *
 * Declares the M1-23 contract surface (full text in the header of
 * `tests/unit/window-lifecycle.test.ts`): module `src/main/window-lifecycle.ts`
 * exporting `createWindowLifecycle(deps)` (close-to-tray policy, quit teardown,
 * tray-menu action dispatch) and the pure `buildTrayMenu(state)` menu model.
 *
 * Loader note: `import(windowLifecycleModule)` takes a NON-LITERAL specifier on
 * purpose — `tests/**` is inside `tsconfig.node.json`'s `include`, so a
 * literal import of the not-yet-existing module would make `npm run typecheck`
 * fail (which must stay exit 0 during RED). At runtime Vitest resolves the
 * relative specifier against this file, so the moment M1-23 creates the module
 * the very same line loads it: absence RED becomes assertion RED with zero
 * test edits (strategy §5.2). Verified pattern: the identical non-literal
 * loader already ships for `system-proxy` and `core-supervisor`.
 *
 * This file is a helper, not a suite: `vitest.config.ts` collects only
 * `*.test.ts(x)` under `tests/`.
 */
import type { CoreState } from '../../src/shared/status-machine';

/** Window close verdict (US-05 AC-05.2 / FR-39): hide to tray vs. really close. */
export type ClosePolicy = 'hide' | 'close';

/** Tray menu actions (plan M1-23 "Open / Start / Stop / Quit"; FR-41 labels). */
export type TrayMenuAction = 'open' | 'start' | 'stop' | 'quit';

/** One tray menu entry — always present; `enabled` derives from core state. */
export interface TrayMenuItem {
  readonly id: TrayMenuAction;
  /** User-visible text (FR-41/NFR-5: text, never color-only). */
  readonly label: string;
  /** Illegal actions stay listed but disabled (FR-41 "always contains"). */
  readonly enabled: boolean;
}

/** The tray menu model rebuilt from state alone — no window handle required. */
export interface TrayMenuModel {
  /** FR-41 exact text for the three visible states; busy text for transient ones (A-14). */
  readonly statusText: string;
  /** Exactly `[open, start, stop, quit]` in FR-41 listing order. */
  readonly items: readonly TrayMenuItem[];
}

/**
 * Injected collaborators of the lifecycle policy — every side effect of the
 * module goes through one of these, so the whole policy is mock-free testable.
 */
export interface WindowLifecycleDeps {
  /** Main's quit flag: true once the app is on its way out (close may proceed). */
  isQuitting(): boolean;
  /**
   * Quit teardown step 1 (data-flows §5): stop the core — SIGTERM/SIGKILL and
   * deletion of the materialized config `T` belong to this callback's own
   * contract (FR-16/FR-19/FR-23, supervisor M1-15), not to the lifecycle.
   */
  stopCore(): void | Promise<void>;
  /** Quit teardown step 2: revert the system proxy (data-flows §5, FR-35/FR-42). */
  restoreProxy(): void | Promise<void>;
  /** Tray "Show window" (FR-40 / AC-05.3): show/focus the main window. */
  showWindow(): void;
  /** Tray "Start tunnel" — reuses the same supervisor path as `core:start`. */
  startTunnel(): void | Promise<void>;
  /** Tray "Stop tunnel" — reuses the same supervisor path as `core:stop`. */
  stopTunnel(): void | Promise<void>;
  /** Ask the host to exit the app (`app.quit()` wiring, M1-23) — called LAST. */
  requestQuit(): void;
}

/** The behavior surface the M1-22 suite pins (header contract of the test file). */
export interface WindowLifecycle {
  /** `false` — the app starts hidden to tray (BRIEF §2.5, FR-38). */
  shouldShowWindowOnLaunch(): boolean;
  /** Close-button verdict: `'hide'` while not quitting, `'close'` once quitting. */
  handleCloseRequest(): ClosePolicy;
  /**
   * Quit teardown: `stopCore` → `restoreProxy` → `requestQuit`, in order,
   * awaited; idempotent — concurrent or repeated calls share ONE teardown.
   */
  handleBeforeQuit(): Promise<void>;
  /** Tray menu dispatch: `open`/`start`/`stop` forward; `quit` runs the teardown. */
  handleMenuAction(action: TrayMenuAction): Promise<void>;
}

/** Module surface QA declares for M1-23 (header-contract style, cf. DV-09/DV-16/DV-23). */
export interface WindowLifecycleModule {
  createWindowLifecycle(deps: WindowLifecycleDeps): WindowLifecycle;
  /** Pure state → menu model (AC-05.4/AC-05.6): needs NO window, NO Electron. */
  buildTrayMenu(state: CoreState): TrayMenuModel;
}

/**
 * Non-literal on purpose (see file header): typecheck stays green while
 * `src/main/window-lifecycle.ts` does not exist; the runtime resolution failure
 * is the legitimate *absence RED* reason for this batch (strategy §5.1) — the
 * wrapped message names the contract — never weaken this path or the tests
 * behind it.
 */
const windowLifecycleModule: string = '../../src/main/window-lifecycle';

export async function loadWindowLifecycle(): Promise<WindowLifecycleModule> {
  try {
    return (await import(/* @vite-ignore */ windowLifecycleModule)) as WindowLifecycleModule;
  } catch (failure) {
    throw new Error(
      'M1-22 contract missing: src/main/window-lifecycle.ts could not be loaded — ' +
        'M1-23 GREEN implements this module (plan M1-22 → M1-23, m1-test-plan §5). ' +
        'Absence RED is the expected failure until then (strategy §5.1). Cause: ' +
        (failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

/** Behavior override for one recorder callback (failure-path injection). */
export interface RecorderOverrides {
  stopCore?: () => Promise<void>;
  restoreProxy?: () => Promise<void>;
}

/** Records every lifecycle callback invocation by name, in call order. */
export interface LifecycleRecorder {
  readonly calls: string[];
  readonly deps: WindowLifecycleDeps;
  /** Flips the injected `isQuitting()` flag (the host's quit marker). */
  setQuitting(value: boolean): void;
}

/**
 * Recording deps factory: every callback appends its name to `calls` before
 * delegating to the optional override, so order pins observe CALL order
 * (data-flows §5 quit ordering) and failure paths stay injectable.
 */
export function createLifecycleRecorder(overrides: RecorderOverrides = {}): LifecycleRecorder {
  const calls: string[] = [];
  let quitting = false;
  const deps: WindowLifecycleDeps = {
    isQuitting: () => quitting,
    stopCore: () => {
      calls.push('stopCore');
      return overrides.stopCore?.();
    },
    restoreProxy: () => {
      calls.push('restoreProxy');
      return overrides.restoreProxy?.();
    },
    showWindow: () => {
      calls.push('showWindow');
    },
    startTunnel: () => {
      calls.push('startTunnel');
    },
    stopTunnel: () => {
      calls.push('stopTunnel');
    },
    requestQuit: () => {
      calls.push('requestQuit');
    },
  };
  return {
    calls,
    deps,
    setQuitting: (value: boolean) => {
      quitting = value;
    },
  };
}

/** Manually-controlled promise — pins "resolves only after teardown" (strategy §1). */
export interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason?: unknown): void;
}

export function createDeferred(): Deferred {
  let resolveFn: () => void = () => undefined;
  let rejectFn: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return {
    promise,
    resolve: () => resolveFn(),
    reject: (reason?: unknown) => rejectFn(reason),
  };
}

/** Lets pending microtasks/timers run — observations between teardown steps. */
export function flushTasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

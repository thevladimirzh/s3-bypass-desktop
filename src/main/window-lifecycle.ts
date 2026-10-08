/**
 * Window lifecycle & tray-menu policy — M1-23 (GREEN) for the M1-22 contract
 * declared in the header of `tests/unit/window-lifecycle.test.ts` and mirrored
 * as types in `tests/helpers/window-lifecycle-stub.ts` (TC-05-02, TC-05-04,
 * TC-05-05, TC-05-06, TC-05-14, TC-05-15; DV-27 in docs/qa/m1-test-plan.md §14).
 *
 * Spec: docs/analysis/requirements.md F6 (FR-38..FR-44) + platform rules
 * PR-03/PR-09; docs/analysis/data-flows.md §2.3 (transition guards behind the
 * menu `enabled` flags), §4.2 "Not IPC (main-internal, listed for
 * completeness)" (tray menu actions and window show/hide never cross the
 * renderer bridge), §5 (quit ordering: stop core → revert proxy → exit);
 * docs/product/stories/US-05-tray.md AC-05.1..AC-05.6; plan M1-23.
 *
 * Pure node policy layer (TC-05-15, sibling of the core-supervisor /
 * system-proxy / log-collector purity rule): NO electron import, no IPC
 * primitive, no tray/window handle — every side effect travels through the
 * injected `WindowLifecycleDeps`, so the whole policy runs in the plain node
 * test env on macOS and Linux CI. The Electron wiring (tray icon, native menu
 * template, close/quit app handlers, wiring `stopCore` to the supervisor and
 * `restoreProxy` to `src/main/system-proxy.ts`) belongs to `src/main/index.ts`
 * and lands with the supervisor integration wiring task — plan M1-23's wiring
 * half is deliberately NOT part of this module.
 *
 * Quit semantics (FR-19 / FR-42, data-flows §5): `handleBeforeQuit()` runs
 * `stopCore` → `restoreProxy` → `requestQuit` in order, awaiting each step,
 * and is IDEMPOTENT (AC-05.5) — concurrent or repeated quit requests share
 * ONE teardown. A rejecting step never skips a later step nor `requestQuit`
 * (AC-05.5 "exits fully", FR-35 fail closed): every step is attempted, then
 * the first failure — if any — is rethrown so the caller can surface it; the
 * E-PLAT-003 warning wording itself belongs to the injected `restoreProxy`
 * (system-proxy module, M1-21), not to this policy.
 */

import { STATUS_LABELS } from '../shared/status-labels';
import type { CoreState } from '../shared/status-machine';

/** Window close verdict (US-05 AC-05.2 / FR-39): hide to tray vs. really close. */
export type ClosePolicy = 'hide' | 'close';

/** Tray menu action ids (plan M1-23 "Open / Start / Stop / Quit"; FR-41 listing order). */
export type TrayMenuAction = 'open' | 'start' | 'stop' | 'quit';

/** One tray menu entry — ALWAYS listed; only `enabled` follows the §2.3 guards (FR-41). */
export interface TrayMenuItem {
  readonly id: TrayMenuAction;
  /** User-visible text (FR-41/NFR-5: a text label, never color-only). */
  readonly label: string;
  /** Illegal actions stay listed but disabled (data-flows §2.3 transition guards). */
  readonly enabled: boolean;
}

/** The tray menu model rebuilt from `CoreState` alone — no window handle (AC-05.6). */
export interface TrayMenuModel {
  /** FR-41 exact text for the three visible states; busy text for transient ones (A-14). */
  readonly statusText: string;
  /** Exactly `[open, start, stop, quit]` in FR-41 listing order, always present. */
  readonly items: readonly TrayMenuItem[];
}

/**
 * Injected collaborators of the lifecycle policy — every side effect of this
 * module goes through one of them, so the whole policy is mock-free testable
 * (data-flows §4.2: tray/window actions are main-internal, never IPC).
 */
export interface WindowLifecycleDeps {
  /** Main's quit marker (`app.on('before-quit')`): true once the app is on its way out. */
  isQuitting(): boolean;
  /**
   * Quit teardown step 1 (data-flows §5, FR-19): stop the core — SIGTERM/
   * SIGKILL and deletion of the materialized config `T` belong to this
   * callback's own contract (FR-16/FR-19/FR-23, supervisor M1-15).
   */
  stopCore(): void | Promise<void>;
  /** Quit teardown step 2 (data-flows §5, FR-35/FR-42): revert the system proxy. */
  restoreProxy(): void | Promise<void>;
  /** Tray "Show window" (FR-40 / AC-05.3): show/focus the main window. */
  showWindow(): void;
  /** Tray "Start tunnel" — reuses the same supervisor path as `core:start`. */
  startTunnel(): void | Promise<void>;
  /** Tray "Stop tunnel" — reuses the same supervisor path as `core:stop`. */
  stopTunnel(): void | Promise<void>;
  /**
   * M2-11 (issue #19 — tray freshness advisory, FR-35 family): the LIVE core
   * state consulted before `start`/`stop` is dispatched. The dispatcher
   * re-validates through the SAME pure `buildTrayMenu` model the menu
   * template is built from, so a stale template click (a status push racing
   * the click) is a silent no-op instead of an illegal transition attempt —
   * one source of truth, never a second legality copy.
   */
  getLiveState(): CoreState;
  /** LAST teardown step: ask the host to exit the app (`app.quit()` wiring). */
  requestQuit(): void;
}

/** The behavior surface the M1-22 suite pins (header contract of the test file). */
export interface WindowLifecycle {
  /** `true` — the main window shows on launch (FR-38 amended, issue #25). */
  shouldShowWindowOnLaunch(): boolean;
  /** Close-button verdict: `'hide'` while not quitting, `'close'` once quitting (FR-39). */
  handleCloseRequest(): ClosePolicy;
  /**
   * Quit teardown: `stopCore` → `restoreProxy` → `requestQuit`, in order,
   * awaited; idempotent — concurrent or repeated calls share ONE teardown
   * (AC-05.5, data-flows §5).
   */
  handleBeforeQuit(): Promise<void>;
  /** Tray menu dispatch: `open`/`start`/`stop` forward; `quit` runs the teardown. */
  handleMenuAction(action: TrayMenuAction): Promise<void>;
}

/**
 * FR-41 status text for the visible states, verbatim ("never color-only",
 * NFR-5). M3-06 (TC-POL-03): the words live in `src/shared/status-labels.ts`
 * — ONE source with the renderer's badge — re-exported here under this
 * suite's historical name `STATUS_TEXT` (the pin compares both exports).
 */
export { STATUS_LABELS as STATUS_TEXT };

/**
 * Pure state → tray menu model (AC-05.4 / AC-05.6): needs no window, no
 * Electron, no I/O — rebuilding from the new state alone is how a crash
 * observed while the window is closed reaches the tray (FR-43).
 *
 * All four items are ALWAYS present (FR-41 "always contains"); `enabled`
 * mirrors the data-flows §2.3 transition guards: Start only from
 * `stopped`/`crashed` (single child, manual recovery AC-03.6), Stop only
 * while `running`; Show window and Quit are always available (FR-40, FR-42).
 *
 * @param state current core lifecycle state (data-flows §2.3 state set)
 */
export function buildTrayMenu(state: CoreState): TrayMenuModel {
  const canStart = state === 'stopped' || state === 'crashed';
  const canStop = state === 'running';
  return {
    statusText: STATUS_LABELS[state],
    items: [
      { id: 'open', label: 'Show window', enabled: true },
      { id: 'start', label: 'Start tunnel', enabled: canStart },
      { id: 'stop', label: 'Stop tunnel', enabled: canStop },
      { id: 'quit', label: 'Quit', enabled: true },
    ],
  };
}

/**
 * S5-15 (issue #22): every quit-teardown step is bounded — a HUNG platform
 * exec (networksetup/gsettings) or a stuck core stop must not strand the
 * quit. The budget outlives the supervisor's own ~7 s stop bound (SIGTERM
 * 2 s + last-resort grace 5 s, core-supervisor) AND the 10 s execFile kill
 * (index.ts EXEC_TIMEOUT_MS); past it the step is abandoned AS its failure
 * and the chain proceeds — `requestQuit` still runs last (AC-05.5).
 */
const TEARDOWN_STEP_BUDGET_MS = 12_000;

/**
 * Builds the window/tray lifecycle policy over injected collaborators.
 *
 * Side-effect isolation (TC-05-15): nothing here touches Electron or the OS —
 * `handleCloseRequest` only reads `isQuitting()`, hiding the window runs no
 * teardown (AC-05.2: the process and a running core keep going), and the quit
 * teardown below is the single place where `stopCore`/`restoreProxy`/
 * `requestQuit` may run — exactly once per lifecycle instance (FR-19).
 *
 * @param deps every side effect of the policy, injected by the host (M1-23 wiring)
 */
export function createWindowLifecycle(deps: WindowLifecycleDeps): WindowLifecycle {
  // AC-05.5 idempotency: ONE shared teardown for the whole lifecycle instance —
  // concurrent (menu Quit + before-quit) and repeated quit requests all await
  // the same promise, so the core is stopped once (FR-19) and the proxy is
  // reverted once.
  let teardown: Promise<void> | null = null;

  // data-flows §5 quit ordering: stop core → revert proxy → request the exit.
  // Each step is attempted even if an earlier one rejected (FR-35 fail closed,
  // AC-05.5 "exits fully" — a failing core stop must not strand the proxy
  // revert, a failing revert must not strand the exit); the first failure is
  // rethrown AFTER `requestQuit` so the caller may surface it without the
  // teardown ever being skipped or hung.
  const runTeardown = async (): Promise<void> => {
    const failures: unknown[] = [];
    const attempt = async (step: () => void | Promise<void>, what: string): Promise<void> => {
      let bound: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          step(),
          new Promise<void>((resolveBound) => {
            bound = setTimeout(() => {
              // S5-15 (issue #22): a HUNG step (not a failing one) used to
              // strand the whole quit — after the budget it is abandoned AS
              // its failure and the chain proceeds (requestQuit still last).
              failures.push(
                new Error(
                  `${what} exceeded ${TEARDOWN_STEP_BUDGET_MS} ms — quit proceeds (S5-15, issue #22)`,
                ),
              );
              resolveBound();
            }, TEARDOWN_STEP_BUDGET_MS);
          }),
        ]);
      } catch (error: unknown) {
        failures.push(error);
      } finally {
        clearTimeout(bound);
      }
    };
    await attempt(() => deps.stopCore(), 'stopCore');
    await attempt(() => deps.restoreProxy(), 'restoreProxy');
    try {
      deps.requestQuit();
    } catch (error: unknown) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  };

  const handleBeforeQuit = (): Promise<void> => {
    teardown ??= runTeardown();
    return teardown;
  };

  return {
    // FR-38 (amended, owner decision issue #25, 2026-10-08): the main window
    // shows on launch — index.ts consults this policy right after creating
    // the (hidden) window and performs the show; nothing runs at construction
    // time, and tray "Open" (FR-40) still re-shows/focuses on demand.
    shouldShowWindowOnLaunch: () => true,

    // FR-39 / AC-05.2: while NOT quitting, a close request HIDES the window
    // (PR-03 close-to-tray); once quitting it must really close so the app can
    // exit fully (AC-05.5). Purely a read of the host's quit marker — no
    // teardown runs as a side effect of answering a close request.
    handleCloseRequest: (): ClosePolicy => (deps.isQuitting() ? 'close' : 'hide'),

    handleBeforeQuit,

    // data-flows §4.2 "Not IPC (main-internal)": tray menu actions dispatch
    // directly to the same supervisor/proxy functions `core:*` uses — the
    // quit item goes through the SAME teardown as before-quit (no shortcut).
    handleMenuAction: async (action: TrayMenuAction): Promise<void> => {
      // M2-11 / issue #19 (tray freshness advisory): `start`/`stop` are
      // re-validated against the LIVE state through the SAME pure
      // `buildTrayMenu` model the menu template was built from — a stale
      // template click (a status push racing the click) becomes a silent
      // no-op instead of an illegal transition attempt (one source of
      // truth, never a second legality copy). `open`/`quit` are
      // state-independent (FR-40/FR-42) and never consult the state.
      const canDispatch = (wanted: 'start' | 'stop'): boolean =>
        buildTrayMenu(deps.getLiveState()).items.some((item) => item.id === wanted && item.enabled);
      switch (action) {
        case 'open':
          deps.showWindow();
          return;
        case 'start':
          if (!canDispatch('start')) {
            return;
          }
          await deps.startTunnel();
          return;
        case 'stop':
          if (!canDispatch('stop')) {
            return;
          }
          await deps.stopTunnel();
          return;
        case 'quit':
          return handleBeforeQuit();
      }
    },
  };
}

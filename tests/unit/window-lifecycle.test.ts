/**
 * M1-22 (RED) — tray & window lifecycle policy (Phase H).
 *
 * Test plan IDs: TC-05-02, TC-05-04, TC-05-05, TC-05-06 (planned) + TC-05-14,
 * TC-05-15 (new, allocated this batch) — docs/qa/m1-test-plan.md §5, the M1-22
 * row in §10, allocations DV-27 in §14.
 *
 * Spec sources: docs/analysis/requirements.md F6 (FR-38..FR-44) + platform
 * rules PR-03 (close-to-tray replaces the scaffold's quit-on-window-all-closed,
 * reported as C-02), PR-09; docs/analysis/data-flows.md §2.1 step 9 (quit path
 * order), §2.3 (transition guards), §4.2 "Not IPC (main-internal)" (tray menu
 * actions + window show/hide never cross the bridge), §5 (quit ordering);
 * docs/product/stories/US-05-tray.md AC-05.1..AC-05.6; PRD row 5 ("the
 * window shows on launch" — the original "app starts hidden to tray" was
 * retired by owner decision issue #25, 2026-10-08, FR-38 amended);
 * docs/plans/m1-mvp.md M1-22 → M1-23;
 * docs/qa/strategy.md §5.1 (RED reasons).
 *
 * Layer: L1 unit, PURE — no Electron, no tray, no BrowserWindow, no network
 * (strategy §1). Every side effect travels through injected callbacks, so the
 * whole policy runs mock-free in node env on macOS and Linux CI (purity rule
 * of core-supervisor/system-proxy/log-collector; enforced structurally by
 * TC-05-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-23 (declared here — header-contract style, cf. DV-09/DV-16/
 * DV-23; full type text in `tests/helpers/window-lifecycle-stub.ts`; any
 * deviation requires an upstream spec note first, strategy §5.2):
 *
 *  module  : src/main/window-lifecycle.ts   — pure node, NO electron import
 *  exports : createWindowLifecycle(deps: WindowLifecycleDeps): WindowLifecycle
 *            buildTrayMenu(state: CoreState): TrayMenuModel
 *
 *  WindowLifecycleDeps (all injected — the supervisor is ABSENT until M1-15
 *  unblocks, so M1-23 wires stopCore to the supervisor-or-placeholder and
 *  restoreProxy to the EXISTING src/main/system-proxy.ts; no test requires
 *  src/main/core-supervisor.ts):
 *    isQuitting(): boolean          // main's quit marker (app.on('before-quit'))
 *    stopCore(): void | Promise<void>       // teardown 1 — SIGTERM/SIGKILL +
 *                                    // deletion of materialized T live inside
 *                                    // this callback (FR-16/FR-19/FR-23)
 *    restoreProxy(): void | Promise<void>   // teardown 2 — data-flows §5
 *    showWindow(): void             // tray "Show window" (FR-40)
 *    startTunnel(): void | Promise<void>    // → same path as core:start
 *    stopTunnel(): void | Promise<void>     // → same path as core:stop
 *    requestQuit(): void            // LAST step: host runs app.quit()
 *
 *  WindowLifecycle:
 *    shouldShowWindowOnLaunch(): boolean        // always true — the window shows on launch (issue #25)
 *    handleCloseRequest(): 'hide' | 'close'     // 'hide' unless isQuitting()
 *    handleBeforeQuit(): Promise<void>          // stopCore → restoreProxy →
 *                                    // requestQuit, in order, awaited;
 *                                    // IDEMPOTENT — concurrent/repeated quit
 *                                    // shares ONE teardown (AC-05.5)
 *    handleMenuAction(action: 'open'|'start'|'stop'|'quit'): Promise<void>
 *                                    // open/start/stop forward to their dep;
 *                                    // quit ≡ handleBeforeQuit()
 *
 *  buildTrayMenu(state) (AC-05.4 / FR-41 — pure state → model, needs no
 *  window — AC-05.6):
 *    statusText: 'Stopped' | 'Running' | 'Core crashed' EXACT for the three
 *      visible states (FR-41 verbatim); starting/stopping → non-empty busy
 *      text (A-14 leaves the wording open — only "is text" is pinned).
 *    items: exactly [open, start, stop, quit] in that order, ALWAYS present
 *      (FR-41 "always contains"); labels: open = 'Show window', quit = 'Quit'
 *      (FR-41 verbatim); start/stop labels must contain 'Start'/'Stop' and
 *      'tunnel' (AC-05.4 "Start/Stop tunnel" — exact wording undocumented).
 *    enabled: open/quit always; start iff state ∈ {stopped, crashed}; stop
 *      iff state === 'running' — derived from the data-flows §2.3 transition
 *      guards (illegal actions stay listed, disabled).
 *
 *  Failure resilience (AC-05.5 "exits fully" + FR-35 fail closed): a rejecting
 *  teardown step never skips the remaining steps and never strands the quit —
 *  restoreProxy is still attempted after a stopCore failure, and requestQuit
 *  always runs. Whether handleBeforeQuit() resolves or rejects on failure is
 *  deliberately NOT pinned.
 *
 *  IPC decision (data-flows §4.2 "Not IPC (main-internal, listed for
 *  completeness)": tray menu actions and window show/hide are main event
 *  handlers reusing the supervisor/proxy functions — M1-23 needs NO new
 *  IPC channel, NO preload member, NO allowlist change. tests/unit/
 *  ipc-contract.test.ts is therefore untouched; any future renderer→main
 *  window channel must extend that contract ADDITIVELY (new CONTRACT_TABLE
 *  row + namespace + type union — never a weakening).
 *
 * Fixture rule: synthetic values only — no real endpoints, no live system
 * commands, no network (strategy §1).
 *
 * RED status: ABSENCE RED — `src/main/window-lifecycle.ts` does not exist;
 * every behavioral case fails through `loadWindowLifecycle()` (dynamic import
 * of a NON-LITERAL specifier so `npm run typecheck` stays exit 0 — see the
 * helper header) and the structural case through its explicit `existsSync`
 * gate. Strategy §5.1: legitimate first-test-of-a-subsystem failure; do not
 * weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CoreState } from '../../src/shared/status-machine';
import {
  createDeferred,
  createLifecycleRecorder,
  flushTasks,
  type LifecycleRecorder,
  loadWindowLifecycle,
  type RecorderOverrides,
  type TrayMenuAction,
  type TrayMenuModel,
  type WindowLifecycle,
  type WindowLifecycleModule,
} from '../helpers/window-lifecycle-stub';

const WINDOW_LIFECYCLE_SOURCE = fileURLToPath(
  new URL('../../src/main/window-lifecycle.ts', import.meta.url),
);

/** The complete §2.3 state set — every menu row is checked against it. */
const ALL_STATES: readonly CoreState[] = ['stopped', 'starting', 'running', 'stopping', 'crashed'];

interface LoadedLifecycle {
  readonly lifecycle: WindowLifecycle;
  readonly menu: (state: CoreState) => TrayMenuModel;
  readonly recorder: LifecycleRecorder;
}

/**
 * Loads the module under test (absence RED stops here — strategy §5.1),
 * verifies the declared exports by name (DV-27 contract), and instantiates the
 * policy over a recording deps object.
 */
async function loadLifecycle(overrides: RecorderOverrides = {}): Promise<LoadedLifecycle> {
  const module: WindowLifecycleModule = await loadWindowLifecycle();
  for (const name of ['createWindowLifecycle', 'buildTrayMenu'] as const) {
    if (typeof module[name] !== 'function') {
      throw new Error(
        `src/main/window-lifecycle.ts must export ${name} — M1-23 GREEN implements the M1-22 contract`,
      );
    }
  }
  const recorder = createLifecycleRecorder(overrides);
  return {
    lifecycle: module.createWindowLifecycle(recorder.deps),
    menu: module.buildTrayMenu,
    recorder,
  };
}

/** Menu item lookup by action id. */
function item(model: TrayMenuModel, id: TrayMenuAction) {
  const found = model.items.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`tray menu must always contain the "${id}" item (FR-41 "always contains")`);
  }
  return found;
}

describe('window close → close-to-tray policy (US-05 AC-05.2, FR-39, PR-03/C-02) — TC-05-02', () => {
  it('tray.windowClose.processAliveCoreKeepsRunning', async () => {
    // AC-05.2 / FR-39: closing the window HIDES it — the process stays alive
    // and a running core keeps running, so the verdict must be the non-closing
    // 'hide' and nothing may quit or stop as a side effect.
    const { lifecycle, recorder } = await loadLifecycle();

    expect(
      lifecycle.handleCloseRequest(),
      'FR-39: a close request while NOT quitting must hide the window to tray',
    ).toBe('hide');
    expect(
      recorder.calls,
      'hiding must not quit the app or stop the core — the process keeps running (AC-05.2)',
    ).toEqual([]);
  });

  it('tray.windowClose.closeAllowedWhileQuitInProgress', async () => {
    // Sibling under TC-05-02 (DV-03 convention): once the app is quitting, the
    // close request must NOT be swallowed — the window really closes (AC-05.5:
    // the app exits fully, no background process remains).
    const { lifecycle, recorder } = await loadLifecycle();
    recorder.setQuitting(true);

    expect(
      lifecycle.handleCloseRequest(),
      'while isQuitting() is true the close request must be allowed to close',
    ).toBe('close');
    expect(recorder.calls, 'answering the close request runs no teardown by itself').toEqual([]);
  });
});

describe('tray menu model derived from state (US-05 AC-05.4, FR-41) — TC-05-04', () => {
  it('trayMenu.derivedFromState.statusTextPlusActions', async () => {
    const { menu } = await loadLifecycle();

    // FR-41 verbatim status text for the three visible states (never color-only).
    const visible: ReadonlyArray<readonly [CoreState, string]> = [
      ['stopped', 'Stopped'],
      ['running', 'Running'],
      ['crashed', 'Core crashed'],
    ];
    for (const [state, expected] of visible) {
      expect(
        menu(state).statusText,
        `FR-41: the tray shows the status as TEXT for state "${state}"`,
      ).toBe(expected);
    }

    // A-14: transient states render as busy text — wording is undocumented,
    // but it must be non-empty text, never blank and never color-only (NFR-5).
    for (const state of ['starting', 'stopping'] as const) {
      const text = menu(state).statusText;
      expect(typeof text, `state "${state}" must render a text status label`).toBe('string');
      expect(
        text.trim().length,
        `state "${state}" must render a non-empty text status label (NFR-5)`,
      ).toBeGreaterThan(0);
    }

    // FR-41: EVERY state's menu always contains Show window, Start/Stop tunnel,
    // Quit — items stay listed; only `enabled` follows the §2.3 guards.
    for (const state of ALL_STATES) {
      const model = menu(state);
      expect(
        model.items.map((entry) => entry.id),
        `FR-41: menu for "${state}" always contains open, start, stop, quit in listing order`,
      ).toEqual(['open', 'start', 'stop', 'quit']);

      expect(item(model, 'open').enabled, 'Show window is always available (FR-40)').toBe(true);
      expect(item(model, 'quit').enabled, 'Quit is always available (FR-42)').toBe(true);
      expect(
        item(model, 'start').enabled,
        `data-flows §2.3: Start offered only from stopped/crashed — state "${state}"`,
      ).toBe(state === 'stopped' || state === 'crashed');
      expect(
        item(model, 'stop').enabled,
        `data-flows §2.3: Stop offered only while running — state "${state}"`,
      ).toBe(state === 'running');

      // Labels: FR-41 names the items verbatim; AC-05.4's "Start/Stop tunnel"
      // is the only documented wording for the start/stop pair.
      expect(item(model, 'open').label, 'FR-41 verbatim item label').toBe('Show window');
      expect(item(model, 'quit').label, 'FR-41 verbatim item label').toBe('Quit');
      expect(
        item(model, 'start').label,
        'AC-05.4 "Start/Stop tunnel": the Start label names the action and the tunnel',
      ).toMatch(/^Start\b[\s\S]*\btunnel\b/i);
      expect(
        item(model, 'stop').label,
        'AC-05.4 "Start/Stop tunnel": the Stop label names the action and the tunnel',
      ).toMatch(/^Stop\b[\s\S]*\btunnel\b/i);
      for (const entry of model.items) {
        expect(
          typeof entry.label === 'string' && entry.label.trim().length > 0,
          `item "${entry.id}" must carry a non-empty text label (NFR-5, never color-only)`,
        ).toBe(true);
      }
    }
  });

  it('trayMenu.dispatch.actionsForwardToInjectedHandlers', async () => {
    // Plan M1-23 "menu (Open / Start / Stop / Quit)" — the three non-quit
    // actions forward to their injected handler and touch nothing else
    // (data-flows §4.2: tray actions are main-internal, reusing the same
    // supervisor/proxy functions as core:*/proxy:* — no IPC involved).
    const { lifecycle, recorder } = await loadLifecycle();

    await lifecycle.handleMenuAction('open');
    expect(recorder.calls, 'tray "Show window" must call showWindow exactly once').toEqual([
      'showWindow',
    ]);

    recorder.calls.length = 0;
    await lifecycle.handleMenuAction('start');
    expect(recorder.calls, 'tray "Start" must call startTunnel exactly once').toEqual([
      'startTunnel',
    ]);

    recorder.calls.length = 0;
    recorder.setLiveState('running'); // M2-11: live = running makes the "Stop" click legal
    await lifecycle.handleMenuAction('stop');
    expect(recorder.calls, 'tray "Stop" must call stopTunnel exactly once').toEqual(['stopTunnel']);
  });
});

// ————————————————————————————————————————————————————————————————
// M2-11 / issue #19 — tray freshness advisory: dispatch re-validates the
// LIVE state before `start`/`stop` forwards (TC-05-24, TC-05-25 — §8).
// A stale menu-template click (a push racing the click) must be a silent
// no-op, never an illegal transition attempt.
// ————————————————————————————————————————————————————————————————

describe('tray menu freshness re-check (M2-11, issue #19) — TC-05-24, TC-05-25', () => {
  it('trayMenu.dispatch.staleStartSkippedWhenLiveStateDisallows', async () => {
    const { lifecycle, recorder } = await loadLifecycle();
    // The template may still say "Start enabled" while the world moved on.
    recorder.setLiveState('running');
    await lifecycle.handleMenuAction('start');
    expect(
      recorder.calls,
      'TC-05-24 (issue #19 advisory): a stale Start click must NOT forward while the ' +
        'live state disallows it — re-validate against the buildTrayMenu model first',
    ).not.toContain('startTunnel');
  });

  it('trayMenu.dispatch.staleStopSkippedWhenLiveStateDisallows', async () => {
    const { lifecycle, recorder } = await loadLifecycle();
    recorder.setLiveState('stopped'); // Stop is only legal from `running`
    await lifecycle.handleMenuAction('stop');
    expect(
      recorder.calls,
      'TC-05-25: a stale Stop click must NOT forward outside `running` — the same ' +
        'freshness re-check as TC-05-24, opposite action',
    ).not.toContain('stopTunnel');
  });
});

describe('tray Quit teardown (US-05 AC-05.5, FR-19, data-flows §5) — TC-05-05', () => {
  it('trayQuit.stopsCoreRevertsProxyExitsFully', async () => {
    // FR-19 / data-flows §5 quit ordering: stop core → revert proxy → exit.
    // The teardown steps are injected as deferreds so the test can observe
    // that requestQuit runs LAST and only after every step has resolved.
    const stop = createDeferred();
    const restore = createDeferred();
    const { lifecycle, recorder } = await loadLifecycle({
      stopCore: () => stop.promise,
      restoreProxy: () => restore.promise,
    });

    let settled = false;
    const teardown = lifecycle.handleBeforeQuit().then(() => {
      settled = true;
    });

    await flushTasks();
    expect(
      recorder.calls,
      'step 1 runs first: the core is stopped before anything else (FR-19)',
    ).toEqual(['stopCore']);

    stop.resolve();
    await flushTasks();
    expect(
      recorder.calls,
      'step 2: the system proxy is reverted only after the core stop resolved (§5)',
    ).toEqual(['stopCore', 'restoreProxy']);
    expect(settled, 'the quit promise must not settle while teardown is pending').toBe(false);

    restore.resolve();
    await teardown;
    expect(
      recorder.calls,
      'step 3: requestQuit is the LAST call, after both teardown steps resolved (FR-42)',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);
    expect(settled, 'the promise resolves exactly when teardown completed').toBe(true);
  });

  it('trayQuit.doubleInvoke.singleTeardownIdempotent', async () => {
    // AC-05.5 / plan M1-23: quit twice (double-click, menu + before-quit) →
    // exactly ONE teardown: one stop, one proxy revert, one exit request.
    const { lifecycle, recorder } = await loadLifecycle();

    await Promise.all([
      lifecycle.handleMenuAction('quit'),
      lifecycle.handleMenuAction('quit'),
      lifecycle.handleBeforeQuit(),
    ]);
    expect(
      recorder.calls,
      'concurrent quit requests share a single teardown (FR-19: the core is stopped once)',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);

    await lifecycle.handleBeforeQuit();
    await lifecycle.handleMenuAction('quit');
    expect(
      recorder.calls,
      'repeated quit after completion never re-runs the teardown (idempotent)',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);
  });

  it('trayQuit.menuDispatch.quitGoesThroughBeforeQuitTeardown', async () => {
    // Plan M1-23: the tray "Quit" item dispatches through the SAME teardown
    // as before-quit — identical observable call order, no shortcut exit.
    const { lifecycle, recorder } = await loadLifecycle();

    await lifecycle.handleMenuAction('quit');

    expect(
      recorder.calls,
      'tray Quit must run stopCore → restoreProxy → requestQuit (data-flows §5)',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);
  });

  it('trayQuit.stopFailure.proxyRestoreStillAttemptedAndQuitStillRequested', async () => {
    // AC-05.5 "the app exits fully" — a failing core stop must not strand the
    // quit and must not skip the proxy revert (FR-35 fail closed: never a
    // silent leftover). Whether the promise rejects is NOT pinned.
    const { lifecycle, recorder } = await loadLifecycle({
      stopCore: async () => {
        throw new Error('simulated core-stop failure');
      },
    });

    await lifecycle.handleBeforeQuit().catch(() => undefined);

    expect(
      recorder.calls,
      'a stopCore failure still reverts the proxy and still requests the exit (§5, FR-35)',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);
  });

  it('trayQuit.restoreFailure.quitStillRequested', async () => {
    // FR-35 / data-flows §5: revert failure → E-PLAT-003 warning (M1-20 owns
    // the wording) but the quit proceeds — no orphan, no hung quit (AC-05.5).
    const { lifecycle, recorder } = await loadLifecycle({
      restoreProxy: async () => {
        throw new Error('simulated proxy-restore failure');
      },
    });

    await lifecycle.handleBeforeQuit().catch(() => undefined);

    expect(
      recorder.calls,
      'a restoreProxy failure must never prevent requestQuit — the app exits fully',
    ).toEqual(['stopCore', 'restoreProxy', 'requestQuit']);
  });
});

describe('tray state while the window is closed (US-05 AC-05.6, FR-43) — TC-05-06', () => {
  it('tray.crashWhileMinimized.menuStateUpdatesWithoutWindow', async () => {
    // AC-05.6: a core crash updates the tray text while the window is NOT
    // open — the model is a pure function of state (the builder takes no
    // window argument), so a crash observed from tray-only operation is
    // reflected by rebuilding from the new state alone.
    const { menu } = await loadLifecycle();

    const before = menu('running');
    expect(before.statusText, 'running tray text before the crash (FR-41)').toBe('Running');

    const after = menu('crashed');
    expect(
      after.statusText,
      'FR-43: the crash reaches the tray as text without the window being open',
    ).toBe('Core crashed');
    expect(
      item(after, 'start').enabled,
      'data-flows §2.3: after a crash Start is offered for manual recovery (AC-03.6)',
    ).toBe(true);
    expect(
      item(after, 'stop').enabled,
      'data-flows §2.3: after a crash Stop is not offered — there is nothing running',
    ).toBe(false);
  });
});

describe('launch shows the main window (owner decision, issue #25; FR-38 amended) — TC-05-14', () => {
  it('tray.launch.showsMainWindowOnEveryLaunch', async () => {
    // Owner decision 2026-10-08 (issue #25) amends BRIEF §2.5 / FR-38 /
    // PRD row 5: a fresh launch SHOWS the main window — the hidden-to-tray
    // wording is retired and Q-C's hidden half is resolved (§14 DV-58).
    const first = await loadLifecycle();
    expect(
      first.lifecycle.shouldShowWindowOnLaunch(),
      'FR-38 (amended, issue #25): the launch policy answers SHOW — index.ts ' +
        'performs the launch-time show() (pinned natively by TC-05-23)',
    ).toBe(true);
    expect(
      first.recorder.calls,
      'the policy module records no lifecycle side effect itself — the launch show ' +
        'belongs to the index.ts wiring',
    ).toEqual([]);

    // "Every launch" half: a second independent launch instance reports the
    // same policy (nothing stateful leaks between launches).
    const second = await loadLifecycle();
    expect(second.lifecycle.shouldShowWindowOnLaunch(), 'policy holds for a relaunch').toBe(true);
  });

  it('tray.openShowsTheWindowOnDemand', async () => {
    // FR-40 (unchanged by issue #25): tray "Open" routes the show through the
    // lifecycle — after the launch already showed the window it re-shows /
    // focuses it; the module itself performs no show without the menu action.
    const { lifecycle, recorder } = await loadLifecycle();

    await flushTasks();
    expect(recorder.calls, 'no lifecycle show without a tray interaction').toEqual([]);

    await lifecycle.handleMenuAction('open');
    expect(recorder.calls, 'tray "Open" shows/focuses the window (FR-40/AC-05.3)').toEqual([
      'showWindow',
    ]);
  });
});

describe('lifecycle module boundary (plan M1-22/M1-23 purity; TC-01-15/TC-06-14 scan style) — TC-05-15', () => {
  it('windowLifecycle.boundary.moduleImportsNoElectronOrIpcPrimitives', () => {
    // The policy layer must stay pure node — Electron wiring (BrowserWindow,
    // Tray, Menu, app.quit) belongs to src/main/index.ts in M1-23 — exactly
    // like the core-supervisor/system-proxy/log-collector purity siblings, so
    // this suite runs in the plain node env without an electron mock.
    expect(
      existsSync(WINDOW_LIFECYCLE_SOURCE),
      'src/main/window-lifecycle.ts must exist — M1-23 GREEN implements the M1-22 contract',
    ).toBe(true);

    const source = stripComments(readFileSync(WINDOW_LIFECYCLE_SOURCE, 'utf8'));

    const specifiers = [
      ...source.matchAll(
        /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
    for (const specifier of specifiers) {
      expect(
        specifier === 'electron' || specifier.startsWith('electron/'),
        `TC-05-15: the window-lifecycle module must not import '${specifier}' — ` +
          'pure policy, electron wiring belongs to M1-23',
      ).toBe(false);
    }
    for (const primitive of [
      'ipcMain',
      'ipcRenderer',
      'contextBridge',
      'BrowserWindow',
      'webContents',
      'nativeImage',
      'buildFromTemplate',
      'new Tray(',
    ]) {
      expect(
        source.includes(primitive),
        `TC-05-15: src/main/window-lifecycle.ts must not reference '${primitive}' — ` +
          'every side effect travels through the injected deps (data-flows §4.2: ' +
          'tray/window actions are main-internal, never IPC)',
      ).toBe(false);
    }

    // The contract exports are pinned by name (DV-27), so a rename cannot
    // silently disconnect this suite from the module.
    for (const name of ['createWindowLifecycle', 'buildTrayMenu']) {
      expect(
        source,
        `M1-22 contract: src/main/window-lifecycle.ts must export ${name} by name`,
      ).toMatch(
        new RegExp(
          `export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
        ),
      );
    }
  });
});

/** `//`/`/* *\/` comments removed before structural scanning (cf. TC-01-15). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

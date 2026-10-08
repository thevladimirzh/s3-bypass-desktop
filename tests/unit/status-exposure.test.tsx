// @vitest-environment jsdom
/**
 * M1-16 (RED) — status exposure, renderer half: the StatusSnapshot main pushes
 * on `status:changed` must reach the main window as a TEXT status label, the
 * last error must be readable on screen without stacks or secrets, and the
 * Start/Stop controls must follow the §2.3 guards (disabled/busy states).
 *
 * Test plan IDs: TC-03-15 (`status.exposure.rendererReceivesAllTransitions`,
 * renderer half — the main/push half and its structural sibling live in
 * `tests/unit/core-wiring.test.ts`), TC-03-16
 * (`status.exposure.rendererReceivesLastErrorString`, renderer half), TC-03-07
 * (`status.render.textLabelPresentNeverColorOnly`), TC-03-04
 * (`status.lastErrorDisplayed.selectableNoStackTrace`), TC-03-13
 * (`status.longErrorText.truncatedButCopyGivesFullTextNoSecrets`), TC-02-03
 * (`supervisor.startControl.noProfile.disabledWithImportHint`, component half;
 * the main-guard siblings are in core-wiring.test.ts), NEW TC-02-15
 * (`startStop.controls.disabledBusyStatesFollowStatus`, §14 DV-28), NEW
 * TC-02-25 (`startStop.controls.singleRoundConnectToggle`, issue #26), TC-04-04
 * (`systemProxyToggle.coreNotRunning.disabledWithStartHint`), TC-01-08
 * (`profileImport.reimport.replacesProfileAndShowsActiveName`) —
 * docs/qa/m1-test-plan.md §1–§5 rows, the M1-16 row in §10, counts in §13,
 * deviations in §14 (DV-28).
 *
 * Spec sources: docs/analysis/data-flows.md flow (b) §2.1/§2.3 (one push per
 * transition, `lastError` retained from `crashed`, cleared only on successful
 * `→ running`) and §5 (startup path `profile:get → status:get → render`),
 * §4.2 (`status:get`, `status:changed`, `core:start`/`core:stop` rows);
 * docs/analysis/requirements.md FR-24..FR-27, FR-12 (exact hint wording),
 * FR-13 ("the button switches to Stop"), FR-18 (single child — UI half),
 * FR-30 (exact hint wording), FR-63 (push, never polled), A-14 (busy text on
 * the same badge; wording open per DV-27(5)); docs/analysis/errors.md §3
 * E-CORE-001 (exact triple); docs/product/stories/US-03 AC-03.1..AC-03.5,
 * US-02 AC-02.1/AC-02.3/AC-02.7, US-04 AC-04.4, US-01 AC-01.7; plan M1-16 →
 * M1-17 ("Start/Stop button behavior incl. disabled/busy states").
 *
 * Layer: L1 component, jsdom (strategy §2) — the bridge is a plain stub, no
 * Electron, no network, no process (§1). Synthetic data only: fake profiles
 * on reserved hosts, fake errors, one canary used solely as a negative probe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-17's renderer half (declared here — header-contract style,
 * cf. DV-09/DV-16/DV-23/DV-25/DV-27; any deviation requires an upstream spec
 * note first, strategy §5.2):
 *
 *  - App registers ONE `onStatusChanged` listener at mount and fetches
 *    `getStatus()` exactly ONCE for the §5 startup render; every later update
 *    arrives by push — never a second `getStatus()` poll (FR-63).
 *  - Status TEXT label (FR-24/AC-03.1, never color-only): the visible-state
 *    wording mirrors the FR-41 tray text verbatim — `Stopped`, `Running`,
 *    `Core crashed`. Transient `starting`/`stopping` render busy text on the
 *    SAME badge (A-14; wording open, DV-27(5) precedent) — pinned here as:
 *    the previous visible label is retired and the badge is never blank.
 *  - Controls (single-button or two-button layouts both satisfy the pins):
 *    `stopped`/`crashed` + profile → an ENABLED Start control exists
 *    (AC-02.1, AC-03.6 recovery); `running` → an ENABLED Stop control exists
 *    and NO Start control is enabled (FR-13 "the button switches to Stop");
 *    during `starting`/`stopping` → no enabled Start AND no enabled Stop
 *    (busy/disabled — plan M1-17 explicit; §12.1 addendum). Clicking the
 *    enabled Start/Stop invokes `startCore()`/`stopCore()` once (§4.2).
 *  - LAYOUT (NEW TC-02-25, owner decision issue #26, 2026-10-08): the
 *    controls section renders EXACTLY ONE round connect toggle
 *    (`.connect-toggle`, `border-radius: 50%`, ≥ 6rem square) whose
 *    accessible name is EXACTLY `Start` (stopped/crashed/starting) or `Stop`
 *    (running/stopping) — the exact-name seam the e2e smoke and the .fm
 *    drivers click. The two-layout tolerance above stays TC-02-15's guard
 *    contract; the LAYOUT itself is pinned here.
 *  - FR-12 (no profile): the Start control EXISTS but is disabled, with the
 *    exact visible hint "Import a profile first".
 *  - FR-30/AC-04.4: while status ≠ `running` the proxy toggle is rendered as
 *    a checkbox/switch control (US-04 "One toggle" — a plain button is not a
 *    toggle) that is disabled, with the exact visible hint "Start the tunnel
 *    first"; a pushed `running` retires the hint. The functional On/Off
 *    behavior itself stays M1-21's contract.
 *  - Error display (AC-03.4/AC-03.5/FR-27): the pushed E-CORE-001 triple is
 *    rendered as document TEXT — text nodes, selectable/copyable, not only
 *    attributes/ARIA — with no stack trace anywhere in the document; §2.3
 *    retention: still on screen through the recovery `starting`, cleared only
 *    on a successful `→ running`; a LONG cause keeps its full text available
 *    (tooltip or copy) while its head stays visible, and secrets never
 *    surface (US-06 redaction rules apply — the canary is a negative probe).
 *
 * RED status: ABSENCE RED — `src/renderer/src/App.tsx` has no status label,
 * no Start/Stop control, no proxy toggle and registers no `onStatusChanged`
 * listener (all land with plan M1-17), so every case fails at its first
 * contract-named query. Strategy §5.2: legitimate first-test-of-a-subsystem
 * failure; do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/renderer/src/App';
// The stylesheet as TEXT for the TC-02-25 shape scan (jsdom applies no CSS);
// `?raw` is typed by vite/client, which this web tsconfig already loads — no
// node builtin may enter the renderer test project.
import stylesCss from '../../src/renderer/src/styles.css?raw';
import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import type {
  AppError,
  ProfileImportResult,
  ProfileSummary,
  StatusSnapshot,
} from '../../src/shared/ipc';

afterEach(cleanup);

/** errors.md §3 E-CORE-001 — the exact triple main pushes after an unexpected exit. */
const E_CORE_001: AppError = {
  code: 'E-CORE-001',
  title: 'The tunnel stopped unexpectedly',
  cause: 'The tunnel engine exited with code 3: fake-core: simulated fatal storage failure.',
  nextStep: 'Click Start to try again; if it repeats, check the Logs view.',
};

/** US-03 edge fixture: a long cause, redaction marker inline, canary NEVER inside it. */
const LONG_CAUSE =
  'The tunnel engine exited with code 3: fake-core: simulated fatal storage failure — ' +
  'synthetic long-form diagnostic tail (endpoint redacted as [REDACTED]) '.repeat(8) +
  'x'.repeat(400);
const LONG_ERROR: AppError = { ...E_CORE_001, cause: LONG_CAUSE };

/** §9.3 canary — must never surface anywhere in the status area (negative probe). */
const CANARY_PROBE = 'EXAMPLESECRETKEY0123456789';

const STOPPED: StatusSnapshot = {
  state: 'stopped',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};
const STARTING: StatusSnapshot = {
  state: 'starting',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};
const RUNNING: StatusSnapshot = {
  state: 'running',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};
const STOPPING: StatusSnapshot = {
  state: 'stopping',
  lastError: null,
  socksPort: DEFAULT_SOCKS_PORT,
};
const CRASHED: StatusSnapshot = {
  state: 'crashed',
  lastError: E_CORE_001,
  socksPort: DEFAULT_SOCKS_PORT,
};

/** Synthetic profiles on reserved hosts (§1) — AC-01.7's "two valid configs". */
const OLD_PROFILE: ProfileSummary = {
  displayName: 'vlt-alpha @ s3.example.com',
  endpointHost: 's3.example.com',
  bucket: 'example-bucket',
  prefix: 'tunnels',
  region: 'eu-central-1',
  importedAt: '2026-01-01T00:00:00.000Z',
  socksPort: DEFAULT_SOCKS_PORT,
};
const NEW_PROFILE: ProfileSummary = {
  ...OLD_PROFILE,
  displayName: 'vlt-beta @ s3.example.com',
  bucket: 'example-bucket-2',
  importedAt: '2026-02-02T00:00:00.000Z',
};

/** FR-41 visible-state wording — FR-24 mirrors it into the main window. */
const LABEL_STOPPED = 'Stopped';
const LABEL_RUNNING = 'Running';
const LABEL_CRASHED = 'Core crashed';

/** FR-12 / FR-30 — exact user-visible hint wording, verbatim. */
const HINT_NO_PROFILE = 'Import a profile first';
const HINT_PROXY_GUARD = 'Start the tunnel first';

interface BridgeRig {
  readonly getStatus: ReturnType<typeof vi.fn>;
  readonly startCore: ReturnType<typeof vi.fn>;
  readonly stopCore: ReturnType<typeof vi.fn>;
  /** Number of onStatusChanged listeners App registered (FR-63: exactly one). */
  readonly subscriptions: () => number;
  /** Simulates main's `webContents.send('status:changed', snapshot)` (FR-63). */
  readonly push: (snapshot: StatusSnapshot) => void;
}

function installBridge(
  options: {
    readonly status?: StatusSnapshot;
    readonly profile?: ProfileSummary | null;
    readonly importResult?: ProfileImportResult;
  } = {},
): BridgeRig {
  const listeners: Array<(snapshot: StatusSnapshot) => void> = [];
  const getStatus = vi.fn(async (): Promise<StatusSnapshot> => options.status ?? STOPPED);
  const startCore = vi.fn(async () => ({ ok: true }) as const);
  const stopCore = vi.fn(async () => ({ ok: true }) as const);
  const profile = options.profile === undefined ? null : options.profile;

  window.s3Bypass = {
    ping: async () => ({ ok: true, app: 'S3 Bypass Desktop', socksPort: DEFAULT_SOCKS_PORT }),
    versions: { electron: '0', chrome: '0', node: '0' },
    getStatus,
    getProfile: async () => ({ summary: profile }),
    importProfileDialog: vi.fn(
      async (): Promise<ProfileImportResult> =>
        options.importResult ?? ({ ok: true, summary: NEW_PROFILE } as const),
    ),
    startCore,
    stopCore,
    getProxy: async () => ({
      supported: true,
      active: false,
      hint: { host: '127.0.0.1' as const, port: DEFAULT_SOCKS_PORT },
    }),
    onStatusChanged: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
  };

  return {
    getStatus,
    startCore,
    stopCore,
    subscriptions: () => listeners.length,
    push: (snapshot) => {
      if (listeners.length === 0) {
        throw new Error(
          'M1-17 contract missing: App never registered an onStatusChanged listener — ' +
            'FR-63/FR-26: every supervisor transition is PUSHED main→renderer ' +
            '(data-flows (b) step 7), never polled. Absence RED until M1-17 wires the ' +
            'exposure path (strategy §5.2).',
        );
      }
      act(() => {
        for (const listener of [...listeners]) listener(snapshot);
      });
    },
  };
}

async function requireSubscription(rig: BridgeRig): Promise<void> {
  await waitFor(() => {
    if (rig.subscriptions() === 0) {
      throw new Error(
        'M1-17 contract missing: App never registered an onStatusChanged listener — ' +
          'FR-63/FR-26: every supervisor transition is PUSHED main→renderer ' +
          '(data-flows (b) step 7), never polled. Absence RED until M1-17 wires the ' +
          'exposure path (strategy §5.2).',
      );
    }
  });
}

/**
 * Elements whose own text contains `fragment` — a text label (FR-24) is a
 * text node: attribute- or class-only state can never match here.
 */
function textNodesContaining(fragment: string): HTMLElement[] {
  return screen.queryAllByText((content) => content.includes(fragment));
}

async function expectVisibleText(fragment: string, message: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  const contractError = (): Error =>
    new Error(`M1-17 contract missing: ${message} (strategy §5.2 absence RED)`);
  await waitFor(() => {
    found = textNodesContaining(fragment).find(
      (element) => (element.textContent ?? '').trim().length > 0,
    );
    if (found === undefined) throw contractError();
  });
  if (found === undefined) throw contractError();
  return found;
}

/** The status badge carrying `label` (FR-24/AC-03.1 — text, never color-only). */
async function expectStatusLabel(label: string, context: string): Promise<HTMLElement> {
  return expectVisibleText(
    label,
    `no non-empty TEXT status label containing "${label}" ${context} — FR-24/AC-03.1: the ` +
      'current status is always visible in the main window as a text label (never ' +
      'color-only), mirroring the FR-41 wording Running/Stopped/Core crashed (FR-24)',
  );
}

function buttonsNamed(name: RegExp): HTMLElement[] {
  return screen.queryAllByRole('button', { name });
}

function isEnabled(control: HTMLElement): boolean {
  return (
    (control as HTMLElement & { disabled?: boolean }).disabled !== true &&
    control.getAttribute('aria-disabled') !== 'true'
  );
}

function enabledButtons(named: HTMLElement[]): HTMLElement[] {
  return named.filter(isEnabled);
}

function toggleControls(): HTMLElement[] {
  return [...screen.queryAllByRole('checkbox'), ...screen.queryAllByRole('switch')];
}

function expectEnabledControl(named: HTMLElement[], message: string): void {
  expect(enabledButtons(named).length, message).toBeGreaterThan(0);
}

function expectNoEnabledControl(named: HTMLElement[], message: string): void {
  expect(enabledButtons(named), message).toEqual([]);
}

/** First enabled control of `named`, or a contract error (never `undefined`). */
function firstEnabled(named: HTMLElement[], context: string): HTMLElement {
  const first = enabledButtons(named)[0];
  if (first === undefined) {
    throw new Error(
      `M1-17 contract missing: no enabled control to click ${context} — FR-13/§4.2: the ` +
        'legal action must be reachable (strategy §5.2 absence RED)',
    );
  }
  return first;
}

// ————————————————————————————————————————————————————————————————
// TC-03-15 / TC-03-16 renderer halves + TC-03-07 (FR-24, FR-26, FR-63, §2.3)
// ————————————————————————————————————————————————————————————————

describe('status exposure — pushed transitions reach the main window (FR-24/FR-26/FR-63)', () => {
  it('status.exposure.rendererReceivesAllTransitions', async () => {
    // TC-03-15 renderer half: one listener, one startup fetch, then every §2.3
    // transition observable on screen — visible states by their FR-41 wording,
    // transient states by the retirement of the previous label (A-14: busy
    // text replaces it on the same badge; wording stays open, DV-27(5)).
    const rig = installBridge();
    render(<App />);

    await requireSubscription(rig);
    expect(
      rig.subscriptions(),
      'FR-63: App subscribes exactly once — no duplicate status listeners',
    ).toBe(1);
    expect(
      rig.getStatus,
      'data-flows §5: status:get answers ONCE at startup; every later update is a push — ' +
        'a second getStatus() call would be polling (FR-63: pushed, never polled)',
    ).toHaveBeenCalledTimes(1);

    const initialBadge = await expectStatusLabel(LABEL_STOPPED, 'at mount (AC-03.3 / FR-25)');

    rig.push(STARTING);
    if (initialBadge.isConnected) {
      expect(
        (initialBadge.textContent ?? '').trim(),
        'A-14: transient states render busy text on the SAME badge — never a blank label',
      ).not.toBe('');
      expect(
        (initialBadge.textContent ?? '').includes(LABEL_STOPPED),
        'the badge must leave "Stopped" when the pushed → starting arrives (no stale label)',
      ).toBe(false);
    }
    expect(
      textNodesContaining(LABEL_STOPPED),
      'after → starting the previous visible label "Stopped" must be retired — evidence ' +
        'the pushed transition reached the renderer (FR-63)',
    ).toEqual([]);

    rig.push(RUNNING);
    await expectStatusLabel(LABEL_RUNNING, 'after → running (AC-03.2)');
    rig.push(STOPPING);
    expect(
      textNodesContaining(LABEL_RUNNING),
      'after → stopping the previous visible label "Running" must be retired (FR-63)',
    ).toEqual([]);

    rig.push(STOPPED);
    await expectStatusLabel(LABEL_STOPPED, 'after → stopped (AC-03.3)');
    rig.push(STARTING);
    expect(
      textNodesContaining(LABEL_STOPPED),
      'after the recovery → starting the label must be retired again (FR-63)',
    ).toEqual([]);

    rig.push(CRASHED);
    await expectStatusLabel(LABEL_CRASHED, 'after the unexpected exit (AC-03.4 / FR-25)');

    expect(
      rig.getStatus,
      'FR-63: all six updates arrived by push while getStatus() stayed at the single §5 ' +
        'startup call — the renderer must never poll status',
    ).toHaveBeenCalledTimes(1);
  });

  it('status.exposure.rendererReceivesLastErrorString', async () => {
    // TC-03-16 renderer half: the crash triple crosses untouched and follows
    // §2.3 retention on screen — kept through the recovery `starting`, cleared
    // only by a successful `→ running` (never by stop/stopped).
    const rig = installBridge();
    render(<App />);
    await requireSubscription(rig);

    rig.push(CRASHED);
    for (const field of [E_CORE_001.title, E_CORE_001.cause, E_CORE_001.nextStep]) {
      expect(
        textNodesContaining(field).length,
        `TC-03-16/AC-03.4: the crashed push's "${field}" must be displayed on screen ` +
          '(errors.md E-CORE-001 crosses the push unchanged)',
      ).toBeGreaterThan(0);
    }

    rig.push(STARTING);
    expect(
      textNodesContaining(E_CORE_001.cause).length,
      '§2.3: lastError is RETAINED from crashed through the recovery → starting — still ' +
        'displayed (AC-03.4)',
    ).toBeGreaterThan(0);

    rig.push(RUNNING);
    expect(
      textNodesContaining(E_CORE_001.cause),
      '§2.3/FR-27: lastError is cleared only on a successful → running — the screen must ' +
        'not keep showing the stale error',
    ).toEqual([]);
    expect(
      textNodesContaining(E_CORE_001.title),
      '§2.3/FR-27: the cleared error title must leave the screen with it',
    ).toEqual([]);
  });

  it('status.render.textLabelPresentNeverColorOnly', async () => {
    // TC-03-07 (AC-03.1/FR-24): each visible state is conveyed as TEXT — a
    // colored dot, class or aria-label alone can never satisfy a text query.
    const rig = installBridge();
    render(<App />);

    const stoppedBadge = await expectStatusLabel(LABEL_STOPPED, 'initially (AC-03.3)');
    expect(
      (stoppedBadge.textContent ?? '').trim(),
      'FR-24: the state is real, non-empty text — never color-only (NFR-5)',
    ).not.toBe('');

    await requireSubscription(rig);
    rig.push(RUNNING);
    await expectStatusLabel(LABEL_RUNNING, 'running (AC-03.2)');
    rig.push(CRASHED);
    await expectStatusLabel(LABEL_CRASHED, 'core-crashed (AC-03.4)');
  });
});

// ————————————————————————————————————————————————————————————————
// TC-03-04 / TC-03-13 — error display (AC-03.4, AC-03.5, FR-27, NFR-5)
// ————————————————————————————————————————————————————————————————

describe('status error display — selectable text, no stacks, no secrets (AC-03.5, FR-27)', () => {
  it('status.lastErrorDisplayed.selectableNoStackTrace', async () => {
    // TC-03-04: the triple is document TEXT (text nodes — what the user can
    // select and copy, AC-03.5) and no stack trace exists anywhere in the
    // document (FR-48 / NFR-5). The real selection/copy probe rides the L3
    // twin (row layer: component → L3).
    const rig = installBridge();
    render(<App />);
    await requireSubscription(rig);

    rig.push(CRASHED);
    for (const field of [E_CORE_001.title, E_CORE_001.cause, E_CORE_001.nextStep]) {
      expect(
        textNodesContaining(field).length,
        `AC-03.5/FR-27: "${field}" must be rendered as document TEXT — a text node is ` +
          'what the user can select and copy (attributes/ARIA alone do not count)',
      ).toBeGreaterThan(0);
    }
    expect(
      document.body.textContent ?? '',
      'FR-48/NFR-5: the displayed error must be free of stack traces',
    ).not.toMatch(/\n\s+at\s+\S+\(/);
  });

  it('status.longErrorText.truncatedButCopyGivesFullTextNoSecrets', async () => {
    // TC-03-13 (US-03 edge): a long cause stays readable at its head, the
    // FULL text remains available (tooltip or copy), and no secret/stack ever
    // surfaces. Visual truncation itself has no layout in jsdom — the
    // component half pins head-visible + full-available + no-secrets (§14
    // DV-28); the pixel-level truncation rides L3 with TC-03-04's twin.
    const rig = installBridge();
    render(<App />);
    await requireSubscription(rig);

    rig.push({ state: 'crashed', lastError: LONG_ERROR, socksPort: DEFAULT_SOCKS_PORT });

    expect(
      textNodesContaining(LONG_CAUSE.slice(0, 60)).length,
      'US-03 edge/AC-03.4: the long cause IS displayed — its head stays visible in place',
    ).toBeGreaterThan(0);

    expect(
      document.body.innerHTML.includes(LONG_CAUSE),
      'US-03 edge/FR-27: the FULL long text must remain available (tooltip or copy) even ' +
        'though it is truncated in place',
    ).toBe(true);

    expect(
      document.body.innerHTML,
      'FR-48/NFR-5: no stack trace in the long-error display',
    ).not.toMatch(/\n\s+at\s+\S+\(/);
    expect(
      document.body.innerHTML,
      'NFR-2 / US-06 redaction rules: the canary secret must never surface in the status area',
    ).not.toContain(CANARY_PROBE);
  });
});

// ————————————————————————————————————————————————————————————————
// TC-02-03 component half + NEW TC-02-15 — Start/Stop controls (FR-12/FR-13/FR-18, plan M1-17)
// ————————————————————————————————————————————————————————————————

describe('Start/Stop controls — guards and busy states (FR-12, FR-13, plan M1-17 explicit)', () => {
  it('supervisor.startControl.noProfile.disabledWithImportHint', async () => {
    // TC-02-03 component half (AC-02.3/FR-12): with no stored profile the
    // Start control exists but is disabled and the exact hint is visible.
    // The main-side step-0 guard (never constructs a supervisor) is pinned by
    // the sibling in core-wiring.test.ts.
    installBridge({ profile: null });
    render(<App />);

    await expectVisibleText(
      'No profile imported yet.',
      'the profile view must settle (getProfile answered null) before control guards are read',
    );

    const startControls = buttonsNamed(/\bstart\b/i);
    expect(
      startControls.length,
      'FR-12/AC-02.3: a Start control exists while no profile is imported — it must be ' +
        'DISABLED, not silently missing',
    ).toBeGreaterThan(0);
    expectNoEnabledControl(
      startControls,
      'FR-12: with no profile imported, NO Start control may be enabled',
    );
    expect(
      textNodesContaining(HINT_NO_PROFILE).length,
      `FR-12 exact hint wording: "${HINT_NO_PROFILE}" must be visible next to the ` +
        'disabled Start control',
    ).toBeGreaterThan(0);
  });

  it('startStop.controls.disabledBusyStatesFollowStatus', async () => {
    // TC-02-15 (new, §14 DV-28 — plan §12.1: M1-17's disabled/busy behavior
    // had no preceding RED task): the enabled control always matches the §2.3
    // legal action, and no enabled control exists for an illegal one.
    const rig = installBridge({ profile: OLD_PROFILE });
    render(<App />);

    await expectVisibleText(
      OLD_PROFILE.displayName,
      'the stored profile must settle (§5 startup: profile:get) before control guards are read',
    );

    expectEnabledControl(
      buttonsNamed(/\bstart\b/i),
      'stopped + profile → an ENABLED Start control must exist (AC-02.1; AC-03.6 recovery ' +
        'from crashed)',
    );
    expectNoEnabledControl(buttonsNamed(/\bstop\b/i), 'stopped → no enabled Stop control (§2.3)');

    await requireSubscription(rig);

    rig.push(STARTING);
    expectNoEnabledControl(
      buttonsNamed(/\bstart\b/i),
      'starting → busy: no enabled Start (FR-18 UI half)',
    );
    expectNoEnabledControl(buttonsNamed(/\bstop\b/i), 'starting → busy: no enabled Stop');

    rig.push(RUNNING);
    expectEnabledControl(
      buttonsNamed(/\bstop\b/i),
      'running → an ENABLED Stop control must exist (FR-13: the control switches to Stop)',
    );
    expectNoEnabledControl(buttonsNamed(/\bstart\b/i), 'running → no enabled Start control (§2.3)');

    rig.push(STOPPING);
    expectNoEnabledControl(buttonsNamed(/\bstart\b/i), 'stopping → busy: no enabled Start');
    expectNoEnabledControl(buttonsNamed(/\bstop\b/i), 'stopping → busy: no enabled Stop');

    rig.push(STOPPED);
    expectEnabledControl(buttonsNamed(/\bstart\b/i), 'back to stopped → Start enabled again');
    expectNoEnabledControl(buttonsNamed(/\bstop\b/i), 'back to stopped → no enabled Stop');

    rig.push(CRASHED);
    expectEnabledControl(
      buttonsNamed(/\bstart\b/i),
      'crashed → Start stays enabled for manual recovery (AC-03.6)',
    );
    expectNoEnabledControl(buttonsNamed(/\bstop\b/i), 'crashed → no enabled Stop');

    // Invocations: the enabled control drives the §4.2 bridge members.
    fireEvent.click(firstEnabled(buttonsNamed(/\bstart\b/i), 'while crashed (AC-03.6)'));
    await waitFor(() =>
      expect(
        rig.startCore,
        'clicking the enabled Start control invokes core:start once (FR-13, §4.2)',
      ).toHaveBeenCalledTimes(1),
    );

    rig.push(RUNNING);
    fireEvent.click(firstEnabled(buttonsNamed(/\bstop\b/i), 'while running (FR-13)'));
    await waitFor(() =>
      expect(
        rig.stopCore,
        'clicking the enabled Stop control invokes core:stop once (§4.2)',
      ).toHaveBeenCalledTimes(1),
    );
  });

  it('startStop.controls.singleRoundConnectToggle', async () => {
    // TC-02-25 — owner decision issue #26 (2026-10-08): the two-button
    // Start/Stop row is replaced by ONE large round connect toggle
    // (incy-style). jsdom computes no layout, so the round/large shape is a
    // structural + stylesheet source scan (TC-05-15/TC-01-15 scan-style
    // precedent); the guard semantics stay TC-02-15's pins above.
    const rig = installBridge({ profile: OLD_PROFILE });
    const { container } = render(<App />);

    await expectVisibleText(
      OLD_PROFILE.displayName,
      'the stored profile must settle (§5 startup: profile:get) before controls render',
    );

    const controls = container.querySelectorAll('.controls button');
    expect(
      controls.length,
      'issue #26: EXACTLY ONE action control in .controls — the single round ' +
        'toggle replaces the Start/Stop pair (two buttons = RED)',
    ).toBe(1);
    const toggle = controls[0] as HTMLButtonElement;
    expect(
      toggle.className,
      'issue #26: the toggle carries the connect-toggle marker class',
    ).toContain('connect-toggle');
    expect(
      toggle.getAttribute('aria-label'),
      'the exact accessible-name seam (e2e smoke + .fm drivers click name ' +
        '"Start" exact) reads Start while stopped',
    ).toBe('Start');

    await requireSubscription(rig);
    rig.push(RUNNING);
    const runningToggle = container.querySelector('.controls button') as HTMLButtonElement | null;
    expect(
      runningToggle?.getAttribute('aria-label'),
      'FR-13: the control switches to Stop while running (exact name)',
    ).toBe('Stop');
    expect(
      runningToggle?.disabled,
      'running → the single toggle is enabled for Stop (TC-02-15 guard half)',
    ).toBe(false);

    // The round + LARGE shape (issue #26) — a stylesheet source scan, since
    // jsdom applies no CSS (structural-pin precedent: TC-05-15 / TC-01-15).
    const rule = stylesCss.match(/\.connect-toggle\s*\{([^}]*)\}/);
    expect(rule, 'styles.css must define the .connect-toggle rule').not.toBeNull();
    const body = rule?.[1] ?? '';
    expect(body, 'issue #26: the toggle is a CIRCLE (border-radius: 50%)').toMatch(
      /border-radius:\s*50%/,
    );
    const width = body.match(/(?:^|[^-\w])width:\s*([\d.]+)rem/);
    const height = body.match(/(?:^|[^-\w])height:\s*([\d.]+)rem/);
    expect(width, '.connect-toggle pins a rem width (square canvas)').not.toBeNull();
    expect(height, '.connect-toggle pins a rem height (square canvas)').not.toBeNull();
    expect(
      Number(width?.[1]),
      'issue #26: width and height must be EQUAL — the control is a circle',
    ).toBe(Number(height?.[1]));
    expect(
      Number(width?.[1]),
      'issue #26: LARGE — at least 6rem across (incy-style, not a small pill)',
    ).toBeGreaterThanOrEqual(6);
  });
});

// ————————————————————————————————————————————————————————————————
// TC-04-04 — status-dependent proxy guard (FR-30, AC-04.4)
// ————————————————————————————————————————————————————————————————

describe('proxy toggle guard — disabled with the FR-30 hint while not running', () => {
  it('systemProxyToggle.coreNotRunning.disabledWithStartHint', async () => {
    // TC-04-04 (AC-04.4/FR-30): while status ≠ running the toggle is a
    // disabled checkbox/switch carrying the exact hint; the pushed `running`
    // retires the hint (this row sits in the M1-16 batch precisely because it
    // is status-driven — §10). The working On/Off behavior stays M1-21's.
    const rig = installBridge({ status: STOPPED });
    render(<App />);

    await expectVisibleText(
      HINT_PROXY_GUARD,
      `FR-30/AC-04.4 exact hint "${HINT_PROXY_GUARD}" must be visible while status ≠ running`,
    );

    const toggles = toggleControls();
    expect(
      toggles.length,
      'US-04 "One toggle": the system-proxy toggle must be rendered as a checkbox/switch ' +
        'control (a plain button is not a toggle)',
    ).toBeGreaterThan(0);
    for (const toggle of toggles) {
      expect(
        isEnabled(toggle),
        'FR-30/AC-04.4: the toggle is disabled whenever status ≠ running',
      ).toBe(false);
    }

    await requireSubscription(rig);
    rig.push(RUNNING);
    await waitFor(() =>
      expect(
        textNodesContaining(HINT_PROXY_GUARD),
        'FR-30: once running, the guard hint leaves the screen (the toggle is no longer ' +
          'held back by status)',
      ).toEqual([]),
    );
  });
});

// ————————————————————————————————————————————————————————————————
// TC-01-08 — re-import replaces the shown profile (AC-01.7, FR-05/FR-08)
// ————————————————————————————————————————————————————————————————

describe('profile re-import view — the UI shows which profile is active (AC-01.7)', () => {
  it('profileImport.reimport.replacesProfileAndShowsActiveName', async () => {
    // TC-01-08 (AC-01.7/FR-08): after a confirmed re-import the UI shows the
    // NEW profile as active and the replaced one is gone. Component half of
    // the §10 M1-16 row; the main-side confirmation/replace halves are
    // TC-01-31..33 (M1-13, profile-reimport.test.ts), the L3 twin rides
    // M1-24 (same ID, never renumbered — strategy §4.3).
    installBridge({ profile: OLD_PROFILE });
    render(<App />);

    expect(
      (await screen.findAllByText(OLD_PROFILE.displayName)).length,
      'before the re-import the stored profile is displayed (AC-01.7 Given)',
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /import profile/i }));

    expect(
      (await screen.findAllByText(NEW_PROFILE.displayName)).length,
      'AC-01.7: the newly imported profile replaces the old one and is shown as active',
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(OLD_PROFILE.displayName),
      'AC-01.7/FR-08: the replaced profile must no longer be displayed',
    ).toEqual([]);
  });
});

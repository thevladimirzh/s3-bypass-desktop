/**
 * M1-26 (RED) — S5-7 main half (GitHub issue #13): the `log:line` push must
 * be COALESCED — a 10 000-line burst must not become 10 000
 * `webContents.send` round-trips. Today `src/main/index.ts:94-102` subscribes
 * one send per stored line with no batching, so a core log flood freezes the
 * renderer with 10k IPC round-trips + 10k React renders (FR-46's guarantee
 * was implemented for the main buffer only).
 *
 * Test plan ID: TC-06-25 (docs/qa/m1-test-plan.md §6, allocated in §14
 * DV-32). The renderer half (TC-06-24) lives in
 * tests/unit/logs-renderer-cap.test.tsx; the collector bound itself stays
 * GREEN in tests/unit/log-buffer.test.ts (TC-06-01/02).
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-7 (fix: "Coalesce
 * pushes (e.g. flush at most every 250 ms / one per animation frame with the
 * lines accumulated in between)"; "push 10 000 lines through the stub
 * bridge; assert … a bounded number of renders"); docs/analysis/
 * requirements.md FR-46/FR-52 (memory must not grow unbounded under a log
 * flood — the bound must hold end-to-end), FR-63 (push channel, payload
 * unchanged per batch); docs/analysis/data-flows.md §2.1 step 6 + §4.2
 * (`log:line` push row); docs/product/stories/US-06-logs.md AC-06.1/06.3;
 * docs/qa/strategy.md §7 NFR-2 (redaction still runs in the collector
 * BEFORE any push — batching only coalesces already-redacted lines).
 *
 * Layer: L2 — the REAL `src/main/index.ts` (collector + subscribe wiring)
 * over the house mocked-electron harness, driven through the REAL
 * `core:start` handler; the supervisor is the injected factory seam
 * (`vi.mock('../../src/main/core-supervisor')`) whose `start()` floods the
 * REAL collector through `options.logSink` — no process is ever spawned
 * (strategy §1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 *  - A burst of N lines pushed through the collector reaches the renderer
 *    as a BOUNDED number of `log:line` IPC sends (this pin: ≤ N/10 — a
 *    250 ms coalescing window reduces the 10k burst to a handful of sends);
 *  - EVERY line of the burst is delivered (the last pushed line must be
 *    observable in a send payload — batching may not drop lines: FR-47
 *    "replaced, never dropped" + FR-63 payload unchanged);
 *  - the PAYLOAD SHAPE of one send is deliberately loose (single `LogLine`
 *    | `LogLine[]` | `{lines: …}` — the spec does not choose a shape;
 *    DV-32 "loose-but-true" flatten below observes all three);
 *  - redaction still runs before any send (collector-side, unchanged —
 *    TC-06-03 stays GREEN; the flood lines are PUBLIC so they pass through).
 *
 * RED status: ASSERTION RED — the discriminating assertion counts
 * `log:line` sends: today the per-line subscriber fires exactly 10 000
 * times. Never a mock-setup error: the harness fully supports today's
 * wiring (window, subscription, profile guard all work — the pushed-lines
 * precondition proves the flood reached the sink). Strategy §5.2 — do not
 * weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { describe, expect, it, vi } from 'vitest';

import type { OperationResult } from '../../src/shared/ipc';
import type { SupervisorOptions } from '../helpers/core-supervisor-stub';
import { waitFor } from '../helpers/core-supervisor-stub';

/** The burst size the report's test prescription pushes (S5-7 fix text). */
const BURST = 10_000;

/** Bounded sends for the burst: ≥10× coalescing (report: "flush at most every 250 ms"). */
const MAX_SENDS = BURST / 10;

/** What the fake Electron surface records: pushes + registrations + windows. */
interface RecordedWindow {
  readonly webContents: { send(channel: string, payload: unknown): void };
}

const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    windows: [] as RecordedWindow[],
    registrations: [] as Array<{ channel: string; handler: (...args: unknown[]) => unknown }>,
    sends: [] as Array<{ channel: string; payload: unknown }>,
    pushedLines: 0,
  };
});

vi.mock('electron', () => {
  class FakeWebContents {
    setWindowOpenHandler(): void {
      // test no-op: window-open policy is pinned by other suites
    }

    on(): void {
      // test no-op: navigation events are pinned by packaged-env-guard
    }

    send(channel: string, payload: unknown): void {
      probe.sends.push({ channel, payload });
    }
  }

  class FakeBrowserWindow {
    readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
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
      // test no-op
    }

    show(): void {
      // test no-op
    }

    focus(): void {
      // test no-op
    }

    restore(): void {
      // test no-op
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

  const recordAppEvent = (): void => {
    // app.on(...) registrations are out of scope for this suite
  };

  return {
    app: {
      isPackaged: false,
      whenReady: () => Promise.resolve(),
      on: recordAppEvent,
      addListener: recordAppEvent,
      quit: () => undefined,
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

/** A stored profile must exist so `core:start` reaches the factory (FR-12). */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => '{"outbounds":[{"protocol":"fedarisha","settings":{}}]}'),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/** No `networksetup`/`gsettings` command may ever run from this suite (§1). */
vi.mock('../../src/main/system-proxy', () => ({
  restoreSystemProxy: vi.fn(async () => ({ ok: true })),
  setSystemProxy: vi.fn(async () => ({ ok: true })),
}));

/** The supervisor surface this file's factory fake implements (local, so a
 * future `forceStop()` on the real interface cannot break typecheck). */
interface BurstSupervisor {
  start(): Promise<OperationResult>;
  stop(): Promise<OperationResult>;
  isRunning(): boolean;
}

/**
 * The flood seam: `start()` pushes BURST PUBLIC lines through
 * `options.logSink` — the REAL wiring hands that straight to the REAL
 * collector (index.ts:472-476), whose subscriber fans out to the recorded
 * `webContents.send`. Synchronous, so the whole burst lands in one tick
 * (the worst case S5-7 describes).
 */
vi.mock('../../src/main/core-supervisor', () => ({
  createSupervisor: (options: SupervisorOptions): BurstSupervisor => ({
    start: async (): Promise<OperationResult> => {
      for (let index = 0; index < BURST; index += 1) {
        options.logSink({ stream: 'stdout', text: `batch-flood line ${index}` });
        probe.pushedLines += 1;
      }
      return { ok: true };
    },
    stop: (): Promise<OperationResult> => Promise.resolve({ ok: true }),
    isRunning: (): boolean => true,
  }),
}));

/** The dev renderer URL the app itself loads (set in `vi.hoisted` above). */
const DEV_URL = 'http://localhost:5173/';
/** A frame on exactly the app's own dev document — the guard must allow it. */
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};

/** Lets the `app.whenReady()` path (tray + createWindow) run to completion. */
async function flushAsync(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/**
 * Loose-but-true payload flatten (DV-32): one send may carry a single
 * `LogLine`, a `LogLine[]`, or `{lines: …}` — the spec does not pin the
 * batch shape, so every one of those is observed as its `text` strings.
 * Any other shape contributes nothing (delivery would then fail the
 * last-line pin below — fail-LOSE, never fail-open).
 */
function payloadTexts(payload: unknown): string[] {
  if (typeof payload === 'string') return [payload];
  if (Array.isArray(payload)) return payload.flatMap((entry) => payloadTexts(entry));
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    if ('lines' in record) return payloadTexts(record['lines']);
    if ('text' in record && typeof record['text'] === 'string') return [record['text']];
  }
  return [];
}

/** Every `text` pushed on the `log:line` channel so far, in send order. */
function deliveredTexts(): string[] {
  return probe.sends
    .filter((entry) => entry.channel === 'log:line')
    .flatMap((entry) => payloadTexts(entry.payload));
}

describe('log:line push — coalesced batching under a flood (S5-7, issue #13)', () => {
  it('logs.push.batchedSendsFor10kLineBurstWithEveryLineDelivered', async () => {
    // TC-06-25 / FR-46 end-to-end: the supervisor floods the REAL collector
    // through the injected logSink; the collector's subscriber must reach
    // the renderer in a BOUNDED number of sends, with every line delivered.
    await flushAsync();

    const start = probe.registrations.find((entry) => entry.channel === 'core:start');
    if (start === undefined) {
      throw new Error('no ipcMain.handle registration captured for core:start');
    }
    void Promise.resolve(start.handler(TRUSTED_EVENT)).catch(() => undefined); // the flood is synchronous; the result itself is out of scope

    await waitFor(
      () => probe.pushedLines === BURST,
      5000,
      'the fake supervisor start() to push the whole burst through options.logSink',
    );
    expect(
      probe.pushedLines,
      'precondition: the burst really reached the collector — without it the send-count ' +
        'pin below would be vacuous (never the RED reason)',
    ).toBe(BURST);

    // Every line must arrive — batching coalesces, never drops (FR-63 /
    // FR-47 "replaced, never dropped"). Waits for a post-fix flush window
    // (the report allows up to 250 ms per batch).
    await waitFor(
      () => deliveredTexts().includes(`batch-flood line ${BURST - 1}`),
      5000,
      'the LAST flooded line to be delivered to the renderer in some log:line send payload',
    );

    const sends = probe.sends.filter((entry) => entry.channel === 'log:line');
    expect(
      sends.length,
      `S5-7/TC-06-25 (issue #13): a ${BURST}-line burst must reach the renderer in at ` +
        `most ${MAX_SENDS} log:line sends (≥10× coalescing — report fix: "flush at most ` +
        'every 250 ms / one per animation frame with the lines accumulated in between"). ' +
        'Today index.ts:94-102 sends ONE webContents.send per stored line, so this burst ' +
        `became ${sends.length} IPC round-trips + that many React renders (FR-46/FR-52: ` +
        'the bound must hold end-to-end)',
    ).toBeLessThanOrEqual(MAX_SENDS);

    // Completeness re-asserted outside the wait (the waitFor above is the
    // delivery barrier; this pins the count, not just the last line).
    expect(
      deliveredTexts().filter((text) => text.startsWith('batch-flood line ')).length,
      'every flooded line is delivered exactly as pushed — batching may coalesce payloads ' +
        'but may not drop or duplicate lines (FR-63 payload unchanged)',
    ).toBe(BURST);
  }, 30_000);
});

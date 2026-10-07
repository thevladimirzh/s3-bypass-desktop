// @vitest-environment jsdom
/**
 * M1-26 (RED) — S5-7 renderer half (GitHub issue #13): the Logs view mirror
 * must be capped at 2000 lines like main's buffer (FR-46 end-to-end).
 * Today `LogsView.tsx:25-28` appends every `log:line` push with
 * `setLines(prev => [...prev, line])` and no bound — under a core log flood
 * (loglevel "debug" is accepted by BR-V-13) the array grows without bound:
 * memory, plus a full-array copy per append and one row per line rendered.
 *
 * Test plan ID: TC-06-24 (docs/qa/m1-test-plan.md §6, allocated in §14
 * DV-32). The main-side batching half (TC-06-25) lives in
 * tests/unit/log-push-batching.test.ts; the copy/order component halves stay
 * GREEN in tests/unit/logs-view.test.tsx (TC-06-05).
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-7 (fix: "Cap the
 * renderer list at 2000 (drop oldest on append), mirroring main"; "Test:
 * push 10 000 lines through the stub bridge; assert list length <= 2000");
 * docs/analysis/requirements.md FR-46 ("memory must not grow unbounded in a
 * multi-day session or under a log flood", FR-46/FR-52); FR-63 (push-fed
 * view); docs/analysis/data-flows.md §2.1 step 6 ("bounded buffer (2000
 * lines) → push log:line" — the bound applies end-to-end); FR-47 (the
 * renderer never redacts — lines arrive already redacted, so a cap is the
 * renderer's only bound); docs/product/stories/US-06-logs.md AC-06.1
 * (oldest-first rows).
 *
 * Layer: L3 — the REAL `src/renderer/src/App.tsx` → `LogsView` in jsdom
 * (precedent tests/unit/logs-view.test.tsx), fed through the REAL bridge
 * subscription seam `window.s3Bypass.onLogLine`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 *  - The rendered list holds AT MOST 2000 rows after a 10 000-line push
 *    burst (the FR-46 cap mirrored from main's DEFAULT_MAX_LINES);
 *  - the NEWEST pushed line is present (a cap that keeps only the first
 *    2000 would pass a bare length check while freezing the view);
 *  - the OLDEST pushed line is evicted (drop-oldest on append — the same
 *    rule main's buffer applies, data-flows §2.1 step 6);
 *  - surviving rows stay in ASCENDING push order (AC-06.1 oldest-first is
 *    not to be traded for the bound);
 *  - rows keep the `li.log-row` shape (TC-06-05's copy test stays GREEN).
 *
 * RED status: ASSERTION RED — the discriminating first assertion counts
 * `li.log-row` elements: today the uncapped append stores all 10 000 lines
 * and renders 10 000 rows. Never a mock-setup error: the harness fully
 * supports today's component (the subscription and the empty snapshot both
 * work — logs-view.test.tsx is GREEN on the same bridge). Strategy §5.2 —
 * do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import App from '../../src/renderer/src/App';
import type { LogLine } from '../../src/shared/ipc';

afterEach(cleanup);

/** FR-46 cap mirrored into the renderer (report fix: "Cap … at 2000"). */
const CAP = 2000;

/** The burst size the report's test prescription pushes (S5-7 fix text). */
const BURST = 10_000;

/** The `onLogLine` listener LogsView registered — the push seam. */
let pushLine: ((line: LogLine) => void) | undefined;

/**
 * M0-baseline bridge (env.d.ts WindowBridge = Partial + ping/versions):
 * `getLogs` answers an empty snapshot FIRST so the flood below is the only
 * source of rows, and `onLogLine` captures the component's listener.
 */
function installBridge(): void {
  window.s3Bypass = {
    ping: async () => ({ ok: true, app: 'S3 Bypass Desktop', socksPort: 10808 }),
    versions: { electron: '0', chrome: '0', node: '0' },
    getLogs: async () => ({ lines: [] }),
    onLogLine: (listener) => {
      pushLine = listener;
      return () => {
        pushLine = undefined;
      };
    },
    clearLogs: async () => ({ ok: true }),
  };
}

/** One synthetic push payload — unique text per index, fixed ISO timestamp. */
function floodLine(index: number): LogLine {
  return {
    ts: '2026-01-01T00:00:00.000Z',
    level: 'info',
    source: 'core',
    text: `renderer-cap flood ${index}`,
  };
}

describe('Logs view — renderer mirror capped under a log flood (S5-7, issue #13)', () => {
  it('logs.rendererCap.boundedRowsAfter10kPushBurst', async () => {
    // TC-06-24 / FR-46 end-to-end: push 10 000 lines through the stub
    // bridge (the report's prescription) and cap the rendered list at 2000,
    // dropping the oldest — same bound main's buffer already enforces.
    installBridge();
    const { container } = render(<App />);

    // Precondition: the component subscribed (works today — GREEN).
    await waitFor(() => {
      expect(
        pushLine,
        'precondition: LogsView must subscribe to window.s3Bypass.onLogLine on mount ' +
          '(data-flows §4.2: subscribe BEFORE the snapshot, logs-view.test.tsx GREEN today)',
      ).toBeTypeOf('function');
    });
    // Flush the `getLogs` snapshot promise so the empty array lands BEFORE
    // the burst — otherwise a late snapshot could wipe the flood and pass
    // the length check vacuously.
    await act(async () => {
      await Promise.resolve();
    });
    const push = pushLine;
    if (push === undefined) {
      throw new Error('unreachable: the subscription precondition above failed');
    }

    act(() => {
      for (let index = 0; index < BURST; index += 1) {
        push(floodLine(index));
      }
    });

    // The discriminating pin: row count bounded by FR-46's 2000.
    const rows = Array.from(container.querySelectorAll('li.log-row'));
    expect(
      rows.length,
      `S5-7/TC-06-24 (issue #13): after a ${BURST}-line push burst the renderer list must ` +
        `hold at most ${CAP} rows (FR-46 "memory must not grow unbounded under a log ` +
        'flood", data-flows §2.1 step 6 — the bound applies end-to-end). Today ' +
        'LogsView.tsx:25-28 appends every line with no cap, so all rows are stored and ' +
        'rendered',
    ).toBeLessThanOrEqual(CAP);

    const texts = rows.map((row) => row.textContent ?? '');
    expect(
      texts.some((text) => text.includes(`renderer-cap flood ${BURST - 1}`)),
      'the NEWEST pushed line must be present — a cap that keeps only the first ' +
        `${CAP} lines would freeze the view at the flood's head (drop OLDEST on append)`,
    ).toBe(true);
    expect(
      texts.some((text) => text.includes('renderer-cap flood 0')),
      'the OLDEST pushed line must be EVICTED by the cap — the same drop-oldest rule ' +
        "main's 2000-line buffer applies (FR-46, data-flows §2.1 step 6)",
    ).toBe(false);

    const order = texts.map((text) => Number(/renderer-cap flood (\d+)/.exec(text)?.[1] ?? NaN));
    expect(
      order.every(
        (index, position) =>
          Number.isFinite(index) && (position === 0 || index > (order[position - 1] ?? -1)),
      ),
      'rows must stay in ASCENDING push order after capping (AC-06.1 oldest-first — the ' +
        'bound may not shuffle or reverse the view)',
    ).toBe(true);
  }, 30_000);
});

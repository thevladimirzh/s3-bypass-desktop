/**
 * M1-18 (RED) — bounded in-memory log buffer: cap, eviction, line conversion,
 * app events, subscribers, and the `logs:get`/`logs:clear` wiring contract.
 *
 * Test plan IDs: TC-06-01, TC-06-02 (+ clear/repush sibling), TC-06-11,
 * TC-06-12, and the M1-18 allocations TC-06-14, TC-06-15, TC-06-16, TC-06-17,
 * TC-06-18 — docs/qa/m1-test-plan.md §6, the M1-18 row in §10, allocations in
 * §14 (DV-25). Redaction of the same buffer lives in
 * `tests/unit/log-redaction.test.ts`; the renderer copy half (TC-06-05) in
 * `tests/unit/logs-view.test.tsx`.
 *
 * Spec sources: docs/analysis/requirements.md F7 (FR-45..FR-50, cap FR-46 =
 * 2000 lines per PRD §5 NFR-3 — a LINE count, not a byte size, both docs
 * agree), §8.4 (classification), NFR-2/NFR-3; docs/analysis/data-flows.md
 * flow (b) step 6 (line-based child output → redaction → bounded buffer →
 * push) and §4.2 (`logs:get`/`logs:clear`/`log:line`, `LogLine`/`LogsView`);
 * docs/product/stories/US-06-logs.md AC-06.1/06.2/06.6 + edge cases;
 * docs/qa/strategy.md §2 (L1, node env), §7 (NFR-2/NFR-3); plan M1-18/M1-19.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-19 (declared here — header-contract style, cf. DV-09/DV-16/
 * DV-23; any deviation requires an upstream spec note first, strategy §5.2):
 *
 *  module  : src/main/log-collector.ts   — pure node, NO electron import
 *            (structural guard TC-06-14; Electron wiring — webContents.send —
 *            belongs to src/main/index.ts, mirroring broadcastStatus)
 *  export  : createLogCollector(options?: { maxLines?: number }): LogCollector
 *            default cap = 2000 lines (FR-46 / PRD §5 NFR-3, "configurable
 *            constant")
 *
 *  LogCollector {
 *    push(line: CoreLogLine): LogLine
 *        // CoreLogLine = { stream: 'stdout'|'stderr', text } — the RAW shape
 *        // the M1-15 supervisor's `logSink(line)` delivers (see the pinned
 *        // contract in tests/unit/core-supervisor.test.ts header); the
 *        // collector is the single redaction entry point (FR-47): the
 *        // returned/stored/notified line is the REDACTED one (details in
 *        // tests/unit/log-redaction.test.ts header)
 *    pushApp(event: { text: string; level?: LogLine['level'] }): LogLine
 *        // app events (FR-45) through the SAME entry point; source 'app'
 *    get(): LogsView          // oldest-first array, ≤ cap, redacted (§4.2)
 *    clear(): void            // empties the buffer; cap still enforced after
 *    subscribe(fn: (line: LogLine) => void): () => void
 *        // one notification per stored line, push order, post-redaction;
 *        // returns unsubscribe (data-flows (d) H4 → webContents.send)
 *  }
 *
 *  Behavior pinned below:
 *  1. `push` maps CoreLogLine → LogLine: `source: 'core'` (both streams),
 *     `ts` = ISO-8601 (ipc.ts), array order = arrival order = oldest-first
 *     (AC-06.1). The stream→level mapping is UNSPECIFIED in the docs — only
 *     union membership is pinned (DV-25; QA may not invent a rule, DV-19).
 *  2. Cap: `createLogCollector()` (no args) holds exactly 2000 lines; the
 *     2001st push evicts the OLDEST (AC-06.2); 10 000-line flood ⇒ still 2000
 *     lines, first = #8001 (US-06 edge, NFR-3: bounded, no unbounded growth).
 *  3. `clear()` ⇒ `{ lines: [] }` (AC-06.6 data half); repush after clear
 *     starts fresh and the cap still applies.
 *  4. Stored line shape = EXACTLY `{ ts, level, source, text }` (ipc.ts
 *     `LogLine`) — no extra fields: a smuggled `raw`/`original` field would
 *     put the pre-redaction text on the bridge (FR-64 denylist).
 *  5. Non-UTF-8 core bytes decode to U+FFFD before reaching the collector and
 *     survive storage + JSON round-trip unchanged (US-06 edge: renderer never
 *     crashes). The bytes→string decode itself belongs to the M1-15 line
 *     reader; this pin guards the collector's half.
 *  6. Wiring (`src/main/index.ts`, data-flows (d) H4): `logs:get` handler
 *     returns the collector's `get()`, `logs:clear` calls `clear()`, the
 *     collector's `subscribe` feeds `webContents.send('log:line'|LOG_LINE, …)`
 *     — declared mirror of `broadcastStatus`/`STATUS_CHANGED`. The current
 *     `{lines: []}` / `{ ok: true }` placeholders (index.ts comments) are
 *     explicitly NOT pinned anywhere: `tests/unit/ipc-contract.test.ts` pins
 *     only the channel table/types, so this scan does not fight it.
 *
 * RED status: ABSENCE RED — `src/main/log-collector.ts` does not exist; every
 * behavioral case fails through `createCollector()` (non-literal dynamic
 * import + existsSync gate, see the helper header) and the structural cases
 * through their explicit gates. Strategy §5.2: legitimate
 * first-test-of-a-subsystem failure; do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { LogLine, LogsView } from '../../src/shared/ipc';
import {
  createCollector,
  decodedLines,
  logCollectorPath,
  pushAll,
  runFakeCoreMode,
  stripComments,
} from '../helpers/log-collector-stub';

/** ipc.ts `ts`: an ISO-8601 timestamp, not any parseable date string. */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const INDEX_SOURCE = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));

/** TC-06-18: the exact `LogLine` field set, checked on any line observation point. */
function expectExactLogLineShape(where: string, line: LogLine | undefined): void {
  expect(line, `TC-06-18: ${where} must carry a line`).toBeDefined();
  if (line === undefined) return; // unreachable — the expectation above throws
  expect(
    Object.keys(line).sort(),
    `TC-06-18: ${where} has exactly {ts, level, source, text} (ipc.ts LogLine)`,
  ).toEqual(['level', 'source', 'text', 'ts']);
  expect(typeof line.ts).toBe('string');
  expect(typeof line.text).toBe('string');
  expect(LEVELS).toContain(line.level);
  expect(['core', 'app']).toContain(line.source);
}

/**
 * Extracts the callback body of `ipcMain.handle('<channel>', …)` by brace
 * matching — robust to handler reordering, blind to object braces outside.
 */
function handlerBody(source: string, channel: string): string {
  const at = source.indexOf(`handle('${channel}'`);
  if (at < 0) return '';
  const arrow = source.indexOf('=>', at);
  const open = source.indexOf('{', arrow);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

describe('log collector — buffer bound and ordering (FR-45/FR-46; AC-06.1/06.2)', () => {
  it('logs.order.oldestFirstWithTimestamps', async () => {
    // TC-06-01: core stdout AND stderr lines arrive line-based, stored
    // oldest-first with ISO-8601 timestamps; push returns the stored line.
    const collector = await createCollector({ maxLines: 10 });
    const inputs = ['line one', 'line two', 'line three'];

    const returned = inputs.map((text, index) =>
      collector.push({ stream: index === 1 ? 'stderr' : 'stdout', text }),
    );

    const view = collector.get();
    expect(
      view.lines.map((line) => line.text),
      'AC-06.1: oldest-first, nothing dropped below the cap',
    ).toEqual(inputs);

    let previousStamp = Number.NEGATIVE_INFINITY;
    for (const line of view.lines) {
      expect(line.ts, 'AC-06.1/ipc.ts: every line carries an ISO-8601 timestamp').toMatch(ISO_8601);
      const stamp = Date.parse(line.ts);
      expect(
        Number.isFinite(stamp) && stamp >= previousStamp,
        'AC-06.1: timestamps are parseable and non-decreasing (oldest-first order is observable)',
      ).toBe(true);
      previousStamp = stamp;
      expect(line.source, 'data-flows (b) step 6: child output is source "core"').toBe('core');
      expect(LEVELS, 'ipc.ts: level is one of the documented values').toContain(line.level);
    }

    // The value that crosses `log:line`/`logs:get` is the stored (redacted)
    // line — push never returns more than the buffer holds.
    expect(returned[2], 'push returns the stored line').toEqual(view.lines[2]);
  });

  it('logs.buffer.at2001Lines.evictsOldestStaysBounded', async () => {
    // TC-06-02 / AC-06.2 / FR-46: default cap 2000 (PRD §5 NFR-3 — line
    // count); push 2001 → exactly the OLDEST line is evicted, order intact.
    const collector = await createCollector(); // default options — the FR-46 constant
    for (let i = 1; i <= 2001; i += 1) {
      collector.push({ stream: 'stdout', text: `line ${i}` });
    }

    const texts = collector.get().lines.map((line) => line.text);
    expect(texts.length, 'FR-46: bounded at 2000 lines').toBe(2000);
    expect(texts[0], 'the oldest line (#1) was evicted, not the newest').toBe('line 2');
    expect(texts[texts.length - 1], 'the newest line is retained').toBe('line 2001');
    expect(texts[texts.length - 10], 'the retained window is contiguous (2001−2000 … 2001)').toBe(
      'line 1992',
    );
  });

  it('logs.buffer.clearThenRepush.evictionStillEnforcesCap', async () => {
    // Sibling of TC-06-02 (DV-03 convention): after `clear()` the buffer is
    // empty (AC-06.6 data half) and the cap still applies to fresh lines —
    // eviction state must not survive the clear, and growth must not resume
    // unbounded.
    const collector = await createCollector({ maxLines: 3 });
    for (let i = 1; i <= 3; i += 1) collector.push({ stream: 'stdout', text: `old-${i}` });

    collector.clear();
    expect(collector.get().lines, 'AC-06.6: clear empties the buffer').toEqual([]);

    for (let i = 1; i <= 5; i += 1) collector.push({ stream: 'stdout', text: `new-${i}` });
    const texts = collector.get().lines.map((line) => line.text);
    expect(texts.length, 'the cap still holds after clear + repush').toBe(3);
    expect(texts, 'oldest evicted again: new-3 … new-5').toEqual(['new-3', 'new-4', 'new-5']);
  });

  it('logs.flood10k.boundHoldsNoUnboundedGrowth', async () => {
    // TC-06-12 / US-06 edge / NFR-3: a 10 000-line flood through a REAL
    // child process (§9.2 `flood` mode) must not grow the buffer past the
    // 2000-line bound or lose ordering.
    const collector = await createCollector(); // default 2000
    const run = await runFakeCoreMode('flood');
    expect(run.code, 'fixture sanity: flood exits 0').toBe(0);
    expect(run.stderr.toString('utf8'), 'flood writes only to stdout').toBe('');

    const lines = decodedLines(run.stdout);
    expect(lines.length, 'fixture sanity: 10 000 numbered lines').toBe(10_000);
    pushAll(collector, lines);

    const texts = collector.get().lines.map((line) => line.text);
    expect(texts.length, 'US-06 edge/NFR-3: bound holds under a flood').toBe(2000);
    expect(texts[0], 'oldest evicted: the window starts at line 8001').toBe(
      'fake-core: flood line 8001',
    );
    expect(texts[texts.length - 1], 'newest retained').toBe('fake-core: flood line 10000');
  });

  it('logs.lineShape.storedLineCarriesExactlyTsLevelSourceText', async () => {
    // TC-06-18 / FR-62 + §4.3: a stored line exposes EXACTLY the four
    // documented fields — no smuggled raw/original/secret field may ride the
    // bridge alongside the redacted text.
    const collector = await createCollector({ maxLines: 5 });
    const stored = collector.push({ stream: 'stdout', text: 'shape probe' });
    expectExactLogLineShape('push() return', stored);
    expectExactLogLineShape('get() line', collector.get().lines[0]);
  });
});

describe('log collector — conversion at the single entry point (data-flows (b) step 6, FR-45/FR-47)', () => {
  it('logs.nonUtf8Bytes.replacedWithUfffdRendererSurvives', async () => {
    // TC-06-11 / US-06 edge: a REAL child emitting invalid UTF-8 bytes
    // (§9.2 `nonutf8` mode) decodes to U+FFFD; the collector stores it
    // unmodified and the line stays JSON-serializable for the IPC hop — the
    // renderer never crashes on it.
    const collector = await createCollector({ maxLines: 10 });
    const run = await runFakeCoreMode('nonutf8');
    expect(run.code, 'fixture sanity: nonutf8 exits 0').toBe(0);

    const decoded = run.stdout.toString('utf8');
    expect(decoded, 'fixture sanity: the invalid bytes decoded to U+FFFD').toContain('\uFFFD');

    const lines = decodedLines(run.stdout);
    const stored = collector.push({ stream: 'stdout', text: lines[0] ?? '' });
    expect(stored.text, 'the collector stores the decoded text unchanged').toBe(lines[0]);
    expect(stored.text, 'U+FFFD survives storage').toContain('\uFFFD');

    const roundTrip: LogsView = JSON.parse(JSON.stringify(collector.get()));
    expect(
      roundTrip.lines[0]?.text,
      'the `log:line`/`logs:get` JSON round-trip preserves U+FFFD (renderer survival)',
    ).toBe(stored.text);
  });

  it('logs.appEvents.pushAppEmitsSourceAppThroughSingleRedactionEntry', async () => {
    // TC-06-17 / FR-45 ("core stdout/stderr + app events"): app events enter
    // the SAME buffer, oldest-first with the core lines, source 'app'; the
    // level passes through; and app lines are redacted at the same single
    // entry point (FR-47 — canary assertion is the redaction suite's twin).
    const collector = await createCollector({ maxLines: 10 });
    collector.push({ stream: 'stdout', text: 'core line' });
    const warned = collector.pushApp({ text: 'profile import started', level: 'warn' });
    const plain = collector.pushApp({ text: 'scheduled check' });

    expect(warned.source, 'FR-45: app events are source "app"').toBe('app');
    expect(warned.level, 'the explicit level is preserved').toBe('warn');
    expect(plain.source).toBe('app');
    expect(LEVELS, 'omitted level still yields a documented value (default not pinned)').toContain(
      plain.level,
    );
    expect(
      collector.get().lines.map((line) => line.text),
      'AC-06.1: core and app lines interleave oldest-first in one buffer',
    ).toEqual(['core line', 'profile import started', 'scheduled check']);
  });
});

describe('log collector — subscribers (FR-47 push, FR-63 webContents.send)', () => {
  it('logs.subscribe.subscribersReceiveStoredRedactedLinesAndCanUnsubscribe', async () => {
    // TC-06-16: subscribe() notifies once per stored line, in push order,
    // with the very line the buffer holds (redaction happens BEFORE the
    // notify — the canary grep twin lives in log-redaction.test.ts), and the
    // returned unsubscribe stops further delivery.
    const collector = await createCollector({ maxLines: 10 });
    const received: LogLine[] = [];
    const spy = vi.fn((line: LogLine) => received.push(line));
    const unsubscribe = collector.subscribe(spy);
    expect(typeof unsubscribe, 'subscribe returns an unsubscribe function').toBe('function');

    collector.push({ stream: 'stdout', text: 'first' });
    collector.push({ stream: 'stderr', text: 'second' });

    const view = collector.get();
    expect(received, 'one notification per stored line, in order').toEqual(view.lines);

    unsubscribe();
    collector.push({ stream: 'stdout', text: 'third' });
    expect(spy, 'unsubscribe stops delivery').toHaveBeenCalledTimes(2);
    expect(
      collector.get().lines.map((line) => line.text),
      'unsubscribing never stops the buffer itself',
    ).toEqual(['first', 'second', 'third']);
  });
});

describe('logs:get / logs:clear wiring (data-flows (d), FR-45/FR-46/FR-63)', () => {
  it('logs.wiring.mainCollectorBacksLogsGetClearAndLogLinePush', () => {
    // TC-06-15: thin integration contract on src/main/index.ts — the invoke
    // handlers must be backed by the collector (so `logs:get` returns the
    // BUFFER, not the current `{lines: []}` placeholder), and the push channel
    // must be fed from the collector's subscribe. Structural source scan —
    // precedent TC-IPC-10 / TC-07-15 — deliberately avoiding a behavioral
    // pin that would contradict ipc-contract.test.ts's channel-table pins.
    expect(existsSync(INDEX_SOURCE), 'src/main/index.ts must exist').toBe(true);
    const source = stripComments(readFileSync(INDEX_SOURCE, 'utf8'));

    expect(
      /createLogCollector\s*\(/.test(source),
      'TC-06-15/data-flows (d): main constructs the log collector (M1-19 GREEN); ' +
        'the {lines:[]} placeholder must go',
    ).toBe(true);

    const getBody = handlerBody(source, 'logs:get');
    expect(getBody.length, 'src/main/index.ts registers logs:get (§4.2 allowlist)').toBeGreaterThan(
      0,
    );
    expect(
      getBody.includes('.get()'),
      'TC-06-15/FR-45: logs:get answers with the collector buffer, not a literal',
    ).toBe(true);

    const clearBody = handlerBody(source, 'logs:clear');
    expect(
      clearBody.length,
      'src/main/index.ts registers logs:clear (§4.2 allowlist)',
    ).toBeGreaterThan(0);
    expect(
      clearBody.includes('.clear()'),
      'TC-06-15/FR-46: logs:clear empties the collector buffer',
    ).toBe(true);

    expect(
      /\.subscribe\s*\(/.test(source),
      'TC-06-15/FR-63: main subscribes to the collector to forward lines',
    ).toBe(true);
    expect(
      /send\(\s*(?:['"]log:line['"]|LOG_LINE\b)/.test(source),
      'TC-06-15/data-flows (d): main pushes `log:line` (literal or LOG_LINE constant ' +
        'declared `satisfies IpcPushChannel`, mirroring STATUS_CHANGED)',
    ).toBe(true);
  });
});

describe('log collector — structural guards (NFR-2, plan M1-19 purity)', () => {
  it('logs.boundary.collectorModuleImportsNoIpcElectronOrRendererPrimitives', () => {
    // TC-06-14 (store-boundary style, TC-07-17/TC-01-15/TC-02-14 precedent):
    // the collector is the single redaction entry point and must stay pure
    // node — IPC primitives belong to index.ts's wiring (TC-06-15), never to
    // the module that sees raw child output (NFR-2: the fewer modules that
    // can reach unredacted text, the better).
    expect(
      existsSync(logCollectorPath()),
      'src/main/log-collector.ts must exist — M1-19 GREEN implements the M1-18 contract',
    ).toBe(true);

    const source = stripComments(readFileSync(logCollectorPath(), 'utf8'));

    const specifiers = [
      ...source.matchAll(
        /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
    for (const specifier of specifiers) {
      expect(
        specifier === 'electron' || specifier.startsWith('electron/'),
        `TC-06-14: the collector must not import '${specifier}' — pure node, ` +
          'webContents wiring belongs to src/main/index.ts',
      ).toBe(false);
    }

    for (const primitive of [
      'ipcRenderer',
      'ipcMain',
      'contextBridge',
      'exposeInMainWorld',
      'webContents',
      'BrowserWindow',
    ]) {
      expect(
        source.includes(primitive),
        `TC-06-14/NFR-2: src/main/log-collector.ts must not reference '${primitive}' ` +
          '(comments stripped; redaction stays out of IPC plumbing)',
      ).toBe(false);
    }

    expect(source, 'TC-06-14: the M1-19 contract exports createLogCollector by name').toMatch(
      /export\s+(?:async\s+)?function\s+createLogCollector|export\s+const\s+createLogCollector|export\s*\{[^}]*\bcreateLogCollector\b/,
    );
  });
});

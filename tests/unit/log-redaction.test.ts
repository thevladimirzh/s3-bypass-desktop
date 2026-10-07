/**
 * M1-18 (RED) — the single redaction entry point of the logs subsystem:
 * what happens to a line BEFORE it reaches the buffer, a subscriber, or the
 * `log:line` push.
 *
 * Test plan IDs: TC-06-03 (+ three siblings: before-store/notify, public
 * pass-through, echo-secrets pipeline), TC-06-04, TC-06-10, TC-01-07,
 * TC-NFR2-01 (buffer half (a)), TC-06-19 (new, §14 DV-25) —
 * docs/qa/m1-test-plan.md §1/§6/§8, the M1-18 row in §10. Buffer mechanics
 * live in `tests/unit/log-buffer.test.ts`.
 *
 * Spec sources: docs/analysis/requirements.md FR-47 (line is replaced with
 * `[REDACTED]` at the single entry point, BEFORE buffer/renderer), FR-48,
 * NFR-2, §8.4 (SECRET/INTERNAL/PUBLIC classification — the table below
 * discharges it, Q-AN-09 pending); docs/product/PRD.md §5 NFR-2 (redaction at
 * the single logging entry point, value → `[REDACTED]`); docs/analysis/
 * errors.md §0 (no stacks / exception class names in logs); docs/product/
 * stories/US-06-logs.md AC-06.3/06.4 + edge cases (oversize line, non-UTF-8);
 * docs/qa/strategy.md §7 NFR-2 (canary fixture, single-entry-point unit test,
 * pipeline test, full-loop grep `TC-NFR2-01` (a) half, forbidden-pattern
 * scan); docs/qa/m1-test-plan.md §9.3 (canaries).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REDACTION RULES PINNED HERE (secret class → behavior; mechanism declared by
 * FR-47's literal wording — "any line containing a secret field value is
 * replaced with `[REDACTED]`" — so a matching line is stored/returned/
 * notified as EXACTLY `[REDACTED]`, never merely trimmed; deviation DV-25):
 *
 *  | class                                | trigger on the input line                    | stored/returned/notified text   | source                        |
 *  |--------------------------------------|----------------------------------------------|---------------------------------|-------------------------------|
 *  | SECRET — canary values               | any line of canary.secrets.txt               | exactly `[REDACTED]`            | FR-47, AC-06.3, PRD NFR-2     |
 *  | SECRET — quoted config secret keys   | `"accessKey"`/`"secretKey"`/`"sessionToken"`/ | exactly `[REDACTED]`            | §8.4 SECRET, strategy §7.5    |
 *  |                                      | `"bucketPassword"`                           |                                 |                               |
 *  | SECRET — full config JSON            | config document markers (`"outbounds"`, …)   | exactly `[REDACTED]`            | §8.4 SECRET, FR-48, NFR-2     |
 *  | INTERNAL — bucket/endpoint/region/   | a CONFIGURED value from the imported config  | exactly `[REDACTED]`            | §8.4 INTERNAL [ASSUMPTION]    |
 *  | prefix/sessionsDir                   |                                              |                                 | (A-15, Q-AN-09)               |
 *  | Stack traces / exception classes     | `at … (` frames, `Error:`/`TypeError:` etc.  | forbidden content ABSENT —      | FR-48, errors.md §0           |
 *  |                                      |                                              | redact-or-drop, both accepted   | (no E-* code exists, DV-19)   |
 *  | PUBLIC (protocol, tags, listen, port,| nothing above matches                        | unchanged, byte-for-byte        | §8.4 PUBLIC                   |
 *  | loglevel, loopback, READY, …)        |                                              |                                 |                               |
 *  | Oversize (> 4 KiB)                   | length > 4096                                | truncated WITH a marker, after  | US-06 edge (marker text       |
 *  |                                      |                                              | redaction (marker ≤ 32 chars,   | unspecified — DV-25)          |
 *  |                                      |                                              | DV-25)                          |                               |
 *
 *  Redaction ORDER is asserted, not just absence: the stored buffer, the
 *  `push()` return, and every subscriber payload are grepped for canaries —
 *  zero hits — and `[REDACTED]` must be PRESENT where the secret line was
 *  (strategy §7.4: redaction asserted, not just absence).
 *
 *  NFR-5: no `AppError` exists for redaction (no `E-*` code in errors.md §0
 *  fits it — DV-19 rule), so no `expectHumanError` row applies to this batch;
 *  the shared `FORBIDDEN` rules from tests/helpers/error-wording.ts are
 *  applied to the buffer dump instead (TC-06-04).
 *
 * RED status: ABSENCE RED — `src/main/log-collector.ts` does not exist; every
 * behavioral case fails through `createCollector()` (see the helper header).
 * Strategy §5.2: legitimate first-test-of-a-subsystem failure; do not weaken,
 * skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it, vi } from 'vitest';

import type { LogLine } from '../../src/shared/ipc';
import { FORBIDDEN } from '../helpers/error-wording';
import {
  canaryConfigPath,
  createCollector,
  decodedLines,
  type LogCollector,
  pushAll,
  runFakeCoreMode,
} from '../helpers/log-collector-stub';
import { readCanaries, readCanaryConfig } from '../helpers/secret-store-stub';

/** §9.3 canaries — one synthetic secret per line (strategy §7 NFR-2.1). */
const CANARIES = readCanaries();

/** The REDACTED marker every rule above must produce (FR-47/PRD NFR-2). */
const REDACTED = '[REDACTED]';

/** §8.4 INTERNAL values, read FROM the imported config (never hardcoded). */
function internalValues(): Array<{ field: string; value: string }> {
  const doc = JSON.parse(readCanaryConfig()) as {
    outbounds?: Array<{ settings?: { storage?: Record<string, string> } }>;
  };
  const storage = doc.outbounds?.[0]?.settings?.storage ?? {};
  return ['bucket', 'endpoint', 'region', 'prefix', 'sessionsDir']
    .map((field) => ({ field, value: storage[field] ?? '' }))
    .filter((entry) => entry.value.length > 0);
}

/** The buffer dump strategy §7.4 greps: every stored line, newline-joined. */
function bufferDump(collector: LogCollector): string {
  return collector
    .get()
    .lines.map((line) => line.text)
    .join('\n');
}

/** Zero canary hits + `[REDACTED]` present — the shared NFR-2 dump assertion. */
function expectRedactedDump(dump: string, context: string): void {
  for (const canary of CANARIES) {
    expect(
      dump.includes(canary),
      `${context}: NFR-2 — canary "${canary}" must have 0 occurrences in the dump`,
    ).toBe(false);
  }
  for (const rule of FORBIDDEN) {
    expect(
      rule.pattern.test(dump),
      `${context}: the dump must not contain ${rule.label} (errors.md §0, FR-48)`,
    ).toBe(false);
  }
  expect(
    dump.includes(REDACTED),
    `${context}: redaction must be ASSERTED, not just absence — ${REDACTED} must be present (strategy §7.4)`,
  ).toBe(true);
}

describe('log redaction — the single entry point (FR-47, NFR-2, §8.4)', () => {
  it('logs.redaction.canarySecretsBecomeRedactedInBuffer', async () => {
    // TC-06-03 (unit half): every canary class — access key id, secret key,
    // session token, bucket password — through BOTH entry points and BOTH
    // streams: the line is replaced with exactly `[REDACTED]` (FR-47) in the
    // buffer AND in the value push() returns (what `log:line` would carry).
    expect(CANARIES.length, '§9.3 fixture sanity: 4 canaries').toBe(4);
    const collector = await createCollector({ maxLines: 50 });

    for (const canary of CANARIES) {
      const viaStdout = collector.push({
        stream: 'stdout',
        text: `core: upsert to ${canary} completed`,
      });
      expect(viaStdout.text, `FR-47: stdout line containing "${canary}" → ${REDACTED}`).toBe(
        REDACTED,
      );

      const viaStderr = collector.push({
        stream: 'stderr',
        text: `core: signature for ${canary} rejected`,
      });
      expect(viaStderr.text, `FR-47: stderr line containing "${canary}" → ${REDACTED}`).toBe(
        REDACTED,
      );

      const viaApp = collector.pushApp({ text: `app: stored key ${canary} in memory` });
      expect(viaApp.text, `FR-47: app-event line containing "${canary}" → ${REDACTED}`).toBe(
        REDACTED,
      );
    }

    // Quoted config secret keys (strategy §7.5 forbidden-pattern list): the
    // key+value form is a secret even when the value is not a canary.
    for (const keyLine of [
      'storage write ok {"accessKey": "whatever"}',
      'storage write ok {"secretKey": "whatever"}',
      'auth ok {"sessionToken": "whatever"}',
      'auth ok {"bucketPassword": "whatever"}',
    ]) {
      const stored = collector.push({ stream: 'stdout', text: keyLine });
      expect(
        stored.text,
        `§8.4 SECRET: a line carrying a quoted config secret key → ${REDACTED}`,
      ).toBe(REDACTED);
    }

    expectRedactedDump(bufferDump(collector), 'TC-06-03');
    expect(
      collector.get().lines.length,
      'replaced, never dropped: one stored line per pushed line (FR-47)',
    ).toBe(CANARIES.length * 3 + 4);
  });

  it('logs.redaction.happensBeforeStoreAndBeforeAnySubscriberPush', async () => {
    // Sibling of TC-06-03 (DV-03 convention): ORDER — the grep runs over the
    // stored buffer, the push() return, AND every subscriber payload (the
    // `log:line` wire format). A raw line must never be observable anywhere.
    const collector = await createCollector({ maxLines: 10 });
    const received: LogLine[] = [];
    const spy = vi.fn((line: LogLine) => received.push(line));
    const unsubscribe = collector.subscribe(spy);

    const returned = collector.push({
      stream: 'stdout',
      text: `core: all keys ${CANARIES.join(', ')} rotated`,
    });
    const view = collector.get();

    expect(
      spy,
      'the subscriber is notified exactly once for the pushed line',
    ).toHaveBeenCalledTimes(1);
    expect(received[0], 'the subscriber receives the STORED line').toEqual(view.lines[0]);
    expect(returned.text, 'FR-47: redaction happened before the buffer write').toBe(REDACTED);

    const everything = JSON.stringify({ returned, view, received });
    expectRedactedDump(everything, 'TC-06-03 before-store/notify');
    unsubscribe();
  });

  it('logs.redaction.publicLinesPassThroughUnchanged', async () => {
    // Sibling of TC-06-03: §8.4 PUBLIC values are logged freely — without
    // this pin an implementation that redacts EVERYTHING would satisfy the
    // canary tests while making the logs view useless (AC-06.1 diagnosis).
    const collector = await createCollector({ maxLines: 10 });
    const publicLines = [
      'fake-core: READY',
      'xray: inbound listen 127.0.0.1:10808 tag socks-in protocol socks',
      'xray: outbound tag proxy protocol fedarisha loglevel info',
      'app: start sequence finished in 412 ms',
    ];

    const returned = publicLines.map((text) => collector.push({ stream: 'stdout', text }));
    expect(
      collector.get().lines.map((line) => line.text),
      '§8.4 PUBLIC: no redaction of public lines (byte-for-byte)',
    ).toEqual(publicLines);
    expect(
      returned.map((line) => line.text),
      'push() echoes the untouched public text',
    ).toEqual(publicLines);
  });
});

describe('log redaction — classification beyond the canaries (§8.4, A-15)', () => {
  it('logs.redaction.internalInfrastructureValuesRedactedInLogs', async () => {
    // TC-06-19 / A-15 / §8.4 INTERNAL: bucket, endpoint, region, prefix and
    // sessionsDir identify the user's infrastructure — allowed in the UI
    // summary, redacted in LOGS [ASSUMPTION, Q-AN-09]. Values are read from
    // the imported config so the pin cannot drift from the fixture.
    const values = internalValues();
    expect(values.length, 'fixture sanity: 5 INTERNAL fields in the config').toBe(5);

    const collector = await createCollector({ maxLines: 40 });
    for (const { field, value } of values) {
      const viaCore = collector.push({ stream: 'stdout', text: `core: synced ${value} ok` });
      expect(
        viaCore.text,
        `§8.4 INTERNAL (${field}): a line containing "${value}" → ${REDACTED} in logs`,
      ).toBe(REDACTED);

      const viaApp = collector.pushApp({ text: `app: checked ${value} against policy` });
      expect(viaApp.text, `§8.4 INTERNAL (${field}) applies to app events too`).toBe(REDACTED);
    }
    expectRedactedDump(bufferDump(collector), 'TC-06-19');
  });
});

describe('log redaction — no stacks, no config JSON (FR-48, AC-06.4, NFR-5)', () => {
  it('logs.errors.noStackTraceNoFullConfigJson', async () => {
    // TC-06-04: a raw exception (stack frames + class name) and the full
    // config document must never surface in the buffer through either entry
    // point. The EXCEPTION content must be gone — redact or drop, both
    // accepted (no `E-*` code documents a mechanism, DV-19); the config line
    // is pinned to exact `[REDACTED]` per §8.4.
    const collector = await createCollector({ maxLines: 50 });

    collector.push({
      stream: 'stdout',
      text: JSON.stringify(JSON.parse(readCanaryConfig())),
    });
    collector.pushApp({ text: 'TypeError: failed to parse profile' });
    collector.push({
      stream: 'stderr',
      text: '    at parseProfile (/app/src/main/profile-validator.ts:42:11)',
    });
    collector.push({
      stream: 'stderr',
      text: '    at async Object.<anonymous> (/app/src/main/index.ts:10:3)',
    });

    const lines = collector.get().lines;
    expect(
      lines[0]?.text,
      '§8.4 SECRET/FR-48: the full config JSON is replaced with [REDACTED]',
    ).toBe(REDACTED);

    const dump = bufferDump(collector);
    for (const marker of ['failed to parse profile', 'at parseProfile', 'Object.<anonymous>']) {
      expect(
        dump.includes(marker),
        `FR-48/errors.md §0: no raw stack/exception content may reach the logs ("${marker}")`,
      ).toBe(false);
    }
    expectRedactedDump(dump, 'TC-06-04');
  });
});

describe('log redaction — oversize line (US-06 edge)', () => {
  it('logs.oversizeLine.truncatedAfterRedaction', async () => {
    // TC-06-10: a line longer than 4 KiB is truncated WITH a marker, and
    // redaction runs BEFORE the cut — a canary straddling the would-be cut
    // boundary must leave neither the full secret nor a fragment behind.
    const collector = await createCollector({ maxLines: 10 });

    const longPublic = `${'A'.repeat(10_000)}TAIL`;
    collector.push({ stream: 'stdout', text: longPublic });
    const stored = collector.get().lines[0]?.text ?? '';

    expect(
      stored.length,
      'US-06 edge: a > 4 KiB line is bounded at 4096 chars + ≤ 32 chars marker headroom (DV-25)',
    ).toBeLessThanOrEqual(4096 + 32);
    expect(stored.startsWith('AAAA'), 'truncation keeps the head of the line').toBe(true);
    expect(stored.includes('TAIL'), 'the tail of the line was truncated').toBe(false);
    expect(
      stored.endsWith('A'),
      'US-06 edge: truncated WITH a marker — a bare cut would end in the payload character',
    ).toBe(false);

    const canary = CANARIES[0] ?? '';
    const straddling = `${'B'.repeat(4090)}${canary}${'C'.repeat(200)}`;
    collector.push({ stream: 'stdout', text: straddling });
    const second = collector.get().lines[1]?.text ?? '';

    expect(second.includes(canary), 'NFR-2: no full canary survives the cut').toBe(false);
    expect(
      second.includes(canary.slice(0, 16)),
      'NFR-2: redaction ran BEFORE truncation — no canary fragment may straddle the cut',
    ).toBe(false);
    expect(second.length, 'the canary line is bounded as well').toBeLessThanOrEqual(4096 + 32);
  });
});

describe('log redaction — import path & full-loop greps (AC-01.6, TC-NFR2-01)', () => {
  it('profileImport.validImport.noSecretsReachLogBuffer', async () => {
    // TC-01-07 / FR-09: every canary EMBEDDED in the imported config, echoed
    // through the app-event entry point the way import logging will (data-
    // flows (a) step 10: "every step logs through the single redaction entry
    // point"), must never appear in the buffer.
    const config = readCanaryConfig();
    const embedded = CANARIES.filter((canary) => config.includes(canary));
    expect(
      embedded.length,
      'fixture sanity: valid-client-config.json embeds all §9.3 canaries',
    ).toBe(CANARIES.length);

    const collector = await createCollector({ maxLines: 50 });
    for (const canary of embedded) {
      collector.pushApp({ text: `profile import: storage credentials for ${canary} accepted` });
    }

    const dump = JSON.stringify(collector.get());
    for (const canary of embedded) {
      expect(
        dump.includes(canary),
        `AC-01.6/NFR-2: canary "${canary}" must have 0 occurrences in the log buffer`,
      ).toBe(false);
    }
    expect(dump, 'redaction asserted, not just absence').toContain(REDACTED);
  });

  it('logs.redaction.echoSecretsPipeline.secretLinesBecomeRedactedInBuffer', async () => {
    // Sibling of TC-06-03 (strategy §7 NFR-2.3 pipeline test): a REAL child
    // (`fake-core.sh --mode=echo-secrets`) cats its canary config to stdout;
    // each line pushed line-based (data-flows (b) step 6) is either passed
    // through or replaced — secret-bearing lines become `[REDACTED]`, and no
    // line is dropped (FR-47 "replaced").
    const run = await runFakeCoreMode('echo-secrets', { FAKE_CORE_CONFIG: canaryConfigPath() });
    expect(run.code, 'fixture sanity: echo-secrets exits 0').toBe(0);
    expect(run.stderr.toString('utf8'), 'echo-secrets writes only to stdout').toBe('');

    const inputs = decodedLines(run.stdout);
    expect(inputs.length, 'fixture sanity: the config echo is line-based').toBeGreaterThan(10);

    const collector = await createCollector({ maxLines: 500 });
    pushAll(collector, inputs);
    const stored = collector.get().lines;
    expect(stored.length, 'FR-47: every echoed line is stored — replaced, never dropped').toBe(
      inputs.length,
    );

    let redactedSecretLines = 0;
    for (const [index, input] of inputs.entries()) {
      const containsSecret =
        CANARIES.some((canary) => input.includes(canary)) ||
        /"(accessKey|secretKey|sessionToken|bucketPassword)"/.test(input) ||
        input.includes('"outbounds"'); // §8.4 full-config-JSON marker (FORBIDDEN list)
      if (containsSecret) {
        expect(
          stored[index]?.text,
          `AC-06.3: the secret-bearing config line ${index + 1} → ${REDACTED}`,
        ).toBe(REDACTED);
        redactedSecretLines += 1;
      }
    }
    expect(
      redactedSecretLines,
      'fixture sanity: the echo really leaked — at least the 4 canary lines were secret-bearing',
    ).toBeGreaterThanOrEqual(CANARIES.length);
    expectRedactedDump(JSON.stringify(collector.get()), 'TC-06-03 pipeline');
  });

  it('redaction.fullLoopGrep.zeroCanariesInBufferDomDataDirStdout', async () => {
    // TC-NFR2-01 (buffer half (a) only — DOM/dataDir/stdout/lastError halves
    // ride M1-24, §10): after a full core-output session, an automated dump
    // of the buffer (`get()` serialized, strategy §7.4 "export API of the
    // logs module") finds 0 canary occurrences anywhere — across core lines,
    // app events and the config echo — and `[REDACTED]` where the secret was.
    const run = await runFakeCoreMode('echo-secrets', { FAKE_CORE_CONFIG: canaryConfigPath() });
    expect(run.code, 'fixture sanity: echo-secrets exits 0').toBe(0);

    const collector = await createCollector({ maxLines: 500 });
    pushAll(collector, decodedLines(run.stdout));
    collector.pushApp({ text: `app: rotated ${CANARIES.join(' and ')}` });
    collector.push({ stream: 'stderr', text: `core: denied for ${CANARIES[0] ?? ''}` });

    expectRedactedDump(JSON.stringify(collector.get()), 'TC-NFR2-01 (a)');
  });
});

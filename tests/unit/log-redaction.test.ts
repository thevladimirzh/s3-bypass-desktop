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
 *  AMENDED 2026-10-08 (issue #24, owner decision, DV-63): the whole-line
 *  reading above now applies ONLY to document-mode lines, stack frames and
 *  SELF-CLOSED single-line JSON documents (a `{…}` line — §8.4 SECRET as a
 *  whole). Everything else is TOKEN-level: every masked unit becomes
 *  `[REDACTED:<class>]` (class = the rule that fired — accessKey, secretKey,
 *  sessionToken, bucketPassword, password, cookie, clientSecret, privateKey,
 *  signing, config, awsKey, jwt, run, path, endpoint, region, Error, or an
 *  INTERNAL context field name: bucket/prefix/sessionsDir/…), scaffolding
 *  (verbs, timings, status codes, host:port) is preserved. Name rules mask
 *  the matched TOKEN (never a cut fragment — a canary like
 *  `EXAMPLEACCESSKEYID01` goes whole) plus the adjacent value token; the
 *  configured INTERNAL values from the imported profile ride in via the
 *  collector's `redactionContext` option / `setRedactionContext` (exact
 *  occurrence → its field-name marker). `Error:`/`XxxError:` masks
 *  everything from the class token to end-of-line. Contract tests:
 *  TC-06-26 (realistic core lines) and the amended pins below.
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
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { LogLine } from '../../src/shared/ipc';
import { FORBIDDEN } from '../helpers/error-wording';
import {
  canaryConfigPath,
  createCollector,
  decodedLines,
  loadLogCollector,
  type LogCollector,
  pushAll,
  type RedactionContext,
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
    /\[REDACTED(\]|:)/.test(dump),
    // issue #24/DV-63 RED-fixup: the token-level contract marks with
    // `[REDACTED:<class>]`, the document/stack paths with plain `[REDACTED]`
    // — BOTH are an assertion of redaction (strategy §7.4).
    `${context}: redaction must be ASSERTED, not just absence — ${REDACTED} or a class marker must be present (strategy §7.4)`,
  ).toBe(true);
}

describe('log redaction — the single entry point (FR-47, NFR-2, §8.4)', () => {
  it('logs.redaction.canarySecretsBecomeRedactedInBuffer', async () => {
    // TC-06-03 (unit half): every canary class — access key id, secret key,
    // session token, bucket password — through BOTH entry points and BOTH
    // streams: the secret TOKEN is masked (issue #24/DV-63: class marker, or
    // whole-line [REDACTED] for document/stack paths) in the buffer AND in
    // the value push() returns (what `log:line` would carry).
    expect(CANARIES.length, '§9.3 fixture sanity: 4 canaries').toBe(4);
    const collector = await createCollector({ maxLines: 50 });

    for (const canary of CANARIES) {
      const viaStdout = collector.push({
        stream: 'stdout',
        text: `core: upsert to ${canary} completed`,
      });
      expect(
        viaStdout.text,
        'issue #24/DV-63: the canary TOKEN is masked with a class marker — ' +
          'scaffolding (upsert/completed) survives for diagnosis',
      ).toMatch(/^core: upsert to \[REDACTED:[a-zA-Z]+\] completed$/);
      expect(viaStdout.text, 'NFR-2: the canary value never survives').not.toContain(canary);

      // A bare credential keyword in PROSE has no adjacent value to pin —
      // fail-closed: the name token AND the token right after it are masked.
      const viaStderr = collector.push({
        stream: 'stderr',
        text: `core: signature for ${canary} rejected`,
      });
      expect(
        viaStderr.text,
        'issue #24/DV-63: prose credential keyword → name + next token masked ' +
          '(fail-closed), the trailing signal word kept',
      ).toMatch(
        /^core: \[REDACTED:[a-zA-Z]+\] \[REDACTED:[a-zA-Z]+\] \[REDACTED:[a-zA-Z]+\] rejected$/,
      );
      expect(viaStderr.text, 'NFR-2: the canary value never survives').not.toContain(canary);

      const viaApp = collector.pushApp({ text: `app: stored key ${canary} in memory` });
      expect(
        viaApp.text,
        'issue #24/DV-63: app-event line — canary token masked, scaffolding kept',
      ).toMatch(/^app: stored key \[REDACTED:[a-zA-Z]+\] in memory$/);
      expect(viaApp.text, 'NFR-2: the canary value never survives').not.toContain(canary);
    }

    // Quoted config secret keys (strategy §7.5 forbidden-pattern list): the
    // key NAME itself never survives (a line carrying it is config echo) and
    // the value goes with it — both halves masked with the class marker.
    for (const [input, expected] of [
      [
        'storage write ok {"accessKey": "whatever"}',
        'storage write ok {"[REDACTED:accessKey]": "[REDACTED:accessKey]"}',
      ],
      [
        'storage write ok {"secretKey": "whatever"}',
        'storage write ok {"[REDACTED:secretKey]": "[REDACTED:secretKey]"}',
      ],
      [
        'auth ok {"sessionToken": "whatever"}',
        'auth ok {"[REDACTED:sessionToken]": "[REDACTED:sessionToken]"}',
      ],
      [
        'auth ok {"bucketPassword": "whatever"}',
        'auth ok {"[REDACTED:bucketPassword]": "[REDACTED:bucketPassword]"}',
      ],
    ] as const) {
      const stored = collector.push({ stream: 'stdout', text: input });
      expect(
        stored.text,
        '§8.4 SECRET (issue #24/DV-63): the quoted secret key name AND its value ' +
          'are both masked — the strategy §7.5 forbidden key name never survives',
      ).toBe(expected);
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
    expect(
      returned.text,
      'issue #24/DV-63: redaction happened before the buffer write — every canary ' +
        'TOKEN is masked, the scaffolding survives',
    ).toMatch(/^core: all keys (\[REDACTED:[a-zA-Z]+\], ){3}\[REDACTED:[a-zA-Z]+\] rotated$/);

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

    // issue #24/DV-63: the INTERNAL class rides in as the collector's
    // redactionContext — the exact configured value, wherever it appears,
    // becomes its FIELD-NAME marker; the scaffolding survives for diagnosis.
    const collector = await createCollector({
      maxLines: 40,
      redactionContext: Object.fromEntries(
        values.map(({ field, value }) => [field, value]),
      ) as RedactionContext,
    });
    for (const { field, value } of values) {
      const viaCore = collector.push({ stream: 'stdout', text: `core: synced ${value} ok` });
      expect(
        viaCore.text,
        `issue #24: §8.4 INTERNAL (${field}) — the configured value becomes ` +
          `[REDACTED:${field}], the "synced … ok" scaffolding survives`,
      ).toBe(`core: synced [REDACTED:${field}] ok`);

      const viaApp = collector.pushApp({ text: `app: checked ${value} against policy` });
      expect(viaApp.text, `issue #24: §8.4 INTERNAL (${field}) applies to app events too`).toBe(
        `app: checked [REDACTED:${field}] against policy`,
      );
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
    // issue #24/DV-63 RED-fixup: token-level markers assert redaction too.
    expect(dump, 'redaction asserted, not just absence').toMatch(/\[REDACTED(\]|:)/);
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

describe('log redaction — realistic core lines (issue #24, DV-63) — TC-06-26', () => {
  it('logs.redaction.realisticCoreLinesKeepSignalMaskClasses', async () => {
    // TC-06-26 — issue #24: the Logs-panel symptom (119/119 [REDACTED] with
    // a real profile). Whole-line redaction (DV-25) died on ANY slash, on
    // the bare bucket/session words, on Error:. Lines (a)-(b) are REAL boot
    // output captured 2026-10-08 from the pinned core
    // (core-bin/darwin-arm64/xray + valid-client-config.json); (c)-(e) are
    // the operational shapes the issue names (poll/accept/upload). Hybrid
    // contract (owner decision 2026-10-08, DV-63): token-level masks with
    // `[REDACTED:<class>]` markers, configured INTERNAL values via the
    // collector's redactionContext (replaced BEFORE the shape rules), whole
    // line only for document mode / stack frames / self-closed JSON.
    const collector = await createCollector({
      maxLines: 40,
      redactionContext: {
        endpoint: 'https://s3.example.com',
        bucket: 'example-bucket',
        prefix: 'profiles/vlt-alpha',
        sessionsDir: 'sessions',
        region: 'us-east-1',
      },
    });

    // (a) THE issue symptom: the listen line died on the logger name's
    // slashes. host:port is PUBLIC (§8.4); digit-first segments (dates) are
    // exempt from the path rule so timestamps keep passing.
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:12:14.274565 [Info] transport/internet/tcp: listening TCP on 127.0.0.1:10808',
      }).text,
      'issue #24: the listen signal SURVIVES — logger-name paths masked, host:port intact',
    ).toBe('2026/10/08 22:12:14.274565 [Info] [REDACTED:path]: listening TCP on 127.0.0.1:10808');

    // (b) config-read line: prefix scaffolding survives, the file path masks.
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:12:14.272956 [Info] infra/conf/serial: Reading config: &{Name:tests/fixtures/configs/valid-client-config.json Format:json}',
      }).text,
      'issue #24: "Reading config" stays (diagnosis), the config file path is masked',
    ).toBe(
      '2026/10/08 22:12:14.272956 [Info] [REDACTED:path]: Reading config: &{Name:[REDACTED:path] Format:json}',
    );

    // (c) PUBLIC status lines pass byte-for-byte (AC-06.1).
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:12:14.274591 [Warning] core: Xray 26.9.9 started',
      }).text,
      'a PUBLIC boot line stays visible byte-for-byte',
    ).toBe('2026/10/08 22:12:14.274591 [Warning] core: Xray 26.9.9 started');

    // (d) the issue's operational shapes: accept + poll scaffolding survives
    // (bare "session" is no longer a rule — the configured sessionsDir value
    // is what masks, via the context / exact value).
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:13:01.101010 [Info] proxy/socks: session accepted: 127.0.0.1:52344',
      }).text,
      'issue #24: "session accepted" is SIGNAL — logger path masked, the rest intact',
    ).toBe('2026/10/08 22:13:01.101010 [Info] [REDACTED:path]: session accepted: 127.0.0.1:52344');
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:15:00.000000 [Info] core: poll cycle done in 18 ms (0 pending)',
      }).text,
      'issue #24: operational scaffolding (poll, timings) passes verbatim',
    ).toBe('2026/10/08 22:15:00.000000 [Info] core: poll cycle done in 18 ms (0 pending)');

    // (e) upload: the configured INTERNAL values become their FIELD markers
    // (context runs BEFORE the shape rules — prefix wins over path), while
    // the verb and the timing survive for diagnosis.
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:14:00.000000 [Info] storage/s3: upload profiles/vlt-alpha/obj-1 to example-bucket via https://s3.example.com in 412 ms',
      }).text,
      'issue #24: configured INTERNAL values → field markers, upload/timing survive',
    ).toBe(
      '2026/10/08 22:14:00.000000 [Info] [REDACTED:path]: upload [REDACTED:prefix]/obj-1 to [REDACTED:bucket] via [REDACTED:endpoint] in 412 ms',
    );

    // (f) Error: — everything from the class token to EOL is masked
    // (errors.md §0: no exception message), the prefix scaffolding stays.
    expect(
      collector.push({
        stream: 'stdout',
        text: '2026/10/08 22:16:00.000000 [Info] core: dial failed: Error: xray: dial tcp 10.0.0.5:443: i/o timeout',
      }).text,
      'errors.md §0 / issue #24: from the Error: class token to EOL masked, prefix kept',
    ).toBe('2026/10/08 22:16:00.000000 [Info] core: dial failed: [REDACTED:Error]');

    // (g) stack frames stay whole-line (errors.md §0 — FR-48).
    expect(
      collector.push({
        stream: 'stderr',
        text: '    at parseProfile (/app/src/main/profile-validator.ts:42:11)',
      }).text,
      'errors.md §0: a stack frame is still the ENTIRE line replaced',
    ).toBe(REDACTED);

    // (h) extraction: the §8.4 INTERNAL fields come from the parsed config
    // document — and ONLY those (SECRET credential fields are excluded).
    const api = await loadLogCollector();
    expect(
      api.redactionContextFromConfig({
        outbounds: [
          {
            settings: {
              storage: {
                bucket: 'b-1',
                endpoint: 'https://e.example',
                region: 'eu-central-1',
                prefix: 'p/x',
                sessionsDir: 'sessions',
                accessKey: 'SKIPME',
              },
            },
          },
        ],
      }),
      'issue #24: the 5 §8.4 INTERNAL fields extracted, SECRET credential fields excluded',
    ).toEqual({
      bucket: 'b-1',
      endpoint: 'https://e.example',
      region: 'eu-central-1',
      prefix: 'p/x',
      sessionsDir: 'sessions',
    });
    expect(
      api.redactionContextFromConfig(null),
      'tolerant: a non-document yields an empty context (never throws)',
    ).toEqual({});

    // (i) wiring: index.ts extracts the context from the stored profile at
    // startup and refreshes it after every (re-)import — fail-closed, the
    // context is never cleared (removal does not un-redact).
    const indexSource = readFileSync(new URL('../../src/main/index.ts', import.meta.url), 'utf8');
    expect(
      /redactionContextFromConfig\(/.test(indexSource),
      'wiring: index.ts builds the redaction context from the stored profile',
    ).toBe(true);
    expect(
      /setRedactionContext\(/.test(indexSource),
      'wiring: index.ts hands it to the long-lived log collector',
    ).toBe(true);
    const refreshCalls = (indexSource.match(/refreshRedactionContext\(\)/g) ?? []).length;
    expect(
      refreshCalls,
      'wiring: refreshed at startup AND after every (re-)import (fail-closed)',
    ).toBeGreaterThanOrEqual(2);
  });
});

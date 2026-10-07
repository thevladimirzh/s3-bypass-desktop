/**
 * M1-26 (RED) — S5-6 (GitHub issue #12): the log redaction denylist misses
 * generic credential fields, nameless secret shapes, separator variants, and
 * only partially redacts multi-line config blobs (log-collector.ts:83-92,
 * REDACTION_RULES). Each input below is verified against TODAY's eight rules:
 * it matches none, so it passes UNREDACTED into the buffer today — the exact
 * leak class S5-6 demonstrates.
 *
 * Test plan IDs: TC-06-20 (gap 1 — generic keys), TC-06-21 (gap 2 —
 * nameless shapes), TC-06-22 (gap 3 — separator variants), TC-06-23 (gap 4 —
 * document mode) — docs/qa/m1-test-plan.md §6, allocated in §14 DV-32.
 * Sibling suites stay GREEN: tests/unit/log-redaction.test.ts (canaries,
 * PUBLIC pass-through, oversize, pipeline), log-buffer.test.ts (bounds).
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-6 (finding gaps 1-4 +
 * fix: "Add generic credential key names (password, pass, client secret,
 * private key, cookie, authorization, signature/signing) and value shapes
 * (AKIA[0-9A-Z]{16}, JWT, long base64/hex) to REDACTION_RULES. For
 * document-shaped bursts: if any line of an entry matches the document
 * markers, redact subsequent lines until the document closes (or simply
 * redact every line of a multi-line JSON block)"); docs/analysis/
 * requirements.md FR-47 ("any line containing a secret field value is
 * replaced with [REDACTED]" — whole-line, at the single entry point), FR-48;
 * docs/product/PRD.md §5 NFR-2 + BRIEF §2.6 (P0: full config never in
 * logs); docs/product/stories/US-06-logs.md AC-06.3; docs/analysis/
 * data-flows.md §2.1 step 6 (bounded buffer → push chain); docs/qa/
 * strategy.md §7 NFR-2 (redaction asserted, not just absence).
 *
 * Layer: L1 — the REAL `src/main/log-collector.ts` through `createCollector`
 * (tests/helpers/log-collector-stub), one fresh collector per scenario so
 * document-mode state can never leak between cases.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 *  | gap | input line (trimmed)                          | stored text          |
 *  |-----|------------------------------------------------|----------------------|
 *  | 1   | "password"/"pass"/"clientSecret"/"privateKey"/ | exactly `[REDACTED]` |
 *  |     | "cookie" key lines (start with `"`, NOT `{`)   |                      |
 *  | 1c  | control: `"listen": "127.0.0.1",` (non-secret  | unchanged            |
 *  |     | quoted key — the fix must not redact all JSON) |                      |
 *  | 2   | bare values: AKIA…16, JWT eyh…triple, 64-hex   | exactly `[REDACTED]` |
 *  | 2c  | control: `fake-core: READY` (PUBLIC)           | unchanged            |
 *  | 3   | `access..key`, `access__key`, `ACCESS  KEY`    | exactly `[REDACTED]` |
 *  | 3c  | control: `accessKey` (already caught today)    | exactly `[REDACTED]` |
 *  | 4   | flat document: `{` then inner lines then `}`   | every inner line AND |
 *  |     |                                                | the closing `}` →    |
 *  |     |                                                | `[REDACTED]`         |
 *  | 4c  | line AFTER the closing `}`                     | unchanged (exit)     |
 *  | 4f  | never-closed document: the trailer line        | `[REDACTED]`         |
 *  |     | (fail-safe — no leak after a `{` opener)       | (redact to end)      |
 *
 *  Document mode semantics pinned (works for a depth-count AND a
 *  `starts-with-}` implementation — both fix shapes in the report): a line
 *  whose TRIMMED text starts with `{` enters document mode; every
 *  subsequent line is redacted including the closing `}`; the mode EXITS at
 *  that closer (the control line passes); an unclosed document redacts
 *  everything to the end (fail-safe). The opener line's own text is NOT
 *  pinned (a bare `{` carries no secret — redact-or-pass both accepted).
 *
 *  Whole-line replacement (FR-47), not substring: every `[REDACTED]` above
 *  is the ENTIRE stored text. Redaction-before-truncation, case-insensitive
 *  matching, and the canary rules stay GREEN in log-redaction.test.ts
 *  (S5-6 "Verified OK" list).
 *
 * RED status: ASSERTION RED — the module is GREEN since M1-19; every input
 * above matches none of today's eight rules (walked in the report §2/§3),
 * so the discriminating first assertion of each `it` finds the raw line.
 * Never a mock-setup error: `createCollector` and `pushAll` are the proven
 * M1-19 helpers. Strategy §5.2 — do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from 'vitest';

import { createCollector, pushAll } from '../helpers/log-collector-stub';

/** FR-47 literal wording — a matching line is replaced with exactly this. */
const REDACTED = '[REDACTED]';

/** Stored texts of a collector, oldest first — the observation surface. */
function storedTexts(collector: Awaited<ReturnType<typeof createCollector>>): string[] {
  return collector.get().lines.map((line) => line.text);
}

describe('log redaction — generic credential fields (S5-6 gap 1, issue #12)', () => {
  it('logs.redaction.genericCredentialKeyLinesBecomesRedacted', async () => {
    // TC-06-20: key names the four-name denylist does not cover — password,
    // pass, clientSecret (the rule needs the secret…key ADJACENCY),
    // privateKey, cookie. Lines start with `"` (not `{`) so ONLY the key
    // rule can be what catches them — no document-mode help.
    const collector = await createCollector({ maxLines: 50 });
    const gaps = [
      '  "password": "hunter2",',
      '  "pass": "letmein42",',
      '  "clientSecret": "s3cr3tvalue",',
      '  "privateKey": "MIIEvQIBADANBg",',
      '  "cookie": "uid=42",',
    ];
    pushAll(collector, gaps);
    const stored = storedTexts(collector);

    const leaked: string[] = [];
    gaps.forEach((input, index) => {
      if (stored[index] !== REDACTED)
        leaked.push(`${input} → stored as ${JSON.stringify(stored[index])}`);
    });
    expect(
      leaked,
      'S5-6/TC-06-20 (issue #12): generic credential key lines must be replaced with ' +
        `${REDACTED} at the single entry point (FR-47/PRD NFR-2 — BRIEF §2.6 P0: a ` +
        'credential value never reaches the buffer/renderer/clipboard). These key names ' +
        "match none of today's four denylist names, so they pass through unredacted:",
    ).toEqual([]);

    // Control: a NON-secret quoted key must survive the fix — redacting all
    // JSON would satisfy the gap pins while breaking AC-06.1 diagnosis.
    const control = '  "listen": "127.0.0.1",';
    const controlCollector = await createCollector({ maxLines: 10 });
    pushAll(controlCollector, [control]);
    expect(
      storedTexts(controlCollector)[0],
      'control: a non-secret quoted key line must stay visible byte-for-byte ' +
        '(§8.4 PUBLIC — the fix adds credential names, not a JSON ban)',
    ).toBe(control);
  });
});

describe('log redaction — nameless secret value shapes (S5-6 gap 2, issue #12)', () => {
  it('logs.redaction.namelessSecretShapesBecomesRedacted', async () => {
    // TC-06-21: a bare access-key id / token / hex secret on its own line —
    // no field name, no separators, no "/" (report fix value shapes:
    // AKIA[0-9A-Z]{16}, JWT, long base64/hex).
    const collector = await createCollector({ maxLines: 50 });
    const gaps = [
      'AKIAIOSFODNN7EXAMPLE',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.c2lnbmF0dXJl',
      'a1b2c3d4'.repeat(8),
    ];
    pushAll(collector, gaps);
    const stored = storedTexts(collector);

    const leaked: string[] = [];
    gaps.forEach((input, index) => {
      if (stored[index] !== REDACTED)
        leaked.push(`${input.slice(0, 24)}… → stored as ${JSON.stringify(stored[index])}`);
    });
    expect(
      leaked,
      'S5-6/TC-06-21 (issue #12): a nameless secret shape (AKIA-style id, JWT, 64-hex) ' +
        `must be replaced with ${REDACTED} — a bare value with no field name matches none ` +
        "of today's rules and would land verbatim in the buffer, the renderer, and the " +
        '"Copy logs" clipboard (FR-47/PRD NFR-2):',
    ).toEqual([]);

    // Control: a PUBLIC line keeps passing (AC-06.1 diagnosis value).
    const control = 'fake-core: READY';
    const controlCollector = await createCollector({ maxLines: 10 });
    pushAll(controlCollector, [control]);
    expect(
      storedTexts(controlCollector)[0],
      'control: a PUBLIC line must stay visible byte-for-byte (§8.4 PUBLIC)',
    ).toBe(control);
  });
});

describe('log redaction — separator/case variants of the key names (S5-6 gap 3, issue #12)', () => {
  it('logs.redaction.separatorVariantsOfAccessKeyBecomesRedacted', async () => {
    // TC-06-22: today's pattern is `access[-_\s]?key` — exactly ONE optional
    // separator, no ".". `access..key`, `access__key` and `ACCESS  KEY`
    // (two spaces) all miss it; the report fix widens the class to
    // [-_\s.]+ (DV-32). The single-separator `accessKey` is the control
    // that must stay redacted after the fix.
    const collector = await createCollector({ maxLines: 50 });
    const gaps = [
      '  "access..key": "hunter2",',
      '  "access__key": "hunter2",',
      '  "ACCESS  KEY": "hunter2",',
    ];
    pushAll(collector, gaps);
    const stored = storedTexts(collector);

    const leaked: string[] = [];
    gaps.forEach((input, index) => {
      if (stored[index] !== REDACTED)
        leaked.push(`${input} → stored as ${JSON.stringify(stored[index])}`);
    });
    expect(
      leaked,
      'S5-6/TC-06-22 (issue #12): separator/case variants of the accessKey name ' +
        `(access..key / access__key / ACCESS  KEY) must be replaced with ${REDACTED} — ` +
        "today's [-_\\s]? class matches only ONE separator, so these variants pass " +
        'through unredacted (FR-47, strategy §7.5):',
    ).toEqual([]);

    // Control: the canonical spelling is caught TODAY and must stay caught.
    const control = '  "accessKey": "hunter2",';
    const controlCollector = await createCollector({ maxLines: 10 });
    pushAll(controlCollector, [control]);
    expect(
      storedTexts(controlCollector)[0],
      `control: the canonical accessKey line is already redacted today and must stay ${REDACTED} ` +
        '(the widened rule may not lose the original class)',
    ).toBe(REDACTED);
  });
});

describe('log redaction — multi-line config document (S5-6 gap 4, issue #12)', () => {
  it('logs.redaction.documentBlockRedactsInnerLinesAndCloserThenExits', async () => {
    // TC-06-23: a pretty-printed JSON echo arrives line by line. Today only
    // denylist hits (`"outbounds"`, `accessKey`) are replaced — inner lines
    // of any other field survive (the "full config never in logs" promise
    // holds only for the §9.3 canary shapes). Document mode: `{` (trimmed)
    // enters, every subsequent line is redacted INCLUDING the closing `}`,
    // and the mode EXITS there — the control line after `}` passes.
    const collector = await createCollector({ maxLines: 50 });
    const inputs = [
      '{',
      '  "listen": "127.0.0.1",',
      '  "protocol": "freedom",',
      '}',
      'after-block line passes',
    ];
    pushAll(collector, inputs);
    const stored = storedTexts(collector);

    expect(
      stored[1],
      'S5-6/TC-06-23 (issue #12): inside a `{`-opened document EVERY line must be ' +
        `replaced with ${REDACTED} — today the inner line for a field outside the ` +
        'four-name denylist survives unredacted in the buffer (gap 4: the config-leak ' +
        'promise holds only for canary shapes)',
    ).toBe(REDACTED);
    expect(
      stored[2],
      'S5-6/TC-06-23: every subsequent document line is redacted, not only denylist hits',
    ).toBe(REDACTED);
    expect(
      stored[3],
      `S5-6/TC-06-23: the closing \`}\` line belongs to the document and is ${REDACTED} too ` +
        '(redact-then-exit — the closer may not leak as a pass-through)',
    ).toBe(REDACTED);
    expect(
      stored[4],
      'control: document mode EXITS at the closer — a line after `}` must pass through ' +
        'unchanged (otherwise every later public log line would be swallowed)',
    ).toBe('after-block line passes');

    // Fail-safe: an UNCLOSED document must redact everything to the end —
    // after a `{` opener nothing may leak, whatever comes next.
    const fresh = await createCollector({ maxLines: 50 });
    pushAll(fresh, ['{', 'inner plain line', 'trailer after unclosed document']);
    const unclosed = storedTexts(fresh);
    expect(
      unclosed[2],
      'S5-6/TC-06-23 fail-safe: a document that never closes redacts the REST of the ' +
        `stream — the trailer line must be ${REDACTED}, never passed through (redact-or-` +
        'suppress until an explicit exit; no leak after a `{` opener)',
    ).toBe(REDACTED);
    expect(
      unclosed[1],
      `S5-6/TC-06-23: inner lines of the unclosed document are ${REDACTED} as well`,
    ).toBe(REDACTED);
  });
});

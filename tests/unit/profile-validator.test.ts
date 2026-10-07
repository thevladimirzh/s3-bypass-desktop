/**
 * M1-11 (RED) — the profile-import validator: fixture-driven BR-V pins.
 *
 * Test plan IDs: TC-01-01, TC-01-03, TC-01-04, TC-01-05, TC-01-06, TC-01-10,
 * TC-01-12 plus TC-01-15..TC-01-29 allocated by this batch
 * (docs/qa/m1-test-plan.md §1 and §14, deviations DV-10..DV-17).
 *
 * Spec sources: docs/analysis/requirements.md §2.2 (BR-V-01..BR-V-16), FR-02..FR-04,
 * FR-11; docs/analysis/data-flows.md flow (a) steps 1-4 (gate order);
 * docs/analysis/errors.md §0 (message contract) + §1 (E-VAL codes);
 * docs/product/stories/US-01-profile-import.md AC-01.1/AC-01.4/AC-01.5;
 * docs/qa/strategy.md §5.2, §7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-12 (declared here, mirrored as `ProfileValidatorApi` in
 * tests/helpers/profile-validator-stub.ts — header-contract style, cf. DV-09):
 *
 *  module  : src/main/profile-validator.ts
 *  export  : validateClientConfig(raw: string)
 *            → { ok: true; config: Record<string, unknown> }
 *            | { ok: false; error: AppError }   — returned, never thrown
 *            (FR-11: every rejection uses exactly one errors.md code rendered
 *            as the NFR-5 triple; raw exceptions must never reach UI or logs)
 *  input   : the raw file text only — stat/read belong to the import pipeline
 *            (data-flows (a) steps 1-2), so the module does no fs, no IPC,
 *            no electron, no network (BR-V-16, strategy §1)
 *  gates   : exact data-flows (a) order —
 *            1. size ≤ 1 048 576 B            → E-VAL-002   (BR-V-02)
 *            2. utf-8 decode, no 0x00 byte    → E-VAL-003   (BR-V-03)
 *            3. JSON.parse (+ line/column)    → E-VAL-001   (FR-03)
 *            4. schema BR-V-01..BR-V-14       → E-VAL-004..014 (FR-04: ONE
 *               message listing all missing/invalid field names)
 *            Step 5 (core-running gate → E-VAL-015) is out of scope here.
 *
 * Fixture → BR → E-VAL → TC map (static fixtures under tests/fixtures/configs,
 * generated inputs marked [generated] per DV-10):
 *
 *  input                          | BR-V        | E-VAL      | TC
 *  -------------------------------+-------------+------------+-------------
 *  valid-client-config.json       | BR-V-01..16 | accepted   | TC-01-01
 *  valid-extra-fields.json        | BR-V-14     | accepted   | TC-01-29
 *  [generated] exactly 1 048 576 B| BR-V-02 ≤   | accepted   | TC-01-16
 *  [generated] 1 048 577 B valid  | BR-V-02 >   | E-VAL-002  | TC-01-05
 *  [generated] 1 048 577 B non-JSON (gate order: size before parse) | BR-V-02 | E-VAL-002 | TC-01-16
 *  [generated] PDF bytes, utf-8   | BR-V-03     | E-VAL-003  | TC-01-06
 *  valid raw + trailing 0x00      | BR-V-03     | E-VAL-003  | TC-01-17
 *  invalid-syntax.json (line 4, column 7) | FR-03 | E-VAL-001 | TC-01-03
 *  empty.json (0 bytes)           | FR-03       | E-VAL-001  | TC-01-10
 *  root-not-object.json + inline non-object roots | BR-V-01 | E-VAL-004 | TC-01-18
 *  no-fedarisha-outbound.json     | BR-V-04     | E-VAL-005  | TC-01-19
 *  outbounds-not-array.json       | BR-V-04     | E-VAL-005  | TC-01-20
 *  storage-missing.json, storage-type-not-s3.json | BR-V-05 | E-VAL-011 | TC-01-21
 *  missing-s3-fields.json (all five fields, one message) | BR-V-06 | E-VAL-006 | TC-01-04
 *  missing-s3-bucket/-endpoint/-prefix, missing-access-key, missing-secret-key (one field each) | BR-V-06 | E-VAL-006 | TC-01-04
 *  missing-credentials.json       | BR-V-06     | E-VAL-006  | TC-01-12
 *  sessions-dir-traversal.json    | BR-V-08     | E-VAL-006  | TC-01-22
 *  invalid-endpoint.json          | BR-V-07     | E-VAL-007  | TC-01-23
 *  port-zero/-over-65535/-not-number.json | BR-V-10 (range) | E-VAL-008 | TC-01-24
 *  listen-not-loopback.json       | BR-V-09 (address) | E-VAL-010 | TC-01-25
 *  inbound-not-socks.json         | BR-V-09 (shape)   | E-VAL-014 | TC-01-26
 *  tuning-out-of-range.json       | BR-V-12     | E-VAL-012  | TC-01-27
 *  unknown-loglevel.json          | BR-V-13     | E-VAL-013  | TC-01-28
 *  src/main/profile-validator.ts (source scan) | contract, BR-V-16 | no ipc/fs/net | TC-01-15
 *
 * Not written here (deviation DV-15): E-VAL-009 (port ≠ 10808 — blocked
 * Q-AN-05/A-06, reject-vs-override undecided) and E-VAL-015 (state gate,
 * data-flows (a) step 5, not the import validator). TC-01-02/TC-01-11 need the
 * dialog/read-error pipeline (DV-12); TC-01-13 stays unwritten (DV-13).
 *
 * Every rejection also runs the shared NFR-5 wording contract
 * (`expectHumanError` + `FORBIDDEN` + canary scan from
 * tests/helpers/error-wording.ts), so each rejection pin doubles as a wording
 * table row for the code it asserts.
 *
 * RED status: ABSENCE RED — `src/main/profile-validator.ts` does not exist
 * yet; every case fails through `loadProfileValidator()` (dynamic import
 * rejects) or, for the source scan, through the explicit `existsSync` gate.
 * Strategy §5.2: legitimate first-test-of-a-subsystem failure; do not weaken,
 * skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AppError } from '../../src/shared/status-machine';
import { expectHumanError, wordingRowFor } from '../helpers/error-wording';
import {
  captureValidationError,
  invalidJsonOfSize,
  loadProfileValidator,
  MAX_PROFILE_BYTES,
  paddedValidConfig,
  pdfRenamedRaw,
  readConfigFixture,
} from '../helpers/profile-validator-stub';

const VALIDATOR_MODULE_PATH = fileURLToPath(
  new URL('../../src/main/profile-validator.ts', import.meta.url),
);

/** `//`/`/* *\/` comments removed before structural scanning (cf. TC-07-17). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Accepts the input or fails the test — a validator that rejects everything is as bad as one that accepts everything. */
async function accept(raw: string, context: string): Promise<Record<string, unknown>> {
  const validator = await loadProfileValidator();
  const result = validator.validateClientConfig(raw);
  if (!result.ok) {
    throw new Error(
      `${context}: expected the validator to accept this input, got ` +
        `${result.error.code} — ${result.error.title}`,
    );
  }
  return result.config;
}

/** Rejects with `code` and puts the triple through the shared NFR-5 contract. */
async function reject(raw: string, code: string, context: string): Promise<AppError> {
  const validator = await loadProfileValidator();
  const error = captureValidationError(validator.validateClientConfig(raw), context);
  expectHumanError(wordingRowFor(code), error);
  return error;
}

describe('profile validator — M1-12 contract surface (FR-11, strategy §1) — M1-11', () => {
  it('profileValidator.contract.exportsValidateClientConfigOverRawText', async () => {
    // TC-01-15 / FR-11: the declared export exists and is callable over raw
    // text; the full result-shape contract is enforced by `accept`/`reject`
    // (typechecked against ProfileValidatorApi) in every case below.
    const validator = await loadProfileValidator();
    expect(
      typeof validator.validateClientConfig,
      'src/main/profile-validator.ts must export validateClientConfig(raw) — M1-12 GREEN implements the M1-11 contract',
    ).toBe('function');
  });

  it('profileValidator.boundary.moduleImportsNoIpcElectronFsOrNetworkPrimitives', () => {
    // TC-01-15 (structural sibling) / BR-V-16 + plan M1-12 + strategy §1:
    // validation performs no network calls, no IPC, no dialog, no fs — the
    // module is a pure function of the raw text it is given.
    expect(
      existsSync(VALIDATOR_MODULE_PATH),
      'src/main/profile-validator.ts must exist — M1-12 GREEN implements the M1-11 contract',
    ).toBe(true);

    const source = stripComments(readFileSync(VALIDATOR_MODULE_PATH, 'utf8'));

    // Module specifiers (bare and path imports) — no fs/net/http/dns/IPC host.
    const specifiers = [
      ...source.matchAll(
        /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
    const forbiddenRoots = [
      'electron',
      'node:fs',
      'node:net',
      'node:http',
      'node:https',
      'node:dgram',
      'node:dns',
      'node:tls',
      'node:child_process',
      'fs',
      'net',
      'http',
      'https',
      'dgram',
      'dns',
      'tls',
      'child_process',
    ];
    for (const specifier of specifiers) {
      const banned = forbiddenRoots.find(
        (root) => specifier === root || specifier.startsWith(`${root}/`),
      );
      expect(
        banned,
        `profile-validator must not import '${specifier}' — validation is pure over raw text, no fs/network (BR-V-16, strategy §1)`,
      ).toBeUndefined();
    }

    // In-source primitives: IPC/host surfaces and outbound calls.
    for (const primitive of [
      'ipcRenderer',
      'ipcMain',
      'contextBridge',
      'exposeInMainWorld',
      'webContents',
      'fetch(',
      'WebSocket',
      'electron',
    ]) {
      expect(
        source.includes(primitive),
        `src/main/profile-validator.ts must not reference '${primitive}' — the validator is callable from main only through its export, never exposed on IPC, never online (FR-11, BR-V-16)`,
      ).toBe(false);
    }

    expect(source, 'the M1-12 contract exports validateClientConfig by name (DV-16)').toMatch(
      /export\s+(?:async\s+)?function\s+validateClientConfig|export\s+const\s+validateClientConfig|export\s*\{[^}]*\bvalidateClientConfig\b/,
    );
  });
});

describe('profile validator — accepted inputs (BR-V-14 passthrough, BR-V-02 boundary)', () => {
  it('profileValidator.valid.canaryClientConfigAcceptedUnchanged', async () => {
    // TC-01-01 / AC-01.1: the §9.1 canary client config satisfies every
    // BR-V rule and comes back as the parsed document.
    const raw = readConfigFixture('valid-client-config.json');
    const config = await accept(raw, 'TC-01-01 canary config');
    expect(config).toEqual(JSON.parse(raw) as Record<string, unknown>);
  });

  it('profileValidator.valid.unknownTopLevelFieldAcceptedAndPassedThrough', async () => {
    // TC-01-29 / BR-V-14 + A-09: unknown fields are preserved and passed
    // through — rejecting (or stripping) them breaks forward compatibility.
    const config = await accept(
      readConfigFixture('valid-extra-fields.json'),
      'TC-01-29 unknown top-level field',
    );
    expect(
      config['providerExtraField'],
      'BR-V-14/A-09: the unrecognized field must survive validation untouched',
    ).toBe('unknown-fields-must-pass-through');
  });

  it('profileValidator.size.profileExactlyOneMiBAccepted', async () => {
    // TC-01-16 / BR-V-02 boundary: the limit is inclusive (≤ 1 048 576 B), so
    // a profile padded to exactly that many bytes must be accepted.
    const raw = paddedValidConfig(MAX_PROFILE_BYTES);
    expect(
      Buffer.byteLength(raw, 'utf8'),
      'boundary input must be exactly 1 048 576 bytes for the pin to mean anything',
    ).toBe(MAX_PROFILE_BYTES);
    const config = await accept(raw, 'TC-01-16 exact 1 MiB');
    expect(config['pad'], 'the padding key rides along as an unknown field (BR-V-14)').toBeTypeOf(
      'string',
    );
  });
});

describe('gate 1 — file size (data-flows (a) step 1: BR-V-02 → E-VAL-002)', () => {
  it('profileValidator.size.oversizedProfileRejectedWithEVal002', async () => {
    // TC-01-05 / AC-01.5: one byte over the limit is rejected with the
    // dedicated size code — never parsed, never schema-checked.
    const raw = paddedValidConfig(MAX_PROFILE_BYTES + 1);
    expect(Buffer.byteLength(raw, 'utf8'), 'oversized input must exceed 1 048 576 B').toBe(
      MAX_PROFILE_BYTES + 1,
    );
    const error = await reject(raw, 'E-VAL-002', 'TC-01-05 oversized profile');
    expect(error.cause, 'the cause must state the 1 MiB limit (errors.md §1 pattern)').toContain(
      'under 1 MiB',
    );
  });

  it('profileValidator.size.sizeGateRunsBeforeJsonParse', async () => {
    // TC-01-16 / data-flows (a): step 1 (size) precedes step 3 (JSON.parse).
    // The input is deliberately NOT valid JSON — an implementation that
    // parses first answers E-VAL-001 and fails this pin.
    const error = await reject(
      invalidJsonOfSize(MAX_PROFILE_BYTES + 1),
      'E-VAL-002',
      'TC-01-16 oversized non-JSON',
    );
    expect(error.code, 'size is checked before syntax (data-flows (a) step 1 < step 3)').toBe(
      'E-VAL-002',
    );
  });
});

describe('gate 2 — UTF-8 / NUL (data-flows (a) step 2: BR-V-03 → E-VAL-003)', () => {
  it('profileValidator.utf8.pdfBytesRenamedToJsonRejectedWithEVal003', async () => {
    // TC-01-06 / AC-01.5: a PDF renamed to .json reaches the validator as
    // utf-8-decoded text with replacement characters and NULs — binary
    // content, not a parse error.
    const error = await reject(pdfRenamedRaw(), 'E-VAL-003', 'TC-01-06 PDF renamed to .json');
    expect(error.cause, 'the cause must say the content is not readable text').toContain(
      'not readable text',
    );
  });

  it('profileValidator.utf8.nulByteRejectedWithEVal003BeforeParse', async () => {
    // TC-01-17 / BR-V-03: content "contains no 0x00 byte". A raw NUL always
    // breaks JSON.parse too, so the NUL/decode gate must run BEFORE step 3 —
    // an implementation that parses first answers E-VAL-001 and fails here.
    const error = await reject(
      `${readConfigFixture('valid-client-config.json')}\u0000`,
      'E-VAL-003',
      'TC-01-17 embedded NUL byte',
    );
    expect(error.code, 'decode/NUL gate precedes JSON.parse (data-flows (a) step 2 < step 3)').toBe(
      'E-VAL-003',
    );
  });
});

describe('gate 3 — JSON syntax (data-flows (a) step 3: FR-03 → E-VAL-001)', () => {
  it('profileValidator.syntax.invalidJsonReportsExactLineAndColumn', async () => {
    // TC-01-03 / AC-01.3: the parse error is reported with its position —
    // the fixture pins the failure at line 4, column 7 (V8 agrees: see §9).
    const error = await reject(
      readConfigFixture('invalid-syntax.json'),
      'E-VAL-001',
      'TC-01-03 invalid syntax',
    );
    expect(error.cause, 'AC-01.3: the cause names the failing line').toContain('line 4');
    expect(error.cause, 'AC-01.3: the cause names the failing column').toContain('column 7');
  });

  it('profileValidator.syntax.emptyFileSameNotValidJsonError', async () => {
    // TC-01-10 / US-01 edge: an empty file produces the SAME "not valid
    // JSON" error as any other syntax failure — not a size or schema code.
    const fromEmpty = await reject(readConfigFixture('empty.json'), 'E-VAL-001', 'TC-01-10 empty');
    const fromSyntax = await reject(
      readConfigFixture('invalid-syntax.json'),
      'E-VAL-001',
      'TC-01-10 reference syntax error',
    );
    expect(fromEmpty.code, 'same code as any other JSON syntax failure').toBe(fromSyntax.code);
    expect(fromEmpty.title, 'same user-visible error, per the AC name').toBe(fromSyntax.title);
  });
});

describe('gate 4 — schema (data-flows (a) step 4: BR-V-01..14 → E-VAL-004..014, one message per FR-04)', () => {
  it('profileValidator.root.arrayRootRejectedWithEVal004', async () => {
    // TC-01-18 / BR-V-01: root must be a JSON object, not an array.
    const error = await reject(
      readConfigFixture('root-not-object.json'),
      'E-VAL-004',
      'TC-01-18 array root',
    );
    expect(error.cause, 'the cause must state the object requirement').toContain(
      'must be a JSON object',
    );
  });

  it('profileValidator.root.stringNumberBooleanNullRootsRejectedWithEVal004', async () => {
    // TC-01-18 (sibling) / BR-V-01 enumerates the remaining non-object roots.
    for (const root of ['"definitely not a profile"', '42', 'true', 'null']) {
      const error = await reject(root, 'E-VAL-004', `TC-01-18 root ${root}`);
      expect(error.code, `root ${root} violates BR-V-01 → E-VAL-004`).toBe('E-VAL-004');
    }
  });

  it('profileValidator.outbounds.noFedarishaOutboundRejectedWithEVal005', async () => {
    // TC-01-19 / BR-V-04: outbounds must contain a fedarisha outbound.
    const error = await reject(
      readConfigFixture('no-fedarisha-outbound.json'),
      'E-VAL-005',
      'TC-01-19 no fedarisha outbound',
    );
    expect(error.cause, 'the cause must name the missing protocol').toContain('outbound');
  });

  it('profileValidator.outbounds.outboundsNotArrayRejectedWithEVal005', async () => {
    // TC-01-20 / BR-V-04: `outbounds` must be a non-empty ARRAY — a
    // non-array container holds no fedarisha outbound either, so the same
    // code answers (errors.md §1 pattern: "no outbound with protocol").
    const error = await reject(
      readConfigFixture('outbounds-not-array.json'),
      'E-VAL-005',
      'TC-01-20 outbounds not an array',
    );
    expect(error.code, 'BR-V-04 array requirement shares the E-VAL-005 code').toBe('E-VAL-005');
  });

  it('profileValidator.storage.storageSectionMissingRejectedWithEVal011', async () => {
    // TC-01-21 / BR-V-05: the fedarisha outbound must carry settings.storage.
    const error = await reject(
      readConfigFixture('storage-missing.json'),
      'E-VAL-011',
      'TC-01-21 storage section missing',
    );
    expect(error.cause, 'the cause must state the storage shape requirement').toContain(
      'must be an object with',
    );
  });

  it('profileValidator.storage.storageTypeNotS3RejectedWithEVal011', async () => {
    // TC-01-21 (sibling) / BR-V-05: storage.type must equal "s3".
    const error = await reject(
      readConfigFixture('storage-type-not-s3.json'),
      'E-VAL-011',
      'TC-01-21 storage.type = minio',
    );
    expect(error.code, 'BR-V-05 type requirement → E-VAL-011').toBe('E-VAL-011');
  });

  it('profileValidator.storage.allMissingFieldsListedInSingleMessage', async () => {
    // TC-01-04 / FR-04 + AC-01.4: ALL missing fields appear in ONE E-VAL-006
    // triple (not one dialog per field), named in plain language. The two
    // documented display names are pinned verbatim ("S3 endpoint" — FR-04
    // example; "access key" — errors.md §1 example list); the remaining
    // fields are pinned as plain-language mentions per FR-04.
    const error = await reject(
      readConfigFixture('missing-s3-fields.json'),
      'E-VAL-006',
      'TC-01-04 all missing fields',
    );
    expect(error.cause, 'errors.md §1 template: "missing or has empty: [list]"').toContain(
      'missing or has empty',
    );
    expect(error.cause, 'FR-04 example display name for endpoint').toContain('S3 endpoint');
    expect(error.cause, 'errors.md §1 example display name for accessKey').toContain('access key');
    expect(error.cause, 'plain-language name for bucket (FR-04)').toMatch(/bucket/i);
    expect(error.cause, 'plain-language name for prefix (FR-04)').toMatch(/prefix/i);
    expect(error.cause, 'plain-language name for secretKey (FR-04)').toMatch(/secret/i);
  });

  it('profileValidator.storage.eachMissingFieldNamedPlainLanguage', async () => {
    // TC-01-04 (table-driven sibling) / FR-04: each single-field fixture is
    // rejected with E-VAL-006 and names exactly the field that is absent —
    // the case name of the plan row (unit, table-driven over field list).
    const cases: ReadonlyArray<readonly [string, RegExp]> = [
      ['missing-s3-bucket.json', /bucket/i],
      ['missing-s3-endpoint.json', /S3 endpoint/],
      ['missing-s3-prefix.json', /prefix/i],
      ['missing-access-key.json', /access key/i],
      ['missing-secret-key.json', /secret/i],
    ];
    for (const [name, pattern] of cases) {
      const error = await reject(readConfigFixture(name), 'E-VAL-006', `TC-01-04 ${name}`);
      expect(error.cause, `${name}: the message must name the offending field`).toMatch(pattern);
    }
  });

  it('profileValidator.storage.credentialsAbsentRejectedWithEVal006', async () => {
    // TC-01-12 / FR-04 + BR-V-06: credentials absent is a field-level
    // E-VAL-006 (errors.md §1: "missing or has empty" — the Q-A split would
    // refine wording only, never the code). The canary secret in the rest of
    // the config must not leak into the triple (checked by expectHumanError).
    const error = await reject(
      readConfigFixture('missing-credentials.json'),
      'E-VAL-006',
      'TC-01-12 credentials absent',
    );
    expect(error.cause, 'accessKey named in plain language').toContain('access key');
    expect(error.cause, 'secretKey named in plain language').toMatch(/secret/i);
  });

  it('profileValidator.storage.sessionsDirTraversalRejectedWithEVal006', async () => {
    // TC-01-22 / BR-V-08: sessionsDir with `..` is a required-settings
    // violation → E-VAL-006, and the message must name the field (FR-04).
    const error = await reject(
      readConfigFixture('sessions-dir-traversal.json'),
      'E-VAL-006',
      'TC-01-22 sessionsDir traversal',
    );
    expect(error.cause, 'FR-04: the message names the offending field').toMatch(/sessions/i);
  });

  it('profileValidator.endpoint.invalidEndpointRejectedWithEVal007NamingFoundValue', async () => {
    // TC-01-23 / BR-V-07 + errors.md §1 pattern: the cause interpolates the
    // offending endpoint ("found: [value]").
    const error = await reject(
      readConfigFixture('invalid-endpoint.json'),
      'E-VAL-007',
      'TC-01-23 schemeless endpoint',
    );
    expect(error.cause, 'errors.md §1 pattern interpolates the found value').toContain(
      's3.example.com',
    );
  });

  it('profileValidator.port.invalidSocksPortRejectedWithEVal008', async () => {
    // TC-01-24 / BR-V-10 range half: an integer outside 1..65535, or a
    // non-integer, is rejected with the port-range code and the offending
    // value is interpolated (errors.md §1 pattern). The ≠ 10808 half
    // (E-VAL-009) stays blocked on Q-AN-05 — DV-15.
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['port-zero.json', '0'],
      ['port-over-65535.json', '65536'],
      ['port-not-number.json', '10808'],
    ];
    for (const [fixture, value] of cases) {
      const error = await reject(readConfigFixture(fixture), 'E-VAL-008', `TC-01-24 ${fixture}`);
      expect(
        error.cause,
        `${fixture}: errors.md §1 pattern names the offending port (${value})`,
      ).toContain(value);
    }
  });

  it('profileValidator.listen.nonLoopbackListenRejectedWithEVal010', async () => {
    // TC-01-25 / BR-V-09: a non-loopback listen address would expose the
    // proxy — rejected with the unsafe-listen code, value interpolated.
    const error = await reject(
      readConfigFixture('listen-not-loopback.json'),
      'E-VAL-010',
      'TC-01-25 listen 0.0.0.0',
    );
    expect(error.cause, 'errors.md §1 pattern names the found address').toContain('0.0.0.0');
    expect(error.cause, 'the cause states the loopback-only rule').toContain('loopback');
  });

  it('profileValidator.inbound.nonSocksInboundRejectedWithEVal014', async () => {
    // TC-01-26 / BR-V-09 shape half: the SOCKS inbound entry must exist and
    // be a socks listener object.
    const error = await reject(
      readConfigFixture('inbound-not-socks.json'),
      'E-VAL-014',
      'TC-01-26 protocol http inbound',
    );
    expect(error.cause, 'the cause must state the socks-listener requirement').toContain(
      'listener object',
    );
  });

  it('profileValidator.tuning.outOfRangeValueRejectedWithEVal012', async () => {
    // TC-01-27 / BR-V-12: idleTimeoutSec must be in 5..86400 — the cause
    // names the field and the range (errors.md §1 pattern).
    const error = await reject(
      readConfigFixture('tuning-out-of-range.json'),
      'E-VAL-012',
      'TC-01-27 idleTimeoutSec = 3',
    );
    expect(error.cause, 'the offending tuning field is named (FR-04)').toContain('idleTimeoutSec');
    expect(error.cause, 'the cause states the whole-number range requirement').toContain(
      'whole number between',
    );
  });

  it('profileValidator.log.unknownLogLevelRejectedWithEVal013', async () => {
    // TC-01-28 / BR-V-13: loglevel must be one of the five enum values — the
    // cause lists them (errors.md §1 pattern), so the user can fix it.
    const error = await reject(
      readConfigFixture('unknown-loglevel.json'),
      'E-VAL-013',
      'TC-01-28 loglevel = verbose',
    );
    expect(error.cause, 'the cause must enumerate the allowed values').toContain('must be one of');
    expect(error.cause, 'first enum value listed').toContain('debug');
    expect(error.cause, 'last enum value listed').toContain('none');
  });
});

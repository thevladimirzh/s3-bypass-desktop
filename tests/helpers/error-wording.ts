/**
 * Shared NFR-5 wording machinery (docs/qa/strategy §7) used by both suites
 * that own rows of the `errorWording` table:
 *
 *  - `tests/unit/errorWording.test.ts` — the table itself (`E-STOR-*` rows,
 *    M1-08 batch; `E-VAL-*` rows, M1-11 batch);
 *  - `tests/unit/profile-validator.test.ts` — fixture-driven rejections, which
 *    run every rejection through the same `expectHumanError` contract.
 *
 * `WordingRow`, `FORBIDDEN`, `expectHumanError`, plus the M3-A additions
 * (`WORDING_BY_CODE` / `expectHumanWording` — the contract for surfaces driven
 * by sibling suites) are here so every consumer applies ONE contract; the
 * existing `E-STOR-*` rows and their assertions stay in `errorWording.test.ts`
 * untouched (strategy §5.2). The M3-A hardening extended `FORBIDDEN` with the
 * errors.md §0 amendment (2026-10-08): no internal `E-…-###` code and no OS
 * errno token may appear in title/cause/nextStep.
 *
 * Field docs: `title` is the exact `docs/analysis/errors.md` title (NFR-5a,
 * ≤ 60 chars, no code in title); `cause` / `nextStep` are required substrings
 * of the `errors.md` cause/next-step templates (NFR-5b/c) — chosen inside a
 * markdown-free segment of the template so code markup (`**bold**`,
 * `` `code` ``) never makes the pin vacuous; `FORBIDDEN` encodes the §0 global
 * rules (no stack traces, no exception class names, no raw config JSON) plus
 * NFR-2's canary rule (no secret ever appears in user-visible error text).
 *
 * The `E-VAL-*` rows below are the *import validator* codes from `errors.md`
 * §1 that `validateClientConfig` (M1-12 contract, see
 * `tests/unit/profile-validator-stub.ts`) must produce — one representative
 * trigger per code. Deliberately absent:
 *
 *  - `E-VAL-009` (unsupported SOCKS port ≠ 10808) — blocked pending Q-AN-05 /
 *    A-06 (reject vs. override is undecided), so no wording row may pin it;
 *  - `E-VAL-015` (stop the tunnel first) — data-flows (a) step 5 state gate,
 *    not the import validator (BR mapping in requirements §2.2).
 *
 * Every row is ABSENCE RED until `src/main/profile-validator.ts` exists
 * (strategy §5.2): `run()` loads the module under test and never falls back.
 */
import { expect } from 'vitest';

import type { AppError } from '../../src/shared/status-machine';
import {
  captureValidationError,
  loadProfileValidator,
  MAX_PROFILE_BYTES,
  paddedValidConfig,
  pdfRenamedRaw,
  readConfigFixture,
} from './profile-validator-stub';
import { readCanaries, tripleText } from './secret-store-stub';

export interface WordingRow {
  /** Test key (§4.2 title segment). */
  readonly id: string;
  /** Exact `errors.md` code the returned triple must carry. */
  readonly code: string;
  /** Human-readable description of the input that produces the error. */
  readonly trigger: string;
  /** Exact `errors.md` title (NFR-5a: plain language, ≤ 60 chars). */
  readonly title: string;
  /** Required substring of the `errors.md` cause sentence (NFR-5b). */
  readonly cause: string;
  /** Required substring of the `errors.md` next-step sentence (NFR-5c). */
  readonly nextStep: string;
  /** Produces the error through the module under test (absence RED first). */
  run(): Promise<AppError>;
}

/** §0 global rules + NFR-2: what must NEVER appear in user-visible error text. */
export const FORBIDDEN: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
  /**
   * M3-A: true = the rule is checked against the USER text only
   * (title/cause/nextStep) — the `code` field legitimately carries an
   * `E-…-###` value by design (errors.md §0: the code is internal, it is the
   * citations INSIDE the user text that are forbidden).
   */
  readonly userTextOnly?: boolean;
}> = [
  { label: 'a raw stack trace', pattern: /\n\s+at\s+\S+\(/ },
  { label: 'an exception class name', pattern: /SyntaxError|TypeError|ReferenceError|RangeError/ },
  { label: 'an "Error:" prefix', pattern: /Error:/ },
  { label: 'raw config JSON (accessKey)', pattern: /"accessKey"/ },
  { label: 'raw config JSON (secretKey)', pattern: /"secretKey"/ },
  { label: 'raw config JSON (outbounds)', pattern: /"outbounds"/ },
  // M3-A hardening (errors.md §0 amended 2026-10-08): the user text never
  // cites ANOTHER internal code and never leaks OS errno tokens — the `code`
  // field carries the code, the words stay plain. Added after the audit
  // caught `E-PLAT-001`/`E-PLAT-005` citations inside nextStep sentences.
  {
    label: 'an internal error code',
    pattern: /\bE-(?:VAL|IO|CORE|PLAT|STOR)-\d{3}\b/,
    userTextOnly: true,
  },
  {
    label: 'an operating-system errno token',
    pattern: /\b(?:ENOENT|EACCES|EPERM|EAGAIN|EBUSY|EMFILE|ENFILE|ENOTDIR|EISDIR)\b/,
    userTextOnly: true,
  },
];

/**
 * M3-A (m3-test-plan TC-POL-02): doc-exact wording pins for codes whose
 * surfaces are driven by the *sibling* suites (the supervisor spawns real
 * children — the wording contract travels to THEM via `expectHumanWording`
 * instead of duplicating the port-lock machinery here).
 */
export interface WordingPins {
  readonly code: string;
  readonly title: string;
  /** Required substring of the `errors.md` cause sentence. */
  readonly cause: string;
  /** Required substring of the `errors.md` next-step sentence. */
  readonly nextStep: string;
}

export const WORDING_BY_CODE: Readonly<Record<string, WordingPins>> = {
  'E-IO-003': {
    code: 'E-IO-003',
    title: 'Local port 10808 is busy',
    cause: 'Another program is already using',
    nextStep: 'Quit that program, then click Start.',
  },
  'E-IO-004': {
    code: 'E-IO-004',
    title: 'Core binary check failed',
    cause: 'was not found in the app installation',
    nextStep: 'Reinstall the app.',
  },
  'E-IO-006': {
    code: 'E-IO-006',
    title: 'Could not prepare the tunnel config',
    cause: 'The temporary config file could not be written',
    nextStep: 'Free disk space / check permissions, then Start again.',
  },
  'E-CORE-001': {
    code: 'E-CORE-001',
    title: 'The tunnel stopped unexpectedly',
    cause: 'The tunnel engine exited with code',
    nextStep: 'Click Start to try again; if it repeats, check the Logs view.',
  },
  'E-CORE-002': {
    code: 'E-CORE-002',
    title: 'The tunnel did not start in time',
    cause: 'The tunnel engine did not become ready within',
    nextStep: 'Click Start again; if it repeats, check the Logs view.',
  },
  'E-CORE-003': {
    code: 'E-CORE-003',
    title: 'The tunnel could not be launched',
    cause: 'The tunnel engine failed to launch',
    // M3-A RED pin: the doc citation "(E-PLAT-005)" is GONE (errors.md §0
    // amendment) — this substring fails until GREEN rewords the nextStep.
    nextStep: 'Reinstall the app; on macOS, allow the unsigned app per the Gatekeeper instructions',
  },
  'E-VAL-016': {
    code: 'E-VAL-016',
    title: 'No profile imported yet',
    cause: 'The tunnel cannot start because no profile has been imported.',
    nextStep: 'Import a profile first, then click Start.',
  },
  'E-VAL-017': {
    code: 'E-VAL-017',
    title: 'Action unavailable in the current state',
    cause: 'is not valid while the core is',
    nextStep: 'Wait for the current step to finish, then try again.',
  },
};

/**
 * M3-A (TC-POL-02): the shared NFR-5 contract for a surface that produces the
 * error itself (lookup by `error.code`) — same field checks, FORBIDDEN rules
 * and canary scan as `expectHumanError`.
 */
export function expectHumanWording(context: string, error: AppError): void {
  const pins = WORDING_BY_CODE[error.code];
  if (pins === undefined) {
    throw new Error(`no WORDING_BY_CODE pins declared for ${error.code} — extend the table`);
  }
  expect(error.title, `${context}: exact errors.md title (NFR-5a)`).toBe(pins.title);
  expect(error.title.length, `${context}: title ≤ 60 chars (errors.md §0)`).toBeLessThanOrEqual(60);
  expect(error.title, `${context}: the code never appears in the title`).not.toContain(pins.code);
  expect(error.cause, `${context}: cause must follow the errors.md template (NFR-5b)`).toContain(
    pins.cause,
  );
  expect(
    error.nextStep,
    `${context}: next step must follow the errors.md template (NFR-5c)`,
  ).toContain(pins.nextStep);

  const text = tripleText(error);
  const userText = `${error.title} ${error.cause} ${error.nextStep}`;
  for (const rule of FORBIDDEN) {
    expect(
      rule.pattern.test(rule.userTextOnly === true ? userText : text),
      `${context}: user-visible error must not contain ${rule.label} (errors.md §0, FR-48)`,
    ).toBe(false);
  }
  for (const canary of readCanaries()) {
    expect(
      text.includes(canary),
      `${context}: no secret may appear in user-visible error text (NFR-2, §8.4 SECRET)`,
    ).toBe(false);
  }
}

/** Strategy §7 shared assertion — every row passes the same NFR-5 contract. */
export function expectHumanError(row: WordingRow, error: AppError): void {
  expect(error.code, `${row.id}: exact errors.md code`).toBe(row.code);
  expect(error.title, `${row.id}: exact errors.md title (NFR-5a)`).toBe(row.title);
  expect(error.title.length, `${row.id}: title ≤ 60 chars (errors.md §0)`).toBeLessThanOrEqual(60);
  expect(
    error.title,
    `${row.id}: the code never appears in the title (errors.md §0)`,
  ).not.toContain(row.code);
  expect(error.cause, `${row.id}: cause must follow the errors.md template (NFR-5b)`).toContain(
    row.cause,
  );
  expect(
    error.nextStep,
    `${row.id}: next step must follow the errors.md template (NFR-5c)`,
  ).toContain(row.nextStep);

  const text = tripleText(error);
  const userText = `${error.title} ${error.cause} ${error.nextStep}`;
  for (const rule of FORBIDDEN) {
    expect(
      rule.pattern.test(rule.userTextOnly === true ? userText : text),
      `${row.id}: user-visible error must not contain ${rule.label} (errors.md §0, FR-48)`,
    ).toBe(false);
  }
  for (const canary of readCanaries()) {
    expect(
      text.includes(canary),
      `${row.id}: no secret may appear in user-visible error text (NFR-2, §8.4 SECRET)`,
    ).toBe(false);
  }
}

/**
 * One representative `errors.md` §1 trigger per import-validator code, driven
 * through the M1-12 contract `validateClientConfig(raw: string)` (raw file
 * text in, NFR-5 triple out — returned, never thrown). Table rows for
 * `E-VAL-002`/`E-VAL-003` use the generated gate inputs because a static
 * > 1 MiB or binary fixture fails the CI gate `prettier --check .`
 * (deviation DV-10).
 */
export const E_VAL_WORDING_ROWS: readonly WordingRow[] = [
  {
    id: 'notValidJson',
    code: 'E-VAL-001',
    trigger: 'invalid-syntax.json — comment-based parse error pinned at line 4, column 7 (FR-03)',
    title: 'This file is not a valid profile',
    cause: 'The file is not valid JSON',
    nextStep: 'Fix the file at that position or get a fresh config, then import again.',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('invalid-syntax.json')),
        'E-VAL-001 (invalid-syntax.json)',
      );
    },
  },
  {
    id: 'fileTooLarge',
    code: 'E-VAL-002',
    trigger: 'valid JSON padded to 1 048 577 bytes — BR-V-02 upper bound exceeded (AC-01.5)',
    title: 'Profile file too large',
    cause: 'profiles must be under 1 MiB',
    nextStep: 'this file is probably something else',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(paddedValidConfig(MAX_PROFILE_BYTES + 1)),
        'E-VAL-002 (1 048 577 bytes)',
      );
    },
  },
  {
    id: 'binaryContent',
    code: 'E-VAL-003',
    trigger: 'pdfRenamedRaw() — PDF magic bytes with NUL/invalid UTF-8, utf-8 decoded (BR-V-03)',
    title: 'Unsupported file type',
    cause: 'The file content is not readable text (binary data)',
    nextStep: 'profile exported from your provider or bot',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(pdfRenamedRaw()),
        'E-VAL-003 (PDF bytes renamed to .json)',
      );
    },
  },
  {
    id: 'rootNotObject',
    code: 'E-VAL-004',
    trigger: 'root-not-object.json — JSON array at top level instead of an object (BR-V-01)',
    title: 'This is not a profile config',
    cause: 'The top level of the file must be a JSON object',
    nextStep: 'Re-export the profile as a JSON object and import again.',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('root-not-object.json')),
        'E-VAL-004 (array root)',
      );
    },
  },
  {
    id: 'noFedarishaOutbound',
    code: 'E-VAL-005',
    trigger:
      'no-fedarisha-outbound.json — outbounds without a `"protocol": "fedarisha"` entry (BR-V-04)',
    title: 'No fedarisha connection found',
    cause: 'The config contains no outbound with protocol',
    nextStep: 'not a server config',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('no-fedarisha-outbound.json')),
        'E-VAL-005 (no fedarisha outbound)',
      );
    },
  },
  {
    id: 'missingRequiredSettings',
    code: 'E-VAL-006',
    trigger:
      'missing-s3-fields.json — bucket/endpoint/prefix/accessKey/secretKey missing or empty, ' +
      'reported in ONE message (FR-04, BR-V-06)',
    title: 'Profile is missing required settings',
    cause: 'The config is missing or has empty',
    nextStep: 'Ask your provider for a complete config',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('missing-s3-fields.json')),
        'E-VAL-006 (missing s3 fields)',
      );
    },
  },
  {
    id: 'invalidS3Endpoint',
    code: 'E-VAL-007',
    trigger: 'invalid-endpoint.json — endpoint `s3.example.com` has no http(s):// scheme (BR-V-07)',
    title: 'Invalid S3 endpoint',
    cause: 'The endpoint is not a valid',
    nextStep: 'Correct the endpoint to a full URL like',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('invalid-endpoint.json')),
        'E-VAL-007 (schemeless endpoint)',
      );
    },
  },
  {
    id: 'invalidSocksPort',
    code: 'E-VAL-008',
    trigger: 'port-zero.json — SOCKS inbound port 0 outside the 1..65535 range (BR-V-10)',
    title: 'Invalid SOCKS port',
    cause: 'is not a number between 1 and 65535',
    nextStep: "the app's fixed local port",
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('port-zero.json')),
        'E-VAL-008 (port 0)',
      );
    },
  },
  {
    id: 'unsafeListenAddress',
    code: 'E-VAL-010',
    trigger: 'listen-not-loopback.json — SOCKS inbound listens on 0.0.0.0 (BR-V-09)',
    title: 'Unsafe listen address',
    cause: 'it must listen on loopback only',
    nextStep: 'and re-import',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('listen-not-loopback.json')),
        'E-VAL-010 (listen 0.0.0.0)',
      );
    },
  },
  {
    id: 'invalidStorageSettings',
    code: 'E-VAL-011',
    trigger: 'storage-type-not-s3.json — settings.storage.type is "minio", not "s3" (BR-V-05)',
    title: 'Invalid storage settings',
    cause: 'must be an object with',
    nextStep: "if it's a custom config, set",
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('storage-type-not-s3.json')),
        'E-VAL-011 (storage.type = minio)',
      );
    },
  },
  {
    id: 'invalidTuningValue',
    code: 'E-VAL-012',
    trigger: 'tuning-out-of-range.json — idleTimeoutSec 3 below the 5..86400 range (BR-V-12)',
    title: 'Invalid tuning value',
    cause: 'must be a whole number between',
    nextStep: 'use defaults; re-import',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('tuning-out-of-range.json')),
        'E-VAL-012 (idleTimeoutSec = 3)',
      );
    },
  },
  {
    id: 'invalidLogLevel',
    code: 'E-VAL-013',
    trigger: 'unknown-loglevel.json — log.loglevel "verbose" outside the enum (BR-V-13)',
    title: 'Invalid log level',
    cause: 'must be one of',
    nextStep: 'Correct the value or remove the',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('unknown-loglevel.json')),
        'E-VAL-013 (loglevel = verbose)',
      );
    },
  },
  {
    id: 'invalidInboundSettings',
    code: 'E-VAL-014',
    trigger: 'inbound-not-socks.json — the only inbound entry has protocol "http" (BR-V-09)',
    title: 'Invalid inbound settings',
    cause: 'listener object',
    nextStep: 'the app only supports a local SOCKS inbound',
    run: async () => {
      const validator = await loadProfileValidator();
      return captureValidationError(
        validator.validateClientConfig(readConfigFixture('inbound-not-socks.json')),
        'E-VAL-014 (protocol = http)',
      );
    },
  },
];

/** Row lookup for fixture-driven suites — fails loudly on an unpinned code. */
export function wordingRowFor(code: string): WordingRow {
  const row = E_VAL_WORDING_ROWS.find((candidate) => candidate.code === code);
  if (row === undefined) {
    throw new Error(`no errorWording row pinned for ${code} — extend E_VAL_WORDING_ROWS first`);
  }
  return row;
}

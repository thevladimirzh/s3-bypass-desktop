/**
 * Shared test double for the M1-11 (RED) profile-validator batch — never a
 * dialog, never a real file read inside the module, never a network call
 * (strategy §1: synthetic fixtures only).
 *
 * Declares the M1-12 contract surface (full text in the header of
 * tests/unit/profile-validator.test.ts): module `src/main/profile-validator.ts`
 * exporting `validateClientConfig(raw: string)` — a pure main-side function
 * over the raw file text that returns the NFR-5 `AppError` triple on
 * rejection instead of throwing.
 *
 * Fixture readers model data-flows (a) step 2 (read the picked file as
 * utf-8). Generated gate inputs live here because a static file is
 * impractical (deviation DV-10, docs/qa/m1-test-plan.md §14):
 *  - `invalidJsonOfSize(n)` — an n-byte non-JSON string; a static > 1 MiB
 *    fixture would bloat the repo;
 *  - `paddedValidConfig(n)` — the canary config padded to exactly n bytes,
 *    so the byte-exact BR-V-02 boundary (1 048 576 accepted / 1 048 577
 *    rejected) is pinned with one input each;
 *  - `pdfRenamedRaw()` — the utf-8 decode of PDF magic bytes containing NUL
 *    and invalid UTF-8 (TC-01-06's `pdf-renamed.json`): a static binary
 *    `.json` fails the CI gate `prettier --check .` with a parse error
 *    (verified, exit 2), so the bytes are generated and decoded here —
 *    producing exactly the string data-flows (a) step 2 hands the validator.
 *
 * This file is a helper, not a suite: `vitest.config.ts` includes only
 * `*.test.ts(x)` under `tests/`, so nothing here is ever collected as a case.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AppError } from '../../src/shared/status-machine';

/** BR-V-02: files up to and including 1 048 576 bytes are accepted. */
export const MAX_PROFILE_BYTES = 1_048_576;

/** M1-12 contract: discriminated result — rejections are returned, not thrown. */
export type ValidationResult =
  { ok: true; config: Record<string, unknown> } | { ok: false; error: AppError };

/** The module surface QA declares for M1-12 (header-contract style, cf. DV-09). */
export interface ProfileValidatorApi {
  validateClientConfig(raw: string): ValidationResult;
}

/**
 * Loads the module under test. RED until M1-12 creates
 * `src/main/profile-validator.ts`: the dynamic import rejects with a
 * module-resolution error, which is the legitimate *absence RED* reason for
 * this batch (strategy §5.2) — never weaken this path or the tests behind it.
 */
export async function loadProfileValidator(): Promise<ProfileValidatorApi> {
  return await import('../../src/main/profile-validator');
}

/** utf-8 read of a config fixture — models data-flows (a) step 2. */
export function readConfigFixture(name: string): string {
  return readFileSync(fixturePath(name), 'utf8');
}

/**
 * Derived input: the §9.1 canary config mutated in memory — for one-variant
 * clauses where a dedicated static fixture would add no spec value.
 */
export function deriveValidRaw(mutate: (doc: ConfigDoc) => void): string {
  const doc = JSON.parse(readConfigFixture('valid-client-config.json')) as ConfigDoc;
  mutate(doc);
  return JSON.stringify(doc, null, 2);
}

/** Shallow shape of the canary client config (requirements §2). */
export interface ConfigDoc {
  log?: { loglevel?: string };
  inbounds?: Array<Record<string, unknown>>;
  outbounds?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** The fedarisha outbound's `settings` object — target of BR-V-05/06/12 mutations. */
export function fedarishaSettings(doc: ConfigDoc): Record<string, unknown> {
  const outbound = doc.outbounds?.find((entry) => entry['protocol'] === 'fedarisha');
  const settings = outbound?.['settings'];
  if (settings === null || typeof settings !== 'object') {
    throw new Error('deriveValidRaw: baseline config lost its fedarisha settings block');
  }
  return settings as Record<string, unknown>;
}

/** A non-JSON string of exactly `bytes` bytes — the oversized gate input (BR-V-02). */
export function invalidJsonOfSize(bytes: number): string {
  return 'x'.repeat(bytes);
}

/**
 * The canary config padded with an ASCII filler key to exactly `totalBytes`
 * bytes — the byte-exact BR-V-02 boundary input (≤ limit accepted).
 */
export function paddedValidConfig(totalBytes: number): string {
  const doc = JSON.parse(readConfigFixture('valid-client-config.json')) as Record<string, unknown>;
  const probe = JSON.stringify({ ...doc, pad: '' });
  const filler = totalBytes - Buffer.byteLength(probe, 'utf8');
  if (filler < 0) {
    throw new Error(`paddedValidConfig(${totalBytes}): target smaller than the base config`);
  }
  const raw = JSON.stringify({ ...doc, pad: 'x'.repeat(filler) });
  const actual = Buffer.byteLength(raw, 'utf8');
  if (actual !== totalBytes) {
    throw new Error(
      `paddedValidConfig(${totalBytes}): invariant broken — produced ${actual} bytes`,
    );
  }
  return raw;
}

/**
 * TC-01-06's `pdf-renamed.json`, generated: PDF magic bytes + NUL bytes +
 * invalid UTF-8, decoded as utf-8 — a `.pdf` renamed to `.json` exactly as
 * the pipeline reads it (data-flows (a) step 2).
 */
export function pdfRenamedRaw(): string {
  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'ascii'),
    // NUL bytes + invalid UTF-8 sequences — the BR-V-03 gate tripwires.
    Buffer.from([0x00, 0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28]),
    Buffer.from('\ntrailer\n%%EOF\n', 'ascii'),
  ]);
  return bytes.toString('utf8');
}

/**
 * Returns the rejection's NFR-5 triple, or fails the test when the validator
 * accepted the input — a validator that accepts everything is a bad config
 * waiting to reach the core (FR-04, AC-01.4).
 */
export function captureValidationError(result: ValidationResult, context: string): AppError {
  if (result.ok) {
    throw new Error(`${context}: expected the validator to reject this input, but it returned ok`);
  }
  return result.error;
}

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/configs/${name}`, import.meta.url));
}

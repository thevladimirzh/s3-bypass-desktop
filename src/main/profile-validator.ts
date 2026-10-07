/**
 * Profile-import validation pipeline — M1-12 (GREEN half of the M1-11 RED
 * contract declared in tests/unit/profile-validator.test.ts and mirrored as
 * `ProfileValidatorApi` in tests/helpers/profile-validator-stub.ts).
 *
 * `validateClientConfig` is a pure function over the raw file text: the
 * import pipeline picks the file and reads it as utf-8 (data-flows (a)
 * steps 1-2) and hands the resulting string here, so this module does no fs,
 * no IPC, no dialog, no network (BR-V-16, strategy §1) — the size gate
 * measures the text it is given, not a file on disk, so nothing is
 * double-gated upstream.
 *
 * Gate order mirrors data-flows (a) exactly:
 *   1. size ≤ 1 048 576 B        → E-VAL-002 (BR-V-02, before parse)
 *   2. readable text, no 0x00    → E-VAL-003 (BR-V-03, before parse)
 *   3. JSON.parse + line/column  → E-VAL-001 (FR-03, US-01 AC-01.3)
 *   4. schema BR-V-01..BR-V-14   → E-VAL-004..014 (FR-04: ONE message
 *      listing every missing/invalid field name)
 * Step 5 (core-running gate → E-VAL-015) is an import-pipeline state concern
 * and deliberately out of scope here (DV-15).
 *
 * Every rejection returns the NFR-5 `AppError` triple of exactly one
 * `errors.md` §1 code — never a thrown exception, never a raw parser
 * message or stack (FR-11, FR-48); found values are interpolated as facts
 * (endpoint, port, address, tuning value), never raw config text or
 * credentials (errors.md §0, NFR-2).
 */
import type { AppError } from '../shared/status-machine';

/** BR-V-02: inclusive byte ceiling for an imported profile (1 MiB). */
const MAX_PROFILE_BYTES = 1_048_576;

/** Discriminated outcome — a rejection is returned as data, never thrown (FR-11). */
export type ValidationResult =
  { ok: true; config: Record<string, unknown> } | { ok: false; error: AppError };

/** Exact `errors.md` §1 title + next step per code — `cause` is built per trigger. */
interface Wording {
  readonly title: string;
  readonly nextStep: string;
}

const ERRORS = {
  'E-VAL-001': {
    title: 'This file is not a valid profile',
    nextStep: 'Fix the file at that position or get a fresh config, then import again.',
  },
  'E-VAL-002': {
    title: 'Profile file too large',
    nextStep: 'Pick the actual profile JSON — this file is probably something else.',
  },
  'E-VAL-003': {
    title: 'Unsupported file type',
    nextStep: 'Choose a .json profile exported from your provider or bot.',
  },
  'E-VAL-004': {
    title: 'This is not a profile config',
    nextStep: 'Re-export the profile as a JSON object and import again.',
  },
  'E-VAL-005': {
    title: 'No fedarisha connection found',
    nextStep: 'Import a client config issued for the S3 tunnel, not a server config.',
  },
  'E-VAL-006': {
    title: 'Profile is missing required settings',
    nextStep: 'Ask your provider for a complete config, fill in the listed fields, re-import.',
  },
  'E-VAL-007': {
    title: 'Invalid S3 endpoint',
    nextStep: 'Correct the endpoint to a full URL like https://s3.example.com and re-import.',
  },
  'E-VAL-008': {
    title: 'Invalid SOCKS port',
    nextStep: "Use port 10808 (the app's fixed local port) and re-import.",
  },
  'E-VAL-010': {
    title: 'Unsafe listen address',
    nextStep: 'Set listen to 127.0.0.1 and re-import.',
  },
  'E-VAL-011': {
    title: 'Invalid storage settings',
    nextStep: "Re-export the profile; if it's a custom config, set storage.type to s3.",
  },
  'E-VAL-012': {
    title: 'Invalid tuning value',
    nextStep: 'Fix the value in the config or remove the tuning block to use defaults; re-import.',
  },
  'E-VAL-013': {
    title: 'Invalid log level',
    nextStep: 'Correct the value or remove the log block; re-import.',
  },
  'E-VAL-014': {
    title: 'Invalid inbound settings',
    nextStep: 'Re-export the profile; the app only supports a local SOCKS inbound.',
  },
} as const satisfies Record<string, Wording>;

/** Only codes this validator may answer (E-VAL-009/015 are out of scope — DV-15). */
type ErrorCode = keyof typeof ERRORS;

/** Builds the rejection triple: one code, its pinned title/next step, a fresh cause. */
function reject(code: ErrorCode, cause: string): ValidationResult {
  const { title, nextStep } = ERRORS[code];
  return { ok: false, error: { code, title, cause, nextStep } };
}

/** BR-V-03 tripwires: the NUL byte and the utf-8 decode-replacement character. */
const NUL_BYTE = String.fromCharCode(0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/** Plain JSON object (BR-V-01 root, containers) — arrays/null are not records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Human-facing "found" value — a concrete fact, never a whole config document. */
function displayValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular or exotic value: fall back rather than throw — FR-11.
    return String(value);
  }
}

/** 1-based line/column of `position` inside `raw` (FR-03 reporting fallback). */
function lineColumnOf(raw: string, position: number): { line: number; column: number } {
  const offset = Math.min(Math.max(position, 0), raw.length);
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (raw.charCodeAt(index) === 10 /* LF */) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/**
 * FR-03 / AC-01.3 cause: the literal "not valid JSON" phrase plus the parse
 * location. Only the position numbers are taken from the platform message —
 * its snippet text is raw config and must never reach the UI (errors.md §0).
 */
function jsonSyntaxCause(parseError: unknown, raw: string): string {
  const message = parseError instanceof Error ? parseError.message : '';
  // Current V8 already appends "(line L column C)"; older builds only report
  // "position N" (0-based), which is converted to the 1-based pair.
  const pinpointed = /\(line (\d+) column (\d+)\)/.exec(message);
  if (pinpointed !== null) {
    return `The file is not valid JSON — syntax error at line ${pinpointed[1]}, column ${pinpointed[2]}.`;
  }
  const positioned = /position (\d+)/.exec(message);
  if (positioned !== null) {
    const { line, column } = lineColumnOf(raw, Number(positioned[1]));
    return `The file is not valid JSON — syntax error at line ${line}, column ${column}.`;
  }
  // No position (e.g. a 0-byte file) — same code and title, no location to name.
  return 'The file is not valid JSON.';
}

/** BR-V-04: the fedarisha outbound of a non-empty `outbounds` array. */
function findFedarishaOutbound(doc: Record<string, unknown>): Record<string, unknown> | null {
  const outbounds = doc['outbounds'];
  if (!Array.isArray(outbounds) || outbounds.length === 0) {
    return null;
  }
  for (const entry of outbounds) {
    if (isRecord(entry) && entry['protocol'] === 'fedarisha') {
      return entry;
    }
  }
  return null;
}

/** BR-V-06: required storage fields with their plain-language display names (FR-04). */
const REQUIRED_STORAGE_FIELDS: ReadonlyArray<{ readonly key: string; readonly label: string }> = [
  { key: 'bucket', label: 'bucket' },
  { key: 'region', label: 'region' },
  { key: 'endpoint', label: 'S3 endpoint' },
  { key: 'prefix', label: 'prefix' },
  { key: 'accessKey', label: 'access key' },
  { key: 'secretKey', label: 'secret key' },
];

/** BR-V-08: `sessionsDir` must be a relative path that never climbs out (`..`). */
function isTraversalFreeSessionsDir(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('~') || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  return !value.split(/[\\/]+/).includes('..');
}

/** BR-V-07: absolute http(s) URL, non-empty host, no userinfo, no fragment. */
function isValidEndpoint(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname.length > 0 &&
    url.username === '' &&
    url.password === '' &&
    url.hash === ''
  );
}

/** BR-V-09: the loopback addresses a local SOCKS inbound may bind to. */
const LOOPBACK_ADDRESSES: ReadonlyArray<string> = ['127.0.0.1', '::1'];

/** BR-V-12: tuning fields and their `[ASSUMPTION]` ranges (Q-AN-04). */
const TUNING_RANGES: ReadonlyArray<{
  readonly key: string;
  readonly min: number;
  readonly max: number;
}> = [
  { key: 'idleTimeoutSec', min: 5, max: 86_400 },
  { key: 'pollIntervalMs', min: 10, max: 60_000 },
  { key: 'writeIntervalMs', min: 1, max: 60_000 },
  { key: 'maxFileSizeBytes', min: 1024, max: 67_108_864 },
];

/** BR-V-13: the Xray `log.loglevel` enum. */
const LOG_LEVELS: readonly string[] = ['debug', 'info', 'warning', 'error', 'none'];

/**
 * Validates the raw text of an imported client config (data-flows (a)
 * gates 1-4) and returns the parsed document on acceptance, or exactly one
 * NFR-5 rejection triple — returned, never thrown (FR-11).
 *
 * @param raw the picked file's utf-8 text — stat/read belong to the caller
 */
export function validateClientConfig(raw: string): ValidationResult {
  // Gate 1 — BR-V-02 size, before the content is looked at (step 1 < step 3).
  const size = Buffer.byteLength(raw, 'utf8');
  if (size > MAX_PROFILE_BYTES) {
    const mib = (size / MAX_PROFILE_BYTES).toFixed(2);
    return reject('E-VAL-002', `The selected file is ${mib} MiB; profiles must be under 1 MiB.`);
  }

  // Gate 2 — BR-V-03 readable text: no NUL byte, no decode-replacement
  // character (a utf-8 read of binary data). Runs before JSON.parse.
  if (raw.includes(NUL_BYTE) || raw.includes(REPLACEMENT_CHARACTER)) {
    return reject('E-VAL-003', 'The file content is not readable text (binary data).');
  }

  // Gate 3 — FR-03 syntax: one "not valid JSON" error for every parse failure,
  // carrying the line/column of the failure (0-byte file included).
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    return reject('E-VAL-001', jsonSyntaxCause(parseError, raw));
  }

  // Gate 4 — schema, in BR order; each failure answers one documented code
  // and FR-04 collects every offending field name into a single message.
  if (!isRecord(parsed)) {
    return reject('E-VAL-004', 'The top level of the file must be a JSON object { … }.');
  }

  // BR-V-04 — outbounds must be a non-empty array holding the fedarisha outbound.
  const outbound = findFedarishaOutbound(parsed);
  if (outbound === null) {
    return reject('E-VAL-005', 'The config contains no outbound with protocol fedarisha.');
  }

  const settings = outbound['settings'];
  const storage = isRecord(settings) ? settings['storage'] : undefined;

  // BR-V-05 — shape and type come before any field-level check (a missing
  // storage block answers the storage-shape code, not a "missing field" code).
  if (!isRecord(storage) || storage['type'] !== 's3') {
    return reject('E-VAL-011', 'settings.storage must be an object with type = "s3".');
  }

  // BR-V-06 + BR-V-08 — one E-VAL-006 message naming every missing/empty
  // field plus any sessionsDir traversal violation (FR-04, single message).
  const problems: string[] = [];
  for (const { key, label } of REQUIRED_STORAGE_FIELDS) {
    const value = storage[key];
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(label);
    }
  }
  const sessionsDir = storage['sessionsDir'];
  if (sessionsDir !== undefined && !isTraversalFreeSessionsDir(sessionsDir)) {
    problems.push('sessionsDir (must be a relative path without "..")');
  }
  if (problems.length > 0) {
    return reject(
      'E-VAL-006',
      `The config is missing or has empty/invalid settings: ${problems.join(', ')}.`,
    );
  }

  // BR-V-07 — endpoint shape; the offending value is named as a concrete fact.
  if (!isValidEndpoint(storage['endpoint'])) {
    return reject(
      'E-VAL-007',
      `The endpoint is not a valid http(s):// URL (found: ${displayValue(storage['endpoint'])}).`,
    );
  }

  // BR-V-09 — EVERY declared inbound entry must be a socks listener bound to
  // loopback: the import validator is the only enforcement point (S5-1), so a
  // conforming first entry must never mask an extra entry binding 0.0.0.0.
  const inbounds = parsed['inbounds'];
  if (inbounds !== undefined) {
    if (!Array.isArray(inbounds)) {
      return reject('E-VAL-014', 'The inbounds entry must be a socks listener object.');
    }
    let socks: Record<string, unknown> | null = null;
    for (const entry of inbounds) {
      // BR-V-09 (shape half) — a non-record or non-socks entry is not a
      // supported listener at all (errors.md §1, E-VAL-014).
      if (!isRecord(entry) || entry['protocol'] !== 'socks') {
        return reject('E-VAL-014', 'The inbounds entry must be a socks listener object.');
      }
      // BR-V-09 (address half) — loopback only, otherwise the proxy would be
      // exposed (errors.md §1, E-VAL-010; the found address is interpolated).
      const listen = entry['listen'];
      if (!LOOPBACK_ADDRESSES.includes(String(listen))) {
        return reject(
          'E-VAL-010',
          `The proxy inbound listens on ${displayValue(listen)}; it must listen on loopback only (127.0.0.1).`,
        );
      }
      if (socks === null) {
        socks = entry;
      }
    }
    if (socks === null) {
      return reject('E-VAL-014', 'The inbounds entry must be a socks listener object.');
    }

    // BR-V-10 (range half) — checked on the first socks entry once every
    // entry passed the loopback scan; E-VAL-009 (≠ 10808) stays blocked on
    // Q-AN-05 (DV-15).
    const port = socks['port'];
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65_535) {
      return reject(
        'E-VAL-008',
        `The inbound port ${displayValue(port)} is not a number between 1 and 65535.`,
      );
    }
  }

  // BR-V-12 — tuning, when present, must be whole numbers inside the ranges.
  const tuning = isRecord(settings) ? settings['tuning'] : undefined;
  if (tuning !== undefined) {
    if (!isRecord(tuning)) {
      return reject('E-VAL-012', 'settings.tuning must be an object of whole numbers in range.');
    }
    for (const { key, min, max } of TUNING_RANGES) {
      const value = tuning[key];
      if (value === undefined) {
        continue; // absent tuning fields fall back to core defaults (BR-V-12)
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        return reject(
          'E-VAL-012',
          `${key} must be a whole number between ${min} and ${max} (found ${displayValue(value)}).`,
        );
      }
    }
  }

  // BR-V-13 — loglevel, when present, must be one of the five enum values.
  const log = parsed['log'];
  if (isRecord(log) && log['loglevel'] !== undefined) {
    const loglevel = log['loglevel'];
    if (typeof loglevel !== 'string' || !LOG_LEVELS.includes(loglevel)) {
      return reject(
        'E-VAL-013',
        `log.loglevel must be one of ${LOG_LEVELS.join(', ')} (found: ${displayValue(loglevel)}).`,
      );
    }
  }

  // BR-V-14: the parsed document passes through untouched — extra fields ride along.
  return { ok: true, config: parsed };
}

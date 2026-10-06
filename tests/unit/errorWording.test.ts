/**
 * NFR-5 error-wording table (docs/qa/strategy §7) — the `E-STOR-*` rows.
 *
 * Test plan ID: TC-NFR5-01 (`errorWording.table.everyUserVisibleErrorHasTitleCauseNextStepNoStack`)
 * — storage rows `E-STOR-001` (encryption unavailable), `E-STOR-002`
 * (keychain denied), `E-STOR-003` (corrupt store). Per m1-test-plan §8 and
 * strategy §7/§12.2 the table grows inside *every* RED batch: this file is
 * created by the M1-08 batch with the three storage rows only; the M1-11
 * batch adds the `E-VAL-*` rows. Existing rows are never removed, retitled or
 * loosened (strategy §5.2).
 *
 * Wording source (the executable half of errors.md §0 + §5): `title` is the
 * exact `docs/analysis/errors.md` §5 template title; `cause` / `nextStep` are
 * required substrings of the §5 template sentences; the shared `FORBIDDEN`
 * rules encode §0's global rules (no stack traces, no exception class names,
 * no raw config JSON) plus NFR-2's canary rule (no secret ever appears in
 * user-visible error text).
 *
 * Trigger for every row: the M1-09 store module
 * (`src/main/secret-store.ts`) with the same stubbed `electron.safeStorage`
 * as tests/unit/secret-store.test.ts — ABSENCE RED until M1-09 lands
 * (strategy §5.2). Codes pinned here are the ones the FR states verbatim:
 * FR-53 → 001, FR-57 → 002, FR-59 → 003.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppError } from '../../src/shared/status-machine';
import {
  captureAppError,
  clearDirectory,
  createUserDataDir,
  listFilesRecursive,
  loadSecretStore,
  probe,
  readCanaries,
  readCanaryConfig,
  readCorruptStoreBlob,
  removeDirectory,
  resetProbe,
  tripleText,
} from '../helpers/secret-store-stub';

vi.mock('electron', async () =>
  (await import('../helpers/secret-store-stub')).electronModuleMock(),
);

const CONFIG = readCanaryConfig();

interface WordingRow {
  /** Test key (§4.2 title segment). */
  readonly id: string;
  /** Exact `errors.md` §5 code the thrown triple must carry. */
  readonly code: string;
  /** Human-readable description of the input that produces the error. */
  readonly trigger: string;
  /** Exact `errors.md` §5 title (NFR-5a: plain language, ≤ 60 chars). */
  readonly title: string;
  /** Required substring of the §5 cause sentence (NFR-5b). */
  readonly cause: string;
  /** Required substring of the §5 next-step sentence (NFR-5c). */
  readonly nextStep: string;
  /** Produces the error through the M1-09 store module (absence RED first). */
  run(): Promise<AppError>;
}

let dataDir: string;

beforeAll(() => {
  dataDir = createUserDataDir();
});

afterAll(() => {
  removeDirectory(dataDir);
});

beforeEach(() => {
  clearDirectory(dataDir);
  resetProbe(dataDir);
});

/** §0 global rules + NFR-2: what must NEVER appear in user-visible error text. */
const FORBIDDEN: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: 'a raw stack trace', pattern: /\n\s+at\s+\S+\(/ },
  { label: 'an exception class name', pattern: /SyntaxError|TypeError|ReferenceError|RangeError/ },
  { label: 'an "Error:" prefix', pattern: /Error:/ },
  { label: 'raw config JSON (accessKey)', pattern: /"accessKey"/ },
  { label: 'raw config JSON (secretKey)', pattern: /"secretKey"/ },
  { label: 'raw config JSON (outbounds)', pattern: /"outbounds"/ },
];

const ROWS: readonly WordingRow[] = [
  {
    id: 'encryptionUnavailable',
    code: 'E-STOR-001',
    trigger: 'saveProfile() while safeStorage.isEncryptionAvailable() === false (FR-53 / AC-07.4)',
    title: 'Profile storage unavailable',
    cause: 'keychain encryption is not available',
    nextStep: 'Nothing is stored in plaintext',
    run: async () => {
      const store = await loadSecretStore();
      probe.encryptionAvailable = false;
      return captureAppError(() => store.saveProfile(CONFIG), 'E-STOR-001');
    },
  },
  {
    id: 'keychainDenied',
    code: 'E-STOR-002',
    trigger: 'saveProfile() and safeStorage.encryptString refuses — locked/denied keychain (FR-57)',
    title: 'Keychain access denied',
    cause: 'keychain refused access',
    nextStep: 'retry',
    run: async () => {
      const store = await loadSecretStore();
      probe.encryptError = new Error('keychain access denied by the system');
      return captureAppError(() => store.saveProfile(CONFIG), 'E-STOR-002');
    },
  },
  {
    id: 'corruptStore',
    code: 'E-STOR-003',
    trigger: 'loadProfile() over a tampered store file (FR-59 / US-07 edge / TC-07-13 fixture)',
    title: 'Profile store is damaged',
    cause: 'could not be read',
    nextStep: 'Re-import your config',
    run: async () => {
      const store = await loadSecretStore();
      store.saveProfile(CONFIG);
      const corrupt = readCorruptStoreBlob();
      for (const file of listFilesRecursive(dataDir)) {
        writeFileSync(join(dataDir, file), corrupt);
      }
      return captureAppError(() => store.loadProfile(), 'E-STOR-003');
    },
  },
];

/** Strategy §7 shared assertion — every row passes the same NFR-5 contract. */
function expectHumanError(row: WordingRow, error: AppError): void {
  expect(error.code, `${row.id}: exact errors.md §5 code`).toBe(row.code);
  expect(error.title, `${row.id}: exact errors.md §5 title (NFR-5a)`).toBe(row.title);
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
  for (const rule of FORBIDDEN) {
    expect(
      rule.pattern.test(text),
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

describe('error wording table — E-STOR rows (NFR-5, errors.md §5) — TC-NFR5-01', () => {
  for (const row of ROWS) {
    it(`errorWording.${row.id}.nfr5TripleExactNoStack`, async () => {
      const error = await row.run();
      expectHumanError(row, error);
    });
  }
});

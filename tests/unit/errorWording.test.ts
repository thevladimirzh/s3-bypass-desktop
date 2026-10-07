/**
 * NFR-5 error-wording table (docs/qa/strategy §7) — the `E-STOR-*` rows and
 * the `E-VAL-*` rows.
 *
 * Test plan ID: TC-NFR5-01 (`errorWording.table.everyUserVisibleErrorHasTitleCauseNextStepNoStack`)
 * — storage rows `E-STOR-001` (encryption unavailable), `E-STOR-002`
 * (keychain denied), `E-STOR-003` (corrupt store). Per m1-test-plan §8 and
 * strategy §7/§12.2 the table grows inside *every* RED batch: this file was
 * created by the M1-08 batch with the three storage rows only; the M1-11
 * batch adds a second describe over the `E-VAL-*` rows (import-validator
 * codes, errors.md §1, one representative trigger per code — see
 * tests/helpers/error-wording.ts). Existing rows are never removed, retitled
 * or loosened (strategy §5.2).
 *
 * Wording source (the executable half of errors.md §0 + §1/§5): `title` is the
 * exact `docs/analysis/errors.md` title; `cause` / `nextStep` are required
 * substrings of the cause/next-step templates; the shared `FORBIDDEN` rules
 * encode §0's global rules (no stack traces, no exception class names, no raw
 * config JSON) plus NFR-2's canary rule (no secret ever appears in
 * user-visible error text). The `WordingRow` interface, `FORBIDDEN` and
 * `expectHumanError` live in tests/helpers/error-wording.ts (moved verbatim by
 * the M1-11 batch, deviation DV-17) so this suite and
 * tests/unit/profile-validator.test.ts apply one identical contract.
 *
 * Triggers: `E-STOR-*` rows fire through the M1-09 store module
 * (`src/main/secret-store.ts`) with the same stubbed `electron.safeStorage`
 * as tests/unit/secret-store.test.ts; `E-VAL-*` rows fire through the M1-12
 * validator (`src/main/profile-validator.ts`). Both are ABSENCE RED until
 * their module lands (strategy §5.2). Codes pinned here are the ones the FR
 * states verbatim: FR-53 → 001, FR-57 → 002, FR-59 → 003.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest';

import { E_VAL_WORDING_ROWS, expectHumanError, type WordingRow } from '../helpers/error-wording';
import {
  captureAppError,
  clearDirectory,
  createUserDataDir,
  listFilesRecursive,
  loadSecretStore,
  probe,
  readCanaryConfig,
  readCorruptStoreBlob,
  removeDirectory,
  resetProbe,
} from '../helpers/secret-store-stub';

vi.mock('electron', async () =>
  (await import('../helpers/secret-store-stub')).electronModuleMock(),
);

const CONFIG = readCanaryConfig();

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

describe('error wording table — E-STOR rows (NFR-5, errors.md §5) — TC-NFR5-01', () => {
  for (const row of ROWS) {
    it(`errorWording.${row.id}.nfr5TripleExactNoStack`, async () => {
      const error = await row.run();
      expectHumanError(row, error);
    });
  }
});

describe('error wording table — E-VAL rows (NFR-5, errors.md §1) — TC-NFR5-01', () => {
  // M1-11 batch: additive only — every import-validator code gets one row
  // with a representative trigger; E-VAL-009 (blocked Q-AN-05) and E-VAL-015
  // (state gate) are deliberately absent (deviation DV-15).
  for (const row of E_VAL_WORDING_ROWS) {
    it(`errorWording.${row.id}.nfr5TripleExactNoStack`, async () => {
      const error = await row.run();
      expectHumanError(row, error);
    });
  }
});

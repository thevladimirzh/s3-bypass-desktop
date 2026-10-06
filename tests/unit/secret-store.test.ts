/**
 * M1-08 (RED) — at-rest secret store (Phase C), executable specification.
 *
 * Test plan IDs: TC-07-10, TC-07-02, TC-07-04, TC-07-11, TC-07-12, TC-07-13,
 * TC-07-07, TC-07-05 (store half), TC-07-18 — docs/qa/m1-test-plan.md §7 and
 * the M1-08 row of §10; the NFR-5 wording rows for `E-STOR-001..003`
 * (TC-NFR5-01) live in tests/unit/errorWording.test.ts.
 *
 * Spec sources: docs/analysis/requirements.md F8 (FR-53..FR-60), NFR-1,
 * NFR-5, §8.2 (whole document encrypted, A-20); docs/analysis/data-flows.md
 * flow (a) steps 8–9 (encrypt → write into K); docs/analysis/errors.md §0
 * (AppError triple) and §5 (E-STOR-001..005 wording);
 * docs/product/stories/US-07-secret-storage.md AC-07.2..AC-07.7;
 * docs/qa/strategy.md §1 (synthetic fixtures), §5.1 (RED contract), §7
 * (NFR-1 pins); docs/plans/m1-mvp.md M1-08 → M1-09.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-09 (developer GREEN task) — module `src/main/secret-store.ts`
 * in the Electron `main` process. QA declares the exact surface here because
 * the analysis specifies behavior, not module signatures (deviation DV-09):
 *
 *   import { app, safeStorage } from 'electron';   // ONLY these two members
 *
 *   export function saveProfile(profileJson: string): void;
 *     • when safeStorage.isEncryptionAvailable() === false: throws AppError
 *       { code: 'E-STOR-001', … } and writes NOTHING — no plaintext fallback,
 *       ever (FR-53 / AC-07.4 / NFR-1);
 *     • otherwise encrypts the whole profile document (§8.2, A-20) through
 *       safeStorage.encryptString; if the keychain refuses (encryptString
 *       throws): throws AppError { code: 'E-STOR-002', … }, again nothing
 *       written (FR-57);
 *     • writes the encrypted blob under app.getPath('userData') with file
 *       mode 0600 (FR-56, AC-07.5 store half); a write failure throws
 *       AppError { code: 'E-STOR-005', … } (errors.md §5, defensive entry);
 *     • never writes the profile document or any canary in plaintext
 *       (FR-54, AC-07.2, NFR-2).
 *
 *   export function loadProfile(): string | null;
 *     • returns exactly the string handed to saveProfile (round-trip);
 *     • `null` when nothing is stored — absent is not damaged (FR-58);
 *     • a blob safeStorage cannot decrypt (corrupt / tampered / legacy /
 *       foreign account): throws AppError { code: 'E-STOR-003', … } — no
 *       crash, no partial plaintext (FR-59, US-07 edge).
 *
 *   export function deleteStoredProfile(): void;
 *     • deletes the stored blob itself, not a UI flag (FR-60 / AC-07.7);
 *     • idempotent — no throw when nothing is stored.
 *
 * Failure shape: thrown as the NFR-5 `AppError` triple
 * { code, title, cause, nextStep } with the wording templates of
 * docs/analysis/errors.md §5 — never a raw exception, never a stack in the
 * triple (errors.md §0, FR-48). The module imports NO IPC primitive
 * (ipcRenderer / ipcMain / contextBridge / webContents / exposeInMainWorld):
 * callable only from `main`, never exposed on IPC (plan M1-09, FR-55) —
 * enforced in tests/unit/secret-store-boundary.test.ts (TC-07-16/TC-07-17).
 *
 * Mock model: `electron.safeStorage` is stubbed in
 * tests/helpers/secret-store-stub.ts (`isEncryptionAvailable`,
 * `encryptString`, `decryptString`) — never a real keychain (CI has none).
 *
 * RED status: ABSENCE RED — `src/main/secret-store.ts` does not exist yet
 * (strategy §5.2); every case below fails on that import until M1-09 lands,
 * and `tsc` reports the missing module in tests/helpers/secret-store-stub.ts.
 * Do not weaken, skip, or delete anything here; M1-09 implements the contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** Canary client config (§9.1) — the profile document persisted in every case. */
const CONFIG = readCanaryConfig();

/** Config-JSON markers that must never appear as plaintext at rest (§8.4 SECRET). */
const CONFIG_MARKERS: readonly string[] = [
  '"accessKey"',
  '"secretKey"',
  '"sessionToken"',
  '"outbounds"',
  '"inbounds"',
  '"loglevel"',
];

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

/** Files currently persisted under the mocked app data directory. */
function storeFiles(): string[] {
  return listFilesRecursive(dataDir);
}

function absolute(relative: string): string {
  return join(dataDir, relative);
}

describe('secret store — at-rest encryption via safeStorage (FR-53..FR-60, NFR-1) — M1-08', () => {
  it('secretStorage.roundTrip.encryptThenDecryptEqualsOriginal', async () => {
    // TC-07-10 (plan M1-08 explicit): encrypt → decrypt is lossless.
    const store = await loadSecretStore();

    store.saveProfile(CONFIG);

    expect(
      probe.encryptCalls,
      'the whole profile document must be handed to safeStorage (§8.2 / A-20)',
    ).toContain(CONFIG);
    expect(store.loadProfile(), 'loadProfile must return exactly what was saved').toBe(CONFIG);
  });

  it('secretStorage.atRest.recursiveGrepFindsNoPlaintext', async () => {
    // TC-07-02 / AC-07.2 / FR-54: byte-scan of the app data directory after a
    // save — zero canary values, zero config-JSON markers in any file.
    const store = await loadSecretStore();
    store.saveProfile(CONFIG);

    const files = storeFiles();
    expect(
      files.length,
      'the profile must be persisted under app.getPath("userData") (FR-54/AC-07.2)',
    ).toBeGreaterThan(0);
    expect(
      store.loadProfile(),
      'precondition: the persisted bytes must really be the saved document (no vacuous grep)',
    ).toBe(CONFIG);

    const needles = [...readCanaries(), ...CONFIG_MARKERS];
    for (const file of files) {
      const bytes = readFileSync(absolute(file));
      for (const needle of needles) {
        expect(
          bytes.includes(Buffer.from(needle, 'utf8')),
          `${file} must not contain plaintext ${needle} (FR-54, NFR-1)`,
        ).toBe(false);
      }
    }
  });

  it('secretStorage.encryptionUnavailable.refusesPersistNoPlaintextFallback', async () => {
    // TC-07-04 / AC-07.4 / FR-53: isEncryptionAvailable() === false →
    // E-STOR-001, refusal before any encryption attempt, nothing on disk.
    const store = await loadSecretStore();
    probe.encryptionAvailable = false;

    const error = captureAppError(() => store.saveProfile(CONFIG), 'E-STOR-001');

    expect(error.code, 'refusal must carry the documented E-STOR-001 code').toBe('E-STOR-001');
    expect(probe.encryptCalls, 'refusal happens before any encryptString call (FR-53)').toEqual([]);
    expect(
      storeFiles(),
      'no file at all may be written when encryption is unavailable — no plaintext fallback (FR-53, NFR-1)',
    ).toEqual([]);
  });

  it('secretStorage.keychainDenied.errorWithRetryNeverSilentPlaintextWrite', async () => {
    // TC-07-12 / FR-57: the keychain refuses the write → E-STOR-002, retryable
    // next step, and never a silent unencrypted write.
    const store = await loadSecretStore();
    probe.encryptError = new Error('keychain access denied by the system');

    const error = captureAppError(() => store.saveProfile(CONFIG), 'E-STOR-002');

    expect(error.code, 'a keychain refusal must carry the documented E-STOR-002 code').toBe(
      'E-STOR-002',
    );
    expect(
      error.nextStep,
      'FR-57 requires a clear retryable error (unlock → allow → retry)',
    ).toMatch(/retry/i);
    expect(
      storeFiles(),
      'never a silent unencrypted write when the keychain refuses (FR-57)',
    ).toEqual([]);
    expect(probe.encryptCalls[0], 'the document was offered for encryption only once').toBe(CONFIG);
  });

  it('secretStorage.decryptFailure.readableErrorNotACrash', async () => {
    // TC-07-11 (plan M1-08 explicit): a decrypt failure surfaces a readable
    // AppError triple — an E-STOR-* code, NFR-5 fields, no stack, no secret,
    // no partial plaintext — instead of crashing.
    const store = await loadSecretStore();
    store.saveProfile(CONFIG);
    const before = storeFiles();
    probe.decryptError = new Error('keychain locked: cannot decrypt');

    const error = captureAppError(() => store.loadProfile(), 'decrypt failure');

    expect(error.code, 'decrypt failures surface as an E-STOR-* AppError (errors.md §5)').toMatch(
      /^E-STOR-\d{3}$/,
    );
    for (const field of ['title', 'cause', 'nextStep'] as const) {
      expect(typeof error[field], `NFR-5 triple: ${field} must be a string`).toBe('string');
      expect(error[field].length, `NFR-5 triple: ${field} must not be empty`).toBeGreaterThan(0);
    }
    expect(error.title.length, 'errors.md §0: title ≤ 60 chars').toBeLessThanOrEqual(60);
    expect(error.title, 'errors.md §0: the code never appears in the title').not.toContain(
      error.code,
    );

    const text = tripleText(error);
    expect(text, 'no raw stack in the user-visible triple (FR-48, NFR-5)').not.toMatch(
      /\n\s+at\s+\S+\(/,
    );
    expect(text, 'no exception class names in the user-visible triple (errors.md §0)').not.toMatch(
      /SyntaxError|TypeError|ReferenceError|Error:/,
    );
    for (const canary of readCanaries()) {
      expect(text.includes(canary), 'no secret may leak into the user-visible error').toBe(false);
    }
    expect(text.includes('"accessKey"'), 'no raw config JSON in the user-visible error').toBe(
      false,
    );

    // No crash side effects: the store is untouched and still fully encrypted.
    expect(storeFiles(), 'a failed decrypt must not create, delete or rewrite files').toEqual(
      before,
    );
    for (const file of storeFiles()) {
      const bytes = readFileSync(absolute(file));
      for (const canary of readCanaries()) {
        expect(
          bytes.includes(Buffer.from(canary, 'utf8')),
          `${file} must still hold no plaintext after a failed decrypt`,
        ).toBe(false);
      }
    }
  });

  it('secretStorage.corruptStore.damagedProfileReimportMessageNoCrash', async () => {
    // TC-07-13 / FR-59 / US-07 edge: tampered store bytes → E-STOR-003 with
    // the exact "damaged — re-import" wording; no crash, no plaintext output.
    const store = await loadSecretStore();
    store.saveProfile(CONFIG);
    const files = storeFiles();
    expect(files.length, 'precondition: a store file exists to corrupt').toBeGreaterThan(0);
    const corrupt = readCorruptStoreBlob();
    for (const file of files) {
      writeFileSync(absolute(file), corrupt);
    }

    const error = captureAppError(() => store.loadProfile(), 'corrupt store blob');

    expect(error.code, 'FR-59 pins E-STOR-003 for a corrupted/tampered store').toBe('E-STOR-003');
    expect(error.title, 'errors.md §5 title for E-STOR-003').toBe('Profile store is damaged');
    expect(error.cause, 'errors.md §5 cause pattern for E-STOR-003').toContain('could not be read');
    expect(error.nextStep, 'errors.md §5 next step for E-STOR-003').toContain(
      'Re-import your config',
    );
    const text = tripleText(error);
    expect(text, 'no raw stack in the user-visible triple (FR-48)').not.toMatch(/\n\s+at\s+\S+\(/);
    for (const canary of readCanaries()) {
      expect(text.includes(canary), 'no partial plaintext output in the error (FR-59)').toBe(false);
    }
  });

  it('secretStorage.profileRemoved.storeEntryDeletedNotHidden', async () => {
    // TC-07-07 / FR-60 / AC-07.7: removal deletes the entry itself and is
    // idempotent when nothing is stored.
    const store = await loadSecretStore();
    store.saveProfile(CONFIG);
    expect(storeFiles().length, 'precondition: the store entry exists').toBeGreaterThan(0);

    store.deleteStoredProfile();

    expect(storeFiles(), 'FR-60: the store entry must be deleted, not hidden').toEqual([]);
    expect(
      () => store.deleteStoredProfile(),
      'removing an already-absent entry is a no-op, not a crash',
    ).not.toThrow();
  });

  it('secretStorage.storeFile.persistedBlobModeIs0600', async () => {
    // TC-07-05 (store half; the core-config lifecycle half is M1-14) / FR-56 /
    // AC-07.5: every file the store persists is mode 0600. Targets are
    // macOS/Linux only (NFR-6), so POSIX modes always apply here.
    const store = await loadSecretStore();
    store.saveProfile(CONFIG);

    const files = storeFiles();
    expect(files.length, 'precondition: the store persisted at least one file').toBeGreaterThan(0);
    for (const file of files) {
      const mode = statSync(absolute(file)).mode & 0o777;
      expect(mode, `${file} must be persisted with mode 0600 (FR-56, AC-07.5)`).toBe(0o600);
    }
  });

  it('secretStorage.absentStore.loadReturnsNullNoCrash', async () => {
    // TC-07-18 / FR-58 (absent half): nothing stored → `null`, so callers can
    // show re-import guidance instead of crashing (US-07 edge).
    const store = await loadSecretStore();

    expect(store.loadProfile(), 'an empty store means "profile absent", not an error').toBeNull();
  });
});

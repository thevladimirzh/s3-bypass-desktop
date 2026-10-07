/**
 * At-rest secret store (Phase C) — M1-09, the GREEN half of the M1-08 RED
 * contract (tests/unit/secret-store.test.ts header, DV-09).
 *
 * Persists the imported profile document as a single `safeStorage`-encrypted
 * blob under `app.getPath('userData')`: the whole document is encrypted before
 * any byte reaches disk (requirements.md §8.2 / A-20; data-flows.md flow (a)
 * steps 8–9) and the file is written with mode `0600` (FR-56, AC-07.5). On any
 * failure the module throws the documented NFR-5 `AppError` triple
 * (errors.md §0 + §5) — it never falls back to a plaintext write (FR-53,
 * AC-07.4, NFR-1) and never lets a raw exception or stack escape (FR-48).
 *
 * Main-process only: the module imports no IPC primitive and is never exposed
 * on the renderer bridge (FR-55, plan M1-09) — enforced structurally by
 * tests/unit/secret-store-boundary.test.ts (TC-07-16/TC-07-17).
 *
 * Spec: docs/analysis/requirements.md F8 (FR-53..FR-60), NFR-1, NFR-5;
 * docs/analysis/errors.md §5 (E-STOR-001..005 wording);
 * docs/product/stories/US-07-secret-storage.md AC-07.2..AC-07.7.
 */
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, safeStorage } from 'electron';

import type { AppError } from '../shared/status-machine';

/** Exact `errors.md` §5 triples — wording is pinned verbatim by the tests (NFR-5). */
const ERRORS = {
  /** FR-53 / AC-07.4: `isEncryptionAvailable()` is false — refuse before encrypting. */
  ENCRYPTION_UNAVAILABLE: {
    code: 'E-STOR-001',
    title: 'Profile storage unavailable',
    cause:
      'The OS keychain encryption is not available on this system, so the profile cannot be saved securely.',
    nextStep:
      'Profiles cannot be imported until a keychain is available (install/enable a keyring on Linux). Nothing is stored in plaintext.',
  },
  /** FR-57: the keychain refused to encrypt — retryable after unlock, never a silent write. */
  KEYCHAIN_DENIED: {
    code: 'E-STOR-002',
    title: 'Keychain access denied',
    cause: 'The OS keychain refused access (locked or permission denied).',
    nextStep: 'Unlock/keychain prompt → allow access, then retry the action.',
  },
  /** FR-59 / FR-58: the blob cannot be read back — damaged, tampered or foreign. */
  STORE_DAMAGED: {
    code: 'E-STOR-003',
    title: 'Profile store is damaged',
    cause:
      'The stored profile could not be read (corrupted, tampered, or from another user account).',
    nextStep: 'Re-import your config — the damaged entry will be replaced.',
  },
  /** FR-54 `[ASSUMPTION]` (errors.md §5 defensive entry): the file operation failed. */
  STORE_IO_FAILED: {
    code: 'E-STOR-005',
    title: 'Profile could not be saved',
    cause:
      'Writing the encrypted profile to the app data directory failed (disk full or permissions).',
    nextStep: 'Free disk space / fix permissions, then import again.',
  },
} as const satisfies Record<string, AppError>;

/** The store file lives directly in `app.getPath('userData')` (FR-54/FR-56). */
const STORE_FILE = 'profile-store.blob';

/** Owner-only file mode for the encrypted blob (FR-56, AC-07.5, NFR-1). */
const STORE_FILE_MODE = 0o600;

/**
 * A storage failure as the NFR-5 triple: `code` is internal-only and never
 * part of the plain-language `title` (errors.md §0). The original exception
 * (and any keychain detail it may carry) is deliberately dropped — only the
 * documented wording ever reaches a caller or the UI (FR-48, NFR-2).
 */
class SecretStoreError extends Error implements AppError {
  /** Internal `E-STOR-*` code (errors.md §5). */
  readonly code: string;
  /** Plain-language title, ≤ 60 chars, no error codes (errors.md §0). */
  readonly title: string;
  /** One sentence stating what happened — never a raw exception message. */
  override readonly cause: string;
  /** A concrete action the user can take (errors.md §0). */
  readonly nextStep: string;

  constructor(triple: AppError) {
    super(triple.title);
    this.code = triple.code;
    this.title = triple.title;
    this.cause = triple.cause;
    this.nextStep = triple.nextStep;
  }
}

/** Absolute path of the encrypted blob — resolved per call, never logged (FR-56). */
function storePath(): string {
  return join(app.getPath('userData'), STORE_FILE);
}

/**
 * Persists the profile document encrypted at rest (FR-53..FR-57, AC-07.2/07.4/07.5).
 *
 * @param profileJson whole profile document — handed to `safeStorage` verbatim (§8.2, A-20)
 * @throws `SecretStoreError` with `E-STOR-001` when keychain encryption is
 *   unavailable (refused before any encrypt call, no plaintext fallback),
 *   `E-STOR-002` when the keychain refuses the write, `E-STOR-005` when the
 *   file operation fails — in every case nothing unencrypted is written.
 */
export function saveProfile(profileJson: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // FR-53: refuse before the first encrypt call — no plaintext fallback, ever.
    throw new SecretStoreError(ERRORS.ENCRYPTION_UNAVAILABLE);
  }

  let encrypted: Buffer;
  try {
    encrypted = safeStorage.encryptString(profileJson);
  } catch {
    // FR-57: translate the keychain refusal into the documented retryable triple;
    // the raw OS message stays out of the user-visible text.
    throw new SecretStoreError(ERRORS.KEYCHAIN_DENIED);
  }

  try {
    writeFileSync(storePath(), encrypted, { mode: STORE_FILE_MODE });
    // The mode option applies on creation only — re-assert it on overwrite (FR-56).
    chmodSync(storePath(), STORE_FILE_MODE);
  } catch {
    throw new SecretStoreError(ERRORS.STORE_IO_FAILED);
  }
}

/**
 * Reads the profile document back from the encrypted blob (FR-58, FR-59).
 *
 * @returns exactly the string handed to `saveProfile`, or `null` when nothing
 *   is stored — an absent store is a state, not an error (FR-58).
 * @throws `SecretStoreError` with `E-STOR-003` when the blob exists but cannot
 *   be read or decrypted (corrupt, tampered, legacy or foreign account) — no
 *   crash, no partial plaintext (FR-59).
 */
export function loadProfile(): string | null {
  const path = storePath();
  if (!existsSync(path)) {
    return null;
  }

  let encrypted: Buffer;
  try {
    encrypted = readFileSync(path);
  } catch {
    throw new SecretStoreError(ERRORS.STORE_DAMAGED);
  }

  try {
    return safeStorage.decryptString(encrypted);
  } catch {
    // FR-59: bytes the keychain cannot decrypt mean a damaged store — the
    // documented triple replaces the raw failure, never a crash or a stack.
    throw new SecretStoreError(ERRORS.STORE_DAMAGED);
  }
}

/**
 * Deletes the stored blob itself, not a UI flag (FR-60, AC-07.7).
 *
 * Idempotent: removing an already-absent entry is a no-op and never throws;
 * any other file-system failure surfaces as the documented triple instead of
 * a raw exception.
 */
export function deleteStoredProfile(): void {
  try {
    rmSync(storePath(), { force: true });
  } catch {
    throw new SecretStoreError(ERRORS.STORE_IO_FAILED);
  }
}

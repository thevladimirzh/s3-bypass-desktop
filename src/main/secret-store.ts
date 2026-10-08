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
import { chmodSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, safeStorage } from 'electron';

import { E_STOR_005 } from '../shared/error-triples';
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
  /** FR-54 `[ASSUMPTION]` (errors.md §5 defensive entry): the file operation failed.
   *  M3-A: the triple is the shared single source (TC-POL-01 dedup pin). */
  STORE_IO_FAILED: E_STOR_005,
} as const satisfies Record<string, AppError>;

/** The store file lives directly in `app.getPath('userData')` (FR-54/FR-56). */
const STORE_FILE = 'profile-store.blob';

/** Owner-only file mode for the encrypted blob (FR-56, AC-07.5, NFR-1). */
const STORE_FILE_MODE = 0o600;

/**
 * S4-2a (issue #4, security-m1-26b.md §2): `loadProfile` refuses a blob
 * larger than this BEFORE reading it — the real store for a ≤1 MiB profile
 * sits far below, so anything over the cap is a tampering/crafting signal,
 * never a reason to pull gigabytes into the main process. Cap ≤10 MB per
 * the issue text; refusal answers the documented `E-STOR-003` triple.
 */
const MAX_STORE_BLOB_BYTES = 10 * 1024 * 1024;

/**
 * S4-2b (issue #4): defensive save-side ceiling — the import validator's
 * 1 MiB limit (BR-V-02 / `MAX_PROFILE_BYTES` in index.ts) is the real gate;
 * this stops a caller bug from encrypting and writing unbounded input.
 * Refused BEFORE the first encrypt call (FR-53 precedent) with the
 * documented defensive `E-STOR-005` triple.
 */
const MAX_PROFILE_JSON_BYTES = 1_048_576;

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
 *   document exceeds the defensive 1 MiB cap (S4-2b, issue #4 — refused
 *   before the first encrypt call) or the file operation fails — in every
 *   case nothing unencrypted is written.
 */
export function saveProfile(profileJson: string): void {
  if (profileJson.length > MAX_PROFILE_JSON_BYTES) {
    // S4-2b (issue #4): over the validator's own ceiling can only be a
    // caller bug — refuse before any encrypt/write work, documented triple.
    throw new SecretStoreError(ERRORS.STORE_IO_FAILED);
  }
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
 * @throws `SecretStoreError` with `E-STOR-003` when the store path cannot be
 *   resolved (S4-1, issue #4 — the raw failure never escapes, FR-48) or when
 *   the blob exists but is oversized (S4-2a: `statSync` cap before any read),
 *   cannot be read, or cannot be decrypted (corrupt, tampered, legacy or
 *   foreign account) — no crash, no partial plaintext (FR-59).
 */
export function loadProfile(): string | null {
  let path: string;
  try {
    path = storePath();
  } catch {
    // S4-1 (issue #4): an unresolvable app data path answers the read-side
    // documented triple — the raw app.getPath error never reaches a caller.
    throw new SecretStoreError(ERRORS.STORE_DAMAGED);
  }
  if (!existsSync(path)) {
    return null;
  }

  // S4-2a (issue #4): size from METADATA first — a blob over the cap is
  // refused WITHOUT ever being read or handed to the keychain.
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new SecretStoreError(ERRORS.STORE_DAMAGED);
  }
  if (size > MAX_STORE_BLOB_BYTES) {
    throw new SecretStoreError(ERRORS.STORE_DAMAGED);
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

/**
 * Modification time of the encrypted blob — the moment the profile was
 * imported (or replaced by a re-import), for `ProfileSummary.importedAt`
 * when `profile:get` rebuilds the summary (requirements §8.3, FR-05).
 * `null` while no profile is stored; an unreadable stat is treated as
 * "no timestamp", never as a failure (FR-58: absent is not an error).
 */
export function storedProfileModifiedAt(): Date | null {
  let path: string;
  try {
    path = storePath();
  } catch {
    // S4-1 (issue #4): path failure answers "no timestamp" — this accessor
    // never throws (FR-58: unknown is a state, not a failure).
    return null;
  }
  if (!existsSync(path)) {
    return null;
  }
  try {
    return statSync(path).mtime;
  } catch {
    return null;
  }
}

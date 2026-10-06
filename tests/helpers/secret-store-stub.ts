/**
 * Shared test double for the M1-08 (RED) secret-store batch — never a real
 * keychain, never a network call (strategy §1: synthetic fixtures only; CI has
 * no keychain — `safeStorage` is always stubbed here).
 *
 * Models Electron's `safeStorage` and `app` exactly along the surface the
 * M1-09 contract needs (see the header of tests/unit/secret-store.test.ts):
 *
 *   safeStorage.isEncryptionAvailable(): boolean     → probe control
 *   safeStorage.encryptString(plain): Buffer         → `enc:` + base64(plain)
 *   safeStorage.decryptString(data): Buffer|string   → inverse; throws on bytes
 *                                                       it did not produce
 *                                                       ("keychain denied" or
 *                                                       corrupted blob)
 *   app.getPath('userData'): string                  → temp dir under os.tmpdir()
 *
 * The stub is opaque enough for at-rest greps (base64 of the document ≠
 * plaintext: verified for `valid-client-config.json` + `canary.secrets.txt`,
 * 0 collisions) while keeping encrypt→decrypt a faithful round-trip.
 *
 * This file is a helper, not a suite: `vitest.config.ts` includes only
 * test files (`*.test.ts` / `*.test.tsx`) under `tests/`, so nothing here is
 * ever collected as a case.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppError } from '../../src/shared/status-machine';

/** Mutable control surface for the `safeStorage` stub, shared with `vi.mock`. */
export interface SafeStorageProbe {
  /** `isEncryptionAvailable()` result — FR-53 flips it to `false`. */
  encryptionAvailable: boolean;
  /** When set, `encryptString` throws it — models a denied/locked keychain (FR-57). */
  encryptError: Error | null;
  /** When set, `decryptString` throws it — models a keychain that cannot decrypt. */
  decryptError: Error | null;
  /** Every plaintext handed to `encryptString`, in call order. */
  encryptCalls: string[];
  /** Every buffer handed to `decryptString`, in call order. */
  decryptCalls: Buffer[];
  /** Returned by `app.getPath('userData')` — the app data directory under test. */
  userDataDir: string;
}

export const probe: SafeStorageProbe = {
  encryptionAvailable: true,
  encryptError: null,
  decryptError: null,
  encryptCalls: [],
  decryptCalls: [],
  userDataDir: '',
};

/** Resets the probe and points `app.getPath('userData')` at `userDataDir`. */
export function resetProbe(userDataDir: string): void {
  probe.encryptionAvailable = true;
  probe.encryptError = null;
  probe.decryptError = null;
  probe.encryptCalls.length = 0;
  probe.decryptCalls.length = 0;
  probe.userDataDir = userDataDir;
}

/**
 * Factory for `vi.mock('electron', …)`: only the members the M1-09 contract
 * allows the store module to consume (`app`, `safeStorage`). A store module
 * importing anything else from `electron` sees `undefined` here and fails its
 * own tests — that is part of the contract.
 */
export function electronModuleMock(): Record<string, unknown> {
  return {
    app: {
      getPath: (name: string): string => {
        if (name !== 'userData') {
          throw new Error(
            `stub models only app.getPath('userData') for the secret store, got '${name}'`,
          );
        }
        return probe.userDataDir;
      },
    },
    safeStorage: {
      isEncryptionAvailable: (): boolean => probe.encryptionAvailable,
      encryptString: (plain: string): Buffer => {
        probe.encryptCalls.push(plain);
        if (probe.encryptError !== null) throw probe.encryptError;
        return Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8');
      },
      decryptString: (data: Buffer | Uint8Array): string => {
        const bytes = Buffer.from(data);
        probe.decryptCalls.push(bytes);
        if (probe.decryptError !== null) throw probe.decryptError;
        const text = bytes.toString('utf8');
        if (!text.startsWith('enc:')) {
          // What the real OS keychain does with bytes it never encrypted.
          throw new Error('Bad decrypt');
        }
        return Buffer.from(text.slice('enc:'.length), 'base64').toString('utf8');
      },
    },
  };
}

/** The M1-09 module contract (docs/qa/m1-test-plan.md §7, task brief M1-08). */
export interface SecretStoreApi {
  saveProfile(profileJson: string): void;
  loadProfile(): string | null;
  deleteStoredProfile(): void;
}

/**
 * Loads the module under test. RED until M1-09 creates
 * `src/main/secret-store.ts`: the dynamic import rejects with a module-
 * resolution error, which is the legitimate *absence RED* reason for this
 * batch (strategy §5.2) — never weaken this path or the tests behind it.
 */
export async function loadSecretStore(): Promise<SecretStoreApi> {
  return await import('../../src/main/secret-store');
}

/** Fresh app data directory for one test file (cleaned up in `afterAll`). */
export function createUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 's3bypass-secret-store-'));
}

/** Empties the app data directory so each test starts from "nothing stored". */
export function clearDirectory(dir: string): void {
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

export function removeDirectory(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Every regular file under `dir`, as paths relative to `dir` (recursive). */
export function listFilesRecursive(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(join(dir, entry.name), relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

/** §9.3 canary secrets — the grep input for every at-rest / NFR-2 scan. */
export function readCanaries(): string[] {
  return readFileSync(fixturePath('secrets/canary.secrets.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** §9.1 canary client config — the profile document persisted in TC-07-02. */
export function readCanaryConfig(): string {
  return readFileSync(fixturePath('configs/valid-client-config.json'), 'utf8');
}

/** §9.1 `corrupt-store.blob` — random/tampered bytes posing as the store. */
export function readCorruptStoreBlob(): Buffer {
  return readFileSync(fixturePath('configs/corrupt-store.blob'));
}

function fixturePath(relative: string): string {
  return fileURLToPath(new URL(`../fixtures/${relative}`, import.meta.url));
}

/**
 * Runs `action` and returns the thrown value as the NFR-5 triple it must be.
 * Fails the test when the action does not throw at all — a store that swallows
 * its errors is a crash waiting to happen (AC-07 edge: "no crash").
 */
export function captureAppError(action: () => unknown, context: string): AppError {
  let thrown: unknown;
  let threw = false;
  try {
    action();
  } catch (error) {
    thrown = error;
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `${context}: expected the secret store to fail with an AppError, but it returned normally`,
    );
  }
  if (thrown === null || typeof thrown !== 'object') {
    throw new Error(
      `${context}: expected a thrown AppError object (NFR-5 triple), got ${String(thrown)}`,
    );
  }
  return thrown as AppError;
}

/** The user-visible text of a triple: exactly the four NFR-5 fields. */
export function tripleText(error: AppError): string {
  return [error.code, error.title, error.cause, error.nextStep].join('\n');
}

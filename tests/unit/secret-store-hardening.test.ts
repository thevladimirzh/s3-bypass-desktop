/**
 * M1-26b (RED) — GitHub issue #4 (M1-10 S4-1/S4-2, deadline M1-12 MISSED):
 * secret-store hardening — path try-wrap + size caps. Verified still open by
 * docs/qa/security-m1-26b.md §2 against current main (evidence lines):
 * `storePath()` is a bare `app.getPath` called OUTSIDE any try in
 * `loadProfile` (raw TypeError escapes → FR-48 edge); `loadProfile` reads the
 * blob with no size cap (multi-GB crafted store is read whole); `saveProfile`
 * accepts an unbounded `profileJson` (the ≤1 MiB limit lives only in the
 * import validator).
 *
 * Test plan IDs: TC-07-20 (path try-wrap), TC-07-21 (load size cap +
 * stat-before-read structural sibling), TC-07-22 (save size cap) —
 * docs/qa/m1-test-plan.md §7, allocated in §14 DV-34. Sibling guards stay
 * GREEN: tests/unit/secret-store.test.ts (M1-08 round-trip/at-rest/error
 * triples), tests/unit/secret-store-boundary.test.ts (module boundary).
 *
 * Spec sources: docs/qa/security-m1-10.md S4-1/S4-2 (original findings);
 * docs/qa/security-m1-26b.md §2 (fix scopes); GitHub issue #4 body ("wrap
 * path resolution in the existing try → documented E-STOR-* triple;
 * statSync a cap (≤10 MB) before read → E-STOR-003; defensive cap in
 * saveProfile so a caller bug cannot encrypt/write unbounded blobs");
 * docs/analysis/errors.md §5 (E-STOR-001..005 wording, defensive entry
 * E-STOR-005); docs/analysis/requirements.md FR-54 (defensive entry),
 * FR-58 (absent/unreadable → not an error), FR-48 (no raw failure), BR-V-02
 * (the 1 MiB validator limit this defensive cap aligns with).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26b-GREEN (header-contract style, DV-09/DV-34; the
 * developer adapts src, never these tests — strategy §5.2):
 *
 * S4-1 — `storePath()` failures surface as documented triples, never raw:
 *   • `loadProfile()` → `E-STOR-003` (issue #4's own fix text: wrap path
 *     resolution "in the existing try" — the read-side try whose documented
 *     outcome is the damaged-store triple; wording-accuracy question noted
 *     for the owner in DV-34);
 *   • `storedProfileModifiedAt()` → `null` (its documented never-throw /
 *     FR-58 contract: unknown is a state, not a failure);
 *   • `saveProfile()` → `E-STOR-005` and `deleteStoredProfile()` →
 *     `E-STOR-005` (controls — already inside the write/rm try today).
 *
 * S4-2a — `loadProfile()` sizes the blob FIRST: `statSync` (node:fs, named
 *   import) before `readFileSync` inside the function body, refusing a blob
 *   over `MAX_STORE_BLOB_BYTES = 10 MiB` (issue: ≤10 MB) with `E-STOR-003`
 *   and NEVER handing the bytes to `safeStorage.decryptString`.
 *
 * S4-2b — `saveProfile(profileJson)` refuses a document over 1 MiB
 *   (`1_048_576`, the same ceiling as BR-V-02 / `MAX_PROFILE_BYTES`) with
 *   `E-STOR-005` BEFORE the `encryptString` call (FR-53 precedent: refuse
 *   before the first encrypt call) — nothing encrypted, nothing written.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureAppError,
  clearDirectory,
  createUserDataDir,
  listFilesRecursive,
  loadSecretStore,
  probe,
  removeDirectory,
  resetProbe,
} from '../helpers/secret-store-stub';

vi.mock('electron', async () =>
  (await import('../helpers/secret-store-stub')).electronModuleMock(),
);

/** §9.1 canary config — a legitimate small profile document. */
const CONFIG = readFileSync(
  new URL('../fixtures/configs/valid-client-config.json', import.meta.url),
  'utf8',
);

/** Issue #4 S4-2a: the load-side blob ceiling (≤10 MB, issue text). */
const MAX_STORE_BLOB_BYTES = 10 * 1024 * 1024;
/** Issue #4 S4-2b: the defensive save-side ceiling (BR-V-02 alignment). */
const MAX_PROFILE_JSON_BYTES = 1_048_576;
/** The encrypted blob's file name (src/main/secret-store.ts STORE_FILE). */
const STORE_FILE = 'profile-store.blob';

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

/** Source of the module under test — for the structural sibling of TC-07-21. */
function storeSource(): string {
  return readFileSync(new URL('../../src/main/secret-store.ts', import.meta.url), 'utf8');
}

/** Body of `export function <name>`: from its declaration to the next export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`no 'export function ${name}(' in src/main/secret-store.ts`);
  const next = source.indexOf('\nexport function ', start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

describe('secret store hardening — path try-wrap + size caps (issue #4, M1-10 S4-1/S4-2) — M1-26b', () => {
  it('secretStorage.hardening.pathResolutionFailureAnswersDocumentedTripleNotRawThrow', async () => {
    // TC-07-20, S4-1 load half — discriminating assertion first: with
    // app.getPath unable to answer, loadProfile must throw the documented
    // E-STOR-003 triple (issue #4: wrap path resolution in the existing
    // try). Today storePath() runs bare at loadProfile's first line, so a
    // raw TypeError (code ERR_INVALID_ARG_TYPE) escapes — FR-48 edge.
    const store = await loadSecretStore();
    (probe as { userDataDir: string }).userDataDir = undefined as unknown as string;

    const loadError = captureAppError(
      () => store.loadProfile(),
      'TC-07-20: loadProfile with an unresolvable store path',
    );
    expect(
      loadError.code,
      'M1-26b/TC-07-20 (issue #4 S4-1): loadProfile must translate a storePath() failure ' +
        'into the documented E-STOR-003 triple (issue fix text: wrap path resolution in the ' +
        'existing try) — today the raw TypeError escapes (security-m1-26b.md §2)',
    ).toBe('E-STOR-003');
  });

  it('secretStorage.hardening.modifiedAtWithPathFailureReturnsNullNeverThrows', async () => {
    // TC-07-20, S4-1 mtime half — discriminating assertion first: the
    // documented contract of storedProfileModifiedAt is "never a failure"
    // (FR-58: unknown is a state), so a storePath() failure answers null.
    // Today storePath() runs bare (secret-store.ts:187) → raw TypeError.
    const store = await loadSecretStore();
    (probe as { userDataDir: string }).userDataDir = undefined as unknown as string;

    let result: Date | null | undefined;
    let threw: unknown;
    try {
      result = store.storedProfileModifiedAt();
    } catch (error) {
      threw = error;
    }
    expect(
      threw,
      'M1-26b/TC-07-20 (issue #4 S4-1 / FR-58): storedProfileModifiedAt must NEVER throw — ' +
        'its documented contract answers null for anything unknowable; today a raw TypeError ' +
        'from storePath() escapes (security-m1-26b.md §2)',
    ).toBeUndefined();
    expect(result, 'an unresolvable path is "no timestamp", not a failure (FR-58)').toBeNull();
  });

  it('secretStorage.hardening.pathFailureStaysInsideWriteAndRmTries', async () => {
    // TC-07-20 control — GREEN today and after the fix: saveProfile calls
    // storePath() inside its write try and deleteStoredProfile inside its
    // rm try, so both already answer the documented E-STOR-005 triple.
    const store = await loadSecretStore();
    (probe as { userDataDir: string }).userDataDir = undefined as unknown as string;

    const saveError = captureAppError(
      () => store.saveProfile(CONFIG),
      'TC-07-20 control: saveProfile with an unresolvable store path',
    );
    expect(saveError.code, 'saveProfile keeps answering the documented write triple').toBe(
      'E-STOR-005',
    );

    const deleteError = captureAppError(
      () => store.deleteStoredProfile(),
      'TC-07-20 control: delete keeps answering the documented rm triple',
    );
    expect(deleteError.code, 'delete keeps answering the documented rm triple').toBe('E-STOR-005');
  });

  it('secretStorage.hardening.oversizedBlobRefusedWithoutKeychainTouch', async () => {
    // TC-07-21 behavioral half, S4-2a — discriminating assertion first:
    // a crafted multi-MB store blob must never reach safeStorage
    // (decryptString) and must answer the documented damaged-store triple.
    // Today loadProfile does readFileSync(path) with no cap, so a
    // 10 MiB+1 blob is read whole and handed to the keychain stub.
    const store = await loadSecretStore();
    const blobPath = join(dataDir, STORE_FILE);
    writeFileSync(blobPath, Buffer.alloc(0));
    truncateSync(blobPath, MAX_STORE_BLOB_BYTES + 1);

    const error = captureAppError(
      () => store.loadProfile(),
      'TC-07-21: loadProfile with a crafted oversized blob',
    );
    expect(
      probe.decryptCalls.length,
      'M1-26b/TC-07-21 (issue #4 S4-2a): the oversized blob must be refused BEFORE the ' +
        'keychain — safeStorage.decryptString must never see the bytes (statSync cap ≤10 MB ' +
        'in loadProfile, security-m1-26b.md §2); today readFileSync reads the blob whole',
    ).toBe(0);
    expect(
      error.code,
      'the refusal carries the documented damaged-store triple (issue #4 fix text: ' +
        'statSync a cap before read → E-STOR-003)',
    ).toBe('E-STOR-003');
  });

  it('secretStorage.hardening.loadProfileSizesBlobBeforeReadingIt', () => {
    // TC-07-21 structural sibling (TC-01-41 precedent): the cap must be a
    // statSync before the readFileSync INSIDE loadProfile's body — a cap
    // anywhere else (e.g. only at save) still lets a crafted blob hit the
    // keychain. Today loadProfile's body contains no statSync at all.
    const body = functionBody(storeSource(), 'loadProfile');

    const statAt = body.search(/(?<![A-Za-z])statSync\s*\(/);
    const readAt = body.search(/(?<![A-Za-z])readFileSync\s*\(/);
    expect(
      statAt,
      'M1-26b/TC-07-21 (issue #4 S4-2a, structural): loadProfile must statSync the blob ' +
        'inside its own body — today the body has no statSync at all (security-m1-26b.md §2)',
    ).toBeGreaterThanOrEqual(0);
    expect(
      readAt,
      'precondition: loadProfile still reads the blob after sizing it (positive control)',
    ).toBeGreaterThanOrEqual(0);
    expect(
      statAt < readAt,
      'statSync (size gate) must come BEFORE readFileSync in loadProfile — the read may ' +
        'only ever run for a plausibly small file (issue #4 S4-2a fix text)',
    ).toBe(true);
  });

  it('secretStorage.hardening.oversizedProfileDocumentRefusedBeforeEncryptNothingWritten', async () => {
    // TC-07-22, S4-2b — discriminating assertion first: a caller bug
    // handing saveProfile more than the documented 1 MiB ceiling must be
    // refused with a documented triple (captureAppError fails the test
    // outright when today's save succeeds). Controls below pin that the
    // refusal happens before any encrypt call and leaves no file behind.
    const store = await loadSecretStore();
    const oversized = 'x'.repeat(MAX_PROFILE_JSON_BYTES + 1);

    const error = captureAppError(
      () => store.saveProfile(oversized),
      'TC-07-22: saveProfile with an oversized profile document',
    );
    expect(
      error.code,
      'M1-26b/TC-07-22 (issue #4 S4-2b): the defensive save cap answers the documented ' +
        'E-STOR-005 triple (errors.md §5 defensive entry; no size code exists in §5, ' +
        'DV-34) — today saveProfile encrypts and writes unbounded input',
    ).toBe('E-STOR-005');
    expect(
      probe.encryptCalls.length,
      'refusal BEFORE the first encrypt call (FR-53 precedent) — a 1 MiB encrypt for a ' +
        'document the validator could never have produced is wasted work and a symptom',
    ).toBe(0);
    expect(
      listFilesRecursive(dataDir),
      'nothing may be written for a refused document (issue #4 S4-2b fix text)',
    ).toEqual([]);
  });
});

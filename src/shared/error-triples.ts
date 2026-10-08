/**
 * M3-A single source for user-visible error triples that used to live
 * duplicated or trapped inside electron-bound entry files (batch A of
 * `docs/plans/m3-polish.md`; m3-test-plan TC-POL-01, audit finding B-5).
 *
 * Pure module — no `electron` import — so the wording table can pin the
 * exact shipped literals (absence-RED loader:
 * `tests/helpers/error-triples-stub.ts`). Wording source is always
 * `docs/analysis/errors.md` (§1/§2/§5, M3-A amendments): the words are
 * plain, the `code` field is the only place a code may appear (§0).
 *
 * Consumers: `src/main/index.ts` (import pipeline), `src/main/secret-store.ts`
 * (the `E-STOR-005` defensive entry), `src/main/core-wiring.ts` (the FR-12
 * step-0 refusal). Never inline these literals again — the dedup raw-text
 * pin in `tests/unit/errorWording.test.ts` keeps the copies out.
 */
import type { AppError } from './status-machine';

/** `errors.md` §2 `E-IO-001` (FR-06): the picked file vanished between dialog and read. */
export const FILE_READ_FAILED: AppError = {
  code: 'E-IO-001',
  title: 'Could not read the profile file',
  cause:
    'The file could not be read — it may have been moved, deleted, or its permissions changed.',
  nextStep: 'Check the file still exists, then import again.',
};

/** `errors.md` §2 `E-IO-002` (FR-01 defensive entry): the native picker itself failed. */
export const DIALOG_FAILED: AppError = {
  code: 'E-IO-002',
  title: 'File dialog could not open',
  cause: 'The system file dialog failed to open.',
  nextStep: 'Try again; if it repeats, restart the app.',
};

/** `errors.md` §5 `E-STOR-005` (FR-54 `[ASSUMPTION]` defensive entry): the write failed. */
export const E_STOR_005: AppError = {
  code: 'E-STOR-005',
  title: 'Profile could not be saved',
  cause:
    'Writing the encrypted profile to the app data directory failed (disk full or permissions).',
  nextStep: 'Free disk space / fix permissions, then import again.',
};

/** `errors.md` §1 `E-VAL-016` (FR-12 step-0 refusal): Start clicked before any import. */
export const NO_PROFILE: AppError = {
  code: 'E-VAL-016',
  title: 'No profile imported yet',
  cause: 'The tunnel cannot start because no profile has been imported.',
  nextStep: 'Import a profile first, then click Start.',
};

/**
 * M3-A (m3-test-plan TC-POL-01) — loader for the shared user-visible error
 * triples module `src/shared/error-triples.ts`.
 *
 * The module does not exist yet (strategy §5.1): the rows below it are
 * ABSENCE RED until M3-04 GREEN moves the literals there — the explicit
 * named reason below is the legitimate first failure of this batch, never a
 * generic resolution error (precedent: loadLogCollector in
 * tests/helpers/log-collector-stub.ts, the M1-14 loader).
 *
 * Why a module: the audit that drove the M3 wording pass found the same
 * triple literal duplicated (E-STOR-005 lives in BOTH src/main/index.ts and
 * src/main/secret-store.ts) and two more triples trapped inside the
 * electron-bound main entry (never importable from a unit test). The shared
 * module is the single source; the electron side imports from it.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AppError } from '../../src/shared/status-machine';

export interface ErrorTriplesApi {
  /** errors.md §2 (FR-06): the picked file vanished between dialog and read. */
  readonly FILE_READ_FAILED: AppError;
  /** errors.md §2 (FR-01 defensive): the native picker itself failed. */
  readonly DIALOG_FAILED: AppError;
  /** errors.md §5 (FR-54 defensive): persisting the encrypted profile failed. */
  readonly E_STOR_005: AppError;
  /** errors.md §1 E-VAL-016 (FR-12 step-0 refusal): no stored profile yet. */
  readonly NO_PROFILE: AppError;
}

function errorTriplesPath(): string {
  return fileURLToPath(new URL('../../src/shared/error-triples.ts', import.meta.url));
}

const errorTriplesModule = ['..', '..', 'src', 'shared', 'error-triples'].join('/');

/** Loads the module; fails with the explicit absence-RED reason while absent. */
export async function loadErrorTriples(): Promise<ErrorTriplesApi> {
  if (!existsSync(errorTriplesPath())) {
    throw new Error(
      'src/shared/error-triples.ts must exist — M3-04 GREEN creates the single-source ' +
        'module for the shared user-visible triples (TC-POL-01 absence RED)',
    );
  }
  const api = (await import(/* @vite-ignore */ errorTriplesModule)) as Partial<ErrorTriplesApi>;
  for (const key of ['FILE_READ_FAILED', 'DIALOG_FAILED', 'E_STOR_005', 'NO_PROFILE'] as const) {
    if (typeof api[key] !== 'object' || api[key] === null) {
      throw new Error(
        `src/shared/error-triples.ts must export ${key} as an AppError object — M3-04 GREEN`,
      );
    }
  }
  return api as ErrorTriplesApi;
}

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
 *
 * M1-20 batch (additive per DV-07): a third `describe` adds the `E-PLAT-*`
 * rows of errors.md §4 (001/002/003 — the system-proxy class per §7's
 * traceability "M1-20 (command construction + failure paths, exact hint
 * wording)"). They fire through the M1-21 module `src/main/system-proxy.ts`
 * via the recorded-injectable executor of `tests/helpers/system-proxy-stub.ts`
 * — ABSENCE RED until that module lands. Existing `E-STOR-*`/`E-VAL-*` rows
 * are untouched (strategy §5.2).
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
import {
  failedOperation,
  loadSystemProxy,
  MAC_DETECT_WIFI,
  MAC_SETTING_DISABLED,
  recordingRun,
} from '../helpers/system-proxy-stub';

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

/**
 * M1-20 batch: `E-PLAT-001/002/003` rows (errors.md §4, system-proxy class —
 * §7 traceability assigns them to M1-20). One representative trigger per code,
 * driven through the M1-21 contract `src/main/system-proxy.ts` with a recorded
 * executor (no real `networksetup`/`gsettings`, strategy §1). Every row is
 * ABSENCE RED until that module exists; existing rows above are never touched.
 */
const E_PLAT_WORDING_ROWS: readonly WordingRow[] = [
  {
    id: 'manualProxySetupRequired',
    code: 'E-PLAT-001',
    trigger:
      "setSystemProxy() on a non-GNOME Linux desktop ('KDE') — the toggle is " +
      'replaced by the manual hint (FR-33 / AC-04.5 / data-flows §3.3)',
    title: 'Manual proxy setup required',
    cause: 'not supported on this desktop environment',
    nextStep: 'Set it manually: SOCKS proxy 127.0.0.1, port 10808.',
    run: async () => {
      const systemProxy = await loadSystemProxy();
      return failedOperation(
        systemProxy.setSystemProxy({
          platform: 'linux',
          desktopEnv: 'KDE',
          run: recordingRun().run,
        }),
        'E-PLAT-001',
      );
    },
  },
  {
    id: 'systemProxyChangeFailed',
    code: 'E-PLAT-002',
    trigger:
      'setSystemProxy() on macOS when networksetup -setsocksfirewallproxy ' +
      'exits non-zero (FR-34 / AC-04.6)',
    title: 'System proxy change failed',
    cause: 'operating system command',
    nextStep: 'The toggle was returned to Off',
    run: async () => {
      const systemProxy = await loadSystemProxy();
      const recorder = recordingRun((index) => {
        if (index === 0) return { code: 0, stdout: MAC_DETECT_WIFI, stderr: '' };
        if (index === 1 || index === 2) {
          return { code: 0, stdout: MAC_SETTING_DISABLED, stderr: '' };
        }
        if (index === 3) return { code: 1, stdout: '', stderr: 'networksetup: unable to set' };
        return { code: 0, stdout: '', stderr: '' };
      });
      return failedOperation(
        systemProxy.setSystemProxy({ platform: 'darwin', run: recorder.run }),
        'E-PLAT-002',
      );
    },
  },
  {
    id: 'systemProxyNotRestored',
    code: 'E-PLAT-003',
    trigger:
      'restoreSystemProxy() when the OS refuses the restore commands — ' +
      'persistent warning, fail closed (FR-35 / AC-04.7)',
    title: 'System proxy could not be restored',
    cause: 'could not revert the system proxy to its previous settings',
    nextStep: 'Manual action required',
    run: async () => {
      const systemProxy = await loadSystemProxy();
      const recorder = recordingRun(() => ({ code: 1, stdout: '', stderr: 'networksetup: error' }));
      return failedOperation(
        systemProxy.restoreSystemProxy(
          { platform: 'darwin', run: recorder.run },
          {
            service: 'Wi-Fi',
            socks: { enabled: false, host: '', port: 0 },
            secureWeb: { enabled: false, host: '', port: 0 },
          },
        ),
        'E-PLAT-003',
      );
    },
  },
];

describe('error wording table — E-PLAT rows (NFR-5, errors.md §4) — TC-NFR5-01', () => {
  // M1-20 batch: additive only (DV-07) — the three documented system-proxy
  // codes; E-PLAT-004/005/006 belong to the tray/Gatekeeper/packaging batches.
  for (const row of E_PLAT_WORDING_ROWS) {
    it(`errorWording.${row.id}.nfr5TripleExactNoStack`, async () => {
      const error = await row.run();
      expectHumanError(row, error);
    });
  }
});

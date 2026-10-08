/**
 * M1-13 (RED) — profile re-import: overwrite with explicit confirmation
 * (Phase D close-out), executable specification.
 *
 * Test plan IDs: TC-01-30, TC-01-31, TC-01-32, TC-01-33, TC-01-34, TC-01-35,
 * TC-01-36 (docs/qa/m1-test-plan.md §1 and §14, deviation DV-21).
 *
 * Spec sources: docs/analysis/requirements.md FR-08 (re-import replaces the
 * profile only after explicit confirmation), FR-01 (cancel is not an error —
 * the precedent for a refusal), FR-04/FR-05; docs/analysis/data-flows.md flow
 * (a) step 6 ("confirm overwrite if a profile exists") and §4.2
 * (`profile:import-dialog` result row); docs/analysis/errors.md §0 (the NFR-5
 * triple renders user-visible *errors* — §0 enumerates no decline code and QA
 * may not invent one, DV-19); docs/product/stories/US-01-profile-import.md
 * AC-01.1/AC-01.7; docs/plans/m1-mvp.md M1-13; docs/qa/strategy.md §5.1/§5.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-13 (developer GREEN task) — exact flow + expected types,
 * pinned here because the analysis specifies the behavior but neither a
 * confirmation-dialog shape nor a decline payload (deviation DV-21;
 * header-contract style per DV-09/DV-16/DV-20). Any deviation requires an
 * upstream spec note first (strategy §5.2) — never a silent test edit.
 *
 * A) `src/shared/ipc.ts` — the §4.2 union gains a NON-error decline arm
 *    (today `ipc.ts` knows only `'cancelled'`; a refused overwrite must stay
 *    distinguishable from a cancelled picker so the renderer keeps showing
 *    which profile is active — AC-01.7 — without raising an error):
 *
 *      export type ProfileImportResult =
 *        | { ok: true; summary: ProfileSummary }
 *        | { ok: false; reason: 'cancelled' }
 *        | { ok: false; reason: 'declined' }   // NEW: overwrite refused
 *        | { ok: false; error: AppError };
 *
 *    The `declined` arm is NOT an `AppError` (FR-01 precedent: a user cancel
 *    is not an error; errors.md §0 documents no decline code — DV-19: QA does
 *    not invent codes, and neither may the implementation). It never carries
 *    `code`/`title`/`cause`/`nextStep`. The `data-flows.md` §4.2 row for
 *    `profile:import-dialog` must be extended with
 *    `| { ok:false, reason:"declined" }` to match.
 *
 * B) Flow of the `profile:import-dialog` handler after M1-13 — exact order:
 *
 *      1. assertTrustedSender(event);   // FIRST statement — unchanged
 *                                       // (issue #1 / S3-1)
 *      2. dialog.showOpenDialog({...})  // unchanged
 *         └ canceled → { ok:false, reason:'cancelled' }          [FR-01]
 *      3. readFileSync(path)            // unchanged → E-IO-001   [FR-06]
 *      4. validateClientConfig(raw)     // unchanged → E-VAL-*     [FR-03/04]
 *         └ invalid → return the E-VAL triple BEFORE any confirmation
 *           (data-flows (a): validation is step 4, confirmation is step 6)
 *      5. existence check through the secret store — `loadProfile()` or
 *         `storedProfileModifiedAt()`:
 *         └ no stored profile  → NO prompt; go straight to saveProfile(raw)
 *         └ stored profile     → dialog.showMessageBox(options) BEFORE
 *           saveProfile, called with exactly ONE argument, the options
 *           object (same style as showOpenDialog):
 *
 *             type     : 'warning'
 *             title    : non-empty, matches /overwrite|replac/i
 *             message  : non-empty
 *             detail   : non-empty, matches /overwrite|replac/i
 *             buttons  : exactly two —
 *                        index 0 = confirm, matches
 *                          /overwrite|replac|confirm|yes/i
 *                        index 1 = cancel,  matches
 *                          /cancel|keep|don'?t/i
 *             cancelId : 1   // Esc / window-close = cancel — never an
 *                            // overwrite
 *
 *           `response 0` → confirm, `response 1` → decline (the mock
 *           resolves `{ response, checkboxChecked }`, Electron's
 *           `MessageBoxReturnValue`).
 *      6. confirm (response 0)  → saveProfile(raw) →
 *                                 { ok:true, summary } of the NEW config;
 *         decline (response 1)  → { ok:false, reason:'declined' }
 *                                 with the store untouched.
 *
 *    Order guarantees pinned below: validation → existence check →
 *    messageBox → saveProfile; the prompt never opens for a forged sender
 *    (the guard stays first — zero side effects) and never before the new
 *    config is known-valid.
 *
 * RED status: ASSERTION RED — `src/main/index.ts` implements steps 1-4 and
 * persistence but no step 5/6 confirmation (its own comment: "Overwrite
 * confirmation (FR-08, step 6) lands with M1-13"), and `src/shared/ipc.ts`
 * has no `'declined'` arm. Every case below fails on the missing confirmation
 * flow / missing decline payload — never on a mock-setup error. Do not
 * weaken, skip, or delete anything here; M1-13 implements this contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { fileURLToPath } from 'node:url';

import { dialog } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadProfile, saveProfile, storedProfileModifiedAt } from '../../src/main/secret-store';
import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import {
  deriveValidRaw,
  fedarishaSettings,
  readConfigFixture,
} from '../helpers/profile-validator-stub';

/**
 * Observes what the mocked Electron APIs see: the captured
 * `ipcMain.handle` registrations. The dev URL is pinned in `vi.hoisted`,
 * which runs before every import — `src/main/index.ts` and
 * `src/main/ipc-guard.ts` read exactly this value when they compute the
 * allowed sender set (same technique as ipc-sender-guard.test.ts).
 */
const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    registrations: [] as Array<{ channel: string; handler: (...args: unknown[]) => unknown }>,
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => undefined,
    quit: () => undefined,
    getPath: () => '/nonexistent-userdata-for-tests',
  },
  BrowserWindow: class BrowserWindow {
    webContents = {
      setWindowOpenHandler: () => undefined,
      on: () => undefined,
      send: () => undefined,
    };

    static getAllWindows(): unknown[] {
      return [];
    }

    loadURL(): void {
      // test no-op: navigation is out of scope for this suite
    }

    loadFile(): void {
      // test no-op: navigation is out of scope for this suite
    }

    show(): void {
      // test no-op: the launch-policy show() (FR-38 amended, issue #25) runs
      // at module load and is out of scope for this suite
    }
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      probe.registrations.push({ channel, handler });
    },
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: () => undefined,
    },
  },
  shell: { openExternal: () => undefined },
}));

/**
 * The secret store is the side-effect surface FR-08 protects — mocked so
 * "prompted before the write" and "store byte-identical after a decline" are
 * observable without touching the filesystem or a keychain.
 */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(),
}));

/** The dev renderer URL the app itself loads (set in `vi.hoisted` above). */
const DEV_URL = 'http://localhost:5173/';
/** The refusal identity pinned by issue #1 (DV-19). */
const UNTRUSTED_SENDER_ERROR = 'UntrustedSenderError';
/** §4.2 channel this contract exercises. */
const IMPORT_CHANNEL = 'profile:import-dialog';

/** A frame on exactly the app's own dev document — the guard must allow it. */
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};
/** A frame from a page that is not the app's own renderer. */
const FORGED_EVENT = {
  senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' },
};

/** The picked file: the §9.1 canary config (BR-V-conformant). */
const VALID_CONFIG_PATH = fileURLToPath(
  new URL('../fixtures/configs/valid-client-config.json', import.meta.url),
);
/** The picked file: syntactically invalid JSON (FR-03 → E-VAL-001). */
const INVALID_CONFIG_PATH = fileURLToPath(
  new URL('../fixtures/configs/invalid-syntax.json', import.meta.url),
);
/** Exactly what the picker hands over when VALID_CONFIG_PATH is chosen. */
const NEW_RAW = readConfigFixture('valid-client-config.json');
/** A different, previously stored profile (§9.1 fixture mutated in memory, DV-10 style). */
const OLD_RAW = deriveValidRaw((doc) => {
  const storage = fedarishaSettings(doc);
  storage['bucket'] = 'old-bucket';
  storage['endpoint'] = 'https://s3.previous.example';
  storage['prefix'] = 'profiles/previous-profile';
});

/** Everything the mocked surfaces record, in call order — reset per test. */
type TimelineEntry =
  'showOpenDialog' | 'showMessageBox' | 'loadProfile' | 'storedProfileModifiedAt' | 'saveProfile';
const timeline: TimelineEntry[] = [];
/** The option objects `dialog.showMessageBox` was called with, in call order. */
const confirmations: unknown[] = [];
/** In-memory model of the encrypted store (M1-09 round-trip semantics). */
const store: { bytes: string | null } = { bytes: null };
/** Picker answer for the next run (FR-01: cancel is an answer). */
let currentPick: { canceled: boolean; filePaths: string[] } = {
  canceled: true,
  filePaths: [],
};
/** The `response` the confirmation dialog will resolve with (0 confirm / 1 decline). */
let pendingResponse = 0;

/**
 * Structural view of a vitest mock's `mockImplementation` — Electron's
 * overloaded `dialog.*` signatures make `vi.mocked(...)` parameter types
 * unusable for capturing the options object (header contract B).
 */
interface MockImplementationRegistrar {
  mockImplementation(implementation: (...args: unknown[]) => unknown): void;
}

function showOpenDialogMock(): MockImplementationRegistrar {
  return dialog.showOpenDialog as unknown as MockImplementationRegistrar;
}

function showMessageBoxMock(): MockImplementationRegistrar {
  return dialog.showMessageBox as unknown as MockImplementationRegistrar;
}

beforeEach(() => {
  vi.clearAllMocks();
  timeline.length = 0;
  confirmations.length = 0;
  store.bytes = null;
  currentPick = { canceled: true, filePaths: [] };
  pendingResponse = 0;

  showOpenDialogMock().mockImplementation(async () => {
    timeline.push('showOpenDialog');
    return { ...currentPick, filePaths: [...currentPick.filePaths] };
  });
  showMessageBoxMock().mockImplementation(async (options: unknown) => {
    timeline.push('showMessageBox');
    confirmations.push(options);
    return { response: pendingResponse, checkboxChecked: false };
  });
  vi.mocked(loadProfile).mockImplementation(() => {
    timeline.push('loadProfile');
    return store.bytes;
  });
  vi.mocked(storedProfileModifiedAt).mockImplementation(() => {
    timeline.push('storedProfileModifiedAt');
    return null;
  });
  vi.mocked(saveProfile).mockImplementation((raw: string) => {
    timeline.push('saveProfile');
    store.bytes = raw;
  });
});

/** Points the native picker at `path` (a real synthetic fixture, strategy §1). */
function pick(path: string): void {
  currentPick = { canceled: false, filePaths: [path] };
}

type HandlerOutcome =
  | { readonly kind: 'resolved'; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly errorName: string };

/**
 * Invokes the captured `profile:import-dialog` handler with `event`,
 * recording whether it resolved (handler logic ran) or rejected (and with
 * which error name) — Electron converts a handler throw into an invoke
 * rejection, so this mirrors `ipcRenderer.invoke` semantics faithfully.
 */
async function importOutcome(event: unknown): Promise<HandlerOutcome> {
  const registration = probe.registrations.find((entry) => entry.channel === IMPORT_CHANNEL);
  if (registration === undefined) {
    throw new Error(
      `no ipcMain.handle registration captured for '${IMPORT_CHANNEL}' — src/main/index.ts ` +
        `must register the §4.2 invoke channel`,
    );
  }
  try {
    return { kind: 'resolved', value: await registration.handler(event) };
  } catch (error) {
    return {
      kind: 'rejected',
      errorName: error instanceof Error ? error.name : `not-an-Error:${typeof error}`,
    };
  }
}

/**
 * Resolves the handler payload for a trusted sender. An escaped rejection
 * fails the test here — the pin that no import outcome (picker cancel,
 * validation failure, declined overwrite) ever raises (FR-01 precedent).
 */
async function runImport(event: unknown): Promise<unknown> {
  const outcome = await importOutcome(event);
  if (outcome.kind === 'rejected') {
    throw new Error(
      `profile:import-dialog rejected with ${outcome.errorName} — every import outcome must ` +
        'resolve to a §4.2 payload, never raise (FR-01: a user choice is not an error)',
    );
  }
  return outcome.value;
}

/** Narrows a resolved success payload to its §8.3 summary, or fails loudly. */
function summaryOfSuccess(result: unknown, context: string): Record<string, unknown> {
  if (typeof result !== 'object' || result === null) {
    throw new Error(`${context}: expected an object payload, got ${JSON.stringify(result)}`);
  }
  const payload = result as Record<string, unknown>;
  if (payload['ok'] !== true) {
    throw new Error(
      `${context}: expected { ok: true, summary } (FR-05), got ${JSON.stringify(result)}`,
    );
  }
  const summary = payload['summary'];
  if (typeof summary !== 'object' || summary === null) {
    throw new Error(
      `${context}: the success arm must carry the §8.3 summary, got ${JSON.stringify(summary)}`,
    );
  }
  return summary as Record<string, unknown>;
}

/** The options object of the single `showMessageBox` call (header contract B). */
function confirmationOptions(context: string): Record<string, unknown> {
  const call = confirmations[0];
  if (call === undefined) {
    throw new Error(`${context}: dialog.showMessageBox was never called`);
  }
  if (typeof call !== 'object' || call === null) {
    throw new Error(
      `${context}: dialog.showMessageBox must be called with ONE MessageBoxOptions object, ` +
        `got ${typeof call}`,
    );
  }
  return call as Record<string, unknown>;
}

/** The pinned `buttons` array — exactly two strings (header contract B). */
function confirmationButtons(options: Record<string, unknown>): unknown[] {
  const buttons = options['buttons'];
  if (!Array.isArray(buttons)) {
    throw new Error(
      `confirmation buttons must be an array of two labels, got ${JSON.stringify(buttons)}`,
    );
  }
  return buttons;
}

/**
 * Guards that the "old" and "new" documents really differ — otherwise the
 * byte-change pins would pass vacuously (precedent: the precondition
 * equality checks of ipc-sender-guard.test.ts).
 */
function expectDistinctProfiles(): void {
  expect(
    OLD_RAW,
    'precondition: the stored profile and the picked file must differ for the ' +
      'overwrite pins to mean anything',
  ).not.toBe(NEW_RAW);
  expect(OLD_RAW, 'precondition: OLD_RAW models the previously stored profile').toContain(
    'old-bucket',
  );
  expect(NEW_RAW, 'precondition: NEW_RAW is the canary fixture the picker hands over').toContain(
    'example-bucket',
  );
}

describe('profile:import-dialog — re-import overwrite confirmation (M1-13, FR-08)', () => {
  it('profileImport.firstImport.storeExistenceCheckedWithoutConfirmationPrompt', async () => {
    // TC-01-30 — first import (empty store): data-flows (a) step 6 must still
    // make the overwrite decision ("is a profile already stored?") from main's
    // secret store; with nothing stored the import succeeds WITHOUT any
    // confirmation prompt (FR-08 confirms only the loss of an existing
    // profile — AC-01.1 keeps the empty-store path prompt-free).
    store.bytes = null;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 0; // would confirm — the point is it must never be asked

    const result = await runImport(TRUSTED_EVENT);

    // The decision point exists: main consults the store before writing.
    // RED today: the handler never reads the store, so it cannot know
    // whether an overwrite confirmation is owed (M1-13 flow absent).
    const existenceCheck = Math.min(
      timeline.indexOf('loadProfile'),
      timeline.indexOf('storedProfileModifiedAt'),
    );
    expect(
      existenceCheck,
      'FR-08 / data-flows (a) step 6: before saving, the handler must check whether a profile ' +
        'is already stored (loadProfile()/storedProfileModifiedAt()) — without that check it ' +
        'cannot decide whether an overwrite confirmation is owed (M1-13 confirmation flow absent)',
    ).toBeGreaterThan(-1);
    expect(
      timeline.indexOf('saveProfile'),
      'M1-13: a first import persists the validated document through the secret store',
    ).toBeGreaterThan(-1);
    expect(
      existenceCheck,
      'the existence check must run before the write — decision first, then persistence ' +
        '(data-flows (a): step 6 precedes steps 8-9)',
    ).toBeLessThan(timeline.indexOf('saveProfile'));

    expect(
      dialog.showMessageBox,
      'no stored profile → import succeeds WITHOUT any confirmation prompt (FR-08 asks only ' +
        'when an existing profile would be overwritten)',
    ).not.toHaveBeenCalled();

    const summary = summaryOfSuccess(result, 'first import');
    expect(
      summary['bucket'],
      'FR-05: the success payload is the §8.3 summary of the newly imported config',
    ).toBe('example-bucket');
    expect(summary['endpointHost']).toBe('s3.example.com');
    expect(summary['socksPort']).toBe(DEFAULT_SOCKS_PORT);
    expect(store.bytes, 'M1-13 persistence half: the picked document is stored byte-for-byte').toBe(
      NEW_RAW,
    );
  });

  it('profileImport.reimport.confirmationShownBeforeSaveWithOverwriteWording', async () => {
    // TC-01-31 — a profile IS stored: FR-08 requires an explicit overwrite
    // confirmation BEFORE anything is written, with wording that says what
    // will be lost (title/detail) and exactly two actions at pinned indices
    // (header contract B).
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 0; // user confirms — order and wording are asserted first

    await runImport(TRUSTED_EVENT);

    expect(
      dialog.showMessageBox,
      'FR-08 / AC-01.7: re-importing while a profile is stored must ask for explicit ' +
        'overwrite confirmation first — no prompt ever appears (M1-13 confirmation flow absent)',
    ).toHaveBeenCalledTimes(1);

    const options = confirmationOptions('re-import confirmation');
    expect(
      options['type'],
      'the overwrite prompt is a warning-class dialog (FR-08: the user is told the stored ' +
        'profile will be replaced)',
    ).toBe('warning');
    const title = typeof options['title'] === 'string' ? options['title'] : '';
    expect(title.trim(), 'the confirmation needs a non-empty title').not.toBe('');
    expect(
      title,
      `the title must mention overwrite/replace (FR-08 wording contract), got ${JSON.stringify(title)}`,
    ).toMatch(/overwrite|replac/i);
    const message = typeof options['message'] === 'string' ? options['message'] : '';
    expect(message.trim(), 'the confirmation needs a non-empty message body').not.toBe('');
    const detail = typeof options['detail'] === 'string' ? options['detail'] : '';
    expect(detail.trim(), 'the confirmation needs a non-empty detail line').not.toBe('');
    expect(
      detail,
      `the detail must mention overwrite/replace (FR-08 wording contract), got ${JSON.stringify(detail)}`,
    ).toMatch(/overwrite|replac/i);

    const buttons = confirmationButtons(options);
    expect(
      buttons.length,
      'exactly two actions: confirm the overwrite or keep the stored profile (FR-08 explicit ' +
        'confirmation — no third, ambiguous option)',
    ).toBe(2);
    expect(
      String(buttons[0]),
      `button index 0 must be the confirm action (response 0 → overwrite), got ${JSON.stringify(buttons[0])}`,
    ).toMatch(/overwrite|replac|confirm|yes/i);
    expect(
      String(buttons[1]),
      `button index 1 must be the cancel action (response 1 → keep the stored profile), got ${JSON.stringify(buttons[1])}`,
    ).toMatch(/cancel|keep|don'?t/i);
    expect(
      options['cancelId'],
      'cancelId must be 1: Esc / window-close maps to the cancel button — closing the dialog ' +
        'must never overwrite a stored profile',
    ).toBe(1);

    // Call-order pin: the prompt opens BEFORE any write.
    expect(
      timeline.indexOf('showMessageBox'),
      'precondition: the confirmation was shown',
    ).toBeGreaterThan(-1);
    expect(
      timeline.indexOf('saveProfile'),
      'precondition: the confirmed import writes',
    ).toBeGreaterThan(-1);
    expect(
      timeline.indexOf('showMessageBox'),
      'FR-08 / data-flows (a) step 6 before steps 8-9: confirmation must be shown BEFORE ' +
        'saveProfile — never overwrite first and ask later',
    ).toBeLessThan(timeline.indexOf('saveProfile'));
  });

  it('profileImport.confirm.replacesStoredProfileWithSummaryOfNewConfig', async () => {
    // TC-01-32 — user confirms (response 0): AC-01.7 — the new profile
    // REPLACES the old one, the store bytes change, and the result carries
    // the summary of the NEW config (FR-05/§8.3), never the replaced one.
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 0;

    const result = await runImport(TRUSTED_EVENT);

    expect(
      dialog.showMessageBox,
      'FR-08: the overwrite must be confirmed before the stored profile is replaced ' +
        '(M1-13 confirmation flow absent — the prompt never appears)',
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(saveProfile),
      'confirmed → the new document is written to the store exactly once',
    ).toHaveBeenCalledTimes(1);
    expect(
      store.bytes,
      'AC-01.7: the confirmed re-import replaces the stored profile byte-for-byte with the ' +
        'picked document',
    ).toBe(NEW_RAW);
    expect(
      store.bytes,
      'the store bytes must CHANGE on a confirmed re-import (that is what "replaces" means)',
    ).not.toBe(OLD_RAW);

    const summary = summaryOfSuccess(result, 'confirmed re-import');
    expect(
      summary['bucket'],
      'FR-05: the success payload summarizes the NEW config, not the replaced one',
    ).toBe('example-bucket');
    expect(summary['prefix']).toBe('profiles/vlt-alpha');
    expect(summary['endpointHost']).toBe('s3.example.com');
    expect(String(summary['displayName'])).toContain('vlt-alpha');
    expect(summary['socksPort']).toBe(DEFAULT_SOCKS_PORT);
    expect(
      JSON.stringify(summary),
      '§8.3/FR-55: the summary stays non-secret — no accessKey from the new config may cross IPC',
    ).not.toContain('EXAMPLEACCESSKEYID01');
    expect(
      JSON.stringify(summary),
      'the summary must describe the NEW profile — no field of the replaced one may leak into it',
    ).not.toContain('old-bucket');
  });

  it('profileImport.decline.keepsStoredProfileByteIdenticalWithDeclinedReason', async () => {
    // TC-01-33 — user declines (response 1): the store must stay
    // byte-identical and the result must be the NON-error decline payload of
    // header contract A (the §4.2 union extension `{ ok:false, reason:
    // 'declined' }`). The plain `await` is the "no exception" pin: a raise
    // fails the runImport wrapper above (FR-01: refusal is a user choice).
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 1;

    const result = await runImport(TRUSTED_EVENT);

    expect(
      dialog.showMessageBox,
      'FR-08: the overwrite had to be asked before it could be declined ' +
        '(M1-13 confirmation flow absent)',
    ).toHaveBeenCalledTimes(1);
    expect(
      result,
      'declined overwrite → exactly the §4.2 non-error decline payload declared in header ' +
        "contract A ({ ok:false, reason:'declined' }); ipc.ts gains the arm, the result is not " +
        'an error',
    ).toEqual({ ok: false, reason: 'declined' });
    expect(
      vi.mocked(saveProfile),
      'declining must never write the store — the previous profile stays active',
    ).not.toHaveBeenCalled();
    expect(
      store.bytes,
      'AC-01.7 counterpart: a declined re-import leaves the stored profile byte-identical',
    ).toBe(OLD_RAW);
  });

  it('profileImport.decline.resultIsNonErrorReasonWithoutNfr5Triple', async () => {
    // TC-01-34 — a decline is a user CHOICE, like the picker cancel of
    // FR-01: it is not a failure, so the NFR-5 triple (errors.md §0:
    // code/title/cause/nextStep) must not appear in the payload, and no
    // `E-*` code may be invented for it (DV-19 precedent — errors.md
    // documents no decline code).
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 1;

    const result = await runImport(TRUSTED_EVENT);

    expect(
      typeof result,
      'the decline must resolve to a payload object, never raise (FR-01: user choice ≠ error)',
    ).toBe('object');
    expect(result, 'the decline payload must not be null').not.toBeNull();
    const payload = result as Record<string, unknown>;
    expect(
      payload['ok'],
      'a declined overwrite is ok:false — consent was withheld, not a transport or validation ' +
        'failure',
    ).toBe(false);
    expect(
      payload['reason'],
      "FR-01 / data-flows §4.2: report the decline as the NON-error reason 'declined' " +
        '(header contract A — the union extension ipc.ts owes; M1-13 flow absent today)',
    ).toBe('declined');
    expect(
      'error' in payload,
      'the decline must not use the { ok:false, error } arm — that arm is reserved for ' +
        'documented failures (errors.md §0)',
    ).toBe(false);
    for (const tripleField of ['title', 'cause', 'nextStep', 'code']) {
      expect(
        tripleField in payload,
        `the decline payload must not carry the NFR-5 field '${tripleField}': errors.md §0 ` +
          'documents no decline code and a refusal is not an error (FR-01 cancelled ' +
          'precedent, DV-19)',
      ).toBe(false);
    }
    expect(
      Object.keys(payload).sort(),
      'the decline payload is exactly { ok, reason } — nothing else may cross the bridge',
    ).toEqual(['ok', 'reason']);
  });

  it('profileImport.validationFailure.surfacesBeforeAnyConfirmationPrompt', async () => {
    // TC-01-35 — data-flows (a) ordering: validation is step 4, confirmation
    // is step 6. An invalid file must surface its E-VAL triple with NO prompt
    // and no write; the second half (a valid file with the same stored
    // profile) is the contrast that makes "before any confirmation"
    // falsifiable — without it the first three assertions would hold vacuously.
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(INVALID_CONFIG_PATH);
    pendingResponse = 0; // would confirm — an invalid file may never ask

    const invalidResult = await runImport(TRUSTED_EVENT);

    expect(
      invalidResult,
      'FR-03/FR-04: an invalid file still answers with its documented E-VAL triple (M1-11/12 ' +
        'contract), not with a confirmation prompt',
    ).toMatchObject({ ok: false, error: { code: 'E-VAL-001' } });
    expect(
      dialog.showMessageBox,
      'data-flows (a) step 4 before step 6: confirmation opens only after the new config is ' +
        'known-valid — for an invalid file no prompt may ever appear',
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(saveProfile),
      'errors.md §1: a rejected file is persisted nowhere ("reject before write")',
    ).not.toHaveBeenCalled();
    expect(store.bytes, 'the stored profile survives a failed re-import untouched').toBe(OLD_RAW);

    // Contrast half (RED today): the same stored profile + a VALID file must
    // reach the prompt at all — only then does "validation before
    // confirmation" mean anything (FR-08 step 6 exists behind step 4).
    pick(VALID_CONFIG_PATH);
    await runImport(TRUSTED_EVENT);
    expect(
      dialog.showMessageBox,
      'FR-08 step 6: a valid file with a stored profile MUST prompt — validation has passed, ' +
        'so the confirmation is now reachable (M1-13 confirmation flow absent today)',
    ).toHaveBeenCalledTimes(1);
    expect(
      timeline.indexOf('showMessageBox'),
      'and it opens before the write of that valid import',
    ).toBeLessThan(timeline.lastIndexOf('saveProfile'));
  });

  it('profileImport.reimport.forgedTwinRefusedTrustedTwinReachesPrompt', async () => {
    // TC-01-36 — regression of the guard-first pattern (issue #1 / S3-1) in
    // the UPDATED M1-13 handler: `assertTrustedSender(event)` stays the first
    // statement, so a forged sender meets the refusal before picker, prompt,
    // or store — while the app's own renderer (trusted twin, TC-IPC-09
    // pattern) reaches the new confirmation flow.
    expectDistinctProfiles();
    store.bytes = OLD_RAW;
    pick(VALID_CONFIG_PATH);
    pendingResponse = 0;

    const forged = await importOutcome(FORGED_EVENT);
    expect(
      forged,
      `the forged sender must be refused with ${UNTRUSTED_SENDER_ERROR} (issue #1 / S3-1 — the ` +
        'M1-13 handler edit must keep assertTrustedSender as its FIRST statement)',
    ).toEqual({ kind: 'rejected', errorName: UNTRUSTED_SENDER_ERROR });
    expect(
      timeline,
      'issue #1 / S3-1 regression: a refused invoke performs ZERO side effects — no picker, ' +
        'no confirmation prompt, no store read, no store write (M1-13 flow sits behind the ' +
        'guard too)',
    ).toEqual([]);
    expect(store.bytes, 'the stored profile is untouched by a forged invoke').toBe(OLD_RAW);

    // Trusted twin: the guard must let the app's own renderer through into
    // the confirmation flow — RED today because that flow does not exist yet.
    await runImport(TRUSTED_EVENT);
    expect(
      dialog.showMessageBox,
      'the guard passes the app’s own renderer into the new confirmation flow (TC-IPC-09 twin ' +
        'pattern) — M1-13 confirmation flow absent today',
    ).toHaveBeenCalledTimes(1);
    expect(
      store.bytes,
      'behind the guard the confirmed re-import completes normally (response 0 → new profile)',
    ).toBe(NEW_RAW);
  });
});

/**
 * Issue #1 (M1-10 review S3-1/S3-2) — sender validation on every `ipcMain`
 * handler + deny-by-default permission handler. RED phase.
 *
 * Test plan IDs: TC-IPC-06, TC-IPC-07, TC-IPC-08, TC-IPC-09, TC-IPC-11
 * (docs/qa/m1-test-plan.md §7; allocations DV-18). The structural sibling
 * TC-IPC-10 lives in tests/unit/ipc-guard-contract.test.ts.
 * Spec sources: GitHub issue #1 (summarized in the QA work item: every
 * handler must validate `event.senderFrame` FIRST; the permission request
 * handler must deny by default), docs/qa/security-m1-10.md S3-1/S3-2,
 * docs/qa/security-m0-19.md S4-4 + standing guidance ("Every new IPC handler
 * must validate event.senderFrame"), docs/analysis/data-flows.md §4.2 (the
 * 11 invoke channels), docs/qa/strategy.md §5.1 (RED reasons).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR THE GREEN FIX (issue #1) — pinned exactly; any deviation
 * requires an upstream spec note first (docs/qa/strategy.md §5.2), never a
 * silent test edit:
 *
 * A) `src/main/ipc-guard.ts` (new module) exports:
 *
 *      export function assertTrustedSender(event: IpcMainInvokeEvent): void
 *
 *    - called as the FIRST statement of every `ipcMain.handle` callback in
 *      `src/main/index.ts` — before any other statement, before the native
 *      dialog opens, before the secret store is touched (issue #1: "validate
 *      as the FIRST thing in every handler");
 *    - validates `event.senderFrame` against the app's own document: the
 *      allowed URL set is the UNION of
 *        · exactly `process.env.ELECTRON_RENDERER_URL` (dev — the same value
 *          createWindow loads, src/main/index.ts ~:86/:105), and
 *        · exactly `pathToFileURL(join(__dirname, '../renderer/index.html'))`
 *          — the packaged document createWindow loads (~:108), resolved from
 *          `src/main/` (identical `__dirname` in out/main and under the
 *          vitest transform of src/main);
 *      a FOREIGN `file://` document is NOT in the set (issue #1 says
 *      "packaged file path"; the navigation-side twin of that rule is M1-10
 *      S3-3). Validation is on `senderFrame.url`;
 *    - absent/`null` `senderFrame`, or a frame whose `url` is outside the
 *      set → THROWS an `Error` with `name === 'UntrustedSenderError'` and a
 *      non-empty message (Electron turns a handler throw into an invoke
 *      rejection — a forged caller learns nothing; the trusted renderer
 *      never triggers it);
 *    - a frame inside the set → returns normally (void) and the handler
 *      logic runs untouched.
 *
 *    Error-class note (DV-19): `docs/analysis/errors.md` has NO class for a
 *    sender refusal (§0 classes: VAL / IO / CORE / PLAT / STOR) and QA may
 *    not invent a code. The refusal is deliberately NOT an `AppError` triple:
 *    it is not user-visible — only a forged sender can trigger it — so the
 *    NFR-5 wording contract (errors.md §0: "every user-visible error")
 *    does not apply. `errors.md` owes a documented security-refusal entry
 *    (owner to name it); until then these tests pin the error `name` only
 *    and assert NO `E-*` code.
 *
 * B) `src/main/index.ts`, inside the `app.whenReady()` path:
 *
 *      session.defaultSession.setPermissionRequestHandler(
 *        (_webContents, _permission, callback) => callback(false),
 *      );
 *
 *    - registered AFTER app ready (Electron exposes `session` only once the
 *      ready event fired — the mock records at which moment it happened);
 *    - denies every permission request by default (`callback(false)`) —
 *      an allowlist arrives only with the first feature that needs one
 *      (S3-2: default Electron handling is allow-by-default for several
 *      permissions).
 *
 * Approach (node env, no Electron binary): `vi.mock('electron')` captures
 * every `ipcMain.handle` registration, `app.whenReady`, `dialog` and
 * `session.defaultSession`; the captured handlers are then invoked directly
 * with forged vs. trusted events, and `src/main/secret-store` is mocked so
 * side effects (dialog, store read/write/delete) are observable.
 * RED status: assertion RED — today's handlers ignore `event.senderFrame`
 * (they run their logic and resolve) and no permission handler is
 * registered. The expected failure reason is "guard absent", never a
 * mock-setup error. Do not weaken, skip, or delete anything here; issue #1
 * implements this contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { dialog } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteStoredProfile, loadProfile, saveProfile } from '../../src/main/secret-store';
import { DEFAULT_SOCKS_PORT } from '../../src/shared/constants';
import { IPC_INVOKE_CHANNELS } from '../../src/shared/ipc';

/**
 * Observes what the mocked electron APIs see: the captured `ipcMain.handle`
 * registrations (channel → handler), the moment `app.whenReady` resolved,
 * and the `setPermissionRequestHandler` callback registered after it.
 * The dev URL is pinned here — `vi.hoisted` runs before every import, so
 * `src/main/index.ts` (and the future `src/main/ipc-guard.ts`) read exactly
 * this value when they compute the allowed origin set.
 */
const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    registrations: [] as Array<{ channel: string; handler: (...args: unknown[]) => unknown }>,
    readyResolved: false,
    permissionHandler: null as
      null | ((webContents: unknown, permission: string, answer: (grant: boolean) => void) => void),
    permissionHandlerRegisteredAfterReady: false,
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    whenReady: () =>
      Promise.resolve().then(() => {
        probe.readyResolved = true;
      }),
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
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      probe.registrations.push({ channel, handler });
    },
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: (
        callback: (
          webContents: unknown,
          permission: string,
          answer: (grant: boolean) => void,
        ) => void,
      ) => {
        probe.permissionHandlerRegisteredAfterReady = probe.readyResolved;
        probe.permissionHandler = callback;
      },
    },
  },
  shell: { openExternal: () => undefined },
}));

/**
 * The store is a side-effect surface the guard must protect (S3-1: validation
 * runs BEFORE the handler logic) — mocked so "not called" is observable
 * without touching the filesystem.
 */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => null),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/** The dev renderer URL the app itself loads (set in `vi.hoisted` above). */
const DEV_URL = 'http://localhost:5173/';

/** The refusal identity pinned by the contract above (see DV-19). */
const UNTRUSTED_SENDER_ERROR = 'UntrustedSenderError';

/** A frame from a page that is not the app's own renderer (issue #1). */
const FORGED_EVENT = {
  senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' },
};

/** A frame on exactly the app's own dev document — issue #1 must allow it. */
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};

type HandlerOutcome =
  | { readonly kind: 'resolved'; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly errorName: string };

/** True only for the documented refusal (contract A, DV-19). */
function refused(outcome: HandlerOutcome): boolean {
  return outcome.kind === 'rejected' && outcome.errorName === UNTRUSTED_SENDER_ERROR;
}

/**
 * Invokes the captured handler for `channel` with `event`, recording whether
 * it resolved (handler logic ran) or rejected (and with which error name).
 * Electron converts a thrown handler error into an invoke rejection, so the
 * async wrapper mirrors `ipcRenderer.invoke` semantics faithfully.
 */
async function outcomeOf(channel: string, event: unknown): Promise<HandlerOutcome> {
  const registration = probe.registrations.find((entry) => entry.channel === channel);
  if (registration === undefined) {
    throw new Error(
      `no ipcMain.handle registration captured for '${channel}' — src/main/index.ts ` +
        `must register every §4.2 invoke channel (${IPC_INVOKE_CHANNELS.length} declared, ` +
        `${probe.registrations.length} captured)`,
    );
  }
  try {
    const value = await registration.handler(event);
    return { kind: 'resolved', value };
  } catch (error) {
    return {
      kind: 'rejected',
      errorName: error instanceof Error ? error.name : `not-an-Error:${typeof error}`,
    };
  }
}

/**
 * Untrusted frame shapes: remote forged origin, dev-URL spoofs (wrong port
 * / host-suffix trick — both would pass a naive `startsWith(devUrl)` check),
 * a foreign local `file://` document (issue #1 allows the packaged app
 * document path only), and absent/`null`/empty `senderFrame`.
 */
const UNTRUSTED_FRAME_CASES: ReadonlyArray<{ readonly label: string; readonly event: unknown }> = [
  { label: 'remote forged origin', event: FORGED_EVENT },
  {
    label: 'wrong-port prefix spoof of the dev URL',
    event: { senderFrame: { url: 'http://localhost:51734/', origin: 'http://localhost:51734' } },
  },
  {
    label: 'host-suffix spoof of the dev URL',
    event: {
      senderFrame: {
        url: 'http://localhost:5173.evil.example/',
        origin: 'http://localhost:5173.evil.example',
      },
    },
  },
  {
    label: 'foreign file:// document (packaged path is the app document only)',
    event: { senderFrame: { url: 'file:///tmp/attacker.html', origin: 'null' } },
  },
  { label: 'senderFrame absent', event: {} },
  { label: 'senderFrame null', event: { senderFrame: null } },
  { label: 'senderFrame without url/origin', event: { senderFrame: {} } },
];

/** Handlers whose logic has observable side effects (S3-1 spot check). */
const SIDE_EFFECT_CHANNELS = ['profile:import-dialog', 'profile:get', 'profile:remove'] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sender validation on every invoke handler (issue #1, S3-1)', () => {
  it('ipc.guard.forgedSenderRefusedOnEveryRegisteredChannel', async () => {
    // S3-1: validation is per-handler, so the loop below must cover the whole
    // captured surface — a handler registered later without the guard fails
    // this test too. The equality precondition keeps the loop honest (it can
    // never run over an empty or partial list without a second failure).
    expect(
      probe.registrations.map((entry) => entry.channel).sort(),
      `the captured ipcMain surface must equal the §4.2 invoke allowlist — the forged-sender ` +
        `loop is only as complete as this list (captured ${probe.registrations.length}, ` +
        `declared ${IPC_INVOKE_CHANNELS.length})`,
    ).toEqual([...IPC_INVOKE_CHANNELS].sort());

    const unguarded: string[] = [];
    for (const { channel } of probe.registrations) {
      const outcome = await outcomeOf(channel, FORGED_EVENT);
      if (!refused(outcome)) unguarded.push(`${channel} → ${JSON.stringify(outcome)}`);
    }
    expect(
      unguarded,
      'issue #1 / S3-1: every ipcMain.handle must validate event.senderFrame first and ' +
        `refuse an untrusted sender with ${UNTRUSTED_SENDER_ERROR} — handlers that resolved ` +
        'with their payload ran their logic for a forged sender:',
    ).toEqual([]);
  });

  it('ipc.guard.absentAndWrongOriginSenderFramesRefused', async () => {
    // Table-driven half of S3-1: every untrusted frame shape listed above must
    // be refused with the documented error before any handler logic runs.
    // `status:get` is the lightweight probe handler — no side effects of its
    // own, so a non-refusal can only mean "no guard".
    const failures: string[] = [];
    for (const { label, event } of UNTRUSTED_FRAME_CASES) {
      const outcome = await outcomeOf('status:get', event);
      if (!refused(outcome)) failures.push(`${label} → ${JSON.stringify(outcome)}`);
    }
    expect(
      failures,
      `issue #1 / S3-1: every untrusted frame must be refused with ${UNTRUSTED_SENDER_ERROR} ` +
        'before handler logic (missing/null senderFrame, wrong origin, foreign file path):',
    ).toEqual([]);
  });

  it('ipc.guard.refusalExecutesNoHandlerSideEffects', async () => {
    // S3-1 "FIRST thing in every handler": for a forged sender the native
    // picker must never open and the secret store must never be read,
    // written, or deleted — validation cannot come after the side effects.
    const outcomes = await Promise.all(
      SIDE_EFFECT_CHANNELS.map(
        async (channel) => [channel, await outcomeOf(channel, FORGED_EVENT)] as const,
      ),
    );

    expect(
      vi.mocked(dialog.showOpenDialog),
      'the native file picker must never open for an untrusted sender (issue #1: ' +
        'assertTrustedSender(event) is the FIRST statement of profile:import-dialog)',
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(loadProfile),
      'the encrypted store must not be read for an untrusted sender (profile:get)',
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(saveProfile),
      'the encrypted store must not be written for an untrusted sender (profile:import-dialog)',
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(deleteStoredProfile),
      'the stored profile must never be deleted for an untrusted sender (profile:remove)',
    ).not.toHaveBeenCalled();

    const unguarded = outcomes
      .filter(([, outcome]) => !refused(outcome))
      .map(([channel]) => channel);
    expect(
      unguarded,
      `issue #1 / S3-1: these side-effecting handlers must refuse the forged sender with ` +
        `${UNTRUSTED_SENDER_ERROR} before doing anything:`,
    ).toEqual([]);
  });

  it('ipc.guard.trustedFrameRunsLogicWhileForgedTwinRefused', async () => {
    // The allowed side of the contract: a frame on the app's own dev document
    // reaches the handler logic untouched (issue #1 validates the sender — it
    // must not break the legitimate renderer). Its forged twin on the same
    // channel must be refused, which is the half that is RED today.
    const trusted = await outcomeOf('status:get', TRUSTED_EVENT);
    expect(
      trusted,
      "a frame on the app's own dev URL must execute the handler logic (issue #1 allows the " +
        'app\u2019s own document)',
    ).toEqual({
      kind: 'resolved',
      value: { state: 'stopped', lastError: null, socksPort: DEFAULT_SOCKS_PORT },
    });

    const forgedTwin = await outcomeOf('status:get', FORGED_EVENT);
    expect(
      forgedTwin,
      `the forged twin on the same channel must be refused with ${UNTRUSTED_SENDER_ERROR} ` +
        '(issue #1 / S3-1)',
    ).toEqual({ kind: 'rejected', errorName: UNTRUSTED_SENDER_ERROR });
  });
});

describe('deny-by-default permission request handler (issue #1, S3-2)', () => {
  it('ipc.permissions.requestHandlerRegisteredAfterReadyDeniesAll', async () => {
    // Let the module's app.whenReady() path run before asserting — Electron
    // exposes `session` only after the ready event, so the handler must be
    // registered inside that path (the mock records at which moment it was).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const permissionHandler = probe.permissionHandler;
    expect(
      permissionHandler,
      'S3-2: src/main/index.ts must register session.defaultSession.setPermissionRequestHandler ' +
        'with deny-by-default semantics (issue #1 second half) — none was registered',
    ).toBeTypeOf('function');
    if (permissionHandler === null) throw new Error('unreachable: assertion above failed');

    expect(
      probe.permissionHandlerRegisteredAfterReady,
      'the permission handler must be registered inside the app.whenReady() path — ' +
        'Electron exposes session only after the ready event',
    ).toBe(true);

    // Deny BY DEFAULT: every requested permission is refused until an
    // allowlist lands with the first feature that needs it (S3-2).
    for (const permission of [
      'clipboard-read',
      'media',
      'fullscreen',
      'geolocation',
      'notifications',
    ]) {
      const answer = vi.fn();
      permissionHandler({}, permission, answer);
      expect(
        answer,
        `permission '${permission}' must be answered exactly once, and with deny (false) — ` +
          'the default is deny, not the Electron allow-by-default',
      ).toHaveBeenCalledTimes(1);
      expect(answer).toHaveBeenCalledWith(false);
    }
  });
});

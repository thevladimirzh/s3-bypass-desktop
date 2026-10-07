/**
 * M1-26b (RED) — issue #5 / M1-10 S4-6 (S5-11 in security-m1-25.md, still
 * open): the `profile:import-dialog` handler has no in-flight dedupe — a
 * second renderer invoke while the first native picker is open stacks a
 * second modal dialog. Verified open by docs/qa/security-m1-26b.md §3
 * (`dialog.showOpenDialog` in src/main/index.ts has no guard; M1-25's
 * freshest map records it as "no dialog dedupe/rate limit (S4-6 open)").
 *
 * Test plan ID: TC-01-42 — docs/qa/m1-test-plan.md §1, allocated in §14
 * DV-34. Sibling guards stay GREEN: tests/unit/profile-reimport.test.ts
 * (M1-12/M1-13 picker → validate → confirm flow), tests/unit/ipc-sender-
 * guard.test.ts + ipc-guard-contract.test.ts (assertTrustedSender FIRST).
 *
 * Spec sources: docs/qa/security-m1-10.md S4-6 ("dedupe dialog opens and
 * throttle expensive handlers" — only the dedupe is a documented must;
 * throttling of decrypt/redact is NOT pinned here, it was delivered as
 * batching/caps in M1-26); docs/qa/security-m1-26b.md §3 (disposition);
 * docs/analysis/data-flows.md §4.2 (payload row); docs/qa/strategy.md §5.1
 * (RED contract), §5.2 (no invented behavior — the refusal arm below is
 * QA-declared on the M1-13 `declined` precedent).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26b-GREEN (header-contract style, DV-09/DV-34; the
 * developer adapts src, never these tests):
 *
 * (a) §4.2 union extension — `ProfileImportResult` (src/shared/ipc.ts) gains
 *     a FOURTH non-error arm `{ ok: false, reason: 'busy' }`: an in-flight
 *     collision is a refusal, not an NFR-5 failure, so — exactly like
 *     `cancelled`/`declined` (M1-13 precedent, DV-18) — NO `E-*` code is
 *     invented (DV-19) and no triple is carried. The renderer needs no
 *     change (App.tsx only branches on `ok` / `'error' in result`); the
 *     `data-flows.md` §4.2 payload row must gain the same arm (its
 *     still-missing `declined` arm rides the S5-16 doc-drift bundle).
 *
 * (b) handler order in `profile:import-dialog`: `assertTrustedSender(event)`
 *     stays the FIRST statement (TC-IPC-10 + the forged control below), THEN
 *     a module-level in-flight flag: if a picker is already open → return
 *     `{ ok: false, reason: 'busy' }` WITHOUT touching `dialog.showOpenDialog`;
 *     otherwise set the flag, open the picker, and clear it in `finally`
 *     when the dialog settles — so the next invoke re-arms.
 * ─────────────────────────────────────────────────────────────────────────────
 */
// Side-effect import: registers the §4.2 handlers into the probe above
// (profile-reimport precedent — vi.mock hoisting makes the mocks active
// before this module evaluates).
import '../../src/main/index';

import { dialog } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      // test no-op: navigation is pinned by packaged-env-guard.test.ts
    }

    loadFile(): void {
      // test no-op: navigation is pinned by packaged-env-guard.test.ts
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

/** The store is never written from this suite — the first dialog always cancels. */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => null),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/** The dev renderer URL the app itself loads (set in `vi.hoisted` above). */
const DEV_URL = 'http://localhost:5173/';
/** The refusal identity pinned since issue #1 (DV-19: name only, no E-*). */
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

type HandlerOutcome =
  | { readonly kind: 'resolved'; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly errorName: string };

/**
 * Invokes the captured `profile:import-dialog` handler with `event`,
 * recording whether it resolved or rejected (and with which error name) —
 * Electron converts a handler throw into an invoke rejection, so this
 * mirrors `ipcRenderer.invoke` semantics faithfully (profile-reimport
 * precedent).
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
    return { kind: 'rejected', errorName: error instanceof Error ? error.name : 'not-an-Error' };
  }
}

type DialogAnswer = { readonly canceled: boolean; readonly filePaths: readonly string[] };

/** First picker of a test never resolves on its own — the test settles it. */
let firstDialog: Promise<DialogAnswer>;
let settleFirstDialog: (answer: DialogAnswer) => void;
/** How many times the native picker was actually opened. */
let dialogOpens: number;

/**
 * Structural view of a vitest mock's `mockImplementation` — Electron's
 * overloaded `dialog.*` signatures make `vi.mocked(...)` parameter types
 * unusable for swapping the implementation (profile-reimport precedent).
 */
interface MockImplementationRegistrar {
  mockImplementation(implementation: (...args: unknown[]) => unknown): void;
}

function showOpenDialogMock(): MockImplementationRegistrar {
  return dialog.showOpenDialog as unknown as MockImplementationRegistrar;
}

beforeEach(() => {
  vi.clearAllMocks();
  dialogOpens = 0;
  firstDialog = new Promise<DialogAnswer>((resolve) => {
    settleFirstDialog = resolve;
  });
  showOpenDialogMock().mockImplementation(() => {
    dialogOpens += 1;
    // Call 1 hangs until the test settles it; every later open (a stacked
    // dialog today, the re-armed fresh open on GREEN) answers "cancelled".
    return dialogOpens === 1 ? firstDialog : Promise.resolve({ canceled: true, filePaths: [] });
  });
});

afterEach(() => {
  // Release a still-pending first picker so no handler outlives the test
  // (settling twice is a no-op).
  settleFirstDialog({ canceled: true, filePaths: [] });
});

describe('import dialog dedupe — one native picker at a time (issue #5 S4-6, M1-10) — M1-26b', () => {
  it('profileImport.dialog.secondInvokeWhilePickerOpenRefusesBusyAndRearmsAfterSettle', async () => {
    // TC-01-42 — discriminating assertion is the `busy` refusal below.
    // Precondition (green today): the first invoke opens exactly one picker
    // and hangs on it — the native modal that must never be stacked.
    const first = importOutcome(TRUSTED_EVENT);
    expect(dialogOpens, 'precondition: the first invoke opened the native picker').toBe(1);

    // Control (green today and after the fix): the sender guard stays the
    // FIRST statement — a forged frame is refused before any dedupe logic.
    const forged = await importOutcome(FORGED_EVENT);
    expect(
      forged,
      'guard-first (issue #1 / TC-IPC-10): a forged sender must not even reach the ' +
        'in-flight check — UntrustedSenderError, not a busy refusal',
    ).toEqual({ kind: 'rejected', errorName: UNTRUSTED_SENDER_ERROR });

    // RED today: no in-flight flag exists, so invoke #2 opens a SECOND
    // native dialog (dialogOpens would reach 2) and answers 'cancelled'.
    const second = await importOutcome(TRUSTED_EVENT);
    expect(
      second,
      'M1-26b/TC-01-42 (issue #5 S4-6): a second invoke while the picker is open must ' +
        'answer the non-error { ok:false, reason:"busy" } arm (DV-19: no E-* code; ' +
        'security-m1-26b.md §3) — today it stacks a second modal and reports a spurious ' +
        "'cancelled'",
    ).toEqual({ kind: 'resolved', value: { ok: false, reason: 'busy' } });
    expect(
      dialogOpens,
      'the busy refusal must come WITHOUT touching dialog.showOpenDialog — exactly one ' +
        'native picker may ever be open (issue #5 S4-6 fix text: dedupe dialog opens)',
    ).toBe(1);

    // Controls: the pending first dialog keeps its normal outcome, and the
    // in-flight flag clears when it settles so the next invoke re-arms.
    settleFirstDialog({ canceled: true, filePaths: [] });
    const firstOutcome = await first;
    expect(
      firstOutcome,
      'control: the first invoke resolves normally (a busy twin changes nothing for it)',
    ).toEqual({ kind: 'resolved', value: { ok: false, reason: 'cancelled' } });

    const third = await importOutcome(TRUSTED_EVENT);
    expect(
      third,
      'control: after the picker settles, a fresh invoke opens the picker again and ' +
        'answers its own outcome (flag cleared in finally — contract (b))',
    ).toEqual({ kind: 'resolved', value: { ok: false, reason: 'cancelled' } });
    expect(
      dialogOpens,
      're-arm pin: the settled dialog counts as the second (legit) open, never a third ' +
        'stacked one',
    ).toBe(2);
  }, 15_000);
});

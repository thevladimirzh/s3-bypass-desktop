/**
 * M1-26 (RED) — S5-5 (GitHub issue #11): the profile import must check the
 * picked file's SIZE with `statSync` BEFORE `readFileSync`, answering
 * E-VAL-002 without ever reading a > 1 MiB file. Today the pipeline is
 * dialog → readFileSync (the whole file into main) → in-memory gate
 * (index.ts:648-658; profile-validator.ts:246-251 measures the
 * already-read string; no `statSync` exists anywhere in the import flow).
 *
 * Test plan IDs: TC-01-40 (behavioral half), TC-01-41 (structural half) —
 * docs/qa/m1-test-plan.md §1, allocated in §14 DV-32. The in-memory size
 * gate itself stays GREEN in tests/unit/profile-validator.test.ts (BR-V-02).
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-5 (finding + fix:
 * "After a path is picked: statSync(path); if size > MAX_PROFILE_BYTES
 * (or stat fails) return E-VAL-002/E-IO-001 WITHOUT reading. Keep the
 * existing in-memory gate as defense in depth. Test: sparse file … named
 * .json → E-VAL-002, and the read never happens"); docs/analysis/
 * requirements.md FR-02 ("rejected before parsing … must not freeze") +
 * BR-V-02 ("File size <= 1 048 576 bytes (checked before read/parse)");
 * docs/analysis/data-flows.md flow (a) step 1 ("stat(): size > 1 048 576 B
 * → E-VAL-002"); docs/analysis/errors.md §1 (E-VAL-002 = the documented
 * size refusal, DV-19 — no code may be invented); docs/product/stories/
 * US-01-profile-import.md (import surface).
 *
 * Layer: L2 — the REAL `src/main/index.ts` `profile:import-dialog` handler
 * over the house mocked-electron harness (precedent
 * tests/unit/profile-reimport.test.ts), picking a REAL synthetic file on
 * disk (strategy §1: tmpdir scratch, no network, no fixtures mutated).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 * A) TC-01-40 behavioral (FR-02/BR-V-02/data-flows (a) step 1): after the
 *    picker hands over `path`, the handler `statSync`es it and, when the
 *    size exceeds 1 048 576 bytes, resolves `{ ok:false, error:
 *    {code:'E-VAL-002'} }` WITHOUT `readFileSync` — the read is proven to
 *    be skipped by making the file UNREADABLE (chmod 000) on top of being
 *    oversized: today the read is attempted first, fails with EACCES, and
 *    the handler answers E-IO-001 instead. A stat failure keeps today's
 *    E-IO-001 (FR-06). The in-memory gate stays as defense in depth.
 *    Positive control in the same `it`: the §9.1 canary config still
 *    imports `{ok:true, summary.bucket:'example-bucket'}` (the fix must not
 *    break the happy path — precondition of every import test today).
 *
 * B) TC-01-41 structural (the report's fix text is literal: "After a path is
 *    picked: statSync(path)"): inside the `profile:import-dialog` callback
 *    body, a `statSync(` call appears BEFORE the `readFileSync(` call —
 *    source scan in the TC-06-15/TC-01-15/TC-IPC-10 style. Why structural
 *    as well: the behavioral half cannot distinguish "stat before read" from
 *    "read then stat" for a READABLE oversized file, and the report pins the
 *    order explicitly. An implementation that routes the stat through a
 *    helper outside the handler body needs an upstream spec note first.
 *
 * RED status: ASSERTION RED, both `it`s — (TC-01-40) today the oversized
 * unreadable file is READ first and fails with E-IO-001 (FILE_READ_FAILED,
 * index.ts:650-653), never reaching a stat; (TC-01-41) no `statSync(`
 * occurs in the handler. Never a mock-setup error: the harness fully
 * supports today's dialog→read→validate flow (profile-reimport.test.ts is
 * GREEN on the same rig), and the chmod-000 precondition fails LOUDLY (not
 * silently green) if the suite runs as root, where unreadability cannot be
 * observed. Strategy §5.2 — do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import {
  chmodSync,
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dialog } from 'electron';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadProfile, saveProfile, storedProfileModifiedAt } from '../../src/main/secret-store';
import { stripComments } from '../helpers/log-collector-stub';

/**
 * Observes what the mocked Electron APIs see: the captured
 * `ipcMain.handle` registrations. The dev URL is pinned in `vi.hoisted`,
 * which runs before every import — `src/main/index.ts` and
 * `src/main/ipc-guard.ts` read exactly this value when they compute the
 * allowed sender set (technique: ipc-sender-guard.test.ts).
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
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
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

/** Store surface mocked so a rejected import proves "never written" (§1). */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => null),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/** The dev renderer URL the app itself loads (set in `vi.hoisted` above). */
const DEV_URL = 'http://localhost:5173/';
/** §4.2 channel this contract exercises. */
const IMPORT_CHANNEL = 'profile:import-dialog';
/** A frame on exactly the app's own dev document — the guard must allow it. */
const TRUSTED_EVENT = {
  senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin },
};

/** BR-V-02 ceiling in bytes (profile-validator.ts:31 — not exported, DV-09). */
const MAX_PROFILE_BYTES = 1_048_576;
/** Sparse oversized payload: 2 MiB > BR-V-02's 1 MiB, created by ftruncate (cheap). */
const HUGE_SIZE_BYTES = 2 * MAX_PROFILE_BYTES;

/** The canary §9.1 fixture — the positive control of TC-01-40. */
const VALID_CONFIG_PATH = fileURLToPath(
  new URL('../fixtures/configs/valid-client-config.json', import.meta.url),
);

/** Scratch dirs for the synthetic oversized file — cleaned up after all. */
const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Exactly what the picker hands over on the next run. */
let currentPick: { canceled: boolean; filePaths: string[] } = {
  canceled: true,
  filePaths: [],
};

/**
 * Structural view of a vitest mock's `mockImplementation` — Electron's
 * overloaded `dialog.*` signatures make `vi.mocked(...)` parameter types
 * unusable for capturing the picker answer (profile-reimport precedent).
 */
interface MockImplementationRegistrar {
  mockImplementation(implementation: (...args: unknown[]) => unknown): void;
}

function showOpenDialogMock(): MockImplementationRegistrar {
  return dialog.showOpenDialog as unknown as MockImplementationRegistrar;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPick = { canceled: true, filePaths: [] };
  showOpenDialogMock().mockImplementation(async () => ({
    canceled: currentPick.canceled,
    filePaths: [...currentPick.filePaths],
  }));
  vi.mocked(loadProfile).mockImplementation(() => null);
  vi.mocked(storedProfileModifiedAt).mockImplementation(() => null);
  vi.mocked(saveProfile).mockImplementation(() => undefined);
});

/** Points the native picker at `path` (a real synthetic file, strategy §1). */
function pick(path: string): void {
  currentPick = { canceled: false, filePaths: [path] };
}

type HandlerOutcome =
  | { readonly kind: 'resolved'; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly errorName: string };

/**
 * Invokes the captured `profile:import-dialog` handler with `event`,
 * mirroring `ipcRenderer.invoke` semantics (Electron turns a handler throw
 * into an invoke rejection).
 */
async function importOutcome(event: unknown): Promise<HandlerOutcome> {
  const registration = probe.registrations.find((entry) => entry.channel === IMPORT_CHANNEL);
  if (registration === undefined) {
    throw new Error(
      `no ipcMain.handle registration captured for '${IMPORT_CHANNEL}' — src/main/index.ts ` +
        'must register the §4.2 invoke channel',
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

/** Resolves the handler payload for a trusted sender, or fails loudly. */
async function runImport(event: unknown): Promise<unknown> {
  const outcome = await importOutcome(event);
  if (outcome.kind === 'rejected') {
    throw new Error(
      `profile:import-dialog rejected with ${outcome.errorName} — every import outcome must ` +
        'resolve to a §4.2 payload, never raise (FR-01 precedent)',
    );
  }
  return outcome.value;
}

describe('profile import — stat-before-read size gate (S5-5, issue #11)', () => {
  it('profileImport.sizeGate.oversizedUnreadableFileAnswersVal002WithoutReading', async () => {
    // TC-01-40 / FR-02 + BR-V-02 + data-flows (a) step 1. Synthetic file:
    // sparse 2 MiB (ftruncate) AND unreadable (chmod 000) — the unreadable
    // half is what makes "the read never happens" OBSERVABLE: a read is
    // attempted → EACCES → today's E-IO-001; a stat-first gate never reads
    // and answers E-VAL-002 from metadata alone.
    const dir = mkdtempSync(join(tmpdir(), 's3bypass-import-size-'));
    scratchDirs.push(dir);
    const hugePath = join(dir, 'synthetic-huge-profile.json');
    const fd = openSync(hugePath, 'w');
    try {
      ftruncateSync(fd, HUGE_SIZE_BYTES);
    } finally {
      closeSync(fd);
    }
    chmodSync(hugePath, 0o000);

    // Precondition (LOUD, never the RED reason): the file must really be
    // unreadable for the pin above to discriminate. If this fails the suite
    // runs as root (chmod 000 does not bite root) or the platform ignored
    // the mode — fix the environment, do not weaken the assertions below.
    expect(
      () => readFileSync(hugePath),
      `precondition: ${hugePath} must be UNREADABLE (chmod 000) — this test discriminates ` +
        'stat-before-read only when a read attempt would fail; run the suite as a non-root ' +
        'user (root can read chmod-000 files, so the pin could not distinguish the flows)',
    ).toThrow();

    // The discriminating pin: stat-first answers E-VAL-002 from METADATA
    // without touching the file's bytes. Today the handler reads first
    // (index.ts:650), the read fails EACCES, and FILE_READ_FAILED (E-IO-001,
    // index.ts:286) comes back instead — the FR-02 breach itself.
    pick(hugePath);
    const result = await runImport(TRUSTED_EVENT);
    expect(
      result,
      'S5-5/TC-01-40 (issue #11): a picked file of 2 MiB (> BR-V-02 1 048 576 B) must be ' +
        'rejected with the documented size refusal {ok:false, error:{code:E-VAL-002}} ' +
        'WITHOUT being read (FR-02 "rejected before parsing … must not freeze", ' +
        'data-flows (a) step 1 "stat() → E-VAL-002") — today index.ts:648-658 reads the ' +
        'whole file first, so this unreadable file answers the READ error instead ' +
        '(E-IO-001 = read attempted before the size gate)',
    ).toMatchObject({ ok: false, error: { code: 'E-VAL-002' } });

    // Rejected before write (errors.md §1: reject before persist) — runs on
    // GREEN; keeps the fix from answering E-VAL-002 after a partial import.
    expect(
      vi.mocked(saveProfile),
      'a size-rejected file must never be persisted (data-flows (a): the write is step 8, ' +
        'behind every gate)',
    ).not.toHaveBeenCalled();

    // Positive control: the canary config still imports normally — the stat
    // gate must not break the happy path (GREEN today, pinned for GREEN).
    pick(VALID_CONFIG_PATH);
    const control = await runImport(TRUSTED_EVENT);
    expect(
      control,
      'control: the §9.1 canary config must still import {ok:true, summary.bucket ' +
        "'example-bucket'} — the size gate rejects ONLY files over BR-V-02's 1 048 576 bytes",
    ).toMatchObject({ ok: true, summary: { bucket: 'example-bucket' } });
  }, 15_000);
});

describe('profile import — statSync before readFileSync in the handler (S5-5, issue #11)', () => {
  it('index.source.statSyncInsideImportHandlerBeforeReadFileSync', () => {
    // TC-01-41 structural (report fix text: "After a path is picked:
    // statSync(path)"). The behavioral half cannot observe the ORDER of
    // stat/read for a readable file; the source scan pins it literally
    // (precedent: TC-06-15 deps scan, TC-01-15, TC-IPC-10).
    const indexPath = fileURLToPath(new URL('../../src/main/index.ts', import.meta.url));
    const source = stripComments(readFileSync(indexPath, 'utf8'));

    // The handler's source chunk: from its `ipcMain.handle(` to the next one
    // (or end of file) — enough to locate the statements of this callback.
    const handleCall = 'ipcMain.handle(';
    const chunks: string[] = [];
    let rest = source;
    for (;;) {
      const start = rest.indexOf(handleCall);
      if (start === -1) break;
      chunks.push(rest.slice(start));
      rest = rest.slice(start + handleCall.length);
    }
    const chunk = chunks.find((candidate) => candidate.includes(`'${IMPORT_CHANNEL}'`));
    if (chunk === undefined) {
      throw new Error(
        `src/main/index.ts must register ipcMain.handle('${IMPORT_CHANNEL}', …) — the ` +
          'structural scan needs the handler body (captured chunks: ' +
          `${chunks.length}, channels declared: ${probe.registrations.length})`,
      );
    }

    // Precondition (GREEN today): the handler reads the picked file here.
    const readAt = /(?<![A-Za-z])readFileSync\s*\(/.exec(chunk)?.index ?? -1;
    expect(
      readAt,
      `precondition: the '${IMPORT_CHANNEL}' handler must contain readFileSync( — the ` +
        'FR-06 read belongs in this callback (index.ts:650, GREEN today)',
    ).toBeGreaterThan(-1);

    // The RED pin: a statSync call in the SAME callback, before the read.
    const statAt = /(?<![A-Za-z])statSync\s*\(/.exec(chunk)?.index ?? -1;
    expect(
      statAt,
      'S5-5/TC-01-41 (issue #11): the profile:import-dialog handler must statSync(path) ' +
        'AFTER the picker hands over the path and BEFORE readFileSync (report fix: ' +
        '"After a path is picked: statSync(path); if size > MAX_PROFILE_BYTES … ' +
        'WITHOUT reading"; FR-02/BR-V-02/data-flows (a) step 1) — no statSync( occurs in ' +
        'the handler today, so every oversized file is fully read first (index.ts:648-653)',
    ).toBeGreaterThan(-1);

    expect(
      statAt,
      'the stat must come BEFORE the read in the handler body — measuring the already-read ' +
        'string is the exact S5-5 defect (profile-validator.ts:246-251 gate stays as ' +
        'defense in depth, never as the first gate)',
    ).toBeLessThan(readAt);
  });
});

/**
 * M1-26 (RED) — S5-4 (GitHub issue #10): a PACKAGED build must not honor
 * `ELECTRON_RENDERER_URL` in the IPC-guard sender allowlist nor in the
 * `will-navigate`/`will-redirect` navigation allowlist. Only the LOAD path
 * (`index.ts:271`) has the `!app.isPackaged` gate today (M0-19 S4-3); the
 * other two consumers of the env var still widen their allowlists in
 * production (security-m1-25.md §2 S5-4).
 *
 * Test plan IDs: TC-IPC-12 (guard half), TC-IPC-13 (navigation half) —
 * docs/qa/m1-test-plan.md §7, allocated in §14 DV-32. Sibling guards stay
 * GREEN: tests/unit/ipc-sender-guard.test.ts (dev-mode allowlist, issue #1),
 * tests/unit/ipc-guard-contract.test.ts (guard placement + packaged document).
 *
 * M1-26b extension (RED) — issue #3 / M1-10 S3-3, **TC-IPC-14** (§14 DV-34):
 * the navigation suite above is the natural home for the still-open exact-path
 * pin — contract B's "the `file://` arm is UNCHANGED" is amended ADDITIVELY:
 * the blanket `url.startsWith('file://')` must narrow to the EXACT app
 * document (`PACKAGED_DOCUMENT_URL` below), so an attacker-controlled local
 * HTML file may no longer navigate the window (security-m1-26b.md §1; no
 * existing assertion changes — TC-IPC-13's packaged-document arm must stay
 * GREEN).
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-4 (finding + fix text:
 * "Compute the guard's allowed set from the packaged document alone when
 * app.isPackaged (same condition as index.ts:271); only add DEV_URL when
 * !app.isPackaged. Gate the devUrl arm of isAllowedNavigation with
 * !app.isPackaged. Regression test: harness with isPackaged=true +
 * ELECTRON_RENDERER_URL set → assertTrustedSender refuses that URL and
 * will-navigate would prevent it"); docs/qa/security-m0-19.md S4-3 (the
 * load-path gate this aligns with); docs/qa/security-m1-10.md S3-1/S3-3
 * (sender guard + navigation twin); docs/analysis/data-flows.md §4.2.
 *
 * Layer: L2 — the harness runs the REAL `src/main/index.ts` and the REAL
 * `src/main/ipc-guard.ts` against a mocked `electron` whose `app.isPackaged`
 * is `true` (the packaged scenario production ships), with the env var set
 * before module load (the poisoned-packaged-run scenario of S5-4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit):
 *
 * A) `src/main/ipc-guard.ts`: when `app.isPackaged` is true the allowed
 *    sender set is EXACTLY the packaged document
 *    (`pathToFileURL(join(__dirname, '../renderer/index.html'))`) —
 *    `process.env.ELECTRON_RENDERER_URL` is ignored entirely; when
 *    `!app.isPackaged` the dev URL joins the set as today (issue #1 /
 *    ipc-sender-guard.test.ts must stay GREEN). Refusal identity unchanged:
 *    throw `Error` named `UntrustedSenderError` (DV-19: no E-* code).
 *
 * B) `src/main/index.ts` `isAllowedNavigation`: the `url === devUrl` arm is
 *    gated with `!app.isPackaged`; the `file://` arm is UNCHANGED (the
 *    packaged document keeps loading) and remote URLs stay denied (M0-19).
 *
 * C) Controls (green today and after the fix): a PACKAGED-document sender is
 *    trusted; a foreign-origin sender is refused; navigating to the packaged
 *    document is allowed; navigating to `https://…` is denied.
 *
 * RED status: ASSERTION RED, both `it`s — today `ALLOWED_SENDER_URLS`
 * includes DEV_URL unconditionally (ipc-guard.ts:31-36) and
 * `isAllowedNavigation` allows `url === devUrl` while packaged
 * (index.ts:234-236), so the env-URL sender resolves and the env-URL
 * navigation is permitted. Never a mock-setup error: window creation, the
 * navigation registrations and the packaged-document control all work
 * today. Strategy §5.2 — do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/main/index';

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { assertTrustedSender } from '../../src/main/ipc-guard';

/** What the fake BrowserWindow records: per-event listeners, incl. webContents. */
interface RecordedWindow {
  readonly handlers: Map<string, Array<(...args: unknown[]) => void>>;
  readonly webContents: { readonly handlers: Map<string, Array<(...args: unknown[]) => void>> };
}

/**
 * Observes the mocked Electron APIs. The dev URL is pinned in `vi.hoisted`
 * (runs before every import — `ipc-guard.ts` reads it at module load,
 * index.ts reads it inside createWindow) and `app.isPackaged` is `true`:
 * THE packaged scenario of S5-4, where an inherited env var must have no
 * effect on either allowlist.
 */
const probe = vi.hoisted(() => {
  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';
  return {
    windows: [] as RecordedWindow[],
    quitCount: 0,
  };
});

vi.mock('electron', () => {
  class FakeWebContents {
    readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

    setWindowOpenHandler(): void {
      // test no-op: window-open policy is pinned by other suites
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      const listeners = this.handlers.get(event) ?? [];
      listeners.push(handler);
      this.handlers.set(event, listeners);
    }

    send(): void {
      // test no-op: status/log pushes are pinned by other suites
    }
  }

  class FakeBrowserWindow {
    readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    readonly events: string[] = [];
    readonly webContents = new FakeWebContents();

    constructor(_options?: unknown) {
      probe.windows.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      const listeners = this.handlers.get(event) ?? [];
      listeners.push(handler);
      this.handlers.set(event, listeners);
    }

    addListener(event: string, handler: (...args: unknown[]) => void): void {
      this.on(event, handler);
    }

    loadURL(): void {
      // test no-op: with isPackaged=true the real window must loadFile anyway
    }

    loadFile(): void {
      // test no-op: packaged load path (the correctly gated branch, S4-3)
    }

    hide(): void {
      // test no-op: close-to-tray is pinned by other suites
    }

    show(): void {
      // test no-op
    }

    focus(): void {
      // test no-op
    }

    restore(): void {
      // test no-op
    }

    isMinimized(): boolean {
      return false;
    }

    static getAllWindows(): FakeBrowserWindow[] {
      return probe.windows as unknown as FakeBrowserWindow[];
    }
  }

  class FakeTray {
    constructor(_image?: unknown) {
      // test no-op: tray creation is pinned by other suites
    }

    setToolTip(): void {
      // test no-op
    }

    setContextMenu(): void {
      // test no-op: syncTray builds the model — pinned elsewhere
    }
  }

  const recordAppEvent = (): void => {
    // app.on(...) registrations are out of scope for this suite
  };

  return {
    app: {
      // S5-4: THE packaged scenario — every consumer must ignore the env var.
      isPackaged: true,
      whenReady: () => Promise.resolve(),
      on: recordAppEvent,
      addListener: recordAppEvent,
      quit: () => {
        probe.quitCount += 1;
      },
      getPath: () => '/nonexistent-userdata-for-tests',
    },
    BrowserWindow: FakeBrowserWindow,
    Tray: FakeTray,
    nativeImage: { createFromDataURL: (_data: string): unknown => ({}) },
    Menu: { buildFromTemplate: (template: unknown): unknown => ({ template }) },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
      showMessageBox: vi.fn(async () => ({ response: 1, checkboxChecked: false })),
    },
    ipcMain: {
      handle: (_channel: string, _handler: (...args: unknown[]) => unknown) => {
        // registrations are pinned by ipc-sender-guard.test.ts (TC-IPC-06)
      },
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (_handler: unknown) => undefined,
      },
    },
    shell: { openExternal: (_url: unknown) => undefined },
  };
});

/** The store never runs from this suite (§1 — synthetic-only). */
vi.mock('../../src/main/secret-store', () => ({
  deleteStoredProfile: vi.fn(),
  loadProfile: vi.fn(() => null),
  saveProfile: vi.fn(),
  storedProfileModifiedAt: vi.fn(() => null),
}));

/** No `networksetup`/`gsettings` command may ever run from this suite (§1). */
vi.mock('../../src/main/system-proxy', () => ({
  setSystemProxy: vi.fn(async () => ({ ok: true })),
  restoreSystemProxy: vi.fn(async () => ({ ok: true })),
}));

/** The poisoned env var — trusted today even while packaged (S5-4). */
const DEV_URL = 'http://localhost:5173/';

/** The refusal identity pinned since issue #1 (DV-19: name only, no E-*). */
const UNTRUSTED_SENDER_ERROR = 'UntrustedSenderError';

/** `src/main/` as ipc-guard resolves `__dirname` — same as the guard module. */
const SRC_MAIN_DIR = fileURLToPath(new URL('../../src/main/', import.meta.url));

/** The packaged document createWindow loads (index.ts:274) — allowed URL. */
const PACKAGED_DOCUMENT_URL = pathToFileURL(
  join(SRC_MAIN_DIR, '../renderer/index.html'),
).toString();

/** Outcome of one direct `assertTrustedSender(event)` call. */
type GuardOutcome =
  { readonly threw: false } | { readonly threw: true; readonly errorName: string };

function guardOutcome(event: unknown): GuardOutcome {
  const guard = assertTrustedSender as unknown as (candidate: unknown) => void;
  try {
    guard(event);
    return { threw: false };
  } catch (error) {
    if (!(error instanceof Error)) return { threw: true, errorName: 'not-an-Error' };
    return { threw: true, errorName: error.name };
  }
}

/** Lets the `app.whenReady()` path (tray + createWindow) run to completion. */
async function flushAsync(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe('packaged build ignores ELECTRON_RENDERER_URL — IPC-guard (S5-4, issue #10)', () => {
  it('ipc.guard.packagedEnvUrlSenderRefusedPackagedDocumentTrusted', () => {
    // TC-IPC-12, contract A. Discriminating first assertion: with
    // isPackaged=true and the env var set, an env-URL sender must be
    // REFUSED. Today ipc-guard.ts:31-36 adds DEV_URL to the allowed set
    // unconditionally, so the poisoned packaged run widens the issue-#1
    // guard to an attacker-controlled document.
    expect(
      guardOutcome({ senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin } }),
      'S5-4/TC-IPC-12 (issue #10): app.isPackaged=true + ELECTRON_RENDERER_URL set → ' +
        'assertTrustedSender must refuse the env-URL sender (allowed set = packaged ' +
        'document ALONE, same !app.isPackaged gate as index.ts:271; DEV_URL joins only ' +
        'when !app.isPackaged) — today ipc-guard.ts:31-36 honors the env var in a ' +
        'packaged run, re-opening the S3-1/S4-3 bypass class through the crown-jewel ' +
        `control (expected ${UNTRUSTED_SENDER_ERROR}, got the guard outcome above)`,
    ).toEqual({ threw: true, errorName: UNTRUSTED_SENDER_ERROR });

    // Contract C controls — green today and after the fix.
    expect(
      guardOutcome({ senderFrame: { url: PACKAGED_DOCUMENT_URL, origin: 'file://' } }),
      'the packaged app document must stay trusted while packaged (the packaged load ' +
        `path keeps working) — expected ${PACKAGED_DOCUMENT_URL}`,
    ).toEqual({ threw: false });

    expect(
      guardOutcome({
        senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' },
      }),
      `a foreign-origin sender must stay refused while packaged (${UNTRUSTED_SENDER_ERROR})`,
    ).toEqual({ threw: true, errorName: UNTRUSTED_SENDER_ERROR });
  });
});

describe('packaged build ignores ELECTRON_RENDERER_URL — navigation allowlist (S5-4, issue #10)', () => {
  it('index.navigation.packagedWindowDeniesEnvUrlAllowsPackagedDocument', async () => {
    // TC-IPC-13, contract B. Precondition: the app.whenReady path created a
    // window (works today — GREEN precondition, never the RED reason).
    await flushAsync();
    expect(
      probe.windows.length,
      'precondition: src/main/index.ts createWindow must run in the app.whenReady path ' +
        '(index-native-wiring.test.ts pins the same — GREEN today)',
    ).toBeGreaterThan(0);
    const window = probe.windows[0] as RecordedWindow;

    const handlerFor = (event: string): ((...args: unknown[]) => void) => {
      const listeners = window.webContents.handlers.get(event) ?? [];
      const handler = listeners.at(-1);
      if (handler === undefined) {
        throw new Error(
          `no webContents.on('${event}') registration captured from src/main/index.ts — ` +
            'the navigation guard (index.ts:237-242) must register it (M0-19, GREEN today)',
        );
      }
      return handler;
    };

    // One verdict per (handler, url): 'allowed' when preventDefault was NOT
    // called, 'denied' otherwise. Every non-allowed/non-allowed combination
    // the contract pins travels as a self-describing violation string, so
    // today's RED lists EXACTLY the env-URL lines (S5-4) and nothing else.
    const verdict = (event: string, url: string): string => {
      const navEvent = { preventDefault: vi.fn() };
      handlerFor(event)(navEvent, url);
      return navEvent.preventDefault.mock.calls.length > 0 ? 'denied' : 'allowed';
    };

    const violations: string[] = [];
    for (const event of ['will-navigate', 'will-redirect'] as const) {
      const envVerdict = verdict(event, DEV_URL);
      if (envVerdict !== 'denied') {
        violations.push(
          `${event}: packaged window did NOT deny navigation to the env URL ${DEV_URL} — ` +
            'the devUrl arm must be gated with !app.isPackaged (S5-4/issue #10): an env ' +
            'var in a packaged run may navigate the window to an attacker document with ' +
            'the preload attached',
        );
      }

      const packagedVerdict = verdict(event, PACKAGED_DOCUMENT_URL);
      if (packagedVerdict !== 'allowed') {
        violations.push(
          `${event}: packaged window must ALLOW navigation to the packaged document ` +
            `(${PACKAGED_DOCUMENT_URL}) — the file:// arm is unchanged by S5-4`,
        );
      }

      const remoteVerdict = verdict(event, 'https://evil.example/');
      if (remoteVerdict !== 'denied') {
        violations.push(
          `${event}: remote navigation to https://evil.example/ must stay DENIED ` +
            '(M0-19/S3-3 — S5-4 does not widen the allowlist)',
        );
      }
    }

    expect(
      violations,
      'S5-4/TC-IPC-13 (issue #10): packaged navigation policy — env URL denied while ' +
        'packaged, packaged document allowed, remote denied (contract B/C):',
    ).toEqual([]);
  }, 15_000);

  it('index.navigation.foreignFileUrlRefusedExactAppDocumentAllowed', async () => {
    // TC-IPC-14 (M1-26b, issue #3 / M1-10 S3-3 — security-m1-26b.md §1).
    // Discriminating first assertion: a LOCAL attacker-controlled document
    // (downloaded HTML, temp artifact) must be refused on both navigation
    // handlers. Today index.ts's predicate is `url.startsWith('file://') || …`,
    // so any file:// URL is allowed and the 11-member `s3Bypass` bridge stays
    // attached — exactly issue #3's finding, still open at M1-26b.
    await flushAsync();
    expect(
      probe.windows.length,
      'precondition: createWindow ran (app.whenReady path — GREEN today, never the RED reason)',
    ).toBeGreaterThan(0);
    const window = probe.windows[0] as RecordedWindow;

    const handlerFor = (event: string): ((...args: unknown[]) => void) => {
      const handler = (window.webContents.handlers.get(event) ?? []).at(-1);
      if (handler === undefined) {
        throw new Error(`no webContents.on('${event}') registration captured — TC-IPC-13 pins it`);
      }
      return handler;
    };

    const verdict = (event: string, url: string): string => {
      const navEvent = { preventDefault: vi.fn() };
      handlerFor(event)(navEvent, url);
      return navEvent.preventDefault.mock.calls.length > 0 ? 'denied' : 'allowed';
    };

    const FOREIGN_FILE_URL = pathToFileURL('/tmp/s3bypass-attacker-controlled.html').toString();
    const violations: string[] = [];
    for (const event of ['will-navigate', 'will-redirect'] as const) {
      const foreignVerdict = verdict(event, FOREIGN_FILE_URL);
      if (foreignVerdict !== 'denied') {
        violations.push(
          `${event}: navigation to a foreign local file was ALLOWED (${FOREIGN_FILE_URL}) — ` +
            'issue #3 / M1-10 S3-3: isAllowedNavigation must accept ONLY the exact app ' +
            `document and the (!app.isPackaged) dev URL; a local attacker document would ` +
            'keep the s3Bypass bridge attached',
        );
      }

      const exactVerdict = verdict(event, PACKAGED_DOCUMENT_URL);
      if (exactVerdict !== 'allowed') {
        violations.push(
          `${event}: the EXACT app document must stay allowed (${PACKAGED_DOCUMENT_URL}) — ` +
            'narrowing the file:// arm (issue #3 fix) may not break the packaged load path',
        );
      }
    }

    expect(
      violations,
      'M1-26b/TC-IPC-14 (issue #3): navigation allowlist = exact app document + packaged ' +
        'scenario policy — foreign file:// denied, exact document allowed:',
    ).toEqual([]);
  }, 15_000);
});

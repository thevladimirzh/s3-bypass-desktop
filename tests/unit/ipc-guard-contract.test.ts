/**
 * Issue #1 (M1-10 review S3-1) — structural half of the sender-validation
 * contract: the shared guard module and its placement. RED phase.
 *
 * Test plan ID: TC-IPC-10 (two sibling `it`s per the DV-02/DV-03 convention;
 * allocation DV-18 in docs/qa/m1-test-plan.md §14). Behavioral siblings
 * TC-IPC-06..09/TC-IPC-11 live in tests/unit/ipcSenderGuard… —
 * see tests/unit/ipc-sender-guard.test.ts, whose header pins the full
 * contract (module path, signature, allowed URL set, error name).
 * Spec sources: issue #1 ("validate `event.senderFrame` as the FIRST thing
 * in every handler"), docs/qa/security-m1-10.md S3-1 disposition ("shared
 * `assertTrustedSender(event)` first in every handler, using the
 * already-computed allowed origins"), docs/qa/security-m0-19.md standing
 * guidance ("Every new IPC handler must validate event.senderFrame").
 *
 * Why structural: behavior tests observe side effects and refusals, but
 * neither can see WHICH STATEMENT runs first inside a handler, nor that the
 * guard is shared rather than copy-pasted. This file scans the source of
 * `src/main/index.ts` literally, so:
 *   - a handler added later without the guard fails the per-registration
 *     scan (S3-1's "every handler", today and in the future), and
 *   - the guard API itself (`assertTrustedSender`) is pinned as an export of
 *     `src/main/ipc-guard.ts` with the documented behavior — absence RED
 *     until issue #1 lands.
 * Source scanning is an established convention here (TC-07-17, TC-01-15
 * structural siblings); the pinned module/API is QA-declared per DV-09/
 * DV-16 precedent — a deviation requires an upstream spec note first
 * (docs/qa/strategy.md §5.2).
 * RED status: assertion RED (no guard import/call in the source) plus
 * absence RED (`src/main/ipc-guard.ts` does not exist yet — the failure must
 * be exactly that module-not-found, never a typo: the path below is the
 * contract path). Do not weaken, skip, or delete anything here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { IPC_INVOKE_CHANNELS } from '../../src/shared/ipc';

// The future guard reads the same dev URL createWindow loads; pin it before
// the (dynamic) module import below so its allowed-set computation sees it.
process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/';

vi.mock('electron', () => ({
  app: { isPackaged: false },
  session: { defaultSession: {} },
}));

/** The pinned guard module (contract A of tests/unit/ipc-sender-guard.test.ts). */
const GUARD_MODULE = ['..', '..', 'src', 'main', 'ipc-guard'].join('/');

/** `src/main` as this test's sibling — same `__dirname` the guard resolves. */
const SRC_MAIN_DIR = fileURLToPath(new URL('../../src/main/', import.meta.url));

/** The packaged document createWindow loads (index.ts ~:108) — allowed URL. */
const PACKAGED_DOCUMENT_URL = pathToFileURL(
  join(SRC_MAIN_DIR, '../renderer/index.html'),
).toString();

const DEV_URL = 'http://localhost:5173/';
const UNTRUSTED_SENDER_ERROR = 'UntrustedSenderError';

const INDEX_SOURCE = readFileSync(
  fileURLToPath(new URL('../../src/main/index.ts', import.meta.url)),
  'utf8',
);

const HANDLE_CALL = 'ipcMain.handle(';

/**
 * Every `ipcMain.handle(` registration as a chunk reaching to the next one
 * (the last reaches to end of file) — enough to inspect each callback's
 * first statement without a full parser.
 */
function handleChunks(source: string): string[] {
  const chunks: string[] = [];
  let rest = source;
  for (;;) {
    const start = rest.indexOf(HANDLE_CALL);
    if (start === -1) break;
    chunks.push(rest.slice(start));
    rest = rest.slice(start + HANDLE_CALL.length);
  }
  return chunks;
}

/** Skips whitespace plus `//` line and block comments starting at `index`. */
function skipTrivia(text: string, index: number): number {
  let i = index;
  for (;;) {
    while (i < text.length && /\s/.test(text[i] as string)) i += 1;
    if (text.startsWith('//', i)) {
      const newline = text.indexOf('\n', i);
      if (newline === -1) return text.length;
      i = newline + 1;
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return text.length;
      i = end + 2;
      continue;
    }
    return i;
  }
}

/** The channel literal of a chunk — for failure messages only. */
function channelOf(chunk: string): string {
  const match = chunk.slice(HANDLE_CALL.length).match(/^\s*('[^']*'|IPC_PING)/);
  return match?.[0]?.trim() ?? '<unparsed channel>';
}

/**
 * The first statement of the callback body: text after the first `=>`,
 * past `{`, past comments. If the guard is first, this is
 * `assertTrustedSender(`.
 */
function firstStatement(chunk: string): string {
  const arrow = chunk.indexOf('=>');
  if (arrow === -1) return '<no callback arrow found>';
  let i = skipTrivia(chunk, arrow + 2);
  if (chunk[i] !== '{') return '<callback is not a block body>';
  i = skipTrivia(chunk, i + 1);
  return chunk.slice(i, i + 'assertTrustedSender('.length);
}

describe('shared sender guard placement in src/main/index.ts (issue #1, S3-1) — TC-IPC-10', () => {
  it('ipc.guard.sharedAssertFirstStatementOfEveryHandler', () => {
    // One registration per §4.2 invoke channel (M1-07 pin) — the precondition
    // that makes "every handler" below a complete enumeration.
    const chunks = handleChunks(INDEX_SOURCE);
    expect(
      chunks.length,
      `src/main/index.ts must contain exactly one ipcMain.handle per §4.2 invoke channel ` +
        `(captured from source: ${chunks.length}, declared: ${IPC_INVOKE_CHANNELS.length})`,
    ).toBe(IPC_INVOKE_CHANNELS.length);

    const violations: string[] = [];

    if (
      !/import\s*\{[^}]*\bassertTrustedSender\b[^}]*\}\s*from\s*'\.\/ipc-guard'/.test(INDEX_SOURCE)
    ) {
      violations.push(
        "src/main/index.ts does not import { assertTrustedSender } from './ipc-guard' " +
          '(issue #1: a SHARED guard, not per-handler copies)',
      );
    }

    for (const chunk of chunks) {
      const statement = firstStatement(chunk);
      if (statement !== 'assertTrustedSender(') {
        violations.push(
          `handler ${channelOf(chunk)}: first statement is ${JSON.stringify(statement.slice(0, 60))} ` +
            '— issue #1 requires assertTrustedSender(event) FIRST, before any logic, dialog, or store access',
        );
      }
    }

    expect(
      violations,
      'issue #1 / S3-1: every ipcMain.handle callback must begin with assertTrustedSender(event):',
    ).toEqual([]);
  });

  it('ipc.guard.assertTrustedSenderExportedWithDocumentedContract', async () => {
    // Absence RED: the module does not exist until issue #1 lands. The path
    // is built from parts so tsc cannot resolve it statically — the runtime
    // module-not-found is the expected RED, and it names the contract path.
    let guard: Record<string, unknown>;
    try {
      guard = (await import(GUARD_MODULE)) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `issue #1 contract missing: src/main/ipc-guard.ts must exist and export ` +
          'assertTrustedSender(event: IpcMainInvokeEvent): void (docs/qa/security-m1-10.md ' +
          `S3-1). Expected RED until the fix lands — got: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const assertTrustedSender = guard['assertTrustedSender'];
    expect(
      typeof assertTrustedSender,
      'src/main/ipc-guard.ts must export function assertTrustedSender — the shared guard ' +
        'pinned by the contract in tests/unit/ipc-sender-guard.test.ts',
    ).toBe('function');
    if (typeof assertTrustedSender !== 'function')
      throw new Error('unreachable: assertion above failed');
    const call = assertTrustedSender as (event: unknown) => void;

    type GuardOutcome =
      | { readonly threw: false }
      | { readonly threw: true; readonly errorName: string; readonly messageNonEmpty: boolean };

    function outcomeOf(event: unknown): GuardOutcome {
      try {
        call(event);
        return { threw: false };
      } catch (error) {
        if (!(error instanceof Error)) {
          return { threw: true, errorName: 'not-an-Error', messageNonEmpty: false };
        }
        return {
          threw: true,
          errorName: error.name,
          messageNonEmpty: error.message.trim().length > 0,
        };
      }
    }

    const trustedDevFrame = { senderFrame: { url: DEV_URL, origin: new URL(DEV_URL).origin } };
    expect(
      outcomeOf(trustedDevFrame),
      "the app's own dev-frame must pass the guard untouched (issue #1 allows the dev URL)",
    ).toEqual({ threw: false });

    const trustedPackagedFrame = {
      senderFrame: { url: PACKAGED_DOCUMENT_URL, origin: 'file://' },
    };
    expect(
      outcomeOf(trustedPackagedFrame),
      'the packaged app document must pass the guard (issue #1: "dev URL + packaged file path") ' +
        `— expected ${PACKAGED_DOCUMENT_URL}`,
    ).toEqual({ threw: false });

    expect(
      outcomeOf({ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' } }),
      `a forged-origin frame must be refused by throwing an Error named ${UNTRUSTED_SENDER_ERROR} ` +
        'with a non-empty message (DV-19: no errors.md class exists yet, so no E-* code)',
    ).toEqual({ threw: true, errorName: UNTRUSTED_SENDER_ERROR, messageNonEmpty: true });

    expect(
      outcomeOf({}),
      `an absent senderFrame must be refused by throwing an Error named ${UNTRUSTED_SENDER_ERROR}`,
    ).toEqual({ threw: true, errorName: UNTRUSTED_SENDER_ERROR, messageNonEmpty: true });

    expect(
      outcomeOf({ senderFrame: { url: 'file:///tmp/attacker.html', origin: 'null' } }),
      'a foreign file:// document must be refused — the allowed set contains the exact ' +
        'packaged path, not any file:// URL (issue #1; S3-3 covers the navigation twin)',
    ).toEqual({ threw: true, errorName: UNTRUSTED_SENDER_ERROR, messageNonEmpty: true });
  });
});

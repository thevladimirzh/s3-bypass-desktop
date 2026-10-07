/**
 * Issue #1 (M1-10 review S3-1): shared sender validation for every
 * `ipcMain.handle` registration — one guard module, never a per-handler copy.
 *
 * The refusal is deliberately NOT an `AppError` triple (DV-19): only a forged
 * sender can trigger it, it is never user-visible, and `docs/analysis/errors.md`
 * documents no class for it (§0: VAL / IO / CORE / PLAT / STOR). So the thrown
 * `Error` carries a `name` and a non-empty message only — no `E-*` code, and no
 * secret material: Electron turns a handler throw into an invoke rejection the
 * forged caller sees, the trusted renderer never triggers it.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, type IpcMainInvokeEvent } from 'electron';

/**
 * The packaged document `createWindow` loads (`loadFile` in
 * `src/main/index.ts`) — resolved from `src/main/`, which is `__dirname` both
 * in the built `out/main/` output and under the vitest transform of the
 * source tree. The allowed set contains EXACTLY this file URL; a foreign
 * `file://` document is refused (issue #1: "packaged file path").
 */
const PACKAGED_DOCUMENT_URL = pathToFileURL(join(__dirname, '../renderer/index.html')).toString();

/**
 * The dev server document `createWindow` loads (`loadURL`), read once at
 * module load — the tests pin `ELECTRON_RENDERER_URL` before importing main.
 * S5-4 (issue #10): it only ever joins the allowed set in a NON-packaged run,
 * same condition as the `loadURL`/`loadFile` gate in `src/main/index.ts`.
 */
const DEV_URL = process.env.ELECTRON_RENDERER_URL;

/** Allowed sender URLs while packaged — the packaged document ALONE (S5-4). */
const PACKAGED_ONLY_URLS: ReadonlySet<string> = new Set([PACKAGED_DOCUMENT_URL]);

/** Allowed sender URLs in a dev run — dev document ∪ packaged document (issue #1). */
const DEV_RUN_URLS: ReadonlySet<string> = new Set(
  DEV_URL === undefined ? [PACKAGED_DOCUMENT_URL] : [DEV_URL, PACKAGED_DOCUMENT_URL],
);

/**
 * S5-4: `app.isPackaged` is consulted at CALL time — the poisoned-packaged-run
 * scenario of the regression test flips the switch per invocation, and the
 * read degrades to "packaged" (the narrow set) if the shape is ever missing.
 */
function allowedSenderUrls(): ReadonlySet<string> {
  const runtimeApp = app as unknown as { readonly isPackaged?: boolean } | undefined;
  return runtimeApp?.isPackaged === true ? PACKAGED_ONLY_URLS : DEV_RUN_URLS;
}

/** Runtime shape of `event.senderFrame` the guard consults — `url` only. */
interface SenderFrameLike {
  readonly url?: unknown;
}

/**
 * Refuses an IPC invoke whose `event.senderFrame` is not the app's own
 * document (issue #1 / S3-1). Every `ipcMain.handle` callback in
 * `src/main/index.ts` calls this FIRST — before any dialog, store access, or
 * handler logic. Returns normally (void) for the app's own renderer; throws an
 * `Error` named `UntrustedSenderError` for an absent/`null` frame or a frame
 * outside the allowed set.
 *
 * @param event - the invoke event whose `senderFrame.url` must match one of
 *   the app's own documents exactly (no prefix or suffix tricks: set lookup,
 *   never `startsWith`).
 * @throws {Error} `name === 'UntrustedSenderError'` for any untrusted sender.
 */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  // Defensive read: a missing/null senderFrame or a forged event shape must
  // degrade to a refusal, never to a stray TypeError.
  const senderFrame = (event as { readonly senderFrame?: SenderFrameLike | null } | null)
    ?.senderFrame;
  const url = senderFrame?.url;
  if (typeof url === 'string' && allowedSenderUrls().has(url)) {
    return;
  }
  const error = new Error(
    'IPC invoke refused: event.senderFrame is absent or its URL is not an app-owned document.',
  );
  error.name = 'UntrustedSenderError';
  throw error;
}

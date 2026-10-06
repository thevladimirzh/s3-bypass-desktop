/**
 * M1-08 (RED) — the secret store must stay unreachable from the renderer.
 *
 * Test plan IDs: TC-07-16, TC-07-17 — allocated by this batch
 * (docs/qa/m1-test-plan.md §7, deviation DV-04) for the plan-M1-08 pins
 * "store API only callable from main, never exposed on IPC" and the FR-55
 * half of AC-07.3 not already covered by the M1-06 IPC-denylist tests
 * (TC-IPC-01/02 / TC-07-03 own the generic channel denylist; these two own
 * the secret-store module specifically).
 *
 * Spec sources: docs/plans/m1-mvp.md M1-09 ("API only callable from main —
 * never exposed on IPC"), docs/analysis/requirements.md FR-55, FR-61, FR-64,
 * NFR-1; docs/analysis/data-flows.md §4.3 (denylist: secret store is a
 * main-side artifact K); docs/product/stories/US-07-secret-storage.md
 * AC-07.3; docs/qa/strategy.md §5.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-09 (see also tests/unit/secret-store.test.ts header —
 * `src/main/secret-store.ts` exporting `saveProfile`, `loadProfile`,
 * `deleteStoredProfile`):
 *
 *  A) No member of the renderer bridge `window.s3Bypass`
 *     (`contextBridge.exposeInMainWorld('s3Bypass', …)` in
 *     `src/preload/index.ts`) may expose a store operation, and no channel in
 *     the `src/shared/ipc.ts` allowlists may name one. The store's export
 *     names must stay disjoint from both surfaces (FR-55, FR-64, US-07
 *     AC-07.3): the renderer learns only the `ProfileSummary` (§8.3), never
 *     `saveProfile`/`loadProfile`/`deleteStoredProfile` or their payloads.
 *
 *  B) Structural guard: `src/main/secret-store.ts` must not reference any IPC
 *     primitive — `ipcRenderer`, `ipcMain`, `contextBridge`,
 *     `exposeInMainWorld`, `webContents` (comments stripped before scanning).
 *     `src/preload/index.ts` and `src/shared/ipc.ts` must not reference the
 *     store module at all: the IPC surface is declared independently of the
 *     store, so a future "just expose it" edit fails here first.
 *
 * RED status: ABSENCE RED — case B fails because `src/main/secret-store.ts`
 * does not exist yet; case A fails for the same reason (it loads the store to
 * learn which names must never cross the bridge). Strategy §5.2: legitimate
 * first-test-of-a-subsystem failure; do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import '../../src/preload/index';

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { IPC_INVOKE_CHANNELS, IPC_PUSH_CHANNELS, type S3BypassApi } from '../../src/shared/ipc';
import {
  createUserDataDir,
  loadSecretStore,
  removeDirectory,
  resetProbe,
} from '../helpers/secret-store-stub';

/** Observes what the preload exposes on the renderer bridge. */
const bridge = vi.hoisted(() => ({
  exposed: null as null | { key: string; api: Record<string, unknown> },
}));

vi.mock('electron', async () => ({
  ...(await import('../helpers/secret-store-stub')).electronModuleMock(),
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      bridge.exposed = { key, api };
    },
  },
  ipcRenderer: {
    invoke: () => Promise.resolve(undefined),
    on: () => () => undefined,
    removeListener: () => undefined,
    removeAllListeners: () => undefined,
    send: () => undefined,
  },
}));

/** M1-09 export names — kept disjoint from every renderer-reachable name. */
type StoreExportNames = 'saveProfile' | 'loadProfile' | 'deleteStoredProfile';

/** A bridge member or channel named like a store operation is a leak by name. */
const STORE_OP_NAME = /secret|store|safeStorage|encrypt|decrypt|keychain|blob/i;

const STORE_MODULE_PATH = fileURLToPath(new URL('../../src/main/secret-store.ts', import.meta.url));
const PRELOAD_PATH = fileURLToPath(new URL('../../src/preload/index.ts', import.meta.url));
const IPC_PATH = fileURLToPath(new URL('../../src/shared/ipc.ts', import.meta.url));

/** Renderer-facing module sources without `//`/`/* *\/` comments. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function exposedApi(): Record<string, unknown> {
  if (bridge.exposed === null) {
    throw new Error(
      'preload never called contextBridge.exposeInMainWorld — FR-61 surface missing (M1-07)',
    );
  }
  expect(bridge.exposed.key, 'the bridge must keep its documented global name').toBe('s3Bypass');
  return bridge.exposed.api;
}

let dataDir: string;

beforeAll(() => {
  dataDir = createUserDataDir();
  resetProbe(dataDir);
});

afterAll(() => {
  removeDirectory(dataDir);
});

describe('secret store boundary — unreachable from the renderer (FR-55, M1-09) — M1-08', () => {
  it('secretStorage.boundary.noStoreOperationExposedToRenderer', async () => {
    // TC-07-16 / AC-07.3: given the M1-09 store module exists in main, no
    // renderer-reachable name may carry a store operation.
    const store = await loadSecretStore();
    const storeExports = Object.keys(store);

    const api = exposedApi();
    const bridgeKeys = Object.keys(api);
    expect(
      bridgeKeys.filter((key) => STORE_OP_NAME.test(key)),
      'window.s3Bypass must expose no secret-store member (FR-55, plan M1-09)',
    ).toEqual([]);

    const channels: string[] = [...IPC_INVOKE_CHANNELS, ...IPC_PUSH_CHANNELS];
    expect(
      channels.filter((channel) => STORE_OP_NAME.test(channel)),
      'no allowlist entry in src/shared/ipc.ts may expose a store operation (FR-61/FR-64)',
    ).toEqual([]);

    expect(
      storeExports.filter((name) => bridgeKeys.includes(name) || channels.includes(name)),
      'src/main/secret-store.ts exports must stay disjoint from the bridge and the channel allowlist (FR-55)',
    ).toEqual([]);

    // Type-level: extending S3BypassApi with a store member breaks typecheck.
    expectTypeOf<Extract<keyof S3BypassApi, StoreExportNames>>().toEqualTypeOf<never>();
  });

  it('secretStorage.boundary.storeModuleImportsNoIpcPrimitives', () => {
    // TC-07-17 / FR-55: structural guard on the module source itself.
    expect(
      existsSync(STORE_MODULE_PATH),
      'src/main/secret-store.ts must exist — M1-09 GREEN implements the M1-08 contract',
    ).toBe(true);

    const storeSource = stripComments(readFileSync(STORE_MODULE_PATH, 'utf8'));
    for (const primitive of [
      'ipcRenderer',
      'ipcMain',
      'contextBridge',
      'exposeInMainWorld',
      'webContents',
    ]) {
      expect(
        storeSource.includes(primitive),
        `src/main/secret-store.ts must not reference '${primitive}' — the API is callable only from main, never exposed on IPC (FR-55, plan M1-09)`,
      ).toBe(false);
    }

    for (const path of [PRELOAD_PATH, IPC_PATH]) {
      expect(
        stripComments(readFileSync(path, 'utf8')).includes('secret-store'),
        `${path} must not reference the store module — the IPC surface stays independent of the store (FR-55)`,
      ).toBe(false);
    }
  });
});

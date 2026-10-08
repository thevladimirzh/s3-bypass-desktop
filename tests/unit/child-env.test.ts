/**
 * TC-02-26 / TC-02-27 — pre-M3 fix batch for issue #21 (M1-25 finding
 * S5-12, re-surfaced by the M2-09 §3 review): the spawned core inherited
 * the ENTIRE parent environment — the user's own secrets (AWS_* class
 * keys, tokens), `CORE_BINARY_PATH` and `ELECTRON_*` all reached a child
 * that never reads them. Plan rows: `docs/qa/m1-test-plan.md` §2 +
 * `m2-test-plan.md` §10/§11 (DV-61); owner-approved sequence M2-13 → fix
 * batches → M3.
 *
 * Contract pinned here (GREEN implements, RED fails):
 *
 * 1. `src/main/child-env.ts` (NEW): `buildChildEnv(base, { isPackaged? })`
 *    returns the explicit spawn env — allowlist `{ PATH, HOME, TMPDIR, LANG }`
 *    plus the platform basics `{ USER, LOGNAME }` (issue #21's "allowlist …
 *    + platform basics", declared DV-61), and `FAKE_CORE_*` ONLY when
 *    `isPackaged !== true` (the documented dev/test seam — the same
 *    `!isPackaged` gate idea as `CORE_BINARY_PATH`, issue #6). The env is
 *    BUILT from the allowlist (never filtered by deletion), so
 *    `CORE_BINARY_PATH`, `ELECTRON_*`, canaries and any other var cannot
 *    ride in either arm.
 * 2. Wiring (raw-text pins — three files, the issue's own fix list):
 *    `core-supervisor.ts` spawn options carry
 *    `env: buildChildEnv(process.env, { isPackaged: options.isPackaged })`,
 *    `SupervisorOptions` gains `isPackaged?: boolean`, and the old
 *    "inherits `process.env`" contract prose is gone;
 *    `core-wiring.ts` forwards `isPackaged: deps.isPackaged` (its NO-electron
 *    deps boundary stays); `index.ts` supplies the real
 *    `isPackaged: app.isPackaged`.
 *
 * Test-contract safety (issue #21's "keep the tests green"): every existing
 * rig omits `isPackaged` → the helper's default dev arm passes `FAKE_CORE_*`
 * through, so core-supervisor / hardening / occupy-port / e2e keep their
 * fixture seam without any edit.
 *
 * Loader note: the specifier is NON-LITERAL on purpose (DV-28 pattern) —
 * `tests/**` sits inside `tsconfig.node.json`'s include, so a literal import
 * of the not-yet-existing module would fail `npm run typecheck` (exit 0 is
 * required during RED). At runtime Vitest resolves it the moment GREEN
 * creates the file: absence RED becomes assertion RED with zero edits
 * (strategy §5.2).
 *
 * Observed RED: 7 failed | 278 passed (285), Test Files 1 failed | 42
 * passed (43), exit 1 — TC-02-26 fails on the absent module (the loader's
 * contract error is the legitimate absence-RED reason), TC-02-27 on the
 * three missing wiring strings + the still-present inherit prose; its
 * `index.ts` half already passes (issue #6's resolveCoreBinaryPath gate
 * carries `isPackaged: app.isPackaged` at index.ts:519 — honest note, the
 * pin stays for the wiring contract). Baseline 277 passed / 0 failed
 * (42 files) untouched — nothing existing is edited.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface ChildEnvModule {
  buildChildEnv(base: NodeJS.ProcessEnv, options?: { isPackaged?: boolean }): NodeJS.ProcessEnv;
}

const childEnvSpecifier: string = '../../src/main/child-env';

async function loadChildEnv(): Promise<ChildEnvModule> {
  try {
    return (await import(/* @vite-ignore */ childEnvSpecifier)) as ChildEnvModule;
  } catch (failure) {
    throw new Error(
      `src/main/child-env.ts could not be loaded — issue #21 GREEN implements this ` +
        `module (pre-M3 fix batch, m1-test-plan §2 + DV-61). Absence RED is the ` +
        `expected failure until then (strategy §5.2). Cause: ` +
        (failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

/** Everything the parent carries in the real world — secrets included. */
const PARENT_ENV: NodeJS.ProcessEnv = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/u',
  TMPDIR: '/tmp/fm',
  LANG: 'en_US.UTF-8',
  USER: 'u',
  LOGNAME: 'u',
  AWS_SECRET_ACCESS_KEY: 'canary-aws-key',
  GITHUB_TOKEN: 'canary-gh-token',
  CORE_BINARY_PATH: '/evil/xray',
  ELECTRON_RUN_AS_NODE: '1',
  ELECTRON_RENDERER_URL: 'http://localhost:5173',
  STRAY_PARENT_VAR: 'must-not-ride',
  FAKE_CORE_DELAY_MS: '0',
  FAKE_CORE_MODE: 'ok',
};

describe('TC-02-26 — buildChildEnv: explicit allowlist, seam only un-packaged (issue #21)', () => {
  it('passes the required platform keys through', async () => {
    const { buildChildEnv } = await loadChildEnv();
    const env = buildChildEnv(PARENT_ENV, { isPackaged: false });
    for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG']) {
      expect(env[key]).toBe(PARENT_ENV[key]);
    }
  });

  it('never passes secrets, CORE_BINARY_PATH or ELECTRON_* — in either arm', async () => {
    const { buildChildEnv } = await loadChildEnv();
    for (const isPackaged of [false, true]) {
      const env = buildChildEnv(PARENT_ENV, { isPackaged });
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(env.GITHUB_TOKEN).toBeUndefined();
      expect(env.CORE_BINARY_PATH).toBeUndefined();
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(env.ELECTRON_RENDERER_URL).toBeUndefined();
    }
  });

  it('passes FAKE_CORE_* only when not packaged (the dev/test seam)', async () => {
    const { buildChildEnv } = await loadChildEnv();
    const dev = buildChildEnv(PARENT_ENV, { isPackaged: false });
    expect(dev.FAKE_CORE_DELAY_MS).toBe('0');
    expect(dev.FAKE_CORE_MODE).toBe('ok');
    const devDefault = buildChildEnv(PARENT_ENV);
    expect(devDefault.FAKE_CORE_MODE).toBe('ok');
    const packaged = buildChildEnv(PARENT_ENV, { isPackaged: true });
    expect(packaged.FAKE_CORE_DELAY_MS).toBeUndefined();
    expect(packaged.FAKE_CORE_MODE).toBeUndefined();
  });

  it('passes nothing beyond the allowlist + the seam (built, not filtered)', async () => {
    const { buildChildEnv } = await loadChildEnv();
    const env = buildChildEnv(PARENT_ENV, { isPackaged: false });
    expect(env.STRAY_PARENT_VAR).toBeUndefined();
    const allowed = new Set([
      'PATH',
      'HOME',
      'TMPDIR',
      'LANG',
      'USER',
      'LOGNAME',
      'FAKE_CORE_DELAY_MS',
      'FAKE_CORE_MODE',
    ]);
    for (const key of Object.keys(env)) expect(allowed.has(key)).toBe(true);
  });
});

describe('TC-02-27 — spawn carries the explicit env through the wiring (issue #21)', () => {
  const supervisor = readFileSync(join(ROOT, 'src', 'main', 'core-supervisor.ts'), 'utf8');
  const wiring = readFileSync(join(ROOT, 'src', 'main', 'core-wiring.ts'), 'utf8');
  const host = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8');

  it('core-supervisor.ts: spawn options build the env + options carries the flag', () => {
    expect(supervisor).toContain(
      'env: buildChildEnv(process.env, { isPackaged: options.isPackaged })',
    );
    expect(supervisor).toContain('isPackaged?: boolean');
    expect(supervisor).toContain('buildChildEnv');
  });

  it('core-supervisor.ts: the old inherit-process.env contract prose is gone', () => {
    expect(supervisor).not.toContain('inherits `process.env`');
  });

  it('core-wiring.ts: forwards deps.isPackaged behind the no-electron deps boundary', () => {
    expect(wiring).toContain('isPackaged: deps.isPackaged');
    expect(wiring).not.toContain("from 'electron'");
  });

  it('index.ts: the host supplies the real app.isPackaged', () => {
    expect(host).toContain('isPackaged: app.isPackaged');
  });
});

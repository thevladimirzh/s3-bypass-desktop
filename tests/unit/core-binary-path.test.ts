/**
 * M2-04 (RED) — bundled-core path resolution, executable specification.
 *
 * Plan rows: TC-02-16, TC-02-17, TC-02-18, TC-PKG-04, TC-02-20
 * (`docs/qa/m2-test-plan.md` §3, DV-40).
 * Basis: board task M2-04 (`docs/plans/m2-packaging.md` Phase B); BRIEF §5/§9
 * (bundled core, pinned per platform); S4-5 / issue #6 (the
 * `CORE_BINARY_PATH` override is honored only while `!app.isPackaged`);
 * M2 DoD #2 (fresh-machine run starts the tunnel from the packaged bundle).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR GREEN (developer) — the artifacts this file must stop failing on:
 *
 *   1. `src/main/core-binary-path.ts` — PURE node module, NO electron import:
 *
 *        export interface CoreBinaryPathEnv {
 *          readonly isPackaged: boolean;
 *          readonly override: string | undefined;    // process.env.CORE_BINARY_PATH
 *          readonly resourcesPath: string | undefined; // process.resourcesPath (absent under plain node)
 *          readonly platform: string;               // process.platform
 *        }
 *        export function resolveCoreBinaryPath(env: CoreBinaryPathEnv): string
 *
 *      Resolution order:
 *        a) `isPackaged === true` → the bundle path, ALWAYS — the env
 *           override is never even consulted (S4-5: a packaged run can
 *           never be steered to another executable).
 *        b) `!isPackaged` && override defined && `override.trim() !== ''`
 *           → the override string VERBATIM (dev seam — the M1 unit suites
 *           and the e2e launchEnv depend on it, DV-31 / issue #6).
 *        c) otherwise → `join(resourcesPath ?? '.', 'core', platform, 'xray')`
 *           — the per-platform bundle path: darwin → `core/darwin/xray`,
 *           linux → `core/linux/xray`; an unknown platform passes through
 *           as its own directory name (total function; only darwin/linux are
 *           build targets, BRIEF §9).
 *
 *   2. `src/main/index.ts` — the local `resolveCoreBinaryPath()` body is
 *      replaced by an import from `./core-binary-path` called at the
 *      `binaryPath:` site as
 *        resolveCoreBinaryPath({ isPackaged: app.isPackaged,
 *          override: process.env.CORE_BINARY_PATH,
 *          resourcesPath: process.resourcesPath, platform: process.platform })
 *      and the S4-5 comment moves to the new module (no local re-derivation).
 *
 *   3. Staging machinery: `scripts/prepare-core.mjs` + `package.json`
 *      script `"prepare:core"` — for each asset row of
 *      `docs/analysis/core-pin.md` (tag row = release, asset rows = SHA-256):
 *      download the pinned zip, verify its digest against the pin (reuse
 *      `expectedShaForAsset` from `scripts/verify-core-pin.mjs`; a mismatch
 *      aborts with exit 1), then extract ALL five members (xray, geoip.dat,
 *      geosite.dat, LICENSE, README.md) into `core-bin/<target>/` —
 *        Xray-macos-64.zip        → darwin-x64
 *        Xray-macos-arm64-v8a.zip → darwin-arm64
 *        Xray-linux-64.zip        → linux-x64
 *      — and chmod 0755 on `core-bin/<target>/xray`.
 *
 *   4. `.gitignore` gains `core-bin/` (staged binaries never enter git).
 *
 *   M2-05 consumes the staging dirs via electron-builder `extraResources`
 *   (`from core-bin/darwin-${arch}/xray → to core/darwin/xray`, linux
 *   likewise) — that config pin is M2-05's own RED, not this batch's.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Observed RED: TC-02-16/17/18/20 fail as ABSENCE RED through the
 * non-literal loader in `tests/helpers/core-binary-path-stub.ts` (module
 * absent — typecheck stays exit 0, M1-16/DV-28 pattern); TC-PKG-04 fails on
 * the absent `prepare:core` script and `core-bin/` ignore. Baseline
 * untouched: 218 passed / 0 failed.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCoreBinaryPath } from '../helpers/core-binary-path-stub';

/** Synthetic packaged-resources dir (§1 synthetic-only: never touched). */
const RES = '/synthetic/app/Contents/Resources';

/** Repo root, resolved from this file (tests/unit → root). */
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Read one repo file as utf8 (throws if absent — RED behavior). */
function repoFile(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('TC-02-16 — packaged runs resolve the bundle, never the env override (S4-5)', () => {
  it('coreBinaryPath.packagedBundleWinsOverOverride', async () => {
    const mod = await loadCoreBinaryPath();
    expect(
      mod.resolveCoreBinaryPath({
        isPackaged: true,
        override: '/synthetic/attacker-core',
        resourcesPath: RES,
        platform: 'darwin',
      }),
      'M2-04/S4-5: a packaged run must resolve the bundled per-platform path — ' +
        'CORE_BINARY_PATH is NEVER consulted inside a package (issue #6)',
    ).toBe(join(RES, 'core', 'darwin', 'xray'));
    expect(
      mod.resolveCoreBinaryPath({
        isPackaged: true,
        override: undefined,
        resourcesPath: RES,
        platform: 'linux',
      }),
      'M2-04: packaged + no override → the same bundle rule (linux target)',
    ).toBe(join(RES, 'core', 'linux', 'xray'));
  });
});

describe('TC-02-17 — dev override wins only while unpackaged (issue #6 / DV-31)', () => {
  it('coreBinaryPath.devOverrideWinsUnpackaged', async () => {
    const mod = await loadCoreBinaryPath();
    expect(
      mod.resolveCoreBinaryPath({
        isPackaged: false,
        override: '/synthetic/dev/core',
        resourcesPath: RES,
        platform: 'darwin',
      }),
      'M2-04: outside a package the CORE_BINARY_PATH override is honored verbatim ' +
        '(the M1 suites and e2e launchEnv depend on this seam)',
    ).toBe('/synthetic/dev/core');
    expect(
      mod.resolveCoreBinaryPath({
        isPackaged: false,
        override: '',
        resourcesPath: RES,
        platform: 'darwin',
      }),
      'M2-04: an empty override is not an override — fall through to the bundle (M1 contract)',
    ).toBe(join(RES, 'core', 'darwin', 'xray'));
    expect(
      mod.resolveCoreBinaryPath({
        isPackaged: false,
        override: '   ',
        resourcesPath: RES,
        platform: 'darwin',
      }),
      'M2-04: a whitespace-only override is not an override (trim rule preserved from M1)',
    ).toBe(join(RES, 'core', 'darwin', 'xray'));
  });
});

describe('TC-02-18 — per-platform bundle mapping + total function', () => {
  it('coreBinaryPath.platformMappedBundlePath', async () => {
    const mod = await loadCoreBinaryPath();
    const base = { isPackaged: false, override: undefined } as const;
    expect(
      mod.resolveCoreBinaryPath({ ...base, resourcesPath: RES, platform: 'darwin' }),
      'M2-04: darwin target maps to core/darwin/xray under resourcesPath',
    ).toBe(join(RES, 'core', 'darwin', 'xray'));
    expect(
      mod.resolveCoreBinaryPath({ ...base, resourcesPath: RES, platform: 'linux' }),
      'M2-04: linux target maps to core/linux/xray under resourcesPath',
    ).toBe(join(RES, 'core', 'linux', 'xray'));
    expect(
      mod.resolveCoreBinaryPath({ ...base, resourcesPath: undefined, platform: 'darwin' }),
      'M2-04: the plain-node harness has no process.resourcesPath — the resolver ' +
        'stays total and degrades to a cwd-relative core/darwin/xray (the supervisor ' +
        'then answers the documented E-IO-004 without spawning, R-1 behavior kept)',
    ).toBe('core/darwin/xray');
    expect(
      mod.resolveCoreBinaryPath({ ...base, resourcesPath: RES, platform: 'freebsd' }),
      'M2-04: an unknown platform passes through as its own directory name — the ' +
        'resolver is total, never throws (only darwin/linux are build targets, BRIEF §9)',
    ).toBe(join(RES, 'core', 'freebsd', 'xray'));
  });
});

describe('TC-PKG-04 — staging machinery is declared and never committed (M2-04)', () => {
  it('prepareCore.stagingScriptDeclaredAndIgnored', () => {
    const pkg = JSON.parse(repoFile('package.json')) as { scripts?: Record<string, string> };
    expect(
      pkg.scripts?.['prepare:core'],
      'M2-04: package.json must expose "prepare:core" wrapping scripts/prepare-core.mjs ' +
        '(download pinned zips → verify against docs/analysis/core-pin.md → stage ' +
        'core-bin/<target>/)',
    ).toContain('prepare-core.mjs');
    expect(
      repoFile('.gitignore'),
      'M2-04: staged core binaries (core-bin/) must be gitignored — the ~21 MB per ' +
        'target never enters git (pin of record stays docs/analysis/core-pin.md)',
    ).toMatch(/^core-bin\/$/m);
  });
});

describe('TC-02-20 — the host delegates to the pure resolver (no local re-derivation)', () => {
  it('coreBinaryPath.hostDelegatesToPureResolver', () => {
    const index = repoFile('src/main/index.ts');
    expect(
      index,
      'M2-04: src/main/index.ts must import resolveCoreBinaryPath from ' +
        "'./core-binary-path' (DV-28 pure-glue split — the resolution rules live " +
        'in the testable module, not in the Electron host)',
    ).toContain("from './core-binary-path'");
    expect(
      index,
      'M2-04: the binaryPath: wiring site must call the resolver with the live host ' +
        'env (isPackaged: app.isPackaged first — S4-5 lives in the pure rules)',
    ).toMatch(/resolveCoreBinaryPath\(\{\s*isPackaged: app\.isPackaged/);
    expect(
      index,
      'M2-04: the old local function body must be gone — one resolution ' +
        'implementation, in src/main/core-binary-path.ts',
    ).not.toMatch(/function resolveCoreBinaryPath\(/);
  });
});

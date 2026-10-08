/**
 * TC-PKG-18 / TC-PKG-19 / TC-PKG-20 — pre-M3 fix batch for issue #20
 * (M2-09 finding S6-1): local `npm run dist` packs `core-bin/` as-is —
 * staging is never cleaned and no `prepare:core` gate runs, so a stale or
 * stray core can ship from a local build. Plan rows: `docs/qa/m2-test-plan.md`
 * §6 + §10/§11 (DV-60); owner-approved sequence M2-13 → fix batches → M3.
 *
 * Contract pinned here (GREEN implements, RED fails by absence):
 *
 * 1. `scripts/core-staging.mjs` (NEW): exports
 *    - `TARGETS` (asset → staged target, moved from prepare-core.mjs),
 *    - `cleanStagingTarget(stagingDir, target)` — removes the target dir
 *      recursively (fix a: no stale/stray member survives extraction),
 *    - `writeStagingManifest(manifestsDir, target, manifest)` /
 *      `readStagingManifest(manifestsDir, target)` — the staging manifest
 *      `{ asset, target, zipSha256, members: { name → sha256 }, stagedAt }`
 *      written only after the digest-verified extraction.
 * 2. `scripts/after-pack-verify.mjs` (NEW): `verifyPackedCore({ coreResourcesDir,
 *    manifestsDir, target, pinDocText })` — fail-closed pack gate (throws):
 *    `no staging manifest` → `no pinned SHA-256` → `STALE staging` (manifest
 *    zip sha ≠ pin doc — pin moved since staging) → `does not match target` →
 *    `STRAY packed` (file not in the manifest — the issue #20 repro) →
 *    `MISSING packed` → `DIGEST mismatch`. Default export = the
 *    electron-builder `afterPack(context)` adapter (wired in
 *    electron-builder.yml — TC-PKG-20), which resolves the packed
 *    `Resources/core/<platform>` dir and calls the same verifier.
 * 3. `scripts/prepare-core.mjs` (EXISTS — raw-text pins): calls
 *    `cleanStagingTarget` strictly AFTER the zip digest comparison and BEFORE
 *    the unzip, and `writeStagingManifest` after staging. It cannot be
 *    imported (top-level `await main()` + network), so its calls are pinned
 *    textually with ORDER assertions; the behavior lives in (1)'s tmp-dir
 *    tests (DV-60).
 *
 * Loader note: the specifiers are NON-LITERAL on purpose (DV-28 pattern) —
 * `tests/**` sits inside `tsconfig.node.json`'s include, so a literal import
 * of the not-yet-existing module would fail `npm run typecheck` (which must
 * stay exit 0 during RED). At runtime Vitest resolves them against this file
 * the moment GREEN creates the scripts: absence RED becomes assertion RED
 * with zero test edits (strategy §5.2).
 *
 * Observed RED: 11 failed | 266 passed (277), Test Files 1 failed | 41
 * passed (42), exit 1 — TC-PKG-18/19 all fail on the two absent modules
 * (the loader's contract error is the legitimate absence-RED reason),
 * TC-PKG-20 on the missing `afterPack:` pin and the absent hook file
 * (ENOENT). Baseline 266 passed / 0 failed (41 files) untouched — this
 * batch adds 11 tests, nothing existing is edited.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpRoots: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tmpRoots.push(dir);
  return dir;
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Staging-manifest shape shared by prepare:core (writer) and the gate (reader). */
interface StagingManifest {
  asset: string;
  target: string;
  zipSha256: string;
  members: Record<string, string>;
  stagedAt: string;
}

interface CoreStagingModule {
  TARGETS: Record<string, string>;
  cleanStagingTarget(stagingDir: string, target: string): void;
  writeStagingManifest(manifestsDir: string, target: string, manifest: StagingManifest): void;
  readStagingManifest(manifestsDir: string, target: string): StagingManifest | null;
}

interface AfterPackVerifyModule {
  verifyPackedCore(options: {
    coreResourcesDir: string;
    manifestsDir: string;
    target: string;
    pinDocText: string;
  }): void;
}

const coreStagingSpecifier: string = '../../scripts/core-staging';
const afterPackSpecifier: string = '../../scripts/after-pack-verify';

async function loadModule<T>(specifier: string, contract: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch (failure) {
    throw new Error(
      `${contract} could not be loaded — issue #20 GREEN implements this module ` +
        `(pre-M3 fix batch, m2-test-plan §6 + DV-60). Absence RED is the expected ` +
        `failure until then (strategy §5.2). Cause: ` +
        (failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

function loadCoreStaging(): Promise<CoreStagingModule> {
  return loadModule<CoreStagingModule>(coreStagingSpecifier, 'scripts/core-staging.mjs');
}

function loadAfterPackVerify(): Promise<AfterPackVerifyModule> {
  return loadModule<AfterPackVerifyModule>(afterPackSpecifier, 'scripts/after-pack-verify.mjs');
}

describe('TC-PKG-18 — prepare:core cleans staging and records a manifest (issue #20 fix a)', () => {
  it('cleanStagingTarget removes every stale/stray member before extraction', async () => {
    const staging = tmp('fix20-clean');
    const targetDir = join(staging, 'darwin-arm64');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'stray-stale.txt'), 'stale');
    writeFileSync(join(targetDir, 'xray'), 'old-binary');

    const { cleanStagingTarget } = await loadCoreStaging();
    cleanStagingTarget(staging, 'darwin-arm64');

    expect(existsSync(join(targetDir, 'xray'))).toBe(false);
    expect(existsSync(join(targetDir, 'stray-stale.txt'))).toBe(false);
  });

  it('write/read manifest round-trips the staged member digests', async () => {
    const manifestsDir = join(tmp('fix20-manifests'), '.manifests');
    const manifest: StagingManifest = {
      asset: 'Xray-macos-arm64-v8a.zip',
      target: 'darwin-arm64',
      zipSha256: 'a'.repeat(64),
      members: { xray: sha('binary'), 'geoip.dat': sha('geo') },
      stagedAt: '2026-10-08T00:00:00.000Z',
    };

    const staging = await loadCoreStaging();
    expect(staging.readStagingManifest(manifestsDir, 'darwin-arm64')).toBeNull();
    staging.writeStagingManifest(manifestsDir, 'darwin-arm64', manifest);
    expect(staging.readStagingManifest(manifestsDir, 'darwin-arm64')).toEqual(manifest);
  });

  it('prepare-core.mjs: cleaner runs after the digest check and before the unzip; manifest is written', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'prepare-core.mjs'), 'utf8');
    const digestCheck = src.indexOf('actual !== expected');
    const clean = src.indexOf('cleanStagingTarget(');
    const unzip = src.indexOf("spawnSync('unzip'");
    expect(digestCheck).toBeGreaterThan(-1);
    expect(clean).toBeGreaterThan(digestCheck);
    expect(unzip).toBeGreaterThan(clean);
    expect(src).toContain('writeStagingManifest(');
  });
});

describe('TC-PKG-19 — after-pack gate verifies the packed core, fail-closed (issue #20 fix b)', () => {
  const ZIP_A = 'a'.repeat(64);
  const ZIP_B = 'b'.repeat(64);
  const MEMBER_CONTENT: Record<string, string> = {
    xray: 'binary-bytes',
    'geoip.dat': 'geo-ip',
    'geosite.dat': 'geo-site',
    LICENSE: 'MPL-2.0',
    'README.md': 'readme',
  };

  function buildFixture() {
    const root = tmp('fix20-verify');
    const coreResourcesDir = join(root, 'resources', 'core', 'linux');
    mkdirSync(coreResourcesDir, { recursive: true });
    for (const [name, content] of Object.entries(MEMBER_CONTENT)) {
      writeFileSync(join(coreResourcesDir, name), content);
    }
    const manifestsDir = join(root, '.manifests');
    const members: Record<string, string> = {};
    for (const [name, content] of Object.entries(MEMBER_CONTENT)) {
      members[name] = sha(content);
    }
    const manifest: StagingManifest = {
      asset: 'Xray-linux-64.zip',
      target: 'linux-x64',
      zipSha256: ZIP_A,
      members,
      stagedAt: '2026-10-08T00:00:00.000Z',
    };
    const pinDocText =
      `| \`Xray-linux-64.zip\` | ${ZIP_A} | 1 |\n` + `| \`Xray-macos-64.zip\` | ${ZIP_B} | 1 |\n`;
    return { root, coreResourcesDir, manifestsDir, manifest, pinDocText };
  }

  it('passes on a pinned, manifest-matching packed core', async () => {
    const f = buildFixture();
    const staging = await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    staging.writeStagingManifest(f.manifestsDir, 'linux-x64', f.manifest);
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: f.pinDocText,
      }),
    ).not.toThrow();
  });

  it('fails closed when the staging manifest is absent (staging never verified)', async () => {
    const f = buildFixture();
    await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: f.pinDocText,
      }),
    ).toThrow(/no staging manifest/);
  });

  it('fails closed when the pin doc moved since staging (STALE)', async () => {
    const f = buildFixture();
    const staging = await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    staging.writeStagingManifest(f.manifestsDir, 'linux-x64', f.manifest);
    const movedPinDoc = f.pinDocText.replace(ZIP_A, 'c'.repeat(64));
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: movedPinDoc,
      }),
    ).toThrow(/STALE staging/);
  });

  it('fails closed on a stray packed file — the issue #20 repro (STRAY)', async () => {
    const f = buildFixture();
    const staging = await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    staging.writeStagingManifest(f.manifestsDir, 'linux-x64', f.manifest);
    writeFileSync(join(f.coreResourcesDir, 'stray-stale.txt'), 'stale');
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: f.pinDocText,
      }),
    ).toThrow(/STRAY packed/);
  });

  it('fails closed when a manifest member never reached the package (MISSING)', async () => {
    const f = buildFixture();
    const staging = await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    staging.writeStagingManifest(f.manifestsDir, 'linux-x64', f.manifest);
    rmSync(join(f.coreResourcesDir, 'geoip.dat'));
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: f.pinDocText,
      }),
    ).toThrow(/MISSING packed/);
  });

  it('fails closed when a packed file differs from the staged digest (DIGEST)', async () => {
    const f = buildFixture();
    const staging = await loadCoreStaging();
    const { verifyPackedCore } = await loadAfterPackVerify();
    staging.writeStagingManifest(f.manifestsDir, 'linux-x64', f.manifest);
    writeFileSync(join(f.coreResourcesDir, 'xray'), 'tampered-bytes');
    expect(() =>
      verifyPackedCore({
        coreResourcesDir: f.coreResourcesDir,
        manifestsDir: f.manifestsDir,
        target: 'linux-x64',
        pinDocText: f.pinDocText,
      }),
    ).toThrow(/DIGEST mismatch/);
  });
});

describe('TC-PKG-20 — the pack gate is wired into electron-builder (issue #20)', () => {
  it('electron-builder.yml declares the afterPack hook (gate runs on every dist)', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8');
    expect(yml).toMatch(/afterPack:\s*scripts\/after-pack-verify\.mjs/);
  });

  it('the hook module exists and exports the electron-builder entry point', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'after-pack-verify.mjs'), 'utf8');
    expect(src).toMatch(/export default/);
  });
});

afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

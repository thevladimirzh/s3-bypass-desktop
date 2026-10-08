#!/usr/bin/env node
/**
 * M2-20 fix b — fail-closed pack gate (issue #20 / M2-09 finding S6-1;
 * M2 DoD #1 "SHA-256 of bundled core verified at build time" for LOCAL
 * builds too): electron-builder packs `core-bin/<target>/` directory-level,
 * and before this hook nothing on the local `npm run dist` path re-checked
 * the staged bytes. This `afterPack` hook re-hashes the PACKED core against
 *
 *   pin doc (zip digest)  ↔  staging manifest (zip digest + member digests)
 *   ↔  packed member bytes
 *
 * entirely offline: `prepare:core` verified the downloaded zip against
 * `docs/analysis/core-pin.md` (fail-closed) and recorded both digests, so a
 * pin bump since staging shows up as a STALE manifest and any stray/missing/
 * tampered packed file shows up directly. EVERY failure THROWS —
 * electron-builder fails the build (never warn, never continue).
 *
 * Wiring: `afterPack: scripts/after-pack-verify.mjs` in electron-builder.yml
 * (TC-PKG-20); behavior fixed by TC-PKG-19 (m2-test-plan §6, DV-60).
 * The default export is the electron-builder entry; the pure
 * `verifyPackedCore(options)` is what the unit tests drive against fixtures.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readStagingManifest, TARGETS } from './core-staging.mjs';
import { expectedShaForAsset } from './verify-core-pin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN_DOC = join(ROOT, 'docs', 'analysis', 'core-pin.md');
const MANIFESTS_DIR = join(ROOT, 'core-bin', '.manifests');

/**
 * electron-builder `Arch` enum (builder-util/out/arch.d.ts) → our staged
 * target suffix. DV-65 / TC-PKG-22: the previous table NEVER matched the
 * real enum (it read `1 → ia32`, i.e. every x64 build), so the validation
 * run 37846078455 failed all legs at this gate. Exported for the row-by-row
 * pin; the string passthrough below still accepts asset-style names
 * (`x86_64`), and anything unknown stays fail-closed.
 */
const ARCH_BY_ENUM = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
};

export function archName(arch) {
  if (typeof arch === 'string') return arch === 'x86_64' ? 'x64' : arch;
  const name = ARCH_BY_ENUM[arch];
  if (name === undefined) throw new Error(`core pack gate: unknown arch ${arch}`);
  return name;
}

function assetForTarget(target) {
  const entry = Object.entries(TARGETS).find(([, staged]) => staged === target);
  if (entry === undefined) throw new Error(`core pack gate: unknown target ${target}`);
  return entry[0];
}

/** Every file below `dir`, as sorted paths relative to it (flattens recursion). */
function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full).map((relative) => `${name}/${relative}`));
    } else {
      out.push(name);
    }
  }
  return out.sort();
}

/**
 * Verify the packed core directory against the staging manifest + pin doc.
 * Throws on every violation (fail closed), returns nothing on success.
 * Options: { coreResourcesDir, manifestsDir, target, pinDocText }.
 */
export function verifyPackedCore({ coreResourcesDir, manifestsDir, target, pinDocText }) {
  const manifest = readStagingManifest(manifestsDir, target);
  if (manifest === null) {
    throw new Error(`core pack gate: no staging manifest for ${target} — run npm run prepare:core`);
  }
  if (manifest.target !== target || manifest.asset !== assetForTarget(target)) {
    throw new Error(`core pack gate: manifest does not match target ${target}`);
  }
  const expectedZip = expectedShaForAsset(pinDocText, manifest.asset);
  if (expectedZip === null) {
    throw new Error(`core pack gate: no pinned SHA-256 for ${manifest.asset} in the pin doc`);
  }
  if (manifest.zipSha256 !== expectedZip) {
    throw new Error(
      `core pack gate: STALE staging for ${target} — staged zip sha ${manifest.zipSha256} ` +
        `≠ pin doc ${expectedZip} (pin moved since staging) — run npm run prepare:core`,
    );
  }

  const packed = walkFiles(coreResourcesDir);
  const listed = Object.keys(manifest.members).sort();

  const stray = packed.filter((file) => !listed.includes(file));
  if (stray.length > 0) {
    throw new Error(
      `core pack gate: STRAY packed file(s) in ${target}: ${stray.join(', ')} — ` +
        `run npm run prepare:core`,
    );
  }
  const missing = listed.filter((file) => !packed.includes(file));
  if (missing.length > 0) {
    throw new Error(
      `core pack gate: MISSING packed member(s) in ${target}: ${missing.join(', ')} — ` +
        `run npm run prepare:core`,
    );
  }
  for (const [name, expected] of Object.entries(manifest.members)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(coreResourcesDir, name)))
      .digest('hex');
    if (actual !== expected) {
      throw new Error(
        `core pack gate: DIGEST mismatch for packed file ${name} in ${target} ` +
          `(expected ${expected}, actual ${actual})`,
      );
    }
  }
}

/** electron-builder `afterPack(context)` entry — resolves dirs, then verifies. */
export default async function afterPack(context) {
  const platform = context.electronPlatformName; // 'darwin' | 'linux' | 'win32'
  if (platform !== 'darwin' && platform !== 'linux') {
    throw new Error(`core pack gate: unsupported platform ${platform}`);
  }
  const target = `${platform}-${archName(context.arch)}`;
  const resourcesDir =
    platform === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : join(context.appOutDir, 'resources');
  verifyPackedCore({
    coreResourcesDir: join(resourcesDir, 'core', platform),
    manifestsDir: MANIFESTS_DIR,
    target,
    pinDocText: readFileSync(PIN_DOC, 'utf8'),
  });
}

/**
 * M2-20 fix a — staging helpers shared by `prepare:core` (writer) and the
 * after-pack gate (reader); issue #20 / M2-09 finding S6-1: local
 * `npm run dist` packs `core-bin/<target>/` directory-level, so the staging
 * directory must be cleaned before every extraction and recorded in a
 * manifest the pack gate can re-verify offline.
 *
 * Contract fixed by tests/unit/core-staging-gate.test.ts (TC-PKG-18/19,
 * m2-test-plan §6, DV-60):
 *
 *   - `TARGETS`           asset → staged build target (moved verbatim from
 *                         prepare-core.mjs — one source of truth);
 *   - `cleanStagingTarget(stagingDir, target)`
 *                         recursively removes the target dir BEFORE unzip —
 *                         members absent from a freshly downloaded zip (pin
 *                         bump, asset rename, partial target remap) and any
 *                         stray file cannot survive into the package;
 *   - `writeStagingManifest(manifestsDir, target, manifest)` /
 *     `readStagingManifest(manifestsDir, target)`
 *                         JSON manifest `{ asset, target, zipSha256, members:
 *                         { name → sha256 }, stagedAt }`, written ONLY after
 *                         the digest-verified extraction; reading a missing
 *                         manifest returns null (fail-closed at the gate),
 *                         a corrupt one throws.
 *
 * The manifests live in `core-bin/.manifests/<target>.json` — inside the
 * TC-PKG-04-ignored `core-bin/` and never packed (electron-builder copies
 * only `core-bin/<target>/` via extraResources).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Pinned asset → staged build target (the mapping M2-05 packs). */
export const TARGETS = {
  'Xray-macos-64.zip': 'darwin-x64',
  'Xray-macos-arm64-v8a.zip': 'darwin-arm64',
  'Xray-linux-64.zip': 'linux-x64',
};

/**
 * Remove the whole staging target (fix a) — called between the zip digest
 * check and the unzip, so extraction always starts from an empty directory.
 */
export function cleanStagingTarget(stagingDir, target) {
  rmSync(join(stagingDir, target), { recursive: true, force: true });
}

/** `core-bin/.manifests/<target>.json` — never packed, never committed. */
export function manifestPath(manifestsDir, target) {
  return join(manifestsDir, `${target}.json`);
}

export function writeStagingManifest(manifestsDir, target, manifest) {
  mkdirSync(manifestsDir, { recursive: true });
  writeFileSync(manifestPath(manifestsDir, target), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** null when the manifest never existed; a corrupt file throws (fail closed). */
export function readStagingManifest(manifestsDir, target) {
  try {
    return JSON.parse(readFileSync(manifestPath(manifestsDir, target), 'utf8'));
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

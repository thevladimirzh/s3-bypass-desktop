/**
 * M2-03 (RED) — core binary pinning, executable specification.
 *
 * Plan rows: TC-PKG-01..03 (`docs/qa/m2-test-plan.md` §2, §14-style DV-39).
 * Basis: BRIEF §9 ("pinned to the latest Fedarisha/Xray-core-fedarisha
 * release; commit SHA recorded in docs"), M2 DoD #1 ("SHA-256 of bundled
 * core verified at build time"), board task M2-03.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR GREEN (developer) — the artifacts this file must stop failing on:
 *
 *   1. `docs/analysis/core-pin.md` — the pin record, containing:
 *        | Release tag | `vX.Y.Z-<fed>` |
 *        | Published   | <ISO 8601 date> |
 *        | Commit SHA  | `<40 lowercase hex>` |
 *      and one row per bundled asset with a 64-lowercase-hex SHA-256:
 *        | `Xray-linux-64.zip` | <64 hex> | <bytes> |
 *        | `Xray-macos-64.zip` | <64 hex> | <bytes> |
 *        | `Xray-macos-arm64-v8a.zip` | <64 hex> | <bytes> |
 *      The hashes are computed from the actual downloaded release assets and
 *      cross-checked against the upstream `.dgst` files (recorded as a note).
 *
 *   2. `scripts/verify-core-pin.mjs` — CLI:
 *        node scripts/verify-core-pin.mjs [--pin-doc <path>] <file> <asset>
 *      - default pin doc = `docs/analysis/core-pin.md` (resolved from the
 *        script location, not from cwd);
 *      - match → stdout "core pin OK", exit 0;
 *      - mismatch or asset absent from the doc → stderr naming the asset and
 *        the expected/actual SHA-256 with the word MISMATCH, exit 1;
 *      - bad arity → usage on stderr, exit 2.
 *
 *   3. `package.json` → scripts."verify:core-pin" wrapping the CLI.
 *
 * The `--pin-doc` override exists so tests can verify the CLI against a
 * synthetic record without shipping the 3×~23 MB release assets in the repo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Observed RED: the pin doc and the script do not exist yet (M2-03 not
 * started) — TC-PKG-01 fails on the missing doc/script, TC-PKG-02/03 fail
 * because the CLI cannot spawn. Baseline untouched: 215 passed / 0 failed.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Repo root, resolved from this file (tests/unit → root). */
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Read one repo file as utf8 (throws if absent — RED behavior). */
function repoFile(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/** The three assets that get bundled (darwin-x64, darwin-arm64, linux-x64). */
const BUNDLED_ASSETS = [
  'Xray-linux-64.zip',
  'Xray-macos-64.zip',
  'Xray-macos-arm64-v8a.zip',
] as const;

/** Write a synthetic pin doc exposing `asset` with `sha256Hex`. */
function writePinDoc(asset: string, sha256Hex: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'core-pin-'));
  const path = join(dir, 'pin.md');
  writeFileSync(
    path,
    [
      '| Release tag | `v0.0.0-test` |',
      '| Commit SHA | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |',
      '',
      '| Asset | SHA-256 | Bytes |',
      `| \`${asset}\` | ${sha256Hex} | 9 |`,
      '',
    ].join('\n'),
  );
  return path;
}

/** Run the verify CLI; returns the completed spawn result. */
function runVerify(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['scripts/verify-core-pin.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('TC-PKG-01 — pin record + npm script exist and are structured (M2-03)', () => {
  it('corePin.pinDocAndNpmScript.structured', () => {
    const pkg = JSON.parse(repoFile('package.json')) as { scripts?: Record<string, string> };
    expect(
      pkg.scripts?.['verify:core-pin'],
      'M2-03: package.json must expose "verify:core-pin" wrapping ' +
        'scripts/verify-core-pin.mjs (M2 DoD #1 — verified at build time)',
    ).toContain('verify-core-pin.mjs');

    const pinDoc = repoFile('docs/analysis/core-pin.md');
    expect(
      pinDoc,
      'M2-03/BRIEF §9: the pin record must state the release tag row ' +
        '(`| Release tag | `v…` |`)',
    ).toMatch(/\| Release tag \| `v[^`]+` \|/);
    expect(
      pinDoc,
      'M2-03/BRIEF §9: the pin record must state the tag commit SHA ' +
        '(`| Commit SHA | `<40 hex>` |`)',
    ).toMatch(/\| Commit SHA \| `[0-9a-f]{40}` \|/);
    for (const asset of BUNDLED_ASSETS) {
      const row = pinDoc
        .split('\n')
        .find((line) => line.includes(asset) && /\b[0-9a-f]{64}\b/.test(line));
      expect(
        row,
        `M2-03/M2 DoD #1: the pin record must carry a 64-hex SHA-256 row for the bundled asset ${asset}`,
      ).toBeDefined();
    }
  });
});

describe('TC-PKG-02 — verify CLI fails loudly on mismatch (M2-03)', () => {
  it('corePin.verify.mismatchExitsOneAndNamesAsset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-pin-'));
    const file = join(dir, 'asset.zip');
    writeFileSync(file, 'these-are-not-the-pinned-bytes');
    // The doc pins a different digest than the file actually hashes to.
    const pinDoc = writePinDoc('Xray-test.zip', '0'.repeat(64));

    const res = runVerify(['--pin-doc', pinDoc, file, 'Xray-test.zip']);
    const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(
      res.status,
      `M2-03: a hash mismatch must exit 1 (got ${String(res.status)}); output:\n${output}`,
    ).toBe(1);
    expect(output, 'M2-03: the failure output must name the asset').toContain('Xray-test.zip');
    expect(output, 'M2-03: the failure output must say MISMATCH').toContain('MISMATCH');
    expect(output, 'M2-03: the failure output must show expected/actual digests').toMatch(
      /[0-9a-f]{64}/,
    );
  });
});

describe('TC-PKG-03 — verify CLI passes on a real match (M2-03)', () => {
  it('corePin.verify.matchViaPinDocOverrideExitsZero', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-pin-'));
    const file = join(dir, 'asset.zip');
    const bytes = 'the-exact-bytes-we-pin';
    writeFileSync(file, bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const pinDoc = writePinDoc('Xray-test.zip', sha);

    const res = runVerify(['--pin-doc', pinDoc, file, 'Xray-test.zip']);
    const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(
      res.status,
      `M2-03: a matching digest must exit 0 (got ${String(res.status)}); output:\n${output}`,
    ).toBe(0);
    expect(output, 'M2-03: the success output must confirm the pin').toContain('OK');
    expect(output, 'M2-03: the success output must name the verified asset').toContain(
      'Xray-test.zip',
    );
  });
});

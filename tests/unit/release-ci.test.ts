/**
 * M2-07 (RED) — release CI & gates, executable specification.
 *
 * Plan rows: TC-PKG-11, TC-PKG-12, TC-PKG-13, TC-PKG-14
 * (`docs/qa/m2-test-plan.md` §6, DV-43).
 * Basis: board task M2-07 (`docs/plans/m2-packaging.md` Phase D); M2 DoD #1
 * (SHA-256 of the bundled core verified at build time); the two documented
 * M1 deferrals — coverage job (G-05, acceptance-m1-27.md) and the e2e job
 * (`docs/qa/e2e-ci-proposal.md`, strategy §2 L3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR GREEN (devops) — the artifacts this file must stop failing on:
 *
 *   1. `.github/workflows/release.yml` (NEW):
 *        - trigger: `on: push: tags:` covering `v*` tags;
 *        - `permissions: contents: read` and a concurrency group (house
 *          pattern copied from ci.yml);
 *        - matrix job over `[macos-latest, ubuntu-latest]`;
 *        - steps: checkout + setup-node pinned to full 40-hex SHAs (reuse
 *          the exact SHAs already in ci.yml), `npm ci`,
 *          `npm run prepare:core` (re-verifies the pinned core digests —
 *          DoD #1 at build time), `apt-get install -y rpm` on the Linux leg
 *          (electron-builder's rpm target), `npm run dist`,
 *          `npm run release:manifest -- release` (writes AND re-verifies
 *          `release/SHA256SUMS.txt`), and `actions/upload-artifact` pinned
 *          to a full 40-hex SHA with `if-no-files-found: error`.
 *
 *   2. `.github/workflows/ci.yml` — the existing `checks` job is untouched;
 *      two jobs are ADDED:
 *        - `coverage:` (ubuntu-latest, `ELECTRON_SKIP_BINARY_DOWNLOAD: '1'`,
 *          `npm run test:coverage`) — the G-05 landing. The authoritative
 *          full-suite number was measured BEFORE landing the gate (the G-05
 *          deferral note demands it): **84.59 % lines / 83.85 % stmts /
 *          71.92 % branch / 86.61 % funcs**, ubuntu-latest, probe run
 *          `37711514257` of 2026-10-08, full suite green — passes
 *          `coverage.thresholds.lines: 80` (vitest.config.ts).
 *        - `e2e:` — macOS leg ONLY, per the proposal's own rollout order
 *          ("1. macOS leg first … 2. Linux leg behind a keyring/safeStorage
 *          verification (R-5 mitigation path)"): `runs-on: macos-latest`,
 *          `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'`, deliberately NO
 *          `ELECTRON_SKIP_BINARY_DOWNLOAD` (the job needs the real Electron
 *          binary), `npm ci` → `npm run lint` → `npm run typecheck` → the
 *          port-10808 preflight → `npm run test:e2e`. The Linux leg is NOT
 *          in this batch — it lands in its own RED/GREEN batch with its
 *          safeStorage verification (DV-43).
 *
 *   3. `scripts/release-manifest.mjs` + package.json `release:manifest`:
 *      CLI `node scripts/release-manifest.mjs <dir>` —
 *        - writes `<dir>/SHA256SUMS.txt`: one line per top-level FILE of
 *          `<dir>`, sorted by filename, format `<sha256>  <filename>`; the
 *          manifest file itself and subdirectories are skipped;
 *        - immediately re-verifies by re-hashing: all match → stdout mentions
 *          `OK` and the file count, exit 0;
 *        - any changed/missing file → stderr `MISMATCH` naming the file and
 *          the expected/actual digests, exit 1;
 *        - anything other than exactly one positional argument → usage on
 *          stderr, exit 2.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Observed RED: TC-PKG-11 fails on the absent release workflow, TC-PKG-12/13
 * on the absent `coverage`/`e2e` jobs in ci.yml, TC-PKG-14 on the absent
 * manifest script (ENOENT). Baseline untouched: 229 passed / 0 failed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Repo root, resolved from this file (tests/unit → root). */
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Read one repo file as utf8 (throws if absent — RED behavior). */
function repoFile(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/**
 * Lines of an INDENTED workflow block (`  <name>:` — a ci.yml job) — the
 * block ends at the next key at the SAME indent; deeper keys belong to it.
 * (Top-level YAML sections use the col-0 scanner in builder-config.test.ts;
 * workflow jobs are indented under `jobs:`.)
 */
function jobBlock(yml: string, job: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  expect(start, `ci.yml must declare the "${job}" job under jobs: (M2-07)`).toBeGreaterThanOrEqual(
    0,
  );
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^ {2}[A-Za-z][\w-]*:/.test(line)) break;
    block.push(line);
  }
  return block;
}

/** Run the manifest CLI against a directory (spawnSync, synthetic tmp). */
function runManifest(dir: string) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', 'release-manifest.mjs'), dir], {
    encoding: 'utf8',
  });
}

describe('TC-PKG-11 — tag-driven release workflow builds + verifies (M2-07)', () => {
  it('releaseWorkflow.tagMatrixBuildsAndVerifies', () => {
    const yml = repoFile('.github/workflows/release.yml');
    expect(
      yml,
      'M2-07/DoD #1: the release workflow must trigger on v* tags (push-a-tag → ' +
        'artifacts, board Phase D)',
    ).toMatch(/tags:/);
    expect(yml, 'M2-07: the tag pattern must cover version tags').toContain("'v*'");
    expect(
      yml,
      'M2-07: the build matrix must cover BOTH targets — macos-latest (dmg) and ' +
        'ubuntu-latest (AppImage + .deb + .rpm, BRIEF §9)',
    ).toMatch(/macos-latest/);
    expect(yml, 'M2-07: ubuntu-latest must be in the release matrix').toMatch(/ubuntu-latest/);
    expect(
      yml,
      'M2-07/DoD #1: the workflow must run `npm run prepare:core` — it verifies ' +
        'every pinned core digest before anything is packaged',
    ).toContain('npm run prepare:core');
    expect(yml, 'M2-07: the workflow must build the artifacts (`npm run dist`)').toContain(
      'npm run dist',
    );
    expect(
      yml,
      'M2-07/DoD #1: the workflow must write AND verify the SHA-256 manifest via ' +
        '`npm run release:manifest`',
    ).toContain('npm run release:manifest');
    expect(
      yml,
      'M2-07: artifact upload must use actions pinned to a full commit SHA ' +
        '(house supply-chain style — same discipline as ci.yml)',
    ).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40}/);
    expect(
      yml,
      'M2-07: a missing artifact must FAIL the release build, never upload empty ' +
        '(if-no-files-found: error)',
    ).toContain('if-no-files-found: error');
  });
});

describe('TC-PKG-12 — the coverage job lands with the authoritative number (M2-07, G-05)', () => {
  it('ciWorkflow.coverageJobLands', () => {
    const yml = repoFile('.github/workflows/ci.yml');
    const coverage = jobBlock(yml, 'coverage');
    expect(
      coverage.join('\n'),
      'M2-07/G-05: the coverage job must run `npm run test:coverage` — the ' +
        'documented M1 deferral lands here (thresholds.lines: 80, ' +
        'authoritative full-suite number 84.59% measured by probe run ' +
        '37711514257 before landing)',
    ).toContain('npm run test:coverage');
    expect(
      coverage.join('\n'),
      'M2-07: the coverage job must NOT download an Electron binary (same env as ' +
        'the checks job — unit layer mocks electron)',
    ).toContain('ELECTRON_SKIP_BINARY_DOWNLOAD');
  });
});

describe('TC-PKG-13 — the e2e job lands as the proposal rollout #1 (M2-07)', () => {
  it('ciWorkflow.e2eJobPerProposal', () => {
    const yml = repoFile('.github/workflows/ci.yml');
    const e2e = jobBlock(yml, 'e2e');
    const block = e2e.join('\n');
    expect(
      block,
      'M2-07: the e2e job must run `npm run test:e2e` (the M1-24 smoke, DV-31)',
    ).toContain('npm run test:e2e');
    expect(
      block,
      'M2-07/proposal rollout #1: the landed leg is macOS (locally verified ' +
        'environment) — runs-on: macos-latest',
    ).toContain('macos-latest');
    expect(
      block,
      'M2-07/proposal note: the e2e job must NOT set ELECTRON_SKIP_BINARY_DOWNLOAD ' +
        '— it needs the real Electron binary (job-level env only sets ' +
        'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)',
    ).not.toContain('ELECTRON_SKIP_BINARY_DOWNLOAD');
    expect(
      block,
      'M2-07/proposal rollout #2 (Linux) is deferred to its own batch behind the ' +
        'keyring/safeStorage verification (R-5) — the ubuntu leg must NOT be ' +
        'landed yet',
    ).not.toContain('ubuntu-latest');
    expect(
      block,
      'M2-07/proposal: the port-10808 preflight step must land with the job ' +
        '(the suite fails loudly on a held port — M1-24 note)',
    ).toContain('Port preflight');
  });
});

describe('TC-PKG-14 — manifest CLI writes, verifies and fails loudly (M2-07)', () => {
  it('releaseManifest.writeVerifyAndTamper', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-manifest-'));
    try {
      writeFileSync(join(dir, 'alpha.dmg'), 'alpha-payload');
      mkdirSync(join(dir, 'subfolder'));
      writeFileSync(join(dir, 'beta.deb'), 'beta-payload');

      const first = runManifest(dir);
      expect(
        first.status,
        'M2-07/DoD #1: a clean directory must produce a verified manifest ' +
          `(exit 0); stderr: ${first.stderr}`,
      ).toBe(0);
      expect(first.stdout, 'M2-07: the CLI must report success on stdout').toMatch(/OK/);
      const manifest = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8');
      expect(
        manifest,
        'M2-07: the manifest must list every top-level file (subdirectories are ' +
          'skipped, the manifest itself is never hashed)',
      ).toMatch(/^[0-9a-f]{64} {2}alpha\.dmg$[0-9a-f]{64} {2}beta\.deb$/ms);

      writeFileSync(join(dir, 'alpha.dmg'), 'tampered-payload');
      const second = runManifest(dir);
      expect(
        second.status,
        'M2-07/DoD #1: a tampered artifact must make the verification FAIL ' +
          '(exit 1) — the manifest is re-hashed, never trusted as written',
      ).toBe(1);
      expect(
        second.stderr,
        'M2-07: the failure must say MISMATCH and name the changed file with ' +
          'expected/actual digests',
      ).toMatch(/MISMATCH/);
      expect(second.stderr, 'M2-07: the changed file must be named').toContain('alpha.dmg');
      expect(second.stderr).toMatch(/[0-9a-f]{64}/);

      const usage = spawnSync(process.execPath, [join(ROOT, 'scripts', 'release-manifest.mjs')], {
        encoding: 'utf8',
      });
      expect(
        usage.status,
        'M2-07: bad arguments (no dir) must exit 2 with usage, never half-write ' + 'a manifest',
      ).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

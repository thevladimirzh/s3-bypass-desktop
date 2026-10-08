/**
 * M2-05 (RED) — electron-builder packaging config, executable specification.
 *
 * Plan rows: TC-PKG-05, TC-PKG-06, TC-PKG-07 (`docs/qa/m2-test-plan.md` §4,
 * DV-41).
 * Basis: board task M2-05 (`docs/plans/m2-packaging.md` Phase C); owner
 * decisions of 2026-10-08 (BRIEF §9 — Linux ships AppImage + `.deb` +
 * `.rpm`; BRIEF §10 — no Apple Developer account, the build is unsigned);
 * M2 DoD #4 (license notice inside artifacts); M1 finding S5-18 (pin `asar`
 * explicitly); M2-04 staged `core-bin/<target>/`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR GREEN (developer) — the artifacts this file must stop failing on:
 *
 *   1. `electron-builder.yml` amendments (prettier normalizes the YAML; the
 *      tests parse blocks comment-aware, so indentation is not contractual):
 *        - top level: `asar: true` (explicit — S5-18 recommendation);
 *        - `mac:` keeps `target: - dmg`, gains `identity: null` (skip code
 *          signing — the decided path for the unsigned build) and:
 *          ```yaml
 *          extraResources:
 *            - from: core-bin/darwin-${arch}
 *              to: core/darwin
 *          ```
 *        - `linux:` targets become AppImage, deb, rpm (in that order) and:
 *          ```yaml
 *          extraResources:
 *            - from: core-bin/linux-${arch}
 *              to: core/linux
 *          ```
 *      Directory-level extraResources (xray + geoip.dat + geosite.dat +
 *      LICENSE + README.md) — the resolver path from TC-02-18
 *      (`core/<platform>/xray`) and the M2-06 attributions both land there.
 *
 *   2. `docs/product/macos-gatekeeper.md` (NEW, English) — how to open the
 *      unsigned macOS build: why it is unsigned (owner decision 2026-10-08:
 *      no Apple Developer account; notarization is out of scope), the
 *      right-click → Open first-run path, the System Settings →
 *      Privacy & Security → Open Anyway path, the `xattr -cr` quarantine
 *      alternative, and an explicit statement that the build carries NO
 *      notarization.
 *
 * NOT in this batch (explicitly): running `npm run dist` — the actual build
 * is M2-07's release CI (DoD #1) and M2-12's fresh-machine install.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Observed RED: TC-PKG-05 fails on the missing `asar: true` pin, TC-PKG-06
 * on the missing `extraResources` rows (the M0 config exists but predates
 * M2-04), TC-PKG-07 on the absent Gatekeeper doc (ENOENT). Baseline
 * untouched: 223 passed / 0 failed.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Repo root, resolved from this file (tests/unit → root). */
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Read one repo file as utf8 (throws if absent — RED behavior). */
function repoFile(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/** Drop blank lines and whole-line comments (never contractual). */
function live(lines: string[]): string[] {
  return lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('#');
  });
}

/**
 * Lines of the top-level YAML block `header:` — a block ends at the next
 * top-level key (col-0 comments do NOT end it). Prettier keeps two-space
 * indentation, so section membership, not column counts, is the contract.
 */
function blockOf(yml: string, header: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `${header}:`);
  expect(
    start,
    `M2-05: electron-builder.yml must declare a top-level "${header}:" section`,
  ).toBeGreaterThanOrEqual(0);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^[A-Za-z][\w-]*:/.test(line)) break;
    block.push(line);
  }
  return block;
}

describe('TC-PKG-05 — target matrix, explicit asar, unsigned macOS (M2-05)', () => {
  it('builderConfig.targetsCompleteUnsignedAsarOn', () => {
    const yml = repoFile('electron-builder.yml');
    const top = live(yml.split('\n'));
    expect(
      top.some((line) => line.trim() === 'asar: true'),
      'M2-05/M1 finding S5-18: `asar` must be pinned explicitly to true ' +
        '(default already is, but the config may not rely on it)',
    ).toBe(true);

    const mac = live(blockOf(yml, 'mac'));
    expect(
      mac.some((line) => line.trim() === '- dmg'),
      'M2-05: macOS must ship a .dmg target',
    ).toBe(true);
    expect(
      mac.some((line) => line.trim() === 'identity: null'),
      'M2-05/owner decision 2026-10-08 (BRIEF §10): no Apple Developer ' +
        'account — the mac build must DECLARE itself unsigned ' +
        '(identity: null), never configure a signing identity',
    ).toBe(true);

    const linux = live(blockOf(yml, 'linux'));
    for (const target of ['AppImage', 'deb', 'rpm']) {
      expect(
        linux.some((line) => line.trim() === `- ${target}`),
        `M2-05/owner decision 2026-10-08 (BRIEF §9): Linux ships AppImage + ` +
          `.deb + .rpm — the linux: block is missing "- ${target}"`,
      ).toBe(true);
    }
  });
});

describe('TC-PKG-06 — the pinned core is packed via extraResources (M2-05)', () => {
  it('builderConfig.coreBundledViaExtraResources', () => {
    const yml = repoFile('electron-builder.yml');
    const mac = live(blockOf(yml, 'mac'));
    const linux = live(blockOf(yml, 'linux'));
    expect(
      mac.some((line) => line.includes('core-bin/darwin-${arch}')),
      'M2-05/M2-04: mac.extraResources must stage core-bin/darwin-${arch} ' +
        '(prepare:core output; ${arch} = x64 | arm64 matches the staged dirs)',
    ).toBe(true);
    expect(
      mac.some((line) => line.includes('to: core/darwin')),
      'M2-05/TC-02-18: the mac bundle must land at core/darwin — that is ' +
        'the path resolveCoreBinaryPath() serves',
    ).toBe(true);
    expect(
      linux.some((line) => line.includes('core-bin/linux-${arch}')),
      'M2-05/M2-04: linux.extraResources must stage core-bin/linux-${arch}',
    ).toBe(true);
    expect(
      linux.some((line) => line.includes('to: core/linux')),
      'M2-05/TC-02-18: the linux bundle must land at core/linux — that is ' +
        'the path resolveCoreBinaryPath() serves',
    ).toBe(true);
  });
});

describe('TC-PKG-07 — unsigned-build Gatekeeper instructions ship as docs (M2-05)', () => {
  it('builderConfig.gatekeeperInstructionsExist', () => {
    const doc = repoFile('docs/product/macos-gatekeeper.md');
    expect(
      doc,
      'M2-05: the instructions must include the quarantine-clearing `xattr -cr` ' +
        'command (BRIEF §9 macOS: unsigned build + Gatekeeper instructions)',
    ).toMatch(/xattr -cr/);
    expect(
      doc,
      'M2-05: the instructions must walk the System Settings → Privacy & ' +
        'Security → Open Anyway path',
    ).toMatch(/Privacy & Security/);
    expect(doc, 'M2-05: the instructions must cover the right-click → Open first-run path').toMatch(
      /right-click/i,
    );
    expect(
      doc.toLowerCase(),
      'M2-05/owner decision 2026-10-08: the doc must state plainly that the ' +
        'build carries NO notarization (honesty — the app is unsigned)',
    ).toContain('notarization');
  });
});

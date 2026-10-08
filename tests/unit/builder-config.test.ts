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
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * M3-07 (RED) — app icon + naming, owner decision 2026-10-08 (board
 * `docs/plans/m3-polish.md` Phase C): the icon is GENERATED IN-REPO —
 * `assets/app-icon.svg` is the source, `scripts/build-icon.mjs` produces
 * the `.icns` (darwin, iconutil toolchain) and the `.png` (linux, ≥ 256 px)
 * artifacts the builder config wires in; NO owner artwork is involved.
 * The `productName` pin (BRIEF §9) rides along as an additive naming guard.
 * Test plan: TC-POL-04 (docs/qa/m3-test-plan.md §4).
 */
describe('TC-POL-04 — app icon generated in-repo + naming pin (M3-07)', () => {
  it('builderConfig.iconWiredToGeneratedArtifactsAndProductNamePinned', () => {
    const yml = repoFile('electron-builder.yml');
    const top = live(yml.split('\n'));
    expect(
      top.some((line) => line.trim() === 'productName: S3 Bypass Desktop'),
      'M3-07/BRIEF §9: productName stays exactly "S3 Bypass Desktop" — the naming ' +
        'pin may never drift while the icon work lands',
    ).toBe(true);
    const mac = live(blockOf(yml, 'mac'));
    expect(
      mac.some((line) => line.trim() === 'icon: assets/icon.icns'),
      'M3-07: the mac: block must declare the generated .icns ' +
        '(electron-builder icon:, produced from assets/app-icon.svg)',
    ).toBe(true);
    const linux = live(blockOf(yml, 'linux'));
    expect(
      linux.some((line) => line.trim() === 'icon: assets/icon.png'),
      'M3-07: the linux: block must declare the generated .png ' +
        '(electron-builder icon:, produced from assets/app-icon.svg)',
    ).toBe(true);
  });

  it('appIcon.sourceGeneratorAndArtifactsShipInRepo', () => {
    // ABSENCE RED (strategy §5.1): assets/ and the generator do not exist
    // yet — M3-07 GREEN creates them. Explicit reasons, never raw ENOENT.
    expect(
      existsSync(join(ROOT, 'assets/app-icon.svg')),
      'M3-07 (owner decision): the icon source is an in-repo SVG — assets/app-icon.svg ' +
        'must exist (no external artwork)',
    ).toBe(true);
    expect(
      existsSync(join(ROOT, 'scripts/build-icon.mjs')),
      'M3-07: scripts/build-icon.mjs must exist — it generates the .icns (darwin, ' +
        'iconutil) and the .png (linux) from the SVG source',
    ).toBe(true);
    expect(
      existsSync(join(ROOT, 'assets/icon.icns')),
      'M3-07: the generated darwin artifact assets/icon.icns ships in-repo so ' +
        'packaging needs no extra generation step',
    ).toBe(true);
    expect(
      existsSync(join(ROOT, 'assets/icon.png')),
      'M3-07: the generated linux artifact assets/icon.png ships in-repo',
    ).toBe(true);

    const script = repoFile('scripts/build-icon.mjs');
    expect(script, 'the generator reads the SVG source').toContain('assets/app-icon.svg');
    expect(script, 'the generator writes the darwin artifact').toContain('assets/icon.icns');
    expect(script, 'the generator writes the linux artifact').toContain('assets/icon.png');
    expect(
      script,
      'M3-07 board: the .icns is produced via the iconutil toolchain (iconset → icns)',
    ).toMatch(/iconutil/);
  });

  it('appIcon.artifactsAreRealIcnsAndPng', () => {
    // The artifacts must be REAL (magic bytes + size), not placeholders —
    // the config pins above are vacuous otherwise.
    const icns = readFileSync(join(ROOT, 'assets/icon.icns'));
    expect(
      icns.subarray(0, 4).toString('ascii'),
      'assets/icon.icns must be an ICNS container (magic "icns")',
    ).toBe('icns');
    expect(icns.length, 'assets/icon.icns must be a real container, not a stub').toBeGreaterThan(
      1000,
    );

    const png = readFileSync(join(ROOT, 'assets/icon.png'));
    expect(
      png.subarray(1, 4).toString('ascii'),
      'assets/icon.png must be a PNG (magic "PNG")',
    ).toBe('PNG');
    expect(
      png.readUInt32BE(16),
      'electron-builder linux wants ≥ 256 px (BRIEF §9)',
    ).toBeGreaterThanOrEqual(256);
    expect(png.readUInt32BE(20), 'the icon must be square').toBe(png.readUInt32BE(16));
  });

  it('appIcon.generatorWiredIntoPackageScripts', () => {
    const pkg = JSON.parse(repoFile('package.json')) as { scripts: Record<string, string> };
    expect(
      pkg.scripts['build:icon'],
      'M3-07: npm run build:icon must regenerate the artifacts (SVG is the source of truth)',
    ).toContain('build-icon.mjs');
  });
});

/**
 * TC-PKG-23 (M3-11 beta-build prep) — mac dmg names must carry the arch.
 *
 * Observed on release run 37848480103 (tag v0.1.0-beta.1): electron-builder
 * appends the arch suffix only for the NON-default arch, so the Intel build
 * landed as `S3 Bypass Desktop-0.1.0-beta.1.dmg` (verified `x86_64` by
 * `lipo -archs` on the mounted app) while Apple Silicon got the explicit
 * `-arm64`. `docs/user/beta-setup.md` promises testers `-x64.dmg` (the
 * issue #27 language) — an explicit `artifactName` makes reality match the
 * handout instead of amending the doc pins.
 */
describe('TC-PKG-23 — mac dmg names carry the arch (M3-11 beta handout)', () => {
  it('builderConfig.macArtifactNameIncludesArch', () => {
    const yml = repoFile('electron-builder.yml');
    const mac = live(blockOf(yml, 'mac'));
    expect(
      mac.some((line) => line.trim() === 'artifactName: ${productName}-${version}-${arch}.dmg'),
      'M3-11: the mac: block must declare an arch-explicit artifactName — ' +
        'electron-builder drops the suffix for the default arch, which produced ' +
        'an archless Intel dmg (run 37848480103) that beta-setup.md cannot ' +
        'reference unambiguously (ABSENCE RED)',
    ).toBe(true);
  });
});

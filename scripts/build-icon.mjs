#!/usr/bin/env node
/**
 * M3-07 (board Phase C, owner decision 2026-10-08) — app-icon generator.
 *
 * `assets/app-icon.svg` is the SOURCE OF TRUTH; this script rasterizes it
 * into the artifacts `electron-builder.yml` wires in:
 *
 *   assets/icon.png   — the linux icon (electron-builder `linux.icon`,
 *                       BRIEF §9 wants >= 256 px; we emit 1024);
 *   assets/icon.icns  — the darwin icon (`mac.icon`), produced through the
 *                       stock macOS toolchain: sips rasterize/resize into a
 *                       `.iconset` (16..512 plus @2x variants), then
 *                       `iconutil -c icns`.
 *
 * Both artifacts are COMMITTED so packaging runs without an extra step;
 * regenerate whenever the SVG changes (`npm run build:icon`) — the tests
 * (TC-POL-04, tests/unit/builder-config.test.ts) pin the artifacts'
 * reality: magic bytes, size, squareness.
 *
 * Platform: the darwin leg needs `sips` + `iconutil` (stock macOS). The
 * script fails loudly (non-zero exit, named reason) when a tool is missing —
 * never emits placeholder files (the RED pins must stay un-vacuous).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SVG = join(ROOT, 'assets', 'app-icon.svg');
const OUT_PNG = join(ROOT, 'assets', 'icon.png');
const OUT_ICNS = join(ROOT, 'assets', 'icon.icns');
const MASTER_SIZE = 1024;

/** Runs a stock tool; throws with a named reason instead of leaking raw output. */
function run(tool, args) {
  const result = spawnSync(tool, args, { encoding: 'utf8' });
  if (result.error) {
    throw new Error(
      `build-icon: ${tool} is required (stock macOS toolchain) but could not run: ` +
        `${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `build-icon: ${tool} ${args.join(' ')} failed (exit ${result.status}): ` +
        `${(result.stderr ?? '').trim() || '(no stderr)'}`,
    );
  }
}

function main() {
  if (!existsSync(SVG)) {
    throw new Error(`build-icon: the icon source ${SVG} must exist (M3-07)`);
  }

  // 1. Rasterize the SVG at full size (sips reads SVG and honors alpha).
  const master = join(ROOT, 'assets', '.icon-master.png');
  run('sips', [
    '-s',
    'format',
    'png',
    '--resampleHeightWidth',
    String(MASTER_SIZE),
    String(MASTER_SIZE),
    SVG,
    '--out',
    master,
  ]);

  // 2. The linux artifact is the master itself (1024 px, square, RGBA).
  run('sips', ['-s', 'format', 'png', master, '--out', OUT_PNG]);

  // 3. The darwin .iconset — every size electron-builder/macOS expect.
  const iconset = join(ROOT, 'assets', 'app-icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  for (const [name, size] of [
    ['icon_16x16', 16],
    ['icon_32x32', 32],
    ['icon_128x128', 128],
    ['icon_256x256', 256],
    ['icon_512x512', 512],
  ]) {
    run('sips', ['-z', String(size), String(size), master, '--out', join(iconset, `${name}.png`)]);
    run('sips', [
      '-z',
      String(size * 2),
      String(size * 2),
      master,
      '--out',
      join(iconset, `${name}@2x.png`),
    ]);
  }

  // 4. iconset -> icns (the M3-07 board pin: the iconutil toolchain).
  run('iconutil', ['-c', 'icns', iconset, '-o', OUT_ICNS]);
  rmSync(iconset, { recursive: true, force: true });
  rmSync(master, { force: true });

  console.log(`build-icon: wrote ${OUT_PNG} and ${OUT_ICNS} from assets/app-icon.svg`);
}

main();

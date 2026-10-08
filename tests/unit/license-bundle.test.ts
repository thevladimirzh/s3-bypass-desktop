/**
 * M2-06 (RED) — third-party license attributions, executable specification.
 *
 * Plan rows: TC-PKG-08, TC-PKG-09, TC-PKG-10 (`docs/qa/m2-test-plan.md` §5,
 * DV-42).
 * Basis: board task M2-06 (`docs/plans/m2-packaging.md` Phase C); BRIEF §5;
 * M2 DoD #4 ("License notice (core: MPL-2.0) + third-party attributions
 * present in artifacts"); the license reconciliation of 2026-10-08 (commit
 * history — the core is MPL-2.0 per the release artifacts, the client is
 * GPL-3.0).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR GREEN (developer) — the artifacts this file must stop failing on:
 *
 *   1. `resources/licenses/THIRD-PARTY-NOTICES.md` (NEW, English) lists every
 *      third-party component that ships in the artifacts:
 *        - Xray-core-fedarisha — **MPL-2.0**, pinned in
 *          `docs/analysis/core-pin.md` (release tag + commit + SHA-256);
 *        - Electron — MIT;
 *        - react and react-dom — MIT;
 *      and states (a) the full license texts live in this same directory,
 *      (b) the application itself is GPL-3.0 (root `LICENSE`).
 *
 *   2. `resources/licenses/` full texts (NEW):
 *        - `xray-core-fedarisha-LICENSE.txt` — verbatim copy of the LICENSE
 *          inside the pinned release assets (opens with "Mozilla Public
 *          License Version 2.0"; source: the `prepare:core` staging output
 *          in `core-bin/`);
 *        - `electron-LICENSE.txt` — verbatim `node_modules/electron/LICENSE`;
 *        - `react-LICENSE.txt` — verbatim `node_modules/react/LICENSE`.
 *
 *   3. `electron-builder.yml` gains a TOP-LEVEL `extraResources` entry
 *      (app-file matcher concatenates the global list with the platform
 *      blocks — verified in `app-builder-lib/out/fileMatcher.js`
 *      `getFileMatchers`, so it composes with M2-05's mac/linux core
 *      entries instead of replacing them):
 *
 *        extraResources:
 *          - from: resources/licenses
 *            to: licenses
 *
 *      Directory-level `from` copies CONTENTS into the destination, so the
 *      packaged app gets `Contents/Resources/licenses/…` (mac) /
 *      `resources/licenses/…` (linux) — next to the bundled core, inside
 *      every artifact (dmg/AppImage/deb/rpm), satisfying DoD #4.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Observed RED: TC-PKG-08/09 fail on the absent `resources/licenses/`
 * directory (ENOENT), TC-PKG-10 on the missing top-level `extraResources`
 * entry (the M2-05 config has only the platform blocks). Baseline untouched:
 * 226 passed / 0 failed.
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
 * top-level key (col-0 comments do NOT end it). Same scanner contract as
 * `tests/unit/builder-config.test.ts` (duplicated on purpose: M1 precedent
 * keeps per-file helpers local, see BINARY_PATH in core-wiring/quit tests).
 */
function blockOf(yml: string, header: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `${header}:`);
  expect(
    start,
    `M2-06: electron-builder.yml must declare a top-level "${header}:" section`,
  ).toBeGreaterThanOrEqual(0);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^[A-Za-z][\w-]*:/.test(line)) break;
    block.push(line);
  }
  return block;
}

describe('TC-PKG-08 — the notices list every shipped package (M2-06)', () => {
  it('licenseBundle.noticesListsEveryShippedPackage', () => {
    const notices = repoFile('resources/licenses/THIRD-PARTY-NOTICES.md');
    expect(
      notices,
      'M2-06/DoD #4: the notices must attribute the bundled core as ' +
        'Xray-core-fedarisha under MPL-2.0 (reconciled 2026-10-08)',
    ).toMatch(/Xray-core-fedarisha[\s\S]*MPL-2\.0/);
    expect(
      notices,
      'M2-06: the notices must point at the pin record as the core provenance ' +
        '(tag/commit/SHA-256 — BRIEF §9)',
    ).toContain('docs/analysis/core-pin.md');
    expect(
      notices,
      'M2-06: the notices must attribute Electron (MIT) — it ships in every artifact',
    ).toMatch(/Electron[\s\S]*MIT/);
    expect(
      notices,
      'M2-06: the notices must attribute react/react-dom (MIT) — bundled into asar',
    ).toMatch(/react[\s\S]*MIT/);
    expect(
      notices.toLowerCase(),
      'M2-06: the notices must state the application itself is gpl-3.0 ' +
        '(root LICENSE — the client/core license split)',
    ).toContain('gpl-3.0');
  });
});

describe('TC-PKG-09 — full license texts sit next to the notices (M2-06)', () => {
  it('licenseBundle.licenseTextsPresent', () => {
    expect(
      repoFile('resources/licenses/xray-core-fedarisha-LICENSE.txt'),
      'M2-06/DoD #4: the core license text must ship verbatim — MPL-2.0 ' +
        '(the LICENSE inside the pinned release assets)',
    ).toMatch(/^Mozilla Public License Version 2\.0/);
    expect(
      repoFile('resources/licenses/electron-LICENSE.txt'),
      'M2-06: the Electron license text must ship (MIT grant clause)',
    ).toContain('Permission is hereby granted, free of charge');
    expect(
      repoFile('resources/licenses/react-LICENSE.txt'),
      'M2-06: the react license text must ship (MIT grant clause)',
    ).toContain('Permission is hereby granted, free of charge');
  });
});

describe('TC-PKG-10 — the attributions are packed into every artifact (M2-06)', () => {
  it('licenseBundle.packedViaExtraResources', () => {
    const yml = repoFile('electron-builder.yml');
    const extra = live(blockOf(yml, 'extraResources'));
    expect(
      extra.some((line) => line.includes('from: resources/licenses')),
      'M2-06/DoD #4: a TOP-LEVEL extraResources entry must copy ' +
        'resources/licenses (composed with the platform blocks — the ' +
        'electron-builder matcher concatenates global + platform lists)',
    ).toBe(true);
    expect(
      extra.some((line) => line.includes('to: licenses')),
      'M2-06: the packaged location is Resources/licenses — next to the ' +
        'bundled core, inside dmg/AppImage/deb/rpm alike',
    ).toBe(true);
  });
});

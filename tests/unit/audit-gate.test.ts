/**
 * TC-PKG-16 / TC-PKG-17 — M2-08: live `npm audit` evidence for the
 * packaging chain (issue #2 "M2 gate", M0-19 spot-check S4-5, M1 security
 * review S5-13 in docs/qa/security-m1-25.md).
 *
 * GREEN CONTRACT:
 *
 * TC-PKG-16 — `.github/workflows/ci.yml` `checks` job gains TWO audit
 *   steps (visible as distinct step blocks at indent 6):
 *   1. `npm audit --omit=dev` — BLOCKING production gate (S5-13's
 *      recommendation): the step must NOT carry `continue-on-error: true`
 *      — an advisory reaching the shipped tree has to redden CI;
 *   2. `npm audit --audit-level=high` — the informational leg issue #2
 *      calls optional — MUST carry `continue-on-error: true` (non-
 *      blocking): highs inside the dev-only packaging chain report but
 *      never block a build.
 *   Exactly one step may contain each command (a silent duplicate would
 *   weaken the gate).
 *
 * TC-PKG-17 — `docs/qa/security-m2-audit.md` (issue #2 deliverable) must
 *   pin the LIVE evidence, not a summary:
 *   - the exact root advisory: `GHSA-hp3w-g68c-fv3c` + `CVE-2026-97058`;
 *   - the live counts: `8 moderate` (full tree) and
 *     `found 0 vulnerabilities` (the `--omit=dev` run);
 *   - the no-remediation fact that drives the risk decision:
 *     `Patched versions: none`;
 *   - the shipped-artifacts exclusion proof: the chain sits in
 *     `devDependencies` and electron-builder packs `files: out/**`;
 *   - an accepted-risk note (issue #2's option 2) with re-evaluation
 *     triggers;
 *   - both CI legs (`--omit=dev`, `--audit-level=high`) recorded.
 *
 * Observed RED (baseline 234 passed / 0 failed, 36 files): TC-PKG-16
 * fails — ci.yml contains no `npm audit` step at all (0 blocks found);
 * TC-PKG-17 fails — the evidence doc does not exist (ENOENT).
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

/**
 * Split a workflow file into step blocks. Steps live at indent 6 under
 * `    steps:` in this repo's workflows, so every `      - ` line starts a
 * new block and the block runs until the next one (or EOF) — enough to
 * bind `continue-on-error` to the step that declares it.
 */
function stepBlocks(yml: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of yml.split('\n')) {
    if (line.startsWith('      - ')) {
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

describe('TC-PKG-16 — ci.yml audit legs: prod gate blocking, highs informational (issue #2 / S5-13)', () => {
  it('ci.auditLegsBlockProdAndInformHigh', () => {
    const blocks = stepBlocks(repoFile('.github/workflows/ci.yml'));

    const prod = blocks.filter((b) => b.includes('npm audit --omit=dev'));
    expect(prod, 'S5-13: CI must audit the PRODUCTION tree (`npm audit --omit=dev`)').toHaveLength(
      1,
    );
    expect(
      prod[0],
      'the production audit is a GATE — `continue-on-error: true` here ' +
        'would swallow an advisory that reaches the shipped tree (S5-13)',
    ).not.toContain('continue-on-error: true');

    const high = blocks.filter((b) => b.includes('npm audit --audit-level=high'));
    expect(
      high,
      'issue #2 optional item made real: an informational ' +
        '`npm audit --audit-level=high` leg in CI',
    ).toHaveLength(1);
    expect(
      high[0],
      'issue #2 requires this leg NON-BLOCKING — highs in the dev-only ' +
        'packaging chain must report but never redden CI ' +
        '(`continue-on-error: true`)',
    ).toContain('continue-on-error: true');
  });
});

describe('TC-PKG-17 — live audit evidence doc pins the gate (issue #2 deliverable)', () => {
  it('auditEvidence.acceptedRiskNoteSatisfiesGate', () => {
    const doc = repoFile('docs/qa/security-m2-audit.md');

    expect(doc, 'the exact root advisory of the live report').toContain('GHSA-hp3w-g68c-fv3c');
    expect(doc, 'CVE id of the root advisory').toContain('CVE-2026-97058');
    expect(doc, 'live full-tree count from `npm audit`').toContain('8 moderate');
    expect(doc, 'live production-tree result (`npm audit --omit=dev`)').toContain(
      'found 0 vulnerabilities',
    );
    expect(doc, 'the no-remediation fact driving the risk decision').toContain(
      'Patched versions: none',
    );
    expect(
      doc,
      'shipped-tree exclusion proof: the chain hangs off devDependencies ' +
        '(production deps are react/react-dom only)',
    ).toContain('devDependencies');
    expect(
      doc,
      'electron-builder packs only `files: out/**` — the packaging ' +
        'toolchain itself is never packed',
    ).toContain('files: out/**');
    expect(doc, 'issue #2 option 2 must be exercised in writing').toMatch(/accepted risk/i);
    expect(doc, 'the accepted risk must name re-evaluation triggers').toMatch(/re-evaluation/i);
    expect(doc, 'both CI legs recorded as landed with this gate').toContain('--omit=dev');
    expect(doc, 'both CI legs recorded as landed with this gate').toContain('--audit-level=high');
  });
});

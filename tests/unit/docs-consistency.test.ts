/**
 * M1-27b batch C (docs-drift remediation) — executable pins for the
 * acceptance findings D-04..D-10 (`docs/qa/acceptance-m1-27.md` §4,
 * issue #17) and the stale S5-16 doc-drift bundle
 * (`docs/qa/security-m1-25.md` — deadline M1-27 missed).
 *
 * Every pin below fails on the M1-27b baseline (observed RED, §13 of
 * `docs/qa/m1-test-plan.md`) and turns green only when the docs state what
 * the CODE does:
 *
 *   D-04  test-plan header says "in execution", not "plan only";
 *   D-05  m1-mvp status line reflects the M1-27b reality (no M1-15 env hold);
 *   D-06  milestones M1 row reflects Phases A–I + the M1-27 verdict;
 *   D-07  E2E run-count evidence reconciled to DV-31's single number
 *         (3 consecutive greens + 1 preflight-failure run — test-plan §13
 *         is the anchor; m1-mvp M1-24 row and e2e-ci-proposal follow);
 *   D-08  TC-03-17..21 IDs traceable into `status-machine.test.ts`
 *         (annotation only — titles/headers, zero behavior change);
 *   D-09  data-flows §4.2: no channel row still says PROPOSED (the legend
 *         records the flip as one spec amendment);
 *   D-10  S5-16 honesty markers: (a) E-IO-007 unreachable, (b) E-STOR-004
 *         unreachable, (c) E-CORE-004..007 classification pending, (d)
 *         quit-time surfacing not implemented, (f) the real log collector
 *         is named. Item (e) is D-02 — fixed by the M1-27b code commit.
 *
 * Contract: DOC-ONLY batch — no `src/**` behavior changes here; D-08's
 * half touches test titles only. The pins scan RAW file text, so any doc
 * rewording must land together with its pin in the GREEN commit — never
 * loosen a pin to fit stale prose (DV-35 precedent).
 *
 * IDs: TC-DOC-01..10 — §8 docs-consistency rows (new `TC-DOC-nn` family,
 * numbering rule amended, §14 DV-36), in `it(` order: 01 = D-04 test-plan
 * header, 02 = D-05 m1-mvp status line, 03 = D-06 milestones M1 row,
 * 04 = D-07 E2E run-counts, 05 = D-08 plan IDs traceable into the suite,
 * 06 = D-09 §4.2 statuses, 07 = D-10(a/b) unreachable codes,
 * 08 = D-10(c) pending classification, 09 = D-10(d) quit surfacing,
 * 10 = D-10(f) log collector naming, 11 = D-11 coverage gate (batch D,
 * §14 DV-37 — the family covers docs/config raw-text pins).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Read one repo document relative to this file (`tests/unit` → root). */
function doc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

const TEST_PLAN = doc('docs/qa/m1-test-plan.md');
const M1_PLAN = doc('docs/plans/m1-mvp.md');
const MILESTONES = doc('docs/plans/milestones.md');
const E2E_PROPOSAL = doc('docs/qa/e2e-ci-proposal.md');
const DATA_FLOWS = doc('docs/analysis/data-flows.md');
const ERRORS = doc('docs/analysis/errors.md');
const STATUS_MACHINE = doc('tests/unit/status-machine.test.ts');

/** The §4.2 slice between its heading and §4.3 — the status column lives here. */
const CHANNEL_TABLE = DATA_FLOWS.slice(
  DATA_FLOWS.indexOf('### 4.2'),
  DATA_FLOWS.indexOf('### 4.3'),
);

describe('D-04 — m1-test-plan header reflects execution (issue #17)', () => {
  it('docs.m1TestPlan.header.inExecutionReplacesPlanOnlyClaim', () => {
    expect(
      TEST_PLAN,
      'D-04: the plan header still reads "plan only — no test code written yet" while ' +
        'hundreds of RED/GREEN pins are executed — the status must say the plan is in ' +
        'execution with §13 as the log (acceptance-m1-27.md §4 D-04)',
    ).toContain('Status: **in execution**');
    expect(
      TEST_PLAN,
      'D-04: the stale "plan only" sentence must be gone from the header',
    ).not.toContain('plan only — no test code written yet');
    expect(
      TEST_PLAN,
      'D-04: the stale "Phase B starts after the analysis gate M1-02" tail must be gone',
    ).not.toContain('Phase B starts after the analysis gate M1-02');
  });
});

describe('D-05 — m1-mvp status line reflects current milestone state (issue #17)', () => {
  it('docs.m1Plan.statusLine.m27bRealityReplacesM15EnvHold', () => {
    expect(
      M1_PLAN,
      'D-05: line 3 still announces M1-15 as `blocked` on the local VPN env hold — ' +
        'M1-15 is `done`; the status line must name the ACTUAL open work ' +
        '(M1-27b remediation, issues #14..#18) instead (acceptance §4 D-05)',
    ).not.toContain('M1-15 `blocked` — env: local VPN holds');
    expect(
      M1_PLAN,
      'D-05: the status line must state the M1-27b remediation as the open work',
    ).toContain('M1-27b in progress');
  });
});

describe('D-06 — milestones M1 row reflects Phases A–I (issue #17)', () => {
  it('docs.milestones.m1Row.m27VerdictReplacesPhaseBOpening', () => {
    expect(
      MILESTONES,
      'D-06: the M1 row still says "Phase B opens with M1-04 RED" — Phase B opened ' +
        'ages ago; the row must carry the M1-27 acceptance verdict and the M1-27b ' +
        'remediation (acceptance §4 D-06)',
    ).not.toContain('Phase B opens with M1-04 RED');
    expect(MILESTONES, 'D-06: the M1 row must reference the M1-27b remediation state').toContain(
      'M1-27b',
    );
  });
});

describe('D-07 — E2E run-count evidence agrees with DV-31 (issue #17)', () => {
  it('docs.e2eRunCounts.reconciledToOneNumber', () => {
    // The anchor: test-plan §13 already records DV-31's single truth.
    expect(
      TEST_PLAN,
      'control: m1-test-plan §13 records the DV-31 evidence verbatim ' +
        '("×3 consecutive runs +1 preflight-failure run") — unchanged',
    ).toContain('×3 consecutive runs +1 preflight-failure run');
    expect(
      M1_PLAN,
      'D-07: the M1-24 row claims "green ×4 locally" — DV-31 counted 3 greens + 1 ' +
        'preflight-failure run; reconcile to the test-plan number (acceptance §4 D-07)',
    ).not.toContain('×4 locally');
    expect(M1_PLAN, 'D-07: the M1-24 row must state the reconciled DV-31 evidence').toContain(
      '1 preflight-failure run',
    );
    expect(
      E2E_PROPOSAL,
      'D-07: e2e-ci-proposal claims "(4× green)" — same DV-31 reconciliation',
    ).not.toContain('(4× green)');
    expect(E2E_PROPOSAL, 'D-07: the proposal must state the reconciled DV-31 evidence').toContain(
      'preflight-failure run',
    );
  });
});

describe('D-08 — TC-03-17..21 IDs traceable into the suite (issue #17)', () => {
  it('docs.testIds.statusMachineTitlesCarryPlanIds', () => {
    for (const id of ['TC-03-17', 'TC-03-18', 'TC-03-19', 'TC-03-20', 'TC-03-21']) {
      expect(
        STATUS_MACHINE,
        `D-08: ${id} (plan §3, written in status-machine.test.ts) never appears in the suite — ` +
          'annotation of titles/headers only, no behavior change ' +
          '(acceptance §4 D-08: 5 ID-traceability gaps)',
      ).toContain(id);
    }
  });
});

describe('D-09 — data-flows §4.2 statuses flipped to EXISTS (issue #17)', () => {
  it('docs.dataFlows.channelTable.noProposedRowRemains', () => {
    expect(CHANNEL_TABLE, 'control: the §4.2 slice resolves (the heading anchors exist)').toContain(
      '`core:start`',
    );
    const proposedRows = CHANNEL_TABLE.split('\n').filter(
      (line) => line.startsWith('| `') && line.includes('PROPOSED'),
    );
    expect(
      proposedRows,
      'D-09: every M1 channel below landed (M1-07/M1-12/M1-17/M1-19/M1-21, proxy:* ' +
        'with M1-27b) yet every row still says PROPOSED — flip each row per the ' +
        'legend as ONE spec amendment (acceptance §4 D-09)',
    ).toEqual([]);
    expect(
      CHANNEL_TABLE,
      'D-09: the legend must record that no PROPOSED rows remain (the amendment note)',
    ).toContain('no `PROPOSED` rows remain');
    expect(
      CHANNEL_TABLE,
      'D-09: "Shared payload types (to be added to src/shared/ipc.ts)" is stale — ' +
        'the types live in src/shared/ipc.ts today',
    ).not.toContain('to be added to `src/shared/ipc.ts`');
  });
});

describe('D-10 (S5-16 a/b) — unreachable codes marked in errors.md (issue #17)', () => {
  it('docs.errors.unreachableCodesMarked', () => {
    const io007 = ERRORS.split('\n').find((line) => line.startsWith('| `E-IO-007`')) ?? '';
    expect(
      io007,
      'D-10(a): E-IO-007 can never fire — T-cleanup swallows every rmSync failure ' +
        '(core-supervisor cleanupMaterialized); the row must say so ' +
        '(S5-16(a), reconcile docs with code)',
    ).toContain('Unreachable in M1');
    const stor004 = ERRORS.split('\n').find((line) => line.startsWith('| `E-STOR-004`')) ?? '';
    expect(
      stor004,
      'D-10(b): E-STOR-004 can never fire — decrypt failure maps to E-STOR-003 ' +
        '(secret-store); the row must say so (S5-16(b))',
    ).toContain('Unreachable in M1');
  });
});

describe('D-10 (S5-16 c) — E-CORE classification marked pending in data-flows (issue #17)', () => {
  it('docs.dataFlows.coreClassification.markedPendingA16', () => {
    expect(DATA_FLOWS, 'control: the E-CORE-004 pattern block is still present').toContain(
      'E-CORE-004',
    );
    expect(
      DATA_FLOWS,
      'D-10(c): data-flows states the E-CORE-004..007 classification unconditionally ' +
        'while nothing in code distinguishes it (everything is E-CORE-001 until A-16/' +
        'Q-AN-07 lands) — mark the block pending (S5-16(c))',
    ).toContain('PENDING in M1');
  });
});

describe('D-10 (S5-16 d) — quit-time surfacing stated honestly (issue #17)', () => {
  it('docs.dataFlows.quitOrdering.noUnimplementedPersistenceClaim', () => {
    expect(
      DATA_FLOWS,
      'D-10(d): the quit-ordering note still promises E-PLAT-003 "shown before exit / ' +
        'persisted as lastError for next launch" — beginQuit swallows teardown ' +
        'failures; the doc must state the gap (S5-16(d))',
    ).not.toContain('persisted as `lastError` for next launch');
    expect(
      DATA_FLOWS,
      'D-10(d): the quit-ordering note must state that quit-time surfacing is not ' +
        'implemented in M1 (the known M2 gap)',
    ).toContain('not implemented in M1');
  });
});

describe('D-10 (S5-16 f) — log entry point named as built (issue #17)', () => {
  it('docs.dataFlows.logEntryPoint.namesRealCollector', () => {
    expect(
      DATA_FLOWS,
      'D-10(f): "one `log()` function in `main`" describes a collector that does not ' +
        'exist under that name — name the built module (log-collector, ' +
        'createLogCollector) (S5-16(f))',
    ).not.toContain('one `log()` function in `main`');
    expect(
      DATA_FLOWS,
      'D-10(f): the single-entry-point note must name createLogCollector',
    ).toContain('createLogCollector');
  });
});

describe('D-11 — coverage gate mechanically configured (issue #18)', () => {
  it('config.vitestCoverageGate.thresholdsLines80Configured (TC-DOC-11)', () => {
    const VITEST_CONFIG = doc('vitest.config.ts');
    expect(VITEST_CONFIG, 'control: vitest.config.ts resolves').toContain('defineConfig');
    expect(
      VITEST_CONFIG,
      'D-11: vitest.config.ts configures no coverage.thresholds — the strategy §6 ' +
        '"≥ 80 % lines at M1 exit" gate stays inert; add thresholds.lines ≥ 80 (the CI ' +
        'coverage job itself is a documented M2 deferral per G-05 — acceptance-m1-27 ' +
        '§3 D-11, issue #18)',
    ).toContain('thresholds');
    const lines = Number(/lines:\s*(\d+)/.exec(VITEST_CONFIG)?.[1] ?? 0);
    expect(
      lines,
      'D-11: coverage.thresholds.lines must be ≥ 80 (strategy §6 "≥ 80 % lines on src/**")',
    ).toBeGreaterThanOrEqual(80);
  });
});

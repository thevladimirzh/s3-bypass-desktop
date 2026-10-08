# M3 Test Plan — wording ↔ surfaces ↔ icon ↔ docs ↔ beta

Owner: **QA** · Basis: `docs/plans/m3-polish.md` (M3 board), `BRIEF.md` §2/§5/§9,
`docs/plans/milestones.md` §M3 · Strategy: `strategy.md` · Status: **open (M3-02)** —
rows are written RED-first per batch and results land in §10; acceptance history:
`docs/qa/acceptance-m2-13.md` (M2 verdict GO), the M3 acceptance report is a to-come
artifact (M3-13).

**TC numbering rule** (extends strategy §4.3): behavior that belongs to a user story
keeps the `TC-<story>-<nn>` family (`nn` equals the AC number; `nn ≥ 10` when the case
is not AC-derived — M3 continues existing sequences where the surface belongs to a story:
AC-04.5 manual-proxy hint = the `TC-04` family, quit surfacing = `TC-05`, etc.).
Cross-cutting M3 pins use **`TC-POL-nn`** — wording-table growth & contract hardening,
icon/naming config, i18n seam, docs consistency, status/tray dedup. The #27 release-leg
pins continue **`TC-PKG-nn`** in `docs/qa/m2-test-plan.md` §6 (fix-20 precedent — the
family lives with the release-CI rows). NFR-5 wording coverage is expressed BOTH as
`errorWording.test.ts` **table rows** (row ids, strategy §7 schema) and, where a row
cannot reach a surface, as TC-POL pins. Raw-text doc/config pins follow the DV-36/DV-37
pattern. IDs are never renumbered.

**Status legend:** `RED-planned` = row planned, test not written yet · `RED-written` =
the failing test exists · `observed-GREEN` · `L3` = packaged-app / Playwright E2E ·
`L4` = manual checklist · `blocked-xx` = waiting on a decision or environment ·
`deferred-M3` = out of M3 scope per spec note.

---

## 1. Scope ↔ board tasks

| §   | Scope                                                                                | Board task    | Family                                 |
| --- | ------------------------------------------------------------------------------------ | ------------- | -------------------------------------- |
| 2   | Error-wording pass: table rows for the audit gaps + `expectHumanError` hardening     | M3-03 / M3-04 | `errorWording.test.ts` rows + `TC-POL` |
| 3   | UX surfaces: AC-04.5 hint, footer copy, quit-failure surfacing, states, status dedup | M3-05 / M3-06 | `TC-04` / `TC-05` / `TC-POL`           |
| 4   | App icon + naming                                                                    | M3-07         | `TC-POL` (+ builder-config)            |
| 5   | i18n groundwork (EN seam, byte-identical wording pins)                               | M3-08         | `TC-POL`                               |
| 6   | User docs + beta setup doc + README split                                            | M3-09         | `TC-POL` (docs-consistency)            |
| 7   | darwin-x64 dmg leg (issue #27) — rows live in m2-test-plan §6                        | M3-10         | `TC-PKG` (m2 plan)                     |
| 8   | Beta distribution + security re-review + acceptance (L4)                             | M3-11..13     | L4 checklist in the acceptance report  |

**Audit basis (scoping 2026-10-08):** the error-surface inventory that drove §2/§3 —
19 covered rows; unpinned triples E-IO-006, E-CORE-003, E-IO-001, E-IO-002, E-STOR-005;
sibling-only pins E-IO-004, E-IO-003, E-CORE-001, E-CORE-002, E-VAL-015, no-profile
refusal; wording divergence B-8c (status-machine vs errors.md); internal-code leaks B-9
(`E-PLAT-001` in a nextStep) and B-2 (`E-PLAT-005` in a nextStep); missing AC-04.5 hint
render (B-11); swallowed quit failure (B-13); stale footer `App.tsx:353`.

---

## 2. Error-wording pass (M3-03 RED / M3-04 GREEN)

### 2.1 Rows added to `tests/unit/errorWording.test.ts` (TC-POL-01)

| Row id                                          | Code         | Surface / trigger                                                                                    | Status                                                       |
| ----------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `fileReadFailed`                                | `E-IO-001`   | `FILE_READ_FAILED` triple from the new single-source `src/shared/error-triples.ts` (FR-06)           | RED-written                                                  |
| `dialogFailed`                                  | `E-IO-002`   | `DIALOG_FAILED` triple (FR-01 defensive)                                                             | RED-written                                                  |
| `stor005ProfileSaveFailed`                      | `E-STOR-005` | real `secret-store.saveProfile` over a read-only data dir (FR-54 defensive)                          | RED-written (observed GREEN in the RED batch — additive pin) |
| `noProfileStepZeroRefusal`                      | `E-VAL-016`  | `NO_PROFILE` triple, FR-12 step-0 refusal (errors.md §1 M3-A amendment)                              | RED-written                                                  |
| `illegalTransitionRejection`                    | `E-VAL-017`  | pure reducer `transition(INITIAL_STATUS, "stop")` (FR-18, errors.md §1 M3-A amendment)               | RED-written                                                  |
| `e005Dedup.mainModulesCarryNoInlineE005Literal` | —            | raw-text pin (DV-36): `index.ts`/`secret-store.ts` must carry NO inline `code: 'E-STOR-005'` literal | RED-written                                                  |

Contract hardening (same batch): `FORBIDDEN` gains `an internal error code`
(`/\bE-(?:VAL|IO|CORE|PLAT|STOR)-\d{3}\b/`) and `an operating-system errno token`
(`ENOENT|EACCES|…`), both `userTextOnly` (the `code` field legitimately carries a code —
errors.md §0 amended: the forbidden thing is a code _citation inside_
title/cause/nextStep).

### 2.2 Sibling-surface wording pins (TC-POL-02, `core-supervisor.test.ts`)

| Case                                                                                                                                                                   | Code         | Status                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| `supervisor.start.doubleClick` — code pin amended `E-VAL-015` → `E-VAL-017` + `expectHumanWording`                                                                     | `E-VAL-017`  | RED-written                     |
| `TC-02-06` crash — `expectHumanWording` added                                                                                                                          | `E-CORE-001` | observed GREEN in the RED batch |
| `TC-02-04` binary missing — `expectHumanWording` added                                                                                                                 | `E-IO-004`   | observed GREEN in the RED batch |
| `TC-02-05` port busy — `expectHumanWording` added                                                                                                                      | `E-IO-003`   | observed GREEN in the RED batch |
| `TC-02-10` never ready — `expectHumanWording` added                                                                                                                    | `E-CORE-002` | observed GREEN in the RED batch |
| NEW `supervisor.start.configWriteFails.documentedEio006NeverSpawns` (TMPDIR read-only → `mkdtempSync` EACCES)                                                          | `E-IO-006`   | observed GREEN in the RED batch |
| NEW `supervisor.start.binaryNotExecutable.settlesDocumentedEcore003` (existing but non-executable binary → spawn EACCES; nextStep must drop the `E-PLAT-005` citation) | `E-CORE-003` | RED-written                     |

Sibling amendments outside the wording suites: `core-wiring.test.ts` TC-02-03 pins the
now-documented `E-VAL-016` (DV-19 superseded); `errors.md` §0/§1/§3/§4 amended per DV-64;
`system-proxy.ts` E-PLAT-002 nextStep loses its `E-PLAT-001` citation at GREEN (row
`systemProxyChangeFailed` observed RED via the hardening).

---

## 10. Execution log (per batch)

_Appended when a batch is written/observed — RED entry first, then GREEN, mirroring
the m2-test-plan §10 narrative style: counts, observed RED, baseline untouched, green
results.)_

### M3-03 RED (error-wording pass, 2026-10-08)

- Chain before RED: `prettier --check docs/ src/ tests/` clean, typecheck rc=0,
  eslint rc=0. Spec amendments in the same RED commit (DV-64): `docs/analysis/errors.md`
  §0 (code citations + errno tokens forbidden in user text), §1 (+`E-VAL-016`, +`E-VAL-017`, E-VAL-015 note), §3 `E-CORE-003` and §4 `E-PLAT-002` next-step
  citations dropped.
- Suite: **9 failed | 290 passed (299)** — baseline 291 → +8 tests (5 wording rows
  - 1 dedup pin + 2 new supervisor trigger tests), 43 files. The 9 observed REDs are
    exactly the named gaps:
  1. `errorWording.fileReadFailed` / `dialogFailed` / `noProfileStepZeroRefusal` —
     ABSENCE RED (`src/shared/error-triples.ts` missing, `loadErrorTriples` gate);
  2. `errorWording.illegalTransitionRejection` — impl code `E-VAL-015` ≠ pinned `E-VAL-017`;
  3. `errorWording.e005Dedup.mainModulesCarryNoInlineE005Literal` — both literals inline;
  4. `errorWording.systemProxyChangeFailed` — hardening catches `E-PLAT-001` citation;
  5. `core-supervisor.doubleClick` — code pin `E-VAL-017`;
  6. `core-supervisor.binaryNotExecutable` (E-CORE-003) — hardening catches the
     `E-PLAT-005` citation + nextStep substring pin;
  7. `core-wiring.noProfileMainGuard` — code pin `E-VAL-016`.
- Observed GREEN in the RED batch (additive pins that hold already):
  `stor005ProfileSaveFailed`, `supervisor.start.configWriteFails` (E-IO-006),
  and the `expectHumanWording` additions on TC-02-04/05/06/10.
- e2e: not re-run for this RED (suite-only + docs; e2e unchanged, 1/1 last green
  at `b26e0a2`). Fixup needed? One was: the first RED run failed 50+ tests because
  `tripleText` includes the `code` field — the two new FORBIDDEN rules are
  `userTextOnly` (checked against title/cause/nextStep only); re-observed RED after
  the fix is the 9 listed above.

---

## 11. Deviations log (QA bookkeeping)

_(Appended per deviation with a DV-64+ row — global DV numbering continues from
m2-test-plan §11 (DV-63 last).)_

| DV    | Batch | Deviation / decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Justification                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-64 | M3-03 | Spec amendments inside the RED commit: `errors.md` §0 extended (no `E-…-###` code citation and no OS errno token inside title/cause/nextStep; the `code` field stays internal), §1 gains `E-VAL-016` (no-profile step-0 refusal — DV-19 superseded, the `E-VAL-*` placeholder is gone) and `E-VAL-017` (generic state-machine rejection — was mislabelled `E-VAL-015`, audit B-8c), §3/§4 drop the `E-PLAT-005`/`E-PLAT-001` next-step citations; sibling pins amended accordingly (`E-VAL-015`→`E-VAL-017` in TC-02-07, `E-VAL-*`→`E-VAL-016` in TC-02-03); the two new `FORBIDDEN` rules are `userTextOnly`. | Owner-approved M3 batch A ("error-wording pass") on 2026-10-08; wording is strengthened, no existing pin weakened or removed (strategy §5.2); the `userTextOnly` split follows §0 itself (the code is internal _by design_ — only its citation inside user text is forbidden), so the canary/stack/`Error:` rules keep scanning `tripleText` unchanged. |

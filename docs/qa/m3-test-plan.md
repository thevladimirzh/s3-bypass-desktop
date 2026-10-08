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

## 10. Execution log (per batch)

_(Appended when a batch is written/observed — RED entry first, then GREEN, mirroring
the m2-test-plan §10 narrative style: counts, observed RED, baseline untouched, green
results.)_

---

## 11. Deviations log (QA bookkeeping)

_(Appended per deviation with a DV-64+ row — global DV numbering continues from
m2-test-plan §11 (DV-63 last).)_

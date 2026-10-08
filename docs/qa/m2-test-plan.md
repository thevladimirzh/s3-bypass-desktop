# M2 Test Plan — pinning ↔ packaging ↔ release ↔ acceptance

Owner: **QA** · Basis: `docs/plans/m2-packaging.md` (M2 board), `BRIEF.md` §5/§9,
`docs/plans/milestones.md` §M2 · Strategy: `strategy.md` · Status: **open (M2-02)** —
rows are written RED-first per batch and results land in §10; acceptance history:
`docs/qa/acceptance-m1-27.md` (M1 verdict NO-GO → M1-27b closed 2026-10-08), the M2
acceptance report is a to-come artifact (M2-13).

**TC numbering rule** (extends strategy §4.3): behavior that belongs to a user story
keeps the `TC-<story>-<nn>` family (`nn` equals the AC number; `nn ≥ 10` when the case
is not AC-derived — the M1 sequences continue: supervisor/bundled-core behavior =
`TC-02-16+`, FR-35 crash surfacing = `TC-04-20+`, tray freshness = `TC-05-24+`);
cross-cutting M2 pins use **`TC-PKG-nn`** — core pinning, electron-builder config,
attributions, release/CI gates and artifact verification. Raw-text config/doc pins
follow the DV-36/DV-37 pattern. IDs are never renumbered.

**Status legend:** `RED-planned` = row planned, test not written yet · `RED-written` =
the failing test exists · `observed-GREEN` · `L3` = packaged-app / Playwright E2E ·
`L4` = manual checklist (fresh-machine DoD) · `blocked-xx` = waiting on a decision or
environment · `deferred-M3` = out of M2 scope per spec note.

---

## 1. Scope ↔ board tasks

| §   | Scope                                                                               | Board task  | Family                         |
| --- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| 2   | Core pinning: verify script behavior + pin-doc structure                            | M2-03       | `TC-PKG-01..`                  |
| 3   | Bundled-core path resolution: packaged > `CORE_BINARY_PATH` > honest error          | M2-04       | `TC-02-16..`                   |
| 4   | electron-builder config: targets, unsigned macOS, core in resources, Gatekeeper doc | M2-05       | `TC-PKG-..`                    |
| 5   | GPL attributions shipped inside the artifacts                                       | M2-06       | `TC-PKG-..`                    |
| 6   | Release CI: tag → artifacts + SHA-256 manifest; coverage & e2e jobs land            | M2-07/M2-08 | `TC-PKG-..` (+ L3)             |
| 7   | Real-binary integration (strategy D-4) + authoritative coverage number (G-05)       | M2-10       | `TC-02-..` / `TC-03-..` (+ L3) |
| 8   | Issue #19 crash-path surfacing (FR-35 quit-time `E-PLAT-003`, tray freshness)       | M2-11       | `TC-04-20..`, `TC-05-24..`     |
| 9   | Fresh-machine install DoD + the Q9-waived M1 desktop manual rows                    | M2-12       | `L4` (checklist)               |
| 9   | Security-review findings (M2-09) → story families, declared per batch               | M2-09       | story families + DV row        |

§2..§9 rows are appended below as each batch is written (RED first); every batch
declares its new IDs, counts and observed RED numbers in §11 (house rule — the same
discipline as `m1-test-plan.md` §14).

---

## 2. Core pinning (M2-03)

| TC ID     | Test title                                       | AC / criterion                   | Layer            | Fixture                        | Status                              |
| --------- | ------------------------------------------------ | -------------------------------- | ---------------- | ------------------------------ | ----------------------------------- |
| TC-PKG-01 | `corePin.pinDocAndNpmScript.structured`          | M2-03; BRIEF §9, M2 DoD #1       | unit (raw-text)  | — (pin doc, package.json)      | RED-written (M2-03; **new**, DV-39) |
| TC-PKG-02 | `corePin.verify.mismatchExitsOneAndNamesAsset`   | M2-03; M2 DoD #1 (hash verified) | unit (spawn CLI) | temp asset + synthetic pin doc | RED-written (M2-03; **new**, DV-39) |
| TC-PKG-03 | `corePin.verify.matchViaPinDocOverrideExitsZero` | M2-03; M2 DoD #1                 | unit (spawn CLI) | temp asset + synthetic pin doc | RED-written (M2-03; **new**, DV-39) |

## 3. Bundled-core path resolution (M2-04)

_TBD at RED time — declared: `TC-02-16..` (resolution order + platform mapping)._

## 4. electron-builder config (M2-05)

_TBD at RED time — declared: `TC-PKG-..` (target matrix, unsigned macOS, resources)._

## 5. GPL attributions (M2-06)

_TBD at RED time — declared: `TC-PKG-..` (license files present + packed)._

## 6. Release CI & gates (M2-07 / M2-08)

_TBD at RED time — declared: `TC-PKG-..` (workflow structure, manifest step, audit
evidence file)._

## 7. Real-binary integration (M2-10)

_TBD — L3/integration rows against the pinned core; needs a free port (CI or VPN-off
window, Q9 pattern)._

## 8. Crash-path surfacing (M2-11, issue #19)

_TBD at RED time — declared: `TC-04-20..` (quit-time `E-PLAT-003`), `TC-05-24..`
(tray freshness)._

## 9. Fresh-machine DoD (M2-12) + security review (M2-09)

_TBD — L4 checklist + findings rows._

---

## 10. Execution log (per batch)

**M2-03 core pinning — RED** (2026-10-08): wrote TC-PKG-01..03 (§11 DV-39) —
all **3 observed RED** for their named reasons (pin doc + verify script absent;
the CLI cannot spawn), baseline **215 passed / 0 failed (215)** untouched (same
2 VPN-file excludes, DV-33); `npm run typecheck` + `npx eslint` +
`npx prettier --check` exit 0. Observed: `Tests 3 failed | 215 passed (218)`,
`Test Files 1 failed | 31 passed (32)`, exit 1.

_(Further entries appended when a batch is written/observed, mirroring the M1 §13
narrative style: counts, observed RED, baseline untouched, green results.)_

## 11. Deviations log (QA bookkeeping)

Continues the **global DV sequence** from `m1-test-plan.md` §14 (last M1 entry: DV-37).
M2 batches start at **DV-38**.

| ID    | Deviation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Effect / amendment                                                                                                                                                                       | Owner                                                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-38 | The M2-02 batch opens this plan as a **skeleton**: scope matrix (§1) + TC families (`TC-PKG-nn` for cross-cutting M2 pins; story sequences continue per the numbering rule) + logs, with rows landing RED-first per batch instead of a pre-planned full matrix like M1 had. Rationale: M2 batches are discovery-driven (upstream pinning, builder config, CI) — planned row titles cannot be honest before the config contracts exist; the per-batch declarations in §11 keep the ID/count audits identical to M1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | §1 scope matrix + numbering rule recorded here; counts start at 0 and grow per batch (each batch's §11 row carries its own +N/observed-RED numbers); no tests weakened (none exist yet). | QA                                                                                                                                                                                                                                                   |
| DV-39 | The M2-03 batch opens M2 verification with the core-pinning contract (board M2-03; BRIEF §9 "pinned release + commit SHA recorded in docs"; M2 DoD #1 "SHA-256 of bundled core verified at build time") as 3 new TC IDs (TC-PKG-01..03) in `tests/unit/core-pin.test.ts`, and needs these declarations: (1) **NEW FAMILY `TC-PKG-nn`** — declared in this plan's numbering rule (M2-02/DV-38), cross-cutting pins for pinning/packaging/CI; (2) **the CLI contract is written in the RED header** (exit 0 match / exit 1 MISMATCH naming asset + expected/actual / exit 2 usage; `--pin-doc` override exists so tests run against a synthetic record — the 3 × ~23 MB release assets never enter the repo or the test); (3) **GREEN scope** — download the three bundled assets (Xray-linux-64, Xray-macos-64, Xray-macos-arm64-v8a) + `.dgst` from release `v26.9.9-1.0.1fed` into the workspace temp dir, compute SHA-256, resolve the tag commit SHA, write `docs/analysis/core-pin.md` (tag/published/commit/asset table + upstream-dgst cross-check note), add `scripts/verify-core-pin.mjs` + the `verify:core-pin` npm script; (4) counts +3 (§2 rows), first execution-log entry in §10; (5) RED observed: `Tests 3 failed | 215 passed (218)`, `Test Files 1 failed                                                                                                                                                  | 31 passed (32)`, exit 1 — all 3 for their named missing-artifact reasons (never a harness error), baseline 215 passed / 0 failed untouched; (6) no `errorWording`rows (no`E-*`code),`tests/unit/ipc-contract.test.ts` untouched (no channel change). | §2 +3 rows, §10 first entry, §11 this row; GREEN = pin doc + verify script + npm script. | QA  |

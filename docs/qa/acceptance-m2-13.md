# Acceptance pass M2-13 — M2 Definition of Done (packaging & pinned core)

Task: **M2-13** (`docs/plans/m2-packaging.md`) · Owner: **project-manager** · Date: 2026-10-08 ·
Reviewer basis: `docs/plans/milestones.md` **M2 DoD #1–#5**, `BRIEF.md` §4/§8/§9/§10,
`docs/plans/m2-packaging.md` board (13/13 tasks `done`), `docs/qa/m2-test-plan.md`,
`docs/qa/m2-fresh-machine.md` §7, `docs/qa/security-m2-09.md`,
`docs/qa/security-m2-audit.md`, `docs/analysis/core-pin.md`, live CI + issue state.
· Tree: `967b554`, clean · Written: this file + the milestone/board flips are this task's
only writes.

## VERDICT (headline): **GO** — DoD #1–#4 evidenced, #5 = the flips recorded here

(DoD #1 carries the owner-recorded **arm64-only waiver** → issue #27; it is the only
deviation and is fully documented in §3.)

---

## 1. Scope & method

### 1.1 What "acceptance" means here

`docs/plans/milestones.md` states the flip rule: "a milestone flips to `done` only when
its Definition of Done below is fully met — stale `done` is a bug." This pass therefore
did three things, adversarially:

1. **DoD → evidence trace** — each DoD item #1..#5 checked against **primary artifacts**
   (workflow runs, checklist §7, security verdicts, packed license texts), not board notes
   alone.
2. **Live re-verification** — cheap facts re-run now: local suite, e2e smoke, CI run
   state on HEAD, issue state, board status count, dmg arch (the basis of the DoD #1
   finding).
3. **Deviation audit** — batch-level deviations (DV-44..DV-59 in `m2-test-plan.md` §11)
   re-read for flip impact; none blocks (§3).

### 1.2 Commands executed — exact results (strategy §10 reporting)

| #   | Command                                    | Result                                                                                                                                       |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm test`                                 | **Test Files 41 passed (41) · Tests 266 passed (266)**, 16.01 s — VPN-off window, port free (the M1 env-blocked files run green locally now) |
| 2   | `npm run test:e2e` (M2-12 batch, TC-FM-28) | **Tests 1 passed (1)** / 1 file, 3.73 s — same window as the fresh-machine run                                                               |
| 3   | `npx prettier --check` (changed docs)      | "All matched files use Prettier code style!"                                                                                                 |
| 4   | `gh run view 37814689139` (HEAD `967b554`) | **all 4 jobs success**: checks (ubuntu) ✓ · checks (macos) ✓ · coverage ✓ · e2e smoke ✓ (after a capacity rerun — §3)                        |
| 5   | `gh issue list --state open`               | **#5, #20, #21, #22, #24, #27** — every one triaged in §4 with owner decisions recorded; #2/#23/#25/#26 closed on evidence                   |
| 6   | board audit `grep '^- \[' m2-packaging.md` | **13/13 tasks `done`** (M2-01..M2-13)                                                                                                        |
| 7   | dmg arch check `ls release/ dist/`         | `S3 Bypass Desktop-0.0.1-arm64.dmg` + `dist/mac-arm64` → **arm64-only** (basis of the DoD #1 waiver, §3)                                     |

### 1.3 Out of scope for this pass

No code/test changes; the writes are this report, `milestones.md` (M2 flip + M3 handoff
notes), the board status/M2-13 row, and issue triage comments (owner-approved texts).

---

## 2. DoD checklist — claim vs evidence

| M2 DoD item                                                                                                                                                                                          | Verdict                           | Evidence (primary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1** Tag produces installable artifacts for all three build targets (darwin-x64, darwin-arm64, linux-x64 — Linux ships AppImage + `.deb` + `.rpm`); SHA-256 of bundled core verified at build time | **PASS under waiver** (issue #27) | M2-07 `release.yml` + `release-manifest.mjs`: test-tag runs `37714279005` → `37717801328` **all legs green** (artifacts-macOS 152 313 266 B, artifacts-Linux 266 420 579 B, artifacts-fedora 104 047 763 B), manifest SHA-256 verified at build time, test tag deleted after observation. Core **three-target pin complete**: `core-pin.md` (macos-64 / macos-arm64-v8a / linux-64 digests) + `prepare:core` stages all three (`core-bin/darwin-x64/` ✓, M2-04). **Deviation: the darwin-x64 app dmg is never built** (macos-latest = arm64 runner → `dist/mac-arm64`) → owner waiver 2026-10-08 → issue **#27** (§3). |
| **#2** Fresh-machine install runs the MVP loop (import → start → stop) from the packaged app                                                                                                         | **PASS**                          | `docs/qa/m2-fresh-machine.md`: **28/28 TC-FM rows + P1..P8 `observed-GREEN`, 0 FAIL, 0 open `blocked-*` → §7 verdict PASS** (2026-10-08). Packaged-app loop: TC-FM-09/10/12..17 (import → start → SOCKS applied → stop → baseline); Q9-waived M1 desktop rows executed as TC-FM-18..28 (sleep, logout/restart, second account all green); e2e smoke 1 passed (row 2 above).                                                                                                                                                                                                                                            |
| **#3** Security review before external distribution — supply chain, S3 key handling, IPC; findings triaged                                                                                           | **PASS**                          | `docs/qa/security-m2-09.md` verdict **PASS, 0 critical / 0 high / 0 medium**; §4 walks all three areas line-anchored (release chain `npm ci → prepare:core → dist → release:manifest`, live 0 unpinned `uses:`; safeStorage/0600/redaction; 11/11 handlers guard-first + window/CSP/payload guards). Findings → issues **#20/#21/#22** (triaged §4); prior lows re-verified (#7–#13, #3); S5-14 closed at the gate. npm-audit gate: `security-m2-audit.md` (M2-08), **0 highs**.                                                                                                                                       |
| **#4** License notice (core: MPL-2.0) + third-party attributions present in artifacts                                                                                                                | **PASS**                          | M2-06: `resources/licenses/` — xray-core LICENSE (MPL-2.0, BRIEF's GPL-3.0 claim corrected 2026-10-08 per `core-pin.md`), Electron + notable npm dep notices — packed into **every** artifact via global `extraResources` (`electron-builder.yml`); RED `4f76d21` → GREEN (229 passed / 0 failed).                                                                                                                                                                                                                                                                                                                     |
| **#5** Handoff: M2 done → M3 beta cohort gets download links                                                                                                                                         | **PASS (this task)**              | `milestones.md`: M2 row → **DONE (2026-10-08)**, M3 row → **READY** with the carried-over notes (issues #5, #20/#21/#22/#24, #27); M1's handoff precedent mirrored. The actual beta distribution is M3's own DoD #1.                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 3. Debits, waivers & honesty notes

- **DoD #1 waiver — owner decision 2026-10-08 (recorded, tracked).** Strict DoD text
  lists `darwin-x64` among build targets; the tag builds only an **arm64** dmg (macos-latest
  = arm64 runner; `dist/mac-arm64`, file `…-0.0.1-arm64.dmg`). Reading applied: BRIEF §4's
  "cross-built for darwin-x64, darwin-arm64, linux-x64" governs the **core binary** — which
  is complete for all three (pin + staged) — while the app ships one dmg per built OS. The
  owner chose: **M2 flips with arm64-only; the darwin-x64 dmg leg becomes an M3 batch,
  tracked in issue #27** (release.yml matrix/`--x64`, RED/GREEN arch pin, validation tag by
  the M2-07 pattern). This is the **only** DoD deviation in this pass.
- **GitHub macOS arm64 capacity (infra, not code).** Run `37810102230` (`bfc99c0`): both
  macos jobs "not acquired by Runner … capacity constraints" after 15 min; run
  `37814689139` (`967b554`): e2e smoke same non-acquisition → `gh run rerun --failed` →
  **all 4 jobs success**. Ubuntu checks + coverage were green on both runs.
- **Validation tags are deleted after observation by design** (M2-07 evidence) — artifacts
  live in the runs' artifact storage until expiry; the manifest + sizes are recorded on the
  board and here.
- **Unsigned macOS** is an owner decision (R-2, BRIEF §10 amended): Gatekeeper
  instructions ship in `docs/product/macos-gatekeeper.md`; notarization out of scope.
- **DV-44..DV-59** (`m2-test-plan.md` §11) cover batch-level test-design deviations; none
  affects a DoD claim. The fresh-machine harness incidents (DV-55) were re-run honest and
  closed in `m2-fresh-machine.md` §7.
- Local `npm test`/e2e ran in the P1 VPN-off window; the full cross-OS evidence chain is
  CI (both OS checks + coverage ≥ 80 % lines + e2e job).

---

## 4. Open-items register + triage (owner decisions recorded 2026-10-08)

| Issue   | Title (short)                                                | Disposition (published)                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#27** | darwin-x64 (Intel) dmg leg missing                           | **New** — M3 batch carrying the DoD #1 waiver (comment body = waiver record + follow-up steps)                                                                                                                                    |
| **#5**  | Main-side hardening (S4-3/S4-4/S4-6)                         | **→ M3 with explicit note** — S4-4 evidenced closed by M2-09; S4-3/S4-6 conditional (single window, cheap handlers), re-verify at multi-window/heavy handlers. Comment posted; note in `milestones.md` M3 "Carried over from M2". |
| **#24** | Log panel 100 % `[REDACTED]` with a real core                | **Pre-M3 fix batch** joining #20/#21/#22 (token-level masking or `[REDACTED:rule]` + realistic-line tests). Comment posted.                                                                                                       |
| **#20** | `npm run dist` packs `core-bin/` as-is (staging not cleaned) | **Pre-M3 fix batch** series — comment posted.                                                                                                                                                                                     |
| **#21** | Core child inherits full `process.env`                       | **Pre-M3 fix batch** series — comment posted.                                                                                                                                                                                     |
| **#22** | S5-8 unbounded line-reader + S5-15 teardown timeouts         | **Pre-M3 fix batch** series — comment posted.                                                                                                                                                                                     |
| #2      | npm audit evidence for the packaging chain                   | **Closed** on M2-08 evidence (0 highs).                                                                                                                                                                                           |
| #23     | Fresh-machine data path (sessionsDir rewrite)                | **Closed** on M2-12 PASS (closure comment with the 28/28 record).                                                                                                                                                                 |
| #25/#26 | UX batch (window-on-launch, round toggle)                    | **Closed** earlier (DV-58/DV-59 records; amended launch expectation re-run green in TC-FM-04/18).                                                                                                                                 |

Owner-approved sequence recorded: **M2-13 → fix batches (#20/#21/#22 + #24) → M3** (with
#27 and issue #5's re-verify note riding the M3 start).

---

## 5. Verdict — **GO**

All five DoD items are met — #1 under the recorded waiver (§3), evidenced by the
artifacts above. Actions executed with this pass:

1. `docs/plans/milestones.md` — **M2 → DONE (2026-10-08)** with this report as evidence;
   **M3 → READY** with the "Carried over from M2" note (issue #5, fix series, #27);
   honesty note extended with the flip rationale.
2. `docs/plans/m2-packaging.md` — board status → `done`, M2-13 → `done` (this evidence).
3. Issue triage published: #27 created; comments on #5, #20, #21, #22, #24.

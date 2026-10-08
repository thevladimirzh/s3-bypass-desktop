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

| §   | Scope                                                                               | Board task  | Family                                    |
| --- | ----------------------------------------------------------------------------------- | ----------- | ----------------------------------------- |
| 2   | Core pinning: verify script behavior + pin-doc structure                            | M2-03       | `TC-PKG-01..`                             |
| 3   | Bundled-core path resolution: packaged > `CORE_BINARY_PATH` > honest error          | M2-04       | `TC-02-16..`, `TC-02-20`, `TC-PKG-04`     |
| 4   | electron-builder config: targets, unsigned macOS, core in resources, Gatekeeper doc | M2-05       | `TC-PKG-05..07`                           |
| 5   | License attributions shipped inside the artifacts (core = MPL-2.0)                  | M2-06       | `TC-PKG-08..10`                           |
| 6   | Release CI: tag → artifacts + SHA-256 manifest; coverage & e2e jobs land            | M2-07/M2-08 | `TC-PKG-11..17` (+ L3, M2-08)             |
| 7   | Real-binary integration (strategy D-4) + authoritative coverage number (G-05)       | M2-10       | `TC-02-21..24` (G-05 → §10)               |
| 8   | Issue #19 crash-path surfacing (FR-35 quit-time `E-PLAT-003`, tray freshness)       | M2-11       | `TC-04-20..`, `TC-05-24..`                |
| 9   | Fresh-machine install DoD + the Q9-waived M1 desktop manual rows                    | M2-12       | `L4` (checklist)                          |
| 9   | Security-review findings (M2-09) → story families, declared per batch               | M2-09       | §9.1 rows (issues #20–#22; S6-x accepted) |

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

| TC ID     | Test title                                      | AC / criterion               | Layer           | Fixture                  | Status                              |
| --------- | ----------------------------------------------- | ---------------------------- | --------------- | ------------------------ | ----------------------------------- |
| TC-02-16  | `coreBinaryPath.packagedBundleWinsOverOverride` | M2-04; S4-5 / issue #6       | unit (pure fn)  | synthetic env objects    | RED-written (M2-04; **new**, DV-40) |
| TC-02-17  | `coreBinaryPath.devOverrideWinsUnpackaged`      | M2-04; issue #6 / DV-31 seam | unit (pure fn)  | synthetic env objects    | RED-written (M2-04; **new**, DV-40) |
| TC-02-18  | `coreBinaryPath.platformMappedBundlePath`       | M2-04; per-platform path     | unit (pure fn)  | synthetic env objects    | RED-written (M2-04; **new**, DV-40) |
| TC-PKG-04 | `prepareCore.stagingScriptDeclaredAndIgnored`   | M2-04; bundle machinery      | unit (raw-text) | package.json, .gitignore | RED-written (M2-04; **new**, DV-40) |
| TC-02-20  | `coreBinaryPath.hostDelegatesToPureResolver`    | M2-04; DV-28 pure-glue split | unit (raw-text) | src/main/index.ts        | RED-written (M2-04; **new**, DV-40) |

## 4. electron-builder config (M2-05)

| TC ID     | Test title                                    | AC / criterion                             | Layer           | Fixture                          | Status                              |
| --------- | --------------------------------------------- | ------------------------------------------ | --------------- | -------------------------------- | ----------------------------------- |
| TC-PKG-05 | `builderConfig.targetsCompleteUnsignedAsarOn` | M2-05; owner decisions BRIEF §9/§10; S5-18 | unit (raw-text) | electron-builder.yml             | RED-written (M2-05; **new**, DV-41) |
| TC-PKG-06 | `builderConfig.coreBundledViaExtraResources`  | M2-05; M2-04 staging ↔ TC-02-18 layout     | unit (raw-text) | electron-builder.yml             | RED-written (M2-05; **new**, DV-41) |
| TC-PKG-07 | `builderConfig.gatekeeperInstructionsExist`   | M2-05; BRIEF §9 Gatekeeper instructions    | unit (raw-text) | docs/product/macos-gatekeeper.md | RED-written (M2-05; **new**, DV-41) |

## 5. License attributions (M2-06)

| TC ID     | Test title                                      | AC / criterion                                   | Layer           | Fixture                                   | Status                              |
| --------- | ----------------------------------------------- | ------------------------------------------------ | --------------- | ----------------------------------------- | ----------------------------------- |
| TC-PKG-08 | `licenseBundle.noticesListsEveryShippedPackage` | M2-06; DoD #4; license reconciliation 2026-10-08 | unit (raw-text) | resources/licenses/THIRD-PARTY-NOTICES.md | RED-written (M2-06; **new**, DV-42) |
| TC-PKG-09 | `licenseBundle.licenseTextsPresent`             | M2-06; DoD #4 (texts in artifacts)               | unit (raw-text) | resources/licenses/*-LICENSE.txt          | RED-written (M2-06; **new**, DV-42) |
| TC-PKG-10 | `licenseBundle.packedViaExtraResources`         | M2-06; DoD #4 (packed)                           | unit (raw-text) | electron-builder.yml                      | RED-written (M2-06; **new**, DV-42) |

## 6. Release CI & gates (M2-07 / M2-08)

| TC ID     | Test title                                    | AC / criterion                                           | Layer           | Fixture                       | Status                                  |
| --------- | --------------------------------------------- | -------------------------------------------------------- | --------------- | ----------------------------- | --------------------------------------- |
| TC-PKG-11 | `releaseWorkflow.tagMatrixBuildsAndVerifies`  | M2-07; DoD #1 (verify at build)                          | unit (raw-text) | .github/workflows/release.yml | RED-written (M2-07; **new**, DV-43)     |
| TC-PKG-12 | `ciWorkflow.coverageJobLands`                 | M2-07; G-05 (coverage ≥80 in CI)                         | unit (raw-text) | .github/workflows/ci.yml      | RED-written (M2-07; **new**, DV-43)     |
| TC-PKG-13 | `ciWorkflow.e2eJobPerProposal`                | M2-07; e2e-ci-proposal rollout #1                        | unit (raw-text) | .github/workflows/ci.yml      | RED-written (M2-07; **new**, DV-43)     |
| TC-PKG-14 | `releaseManifest.writeVerifyAndTamper`        | M2-07; DoD #1 (manifest is verified)                     | unit (CLI, tmp) | scripts/release-manifest.mjs  | RED-written (M2-07; **new**, DV-43)     |
| TC-PKG-15 | `releaseWorkflow.debOnUbuntuRpmOnFedora`      | M2-07 follow-up; distro split (owner request 2026-10-08) | unit (raw-text) | .github/workflows/release.yml | RED-written (follow-up; **new**, DV-47) |
| TC-PKG-16 | `ci.auditLegsBlockProdAndInformHigh`          | M2-08; issue #2 optional CI leg; S5-13 prod gate         | unit (raw-text) | .github/workflows/ci.yml      | RED-written (M2-08; **new**)            |
| TC-PKG-17 | `auditEvidence.acceptedRiskNoteSatisfiesGate` | M2-08; issue #2 evidence gate (M0-19 S4-5)               | unit (raw-text) | docs/qa/security-m2-audit.md  | RED-written (M2-08; **new**)            |

## 7. Real-binary integration (M2-10)

Venue per the plan row: `127.0.0.1:10808` must be free — **CI is the
authoritative venue** (ci.yml checks + coverage stage the binary with
`prepare:core`, DV-53); the VPN-on local command excludes this file (§11).

| TC ID    | Test title                                                    | AC / criterion                        | Layer                           | Fixture                                        | Status                                          |
| -------- | ------------------------------------------------------------- | ------------------------------------- | ------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| TC-02-21 | `coreReal.start.validProfileBootsPinnedBinaryRunningWithin1s` | M2-10; D-4; FR-13/FR-20/FR-21         | integration (spawn real binary) | staged `core-bin` + `valid-client-config.json` | observed-GREEN (M2-10, CI `37760697553`, DV-53) |
| TC-02-22 | `coreReal.start.realCoreStartupLinesReachLogSink`             | M2-10; data-flows (b) step 6          | integration (spawn real binary) | same                                           | observed-GREEN (M2-10, CI `37760697553`, DV-53) |
| TC-02-23 | `coreReal.stop.terminatesRealCoreReleasesPortAndDeletesT`     | M2-10; FR-16, FR-23                   | integration (spawn real binary) | same                                           | observed-GREEN (M2-10, CI `37760697553`, DV-53) |
| TC-02-24 | `coreReal.crash.externalSigkillGoesCoreCrashedAndReapsT`      | M2-10; FR-17, errors.md §6 E-CORE-001 | integration (spawn real binary) | same                                           | observed-GREEN (M2-10, CI `37760697553`, DV-53) |

## 8. Crash-path surfacing (M2-11, issue #19)

All six RED-written in the RED commit, observed RED as a block of **6 failed |
236 passed (242)** (baseline 236 untouched), GREEN as **242 passed (242)** —
narrative in §10, declarations in §11 (DV-51).

| TC ID    | Test title                                                  | AC / criterion                               | Layer                   | Fixture                                        | Status                              |
| -------- | ----------------------------------------------------------- | -------------------------------------------- | ----------------------- | ---------------------------------------------- | ----------------------------------- |
| TC-04-20 | `quit.proxyRestoreFailure.surfacesWarningBeforeExit`        | M2-11; FR-35 quit arm; issue #19 item 1      | unit (mocked electron)  | `restoreSystemProxy` → E-PLAT-003, event order | RED-written (M2-11; **new**, DV-51) |
| TC-04-21 | `crash.proxyRestoreFailure.surfacesPersistentWarning`       | M2-11; FR-35 crash arm; errors.md §6         | unit (mocked electron)  | captured `onStateChange` + failing restore     | RED-written (M2-11; **new**, DV-51) |
| TC-04-22 | `crash.proxyRestoreSuccess.clearsSnapshotWithoutWarning`    | M2-11; FR-35 crash arm; AC-04.7 truthfulness | unit (mocked electron)  | captured `onStateChange`, restore ok           | RED-written (M2-11; **new**, DV-51) |
| TC-04-23 | `stop.proxyRestoreFailure.surfacesPersistentWarning`        | M2-11; FR-35 stop arm; AC-04.6 separation    | unit (mocked electron)  | `restoreSystemProxy` → E-PLAT-003              | RED-written (M2-11; **new**, DV-51) |
| TC-05-24 | `trayMenu.dispatch.staleStartSkippedWhenLiveStateDisallows` | M2-11; issue #19 tray advisory; FR-41        | unit (policy, injected) | recorder `setLiveState('running')`             | RED-written (M2-11; **new**, DV-51) |
| TC-05-25 | `trayMenu.dispatch.staleStopSkippedWhenLiveStateDisallows`  | M2-11; issue #19 tray advisory; FR-41        | unit (policy, injected) | recorder `setLiveState('stopped')`             | RED-written (M2-11; **new**, DV-51) |

## 9. Fresh-machine DoD (M2-12) + security review (M2-09)

### 9.1 Security review (M2-09) — findings rows (declared; fix batches claim their TC IDs)

Report: `docs/qa/security-m2-09.md` — **0 critical / 0 high / 0 medium**, review-only
batch (no code/test change; baseline **236 passed / 0 failed (37 files)** untouched).

| ID         | Sev        | Area         | Finding (short)                                                                                                                        | Disposition                                                    |
| ---------- | ---------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| S6-1       | **low**    | supply chain | local `dist` packs `core-bin/` as-is (no prepare gate, staging never cleaned)                                                          | **issue #20** — fix batch declares TC-PKG-18..                 |
| S5-12      | low        | S3 keys      | core child inherits full `process.env` (untracked since M1-25)                                                                         | **issue #21** — fix batch declares its TCs                     |
| S5-8       | low        | carry-over   | unbounded line-reader buffer (untracked)                                                                                               | **issue #22** (umbrella)                                       |
| S5-15      | low        | carry-over   | teardown/`execFile` without timeouts (untracked)                                                                                       | **issue #22** (umbrella)                                       |
| S6-2..S6-8 | info       | all three    | tag-pinned container; Electron fetch integrity; fetch bounds; plaintext T; hard-kill residual; issue #5 breadth; npm lifecycle scripts | accepted with rationale / tracked (`security-m2-09.md` §2, §5) |
| S5-14      | — (closed) | supply chain | no integrity verification before spawn (M2 blocker)                                                                                    | **closed at this gate** (`security-m2-09.md` §2)               |

### 9.2 Fresh-machine DoD (M2-12) — L4 checklist

_TBD — L4 checklist (M2-12)._

---

## 10. Execution log (per batch)

**M2-03 core pinning — RED** (2026-10-08): wrote TC-PKG-01..03 (§11 DV-39) —
all **3 observed RED** for their named reasons (pin doc + verify script absent;
the CLI cannot spawn), baseline **215 passed / 0 failed (215)** untouched (same
2 VPN-file excludes, DV-33); `npm run typecheck` + `npx eslint` +
`npx prettier --check` exit 0. Observed: `Tests 3 failed | 215 passed (218)`,
`Test Files 1 failed | 31 passed (32)`, exit 1.

**M2-03 core pinning — GREEN** (2026-10-08): artifacts per DV-39 —
`docs/analysis/core-pin.md` (release `v26.9.9-1.0.1fed`, commit
`036606649aae3ee36102b02e6437c7266bc2f2be`, three asset rows with SHA-256
computed from the downloaded release assets and cross-checked against the
upstream `.dgst` files — all three matched), `scripts/verify-core-pin.mjs`
(exported `expectedShaForAsset` + CLI with the `--pin-doc` override) and the
`verify:core-pin` npm script. Observed: `Tests 218 passed (218)`,
`Test Files 32 passed (32)` — TC-PKG-01..03 GREEN; the baseline 215/0 is
untouched (+3 = this batch's own RED). Live evidence: all three real assets →
`core pin OK …`; a tampered file → exit 1 with `MISMATCH` + expected/actual
digests. `npm run lint` + `npm run typecheck` + `npx prettier --check` exit 0.

**M2-04 bundled-core path — RED** (2026-10-08): wrote TC-02-16, TC-02-17,
TC-02-18, TC-PKG-04, TC-02-20 (§11 DV-40) in
`tests/unit/core-binary-path.test.ts` + the loader helper
`tests/helpers/core-binary-path-stub.ts` — all **5 observed RED** (TC-02-16/17/18
fail as ABSENCE RED through the non-literal loader — `src/main/core-binary-path.ts`
not created yet, which keeps `npm run typecheck` exit 0, the M1-16/DV-28
mechanism; TC-PKG-04 fails on the absent `prepare:core` script and `core-bin/`
ignore; TC-02-20 fails on the absent `./core-binary-path` import in index.ts),
baseline **218 passed / 0 failed (218)** untouched (same 2 VPN-file excludes,
DV-33). Observed: `Tests 5 failed | 218 passed (223)`,
`Test Files 1 failed | 32 passed (33)`, exit 1; `npm run lint` +
`npm run typecheck` + `npx prettier --check` exit 0.

**M2-04 bundled-core path — GREEN** (2026-10-08): artifacts per DV-40 —
`src/main/core-binary-path.ts` (pure resolver: packaged bundle > verbatim dev
override > `join(resourcesPath ?? '.', 'core', platform, 'xray')`, total; the
S4-5 comment moved here), `src/main/index.ts` delegation (the local function is
gone — one implementation), `scripts/prepare-core.mjs` + `prepare:core` (download
→ SHA-256 verify against `docs/analysis/core-pin.md` through the shared
`expectedShaForAsset` → extract all five members into `core-bin/<target>/` →
chmod 0755), `.gitignore core-bin/`. Observed: `Tests 223 passed (223)`,
`Test Files 33 passed (33)` — TC-02-16/17/18/20 + TC-PKG-04 GREEN through the
unchanged absence loader (the M1-16 pattern: it now loads the real module with
zero test edits), baseline 218/0 untouched (+5 = this batch's own RED). Live
evidence: `npm run prepare:core` exit 0 — darwin-x64, darwin-arm64 and linux-x64
staged (five members each, `xray` mode 0755) with every digest verified against
the pin; a mismatch aborts with exit 1. `npm run lint` + `npm run typecheck` +
`npx prettier --check` exit 0.

**M2-05 electron-builder config — RED** (2026-10-08): wrote TC-PKG-05,
TC-PKG-06, TC-PKG-07 (§11 DV-41) in `tests/unit/builder-config.test.ts` — all
**3 observed RED** for their named reasons (no `asar: true` pin yet; the M0
`electron-builder.yml` predates M2-04 — no `extraResources` rows; the
Gatekeeper doc does not exist — ENOENT), baseline **223 passed / 0 failed (223)**
untouched (same 2 VPN-file excludes, DV-33). Observed:
`Tests 3 failed | 223 passed (226)`, `Test Files 1 failed | 33 passed (34)`,
exit 1; `npm run lint` + `npm run typecheck` + `npx prettier --check` exit 0.

**M2-05 electron-builder config — GREEN** (2026-10-08): artifacts per DV-41 —
`electron-builder.yml` amended (top-level `asar: true`, which satisfies M1
finding S5-18's asar-pin recommendation — that row itself stays open until its
M2-exit deadline; `mac: identity: null` + `extraResources core-bin/darwin-${arch}`
→ `core/darwin`; `linux` targets AppImage / deb / rpm +
`core-bin/linux-${arch}` → `core/linux`, directory-level so xray + geodata +
LICENSE + README all ship) and `docs/product/macos-gatekeeper.md` (NEW,
English: right-click → Open, System Settings → Privacy & Security → Open
Anyway, the `xattr -cr` alternative, and an explicit "NO notarization"
statement per the owner decision of 2026-10-08). Observed:
`Tests 226 passed (226)`, `Test Files 34 passed (34)` — TC-PKG-05/06/07 GREEN,
baseline 223/0 untouched (+3 = this batch's own RED). The actual
`npm run dist` build stays deferred on purpose: M2-07 (release CI, DoD #1) and
M2-12 (fresh-machine install, DoD #2) own it. `npm run lint` +
`npm run typecheck` + `npx prettier --check` exit 0.

**M2-06 license attributions — RED** (2026-10-08): wrote TC-PKG-08,
TC-PKG-09, TC-PKG-10 (§11 DV-42) in `tests/unit/license-bundle.test.ts` —
all **3 observed RED** for their named reasons (the `resources/licenses/`
directory does not exist yet — ENOENT ×2; no top-level `extraResources`
block in the M2-05 config — the block scan asserts its presence), baseline
**226 passed / 0 failed (226)** untouched (same 2 VPN-file excludes, DV-33).
Observed: `Tests 3 failed | 226 passed (229)`,
`Test Files 1 failed | 34 passed (35)`, exit 1; `npm run lint` +
`npm run typecheck` + `npx prettier --check` exit 0.

**M2-06 license attributions — GREEN** (2026-10-08): artifacts per DV-42 —
`resources/licenses/THIRD-PARTY-NOTICES.md` (NEW: Xray-core-fedarisha under
MPL-2.0 with the `core-pin.md` provenance pointer, Electron MIT,
react/react-dom MIT, app = GPL-3.0) + verbatim texts
(`xray-core-fedarisha-LICENSE.txt` copied from the `prepare:core` staging
output — the LICENSE inside the pinned assets; `electron-LICENSE.txt` =
`node_modules/electron/LICENSE`; `react-LICENSE.txt` = `node_modules/react/LICENSE`)

- a top-level `extraResources` entry `resources/licenses` → `licenses` in
  `electron-builder.yml` (composed with the M2-05 platform blocks — verified
  in `app-file matcher` source). Observed: `Tests 229 passed (229)`,
  `Test Files 35 passed (35)` — TC-PKG-08/09/10 GREEN, baseline 226/0 untouched
  (+3 = this batch's own RED). The texts are byte-copies of their sources
  (`cp` in the GREEN commit). `npm run lint` + `npm run typecheck` +
  `npx prettier --check` exit 0.

**M2-07 release CI & gates — RED** (2026-10-08): wrote TC-PKG-11, TC-PKG-12,
TC-PKG-13, TC-PKG-14 (§11 DV-43) in `tests/unit/release-ci.test.ts` — all
**4 observed RED** for their named reasons (release workflow absent — ENOENT;
no `coverage` / `e2e` jobs in ci.yml; manifest CLI absent — node loader error),
baseline **229 passed / 0 failed (229)** untouched (same 2 VPN-file excludes,
DV-33). Observed: `Tests 4 failed | 229 passed (233)`,
`Test Files 1 failed | 35 passed (36)`, exit 1; `npm run lint` +
`npm run typecheck` + `npx prettier --check` exit 0. **G-05 measured before
landing the gate** (the deferral note demands the authoritative number first):
CI full-suite = **84.59 % lines** (83.85 % stmts / 71.92 % branch / 86.61 %
funcs), ubuntu-latest, probe run `37711514257` of 2026-10-08, full suite green —
passes `coverage.thresholds.lines: 80`; the probe branch was deleted after the
measurement (main untouched).

**M2-07 release CI & gates — GREEN** (2026-10-08): artifacts per DV-43 —
NEW `.github/workflows/release.yml` (v* tag trigger, matrix macos+ubuntu,
pinned checkout/setup-node SHAs, `npm ci` → `npm run prepare:core` → Linux
`apt-get install -y rpm` → `npm run dist` → `npm run release:manifest --
release` → `actions/upload-artifact@ea165f8…` v4.6.2 with
`if-no-files-found: error`); `ci.yml` gains the `coverage` job (ubuntu,
`npm run test:coverage`) and the `e2e` job (macOS leg — proposal rollout #1,
port preflight + `npm run test:e2e`, no `ELECTRON_SKIP_BINARY_DOWNLOAD`);
NEW `scripts/release-manifest.mjs` + `release:manifest` (first run writes +
read-back re-verifies `SHA256SUMS.txt`, re-runs verify against the existing
record — drift/missing/unlisted → exit 1 `MISMATCH`, never rewritten on
drift); G-05 closed in acceptance-m1-27.md with the measured number. RED-test
correction: DV-44 (TC-PKG-14's manifest-content regex + two-run semantics —
the original `$`-joined pattern was dead and a write-then-hash tool would
have made the tamper case unenforceable; the corrected assertions are
STRICTER). Observed: `Tests 4 passed` for the file, full suite
**233 passed | 0 failed (233)**, `Test Files 36 passed (36)` — baseline 229/0
untouched (+4 = this batch's own RED). `npm run lint` + `npm run typecheck` +
`npx prettier --check` exit 0. CI observation: this push runs the landed
`coverage` (gate active at 84.59 % measured) and `e2e` (macOS) jobs for the
first time on main — the run result is recorded in the next batch entry
once observed (no claim ahead of the run).

**M2-07 — CI observation & evidence correction** (2026-10-08): push run
`37712854252` — the landed **coverage job PASSED** (gate active at the
measured 84.59 % lines), while `checks` (both OS) and `e2e` failed at
`npm run lint`: `tests/unit/release-ci.test.ts:68 simple-import-sort/imports`
(`node:child_process` after `node:path`) — the defect was present since the
RED commit `53c052e`. **Retraction:** the RED and GREEN entries above claim
"`npm run lint` ... exit 0" — those checks were executed as
`npm run lint 2>&1 | tail -1`, which (verified after CI caught the failure)
prints NOTHING and exits 0 even when eslint fails, so the claim was never
actually observed — the pipe masked the exit code and swallowed the report.
Verification method corrected: direct exit-code capture — lint 0, typecheck
0, prettier 0, `Tests 233 passed | 0 failed (233)`, `Test Files 36 passed
(36)`. The `e2e` job reached only the lint step in that run, so it has NO
verdict yet — the port preflight / build / smoke steps observe on the next
run (no e2e claim ahead of the run, per DV-43's no-claim rule). Fixed by
`eslint --fix` (imports only) in the following commit — DV-45.

**M2-07 — release-run observation: both legs failed, root-caused & fixed**
(2026-10-08): (a) follow-up CI run `37713275604` after DV-45 — **ALL FOUR
jobs green**: `coverage`, **`e2e smoke (macos-latest)`** (its first real
execution: lint → typecheck → port preflight → build → smoke — the pending
e2e verdict is now GREEN), `checks (ubuntu-latest)`, `checks (macos-latest)`.
(b) validation tag `v0.0.0-ci-test` → release run `37713415626`: **both
`build` legs failed at "Build artifacts (electron-builder)"** with two
independent causes — _macos-latest_: the dmg built and the blockmap
finished, then electron-builder reported "Implicit publishing triggered by
git tag … GH_TOKEN not set" (a tagged checkout implicitly publishes to a
GitHub Release); _ubuntu-latest_: "Please specify author 'email' in the
application package.json" (the deb/rpm Maintainer needs `author.email`; the
field was a bare string). Locally the implicit-publish branch never fired
(dirty tree — the CI tagged checkout is the authoritative repro, as the
DV-45-style rule demands: believe the environment that actually fails).
Fixes in the next commit: `npm run dist -- --publish never` in release.yml
(electron-builder's own prescribed remedy; publishing stays manual — the
workflow uploads artifacts itself) and `package.json` `author` →
`vladimir-opencode-agent[bot] <vladimir-opencode-agent[bot]@users.noreply.github.com>`
(the builder's own git identity — nothing pins the author field, checked).
Local verification of the flag syntax: `npm run dist -- --publish never` →
`electron-builder --publish never`, exit 0, dmg rebuilt (152 961 147 B).
No RED change: TC-PKG-11's structural pins hold verbatim (`npm run dist`
is still a substring of the step) — the fixes make the contract's
"builds the artifacts" intent actually true. The re-tagged CI run observes
the result — recorded only after it exists (no claim ahead of the run).

**M2-07 — closed: release run green end-to-end** (2026-10-08): re-tagged
validation (`v0.0.0-ci-test` moved to the fix commit `21940b8`) → release
run `37714279005` **SUCCESS on both legs** — `build (macos-latest)` and
`build (ubuntu-latest)` each executed `npm run prepare:core` (pinned core
digests re-verified at build — DoD #1), electron-vite build,
`electron-builder --publish never`, then the manifest step printed
`manifest OK: created 4 entries in release/SHA256SUMS.txt` (macOS) /
`manifest OK: created 5 entries` (Linux) — written AND re-verified in the
same step — and `upload-artifact` (if-no-files-found: error) landed
**artifacts-macOS 152 313 143 B** (dmg) and **artifacts-Linux
370 475 445 B** (AppImage + .deb + .rpm + manifest). The fix commit's own
CI run `37714274378` = success (all 4 jobs). The test tag was deleted
(remote + local) after observation. Batch run history: `37712854252` CI
fail (lint, DV-45) → `37713275604` CI success (coverage + e2e first real
run + checks ×2) → `37713415626` Release fail (DV-46) → `37714274378` CI
success → `37714279005` Release success. **M2-07 complete**: DoD #1
observed on a real tag build, G-05's gate live and green (84.59 %), e2e
proposal rollout #1 green.

**M2-07 follow-up RED — distro split .deb/.rpm (TC-PKG-15)** (2026-10-08):
owner request — ".deb на ubuntu, .rpm на fedora, если так можно". Feasibility
checked first: GitHub hosts no Fedora runners → the supported path is
`runs-on: ubuntu-latest` + `container:`; electron-builder's `--linux` is an
array option (`--linux deb tar.xz` per `--help`) so per-leg target lists
override the yml for one run; Docker Hub's current stable Fedora = **46**
(2026-10-08) → pin `fedora:46` (major, never `latest`);
`scripts/prepare-core.mjs` spawnSyncs **`unzip`** → fedora-minimal needs it
in the dnf line (with git for actions/checkout, rpm-build for native
rpmbuild, zstd for actions/cache). Wrote TC-PKG-15 in
`tests/unit/release-ci.test.ts` — **1 observed RED** (matrix job has no
`--linux AppImage deb`, no `build-rpm` job yet), baseline **233 passed /
0 failed (233)** untouched (same 2 VPN-file excludes, DV-33). Observed:
`Tests 1 failed | 4 passed (5)` for the file; full suite
`Tests 1 failed | 233 passed (234)`; `npm run lint` + `npm run typecheck`
exit 0 (direct exit-code capture — DV-45 method).

**M2-07 follow-up — environment incident: shell writes substitute the word
`git` (DV-48)** (2026-10-08): while GREENing TC-PKG-15 an assertion message
rendered `/Users/vladimir/.local/bin/git-bot` where prose said `git`. Probed
both channels: a shell `echo "… git tag …"` writes the SHIM PATH into the
file (the session's bot-mode wrapper substitutes the token in the raw
command text — including quoted heredoc bodies), while the `write`/`edit`
tools preserve text literally (probe file clean). Damage: 8 prose
occurrences across 2 files (release-ci.test.ts ×1, m2-test-plan ×7 across
§10 entries and DV-46/DV-47 rows — all RESTORED with the edit tool in this
batch's GREEN commit); one already-pushed commit message (21940b8, the
DV-46 fix — "the … identity that actually builds") carries the path —
history is NOT rewritten for a cosmetic defect, it is recorded here
instead. **Process rule for subsequent batches:** prose containing the word
goes through `write`/`edit` (or is assembled by concatenation inside shell
scripts), and every shell-written file gets a `grep local/bin/git-bot`
post-check before it is staged.

**M2-07 follow-up GREEN fix — fedora leg: fpm's bundled ruby needs
libcrypt.so.1 (DV-50)** (2026-10-08): GREEN `7f5554f` was validated on
test-tag run `37717025643` — `build (macos-latest)` **success**,
`build (ubuntu-latest)` **success** (which empirically PROVES the per-leg
CLI target lists override electron-builder.yml for one run: the ubuntu
leg built deb + AppImage with no rpm tooling installed at all), but
`build rpm (fedora container)` **failed** at the `Build rpm` step:
`ruby: error while loading shared libraries: libcrypt.so.1: cannot open
shared object file` → `fpm process failed 127` (`failedTask=build`,
electron-builder cache `fpm@2.1.4`, bundled
`fpm-1.17.0-ruby-3.4.3-linux-amd64`). Root cause: electron-builder's rpm
target runs its **bundled fpm (ruby)**, which links `libcrypt.so.1`;
Fedora ≥ 38 ships only `libcrypt.so.2` (libxcrypt) — the legacy `.so.1`
symlink is the separate **`libxcrypt-compat`** subpackage (verified on
packages.fedoraproject.org BEFORE the fix, not assumed). Fix-forward
commit: `libxcrypt-compat` appended to the pinned dnf line (still before
checkout — the order anchors hold), step name/comment now spell the
fpm → rpmbuild chain (`rpm-build` stays — fpm shells out to rpmbuild),
and the TC-PKG-15 dnf regex pins `libxcrypt-compat` after `zstd` so the
fix cannot regress; the comment's "NATIVE rpmbuild" claim corrected to
what was observed. Local GREEN: 234 passed (234), chain 0/0/0/0; the
tag run on the fix commit is the acceptance observation.

**M2-07 follow-up final observation — all three legs green (2026-10-08)**:
test-tag run on the fix commit `4a0f2e2` — `37717801328` —
`build (macos-latest)` **success**, `build (ubuntu-latest)` **success**,
`build rpm (fedora container)` **success**: EVERY fedora step green in
order (`dnf … libxcrypt-compat` → checkout → setup-node → npm ci →
`Stage the pinned core` (digest re-verify) → `Build the app` →
`Build rpm (electron-builder + native rpmbuild)` → `SHA-256 manifest —
written then re-verified` → upload). Artifacts: `artifacts-macOS`
152 313 266 B, `artifacts-Linux` 266 420 579 B, `artifacts-fedora`
**104 047 763 B** (rpm + SHA256SUMS.txt; names unique — no
runner.os collision with the container leg, exactly as DV-47 pinned).
CI on the fix `37717796975` success (and `37717022842` success on
`7f5554f`). Test tag `v0.0.0-ci-test` deleted (local + remote) after
observation; temp files cleaned. Batch history: RED `67a4d74` → GREEN
`7f5554f` → fix `4a0f2e2` (DV-50) — **follow-up done**.

**M2-08 RED — live npm audit evidence + CI audit legs (TC-PKG-16/17)**
(2026-10-08): scope recon BEFORE writing (issue #2 + M0-19 S4-5 + M1
S5-13), live captures on node v22.12.0 / npm 10.9.0:

- `npm audit` (full tree) → **exit 1, 8 moderate**. Root = sprintf-js
  (`GHSA-hp3w-g68c-fv3c`, `CVE-2026-97058`, published 2026-09-24, CVSS
  6.9, affected `<= 1.1.3`, **Patched versions: none** — installed
  1.1.3 IS the latest release); the other 7 are pure dependents
  (roarr → global-agent → @electron/get → app-builder-lib →
  dmg-builder / electron-builder / electron-builder-squirrel-windows).
- `npm audit --omit=dev` → **exit 0, `found 0 vulnerabilities`**
  (production deps = react + react-dom only).
- `npm audit --audit-level=high` → **exit 0 → 0 high / 0 critical →
  nothing to triage into GitHub issues** (board row asks for highs only).
- Remediation check: `npm outdated` — installed chain (26.17.0) not
  behind registry latest (26.15.3); `npm audit fix` has no
  non-breaking path and `--force` would DOWNGRADE electron-builder to
  26.5.0 (breaking) → rejected. Upstream patch for the GHSA does not
  exist → issue #2 option 2 (accepted-risk note) is the only viable
  path; S5-13's CI recommendation lands as the second leg.

Wrote the new `tests/unit/audit-gate.test.ts`: **TC-PKG-16** (ci.yml —
blocking `npm audit --omit=dev` WITHOUT continue-on-error, exactly one
step; informational `npm audit --audit-level=high` WITH
`continue-on-error: true`, exactly one step) and **TC-PKG-17** (the
evidence doc must pin GHSA/CVE ids, both live counts,
`Patched versions: none`, `devDependencies`, `files: out/**`, the
accepted-risk note, re-evaluation triggers, and both CI legs).
**Observed RED**: `Tests 2 failed | 234 passed (236)` / `Test Files 1
failed | 36 passed (37)` — ci.yml has zero audit steps (0 blocks),
evidence doc ENOENT; baseline 234/0 untouched (same 2 VPN excludes);
`typecheck` 0 and `lint` 0 by direct exit capture (DV-45 method).

**M2-08 final — evidence landed, both CI legs green (2026-10-08)**:
GREEN `96cc311` pushed → CI run `37719728001` **all 4 jobs success**
(`checks` ubuntu + macos, `coverage`, `e2e smoke`), and the checks-job
step list confirms `Run npm audit --omit=dev: success` +
`Run npm audit --audit-level=high: success` — both gates are live on
every push. Local GREEN observed first: `Tests 236 passed (236)` /
`Test Files 37 passed (37)`, chain 0/0/0/0 (direct capture), and both
audit commands exit 0 — the exact invocations CI runs. Issue #2's
three asks: (1) exact advisory list attached verbatim in
`docs/qa/security-m2-audit.md`; (2) upgrade path assessed — NONE
exists (`Patched versions: none`, installed = latest,
`audit fix --force` = breaking downgrade → rejected) → **accepted-risk
note recorded** with 3 re-evaluation triggers; (3) informational CI
leg added (plus S5-13's blocking prod leg). Triage: **0 high /
0 critical → 0 new issues** (the board's "triage highs" is a no-op by
the data). Batch: RED `846daa2` → GREEN `96cc311` → docs close —
**done**; issue #2 close comment goes through the owner per the
text-via-question rule.

**M2-09 security review (2026-10-08)** — review-only batch, no code/test
change (RED/GREEN not applicable: the board task is a read-only gate);
baseline **236 passed / 0 failed (37 files)** untouched. Evidence:
`docs/qa/security-m2-09.md` (§4 = the three areas line-anchored: supply
chain pin ↔ hash ↔ artifact walked end-to-end incl. live **0 unpinned
`uses:`** in both workflows; S3-key lifecycle at rest/renderer/core/logs;
IPC 11/11 `assertTrustedSender`-first + window/CSP/payload guards).
Live negative checks: `grep` shows no `env:` on the spawn (S5-12 open),
no line-buffer cap (S5-8 open), `execFile` without `timeout` (S5-15
open) — and none of the three had any tracker outside the M1-25 report.
Triage (house rule — issues, not comments): S6-1 (new low) → **#20**;
S5-12 → **#21**; S5-8 + S5-15 → **#22**; S6-2..S6-8 + S5-10 replay
residual accepted in-document; S5-14 (M2 blocker) **closed at this
gate**; S5-1..7/S5-9/S5-11 re-verified fixed against current code
(issues #7–#13, #3). Verdict **PASS — 0 critical / 0 high / 0 medium**;
M2 DoD #3 = MET. Findings rows declared in §9.1 (no new TC IDs — fix
batches #20–#22 declare theirs).

**M2-11 crash-path surfacing — RED** (2026-10-08): six tests RED-written
against the issue #19 acceptance checklist: `TC-04-20..23` (proxy-wiring —
the quit/crash/stop restore-FAILURE arms must surface the persistent
E-PLAT-003 warning, the crash SUCCESS arm must clear the snapshot without
one, the quit arm must warn BEFORE `requestQuit`) and `TC-05-24/25`
(window-lifecycle — the tray freshness re-check must skip stale start/stop
dispatch). Contract scaffolding in the same commit, zero behavior:
`WindowLifecycleDeps.getLiveState()` in src + the recorder mirror + the
index.ts provision (the dispatcher ignores it until GREEN); the
proxy-wiring harness gains the crash seam (`probe.supervisorOptions`
capture — `onStateChange` IS the production exit path) and the pre-exit
order track (`probe.events` with `messageBox`/`quit` pushes). Observed:
`Tests 6 failed | 236 passed (242)`, `Test Files 2 failed | 35 passed
(37)` — the six named ×'s for their named reasons; baseline 236 / 37
files untouched (2 VPN excludes, DV-33); typecheck + lint + prettier exit 0. RED `b3e3d14`.

**M2-11 crash-path surfacing — GREEN** (2026-10-08): src lands the three
FR-35 arms + the freshness dispatch. `surfaceRestoreFailure()` raises the
triple through the auto-apply dialog precedent (title/message/detail);
callers: `restoreAppliedProxy` (stop arm — snapshot stays on failure,
`proxy:get` truthful), the quit dep (pre-exit dialog, `messageBox` event
proven BEFORE `quit` by TC-04-20's order track) and the NEW broadcast
crash hook (`state === 'crashed' && !quitting && proxySnapshot !== null`
→ revert; `!quitting` = exit-path single-shot, null-check = module
idempotency); `handleMenuAction` re-validates `start`/`stop` through the
same pure `buildTrayMenu` model the template uses (`open`/`quit` stay
state-independent). One GREEN iteration: routing the quit dep through
`restoreAppliedProxy()` failed the M1-23a structural pin TC-04-15 (the
deps block must contain `restoreSystemProxy(`) — fixed in CODE (straight
hook + dialog inline), the pin never bent. D-10(d) flip rides this batch
(DV-36: rewording lands WITH its pin): data-flows §5 quit note now states
the implemented pre-exit surfacing (`M2-11 (issue #19)`) with no
persistence claim, `docs-consistency` pins that instead of the M1 gap
marker; the proxy-wiring header's stale "no seam exists" paragraph (crash
arm out of scope) updated. Observed: `Tests 242 passed (242)`,
`Test Files 37 passed (37)`; chain 0. GREEN `7fc0588`.

**M2-11 CI fix-forward — platform-dependent fixtures on the ubuntu leg** (2026-10-08): push run
`37725953841` (`63d0b4c`): `checks (macos-latest)` + `e2e smoke (macos-latest)` green — the
SUPPORTED branch of all six new tests proven — but `checks (ubuntu-latest)` and
`coverage (>=80% lines)` failed on two of them: TC-04-21 `precondition: applied` and
TC-04-23 `proxy:get active:true` (both `expected false to be true`). Root cause (one,
verified in source before touching anything): those preconditions assumed the auto-apply
had stored a snapshot, while `isSupportedPlatform('linux', $XDG_CURRENT_DESKTOP)`
answers **unsupported** on the ubuntu leg (the rule is `darwin || linux && gnome`) →
`autoApplySystemProxy` returns BEFORE any module call by design (AC-04.5) →
`proxySnapshot` stays `null` → `proxy:get` honestly false. The suite already had the
pattern (TC-04-16/17 derive `supported` and guard) — this batch just hadn't. Fix-forward
(single commit): TC-04-21/22/23 derive the same `supported` and branch — supported → the
full pins as RED-written (darwin); unsupported → the arms' NULL-idempotency pins (crash:
no revert attempt, no warning, `proxy:get` honest; stop: `stopped.ok` + the E-PLAT-003
dialog stay UNCONDITIONAL — stop-arm surfacing is platform-independent, which CI itself
proved by failing only on the `active` assert). TC-04-20 (quit — unconditional restore,
snapshot or not) and TC-05-24/25 (pure policy) needed no guard. Observed local (darwin):
`Tests 242 passed (242)`, `Test Files 37 passed (37)`, chain 0; acceptance = the push run
on this fix commit (mac legs already green on `37725953841`, ubuntu legs = what this
fixes). DV-52.

**M2-10 RED — real-binary integration, strategy D-4 (TC-02-21..24)** (2026-10-08): wrote the
four real-binary rows in a NEW file `tests/unit/core-supervisor-real.test.ts` — the SAME
supervisor against the staged PINNED core (`core-bin/<target>/xray`): boot-acceptance
within 1 s + exactly `[starting, running]` + readiness connect (TC-02-21), the real
`started` line through the line-based sink (TC-02-22 — fake-core prints READY, so the
line can only come from the real engine: the D-4 signature), stop → port released + T
deleted (TC-02-23), external SIGKILL → `crashed` + E-CORE-001 + T reaped (TC-02-24 —
the errors.md §6 arm on the real binary). Feasibility boot-check BEFORE writing any row
(DV-50 discipline): a raw `xray run` of a port-19080 copy of the fixture bound loopback,
printed `started`, SIGTERM → exit 0 — the pinned `v26.9.9-1.0.1fed` accepts the fixture
(DV-53). **Observation venue = CI** (DV-53): FR-15/FR-21 hardcode `127.0.0.1:10808` and
PacketTun (VPN on) holds it on the dev machine → ci.yml checks + coverage jobs now run
`npm run prepare:core` (sha-verified staging) before the suite; the documented VPN-on
local command gains a third `--exclude 'tests/unit/core-supervisor-real.test.ts'` (local
baseline unchanged: 242 passed / 37 files). DV-33 lock + DV-29 port-free afterEach barrier
reused verbatim. Observed local: chain exit 0 (format, lint, typecheck, prettier); the
CI RED/GREEN counts land in the follow-up entry with both commit hashes.

**M2-10 observation — GREEN on the sanctioned venue, G-05 re-measured** (2026-10-08): push
run `37760697553` on RED `328f446` — **all 4 jobs success**. `checks (macos-latest)` and
`checks (ubuntu-latest)`: `Tests 264 passed (264)` each, with
`✓ tests/unit/core-supervisor-real.test.ts (4 tests)` visible in BOTH legs (macOS =
darwin-arm64 staged binary, ubuntu = linux-x64 — the M2-05 staging map in action); the
two fake suites (15 + 3) ran alongside under the shared DV-33 lock. `coverage`: same
264/264 with `prepare:core` staging logged (3 targets, SHA-verified) — **G-05 number
re-measured WITH the real-binary rows: 85.23 % lines** (84.49 % stmts / 73.17 % branch /
87.2 % funcs) ≥ the 80-lines gate (the previous authoritative 84.59 %, DV-43, predates
this file). Local observation of the same commit: chain exit 0 (format, lint, typecheck,
prettier) and the VPN-on excluded run 242 passed / 37 files (baseline untouched); the
suite itself locally shows the venue RED only (E-IO-003 precondition ×4 — PacketTun holds
10808, exactly what DV-53 declares, never a behavioral failure). The suite passed as
written → **no dev-GREEN commit exists for this batch** (verification suite against
pre-existing correct behavior; D-4 has no fix to make — the boot-check de-risked the one
real unknown: that the pinned fedarisha core accepts the fixture). Board M2-10 → done;
ci.yml's coverage comment now cites the new authoritative number (same commit).

_(Further entries appended when a batch is written/observed, mirroring the M1 §13
narrative style: counts, observed RED, baseline untouched, green results.)_

## 11. Deviations log (QA bookkeeping)

Continues the **global DV sequence** from `m1-test-plan.md` §14 (last M1 entry: DV-37).
M2 batches start at **DV-38**.

| ID    | Deviation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Effect / amendment                                                                                                                                                                                                                                                                                                                                                              | Owner                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-38 | The M2-02 batch opens this plan as a **skeleton**: scope matrix (§1) + TC families (`TC-PKG-nn` for cross-cutting M2 pins; story sequences continue per the numbering rule) + logs, with rows landing RED-first per batch instead of a pre-planned full matrix like M1 had. Rationale: M2 batches are discovery-driven (upstream pinning, builder config, CI) — planned row titles cannot be honest before the config contracts exist; the per-batch declarations in §11 keep the ID/count audits identical to M1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §1 scope matrix + numbering rule recorded here; counts start at 0 and grow per batch (each batch's §11 row carries its own +N/observed-RED numbers); no tests weakened (none exist yet).                                                                                                                                                                                        | QA                                                                                                                                                                                                                                                   |
| DV-39 | The M2-03 batch opens M2 verification with the core-pinning contract (board M2-03; BRIEF §9 "pinned release + commit SHA recorded in docs"; M2 DoD #1 "SHA-256 of bundled core verified at build time") as 3 new TC IDs (TC-PKG-01..03) in `tests/unit/core-pin.test.ts`, and needs these declarations: (1) **NEW FAMILY `TC-PKG-nn`** — declared in this plan's numbering rule (M2-02/DV-38), cross-cutting pins for pinning/packaging/CI; (2) **the CLI contract is written in the RED header** (exit 0 match / exit 1 MISMATCH naming asset + expected/actual / exit 2 usage; `--pin-doc` override exists so tests run against a synthetic record — the 3 × ~23 MB release assets never enter the repo or the test); (3) **GREEN scope** — download the three bundled assets (Xray-linux-64, Xray-macos-64, Xray-macos-arm64-v8a) + `.dgst` from release `v26.9.9-1.0.1fed` into the workspace temp dir, compute SHA-256, resolve the tag commit SHA, write `docs/analysis/core-pin.md` (tag/published/commit/asset table + upstream-dgst cross-check note), add `scripts/verify-core-pin.mjs` + the `verify:core-pin` npm script; (4) counts +3 (§2 rows), first execution-log entry in §10; (5) RED observed: `Tests 3 failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 215 passed (218)`, `Test Files 1 failed                                                                                                                                                                                                                                                                                                                                         | 31 passed (32)`, exit 1 — all 3 for their named missing-artifact reasons (never a harness error), baseline 215 passed / 0 failed untouched; (6) no `errorWording`rows (no`E-*`code),`tests/unit/ipc-contract.test.ts` untouched (no channel change). | §2 +3 rows, §10 first entry, §11 this row; GREEN = pin doc + verify script + npm script. | QA  |
| DV-40 | The M2-04 batch executes board task M2-04 (bundled-core path resolution — board Phase B; BRIEF §5/§9; S4-5 / issue #6 packaged gate; M2 DoD #2) as 5 new TC IDs (TC-02-16/17/18, TC-02-20 in `tests/unit/core-binary-path.test.ts` + TC-PKG-04 in the same file) and needs these declarations: (1) **ABSENCE RED mechanism** — the three pure-function rows load the not-yet-existing `src/main/core-binary-path.ts` through a NEW helper `tests/helpers/core-binary-path-stub.ts` with a NON-LITERAL dynamic specifier, because `tests/**` sits inside `tsconfig.node.json`'s include and a literal import would break `npm run typecheck` (which must stay exit 0 during RED) — verified M1-16/DV-28 pattern (the identical loader ships for core-wiring/system-proxy/core-supervisor/window-lifecycle); absence RED is the legitimate strategy-§5.2 failure and must never be weakened; (2) **US-02 numbering skip** — TC-02-19 is already taken (M1-26, m1-test-plan DV-32), so this batch continues at TC-02-20; TC-02-16/17/18 fill the gap before it (numbering rule: `nn` ≥ 10 for non-AC cases, never renumbered); (3) **cross-family row in §3** — TC-PKG-04 (raw-text `prepare:core` + `.gitignore core-bin/` pin) lives in the US-02 section because it is part of the same board task's contract; §1's family cell was updated accordingly; (4) **GREEN scope** — pure `src/main/core-binary-path.ts` (resolution order: packaged bundle > verbatim dev override > `join(resourcesPath ?? '.', 'core', platform, 'xray')`, total), `src/main/index.ts` delegation (local function removed — one implementation), `scripts/prepare-core.mjs` + `prepare:core` (download the three pinned zips from the release tag in `docs/analysis/core-pin.md`, verify SHA-256 via the existing `expectedShaForAsset`, extract all five members into `core-bin/<darwin-x64\|darwin-arm64\|linux-x64>/`, chmod 0755 `xray`; `unzip` is the only external tool) and `.gitignore core-bin/`; **electron-builder `extraResources` is explicitly NOT part of this GREEN** — it is M2-05's own RED row ("core in extraResources" on the board); (5) counts +5 (§3 rows), RED observed `Tests 5 failed \| 218 passed (223)`, `Test Files 1 failed \| 32 passed (33)`, exit 1 — 3 absence + 2 structural, each for its named reason, baseline 218 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code introduced — the supervisor's existing E-IO-004 missing-binary behavior is unchanged), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §3 +5 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = pure module + host delegation + staging script + ignore.                                                                                                                                                                                                                                               | QA                                                                                                                                                                                                                                                   |
| DV-41 | The M2-05 batch executes board task M2-05 (electron-builder config — Phase C; owner decisions 2026-10-08: BRIEF §9 AppImage + `.deb` + `.rpm`, BRIEF §10 no Apple account → unsigned; M1 finding S5-18 asar-pin recommendation; M2 DoD #4 attributions note) as 3 new TC IDs (TC-PKG-05/06/07 in `tests/unit/builder-config.test.ts`) and needs these declarations: (1) **AMEND RED, not absence, for the config** — `electron-builder.yml` exists since M0; the pins fail on the MISSING lines only (`asar: true`, `mac.identity: null`, `linux` rpm target, both `extraResources` blocks) while the pre-existing M0 content (appId, files, dmg/AppImage/deb, categories) is asserted GREEN-ready — this is the legitimate "config pin written before its amendment" failure; (2) **YAML parsing = comment-aware block scanner** (raw-text DV-36 pattern, no YAML library): section membership (`mac:`, `linux:` at col 0) is contractual, indentation is not — prettier normalizes the file before every commit and the tests parse the formatted bytes; whole-line comments and blank lines are never contractual (`live()` filter), a col-0 comment does NOT end a block, the next top-level key does; (3) **GREEN scope** — `electron-builder.yml` amendments only: top-level `asar: true`; `mac:` gains `identity: null` + directory-level `extraResources` `core-bin/darwin-${arch}` → `core/darwin`; `linux:` targets become AppImage, deb, rpm + `core-bin/linux-${arch}` → `core/linux` (directory-level on purpose: xray + geodata + LICENSE + README — the TC-02-18 resolver path and M2-06 attributions both land there); NEW doc `docs/product/macos-gatekeeper.md` (English: right-click → Open, Privacy & Security → Open Anyway, `xattr -cr`, explicit "no notarization" statement); **building the package is NOT in this batch** — M2-07 (release CI, DoD #1) and M2-12 (fresh-machine, DoD #2) own it; (4) counts +3 (§4 rows), §1 family cell updated to `TC-PKG-05..07`; (5) RED observed: `Tests 3 failed \| 223 passed (226)`, `Test Files 1 failed \| 33 passed (34)`, exit 1 — TC-PKG-05 on the absent `asar: true`, TC-PKG-06 on the absent `extraResources` rows, TC-PKG-07 on ENOENT (doc missing), baseline 223 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code — packaging config and docs only), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §4 +3 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = yml amendments + Gatekeeper doc.                                                                                                                                                                                                                                                                       | QA                                                                                                                                                                                                                                                   |
| DV-42 | The M2-06 batch executes board task M2-06 (license attributions — Phase C; BRIEF §5; M2 DoD #4, whose wording was corrected the same day: "License notice (core: MPL-2.0) + third-party attributions present in artifacts") as 3 new TC IDs (TC-PKG-08/09/10 in `tests/unit/license-bundle.test.ts`) and needs these declarations: (1) **spec-before-pin was satisfied by a dedicated reconciliation commit** — `59e767d` corrected every "core = GPL-3.0" claim to MPL-2.0 across 18 files (evidence: the LICENSE inside the release assets reads "Mozilla Public License Version 2.0"; the GitHub license API reports spdx `MPL-2.0`; the client itself stays GPL-3.0), so this RED pins the reconciled truth — never the pre-correction claim; (2) **GREEN scope** — `resources/licenses/THIRD-PARTY-NOTICES.md` (English: Xray-core-fedarisha MPL-2.0 + `docs/analysis/core-pin.md` provenance pointer, Electron MIT, react/react-dom MIT, app = GPL-3.0) + verbatim texts `xray-core-fedarisha-LICENSE.txt` (copied from the `prepare:core` staging output — the LICENSE inside the pinned assets), `electron-LICENSE.txt` (= `node_modules/electron/LICENSE`), `react-LICENSE.txt` (= `node_modules/react/LICENSE`) + a **top-level** `extraResources` entry `resources/licenses` → `licenses` in `electron-builder.yml` (electron-builder concatenates global + platform-specific lists — verified in `app-builder-lib/out/fileMatcher.js` `getFileMatchers`, so it composes with the M2-05 mac/linux core blocks; directory-level `from` copies CONTENTS into the destination); (3) **duplicate helpers on purpose** — `repoFile/live/blockOf` are copied from `tests/unit/builder-config.test.ts` instead of extracting a shared module, because editing that GREEN file's infrastructure is out of scope for this batch (M1 precedent: per-file local constants/helpers); (4) counts +3 (§5 rows); (5) RED observed: `Tests 3 failed \| 226 passed (229)`, `Test Files 1 failed \| 34 passed (35)`, exit 1 — 2 ENOENT (notices, core text) + 1 absent-config-block, each for its named reason, baseline 226 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code — docs + config only), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §5 +3 rows, §10 RED entry, §11 this row; GREEN = notices + 3 texts + yml entry.                                                                                                                                                                                                                                                                                                 | QA                                                                                                                                                                                                                                                   |
| DV-43 | The M2-07 batch executes board task M2-07 (release CI & gates — Phase D; M2 DoD #1; the two documented M1 deferrals: coverage job per G-05/acceptance-m1-27.md and e2e job per docs/qa/e2e-ci-proposal.md) as 4 new TC IDs (TC-PKG-11..14 in `tests/unit/release-ci.test.ts`) and needs these declarations: (1) **G-05 measured BEFORE the gate landed** — the acceptance deferral note says the CI coverage job "needs the authoritative number first"; a temporary `coverage-probe` branch (ci.yml with a coverage job + the probe branch in `on.push.branches`) produced **84.59 % lines / 83.85 % stmts / 71.92 % branch / 86.61 % funcs** on ubuntu-latest with the full suite green (run `37711514257`, 2026-10-08) — ≥ `coverage.thresholds.lines: 80`, so the gate lands as a known pass; the probe branch was deleted (remote + local) immediately after the measurement and never touched main; (2) **e2e lands as the proposal's rollout #1** — macOS leg only (`runs-on: macos-latest`), the Linux leg is explicitly PINNED AS ABSENT in TC-PKG-13 and deferred to its own batch behind the keyring/safeStorage verification the proposal itself prescribes ("2. Linux leg behind a keyring/safeStorage verification (R-5 mitigation path)") — the pin on absence documents the deferral, it is not a weakened test; (3) **workflow block parsing** — a new indented `jobBlock()` scanner (ci.yml jobs live at indent 2 under `jobs:`, unlike the col-0 `blockOf()` scanner for electron-builder.yml); blocks end at the next same-indent key; (4) **GREEN scope** — NEW `.github/workflows/release.yml` (tag `v*` trigger, `permissions: contents: read`, matrix macos+ubuntu, pinned checkout/setup-node SHAs, `npm ci` → `npm run prepare:core` → Linux `apt-get install -y rpm` → `npm run dist` → `npm run release:manifest -- release` → `actions/upload-artifact` pinned to a full SHA with `if-no-files-found: error`); `ci.yml` gains the `coverage` job (ubuntu, `ELECTRON_SKIP_BINARY_DOWNLOAD`, `npm run test:coverage` — the checks job untouched) and the `e2e` job (macOS, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, no `ELECTRON_SKIP_BINARY_DOWNLOAD`, lint → typecheck → port preflight → `npm run test:e2e`); NEW `scripts/release-manifest.mjs` + `release:manifest` npm script (writes `<dir>/SHA256SUMS.txt` for top-level files only — the manifest and subdirectories are skipped, sorted by name — then RE-VERIFIES by re-hashing: OK → exit 0, tamper → exit 1 `MISMATCH` naming the file, bad args → exit 2); (5) counts +4 (§6 rows), §1 family cell updated; (6) RED observed: `Tests 4 failed \| 229 passed (233)`, `Test Files 1 failed \| 35 passed (36)`, exit 1 — 1 ENOENT + 2 absent-job + 1 absent-CLI, each for its named reason, baseline 229 passed / 0 failed untouched; (7) no `errorWording` rows (no `E-*` code — CI config + a build-time manifest tool), `tests/unit/ipc-contract.test.ts` untouched (no channel change); M2-08's audit evidence is a SEPARATE row in §6 (not this batch). | §6 +4 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = release.yml + 2 ci.yml jobs + manifest CLI.                                                                                                                                                                                                                                                            | QA                                                                                                                                                                                                                                                   |
| DV-44 | During M2-07 GREEN — AFTER the RED commit `53c052e` observed 4 named failures — two latent defects in TC-PKG-14 (manifest CLI) surfaced that the RED observation never reached (the first assertion failed first, masking them), and both are corrected IN THE GREEN commit, deviating from the usual "RED file frozen after commit" rule: (1) **dead regex** — the manifest-content assertion joined the two expected lines as `...alpha\.dmg$[0-9a-f]{64}...` with `$` (multiline) between them, so the pattern could never match a real two-line manifest (no newline is consumed between `$` and the next hex); replaced with an EXACT line-equality check (`toEqual` of the parsed non-empty lines against two `expect.stringMatching(/^[0-9a-f]{64} {2}<name>$/)` entries — sorted order and line count now pinned too) plus two NEGATIVE pins that the message had promised but the assertion had never stated (`subfolder` never hashed, `SHA256SUMS.txt` never self-hashed); (2) **unenforceable semantics** — a write-then-hash implementation would recompute digests on every run and therefore always exit 0, making the tamper case (the core of DoD #1) impossible to fail; the contract is corrected to TWO-RUN semantics: first run writes the manifest and re-verifies the write against a second hashing pass, re-runs verify the CURRENT files against the EXISTING manifest record (changed/missing/unlisted file → exit 1 `MISMATCH` with expected/actual, manifest never rewritten on drift), and the RED header text was updated to match. No assertion was weakened — the corrected set enforces MORE than the original (exact content, ordering, negatives, drift detection); behavior and both failure modes stay exactly what the batch's contract describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Tests/unit/release-ci.test.ts TC-PKG-14 (header + content/tamper assertions) edited in the GREEN commit with this row; GREEN observed 4 passed, full suite 233 passed / 0 failed.                                                                                                                                                                                               | QA                                                                                                                                                                                                                                                   |
| DV-45 | **Evidence-method deviation, caught by CI** (2026-10-08): the M2-07 RED commit `53c052e` and GREEN commit `f78073c` both state "npm run lint ... exit 0" — a FALSE observation. The local chain piped lint through a shell tail (`npm run lint 2>&1 \| tail -1`), and empirically (re-tested after CI failed) that pipe prints nothing and returns the tail's exit 0 even when eslint fails; the mis-sorted imports in `tests/unit/release-ci.test.ts` (`node:child_process` after `node:path`, `simple-import-sort/imports`) existed from the RED commit onward. GitHub Actions caught it on run `37712854252` (all three lint steps: checks ubuntu, checks macos, e2e macos), while the coverage job itself PASSED. Resolution: (1) `npx eslint --fix` on the test file (imports only — no assertion/content change), (2) §10 entry above RETRACTS the false exit-0 claims and records the true method, (3) verification chain corrected — all gate checks now run with direct exit-code capture (`cmd > /dev/null 2>&1; echo $?`), observed after the fix: lint 0, typecheck 0, prettier 0, full suite 233 passed / 0 failed (36 files), (4) e2e's real steps (port preflight → build → smoke) remain UNOBSERVED — run `37712854252` reached only its lint step; no e2e verdict is claimed until a run executes them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Fix + §10 correction + this row; M2-07's evidence lines on the board cite the CI-observed coverage pass and this run.                                                                                                                                                                                                                                                           | QA                                                                                                                                                                                                                                                   |
| DV-46 | The release-workflow validation on CI (tag `v0.0.0-ci-test`, run `37713415626`) failed BOTH legs — an observation batch inside M2-07: (1) _cause macos_ — electron-builder implicitly publishes to a GitHub Release on a git-tagged checkout ("Implicit publishing triggered by git tag … Please use --publish explicitly", then `GitHub Personal Access Token is not set … env "GH_TOKEN"`) AFTER the dmg+blockmap were built; locally this branch never fired (dirty working tree), so the CI tagged checkout is treated as the authoritative environment per the batch's own honesty rule; (2) _cause ubuntu_ — the deb/rpm targets validate `author.email` ("Please specify author 'email' in the application package.json") and `package.json.author` was the bare string `vladimir-opencode-agent[bot]`. Resolution: release.yml's build step became `npm run dist -- --publish never` (electron-builder's own prescribed remedy; GitHub-Release publishing is explicitly out of scope for this workflow — the workflow uploads artifacts via `actions/upload-artifact` and distribution stays a manual step) and `package.json.author` became `vladimir-opencode-agent[bot] <vladimir-opencode-agent[bot]@users.noreply.github.com>` (the git identity that actually builds; no test/doc pins the author field — checked before editing). Local check of the flag path: `npm run dist -- --publish never` → `electron-builder --publish never`, exit 0, dmg rebuilt. **No RED amendment**: TC-PKG-11's raw pins (`npm run dist`, prepare:core, manifest, upload-artifact SHA, if-no-files-found) hold verbatim — the diff only makes "the workflow builds the artifacts" (the RED's stated contract) true; this is GREEN fix-forward on an observed failure, same class as DV-45's lint fix. The re-tagged validation run's result is recorded in §10 only after it exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | release.yml build step + package.json author, both in the fix commit; §10 observation entry.                                                                                                                                                                                                                                                                                    | QA/devops                                                                                                                                                                                                                                            |
| DV-47 | The owner asked (2026-10-08, after M2-07 closed) to split the release legs by distro — ".deb на ubuntu, .rpm на fedora (если так можно)" — so this follow-up batch adds TC-PKG-15 against `.github/workflows/release.yml` while the M2-07 RED/GREEN/DV-45/DV-46 history stays untouched. Feasibility was established BEFORE writing the row: (a) GitHub has NO hosted Fedora runners → the supported mechanism is a **container job** (`runs-on: ubuntu-latest` + `container: image: fedora:46` — fedora:46 = Docker Hub's current stable on 2026-10-08, pinned by MAJOR, `latest` explicitly rejected by the pin); (b) electron-builder's `--linux` is an **array option** (`electron-builder --linux deb tar.xz` per `--help`) → per-leg target lists (`--linux AppImage deb` / `--linux rpm`) override `electron-builder.yml`'s target list FOR THAT RUN — the yml itself is NOT edited, so TC-PKG-06's pinned `linux.target: [AppImage, deb, rpm]` and the local `npm run dist` behavior remain intact; (c) the fedora-minimal image ships neither git (actions/checkout), nor rpmbuild (`rpm-build` — the whole point of the split: native rpmbuild instead of Debian's `rpm` package), nor **unzip** (`scripts/prepare-core.mjs` spawnSyncs it — verified in source), nor zstd (actions/cache `tar --zstd`) → one `dnf -y install git rpm-build unzip zstd` step pinned to run BEFORE checkout, with the ORDER itself asserted (`indexOf` comparison); (d) artifact-name collision avoided: the matrix job keeps `artifacts-${{ runner.os }}` (macOS/Linux) while the container job uploads `artifacts-fedora`. GREEN scope: release.yml `build` job → matrix `include:` with per-leg `dist_args` + upload `paths`; NEW `build-rpm` job (fedora:46 container, prepare:core → build → `npm run dist -- --publish never --linux rpm` → release:manifest → upload). RED observed: `Tests 1 failed \| 4 passed (5)` for the file, full suite `Tests 1 failed \| 233 passed (234)` (matrix job lacks `--linux AppImage deb`; no `build-rpm` job), baseline 233 passed / 0 failed untouched; lint + typecheck exit 0 via direct capture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §1 family cell `..15`, §6 row, §10 RED entry, §11 this row; GREEN = release.yml only.                                                                                                                                                                                                                                                                                           | QA/devops                                                                                                                                                                                                                                            |
| DV-48 | **Environment incident — shell-write word substitution** (observed 2026-10-08 during the TC-PKG-15 GREEN): the session's bot-mode git wrapper substitutes the standalone word `git` in the RAW text of shell commands — including single-quoted heredoc bodies that python/cat write to disk. Probed conclusively: `echo "plain git word, git tag, github.com"` landed in the file as `plain <shim> word, <shim> tag, github.com` (only the standalone token is hit — `github.com`, regex-internal `*git[` and similar survive), while the identical content written through the `write` tool came back LITERAL (`grep local/bin` = 0). Damage found: 8 prose occurrences in 2 files — `tests/unit/release-ci.test.ts` ×1 (the TC-PKG-15 order-assertion message) and `docs/qa/m2-test-plan.md` ×7 (the §10 M2-07 narrative entries plus the DV-46/DV-47 rows: `git tag`, `git identity`, `dnf -y install git rpm-build…`) — all committed by the time it surfaced (RED `67a4d74`, GREEN `21940b8`/`4e05276`). Resolution: all 8 restored to `git` with the **edit tool** (probe-verified clean channel) in this batch's GREEN commit; one already-pushed commit message (21940b8) also carries the substituted path — history NOT rewritten for a cosmetic prose defect, the record lives here + §10. **Process rule recorded in §10**: prose writes containing the word go through `write`/`edit` or concatenation-built strings; shell-written files get a `grep local/bin/git-bot` post-check before staging. No test counts affected — the substitutions lived only in comment/message strings, never in executable code or YAML (workflows/scripts checked: 0 hits).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Restored 8 occurrences (edit tool); §10 incident entry; this row.                                                                                                                                                                                                                                                                                                               | QA                                                                                                                                                                                                                                                   |
| DV-49 | TC-PKG-15's order assertion as RED-written compared `rpm.indexOf('dnf -y install')` against `rpm.indexOf('actions/checkout')` — the SECOND anchor matched the first MENTION of the phrase, which sits in the job's own explanatory comment (`# fedora-minimal ships none of these: git (actions/checkout), …`) at position 188, while the dnf step is at 495 → the correct GREEN text failed the check for the wrong reason ("expected 495 to be less than 188"). Corrected IN THE GREEN commit (same class as DV-44 — a RED-time latent defect that the RED observation never reached because `build-rpm` was absent, so the assertion died earlier on the job lookup): the checkout anchor became `- uses: actions/checkout` (the real step marker — the comment contains `actions/checkout` but never `- uses: actions/checkout`), the dnf anchor became `run: dnf -y install` (also unique to the step). The ORDER semantics is unchanged and now points at actual steps, not prose. No other assertion touched; observed GREEN 5 passed (5) for the file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | tests/unit/release-ci.test.ts TC-PKG-15 (2 anchor literals), this row.                                                                                                                                                                                                                                                                                                          | QA                                                                                                                                                                                                                                                   |
| DV-50 | **Observed CI failure on the new fedora leg — fix-forward** (2026-10-08). GREEN `7f5554f` test-tag run `37717025643`: `build (macos-latest)` success, `build (ubuntu-latest)` success — which EMPIRICALLY PROVES the per-leg CLI target lists (`--linux AppImage deb`, no `--linux` on macOS) override `electron-builder.yml`'s target list for one run: the ubuntu leg produced deb + AppImage with ZERO rpm tooling present (the yml itself stayed untouched — TC-PKG-06 intact). The `build rpm (fedora container)` job failed at step `Build rpm (electron-builder + native rpmbuild)` with `ruby: error while loading shared libraries: libcrypt.so.1: cannot open shared object file` → `failedTask=build … fpm process failed 127` (electron-builder cache `fpm@2.1.4`, bundled `fpm-1.17.0-ruby-3.4.3-linux-amd64`). Root cause: electron-builder's rpm target runs its **bundled fpm (ruby)**, which links against `libcrypt.so.1`; Fedora ≥ 38 ships only `libcrypt.so.2` (libxcrypt moved) — the legacy `.so.1` symlink is provided by the separate **`libxcrypt-compat`** subpackage, existence confirmed on packages.fedoraproject.org BEFORE writing the fix (no blind retries — one root cause, one fix). Fix-forward (single commit): `libxcrypt-compat` appended to the pinned dnf line `dnf -y install git rpm-build unzip zstd libxcrypt-compat` (still before `actions/checkout` — both order anchors `run: dnf -y install` and `- uses: actions/checkout` keep holding); step name → `Native rpm tooling + git + unzip + libcrypt (fedora minimal)`; job comment now documents the observed fpm → rpmbuild chain (the earlier "NATIVE rpmbuild" phrasing was an assumption — corrected; `rpm-build` remains required because fpm shells out to rpmbuild) and cites this DV + the run id; TC-PKG-15's dnf regex extended to `[^\n]*zstd[^\n]*libxcrypt-compat` and its message/header updated, so the toolchain line is pinned end-to-end and the fix cannot regress silently. No other assertion changed; observed local GREEN: `Tests 234 passed (234)`, `Test Files 36 passed (36)`, format/lint/typecheck/prettier all 0 via direct exit capture; acceptance = the tag run re-triggered on the fix commit (mac + ubuntu legs already proven green on `37717025643`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | release.yml (dnf line, step name, comments), tests/unit/release-ci.test.ts (TC-PKG-15 regex + message + header), §10 entry, this row.                                                                                                                                                                                                                                           | devops                                                                                                                                                                                                                                               |
| DV-51 | M2-11 (issue #19) batch declarations (house rule §1). (1) **6 NEW TEST IDS in two EXISTING files, zero new files**: TC-04-20..23 appended to `tests/unit/proxy-wiring.test.ts`, TC-05-24/25 appended to `tests/unit/window-lifecycle.test.ts` — the proxy-wiring describe sits at FILE END on purpose (placement is CONTRACT: firing `before-quit` flips index.ts's module-level `quitting` marker for the rest of that file's module instance, so the quit case runs LAST inside the describe and no other describe follows it). (2) **RED-time contract scaffolding, zero behavior**: `WindowLifecycleDeps.getLiveState()` as a REQUIRED field in `src/main/window-lifecycle.ts` + the mirror in `tests/helpers/window-lifecycle-stub.ts` (recorder default `'stopped'`, a PURE read — never recorded into `calls`, so the teardown-order pins and the dispatch `toEqual([...])` pins observe side effects only) + the `index.ts` provision (the dispatcher does not consult it until GREEN) — the house pattern for adding a dep without breaking typecheck-at-RED; the proxy-wiring harness gains the crash seam (`probe.supervisorOptions` capture in the `core-supervisor` mock — `onStateChange` IS the production exit path) and the pre-exit order track (`probe.events` with `messageBox`/`quit` pushes; `indexOf` order = TC-04-20's pre-exit proof). (3) **Existing-pin fixture adaptation, strengthening only**: `trayMenu.dispatch.actionsForwardToInjectedHandlers` now sets the live state before each dispatch (`stopped` → Start, `running` → Stop) — the pin `exactly ['startTunnel'] / ['stopTunnel']` is UNCHANGED, only the legality precondition became explicit. (4) **TC-04-15 shape decision (pin never bent)**: GREEN first routed the quit dep through `restoreAppliedProxy()` and failed the M1-23a structural pin (the deps block must contain `restoreSystemProxy(`) — fixed in CODE (straight-to-hook delegation, dialog inline); the stop route keeps `restoreAppliedProxy`, both arms still surface E-PLAT-003. (5) **Counts and observations**: §8 +6 rows; observed RED `Tests 6 failed \| 236 passed (242)`, `Test Files 2 failed \| 35 passed (37)` (baseline 236 / 37 files, 2 VPN excludes DV-33); observed GREEN `Tests 242 passed (242)`, `Test Files 37 passed (37)`; chain (format, lint, typecheck, prettier) exit 0 at both commits; one local GREEN iteration (the TC-04-15 pin above) resolved before committing. (6) D-10(d) pin flip + data-flows §5 rewording land TOGETHER with their prose (DV-36 rule — rewording with its pin, never apart). (7) No new `E-*` code (errorWording untouched), no channel change (ipc-contract untouched — DV-27/30/34/35 precedent), the dialog pinned as CALLED with the E-PLAT-003 triple shape (`title`/`message`/`detail`), exact wording unpinned (A-14 / DV-35(4) precedent — errors.md authors it).                                                                                                                                              | §8 +6 rows; §10 RED+GREEN narrative entries; this row; RED `b3e3d14` → GREEN `7fc0588` (src: `window-lifecycle.ts`, `index.ts`) → docs commit (`data-flows.md` §5, `docs-consistency.test.ts` D-10(d) flip + header note, `proxy-wiring.test.ts` header, this plan §8/§10/§11, board M2-11 → done); issue #19 stays OPEN pending owner (comment/closure text via user decision) | QA                                                                                                                                                                                                                                                   |
| DV-52 | **Observed CI failure on the ubuntu legs — fix-forward** (2026-10-08). Push run `37725953841` (`63d0b4c`): `checks (macos-latest)` success, `e2e smoke (macos-latest)` success; `checks (ubuntu-latest)` + `coverage (>=80% lines)` failure = 2 of the 6 M2-11 tests — TC-04-21 `precondition: applied` and TC-04-23 `proxy:get active:true` (both `expected false to be true`). Root cause: platform-dependent FIXTURES (no behavior bug — src was correct on both platforms): the auto-apply stores a snapshot only on a supported desktop (`isSupportedPlatform`: `darwin \|\| linux && gnome`), and the ubuntu leg is linux without a desktop env → `autoApplySystemProxy` skips before any module call (AC-04.5) → `proxySnapshot` stays `null` → `proxy:get` honestly false; the green macOS leg proves the supported branch. The suite already had the pattern (TC-04-16/17 derive `supported` and guard) — this batch just hadn't. Fix-forward (single commit): TC-04-21/22/23 derive the same `supported = isSupportedPlatform(process.platform, process.env.XDG_CURRENT_DESKTOP).supported` and branch — supported: the full RED-written pins (darwin); unsupported: the crash/stop arms' NULL-idempotency pins (no revert attempt, no warning, `proxy:get` honest) — so BOTH legs now pin real behavior; the stop-arm `stopped.ok` + E-PLAT-003 dialog asserts stay UNCONDITIONAL (platform-independent — CI itself proved it by failing only on the `active` assert). TC-04-20 (quit — the restore is unconditional) and TC-05-24/25 (pure policy) needed no guard. No src change, no pin weakened: the unsupported branch ADDS pins that were previously asserted nowhere (crash-with-nothing-applied = no-op). Observed local (darwin): `Tests 242 passed (242)`, `Test Files 37 passed (37)`, format/lint/typecheck/prettier exit 0; acceptance = the push run on this fix commit (mac legs already green on `37725953841`, ubuntu legs = what this fixes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | tests/unit/proxy-wiring.test.ts (TC-04-21/22/23 `supported` guards), §10 entry, this row; board M2-11 evidence line.                                                                                                                                                                                                                                                            | QA                                                                                                                                                                                                                                                   |
| DV-53 | M2-10 batch declarations (house rule §1). (1) **4 NEW TEST IDS, one NEW file** `tests/unit/core-supervisor-real.test.ts` — family **TC-02-21..24** (§1 numbering rule: supervisor/bundled-core behavior continues at TC-02-16+, 16..20 taken by M2-04; §1 row7's speculative `TC-03-..` hint resolved to TC-02 and the cell now states the decided family). (2) **VENUE = CI (authoritative)**: the FR-15 pre-check and the FR-21 readiness probe hardcode `127.0.0.1:10808` (src/main/core-supervisor.ts) and PacketTun (VPN on) holds that port on the dev machine → per the plan row itself ("the suite runs in CI or a VPN-off window"), ci.yml's checks + coverage jobs gain `npm run prepare:core` (M2-04 sha-verifying staging; `unzip` ships on both runners) before `npm test` / `npm run test:coverage`; the documented VPN-on local command adds `--exclude 'tests/unit/core-supervisor-real.test.ts'` (local baseline unchanged: 242 passed / 37 files, still 2 fake-suite excludes + this one); NO silent skip — a held port fails the suite loudly (e2e port-preflight precedent DV-31(4)). (3) DV-33 cross-file lockfile mutex + the DV-29 port-free afterEach barrier reused VERBATIM → FREE-port handoff with the two fake suites under parallel vitest workers. (4) **Feasibility boot-check BEFORE writing rows** (DV-50 one-root-cause discipline): a raw `xray run -c` of a port-19080 copy of `valid-client-config.json` bound loopback, printed the `started` line, SIGTERM → exit 0 (2026-10-08, temp artifact) — the pinned `v26.9.9-1.0.1fed` accepts the fixture; the D-4 signature follows from the same observation (only the real binary prints `started`; fake-core prints READY). (5) **In-file helpers only, no src change**: `realCorePath()` (the M2-05 staging map, LOUD when unstaged — a venue problem, never a skip), `coreConfigDirs()` (T set-diff — the fake suites recover T from the recorded argv, the real binary records none, so FR-22/FR-23 pins ride the directory diff), `pidUsingConfig()` (`ps -axwwo pid=,args=` arg scan — an args ARRAY, never a shell (PR-08 style); the `ww` keeps the full config path untruncated when stdout is a pipe; syntax verified on the dev mac, valid on procps). (6) Counts + observation: §7 +4 rows; RED `328f446` → observed 2026-10-08 in the sanctioned venue — CI run `37760697553` **all 4 jobs green**, `Tests 264 passed (264)` on BOTH checks legs with the real file visible in each, coverage 264/264 with `prepare:core` staging logged (3 targets) and **G-05 re-measured: 85.23 % lines** (84.49 % stmts / 73.17 % branch / 87.2 % funcs ≥ 80 — DV-43's 84.59 % predates this file and is superseded as the gate's current basis); suite GREEN as written → no dev-GREEN commit exists (verification batch — no behavior fix was needed; the boot-check in (4) de-risked the only real unknown); local: chain exit 0 + VPN-on excluded baseline 242 passed / 37 files untouched.                                                         | tests/unit/core-supervisor-real.test.ts (new), .github/workflows/ci.yml (prepare:core x2), §1 row7, §7 +4 rows → observed-GREEN, §10 RED + observation entries, board M2-10 → done, ci.yml coverage comment → 85.23 %, this row.                                                                                                                                                | QA                                                                                                                                                                                                                                                   |
| DV-54 | M2-12 batch declarations (house rule §1). (1) **NEW L4 FAMILY: 28 TEST IDS `TC-FM-01..28` in the NEW file `docs/qa/m2-fresh-machine.md`** (§1 row9 `L4 (checklist)` family; the Q9-waived acceptance-§8 rows land mapped as TC-FM-18..28; prefix `TC-FM-` is new, no ID reuse). The checklist IS the layer-4 contract — **no src or test-file change** in this batch; a row Result is its evidence (legend: `observed-GREEN` / `FAIL — …` / `blocked-*`; completion rule: no empty cell may count). (2) **Venue**: macOS 15.6.1 arm64; local `npm run dist` DMG `S3 Bypass Desktop-0.0.1-arm64.dmg`, SHA-256 `09b8ba8b6d6e4f98cd3f844939040e10ba6246347571f00d3e984880ed3448d6` (a stale `release/SHA256SUMS.txt` from an earlier build correctly refused to rewrite — the manifest-drift detection of release-manifest.mjs observed live — then regenerated → line matches); venue (a) per P4 (no `profile-store.blob` existed → clean `~/Applications` copy on this account, default userData; P4 forbids touching an existing store). P1 timeline: §5/§6 start-stop rows run inside the **VPN-off window** (FR-15/FR-21 hardcode `127.0.0.1:10808`, PacketTun holds it — the same venue law as DV-53); the §2-§4 install/import/a11y rows are VPN-independent and were executed BEFORE that window — declared here and recorded verbatim in the P1 Result (not silent). (3) **L4 execution tooling (P8 note)**: rows are driven by a throwaway Playwright driver `node_modules/.fm/driver*.mjs` — repo-independent, never committed/linted, packaged `executablePath` launch of the INSTALLED bundle with default env (so `app.isPackaged` semantics hold: REAL proxy apply), native-picker stub reused from DV-31(2) — plus a CGWindowList probe (`tray-scan.swift`, temp artifact) for the status-window rows: native tray-menu/dialog clicks need an accessibility token this venue has not got, so those paths are exercised through their main-process equivalents and **each Result cell names the exact path used**; screenshots referenced as `TC-FM-nn.png` (opencode artifact dir). (4) **TC-FM-03 venue observation (reported, not fixed here)**: with quarantine present (two provenances: `xcodebuild` then `com.apple.Safari`) and `spctl --status` = assessments enabled, `open` never produced a block dialog on macOS 15.6.1 — the bundle launched APP-TRANSLOCATED instead (fresh randomized path per run, observed ×2), so the documented right-click→Open wording in `docs/product/macos-gatekeeper.md` was NOT reproduced on this venue → recorded in the row + reported to the maintainer for triage at M2-13. Counts: 28 IDs.                                                                                                                                                                                                                                                                                                                                                                                       | docs/qa/m2-fresh-machine.md (new, status open), §11 this row; row fills + §10 observation + board M2-12 land in the follow-up commit with the VPN-off window evidence.                                                                                                                                                                                                          | QA                                                                                                                                                                                                                                                   |
| DV-56 | M2-12 fresh-machine root-cause fix (issue #23). **FR-22 AMENDED**: `storage.sessionsDir` is the fedarisha session-rendezvous S3 key prefix, NOT a filesystem path — materialization now passes it through verbatim (the removed `resolveProfilePaths` rewrote it to `<T>/sessions`, the remote watches `<prefix>/sessions/…`, so the rendezvous never completed: data path hung (`000` after 12–15 s) while LIST control polls kept succeeding; observed live on the packaged DMG + real profile with the system proxy applied and the direct S3 rule healthy; control experiment — the app-generated config with only `sessionsDir` restored = `200 in 2.0 s` on the pinned `v26.9.9-1.0.1fed`). Validator BR-V-08 (relative, no `..`) now agrees with materialization instead of contradicting it. **TDD**: QA-RED commit (TC-02-11 `supervisor.config.sessionsDirPassesThroughVerbatim` flipped → fails with the absolute path) → dev-GREEN commit (function + call removed, docstrings amended); amended alongside: requirements FR-22 row, data-flows (b) step 3, m1-test-plan TC-02-11 row. **Paired finding**: with the real core the log panel rendered 119/119 rows `[REDACTED]` (whole-line redaction, FR-47/DV-25) and blocked in-app diagnosis — filed as issue #24. **Venue notes**: diagnostic cores ran on alt ports 19080/19098/19099 only — 10808 was never held by them (PacketTun port law, DV-53); the bundled core binary is `shasum`-identical to `core-bin` (packaging clean); the session's egress during this venue was the operator's fedarisha relay on an alt port (their residential IP returns 429 from the model provider) — session plumbing only, no product code involved; AppTranslocation instance, P4 respected (existing `profile-store.blob` untouched).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DV-57 | CI incident on `a81e91b` (run 37784698884): `npm run format:check` failed — Prettier reported style issues in the three docs amended by DV-56 (`analysis/requirements.md`, `qa/m1-test-plan.md`, `qa/m2-test-plan.md`); tests and coverage jobs were green. Fix-forward (house rule §): ONE commit running `prettier --write` on exactly those three files plus this row — no source or test change, no silent skip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

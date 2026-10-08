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

| §   | Scope                                                                               | Board task  | Family                                |
| --- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| 2   | Core pinning: verify script behavior + pin-doc structure                            | M2-03       | `TC-PKG-01..`                         |
| 3   | Bundled-core path resolution: packaged > `CORE_BINARY_PATH` > honest error          | M2-04       | `TC-02-16..`, `TC-02-20`, `TC-PKG-04` |
| 4   | electron-builder config: targets, unsigned macOS, core in resources, Gatekeeper doc | M2-05       | `TC-PKG-05..07`                       |
| 5   | License attributions shipped inside the artifacts (core = MPL-2.0)                  | M2-06       | `TC-PKG-08..10`                       |
| 6   | Release CI: tag → artifacts + SHA-256 manifest; coverage & e2e jobs land            | M2-07/M2-08 | `TC-PKG-11..14` (+ L3, M2-08)         |
| 7   | Real-binary integration (strategy D-4) + authoritative coverage number (G-05)       | M2-10       | `TC-02-..` / `TC-03-..` (+ L3)        |
| 8   | Issue #19 crash-path surfacing (FR-35 quit-time `E-PLAT-003`, tray freshness)       | M2-11       | `TC-04-20..`, `TC-05-24..`            |
| 9   | Fresh-machine install DoD + the Q9-waived M1 desktop manual rows                    | M2-12       | `L4` (checklist)                      |
| 9   | Security-review findings (M2-09) → story families, declared per batch               | M2-09       | story families + DV row               |

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

| TC ID     | Test title                                   | AC / criterion                       | Layer           | Fixture                       | Status                              |
| --------- | -------------------------------------------- | ------------------------------------ | --------------- | ----------------------------- | ----------------------------------- |
| TC-PKG-11 | `releaseWorkflow.tagMatrixBuildsAndVerifies` | M2-07; DoD #1 (verify at build)      | unit (raw-text) | .github/workflows/release.yml | RED-written (M2-07; **new**, DV-43) |
| TC-PKG-12 | `ciWorkflow.coverageJobLands`                | M2-07; G-05 (coverage ≥80 in CI)     | unit (raw-text) | .github/workflows/ci.yml      | RED-written (M2-07; **new**, DV-43) |
| TC-PKG-13 | `ciWorkflow.e2eJobPerProposal`               | M2-07; e2e-ci-proposal rollout #1    | unit (raw-text) | .github/workflows/ci.yml      | RED-written (M2-07; **new**, DV-43) |
| TC-PKG-14 | `releaseManifest.writeVerifyAndTamper`       | M2-07; DoD #1 (manifest is verified) | unit (CLI, tmp) | scripts/release-manifest.mjs  | RED-written (M2-07; **new**, DV-43) |

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

_(Further entries appended when a batch is written/observed, mirroring the M1 §13
narrative style: counts, observed RED, baseline untouched, green results.)_

## 11. Deviations log (QA bookkeeping)

Continues the **global DV sequence** from `m1-test-plan.md` §14 (last M1 entry: DV-37).
M2 batches start at **DV-38**.

| ID    | Deviation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Effect / amendment                                                                                                                                                                       | Owner                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-38 | The M2-02 batch opens this plan as a **skeleton**: scope matrix (§1) + TC families (`TC-PKG-nn` for cross-cutting M2 pins; story sequences continue per the numbering rule) + logs, with rows landing RED-first per batch instead of a pre-planned full matrix like M1 had. Rationale: M2 batches are discovery-driven (upstream pinning, builder config, CI) — planned row titles cannot be honest before the config contracts exist; the per-batch declarations in §11 keep the ID/count audits identical to M1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §1 scope matrix + numbering rule recorded here; counts start at 0 and grow per batch (each batch's §11 row carries its own +N/observed-RED numbers); no tests weakened (none exist yet). | QA                                                                                                                                                                                                                                                   |
| DV-39 | The M2-03 batch opens M2 verification with the core-pinning contract (board M2-03; BRIEF §9 "pinned release + commit SHA recorded in docs"; M2 DoD #1 "SHA-256 of bundled core verified at build time") as 3 new TC IDs (TC-PKG-01..03) in `tests/unit/core-pin.test.ts`, and needs these declarations: (1) **NEW FAMILY `TC-PKG-nn`** — declared in this plan's numbering rule (M2-02/DV-38), cross-cutting pins for pinning/packaging/CI; (2) **the CLI contract is written in the RED header** (exit 0 match / exit 1 MISMATCH naming asset + expected/actual / exit 2 usage; `--pin-doc` override exists so tests run against a synthetic record — the 3 × ~23 MB release assets never enter the repo or the test); (3) **GREEN scope** — download the three bundled assets (Xray-linux-64, Xray-macos-64, Xray-macos-arm64-v8a) + `.dgst` from release `v26.9.9-1.0.1fed` into the workspace temp dir, compute SHA-256, resolve the tag commit SHA, write `docs/analysis/core-pin.md` (tag/published/commit/asset table + upstream-dgst cross-check note), add `scripts/verify-core-pin.mjs` + the `verify:core-pin` npm script; (4) counts +3 (§2 rows), first execution-log entry in §10; (5) RED observed: `Tests 3 failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 215 passed (218)`, `Test Files 1 failed                                                                                                                                                  | 31 passed (32)`, exit 1 — all 3 for their named missing-artifact reasons (never a harness error), baseline 215 passed / 0 failed untouched; (6) no `errorWording`rows (no`E-*`code),`tests/unit/ipc-contract.test.ts` untouched (no channel change). | §2 +3 rows, §10 first entry, §11 this row; GREEN = pin doc + verify script + npm script. | QA  |
| DV-40 | The M2-04 batch executes board task M2-04 (bundled-core path resolution — board Phase B; BRIEF §5/§9; S4-5 / issue #6 packaged gate; M2 DoD #2) as 5 new TC IDs (TC-02-16/17/18, TC-02-20 in `tests/unit/core-binary-path.test.ts` + TC-PKG-04 in the same file) and needs these declarations: (1) **ABSENCE RED mechanism** — the three pure-function rows load the not-yet-existing `src/main/core-binary-path.ts` through a NEW helper `tests/helpers/core-binary-path-stub.ts` with a NON-LITERAL dynamic specifier, because `tests/**` sits inside `tsconfig.node.json`'s include and a literal import would break `npm run typecheck` (which must stay exit 0 during RED) — verified M1-16/DV-28 pattern (the identical loader ships for core-wiring/system-proxy/core-supervisor/window-lifecycle); absence RED is the legitimate strategy-§5.2 failure and must never be weakened; (2) **US-02 numbering skip** — TC-02-19 is already taken (M1-26, m1-test-plan DV-32), so this batch continues at TC-02-20; TC-02-16/17/18 fill the gap before it (numbering rule: `nn` ≥ 10 for non-AC cases, never renumbered); (3) **cross-family row in §3** — TC-PKG-04 (raw-text `prepare:core` + `.gitignore core-bin/` pin) lives in the US-02 section because it is part of the same board task's contract; §1's family cell was updated accordingly; (4) **GREEN scope** — pure `src/main/core-binary-path.ts` (resolution order: packaged bundle > verbatim dev override > `join(resourcesPath ?? '.', 'core', platform, 'xray')`, total), `src/main/index.ts` delegation (local function removed — one implementation), `scripts/prepare-core.mjs` + `prepare:core` (download the three pinned zips from the release tag in `docs/analysis/core-pin.md`, verify SHA-256 via the existing `expectedShaForAsset`, extract all five members into `core-bin/<darwin-x64\|darwin-arm64\|linux-x64>/`, chmod 0755 `xray`; `unzip` is the only external tool) and `.gitignore core-bin/`; **electron-builder `extraResources` is explicitly NOT part of this GREEN** — it is M2-05's own RED row ("core in extraResources" on the board); (5) counts +5 (§3 rows), RED observed `Tests 5 failed \| 218 passed (223)`, `Test Files 1 failed \| 32 passed (33)`, exit 1 — 3 absence + 2 structural, each for its named reason, baseline 218 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code introduced — the supervisor's existing E-IO-004 missing-binary behavior is unchanged), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §3 +5 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = pure module + host delegation + staging script + ignore.                                                        | QA                                                                                                                                                                                                                                                   |
| DV-41 | The M2-05 batch executes board task M2-05 (electron-builder config — Phase C; owner decisions 2026-10-08: BRIEF §9 AppImage + `.deb` + `.rpm`, BRIEF §10 no Apple account → unsigned; M1 finding S5-18 asar-pin recommendation; M2 DoD #4 attributions note) as 3 new TC IDs (TC-PKG-05/06/07 in `tests/unit/builder-config.test.ts`) and needs these declarations: (1) **AMEND RED, not absence, for the config** — `electron-builder.yml` exists since M0; the pins fail on the MISSING lines only (`asar: true`, `mac.identity: null`, `linux` rpm target, both `extraResources` blocks) while the pre-existing M0 content (appId, files, dmg/AppImage/deb, categories) is asserted GREEN-ready — this is the legitimate "config pin written before its amendment" failure; (2) **YAML parsing = comment-aware block scanner** (raw-text DV-36 pattern, no YAML library): section membership (`mac:`, `linux:` at col 0) is contractual, indentation is not — prettier normalizes the file before every commit and the tests parse the formatted bytes; whole-line comments and blank lines are never contractual (`live()` filter), a col-0 comment does NOT end a block, the next top-level key does; (3) **GREEN scope** — `electron-builder.yml` amendments only: top-level `asar: true`; `mac:` gains `identity: null` + directory-level `extraResources` `core-bin/darwin-${arch}` → `core/darwin`; `linux:` targets become AppImage, deb, rpm + `core-bin/linux-${arch}` → `core/linux` (directory-level on purpose: xray + geodata + LICENSE + README — the TC-02-18 resolver path and M2-06 attributions both land there); NEW doc `docs/product/macos-gatekeeper.md` (English: right-click → Open, Privacy & Security → Open Anyway, `xattr -cr`, explicit "no notarization" statement); **building the package is NOT in this batch** — M2-07 (release CI, DoD #1) and M2-12 (fresh-machine, DoD #2) own it; (4) counts +3 (§4 rows), §1 family cell updated to `TC-PKG-05..07`; (5) RED observed: `Tests 3 failed \| 223 passed (226)`, `Test Files 1 failed \| 33 passed (34)`, exit 1 — TC-PKG-05 on the absent `asar: true`, TC-PKG-06 on the absent `extraResources` rows, TC-PKG-07 on ENOENT (doc missing), baseline 223 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code — packaging config and docs only), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §4 +3 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = yml amendments + Gatekeeper doc.                                                                                | QA                                                                                                                                                                                                                                                   |
| DV-42 | The M2-06 batch executes board task M2-06 (license attributions — Phase C; BRIEF §5; M2 DoD #4, whose wording was corrected the same day: "License notice (core: MPL-2.0) + third-party attributions present in artifacts") as 3 new TC IDs (TC-PKG-08/09/10 in `tests/unit/license-bundle.test.ts`) and needs these declarations: (1) **spec-before-pin was satisfied by a dedicated reconciliation commit** — `59e767d` corrected every "core = GPL-3.0" claim to MPL-2.0 across 18 files (evidence: the LICENSE inside the release assets reads "Mozilla Public License Version 2.0"; the GitHub license API reports spdx `MPL-2.0`; the client itself stays GPL-3.0), so this RED pins the reconciled truth — never the pre-correction claim; (2) **GREEN scope** — `resources/licenses/THIRD-PARTY-NOTICES.md` (English: Xray-core-fedarisha MPL-2.0 + `docs/analysis/core-pin.md` provenance pointer, Electron MIT, react/react-dom MIT, app = GPL-3.0) + verbatim texts `xray-core-fedarisha-LICENSE.txt` (copied from the `prepare:core` staging output — the LICENSE inside the pinned assets), `electron-LICENSE.txt` (= `node_modules/electron/LICENSE`), `react-LICENSE.txt` (= `node_modules/react/LICENSE`) + a **top-level** `extraResources` entry `resources/licenses` → `licenses` in `electron-builder.yml` (electron-builder concatenates global + platform-specific lists — verified in `app-builder-lib/out/fileMatcher.js` `getFileMatchers`, so it composes with the M2-05 mac/linux core blocks; directory-level `from` copies CONTENTS into the destination); (3) **duplicate helpers on purpose** — `repoFile/live/blockOf` are copied from `tests/unit/builder-config.test.ts` instead of extracting a shared module, because editing that GREEN file's infrastructure is out of scope for this batch (M1 precedent: per-file local constants/helpers); (4) counts +3 (§5 rows); (5) RED observed: `Tests 3 failed \| 226 passed (229)`, `Test Files 1 failed \| 34 passed (35)`, exit 1 — 2 ENOENT (notices, core text) + 1 absent-config-block, each for its named reason, baseline 226 passed / 0 failed untouched; (6) no `errorWording` rows (no `E-*` code — docs + config only), `tests/unit/ipc-contract.test.ts` untouched (no channel change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §5 +3 rows, §10 RED entry, §11 this row; GREEN = notices + 3 texts + yml entry.                                                                                                          | QA                                                                                                                                                                                                                                                   |
| DV-43 | The M2-07 batch executes board task M2-07 (release CI & gates — Phase D; M2 DoD #1; the two documented M1 deferrals: coverage job per G-05/acceptance-m1-27.md and e2e job per docs/qa/e2e-ci-proposal.md) as 4 new TC IDs (TC-PKG-11..14 in `tests/unit/release-ci.test.ts`) and needs these declarations: (1) **G-05 measured BEFORE the gate landed** — the acceptance deferral note says the CI coverage job "needs the authoritative number first"; a temporary `coverage-probe` branch (ci.yml with a coverage job + the probe branch in `on.push.branches`) produced **84.59 % lines / 83.85 % stmts / 71.92 % branch / 86.61 % funcs** on ubuntu-latest with the full suite green (run `37711514257`, 2026-10-08) — ≥ `coverage.thresholds.lines: 80`, so the gate lands as a known pass; the probe branch was deleted (remote + local) immediately after the measurement and never touched main; (2) **e2e lands as the proposal's rollout #1** — macOS leg only (`runs-on: macos-latest`), the Linux leg is explicitly PINNED AS ABSENT in TC-PKG-13 and deferred to its own batch behind the keyring/safeStorage verification the proposal itself prescribes ("2. Linux leg behind a keyring/safeStorage verification (R-5 mitigation path)") — the pin on absence documents the deferral, it is not a weakened test; (3) **workflow block parsing** — a new indented `jobBlock()` scanner (ci.yml jobs live at indent 2 under `jobs:`, unlike the col-0 `blockOf()` scanner for electron-builder.yml); blocks end at the next same-indent key; (4) **GREEN scope** — NEW `.github/workflows/release.yml` (tag `v*` trigger, `permissions: contents: read`, matrix macos+ubuntu, pinned checkout/setup-node SHAs, `npm ci` → `npm run prepare:core` → Linux `apt-get install -y rpm` → `npm run dist` → `npm run release:manifest -- release` → `actions/upload-artifact` pinned to a full SHA with `if-no-files-found: error`); `ci.yml` gains the `coverage` job (ubuntu, `ELECTRON_SKIP_BINARY_DOWNLOAD`, `npm run test:coverage` — the checks job untouched) and the `e2e` job (macOS, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, no `ELECTRON_SKIP_BINARY_DOWNLOAD`, lint → typecheck → port preflight → `npm run test:e2e`); NEW `scripts/release-manifest.mjs` + `release:manifest` npm script (writes `<dir>/SHA256SUMS.txt` for top-level files only — the manifest and subdirectories are skipped, sorted by name — then RE-VERIFIES by re-hashing: OK → exit 0, tamper → exit 1 `MISMATCH` naming the file, bad args → exit 2); (5) counts +4 (§6 rows), §1 family cell updated; (6) RED observed: `Tests 4 failed \| 229 passed (233)`, `Test Files 1 failed \| 35 passed (36)`, exit 1 — 1 ENOENT + 2 absent-job + 1 absent-CLI, each for its named reason, baseline 229 passed / 0 failed untouched; (7) no `errorWording` rows (no `E-*` code — CI config + a build-time manifest tool), `tests/unit/ipc-contract.test.ts` untouched (no channel change); M2-08's audit evidence is a SEPARATE row in §6 (not this batch). | §6 +4 rows, §1 family cell updated, §10 RED entry, §11 this row; GREEN = release.yml + 2 ci.yml jobs + manifest CLI.                                                                     | QA                                                                                                                                                                                                                                                   |
| DV-44 | During M2-07 GREEN — AFTER the RED commit `53c052e` observed 4 named failures — two latent defects in TC-PKG-14 (manifest CLI) surfaced that the RED observation never reached (the first assertion failed first, masking them), and both are corrected IN THE GREEN commit, deviating from the usual "RED file frozen after commit" rule: (1) **dead regex** — the manifest-content assertion joined the two expected lines as `...alpha\.dmg$[0-9a-f]{64}...` with `$` (multiline) between them, so the pattern could never match a real two-line manifest (no newline is consumed between `$` and the next hex); replaced with an EXACT line-equality check (`toEqual` of the parsed non-empty lines against two `expect.stringMatching(/^[0-9a-f]{64} {2}<name>$/)` entries — sorted order and line count now pinned too) plus two NEGATIVE pins that the message had promised but the assertion had never stated (`subfolder` never hashed, `SHA256SUMS.txt` never self-hashed); (2) **unenforceable semantics** — a write-then-hash implementation would recompute digests on every run and therefore always exit 0, making the tamper case (the core of DoD #1) impossible to fail; the contract is corrected to TWO-RUN semantics: first run writes the manifest and re-verifies the write against a second hashing pass, re-runs verify the CURRENT files against the EXISTING manifest record (changed/missing/unlisted file → exit 1 `MISMATCH` with expected/actual, manifest never rewritten on drift), and the RED header text was updated to match. No assertion was weakened — the corrected set enforces MORE than the original (exact content, ordering, negatives, drift detection); behavior and both failure modes stay exactly what the batch's contract describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Tests/unit/release-ci.test.ts TC-PKG-14 (header + content/tamper assertions) edited in the GREEN commit with this row; GREEN observed 4 passed, full suite 233 passed / 0 failed.        | QA                                                                                                                                                                                                                                                   |
| DV-45 | **Evidence-method deviation, caught by CI** (2026-10-08): the M2-07 RED commit `53c052e` and GREEN commit `f78073c` both state "npm run lint ... exit 0" — a FALSE observation. The local chain piped lint through a shell tail (`npm run lint 2>&1 \| tail -1`), and empirically (re-tested after CI failed) that pipe prints nothing and returns the tail's exit 0 even when eslint fails; the mis-sorted imports in `tests/unit/release-ci.test.ts` (`node:child_process` after `node:path`, `simple-import-sort/imports`) existed from the RED commit onward. GitHub Actions caught it on run `37712854252` (all three lint steps: checks ubuntu, checks macos, e2e macos), while the coverage job itself PASSED. Resolution: (1) `npx eslint --fix` on the test file (imports only — no assertion/content change), (2) §10 entry above RETRACTS the false exit-0 claims and records the true method, (3) verification chain corrected — all gate checks now run with direct exit-code capture (`cmd > /dev/null 2>&1; echo $?`), observed after the fix: lint 0, typecheck 0, prettier 0, full suite 233 passed / 0 failed (36 files), (4) e2e's real steps (port preflight → build → smoke) remain UNOBSERVED — run `37712854252` reached only its lint step; no e2e verdict is claimed until a run executes them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Fix + §10 correction + this row; M2-07's evidence lines on the board cite the CI-observed coverage pass and this run.                                                                    | QA                                                                                                                                                                                                                                                   |

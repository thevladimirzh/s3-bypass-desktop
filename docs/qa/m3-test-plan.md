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

## 3. UX surfaces (M3-05 RED / M3-06 GREEN) — TC-POL-03

| Pin                                                         | Surface / finding                                                                                                                                                                                                                 | Suite                         | Status                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------- |
| `app.footer.shippedProductCopyNotM0ScaffoldNote`            | footer `App.tsx` still says "M0 scaffold — tunnel features land in M1." → shipped copy = `S3 Bypass Desktop` (BRIEF §9 productName)                                                                                               | `app-render.test.tsx`         | RED-written                     |
| `app.proxy.unsupportedDesktopRendersExactManualHint`        | AC-04.5 (audit B-11): renderer must read `ProxyState.supported`/`hint` and render the exact data-flows §3.3 sentence                                                                                                              | `app-render.test.tsx`         | RED-written                     |
| `app.proxy.supportedDesktopShowsNoManualHint`               | the hint is the unsupported answer only — never shown when supported                                                                                                                                                              | `app-render.test.tsx`         | observed GREEN in the RED batch |
| `app.statusIpcLine.noBridgeKeepsDevParenthetical`           | plain-browser/dev context keeps "(run inside Electron)"                                                                                                                                                                           | `app-render.test.tsx`         | observed GREEN in the RED batch |
| `app.statusIpcLine.bridgePresentShowsNoDevText`             | audit: a packaged app whose ping failed must not see dev text                                                                                                                                                                     | `app-render.test.tsx`         | RED-written                     |
| `app.statusLabels.rendererAndTrayMapsIdentical`             | duplicated status-label maps (renderer badge vs tray statusText) — ABSENCE RED until both are exported from one source                                                                                                            | `app-render.test.tsx`         | RED-written (absence)           |
| `logs.view.emptyStateTextPinned`                            | Logs empty-state copy ("No log lines yet.") ships but was never pinned                                                                                                                                                            | `logs-view.test.tsx`          | observed GREEN in the RED batch |
| `trayQuit.stopFailure.firstFailureRethrownAfterRequestQuit` | the policy-level surfacing contract (`window-lifecycle.ts` header) was explicitly unpinned ("whether the promise rejects is NOT pinned") — pinning it is what B-13's call-site fix relies on                                      | `window-lifecycle.test.ts`    | observed GREEN in the RED batch |
| `quitTeardown.stopFailureSurfacedNotSwallowed`              | audit B-13 source pins: stopCore binds + throws the `handleStopForce` result; `beginQuit` routes the rethrow to `surfaceQuitFailure` (native dialog, `isAppError` gate, triple fields); the empty `.catch(() => {})` must be gone | `index-native-wiring.test.ts` | RED-written                     |

Scope decisions recorded in the RED (owner-approved batch B): the unsupported-desktop
hint is _rendered_ but the toggle state machine is untouched (its refusal path already
answers with the documented `E-PLAT-001` triple, AC-04.6); non-triple quit failures
(hung-step budget timeouts) stay non-visual — inventing wording for them would violate
errors.md §0 (only documented triples reach the user).

---

## 4. App icon + naming (M3-07 RED / GREEN) — TC-POL-04

| Pin                                                               | What                                                                                                                                                                                      | Suite                    | Status                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| `builderConfig.iconWiredToGeneratedArtifactsAndProductNamePinned` | `mac:` declares `icon: assets/icon.icns`, `linux:` declares `icon: assets/icon.png`, `productName: S3 Bypass Desktop` stays exact (BRIEF §9)                                              | `builder-config.test.ts` | RED-written           |
| `appIcon.sourceGeneratorAndArtifactsShipInRepo`                   | ABSENCE RED: `assets/app-icon.svg` + `scripts/build-icon.mjs` + generated `assets/icon.icns`/`assets/icon.png` exist; the generator reads the SVG, writes both artifacts, uses `iconutil` | `builder-config.test.ts` | RED-written (absence) |
| `appIcon.artifactsAreRealIcnsAndPng`                              | magic bytes (`icns`/`PNG`), ≥ 1000 B container, PNG ≥ 256 px and square — placeholders cannot satisfy the config pins vacuously                                                           | `builder-config.test.ts` | RED-written (absence) |
| `appIcon.generatorWiredIntoPackageScripts`                        | `npm run build:icon` regenerates the artifacts (SVG = source of truth)                                                                                                                    | `builder-config.test.ts` | RED-written (absence) |

Owner decision (recorded on the board 2026-10-08): the icon is generated in-repo —
SVG source + build script → icns/png, no owner artwork; generated artifacts are
committed so packaging runs without an extra generation step.

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

### M3-04 GREEN (alignment, 2026-10-08)

- Chain: prettier `docs/ src/ tests/` clean, typecheck rc=0, eslint rc=0 (two
  fixups during GREEN: import-sort autofix; `WORDING_BY_CODE` gained the
  `E-VAL-016`/`E-VAL-017` pins — the `expectHumanWording` lookup is
  code-keyed and must cover every code it can be called with).
- Implementation: `src/shared/error-triples.ts` created (`FILE_READ_FAILED`,
  `DIALOG_FAILED`, `E_STOR_005`, `NO_PROFILE` — verbatim literals); `index.ts`
  imports the three (own copies deleted), `secret-store.ts` aliases
  `STORE_IO_FAILED` to the shared triple (dedup pin passes), `core-wiring.ts`
  returns the shared `NO_PROFILE` (`E-VAL-016`), `status-machine.ts`
  `INVALID_TRANSITION_CODE` → `E-VAL-017`, `core-supervisor.ts` E-CORE-003
  nextStep drops `(E-PLAT-005)`, `system-proxy.ts` E-PLAT-002 nextStep drops
  the `E-PLAT-001` citation (values instead).
- Sibling pin amendments (DV-64): `system-proxy.test.ts` TC-04-06 substring
  → `set the proxy manually (SOCKS host 127.0.0.1`; canned E-PLAT-002
  fixtures in `proxy-wiring.test.ts`/`proxy-toggle.test.tsx` reworded;
  comment-only code renames in `core-supervisor.test.ts`/`quit-force-stop.test.ts`.
- Result: **299 passed (299)** / 43 files — all 9 named REDs resolved. e2e:
  1 passed (1).

### M3-05 RED (UX surfaces, 2026-10-08)

- Chain: prettier `docs/ src/ tests/` clean, typecheck rc=0, eslint rc=0
  (one RED-fixup before this observation: the status-labels test pulled
  `src/main/window-lifecycle.ts` into the tsconfig.web program — no `node`
  types → `NodeJS` namespace error; the tray half now loads through a
  non-literal specifier, the documented absence-RED loader trick, so the
  web project never follows the import; second fix: `exactOptionalPropertyTypes`
  on the `window.s3Bypass` spread in the empty-state pin — replaced by a
  guarded property assignment).
- Suite: **5 failed | 303 passed (308)** — baseline 299 → +9 tests
  (6 app-render + 1 logs empty-state + 1 lifecycle rethrow + 1 source scan).
  The 5 observed REDs are exactly the named findings:
  1. `app.footer.shippedProductCopyNotM0ScaffoldNote` — footer still the
     M0 scaffold note;
  2. `app.proxy.unsupportedDesktopRendersExactManualHint` — renderer never
     reads `ProxyState.supported`/`hint` (audit B-11, AC-04.5);
  3. `app.statusIpcLine.bridgePresentShowsNoDevText` — dev parenthetical
     renders even when the bridge exists;
  4. `app.statusLabels.rendererAndTrayMapsIdentical` — ABSENCE RED (neither
     map is exported; M3-06 creates the shared source);
  5. `quitTeardown.stopFailureSurfacedNotSwallowed` — audit B-13: the
     `handleStopForce` result is dropped and `beginQuit`'s catch is empty.
- Observed GREEN in the RED batch: `supportedDesktopShowsNoManualHint`,
  `noBridgeKeepsDevParenthetical`, `logs.view.emptyStateTextPinned`,
  `trayQuit.stopFailure.firstFailureRethrownAfterRequestQuit` (the
  policy-level contract the call-site fix relies on).
- e2e: not re-run for this RED (suite-only + docs; e2e unchanged, 1/1 at
  `c0a2eb7`).

### M3-06 GREEN (surface pins, 2026-10-08)

- Chain: prettier `docs/ src/ tests/` clean, typecheck rc=0, eslint rc=0
  (one GREEN fixup: `CoreState` alias in App.tsx became unused once the
  shared label map supplied its own typing).
- Implementation:
  - `src/shared/status-labels.ts` (new): the ONE status-word map;
    `App.tsx` re-exports it as `STATUS_LABELS`, `window-lifecycle.ts`
    re-exports it as `STATUS_TEXT` (local duplicate deleted) — the
    equality pin compares the two exports of the same object;
  - footer: `S3 Bypass Desktop` (BRIEF §9 productName), scaffold note gone;
  - AC-04.5: `readProxyState` now stores the full `ProxyState`; the
    unsupported desktop renders the exact data-flows §3.3 sentence built
    from `hint` (host/port, `DEFAULT_SOCKS_PORT` fallback) — supported
    path unchanged;
  - IPC line: the `(run inside Electron)` parenthetical renders only when
    `window.s3Bypass` is absent (plain-browser/dev context);
  - B-13: `stopCore` binds the `handleStopForce` result and throws the
    documented triple on `!ok`; `beginQuit` routes the rethrown first
    failure to the new `surfaceQuitFailure` (native warning dialog,
    `isAppError` gate — non-triple infrastructure failures stay
    non-visual per errors.md §0).
- Result: **308 passed (308)** / 43 files — all 5 named REDs resolved.
  e2e: 1 passed (1) (the Start/Stop exact-name contract untouched).

### M3-07 RED (app icon, 2026-10-08)

- Chain: prettier `docs/ src/ tests/` clean, typecheck rc=0, eslint rc=0.
- Suite: **4 failed | 308 passed (312)** — baseline 308 → +4 tests (the
  whole TC-POL-04 describe), 1 file. The 4 observed REDs are the named
  absence pins: config wiring (mac/linux `icon:` + `productName` pin),
  source/generator/artifacts existence, artifact reality (magic bytes,
  size, squareness), `build:icon` script wiring.
- e2e: not re-run (suite + docs only; unchanged at `a2dcd21`, 1/1).

### M3-07 GREEN (app icon, 2026-10-08)

- Chain: prettier `docs/ src/ tests/ scripts/ *.yml *.json` clean, typecheck
  rc=0, eslint rc=0 (one GREEN fixup: unused `writeFileSync` import in the
  generator — `sips` writes the files, not the script).
- Implementation: `assets/app-icon.svg` (pure-shapes source, 1024 intrinsic)
  - `scripts/build-icon.mjs` (`npm run build:icon`: sips rasterize → master
    PNG → linux artifact; `.iconset` 16..512 + @2x → `iconutil -c icns` →
    darwin artifact; fails loudly when a stock tool is missing, never emits
    placeholders) + committed artifacts `assets/icon.icns` (170 KB) and
    `assets/icon.png` (58 KB, 1024×1024 RGBA) + `electron-builder.yml`
    `mac.icon`/`linux.icon` + the `build:icon` package script.
- Result: **312 passed (312)** / 43 files — all 4 named REDs resolved.
  e2e: 1 passed (1).

---

## 11. Deviations log (QA bookkeeping)

_(Appended per deviation with a DV-64+ row — global DV numbering continues from
m2-test-plan §11 (DV-63 last).)_

| DV    | Batch | Deviation / decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Justification                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DV-64 | M3-03 | Spec amendments inside the RED commit: `errors.md` §0 extended (no `E-…-###` code citation and no OS errno token inside title/cause/nextStep; the `code` field stays internal), §1 gains `E-VAL-016` (no-profile step-0 refusal — DV-19 superseded, the `E-VAL-*` placeholder is gone) and `E-VAL-017` (generic state-machine rejection — was mislabelled `E-VAL-015`, audit B-8c), §3/§4 drop the `E-PLAT-005`/`E-PLAT-001` next-step citations; sibling pins amended accordingly (`E-VAL-015`→`E-VAL-017` in TC-02-07, `E-VAL-*`→`E-VAL-016` in TC-02-03); the canned E-PLAT-002 fixtures in `proxy-wiring.test.ts`/`proxy-toggle.test.tsx` reworded to the amended §4 sentence (and the `system-proxy.test.ts` TC-04-06 substring pin with them); the two new `FORBIDDEN` rules are `userTextOnly`. | Owner-approved M3 batch A ("error-wording pass") on 2026-10-08; wording is strengthened, no existing pin weakened or removed (strategy §5.2); the `userTextOnly` split follows §0 itself (the code is internal _by design_ — only its citation inside user text is forbidden), so the canary/stack/`Error:` rules keep scanning `tripleText` unchanged. |

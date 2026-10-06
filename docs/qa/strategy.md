# Test Strategy — s3-bypass-desktop

Owner: **QA** · Status: **draft v1** (task M1-03 output, companion: `m1-test-plan.md`) · Language: English
Basis: `BRIEF.md §2/§5`, `docs/product/PRD.md` (§5 NFRs, §7 success criteria), `docs/product/stories/US-01..US-07`,
`docs/plans/m1-mvp.md`, `docs/plans/m0-scaffold.md`.
Known dependency: `docs/analysis/` (M1-02 — IPC contract, S3 field list, secret classification) **does not exist
yet**. Sections marked `[pending M1-02]` contain placeholders that are finalized once the analysis lands; the
method and structure do not change.

---

## 1. Scope & principles

- Tests are the **executable specification**: they pin observable behavior (inputs → outputs, side effects,
  user-visible messages), never implementation details (no asserting on private function names, module layout,
  or internal call counts unless the spec itself makes them observable).
- Every acceptance criterion (AC) in `US-01..US-07` maps to **at least one** test case ID; the traceability
  matrix lives in `m1-test-plan.md`.
- Fixtures are **synthetic only**: fake S3 keys, reserved endpoints (`example.com`, `127.0.0.1`, `localhost`),
  no real credentials, no live network calls (a test that needs the network must say so explicitly and be
  owner-approved).
- QA may create/edit **only `tests/**` and `docs/qa/**`**. Production code, configs, and other agents' docs are
  read-only to QA.
- A test that has not been **observed failing for the right reason** is not RED.

## 2. Test pyramid (this project)

| Layer | Name                     | Runner / environment                                                                                               | What it pins                                                                                                                                                                          | Speed        | CI                                                                                                                                                                                           |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | **Unit**                 | Vitest, `environment: 'node'` (main/shared logic); Vitest + jsdom + `@testing-library/react` (renderer components) | Status machine, profile validator, redaction, log buffer bounds, system-proxy command construction/branching, IPC allowlist, error-wording tables                                     | ms           | yes                                                                                                                                                                                          |
| L2    | **Integration**          | Vitest, node env, real child processes against **fixture binaries** (`tests/fixtures/bin/`)                        | Supervisor spawn/kill/crash/timeout/port-occupied with the fake core; secret-store round-trip on disk; core config `0600` + deletion; log pipeline end-to-end with a chatty fake core | 100s of ms–s | yes (locally; CI legs run them too — they need no Electron, no GUI)                                                                                                                          |
| L3    | **E2E**                  | Playwright for Electron (`_electron` API), launched against `npm run build` output                                 | One happy-path smoke (M1-24): import → Start → `running` → Logs → Stop → `stopped`; window-level NFRs (startup < 3 s, selectable error text, no stack traces in DOM)                  | seconds      | **post-M1 / M2** — `ci.yml` sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, so no Electron binary in CI; E2E runs on macOS locally first, Linux E2E when CI gets a display (xvfb) or a dedicated job |
| L4    | **Manual / exploratory** | Checklist in `docs/qa/` + shell snapshot scripts                                                                   | Real desktop behavior: tray menu, `networksetup`/`gsettings` byte-for-byte restore (AC-04.3), keychain prompts, keyboard reachability (NFR-5), macOS + Linux platform matrix (PRD §7) | minutes      | no                                                                                                                                                                                           |

**Pyramid shape:** many L1 tests (pure, deterministic, fast), a smaller set of L2 integration tests around the
supervisor and storage (these carry the process-lifecycle risk), exactly **one** L3 smoke path (risk R-7 —
Playwright-Electron flakiness — is mitigated by keeping E2E minimal and pushing coverage down the pyramid),
and a thin L4 layer for what only a real desktop can show.

Why not E2E-heavy: Electron E2E is the slowest and flakiest layer, needs a GUI, and cannot run in the current
CI config. The status machine, validator, redaction, and proxy command logic are all pure and are pinned at L1;
only actual OS integration (proxy restore, tray, window lifecycle) needs L3/L4.

## 3. Tooling and why

| Tool                                                                                    | Why                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest 5** (already adopted by the scaffold)                                          | Same Vite/electron-vite toolchain as the app → zero config friction, native TS/ESM, fast watch mode for the RED→GREEN loop. `vitest.config.ts` uses `include: tests/**/*.test.ts`, `environment: 'node'`.                                                 |
| **jsdom + @testing-library/react** (to be added — gap recorded in `m0-verification.md`) | Renderer component behavior (import error display, status label, logs view) must be assertable without a real window. Required by M1-16/M1-17-area tests. Developer adds the dependency during the corresponding GREEN task; QA pins the requirement now. |
| **@vitest/coverage-v8** (to be added — gap)                                             | Makes coverage thresholds in §6 enforceable. Currently not installed → coverage is aspirational until then.                                                                                                                                               |
| **Playwright for Electron**                                                             | The only mature way to drive an Electron app as a user (real `BrowserWindow`, real preload). Deferred to M1-24 per plan; smoke only.                                                                                                                      |
| **Fixture fake core binary** (POSIX `sh`/`node` scripts)                                | M2 pins the real `Xray-core-fedarisha` binary (risk R-1: none exists until M2). A parameterized fake gives deterministic ready/crash/silent/flood behavior at L2 without Go or network.                                                                   |
| **PATH shims** (`fake-networksetup`, `fake-gsettings`)                                  | Lets AC-04 command construction and failure handling be tested on any OS by prepending a fake bin dir to `PATH` — no real system proxy changes in tests.                                                                                                  |
| **ESLint + Prettier**                                                                   | Not tests, but release/CI gates; QA runs them as part of verification records.                                                                                                                                                                            |

Stack changes are recorded as a **deviation** in this file (per `qa.md` role: adjust to whatever the scaffold
adopts — the method does not change). `pytest` is not applicable: the stack is TypeScript.

## 4. Naming conventions

### 4.1 Files

```
tests/
  unit/            <area>.test.ts          # Vitest, one file per behavior area
  integration/     <system>.test.ts         # Vitest, real child processes / disk
  e2e/             <flow>.spec.ts           # Playwright (post-M1)
  fixtures/
    configs/       <case>.json | <case>.txt
    bin/           fake-core.<mode>.<ext>, fake-networksetup, fake-gsettings, occupy-port.mjs
    secrets/       canary.secrets.txt       # synthetic secret patterns for grep tests
```

Areas: `profileImport`, `status`, `supervisor`, `systemProxy`, `tray`, `logs`, `secretStore`, `ipc`,
`errorWording`. A file must stay within one area; split when it exceeds ~300 lines.

### 4.2 Test case titles — `<area>.<behavior>.<condition>`

Examples: `profileImport.rejectsInvalidJson.includesLineColumnNoStack`,
`supervisor.crash.nonzeroExit.goesCoreCrashedWithExitCode`,
`logs.redaction.canarySecretsBecomeRedactedInBuffer`.

Rules: lowercase camelCase segments, period-separated, 3 segments (condition optional), the title must read
as an assertion. The `it(...)`/`test(...)` title **is** the spec sentence — reviewers must understand the
required behavior without opening the code.

### 4.3 Test case IDs

- `TC-<story>-<nn>` — derived from a story AC: **`nn` equals the AC number** (`TC-01-03` ↔ `AC-01.3`).
- Edge cases not tied to an AC: same story prefix, numbers **≥ 10** (`TC-01-11`, `TC-02-10`), allocated in
  story-edge-case order.
- Cross-cutting NFR pins: `TC-NFR1-01`, `TC-NFR2-01`, `TC-NFR3-01`, `TC-NFR4-01`, `TC-NFR5-01`.
- IPC contract (M1-06): `TC-IPC-01..` (cross-referenced to `AC-07.3`).
- E2E smoke: `TC-E2E-01`.
- IDs are **never reused or renumbered**; retired cases keep the ID with status `retired` in the matrix.
- Every AC has ≥ 1 TC; the matrix (story → AC → TC → layer → RED/GREEN task → status) is
  `m1-test-plan.md`.

## 5. The RED → GREEN contract

### 5.1 What QA writes before Development starts

For every **RED task** in `docs/plans/m1-mvp.md` (M1-04, M1-06, M1-08, M1-11, M1-14, M1-16, M1-18, M1-20,
M1-22, M1-24):

1. QA writes the failing test files **and their fixtures** under `tests/` (nothing outside `tests/**`,
   `docs/qa/**`), IDs from `m1-test-plan.md`, titles per §4.2.
2. QA **runs the suite** and records the exact output: totals, failing test names, and the failure reason.
   Two accepted RED reasons:
   - **assertion RED** — module exists, behavior wrong (preferred once a module is stubbed by an earlier pair);
   - **absence RED** — module/channel/export does not exist yet (`Cannot find module`, `undefined` handler) —
     legitimate for the first test of a new subsystem, but the failure must be _that_ error, not a typo or a
     broken import path.
3. QA reports per the report rule: files table (new/changed, case counts), RED/GREEN status per pin, exact
   test output, deviations. The RED report is the contract handed to the developer.
4. The corresponding **GREEN task may not open** before the RED report exists (plan handoff rule #2).

### 5.2 What "never weaken a test" means operationally

Forbidden without an upstream spec change (they are all ways of making code pass instead of making it work):

- deleting a failing test or a case row;
- `skip` / `only` / conditional skip on environment;
- loosening a matcher (`toBe('...')` → `toContain(...)`, exact wording → "contains something", removing a
  `not.toContain` forbidden-substring assertion);
- changing an expected value to whatever the code now outputs;
- widening a timeout/bound to mask a regression (e.g. 1 s → 10 s, 2000 lines → 100000);
- editing a fixture so the bad input becomes good (or vice versa) to fit the implementation;
- excluding paths from coverage/config so failing code is not measured.

Allowed paths:

- **Spec change first:** owner/PM updates the story/PRD/`docs/analysis/` with a decision reference
  (`Q-03 resolved: ...`), then QA rewrites the affected test **to the new spec**, noting the spec reference in
  the test title/comment and in the report. Development never edits test expectations itself.
- **Contradiction:** if a test contradicts the spec or the code, QA **stops and reports** the contradiction to
  the main agent — the developer adapts the code or the spec is amended; the test is not "fixed" by QA to go
  green unilaterally.
- Flaky-test handling: a flake is a **defect in the test or a real race in the code**; QA reports it. Marking
  retry-until-green or skip is not a fix.

## 6. Coverage expectations per layer

| Layer                                                                                                                       | Expectation                                                                                                                                                                                                                                                                                                                          | Gate                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| L1 unit — pure logic (`src/shared/**`, validator, redaction, status machine, log buffer, proxy cmd builders, IPC allowlist) | **≥ 90 % lines, ≥ 85 % branches**                                                                                                                                                                                                                                                                                                    | vitest `coverage.thresholds` once `@vitest/coverage-v8` lands; reported in every M1 RED/GREEN report |
| L1 unit — renderer components                                                                                               | behavior/branch driven (render, user action, displayed text), **≥ 70 % lines** of `src/renderer/**` by M1 exit                                                                                                                                                                                                                       | same                                                                                                 |
| All production code (`src/**`)                                                                                              | **≥ 80 % lines** at M1 exit (M1-27 evidence)                                                                                                                                                                                                                                                                                         | same                                                                                                 |
| L2 integration                                                                                                              | **enumerated-path completeness, not %**: every supervisor path (spawn, stop, crash-exit-nonzero, start-timeout, double-start, binary-missing, port-occupied, quit-kills-child) and every storage path (round-trip, at-rest grep, refusal when `safeStorage` unavailable, corrupt blob, `0600`+delete) has at least one executed test | matrix in `m1-test-plan.md`                                                                          |
| L3 E2E                                                                                                                      | exactly the M1-24 smoke path (+ optional NFR-3 startup measurement); no coverage target                                                                                                                                                                                                                                              | M1-24                                                                                                |
| Acceptance                                                                                                                  | PRD §7: **100 %** of enumerated story failure cases show a human-readable message; zero raw stack traces                                                                                                                                                                                                                             | QA checklist at M1-27                                                                                |

Coverage numbers are reported as **not enforceable** until `@vitest/coverage-v8` is installed (gap recorded in
`m0-verification.md`); the targets above stand and become hard gates the moment the tooling lands.

## 7. How NFRs are verified (PRD §5)

### NFR-1 — S3 credential security

- `TC-07-01` round-trip encrypt/decrypt (M1-08, unit/integration with `safeStorage` stand-in; real keychain
  path exercised in L3/L4 on macOS + Linux).
- `TC-07-02` at-rest **automated grep** over the app data directory: after import, every file in the profile
  store is searched for each canary secret → 0 matches.
- `TC-IPC-01/02` (M1-06): channel allowlist enumeration — invoking a non-allowlisted or secret-bearing channel
  from the renderer fails; no `contextBridge` payload contains keys/full config (AC-07.3).
- `TC-07-04`: `safeStorage.isEncryptionAvailable() === false` → persistence refused with plain-language
  explanation, **no plaintext fallback** (stub the availability flag).
- `TC-07-05`: core credentials file `mode & 0o777 === 0o600`, path outside user-facing dirs, deleted on
  stop/exit; **path never appears in logs** (`TC-07-15` greps the path string too).

### NFR-2 — No secrets in logs (exact automated tests)

1. **Canary fixture** — `tests/fixtures/secrets/canary.secrets.txt`: one synthetic secret per line (fake
   access key, fake secret key, fake session token, fake bucket password). They are also embedded in
   `tests/fixtures/configs/valid-client-config.json` so import/start naturally try to leak them.
2. **Single-entry-point unit test** — feed a raw line containing each canary through _every_ public logging
   entry point (`logger.*` API surface `[pending M1-02]`): output must contain `[REDACTED]` and zero canary
   matches, proving redaction happens at the entry point, not per call site (NFR-2 last bullet).
3. **Pipeline test** — a fake core (`fake-core echo-secrets`) prints its config (canaries included) to
   stdout → captured log buffer lines contain `[REDACTED]`, never the raw value (AC-06.3).
4. **Full-loop grep test `TC-NFR2-01` (success criterion, PRD §7 "Secret hygiene")** — Given canary config
   imported, When start → run → stop completes, Then an automated recursive search finds **0 canary
   occurrences** in each of:
   - (a) dumped log buffer (export API of the logs module),
   - (b) renderer DOM text (`document.body.innerText` via component/E2E),
   - (c) every file under the app data dir (`fs` walk + string match; extends AC-07.2),
   - (d) captured stdout/stderr of the app process and of the core child,
   - (e) the last-error string surfaced in the status area.
     Pass rule: 0 matches everywhere **and** `[REDACTED]` present in the buffer where the secret line was —
     redaction is asserted, not just absence.
5. **Forbidden-pattern scan** — every surfaced error string is additionally matched against
   stack-trace regex, JSON dumps of config, and `[pending M1-02]` secret field-name list
   (e.g. `secretAccessKey`, `sessionToken`, …): any hit fails the test (AC-06.4).

### NFR-3 — Performance / startup

- Startup < 3 s: L3 measurement (launch Electron, assert window/tray ready < 3000 ms, no network on startup).
- Start/Stop reflected ≤ 1 s: L2 with real clock and generous CI tolerance (assert ≤ 1000 ms locally,
  ≤ 3000 ms when `CI=true`), driven by fake-core process events.
- Buffer bounded at 2000: L1 unit (`TC-06-02`) + 10 000-line flood (`TC-06-12`) asserting length never
  exceeds the constant and memory entry count stays constant.

### NFR-4 — Offline behavior

- `TC-NFR4-01`: launch/import/start-attempt with all network primitives stubbed to reject → app still
  initializes; assert **zero** outbound requests attempted on startup (spy on `fetch`/`net` module);
  failed start produces the distinct unreachable-endpoint message, state `stopped`/`core-crashed` with
  `lastError` set (not a generic crash).

### NFR-5 — Error wording (table-driven tests)

`tests/unit/errorWording.test.ts` iterates a **table of rows** — one row per user-visible error enumerated in
the stories/PRD. Row schema:

| column      | meaning                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | error key (e.g. `import.invalidJson`, `start.binaryCheckFailed`)                                                                              |
| `trigger`   | fixture/input that produces it                                                                                                                |
| `title`     | exact plain-language title                                                                                                                    |
| `cause`     | required substring of the one-sentence cause                                                                                                  |
| `nextStep`  | required substring of the concrete next step (or the explicit "check logs" fallback)                                                          |
| `forbidden` | substrings/patterns that must be absent: stack-trace regex `/\n\s+at\s+\S+\(/`, `SyntaxError`, `TypeError`, `Error:`, raw config JSON markers |

A shared assertion `expectHumanError(row, actual)` enforces (a) title, (c) next step, (b) cause substring, and
all `forbidden` patterns for every row — so a new error without wording fails by construction.
Initial rows: AC-01.3, AC-01.4, AC-01.5, unreadable file (US-01 edge), AC-02.4, AC-02.5, AC-03.4,
AC-04.5, AC-04.6, AC-04.7, US-07 corrupt store, US-07 encryption unavailable, NFR-4 unreachable endpoint,
"core did not become ready" `[threshold pending M1-02]`.
UI-side checks (selectable/copyable text, status always a text label not color, Tab/Enter reachability) are
L3/L4 (`TC-NFR5-02`, checklist) — DOM-level, not unit.

### NFR-6 — Packaging / binary pinning

- SHA-256 mismatch refusal is **M2 scope** per `AC-02.4` consistency note → `TC-02-18` marked `deferred-M2`
  in the plan; wording assertions are shared with the M1 binary-missing case (`TC-02-04`).

## 8. Environments & CI

- Local: macOS 15 arm64 (primary dev machine) — full L1/L2, smoke launch, L4 checklists.
- CI (`.github/workflows/ci.yml`): ubuntu-latest, Node 22 → `lint`, `format:check`, `typecheck`, `test`.
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1` → **no Electron and no E2E in CI today** (recorded; Linux E2E is an M2
  decision).
- Linux parity for L1/L2 comes from the CI leg (pure node + `sh` fixtures — no GUI needed). L4 proxy/tray
  checks run on a real GNOME session (AC-04.x) — checklist at M1-27 (PRD §7 "Core loop works" requires
  macOS-arm64 **and** Linux-x64).

## 9. Risks & deviations

| ID  | Risk / deviation                                                                                                   | Handling                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@playwright/test` **not installed** in the scaffold yet | QA pins requirements here; developer adds each in the matching GREEN task; coverage gates activate when present                              |
| D-2 | `docs/analysis/` (M1-02) absent — IPC allowlist and secret field list unknown                                      | `[pending M1-02]` placeholders; NFR-2 field table and `TC-IPC-*` finalized before their RED tasks open (plan already blocks M1-04+ on M1-02) |
| D-3 | Playwright-Electron flakiness (plan R-7)                                                                           | single smoke path; load carried by L1/L2                                                                                                     |
| D-4 | No real core binary until M2 (plan R-1)                                                                            | parameterized fake-core fixture; real-binary integration re-tested in M2                                                                     |
| D-5 | `safeStorage` unavailable on some Linux keyrings (plan R-5)                                                        | explicit failure-path tests (`TC-07-04`, `TC-07-12`); UI must show actionable error                                                          |
| D-6 | Port 10808-occupied policy undecided (PRD Q-03)                                                                    | `TC-02-06` written policy-agnostic: whatever the decision, a silent port change fails the test                                               |
| D-7 | CI has never executed a push run (cannot be verified read-only — git is out of QA scope here)                      | M0-17 (devops) owns; recorded in `m0-verification.md`                                                                                        |

## 10. Reporting (every RED or verification pass)

1. Table of files: new/changed paths + case counts.
2. RED/GREEN status **per test case ID** (never "some tests failed").
3. Exact suite output (totals, failing names, failure reasons) — runner: Vitest (or Playwright for L3).
4. Deviations from this strategy, one line each, with an owner.

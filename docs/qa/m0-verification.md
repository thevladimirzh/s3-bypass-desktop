# M0 Verification Record — scaffold (read-only pass)

Owner: **QA** · Task reference: `docs/plans/m0-scaffold.md` M0-18 area (verification evidence; formal
clean-clone check is M0-18) · Executed: **2026-10-07 00:25–00:28 MSK** · Machine: macOS **15.6.1, arm64**
· Node **v22.12.0** · npm **10.9.0** · Electron **44.5.1** · Vitest **5.0.3**
Method: commands run as-is from the repo root, **no files modified** by QA (only `docs/qa/**` written).

> **Concurrency note (important):** the developer agent was editing the scaffold _during_ this pass. Between
> the first and the confirmation run (00:25:46 → 00:26:47) the repo changed: `src/main/index.ts` gained
> `sandbox: true` (was `false` on first read), `docs/plans/m1-mvp.md` Prettier violations were fixed, and
> `.env.example` appeared. All results below are from the **confirmation snapshot at 00:26:35–00:26:47 MSK**
> unless marked "first pass". This is recorded as a deviation, not a defect.

## 1. Commands executed — exact results (confirmation snapshot)

| #   | Command                           | Exit  | Result     | Key output                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `npm run lint`                    | **0** | **PASS**   | `eslint .` — no findings                                                                                                                                                                                                                                                                                                                   |
| 2   | `npm run format:check`            | **0** | **PASS** ⚠ | `Checking formatting... All matched files use Prettier code style!` — but **first pass (00:25:46) exited 1**: `[warn] docs/plans/m1-mvp.md` / `Code style issues found in the above file`. Fixed concurrently by another agent before the confirmation run. Evidence a CI leg (`format:check` in `ci.yml`) can go red on unformatted docs. |
| 3   | `npm run typecheck`               | **0** | **PASS**   | `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` (strict per `tsconfig*`)                                                                                                                                                                                                                                         |
| 4   | `npm test`                        | **0** | **PASS**   | `RUN v5.0.3` → `Test Files 1 passed (1)` · `Tests 3 passed (3)` · `Duration 116ms`. Cases: `tests/unit/constants.test.ts` (app name, SOCKS port 10808, `app:ping` namespace).                                                                                                                                                              |
| 5   | `npm run build`                   | **0** | **PASS**   | `electron-vite build`: `out/main/index.js 1.34 kB`, `out/preload/index.js 0.38 kB`, `out/renderer/index.html 0.55 kB` + assets (`index-TxhIOaBx.js 642.75 kB`), all bundles produced                                                                                                                                                       |
| 6   | electron smoke launch (built app) | **0** | **PASS**   | see §2                                                                                                                                                                                                                                                                                                                                     |

Commands **not** run (out of M0 scope / not defined): `npm run dev` (long-running), `npm run dist`
(electron-builder — M2), `npm ci` (would touch `node_modules`; install was pre-done by the developer).

### 2. Electron smoke launch — method and output

Method (built app, direct binary so the PID is the Electron main process):

```sh
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . > $LOG 2>&1 &
PID=$!; sleep 6
kill -0 $PID            # liveness probe
# count: pgrep -f "s3-bypass-desktop/node_modules/electron"
kill $PID; sleep 2; kill -9 $PID   # teardown
# count leftovers: pgrep -f "s3-bypass-desktop/node_modules/electron"
```

Observed (confirmation run, app started from the fresh `npm run build` output):

- `SMOKE_STATUS=ALIVE_AFTER_6S` — main process alive after 6 s; **3** app processes running (main + helpers
  incl. a spawned renderer with `--app-path=/Users/vladimir/s3-bypass-desktop --enable-sandbox`);
- app stdout/stderr log **empty** — no crash output, no error dialogs logged;
- after `SIGTERM` (+ `SIGKILL` fallback): `LEFTOVER_COUNT=0` — **no orphan processes** of our app
  (only unrelated Postman/OpenCode crashpad handlers remained in `pgrep`);
- first pass (pre-`sandbox:true` build) behaved identically: alive at 6 s, helpers spawned, zero leftovers.

Not asserted by this smoke: rendered window _content_ and console errors (would need DevTools/Playwright) —
deferred to `TC-E2E-01` (M1-24). Pass criterion here: process stays up, produces no error output, tears down
cleanly.

## 3. Secure-defaults spot-check checklist (M0-05/06/19 evidence)

| #   | Check                                                                  | Expected                                                        | Observed                                                                                                                                                                                                                   | File:line                                                  | Verdict                                                                                                                      |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `contextIsolation` on                                                  | `true`                                                          | `true`                                                                                                                                                                                                                     | `src/main/index.ts:15`                                     | **PASS**                                                                                                                     |
| 2   | `nodeIntegration` off                                                  | `false`                                                         | `false`                                                                                                                                                                                                                    | `src/main/index.ts:16`                                     | **PASS**                                                                                                                     |
| 3   | Renderer `sandbox`                                                     | `true` (M0-05)                                                  | `true` in confirmation snapshot; **was `false` at first read (00:25:46)**, fixed concurrently                                                                                                                              | `src/main/index.ts:17`                                     | **PASS** (flagged: was red mid-run — see concurrency note; also renders with `--enable-sandbox`, confirmed in smoke `pgrep`) |
| 4   | CSP header present in renderer HTML                                    | meta CSP, restrictive sources                                   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` — present in source **and** in build output                                                                                                      | `src/renderer/index.html:6-9`, `out/renderer/index.html:7` | **PASS** (note for cybersecurity M0-19: `style-src` allows `'unsafe-inline'` — styles only, scripts locked to `'self'`)      |
| 5   | No secrets in repo                                                     | no credential-looking strings; no `.env`                        | recursive grep for `AKIA[0-9A-Z]{16}`, `aws_secret`, `-----BEGIN` private-key headers, `password[:=]<long>` → **0 matches**; **no `.env` file exists at all**                                                              | repo-wide                                                  | **PASS**                                                                                                                     |
| 6   | `.env` gitignored                                                      | ignored; `.env.example` is the only template, placeholders only | `.gitignore:7-9`: `.env`, `.env.*`, `!.env.example`; `.env.example` exists (appeared during this pass) and every value (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, …) is **empty** with "NEVER commit real values" header | `.gitignore:7-9`, `.env.example:1-13`                      | **PASS**                                                                                                                     |
| 7   | Window open handler — no arbitrary navigation/popups                   | popups denied; only `http(s)` handed to OS browser              | `setWindowOpenHandler` returns `{action:'deny'}`; `shell.openExternal` only for `http://`/`https://` URLs                                                                                                                  | `src/main/index.ts:21-26`                                  | **PASS** (bonus check)                                                                                                       |
| 8   | Preload surface minimal                                                | placeholder channel only until M1 IPC contract                  | exposes only `ping` + static `versions` under `window.s3Bypass`; no secret-bearing channel exists yet                                                                                                                      | `src/preload/index.ts:5-14`                                | **PASS** (full allowlist contract arrives with M1-06)                                                                        |
| 9   | `remote` module / `allowRunningInsecureContent` / `webSecurity: false` | absent                                                          | no occurrences anywhere in `src/`                                                                                                                                                                                          | grep: `allowRunningInsecureContent                         | webSecurity                                                                                                                  | remote` → 0 matches | **PASS** |

## 4. Gaps & findings (reported, not fixed — QA does not touch code/config)

| #   | Finding                                                                                                                                                                                                                                                                                  | Evidence                                              | Owner / plan ref                     | Severity                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| G-1 | **M0-11 RED task incomplete:** plan requires "one pure function test **and one renderer component render test** (@testing-library/react)"; only `tests/unit/constants.test.ts` exists — no renderer/component test, and `jsdom` + `@testing-library/react` are **not** in `package.json` | `tests/` listing; `package.json` devDependencies      | developer / M0-11–M0-12              | **resolved after snapshot** — `jsdom` + `@testing-library/react` installed, `tests/unit/app-render.test.tsx` added (6/6 green) |
| G-2 | **No coverage tooling:** `@vitest/coverage-v8` not installed → coverage thresholds (strategy §6) not enforceable yet                                                                                                                                                                     | `node_modules/@vitest/` contains only `mocker`, `spy` | developer (with M1-04/first RED)     | resolved — `@vitest/coverage-v8` installed, `npm run test:coverage` works (thresholds deferred to M1 by design)                |
| G-3 | **CI never observed green:** `.github/workflows/ci.yml` exists and runs `lint → format:check → typecheck → test` on ubuntu, but verifying a real push run requires git (out of QA scope)                                                                                                 | `.github/workflows/ci.yml`                            | devops / M0-17                       | resolved — green runs `37534079151` (matrix ubuntu+macos) and `37534224910` observed on `main`                                 |
| G-4 | **Transient red on `format:check`** observed first pass (docs/plans/m1-mvp.md unformatted) — proves the leg can fail on committed docs                                                                                                                                                   | §1 row 2                                              | project-manager (author of the file) | low — now green                                                                                                                |
| G-5 | **`docs/qa/README.md` missing** (M0-09 requires a test-strategy pointer there)                                                                                                                                                                                                           | `docs/qa/` contained nothing before this pass         | project-manager / M0-09              | resolved — `docs/qa/README.md` created (M0-09 index)                                                                           |
| G-6 | **`docs/analysis/` absent** (M1-02) — official blocker for M1-03/M1-04 per plan gate                                                                                                                                                                                                     | glob `docs/analysis/*` → none                         | business-analyst / M1-02             | resolved — `docs/analysis/` committed (FRs, data flows, errors); `[pending M1-02]` markers can be cleared                      |
| G-7 | Smoke asserts process liveness only — no rendered-UI assertion possible without Playwright (deferred by design)                                                                                                                                                                          | §2                                                    | QA / M1-24                           | info                                                                                                                           |

## 5. Verdict

- **M0 toolchain gates (M0-15):** `lint`, `format:check`, `typecheck`, `test`, `build` — **all exit 0** on the
  confirmation snapshot; electron app launches and tears down cleanly → the scaffold is **operationally
  green** for M1 RED work to begin after the M1-02 analysis gate.
- **M0 DoD caveats:** both flip blockers closed after the snapshot — G-1 (renderer render test +
  jsdom/RTL installed, 6/6 green) and G-3 (CI green on `main`: runs `37534079151` matrix, `37534224910`).
  One transient `format:check` red was seen and resolved concurrently (G-4). Remaining gate for M0-20:
  security spot-check M0-19.
- Secure defaults: **9/9 checks PASS** at snapshot time (check #3 was red 1 minute earlier and was fixed
  during this pass — recorded for full honesty).

_No git commands were run; no files outside `docs/qa/` were modified._

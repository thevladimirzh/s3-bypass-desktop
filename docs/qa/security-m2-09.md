# Security Review M2-09 — external-distribution gate (M2 DoD #3)

Date: 2026-10-08 · Reviewer: `cybersecurity` agent (read-only analysis) · Tree:
HEAD `da44934`, clean · Scope: the three areas of board M2-09 — (1) supply chain
pin ↔ hash ↔ artifact, (2) S3 key handling in the packaged app, (3) IPC surface
re-check · Predecessors: `docs/qa/security-m0-19.md` (M0 PASS, issues #1–#6 era),
`docs/qa/security-m1-10.md` (M1 partial PASS, issue #1), `docs/qa/security-m1-25.md`
(PASS-with-blockers, S5-*), `docs/qa/security-m2-audit.md` (M2-08 accepted-risk).

**Verdict: PASS — 0 critical, 0 high, 0 medium; 1 new low (S6-1) + 7 info/accepted
rows (S6-2..S6-8); 3 prior lows found UNTRACKED and triaged to issues #21/#22;
S5-14 (the M2 "external-distribution blocker") closed at this gate. Findings went
to GitHub issues (house rule) — #20, #21, #22; no comments were used.**

## 1. Scope & method

- Read the packaging-era artifacts end to end: `scripts/prepare-core.mjs`,
  `scripts/verify-core-pin.mjs`, `scripts/release-manifest.mjs`,
  `.github/workflows/{ci,release}.yml`, `electron-builder.yml`, `package.json`
  scripts, `docs/analysis/core-pin.md`.
- Re-read every security surface of the packaged app: `secret-store`,
  `core-supervisor` (materialization → spawn → exit/cleanup), `log-collector`,
  `profile-validator`, `ipc-guard` + all `ipcMain.handle` registrations,
  `index.ts` window/permission/navigation hardening, `system-proxy` exec layer,
  `src/preload/index.ts`, `src/renderer/index.html` (CSP), `src/shared/ipc.ts`.
- Live checks: **0 unpinned `uses:`** across both workflows (every action at a
  full 40-hex SHA); **0** `shell:true`/`exec`/`execSync`/`/bin/sh` in `src/`;
  11 `ipcMain.handle` ≡ 11 `assertTrustedSender(event)` first-statements;
  `statSync` before read present (S5-5); `env:`/`timeout` absent where S5-12/S5-15
  expect them.
- **Trust nothing, re-read the code**: every prior S5-* disposition was
  re-verified against the current tree (§3), not copied from the reports.
- No source/test/config change in this batch; the writes are this file, the
  board/bookkeeping rows, and issues #20–#22. No comments posted.

## 2. Findings (this review)

| ID   | Sev     | Area         | Location                                                                                    | Finding                                                                                                                                                                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                               |
| ---- | ------- | ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S6-1 | **low** | supply chain | `scripts/prepare-core.mjs:94,107`; `package.json:22`; `electron-builder.yml` extraResources | **Local `npm run dist` packs `core-bin/<target>` as-is**: no lifecycle gate runs `prepare:core`/verify first, and staging is never cleaned before extraction — leftovers from a previous pin/asset set (and any stray file) survive `-o` and ship unverified from a **local** build. The release chain is unaffected (fresh checkout → prepare → dist → manifest, pinned by TC-PKG-11..15). | **issue #20** (fix: clean staging + afterPack/`predist` gate + TC-PKG-18 pin)                                                                                                             |
| S6-2 | info    | supply chain | `release.yml` rpm leg (container)                                                           | The Fedora build container is pinned by the mutable tag `fedora:46`, not a digest; GitHub runner labels (`macos-latest`, `ubuntu-latest`) float by design.                                                                                                                                                                                                                                  | accepted — deliberate DV-47 major-pin decision; the hash-critical input (the core) is digest-pinned; runner images are toolchain under the GitHub SLA (§4.1)                              |
| S6-3 | info    | supply chain | `package.json` (electron dep) → electron-builder fetch path                                 | The Electron archive's integrity relies on electron-builder's upstream fetch behavior + the lockfile's version/integrity pin — there is no in-repo SHA-256 for it, unlike the core.                                                                                                                                                                                                         | accepted — lockfile-pinned version, registry integrity, M2-08 audit legs (§4.1)                                                                                                           |
| S6-4 | info    | supply chain | `scripts/prepare-core.mjs:80-82`                                                            | `fetch` has no timeout/size cap and follows redirects: a misbehaving endpoint can stall or memory-DoS a build. Digest verification afterwards is fail-closed, so integrity does not depend on the source host.                                                                                                                                                                              | accepted — availability-of-CI only; integrity unaffected (§4.1)                                                                                                                           |
| S6-5 | info    | S3 keys      | `src/main/core-supervisor.ts:320-335`                                                       | The plaintext materialized config T exists in the OS temp dir while the core runs (the child consumes `-c <file>`).                                                                                                                                                                                                                                                                         | accepted — inherent to the core CLI contract; FR-23 mitigations verified in §4.2 (0700 dir, 0600 file + chmod re-assert, cleanup on every normal path, T never in errors/emits)           |
| S6-6 | info    | S3 keys      | hard-kill path (SIGKILL/power loss)                                                         | If main is hard-killed no app code runs: the child may be orphaned and T lingers until the OS temp reaper.                                                                                                                                                                                                                                                                                  | accepted — inherent (nothing runs after SIGKILL); normal quit/crash covered by `forceStop()` (S5-3 fix) + `before-quit` teardown; crash-branch surfacing tracked in **issue #19** (M2-11) |
| S6-7 | info    | IPC          | `src/shared/ipc.ts` (push fan-out, future multi-window)                                     | Broadcast targeting, broad payload validation and throttling (M1-10 S4-3/4/6 breadth) are not built.                                                                                                                                                                                                                                                                                        | tracked — **issue #5**; the landed part is verified here: `proxy:set` runtime payload guard (`index.ts:1024-1040`, S4-4)                                                                  |
| S6-8 | info    | supply chain | `package.json` / `package-lock.json`                                                        | `npm ci` executes lifecycle scripts of the dev dependency tree (601 integrity-pinned registry packages).                                                                                                                                                                                                                                                                                    | accepted — lockfile pins + registry integrity + blocking `npm audit --omit=dev` and the informational high/critical leg (M2-08) (§4.1)                                                    |

**S5-14 closed at this gate** (M1-25 called it "a hard blocker for external
distribution"): the binary is version- and SHA-256-pinned in
`docs/analysis/core-pin.md` (release `v26.9.9-1.0.1fed` :15, upstream commit
`036606649aae3ee36102b02e6437c7266bc2f2be` :22, three asset digests :39+);
staging re-verifies every digest against that doc before extraction and dies on
mismatch (`prepare-core.mjs:84-90`, `verify-core-pin.mjs` CLI exit 0/1/2); CI
reaches `dist` only through that verified staging on a fresh checkout
(`core-bin/` is ignored, TC-PKG-04); the artifacts themselves are hash-listed and
re-verified by `release:manifest` (TC-PKG-14); `CORE_BINARY_PATH` remains
non-packaged-only (issue #6). Residual accepted: no **per-start** re-hash —
build-time pinning is the BRIEF §4 contract, and per-start hashing buys nothing
against an attacker who can already write the app bundle. The one hole left in
the chain is the local path (S6-1 → issue #20).

## 3. Re-verification of prior findings (current code, not report copies)

| Prior       | Status @ M2-09                                                                    | Evidence (current tree)                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 / #1   | **not regressed**                                                                 | 11/11 handlers call `assertTrustedSender(event)` first (`index.ts:773, 903, 922, 944, 964, 974, 981, 988, 995, 1006, 1027`) ≡ `IPC_INVOKE_CHANNELS`; source-scan pin `tests/unit/ipc-guard-contract.test.ts`                                                                                  |
| S3-2        | fixed (#1)                                                                        | `index.ts:1054-1061` deny-all `setPermissionRequestHandler`                                                                                                                                                                                                                                   |
| S4-1/2 #4   | fixed (security-m1-26b)                                                           | size caps + try-wrap in `secret-store.ts` (§4.2.1)                                                                                                                                                                                                                                            |
| S4-4 / #5   | landed M1-27b (payload guard)                                                     | `index.ts:1024-1040` `InvalidPayloadError` before any side effect; the broadcast/throttle breadth stays open → S6-7                                                                                                                                                                           |
| S4-6 / #5   | fixed `a4a0b69`                                                                   | `index.ts:904-915` `importDialogInFlight` single-flight + `finally` re-arm                                                                                                                                                                                                                    |
| S5-1 / #7   | fixed (issues #7–#13 batch)                                                       | `profile-validator.ts:323-346` — **every** inbound entry must be a loopback socks listener (E-VAL-014), no `break`-at-first-socks                                                                                                                                                             |
| S5-2 / #8   | fixed                                                                             | `core-supervisor.ts:182-187` `unexpectedExitError` runs `redactLine(lastLine)` before embedding the cause                                                                                                                                                                                     |
| S5-3 / #9   | fixed                                                                             | `core-supervisor.ts:723` `forceStop()` terminates from any live state; teardown awaits (window-lifecycle)                                                                                                                                                                                     |
| S5-4 / #10  | fixed                                                                             | `ipc-guard.ts` `allowedSenderUrls()` consults `app.isPackaged` **at call time**; packaged set = the app's own document alone, set membership (never `startsWith`)                                                                                                                             |
| S5-5 / #11  | fixed                                                                             | `index.ts:817` `statSync(path).size` answered before any read (gate-first contract comment :351)                                                                                                                                                                                              |
| S5-6 / #12  | fixed                                                                             | `log-collector.ts:91-108` — camelCase (`clientSecret`, `privateKey`), `\bAKIA…{16}`, JWT triple, ≥40-char token shapes; whole-line replacement                                                                                                                                                |
| S5-7 / #13  | fixed                                                                             | `LogsView.tsx:6,33` `MAX_RENDERED_LINES = 2000` + `slice(-…)`; main batches pushes, preload expands batches 1:1                                                                                                                                                                               |
| S5-8        | **open — was UNTRACKED**                                                          | `core-supervisor.ts:419-439` `buffer += chunk` with no cap → **issue #22**                                                                                                                                                                                                                    |
| S5-9 / #3   | fixed                                                                             | `index.ts:278-297` navigation/redirect pinned to the exact documents (the former blanket `file://` noted as removed)                                                                                                                                                                          |
| S5-10 / #16 | **half fixed** (desktopEnv wired, issue #16 closed, TC-04-19) + residual accepted | `index.ts:584,618` `XDG_CURRENT_DESKTOP` fed into the context/support check. Replay-format validation half was NOT built — accepted here: M1-25 itself proved argv injection impossible (`execFile` elements are verbatim), residual is restore fidelity (functional), not a security control |
| S5-11       | fixed (server-side control)                                                       | `index.ts:904-915` single-flight (the UI-disable half rides issue #5's renderer work; the guard is the control)                                                                                                                                                                               |
| S5-12       | **open — was UNTRACKED; in-scope (S3 keys)**                                      | `core-supervisor.ts:632-634` spawn carries no `env` → child inherits the full parent environment → **issue #21**                                                                                                                                                                              |
| S5-13       | closed (M2-08)                                                                    | `ci.yml:44,51` audit legs green in CI `37719728001`; accepted-risk note in `security-m2-audit.md` (issue #2 closed)                                                                                                                                                                           |
| S5-14       | **closed at this gate**                                                           | §2 above (pin ↔ hash ↔ artifact verified end to end)                                                                                                                                                                                                                                          |
| S5-15       | **open — was UNTRACKED**                                                          | `index.ts:560-570` `execFile(..., { encoding })` without `timeout`; teardown has no last-resort bound → **issue #22**                                                                                                                                                                         |
| S5-16       | tracked → #17 (closed in M1-27b); (d) → #19 open, (e) → #15 closed                | docs reconciled; crash/quit branch remains issue #19 (M2-11); launch-hidden fixed (`index.ts:262` `show: false` + policy call-site, TC-05-23)                                                                                                                                                 |
| S5-17       | info                                                                              | `pushApp` still has no producer (grep: own module only)                                                                                                                                                                                                                                       |
| S5-18       | closed (M2-05/07)                                                                 | `electron-builder.yml:10` `asar: true` explicit; `:5-7` `files:` = `out/**` + `package.json` (no `node_modules` shipped); no `publish` config (no auto-update surface)                                                                                                                        |

## 4. Affirmatively-verified checklist (evidence per M2-09 area)

### 4.1 Supply chain — pin ↔ hash ↔ artifact

1. **Single source of truth**: `docs/analysis/core-pin.md` records the release
   tag, the upstream commit SHA and the three asset SHA-256 rows; its structure
   is pinned by TC-PKG-01..03 and its rows may not be hand-edited outside the
   pin-bump rule (TC-PKG-01 regex).
2. **Staging verifies against the doc, never the network response**:
   `prepare-core.mjs:66-74` reads tag+digest from the pin doc → `:77-82`
   downloads the exact pinned release URL over HTTPS → `:84-90` SHA-256 compare,
   **exit 1 on mismatch BEFORE extraction** → `:101-103` staged `xray` must exist,
   chmod 0755. `verify-core-pin.mjs` is the standalone re-usable verifier
   (match → `core pin OK` exit 0; mismatch/no pin row/unreadable → `MISMATCH`
   exit 1; bad args → usage exit 2).
3. **Release chain order on every leg** (live in `release.yml`):
   `npm ci` (:56, :105) → `prepare:core` (:58, :107) → `dist` (:68, :111) →
   `release:manifest` (:70, :113); presence and order pinned by TC-PKG-11..15.
   `release-manifest.mjs` WRITES `SHA256SUMS.txt` and re-hashes every artifact
   against it in the same run; a re-run verifies WITHOUT rewriting — drift prints
   `MISMATCH <file>` and exits 1 (the manifest stays the record of evidence).
4. **CI hygiene**: every `uses:` in `ci.yml`/`release.yml` is a full 40-hex SHA
   (live grep: 0 unpinned); `npm ci` everywhere (lockfile only); blocking
   `npm audit --omit=dev` + informational `--audit-level=high`
   (`continue-on-error`) landed in M2-08 (S5-13 closure); the accepted-risk note
   for the dev-only sprintf-js finding has its re-evaluation triggers
   (`security-m2-audit.md`, issue #2).
5. **Packaging minimalism**: `electron-builder.yml` ships `out/**` +
   `package.json` only, `asar: true` explicit (S5-18 closure), `npmRebuild: false`,
   core via directory-level `extraResources`, MPL-2.0 attributions packed into
   every artifact (`resources/licenses` → `licenses/`, M2-06 TC-PKG-08..10).
6. **Gap found**: the local `dist` path — S6-1 → issue #20 (the only hole in the
   chain; CI/releases unaffected).

### 4.2 S3 key handling in the packaged app

1. **At rest**: the whole profile document is `safeStorage`-encrypted before any
   byte reaches disk (`secret-store.ts:121-160`), file `0600` **and** a chmod
   re-assert after write (:150-151); `safeStorage.isEncryptionAvailable()` is
   checked first and there is no plaintext fallback path (FR-53); failure answers
   the documented `E-STOR-*` triple without leaking raw exceptions. Main-process
   only — structurally kept off the renderer bridge (TC-07-16/17). Issue #4's
   hardening (path try-wrap, size caps) is in.
2. **To the renderer**: `profile:get` returns the §8.3 summary only
   (`index.ts:918-931`); `ProfileImportResult` is summary-or-error-triple, never
   the document (`shared/ipc.ts:97-107`); `buildProfileSummary` emits display
   fields only — no `accessKey`, no `secretKey`, no `*token*`
   (`index.ts:466-483`).
3. **To the core**: T is materialized in an `mkdtemp` dir (0700 by OS) with the
   file written `0600` **and** chmod re-asserted (`core-supervisor.ts:142-143,
320-335`); cleanup runs on materialize-failure, spawn-throw, every child
   `close`/`error`, `stop()` and `forceStop()` (:442+, :723); the materialized
   path is contractually kept out of `lastError` and every emit (FR-23 module
   contract). Residuals S6-5 (plaintext while running) and S6-6 (hard kill)
   accepted with rationale.
4. **Out of logs and errors**: one redaction entry point
   (`log-collector.ts:91-108`) — credential field names (incl. camelCase),
   config-document markers, `AKIA…` key ids, JWT triples, ≥40-char token runs,
   and any line containing `/` → whole-line replacement; bounds 2000 lines ×
   4096 chars. `unexpectedExitError` redacts the last child line (S5-2 fix).
   Validator messages never echo field values (only the file size in MiB,
   `profile-validator.ts:250`); JSON syntax errors are reduced to line/column
   (:148-163) — no content snippet crosses.
5. **Process boundary**: spawn is `spawn(binaryPath, ['run', '-c', T], {
stdio: ['ignore', 'pipe', 'pipe'] })` — argv array, stdin closed, no shell;
   zero `shell:true`/`exec`/`execSync` in `src/` (grep); system-proxy runs only
   through injected `execFile` argv builders (PR-08) with snapshot values as
   single argv elements.
6. **Gap found**: env inheritance — S5-12 → **issue #21** (the one surface still
   handing credential-class material to a third party without need).

### 4.3 IPC surface re-check

1. **Handlers**: exactly 11 `ipcMain.handle` registrations ≡
   `IPC_INVOKE_CHANNELS`; each calls `assertTrustedSender(event)` as its literal
   first statement (line list in §3); no `ipcMain.on`; source-scan pin in
   `tests/unit/ipc-guard-contract.test.ts`.
2. **Guard**: exact set membership (never prefix matching); the allowed set is
   computed at **call time** from `app.isPackaged` — packaged runs accept the
   app's own document only; a missing/forged `senderFrame` degrades to refusal,
   never to a TypeError (defensive read). Refusal is a plain named `Error`
   (`UntrustedSenderError`) with no `E-*` code and no secret material (DV-19).
3. **Preload**: channel arguments are compile-time constrained both ways (invoke
   - push); no raw `ipcRenderer` passthrough; `log:line` batches expand 1:1
     (S5-7 fix, issue #13).
4. **Window**: `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true` (`index.ts:263-268`); `window.open` → `shell.openExternal`
   only for `https://`, otherwise denied (:271-276) — the only `openExternal`
   call site; navigation/redirect pinned to the exact documents (:278-297);
   deny-all permission handler (:1054-1061); CSP `default-src 'self';
script-src 'self'; connect-src 'self'; object/frame-src none; base-uri none;
form-action 'none'` (`index.html:7-9`).
5. **Payloads**: results are typed contracts only (§4.2.2); `proxy:set`
   re-validates `enabled` at runtime before any side effect (`index.ts:1024-1040`);
   `profile:import-dialog` is single-flight (:904-915).
6. **Open, tracked (not findings of this review)**: issue #5 (S4-3/6 breadth —
   future broadcast targeting/throttling), issue #19 (quit/crash surfacing incl.
   the tray freshness advisory, M2-11).

## 5. Triage & verdict

- **New findings → issues (house rule)**: S6-1 → **#20** (low); S5-12 → **#21**
  (prior in-scope low, was untracked); S5-8 + S5-15 → **#22** (prior lows outside
  this review's three areas, also untracked — tracking restored rather than
  silently carried).
- **Accepted with rationale (no owner action; re-evaluate at M2-13)**: S6-2
  (tag-pinned container per DV-47), S6-3 (Electron fetch integrity), S6-4 (fetch
  bounds — availability only), S6-5 (plaintext T while running — FR-23
  mitigations), S6-6 (hard-kill residual — inherent), S6-8 (lifecycle scripts —
  lockfile + audit gates), S5-10 replay-format residual (argv-safe by
  construction).
- **Tracked elsewhere**: issue #5 (S6-7), issue #19 (S6-6 crash branch + S5-16(d)),
  issues #15/#17 (S5-16(e)/(a–c,f)), issue #16 closed with fix (S5-10 desktopEnv).
- **Closed at this gate**: S5-14 (M2 external-distribution blocker) and S5-18
  (M2 packaging notes) — both were explicitly "re-verify at M2 exit".

**M2 DoD #3 — "Security review before any external distribution (BRIEF §5):
supply chain, S3 key handling, IPC — findings triaged" — MET**: all three areas
reviewed with line-anchored evidence (§4), **0 critical / 0 high / 0 medium**
open, every finding dispositioned to an issue or a written acceptance (§5), prior
findings re-verified rather than assumed (§3), and the review's communication
channel was issues only (no comments).

Open follow-ups that must land before/with acceptance: **#20, #21, #22** (lows),
**#19** (M2-11), **#5** (feature-landing hardening), and the board's remaining
rows M2-10 / M2-12 (real-binary + fresh-machine DoD).

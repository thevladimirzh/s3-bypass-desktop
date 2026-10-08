# Security Review M3-12 — pre-distribution gate (M3 DoD #2)

Date: 2026-10-09 · Reviewer: in-session read-only analysis (the dedicated
`cybersecurity` subagent was unavailable in this session — free-tier
restriction — the review was performed directly, following the method of the
predecessor report) · Tree: HEAD `47aac56`, clean · Baseline: **`da44934` /
`docs/qa/security-m2-09.md`** (M2 external-distribution gate) · Delta: **45
commits** `da44934..HEAD` · Predecessors: `security-m0-19.md` (M0 PASS),
`security-m1-10.md`, `security-m1-25.md` (S5-* blockers, all closed),
`security-m1-26b.md`, `security-m2-audit.md` (accepted risk), `security-m2-09.md`
(PASS, S6-1..S6-8).

_*Verdict: PASS — 0 critical, 0 high, 0 medium; 1 low (S7-1) found and
FIXED-VERIFIED at this gate; 3 info rows (S7-2..S7-4). S6-1 (the M2-09 low)
is now verified fixed and CLOSED. Every prior S6-* disposition re-verified
against the current tree (§3). DoD #2 gate: nothing in this review blocks
external distribution._*

## 1. Scope & method

Board M3-12 names three areas — re-reviewed as **deltas since
`security-m2-09.md`**, each verified in the current tree, never copied:

1. **Error surfaces** — M3 batch A (`src/shared/error-triples.ts`, the single
   source of user-visible wording; `errors.md` §0 forbids OS errno/`E-…-###`
   citations in user text), batch B (`surfaceQuitFailure` in
   `src/main/index.ts`, B-13: only documented triples reach the dialog), batch
   D (`src/shared/strings.ts`, the EN `t(key)` seam); plus the wording-only
   M3-04 touches of `secret-store.ts` (error alias → shared triple) and
   `system-proxy.ts` (nextStep sentence).
2. **IPC surface** — every `ipcMain.handle` re-counted and re-matched to its
   `assertTrustedSender(event)` first statement; the main→renderer push set
   compared against the baseline; the new quit-failure path analyzed for
   trust boundaries.
3. **Supply chain / packaging** — `scripts/after-pack-verify.mjs` (issue #20
   gate, DV-65 fix), `scripts/build-icon.mjs` + committed `assets/icon.icns`
   / `assets/icon.png`, `release.yml` (dual-arch mac leg + the new verify
   step), `package.json` script delta, the new `docs/user/*` content, and the
   pre-M3 hardening that landed after the baseline (issues #19, #21, #22,
   #24, #25).
4. **Issue #20 / S6-1 closure check** — the M2-09 low, re-verified end to end.

Method mirrors M2-09: read the code; live greps for the standing invariants;
prior dispositions re-checked against the _current_ tree. No source/test/config
change in this batch — the writes are this file, the board row, and the
bookkeeping. No issues or comments were created (all findings are
fixed-verified or accepted below).

## 2. Findings (this review)

| ID   | Sev                      | Area                       | Location                                                                            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------ | -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S7-1 | **low** (fixed-verified) | supply chain               | `scripts/after-pack-verify.mjs:36` (pre-fix)                                        | The afterPack gate's `ARCH_BY_ENUM` never matched electron-builder's real `Arch` enum (`ia32=0, x64=1, armv7l=2, arm64=3, universal=4`): it read `1 → ia32`, so **every x64 build resolved to a never-staged `*-ia32` target**. Caught empirically by the M3-10 validation run `37846078455` (all three legs failed AT the gate). Direction of failure: fail-closed (builds blocked, wrong bytes never packed), but the mislabel also meant an `ia32`-named pack would have been checked against the `x64` manifest — the mapping itself was untrustworthy. Root cause: the enum path lived only in the untested default `afterPack` export (TC-PKG-19/20 drive `verifyPackedCore` with literal string targets), and the local DV-60 GREEN ran on an arm64 host where `3 → arm64` was coincidentally right. | **fixed-verified at this gate**: table realigned (`5d61e44`), `archName` exported as the **TC-PKG-22** seam (enum rows pinned row-by-row incl. the CI case `1 → x64`, plus the default entry resolving `arch 0 → linux-ia32` fail-closed); re-run `37846938932` green on all 3 legs incl. both mac archs. DV-65 in m3-test-plan §11. |
| S7-2 | info                     | supply chain               | `scripts/after-pack-verify.mjs` (export)                                            | `archName` is now exported purely for the TC-PKG-22 test seam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | accepted — pure string mapping, no I/O, no trust input; precedented by the already-exported `verifyPackedCore`.                                                                                                                                                                                                                      |
| S7-3 | info                     | supply chain               | `scripts/build-icon.mjs`, `assets/icon.icns`, `assets/icon.png`                     | M3-07 adds in-repo icon generation: a local `spawnSync(tool, args)` (argument array, **no shell**, no `exec`, no network) over `sips`/`iconutil`, from an in-repo SVG; the generated icns/png are **committed**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | accepted — the script is NOT wired into CI/release (`build:icon` exists only as a `package.json` script; grep over `.github/` = 0 hits), so release builds consume reviewed, committed bytes; regeneration path `npm run build:icon` documented for on-demand diff.                                                                  |
| S7-4 | info                     | hardening (positive delta) | `src/main/child-env.ts`, `src/main/log-collector.ts`, `src/main/core-supervisor.ts` | Post-baseline fixes re-verified present: issue #21 child env **built** from `CHILD_ENV_ALLOWLIST` (fail-closed by construction, never filtered-by-deletion); issue #24 token-level redaction masks with class markers at the single entry point; issue #22 bounded reader buffer + kill/teardown; issue #23 `sessionsDir` passed verbatim (FR-22); issue #19 quit/crash surfacing of E-PLAT-003.                                                                                                                                                                                                                                                                                                                                                                                                            | accepted — each landed with its own RED/GREEN + closed issue; noted as verified, not re-triaged.                                                                                                                                                                                                                                     |

**S6-1 CLOSED at this gate** (M2-09 low → issue #20): local `npm run dist` is
now gated fail-closed — `prepare-core` cleans staging before extraction and
writes a per-target manifest (`cleanStagingTarget` + manifest, TC-PKG-18),
`afterPack` re-hashes the packed bytes against pin-doc ↔ manifest ↔ packed
files entirely offline (`verifyPackedCore`, TC-PKG-19), the wiring is pinned
(TC-PKG-20), the dist path carries the staging gate (commit `bfa3740`), and —
after DV-65 — the enum→target mapping that feeds it is pinned too
(TC-PKG-22) and proven in CI (release run `37846938932`, all legs green).
The verification chain no longer depends on any one untested path.

## 3. Prior dispositions re-verified (current tree)

| Row                      | Re-verified now                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S6-1 (issue #20)         | **fixed-verified → CLOSED** (see §2).                                                                                                                                                                                                                |
| S6-2                     | unchanged — `release.yml` still runs the rpm leg in `fedora:46` (mutable tag), runners `*-latest`; deliberate DV-47 accepted decision, no new mutable input.                                                                                         |
| S6-3 / S6-8              | unchanged — **zero `package-lock.json` commits** in the delta; the only `package.json` change is the `build:icon` script (no dependency delta).                                                                                                      |
| S6-4                     | unchanged — `prepare-core.mjs` delta is only the issue #20 gate commit; fetch behavior as accepted (digest verification remains fail-closed after it).                                                                                               |
| S6-5 / S6-6              | unchanged in substance — supervisor delta = issues #21/#22/#23 (all hardening); the temp plaintext `T` analysis stands: 0700 dir / 0600 file / cleanup on every normal path / hard-kill residual as accepted.                                        |
| S6-7                     | unchanged — issue #5 open, **no fan-out work landed**: the main→renderer push set is still exactly `status:changed` + `log:line` (`index.ts:82,145`), no new push, no new broad payload path. The landed part (`proxy:set` payload guard) untouched. |
| S5-* standing invariants | re-run live (§4): all hold.                                                                                                                                                                                                                          |

The wording-only M3 touches (`secret-store.ts` +12/−, `system-proxy.ts` +3)
replace local error literals with shared triples — no logic, no new error text
path; `src/shared/error-triples.ts` scans clean of errno/`E-…-###` tokens
(batch A discipline, DV-64).

## 4. Live checks (this tree, HEAD `47aac56`)

- **0 unpinned `uses:`** — 12 action references across `ci.yml` (6) +
  `release.yml` (6), every one at a full 40-hex SHA.
- **12 `ipcMain.handle` ≡ 12 `assertTrustedSender(event)` first statements**
  (all in `index.ts`; the guard is single-sourced in `ipc-guard.ts`); the
  delta added **no** handle (`-S "ipcMain.handle" empty over
`da44934..HEAD` — the M2-09 "11" was a counting artifact, not a regression).
- **0** `shell:true` / `exec` / `execSync` / `/bin/sh` in `src/`; only
  `spawn` (supervisor) and `execFile` (system-proxy) — both array-form.
- Pushes: 2 channels (`status:changed`, `log:line`) — identical to baseline.
- `surfaceQuitFailure` (`index.ts:814`): `isAppError` gate first (non-triples
  never render), `dialog.showMessageBox` with `title: APP_NAME`,
  `detail: cause + nextStep` from the shared triples — no raw error object,
  no code/errno, no renderer involvement (main-process dialog only).
- New main-side scripts: `build-icon.mjs` (local spawn, no network, not in
  CI), `after-pack-verify.mjs` (offline hashing only); workflows gained the
  mac dual-arch dist args + a fail-closed `≥ 2 dmgs` shell check — no new
  third-party action, no `eval`, no interpolated untrusted input.
- `docs/user/*` + README (M3-09): five hand-written docs, no secrets, no
  key material, no instructions that weaken the security posture (the
  Gatekeeper section explicitly keeps Gatekeeper ON).

## 5. Scope boundary (unchanged, tracked elsewhere)

- **Issue #5** (multi-window push fan-out, broad payload validation,
  throttling) — not built, not regressed; re-verify note lands in M3-13's
  acceptance report per the board.
- BRIEF §3 backlog (RU locale, auto-update, notarization) —
  `docs/product/backlog.md`; notarization would retire the unsigned-Gatekeeper
  flow (S7-3/docs stay valid until then).
- `npm audit` legs and the M2-08 accepted-risk rows — unchanged inputs
  (lockfile untouched), previously dispositioned, not re-opened.

## 6. Gate verdict

**PASS.** No critical/high/medium; the single low (S7-1) was caught by the
empirical release layer, fixed, and pinned inside this milestone; S6-1 is
closed with a now fully-pinned verification chain; every standing invariant
re-holds on the current tree. **M3-12 does not block external
distribution** — remaining DoD gates are the owner's beta cohort (M3-11) and
the acceptance report (M3-13).

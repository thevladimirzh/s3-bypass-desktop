# M2-12 — fresh-machine install-run checklist

Board task: **M2-12** (`docs/plans/m2-packaging.md`) · Owner: **project-manager**
(checklist authored by **QA**) · Prepared: 2026-10-08 · Layer: **L4** — manual
checklist, per the `docs/qa/m2-test-plan.md` status legend (`L4` = manual
checklist / fresh-machine DoD) · Language: English.

**Basis:**

- `docs/plans/m2-packaging.md` row **M2-12**: "install the packaged app → import →
  start → stop; this is also where the Q9-waived M1 desktop manual rows land
  (acceptance §8)".
- **M2 DoD #2** (`docs/plans/milestones.md` §M2): "Fresh-machine install runs the
  MVP loop (import → start → stop) from the packaged app."
- **Q9 waiver** — `docs/qa/acceptance-m1-27.md` §8: "The DoD #1 manual script rows,
  macOS L4 rows (G-03/G-04) and the E2E re-run defer to the M2 fresh-machine DoD"
  → they are executed as §6 below.
- `BRIEF.md` §2 (acceptance baseline), §5 (workflow), §9 (packaging/pin defaults).
- `docs/qa/m2-test-plan.md` §9.2 points at this file; §10/§11 record the run.

**Status: open — venue: VPN-off window.**

**TC family:** the `TC-FM-nn` prefix (fresh-machine) is new here —
**TC-FM-01 … TC-FM-28 (28 rows)**. The family and its counts are declared in
`docs/qa/m2-test-plan.md` (§9.2 pointer; IDs/counts recorded in §10/§11) by the
batch commit that lands this checklist — this file does not edit the test plan.
IDs are never renumbered.

**Evidence convention:** every row is `ID | Step → expectation | Result`. The
Result column ships **empty**; during the run fill it with `observed-GREEN`,
`FAIL — <what was observed>` or `blocked-<reason>` (m2-test-plan legend), plus the
pasted command output, the exact dialog wording or a screenshot reference
(`TC-FM-nn.png`). A row without a Result was **not** executed and must not be
counted in the verdict. Findings never get fixed here — see §7.

**Scope:** macOS-first install run on this dev machine (arm64 `.dmg` from
`npm run dist`). The Linux install leg (AppImage/`.deb`/`.rpm`, M2-07 output) is a
separate run — no Linux desktop exists in this environment
(`acceptance-m1-27.md` G-02), so no Linux claim is made from this checklist.

---

## 1. Preconditions

All P-rows must be satisfied (and their Result filled) before §2 starts.

| #   | Precondition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P1  | **VPN off for the entire run.** The supervisor hardcodes `127.0.0.1:10808` (FR-15 pre-check + FR-21 readiness), and on this dev machine PacketTun holds that port while the VPN is on. The only requirement is that **the VPN is off during this run** — do not kill, reconfigure or otherwise work around it beyond turning it off. If anything else holds the port, record `blocked-venue` on the start/stop rows instead of proceeding.                                                                                                                                                                                                                                                             |        |
| P2  | Port free right before the run: `lsof -nP -iTCP:10808 -sTCP:LISTEN` → empty. Paste output; re-check before TC-FM-12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |        |
| P3  | Built artifact at hand: `release/S3 Bypass Desktop-0.0.1-arm64.dmg` (locally `npm run dist`) or a release-leg DMG from the tag build (M2-07) — record which. Paste observed size and `shasum -a 256 "<dmg>"`; cross-check `release/SHA256SUMS.txt` when present.                                                                                                                                                                                                                                                                                                                                                                                                                                       |        |
| P4  | **Fresh install state.** No pre-existing app and no pre-existing profile store: `ls -d "/Applications/S3 Bypass Desktop.app" "$HOME/Applications/S3 Bypass Desktop.app"` → absent, and `ls "$HOME/Library/Application Support/S3 Bypass Desktop"` shows **no `profile-store.blob`**. Venue options — record which used: (a) clean `~/Applications` copy on an account with no store yet; (b) a dedicated fresh macOS user account; (c) fresh `HOME` via direct binary launch `env HOME=<tmp> "<app>/Contents/MacOS/S3 Bypass Desktop" > <tmp>/app-stdout.log 2>&1 &` (the stdout capture feeds TC-FM-27). **Never delete or move an existing `profile-store.blob`** without the owner's explicit word. |        |
| P5  | **Gatekeeper pre-step:** the installed `.app` must actually carry quarantine, or TC-FM-03 proves nothing: `xattr -p com.apple.quarantine "<app>"` → present. If a locally built DMG copy carries none, set a quarantine flag first and record the exact command. Reference wording: `docs/product/macos-gatekeeper.md` (unsigned build by owner decision 2026-10-08, BRIEF §10).                                                                                                                                                                                                                                                                                                                       |        |
| P6  | **Fixture only:** `tests/fixtures/configs/valid-client-config.json` — synthetic data: inbound `127.0.0.1:10808`, endpoint `https://s3.example.com`, bucket `example-bucket`, canary credentials (`tests/fixtures/secrets/canary.secrets.txt`). No real server credentials and no live S3 endpoint anywhere in this run.                                                                                                                                                                                                                                                                                                                                                                                |        |
| P7  | **Packaged-run semantics acknowledged:** `DISABLE_AUTO_PROXY=1` / `CORE_BINARY_PATH` are honored only when `!app.isPackaged` (`src/main/index.ts`) — so this packaged run performs the **REAL system-proxy apply on Start** (Q1 auto-on-start, acceptance §8) and the **REAL restore on Stop**. The §5 snapshots are therefore mandatory; do not run the loop against a live personal proxy/VPN setup (PRD §7 "Proxy safety").                                                                                                                                                                                                                                                                         |        |
| P8  | Sub-venues reserved for §6: machine sleep (TC-FM-23), logout/restart (TC-FM-24), a second macOS user account (TC-FM-25), and the repo checkout with a free port for the E2E re-run (TC-FM-28) — all inside this same VPN-off window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |        |

---

## 2. Install (TC-FM-01 … TC-FM-05)

| TC ID    | Step → expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| TC-FM-01 | Mount + install: `open "<dmg>"` (or `hdiutil attach`) → drag `S3 Bypass Desktop.app` onto `~/Applications` in the Finder window → eject. Expect: bundle at `~/Applications/S3 Bypass Desktop.app`. Paste `ls -ld` of the installed bundle.                                                                                                                                                                                                                                                                                     |        |
| TC-FM-02 | Unsigned artifact confirmed: `codesign -dv "<app>"` → `Signature=adhoc`, `TeamIdentifier=not set`, **no `Authority=` line**; `spctl --assess --type execute -vv "<app>"` → exit ≠ 0 (Gatekeeper does not accept it). Expect: NO Developer ID identity and NO notarization — correct for this build per the owner decision (BRIEF §10), not a defect. Paste both outputs verbatim.                                                                                                                                              |        |
| TC-FM-03 | First-launch Gatekeeper flow (real UI, per P5): double-click the installed app → macOS blocks it → capture the **exact dialog wording** → right-click → **Open** → confirm Open → the app launches; a second normal double-click now opens without the block. Alternative paths allowed if recorded: System Settings → Privacy & Security → Open Anyway, or `xattr -dr com.apple.quarantine "<app>"` then a normal open (the `xattr -cr` form in `docs/product/macos-gatekeeper.md` is equivalent). State which path was used. |        |
| TC-FM-04 | First-launch result: the app process stays up, **starts hidden to tray** (BRIEF §2.5; M1-27b wiring) — tray icon visible within ~3 s (time it — feeds TC-FM-18); **no** main window at launch (expected), no error dialog, no crash/relaunch loop.                                                                                                                                                                                                                                                                             |        |
| TC-FM-05 | Window reachable: tray → `Show window` → main window opens focused with badge **`Stopped`**, `Start` **disabled** + hint `Import a profile first`, Logs empty, no error block. Screenshot as `TC-FM-05.png`.                                                                                                                                                                                                                                                                                                                   |        |

---

## 3. Bundled core & packaging (TC-FM-06 … TC-FM-08)

| TC ID    | Step → expectation                                                                                                                                                                                                                                                                                                                                                                      | Result |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| TC-FM-06 | Pinned core ships inside the installed bundle (`prepare:core` → electron-builder `extraResources`, M2-04/M2-05): `ls -l "<app>/Contents/Resources/core/darwin/"` → `xray` **executable (0755)** + `geoip.dat` + `geosite.dat` + `LICENSE` + `README.md`. Paste output.                                                                                                                  |        |
| TC-FM-07 | Version pin: `"<app>/Contents/Resources/core/darwin/xray" version` → the first line must contain **`v26.9.9-1.0.1fed`** (pinned release, `docs/analysis/core-pin.md`). Expected first line from the pinned build: `Xray 26.9.9 (Xray, Penetrates Everything.) v26.9.9-1.0.1fed (go1.27.1 darwin/arm64)`. Record the full output; if the pin string is absent, FAIL with the exact text. |        |
| TC-FM-08 | Attributions inside the artifact (M2 DoD #4 cross-check): `ls "<app>/Contents/Resources/licenses/"` → `THIRD-PARTY-NOTICES.md`, `xray-core-fedarisha-LICENSE.txt` (MPL-2.0), `electron-LICENSE.txt`, `react-LICENSE.txt`. Paste output.                                                                                                                                                 |        |

---

## 4. Import (TC-FM-09 … TC-FM-10)

| TC ID    | Step → expectation                                                                                                                                                                                                                                                                              | Result |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| TC-FM-09 | Import the fixture through the app's own flow: `Import profile` → native file picker → `Cmd+Shift+G` → absolute path of `tests/fixtures/configs/valid-client-config.json` → Open. Expect: validation **succeeds** — no error block, no stack trace, import completes.                           |        |
| TC-FM-10 | Stored profile visible: summary shows **`vlt-alpha @ s3.example.com`** (the §8.3 profile summary), `Start` becomes enabled, hint `Import a profile first` gone; **no canary string** from `tests/fixtures/secrets/canary.secrets.txt` visible anywhere on screen. Screenshot as `TC-FM-10.png`. |        |

---

## 5. Start / stop (TC-FM-11 … TC-FM-17)

| TC ID    | Step → expectation                                                                                                                                                                                                                                                                                                                                                                                                             | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| TC-FM-11 | **Baseline capture before Start** (P7 — mandatory): identify the active service (`networksetup -listnetworkserviceorder`, e.g. `Wi-Fi`), then paste all three outputs: `networksetup -getwebproxy "<svc>"`, `networksetup -getsecurewebproxy "<svc>"`, `networksetup -getsocksfirewallproxy "<svc>"` — plus `lsof -nP -iTCP:10808 -sTCP:LISTEN` → empty. This baseline is the reference for TC-FM-14/16/17/22.                 |        |
| TC-FM-12 | Start → Running ≤ 1 s: click `Start` → badge reads **`Running`** within 1 s of the click (AC-02.1 — record the observed delay), `Stop` enabled, no error block. A proxy-apply failure dialog (if any) belongs to TC-FM-14 — capture it there.                                                                                                                                                                                  |        |
| TC-FM-13 | Readiness real: `lsof -nP -iTCP:10808 -sTCP:LISTEN` → exactly one listener on `127.0.0.1:10808` (the bundled core child); `nc -z 127.0.0.1 10808` succeeds (FR-15/FR-21). Paste both outputs.                                                                                                                                                                                                                                  |        |
| TC-FM-14 | **Real system-proxy apply** (packaged run, Q1 auto-on-start): `networksetup -getsocksfirewallproxy "<svc>"` → `Enabled: Yes`, `Server: 127.0.0.1`, `Port: 10808`; `-getwebproxy` / `-getsecurewebproxy` byte-identical to the TC-FM-11 baseline (SOCKS-only apply, FR-31/Q2). If the app surfaced an apply-failure dialog, paste its wording verbatim and mark FAIL with the `E-PLAT`/`E-CORE` code. Paste all getter outputs. |        |
| TC-FM-15 | Logs show the **real** core: Logs view holds ≥1 startup line from the bundled binary (no fake-core `READY` marker — this run is the packaged flip of strategy D-4), no canary string in any log row. Screenshot/log paste as `TC-FM-15.png`.                                                                                                                                                                                   |        |
| TC-FM-16 | Stop → full cleanup: click `Stop` → badge **`Stopped`**; within a few seconds (a) port free (`lsof …10808` empty), (b) all three `networksetup` getters byte-for-byte equal the TC-FM-11 baseline (paste a `diff` — empty), (c) temp core dir gone: `ls -d "$TMPDIR"s3bypass-core-* 2>/dev/null` → no matches (FR-16/FR-23). Paste all three evidences.                                                                        |        |
| TC-FM-17 | Clean quit: tray → `Quit` → the app exits fully — after ~5 s `pgrep -f "S3 Bypass Desktop"` → empty and `pgrep -f "core/darwin/xray"` → empty (no orphan core), port still free, proxy state still equals the TC-FM-11 baseline (FR-42/AC-05.5). Paste outputs.                                                                                                                                                                |        |

---

## 6. Q9-waived M1 desktop manual rows (acceptance-m1-27 §8) — TC-FM-18 … TC-FM-28

These are the rows the owner waived at M1 (§8: "the DoD #1 manual script rows,
macOS L4 rows (G-03/G-04) and the E2E re-run defer to the M2 fresh-machine DoD").
They are executed **on this fresh install**. DoD #1 core-loop clauses not listed
individually here (import, status, logs) are already exercised by §2–§5 of the
same run.

| TC ID    | M1 reference                            | Step → expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Result |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| TC-FM-18 | AC-05.1 (TC-05-01)                      | Launch → **tray icon reachable within 3 s** (measured; the window stays hidden per BRIEF §2.5). Record the measured delay.                                                                                                                                                                                                                                                                                                                                                                                   |        |
| TC-FM-19 | AC-05.3 (TC-05-03)                      | Tray `Show window` restores the window with **no stale values** — badge and profile summary match the live state; repeat once after a start/stop cycle: reopening shows the _current_ state, not the last rendered one.                                                                                                                                                                                                                                                                                      |        |
| TC-FM-20 | AC-06.6 (TC-06-06)                      | Full quit + relaunch → **Logs view empty** (in-memory buffer; Q-05 default: no on-disk log).                                                                                                                                                                                                                                                                                                                                                                                                                 |        |
| TC-FM-21 | AC-07.1 (TC-07-01)                      | Full quit + relaunch → the imported profile is **still listed** (real OS keychain round-trip on a fresh install) and `Start` works without re-importing. If the profile is gone or a re-import is demanded, FAIL with the observed dialog/error.                                                                                                                                                                                                                                                             |        |
| TC-FM-22 | TC-04-14 (AC-04.3, PRD §7)              | Authoritative byte-for-byte round trip: Start (apply) → capture the three `networksetup` getters → Stop (restore) → capture again; the after-set must be **byte-for-byte identical** to the TC-FM-11 baseline — paste the `diff` output (empty). M1 deferred this row; it lands here.                                                                                                                                                                                                                        |        |
| TC-FM-23 | TC-04-08 (US-04 edge)                   | Suspend/resume while running: sleep the machine, wake after ≥1 min. After wake the core may be dead, but the app must stay **truthful** — badge matches the actual listener state (`lsof …10808`), toggle state matches the OS getters, no silent `Running` over a dead port. Record observed badge + `lsof` + getters.                                                                                                                                                                                      |        |
| TC-FM-24 | TC-05-12 (US-05 edge)                   | OS session end while running: log out (or restart) and log back in → **no hung child** — `pgrep -f "S3 Bypass Desktop"` and `pgrep -f "core/darwin/xray"` empty after login, port free, proxy state equals the TC-FM-11 baseline. Paste outputs.                                                                                                                                                                                                                                                             |        |
| TC-FM-25 | TC-07-14 (US-07 edge)                   | Second macOS user account (P8): the profile from the first account is **absent** there (keychain non-portability) — badge `Stopped`, `Start` disabled + hint `Import a profile first` (re-import guidance), and no secret of the first account reachable from the second (record what was observed: store not present / not readable / refuses to decrypt).                                                                                                                                                  |        |
| TC-FM-26 | TC-NFR5-02 (NFR-5 L4)                   | UI accessibility: an error and the status are **copyable text** (select + copy what is shown), status is text not colour-only (`Stopped` / `Running` / `Core crashed`), and Import/Start/Stop plus the tray items are all reachable from the keyboard. Record how each was verified.                                                                                                                                                                                                                         |        |
| TC-FM-27 | TC-NFR2-01 dataDir/stdout halves (G-04) | **After TC-FM-16** (temp dir already deleted): grep the app data dir (`~/Library/Application Support/S3 Bypass Desktop/`, or the fresh HOME's) **and** the captured stdout/stderr file (P4 venue (c)) for every line of `tests/fixtures/secrets/canary.secrets.txt` → **zero matches**: `grep -R -F -f <canaries> "<userdata-dir>" <app-stdout.log>` → no output (exit 1). Paste the command + result. Skip-by-absence is not allowed — if no stdout file exists, state which launch venue produced the run. |        |
| TC-FM-28 | Q9/B-04 (E2E re-run)                    | In this same VPN-off window, from the repo checkout: `npm run test:e2e` → record the result and run count (M1 record: ×3 green + 1 preflight-failure run, DV-31 — the count reconciliation itself is D-07, tracked elsewhere). This complements the CI e2e job landed by M2-07; it is the deferred half of the §8 waiver.                                                                                                                                                                                    |        |

---

## 7. Verdict & issue hand-off

| Item                           | Value                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Rows total (**TC-FM-01..28**)  | 28 (§2 = 5, §3 = 3, §4 = 2, §5 = 7, §6 = 11)                                                                                              |
| Preconditions P1..P8 satisfied | (fill)                                                                                                                                    |
| Executed / `observed-GREEN`    | (fill)                                                                                                                                    |
| `FAIL` rows                    | (fill — ID + what was observed)                                                                                                           |
| `blocked-*` rows               | (fill — reason; never left undocumented)                                                                                                  |
| **Verdict — M2 DoD #2**        | (fill: **PASS** — fresh install ran import → start → stop from the packaged app, with §6 waived rows executed / **FAIL** — blocking list) |
| Executed by / date             | (fill)                                                                                                                                    |
| Machine (macOS version, arch)  | (fill) · venue: VPN-off window                                                                                                            |
| DMG used + SHA-256             | (fill, from P3)                                                                                                                           |

**Leftovers / issues-out:** this checklist only records findings — QA does not
open issues directly. Every `FAIL`/anomaly found here is reported **to the
maintainer for issue filing**, quoting the `TC-FM-nn` row ID and its evidence;
triage of what this run leaves over happens at **M2-13** (board row: acceptance +
leftovers). Any deviation noticed during the run (unexpected venue, changed
precondition, wording mismatch against this document) is reported the same way
and recorded in `docs/qa/m2-test-plan.md` §11 by the batch commit — this file
does not edit the test plan.

**Completion rule:** the verdict may only be **PASS** when every one of the 28
rows carries a Result with its evidence; a row left empty means "not executed"
and DoD #2 stays open.

---

_End of checklist · file: `docs/qa/m2-fresh-machine.md` · status: open — venue:
VPN-off window · layer L4, family TC-FM declared by the batch commit in
`docs/qa/m2-test-plan.md`._

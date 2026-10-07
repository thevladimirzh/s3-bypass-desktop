# Security Review M1-25 — full MVP surface (Phase I gate for external distribution)

Date: 2026-10-07 · Reviewer: `cybersecurity` agent (read-only) · Scope: the whole
current tree at commit `f57273e` (supervisor, system-proxy, window lifecycle/native
wiring, log pipeline, IPC surface, secret store + profile import, renderer, supply
chain, docs consistency) · Predecessors: `docs/qa/security-m0-19.md` (M0 PASS,
issues #2–#6), `docs/qa/security-m1-10.md` (M1 partial PASS, issue #1 filed+fixed).

**Verdict: PASS-with-blockers — 0 critical, 1 high, 6 medium, 9 low, 2 info.**
No critical. Issue #1's sender guard did **NOT** regress (verified live — see §4).
The high (S5-1) and the six mediums (S5-2..S5-7) must be fixed or explicitly
risk-accepted by the owner before the M1-28 gate → M2 handoff.

## 1. Scope & method

- Tree verified clean (`git status` empty; `docs/qa/security-m1-25.md` did not exist).
- Read every source file in `src/` (main: core-supervisor, core-wiring, index,
  ipc-guard, log-collector, profile-validator, secret-store, system-proxy,
  window-lifecycle; shared: constants, ipc, status-machine; preload; renderer
  App.tsx + LogsView + index.html), `package.json`, `package-lock.json`,
  `electron-builder.yml`, `.github/workflows/ci.yml`, `.env.example`, `.gitignore`,
  `BRIEF.md`, `docs/analysis/{errors,data-flows,requirements}.md`, and the two
  predecessor reports. Key behaviors were confirmed against the live tests
  (`tests/unit/*`) and by isolated Node probes of `execFile` error semantics.
- Live `npm audit` run with the mandated cache (`--cache
  /private/var/folders/49/shvp1sp55xn4__vy97b6kpz80000gn/T/opencode/npm-cache`).
- Read-only: no source/test/config change; this file is the only write. No git/gh.

Scope adaptation note: "chat ids / topic titles / `/thread`" belong to the
TG-Threader-Bot template and do not exist here; their analogues (channel/caller
allowance, message-bundle size) were reviewed as: who may invoke the 11 IPC
handlers, profile bundle size (1 MiB), log bundle bounds (2000 lines × 4096 chars).

## 2. Findings

| ID | Sev | Location | Issue | Evidence | Remediation | Deadline |
|----|-----|----------|-------|----------|-------------|----------|
| S5-1 | **high** | `src/main/profile-validator.ts:317-351`; `src/main/core-supervisor.ts:220-241` | BR-V-09 "loopback only" is enforced on the **first** socks inbound only; any ADDITIONAL inbound (second socks on `0.0.0.0`, `dokodemo-door`, `vmess`, …) passes validation and is materialized untouched → a crafted profile opens a non-loopback listener on the victim machine. `data-flows.md:69` also claims `core:start` "re-validate[s] BR-V-10/V-15" at step 0 — no such re-validation exists | validator `for … break` at first `protocol==='socks'`; `mergeLoopbackInbound` pins only `entries.find(…socks)`; fixtures/tests cover only single-inbound configs (`tests/unit/profile-validator.test.ts` TC-01-25/26) | Validate **every** inbound entry: reject any entry that is not a loopback-bound socks inbound (E-VAL-014/E-VAL-010), or strip all non-conforming entries at materialization; add fixtures for "socks + extra inbound" and "second socks on 0.0.0.0" | M1-26 (fix), M1-28 (gate) |
| S5-2 | medium | `src/main/core-supervisor.ts:146-174` (`unexpectedExitError`), `:353-360` (`lastCoreLine`), `:537` | **Redaction bypass via error text**: `E-CORE-001`'s `cause` embeds the **raw, unredacted** last child line and crosses to the renderer through `status:changed`/`status:get` → `App.tsx` `role=alert`. `errors.md:70,74` and `data-flows.md:90,127,293` all require the "**last redacted** core line" and "redaction before anything reaches … `lastError`". A child line quoting the config path (§4.3 denylist: materialized path `T`), an endpoint/credential fragment, or any INTERNAL/SECRET value therefore bypasses the single redaction entry point | `lastCoreLine = text` (raw sink line) → `cause: … ${lastLine}` → `crashError` → `applyEvent('crash', error)` → `broadcastStatus`; log path redacts the same line (`log-collector.ts:83-108`), error path does not | Run the line through the collector's redaction (export a `redact()` and apply before embedding), or drop the line from `cause` and keep only the exit code; add a unit test that a canary line on child exit yields `[REDACTED]`/absent in `lastError` | M1-26 |
| S5-3 | medium | `src/main/window-lifecycle.ts:164-188`; `src/main/core-wiring.ts:175-182`; `src/shared/status-machine.ts:62-68`; `src/main/index.ts:583-603` | **Quit teardown cannot stop a `starting` core** (Stop is only legal from `running`, so `handleStop()` returns E-VAL-015 without killing the child) and does **not await** an in-flight `stopping` stop (the gate rejects, teardown proceeds to `requestQuit`). Result: the child can be orphaned (holds 10808, keeps credentials in memory) and the materialized `T` is never deleted — `data-flows.md:100-102` promises "no orphan, no leftover" on the quit path | `TRANSITIONS.starting` has no `stop` edge; `runTeardown` always reaches `requestQuit`; `cleanupMaterialized()` runs only inside `handleChildExit`, which never executes if main exits first | In teardown, add a supervisor `forceStop()` that terminates the child from any live state (SIGTERM→SIGKILL, then cleanup), and make `handleBeforeQuit` await the in-flight stop promise before `requestQuit`; test quit-during-`starting` and quit-during-`stopping` | M1-26 |
| S5-4 | medium | `src/main/ipc-guard.ts:31-36`; `src/main/index.ts:234-236` (vs. the correctly gated `:271`) | **`ELECTRON_RENDERER_URL` is honored in PACKAGED builds** by (a) the IPC-guard allowlist (`DEV_URL` read unconditionally) and (b) the `will-navigate`/`will-redirect` allowlist. Only `loadURL` checks `!app.isPackaged` (M0 S4-3 fix). An env var in a packaged run can therefore widen the issue-#1 sender guard to an attacker-controlled document and permit navigation to it — the guard's allowlist must never be env-influenced in production | `const DEV_URL = process.env.ELECTRON_RENDERER_URL;` with no `isPackaged` check; navigation `url === devUrl` likewise ungated | Apply the same `!app.isPackaged` gate used at `index.ts:271` to `ipc-guard.ts` (compute the allowed set from the packaged document only when packaged) and to `isAllowedNavigation`; regression test: packaged + env set → guard refuses the env URL | M1-26 |
| S5-5 | medium | `src/main/index.ts:648-653`; `src/main/profile-validator.ts:246-251` | **Size gate runs after the whole file is read**: `readFileSync(path,'utf8')` loads the file fully, then the validator measures `Buffer.byteLength(raw)`. A multi-GB file renamed `.json` synchronously blocks the main process and can OOM it — violating FR-02 "must not freeze" and `data-flows.md:30` ("1. stat(): size > 1 048 576 B → E-VAL-002"), and `requirements.md:101` "checked before read/parse" | code path: dialog → `readFileSync` → `validateClientConfig(raw)` gate 1; no `statSync` anywhere in the import flow | `statSync(path).size > MAX_PROFILE_BYTES` → E-VAL-002 **before** reading; keep the in-memory gate as defense in depth; test with a sparse/huge file | M1-26 |
| S5-6 | medium | `src/main/log-collector.ts:83-92` | **Redaction denylist misses generic credential shapes**: rule 1 only matches `access[-_\s]?key`, `secret[-_\s]?key`, `session[-_\s]?token`, `bucket[-_\s]?password`. Lines carrying `"password"`, `"pass"`, `"clientSecret"`, `"privateKey"`, `"cookie"`, bare value-only lines (e.g. an AKIA-style key id with no field name), double/dot separators (`access..key`, `access__key`) and homoglyph/UTF-8 variants pass **unredacted** into the buffer, the renderer and the clipboard. A **multi-line** config blob split across lines is only partially redacted: lines whose key names miss the rules survive even though one matching line is replaced — BRIEF §2.6 promises logs "never secrets or full configs" | `REDACTION_RULES` regexes; canary fixtures cover only the four §9.3 shapes (`tests/fixtures/secrets/canary.secrets.txt`); no test for multi-line blobs or generic password fields | Broaden the denylist (generic credential key names, `\bpassword\b`, `pass`, `client[_-]?secret`, key-id value shapes), redact on key-name hit for **all** lines of a document-shaped block (e.g. once `"outbounds"`/`{`-block detected, redact the whole burst), and document residual nameless-value risk as accepted; add fixtures | M1-26 |
| S5-7 | medium | `src/renderer/src/components/LogsView.tsx:25-28` | **Renderer log mirror is unbounded and per-line**: every `log:line` push appends (`[...previous, line]`) and is never capped at FR-46's 2000 lines, and main sends one IPC message per line with no batching/throttle. Under a core log flood (loglevel `debug` is allowed by BR-V-13) renderer memory grows without bound and the UI can freeze — exactly the scenario FR-46 ("memory must not grow unbounded … under a log flood", `requirements.md:206,292`) forbids; only `main`'s buffer is capped | `setLines((previous) => [...previous, line])` with no length check; `index.ts:94-102` sends per line | Cap the renderer list at the same 2000 (evict oldest), and/or batch pushes (rAF/interval coalescing); test with a 10 000-line flood | M1-26 |
| S5-8 | low | `src/main/core-supervisor.ts:363-383` | Line reader buffer is unbounded until a newline arrives — a child that emits one huge line (no `\n`) grows `buffer` without limit in the main process (memory DoS; collector's 4096 cap applies only after the line completes) | `buffer += chunk; … buffer.indexOf('\n')` no max length | Cap buffered line length (e.g. 64 KB): flush a forced segment, keep redaction-first | M1-28 |
| S5-9 | low | `src/main/index.ts:235-236` | M1-10 S3-3 residual: `will-navigate`/`will-redirect` still allow **any** `file://` URL. Severity is now low (not medium) because `ipc-guard.ts` refuses IPC from any frame outside the exact app document — preload stays attached but bridge calls fail server-side; no remote navigation possible | `url.startsWith('file://')` | Allow only the exact packaged document URL + exact dev URL (same set as the guard) | M1-28 |
| S5-10 | low | `src/main/system-proxy.ts:150-226,453-494`; `src/main/index.ts:517-520` | Snapshot replay does **not** validate restored values: `Server:`/`Port:` content and gsettings raw values are replayed as-is (format not checked: leading `-`, out-of-range port, non-`manual` mode; `parseGnomeString` strips outer quotes but does not unescape `\'`, so restores can silently differ). Verified: **no argv injection is possible** — `execFile` passes each element verbatim, parsing is line-split (no embedded newlines), and non-numeric `error.code` maps to `-1` fail-closed. Also `SystemProxyContext` never receives `desktopEnv` → GNOME detection would always answer unsupported once wired (`data-flows.md:193` expects `$XDG_CURRENT_DESKTOP`) | `macRestoreSettingCommands` / `buildGnomeRestoreCommands` trust snapshot fields; `systemProxyContext = { platform, run }` only | Validate restored host (`^[A-Za-z0-9._\-:\[\]]+$`), port (1..65535), mode (enum) before replay — else return E-PLAT-003 without running; unescape/strict-match gsettings strings; pass `process.env.XDG_CURRENT_DESKTOP` when wiring `setSystemProxy` | M1-28 (or with US-04 wiring) |
| S5-11 | low | `src/main/index.ts:627-721` | M1-09/10 S4-6 residual: `profile:import-dialog` is not deduped/rate-limited — the renderer's Import button has no disabled state, so a double click opens two native dialogs; every call also decrypts the store (`loadProfile()`). Cheap spam amplification if the renderer is ever compromised; CSP makes that unlikely today | no in-flight flag around `dialog.showOpenDialog`; `App.tsx:240-242` button always enabled | Single-flight guard (ignore/queue while a dialog is open) + disable the button while pending | M1-28 |
| S5-12 | low | `src/main/core-supervisor.ts:523-525` | The core child inherits the **full** `process.env` (documented as the FAKE_CORE_* test contract). The env may contain the user's own secrets (S3 keys exported in a shell, tokens) plus `CORE_BINARY_PATH`/`ELECTRON_RENDERER_URL`; the bundled core does not need them | `spawn(…, { stdio: […] })` — no `env` option | Pass an explicit minimal env (e.g. `{ PATH, HOME, TMPDIR, LANG }` + test seam vars) once tests allow; at minimum strip `CORE_BINARY_PATH`/`ELECTRON_*` from the child env | M1-28 |
| S5-13 | low | `package-lock.json` (electron-builder chain) | Live `npm audit`: **8 moderate** (sprintf-js → roarr → global-agent → @electron/get → app-builder-lib/dmg-builder/electron-builder(+squirrel)) — dev-only packaging chain, not shipped at runtime; M0-19 S4-5 gate "clean audit (or accepted risk note) required for M2 release" is still open | audit output captured in this review; all 8 under devDependencies | Upstream fix or a written accepted-risk note attached to the M2 release checklist; add `npm audit --omit=dev` to CI | M2 exit |
| S5-14 | low | `src/main/index.ts:438-451`; `docs/analysis/errors.md:62` (E-IO-005) | No integrity verification before spawn: the resolved binary path is executed as-is (E-IO-005/NFR-6 SHA-256 pin is explicitly "M2+"). Correctly deferred by plan, but it is a hard blocker for **external distribution**: today any file at the resolved path runs with the profile config and inherited env | `existsSync` only, then `spawn` | Enforce version+SHA-256 pin in M2 (per BRIEF §4) before any public build ships; re-verify at M2 exit gate | M2 exit (blocker) |
| S5-15 | low | `src/main/index.ts:499-510`; `src/main/core-supervisor.ts:442-458,575-589` | Teardown awaits have **no timeout**: a hung `networksetup`/`gsettings` (`execFile` without `timeout`) or a child whose grandchild holds the stdio pipes (the supervisor resolves `stop()` on `close`, deliberately after stdio EOF) can block `handleBeforeQuit` before `requestQuit` — quit hangs with no fallback | `runExecFile` no timeout option; `terminateChild` awaits `exited` unconditionally | Add `timeout` to `execFile` calls; bound `stop()`/teardown with a last-resort timer that proceeds to `requestQuit` (fail-open exit after best-effort kill) | M1-28 |
| S5-16 | low | `docs/analysis/errors.md`, `docs/analysis/data-flows.md` vs code | Doc drift bundle: (a) `E-IO-007` (T-cleanup failure) is unreachable — `cleanupMaterialized()` swallows all `rmSync` errors (`core-supervisor.ts:391-404`); (b) `E-STOR-004` never fires — decrypt failure maps to `E-STOR-003` (`secret-store.ts:155-161`); (c) `E-CORE-004..007` classification absent — everything is `E-CORE-001` (A-16/Q-AN-07 pending, but `data-flows.md:93-95` states it unconditionally); (d) quit-time revert failure → `E-PLAT-003` persisted "shown before exit / persisted as lastError" (`data-flows.md:291`) not implemented — `beginQuit` swallows all teardown failures (`index.ts:585-589`); (e) FR-38 "hidden to tray on launch" not wired — `createWindow` never sets `show:false`/hides (acknowledged in `index-native-wiring.test.ts:82`); (f) `data-flows.md:293` "one `log()` function in main" describes a collector that does not exist under that name/shape | each claim cross-checked against code as cited | Reconcile docs with code (mark codes `[ASSUMPTION]`/M2 or implement); owner decides per item | M1-27 (PM/BA pass) |
| S5-17 | info | `src/main/log-collector.ts:161-168` | `pushApp` is a live but **uncalled** API (no producer in `src/`): app-side events currently never reach the buffer; when first used it will inherit the same denylist limits as S5-6 | grep: `pushApp` only in its own module | When wiring app events, route through `prepareText` (already done) and revisit S5-6 rules first | with next producer |
| S5-18 | info | `electron-builder.yml`; `package.json` | Packaging/supply-chain notes: `asar` not set explicitly (default `true` — recommend pinning explicitly); no `publish` config (auto-update attack surface: none — good); builds unsigned (documented BRIEF §3 backlog + E-PLAT-005); prod deps (react/react-dom) are Vite-bundled — verify at M2 that `node_modules` is not shipped needlessly; the 4 install-script packages (esbuild, fsevents, electron-winstaller, vite's esbuild) are dev-only, registry-resolved with integrity | file contents; lockfile scan: all `resolved` = registry.npmjs.org, 601 integrity hashes | M2 packaging checklist | M2 exit |

## 3. Issue-ready texts (medium+ — file verbatim)

### S5-1 (high) — Profile validation accepts extra inbounds: BR-V-09 loopback-only bypass

**Title:** `[security] Imported profile can open non-loopback listeners — only the first socks inbound is validated`

**Body:**
```
Severity: high (input validation / privilege of the imported config)
Location: src/main/profile-validator.ts:317-351 (BR-V-09 loop), src/main/core-supervisor.ts:220-241 (mergeLoopbackInbound)

Problem:
The validator locates the FIRST inbound with protocol === "socks" (loop breaks at the
first match), checks only that entry's `listen`/`port`, and passes the document through
(BR-V-14 "extra fields ride along"). Any ADDITIONAL inbound entries are neither
validated nor pinned at materialization:

  { "inbounds": [
      { "protocol": "socks", "listen": "127.0.0.1", "port": 10808 },
      { "protocol": "dokodemo-door", "listen": "0.0.0.0", "port": 18080, ... }
  ], ... }

imports cleanly (no E-VAL-010/E-VAL-014) and the core will bind 0.0.0.0:18080 —
exactly the exposure BR-V-09 exists to prevent ("otherwise the proxy would be
exposed"). A second socks inbound on a public interface has the same effect:
the validator's `for ... break` never looks at it and mergeLoopbackInbound pins
only entries.find(first socks).

Additionally, docs/analysis/data-flows.md §2.1 step 0 claims core:start "re-validate[s]
BR-V-10/V-15 (FR-15)" — no start-time re-validation exists in core-wiring.ts /
core-supervisor.ts, so this is the only enforcement point and it is incomplete.

Existing tests/fixtures cover only single-inbound configs (TC-01-25/26).

Fix:
1. In validateClientConfig: iterate ALL inbounds; reject (E-VAL-014, or E-VAL-010 for
   the address half) any entry that is not a socks inbound bound to 127.0.0.1/::1,
   or explicitly strip non-conforming entries during materialization (document which).
2. Pin every socks inbound to loopback in mergeLoopbackInbound, not just the first.
3. Add fixtures: "socks(loopback) + extra inbound 0.0.0.0", "second socks 0.0.0.0",
   "non-record inbound entry".
4. Reconcile data-flows.md §2.1 step 0 with the implemented behavior.

Deadline: fix in M1-26, verified at the M1-28 gate (external-distribution prerequisite).
```

### S5-2 (medium) — Raw child line leaks into lastError (redaction bypass)

**Title:** `[security] E-CORE-001 embeds the raw unredacted child line into renderer-visible lastError`

**Body:**
```
Severity: medium (secret/INTERNAL leakage to renderer; contradicts documented contract)
Location: src/main/core-supervisor.ts:146-174 (unexpectedExitError), 353-360 (lastCoreLine),
          537; consumed via core-wiring broadcast -> src/main/index.ts:69-79 -> App.tsx role=alert

Problem:
The supervisor keeps the RAW last child line (lastCoreLine = text, straight from the log
sink before redaction) and interpolates it into E-CORE-001's `cause`, which crosses IPC
(status:changed / status:get) and is rendered in the UI error block.

Contracts violated:
- errors.md §3: E-CORE-001 cause = "exit code + last REDACTED core line"
- data-flows.md §2.1 step 7 / §2.2: "lastError = exit code + last redacted line"
- data-flows.md §5: redaction applies "before anything reaches the buffer, log:line,
  or lastError (FR-47, NFR-2)"
- data-flows.md §4.3 denylist: the materialized config path T must never cross to the
  renderer. A core failure line such as
  `failed to load config: open /tmp/s3bypass-core-XXXX/core-config.json: permission denied`
  would carry T (and potentially config fragments/INTERNAL values) straight into lastError.
  The same line in the LOG pipeline is redacted (any line containing "/" matches), which
  shows the bypass is the error path only.

Fix (pick one):
a) Export a redact() from log-collector and run lastCoreLine through it before embedding
   (replace with [REDACTED] on rule hit); or
b) Drop the line from `cause` entirely and keep only the exit code/signal; or
c) Include only the collector's already-redacted stored copy of that line.

Add a unit test: child exits with a line containing a §9.3 canary and a /tmp/... path;
assert neither appears in the OperationResult / StatusSnapshot crossing IPC.

Deadline: M1-26.
```

### S5-3 (medium) — Quit during `starting`/`stopping` can orphan the core and leave T behind

**Title:** `[security] Quit teardown does not terminate a `starting` core or await an in-flight stop — orphaned child + undeleted config T`

**Body:**
```
Severity: medium (availability / FR-19, FR-23, FR-42; credentials file left on disk)
Location: src/main/window-lifecycle.ts:164-188 (runTeardown), src/main/core-wiring.ts:175-182
          (handleStop), src/shared/status-machine.ts:62-68 (stop edge only from `running`),
          src/main/index.ts:583-603 (beginQuit/before-quit)

Problem:
The quit teardown always runs stopCore -> restoreProxy -> requestQuit. But stopCore
delegates to the state machine, which accepts `stop` ONLY from `running`:

1) Quit while state == `starting` (up to 10 s window, tray Quit / OS session end are
   always available): supervisor.stop() is rejected with E-VAL-015, no signal is sent,
   teardown proceeds to requestQuit, main exits. The spawned child is NOT detached — it
   is orphaned (reparented, holds 127.0.0.1:10808, keeps the credentials in memory), and
   cleanupMaterialized() never runs: the materialized config T (0600 secret file) stays
   in the temp dir forever.

2) Quit while state == `stopping` (a stop already in flight): the gate rejects, teardown
   does NOT await the in-flight stop; app.quit() can exit main before `close` fires —
   T deletion and the SIGKILL escalation timer may never run.

docs/analysis/data-flows.md §2.1 step 9 promises: "quit path ... no orphan, no leftover
[FR-19, FR-42]"; errors.md §6 recovery matrix requires "child reaped (no zombies),
T deleted" on terminal paths.

Note: quit during `running` is correct (verified), and the double-quit gate itself is
idempotent and sound (teardownSettled + shared teardown promise).

Fix:
- Add a supervisor forceStop()/kill-from-any-state used by teardown: if a child exists
  (state starting/running/stopping), SIGTERM -> 2 s -> SIGKILL, await exit, delete T.
- Make teardown await any in-flight stop before requestQuit.
- Tests: quit during `starting` (child must be dead, T removed), quit during `stopping`.

Deadline: M1-26.
```

### S5-4 (medium) — ELECTRON_RENDERER_URL trusted in packaged builds (IPC guard + navigation)

**Title:** `[security] Packaged builds honor ELECTRON_RENDERER_URL in the IPC-guard allowlist and navigation allowlist`

**Body:**
```
Severity: medium (defense-in-depth of the issue-#1 sender guard)
Location: src/main/ipc-guard.ts:31-36 (DEV_URL -> ALLOWED_SENDER_URLS),
          src/main/index.ts:234-236 (isAllowedNavigation) vs. the correctly gated :271

Problem:
M0-19 S4-3 fixed only the LOAD path:
    if (!app.isPackaged && devUrl) { win.loadURL(devUrl) } else { win.loadFile(...) }

But two other consumers still trust the env var unconditionally:
1) ipc-guard.ts: `const DEV_URL = process.env.ELECTRON_RENDERER_URL;` — included in
   ALLOWED_SENDER_URLS at module load with NO isPackaged check. The sender guard (issue #1)
   is the app's crown-jewel control; its allowlist must not be env-influenceable in a
   packaged run.
2) index.ts will-navigate/will-redirect: `url === devUrl` is allowed regardless of
   packaging, so a packaged window may legally navigate to the env-provided URL with the
   preload attached.

Exploitability today is limited (a renderer-initiated navigation source would also be
needed, and CSP blocks injected script), but this re-opens exactly the bypass class
S3-1/S4-3 were filed for, through the one control meant to make them impossible.

Fix:
- Compute the guard's allowed set from the packaged document alone when app.isPackaged
  (same condition as index.ts:271); only add DEV_URL when !app.isPackaged.
- Gate the devUrl arm of isAllowedNavigation with !app.isPackaged.
- Regression test: harness with isPackaged=true + ELECTRON_RENDERER_URL set →
  assertTrustedSender refuses that URL and will-navigate would prevent it.

Deadline: M1-26.
```

### S5-5 (medium) — Profile size gate runs after fully reading the file

**Title:** `[security] Import reads the whole file before the 1 MiB size gate — freeze/OOM on a huge .json (docs promise stat-before-read)`

**Body:**
```
Severity: medium (DoS / main-process freeze; documented-contract drift)
Location: src/main/index.ts:648-653 (readFileSync), src/main/profile-validator.ts:246-251
          (gate 1 measures the already-read string)

Problem:
The import pipeline is: dialog -> readFileSync(path, 'utf8') -> validateClientConfig(raw)
-> size check. A multi-gigabyte file renamed *.json (or a sparse file) is read entirely
into memory and decoded on the MAIN process synchronously before BR-V-02 can reject it:

- requirements.md FR-02: "rejected before parsing ... The app must not freeze"
- requirements.md BR-V-02: "File size <= 1 048 576 bytes (checked before read/parse)"
- data-flows.md §1: "1. stat(): size > 1 048 576 B -> E-VAL-002   [FR-02, BR-V-02]"

None of the three holds in the implementation: no statSync exists in the import flow.

Fix:
- After a path is picked: statSync(path); if size > MAX_PROFILE_BYTES (or stat fails)
  return E-VAL-002/E-IO-001 WITHOUT reading.
- Keep the existing in-memory gate as defense in depth.
- Test: sparse file (e.g. 1 GB of zeros, cheap to create) named .json → E-VAL-002, and
  the read never happens (spy/stat-first assertion).

Deadline: M1-26.
```

### S5-6 (medium) — Log redaction denylist misses generic credential fields and multi-line blobs

**Title:** `[security] Redaction rules miss common credential shapes (password/clientSecret/nameless values) and only partially redact multi-line config blobs`

**Body:**
```
Severity: medium (secret leakage into logs view / clipboard; BRIEF §2.6 P0 promise)
Location: src/main/log-collector.ts:83-92 (REDACTION_RULES)

Problem:
Redaction is a per-line denylist with four key-name patterns:
  access[-_\s]?key | secret[-_\s]?key | session[-_\s]?token | bucket[-_\s]?password
plus "outbounds", stack/Error, "/", region, bucket, sessions.

Gaps demonstrated against realistic lines (each passes UNREDACTED into the 2000-line
buffer, the renderer, and the "Copy logs" clipboard):

1) Generic credential fields (line contains no "/" and none of the four names):
     "password": "hunter2"
     "pass": "..."
     "clientSecret": "..."      (rule needs secret...key adjacency)
     "privateKey": "..."
     "cookie": "..."
2) Nameless values: a bare access-key-id / token value on its own line (no field name,
   no separators) — e.g. AKIA-style ids and hex/base64 secrets without "/".
3) Separator/case variants the class does not cover: `access..key`, `access__key`,
   `ACCESS  KEY` (two spaces), unicode/homoglyph spellings.
4) MULTI-LINE config blob: redaction replaces only the lines that match. In a
   pretty-printed JSON echo, the `"outbounds"` line and `"accessKey"` lines are replaced,
   but value lines for fields outside the denylist (see 1) survive — the "full config
   never in logs" promise holds only for the specific §9.3 canary shapes.

Verified OK (do not regress): redaction runs BEFORE storage and BEFORE the 4096
truncation (a canary can never straddle the cut); case-insensitive for the four names;
"secretAccessKey" is caught via the accessKey alternative; whole-line replacement
(not substring) for hits.

Fix:
- Add generic credential key names (password, pass, client secret, private key, cookie,
  authorization, signature/signing) and value shapes (AKIA[0-9A-Z]{16}, JWT, long
  base64/hex) to REDACTION_RULES.
- For document-shaped bursts: if any line of an entry matches the document markers,
  redact subsequent lines until the document closes (or simply redact every line of a
  multi-line JSON block).
- Extend tests/unit/log-redaction.test.ts with the four gap classes above.
- Durable fix (follow-up): never emit config-derived values from producers at all
  (source-level suppression), keeping the denylist as defense in depth.

Deadline: M1-26.
```

### S5-7 (medium) — Renderer log list unbounded, per-line IPC push

**Title:** `[security] Renderer log mirror is never capped at 2000 lines and main pushes one IPC message per line — FR-46 log-flood guarantee not met`

**Body:**
```
Severity: medium (DoS/availability of the renderer under log flood)
Location: src/renderer/src/components/LogsView.tsx:25-28; src/main/index.ts:94-102

Problem:
main's buffer is correctly bounded (FR-46: 2000 lines, oldest evicted). The renderer's
mirror is not:

- every `log:line` push does setLines(prev => [...prev, line]) with no cap — during a
  long session or a core log flood (loglevel "debug" is accepted by BR-V-13) the array
  grows without bound (memory) and each append copies the whole array (CPU);
- main sends one webContents.send per line with no batching — a 10k-line burst becomes
  10k IPC round-trips + 10k React renders, freezing the UI.

This contradicts requirements.md FR-46 ("memory must not grow unbounded in a
multi-day session or under a log flood", FR-46/FR-52) — the guarantee was implemented
for the main buffer only, and data-flows.md §2.1 step 6 shows the chain
"bounded buffer (2000 lines) -> push log:line" as if the bound applied end-to-end.

Fix:
- Cap the renderer list at 2000 (drop oldest on append), mirroring main.
- Coalesce pushes (e.g. flush at most every 250 ms / one per animation frame with the
  lines accumulated in between).
- Test: push 10 000 lines through the stub bridge; assert list length <= 2000 and a
  bounded number of renders.

Deadline: M1-26.
```

## 4. Affirmatively-verified checklist (evidence for the M1-28 gate)

**Issue #1 status (checked live in current code, not from old reports): NOT REGRESSED.**
All 11 `ipcMain.handle` callbacks call `assertTrustedSender(event)` as their literal
first statement: `index.ts:617` (app:ping), `:630` (profile:import-dialog), `:727`
(profile:get), `:749` (profile:remove), `:763` (core:start), `:770` (core:stop), `:777`
(status:get), `:784` (logs:get), `:791` (logs:clear), `:800` (proxy:get), `:814`
(proxy:set). Source-scan enforcement exists in `tests/unit/ipc-guard-contract.test.ts`.
The deny-by-default permission handler landed too (`index.ts:833-835`, `callback(false)`).

1. **IPC surface**: exactly 11 handlers ≡ `IPC_INVOKE_CHANNELS` (shared/ipc.ts:23-35);
   no `ipcMain.on`, no extra channels; preload exposes exactly 11 invoke members + 2 push
   subscriptions + static `versions` — 1:1 with the allowlists, no raw `ipcRenderer`
   passthrough, compile-time channel constraint (preload/index.ts:26-42).
2. **Push payloads**: `status:changed` = `StatusSnapshot` (state + AppError triple +
   socksPort), `log:line` = `LogLine {ts,level,source,text}` — **redacted text only, no
   raw field**; no un-allowlisted data crosses to the renderer; §4.3 denylist (accessKey,
   secretKey, `*token*`, full config) holds on every channel (ProfileSummary is
   display-only: hostname/bucket/prefix/region/timestamps).
3. **Issue #6 (CORE_BINARY_PATH)**: honored only when `!app.isPackaged`
   (`index.ts:438-441`); packaged path falls back to `resources/fedarisha-xray-core` —
   env cannot substitute the executable in a package. **Closed as filed.**
4. **Spawn**: `spawn(binaryPath, ['run','-c',T])` — args array, no shell; no `shell:true`,
   no `exec`/`execSync` anywhere in `src/` (grep verified). T built from mkdtemp dir
   (0700) + file written `mode:0o600` AND re-chmod'ed (umask-proof); T path never in
   logs (any line with `/` is redacted), never in E-IO-004/006 or spawn errors; deletion
   runs on materialize-failure, spawn-throw and every child `close`/`error` path
   (residual gaps tracked as S5-3/S5-16).
5. **State machine / races**: start gate re-checked after the port probe; the
   finalGate→materialize→`starting` section is fully synchronous (no await), so two
   concurrent `core:start` invocations cannot double-spawn (single-child guard holds);
   stop only from `running` (verified as the root cause of S5-3, not a spawn hazard).
6. **Readiness/kill**: TCP probe 127.0.0.1:10808 only, 10 s deadline, SIGTERM→2 s→SIGKILL
   with `exitHandled` guards; exit handled exactly once; stop resolves after `close`
   (stdio drained → no zombies per errors.md §6 in the normal path).
7. **System-proxy injection**: `networksetup`/`gsettings` invoked ONLY via the injected
   `execFile` argv arrays — snapshot values travel as single argv elements; parsing is
   line-split so replay content can never become extra argv; hostile prior proxy output
   can cause at worst a fail-closed E-PLAT-002/003 (value-validation residual = S5-10).
   GNOME quote stripping verified; **no shell, no arg splitting — PASS.**
8. **execFile run seam** (`error.code` mapping) — probed empirically on the runtime
   Node: signal-exit → `code:null` → `-1`; maxBuffer → `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`
   (string) → `-1`; spawn failure → `'ENOENT'` → `-1`; only a true success yields `0`.
   A weird exit **cannot** masquerade as success — fail-closed confirmed.
9. **Quit gate (except S5-3/S5-15 edges)**: double quit idempotent (shared teardown
   promise + `teardownSettled` before `app.quit()`); `requestQuit` is attempted even when
   stop/restore throw — no stranded app on teardown failure; `window-all-closed` PR-03
   fix present (stays alive while tray exists; platform default only when tray creation
   failed); close verdict `hide`→`preventDefault`+`hide`, `close` during quit verified.
10. **Secret store**: `isEncryptionAvailable` → refuse (no plaintext fallback) →
    encrypt → write 0600 create+re-assert; fixed filename (no traversal); decrypt/read
    failures → documented E-STOR triples only; store never imported into the renderer
    bridge; `deleteStoredProfile` idempotent.
11. **Profile import**: dialog-owned by main (renderer passes no path — payload `void`);
    validate → confirm-overwrite (cancelId 1: Esc/close = decline, never overwrite) →
    encrypt → save; NUL/UTF-8 rejection before parse; parse errors expose only line/column
    numbers (never parser snippets); error text = documented triples, no stacks anywhere
    in main→renderer payloads.
12. **Prototype pollution**: imported JSON is only ever read via fixed keys
    (`doc['inbounds']`, `storage['sessionsDir']`, …); no `Object.assign`/dynamic-key
    assignment/`for…in` copy from untrusted objects anywhere in `src/` — `__proto__`/
    `constructor` keys remain inert own-properties of `JSON.parse` output. **PASS.**
13. **Renderer injection**: zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new
    Function`/`document.write` in `src/` (grep); all untrusted content (error triples,
    profile-summary fields, log lines) rendered as JSX text (auto-escaped); error blocks
    `role=alert` render title/cause/nextStep only — NFR-5 "no stacks" holds (sources are
    static triples, `asAppError` degrades anything else to a pinned fallback, JSON errors
    contribute only numbers). LogsView copy = visible (redacted) rows only; DOM leaf
    per line, no HTML interpretation.
14. **Window hardening**: `contextIsolation:true`, `nodeIntegration:false`,
    `sandbox:true`, no `webSecurity:false`; strict CSP present in source **and** in the
    current build output (`script-src 'self'`, `object/base-uri/frame-src/form-action
    'none'`, `connect-src 'self'` — dev relaxation dev-gated in electron.vite.config.ts);
    popups denied; external open https-only; deny-all permission handler; navigation
    limited to `file://`+dev URL (residuals S5-4/S5-9).
15. **Log pipeline mechanics**: redaction strictly before store and before the 4096
    truncation (canary cannot straddle the cut — verified in code path
    `prepareText`: redact → length check); buffer bounded 2000 × 4096 (~8 MB max) in
    main; `get()` returns a copy; `clear()` empties; push = post-redaction lines only;
    sink exceptions isolated (`emitLine` try/catch).
16. **Secrets hygiene**: repo-wide scan (AWS/Telegram/GitHub/Slack/PEM/private-key
    patterns) → only the deliberate `EXAMPLE…` canaries and empty `.env.example`
    placeholders; `.env`/`.env.*` gitignored with `!.env.example` exception; `git ls-files`
    shows no `.env`, no `*.log`, no `out/`, no `coverage/`; no `console.*` output in
    `src/`.
17. **Supply chain**: prod deps = react + react-dom only (Electron, Playwright,
    electron-builder are devDeps — correctly excluded from the shipped runtime);
    lockfile: 601 integrity hashes, every `resolved` URL = registry.npmjs.org; the 4
    install-script packages are all dev-only; GH actions SHA-pinned
    (`checkout 11d5960… # v4.4.0`, `setup-node 49933ea… # v4.4.0`) with
    `persist-credentials: false`, `permissions: contents: read`, npm ci, timeout,
    concurrency — no `${{ secrets.* }}`; electron-builder has no `publish` config
    (no auto-update channel); live `npm audit` = 8 moderate, all dev-only (S5-13).
18. **Docs cross-check performed**: errors.md/data-flows.md/requirements.md claims
    mapped to code line-by-line (drift → S5-2, S5-5 evidence, S5-16; aligned claims
    verified where listed above).

## 5. Open questions for the owner

1. **S5-2 choice**: redact-then-embed the last core line, or drop the line from
   `cause`? (errors.md currently promises "[last redacted core line]".)
2. **S5-1 policy**: reject non-conforming inbounds at import (E-VAL-014/E-VAL-010) or
   silently strip them at materialization? Reject is safer; strip matches the
   socks-inbound pinning behavior.
3. **S5-3 policy**: should quit during `starting` wait (≤10 s) for readiness and then
   stop normally, or force-kill immediately? Affects AC-05.5 wording.
4. **S5-6 residual risk**: are nameless-secret values in core output an accepted,
   documented residual (Q-item), or must the core be scrubbed at source first?
5. **S5-13**: owner sign-off needed on an "accepted risk note" for the 8 moderate
   dev-only advisories, or hold M2 for an upstream fix/builder downgrade?
6. **S5-16(d)/(e)**: who owns reconciling the quit-failure `E-PLAT-003` persistence and
   FR-38 hidden-at-launch (known-unwired per test comment) — developer fix or BA doc
   change in M1-27?
7. **S5-10**: pass `XDG_CURRENT_DESKTOP` into `systemProxyContext` now, or only with the
   US-04 set-path wiring (DV-30)?

## 6. Verdict

**PASS-with-blockers** for M1-25 → M1-26. No critical findings; the core trust
boundaries (sender guard, spawn-without-shell, encrypted-at-rest store, CSP/sandbox,
argv-only OS calls, fail-closed executor mapping) verified intact and issue #1 is
**not regressed**.

Blockers for the M1-28 gate (M1 → M2 handoff):
- **S5-1 (high)** must be fixed and covered by fixtures.
- **S5-2 … S5-7 (medium)** must be fixed, or each explicitly risk-accepted in writing
  by the owner (recorded in the M1-28 checklist).
- **S5-13 / S5-14** re-verified at the M2-exit distribution gate (npm audit accepted-risk
  note; SHA-256 binary pinning enforced).

Lows (S5-8 … S5-12, S5-15, S5-16) may ride the M1-26/M1-28 fix rounds; doc drift
(S5-16) belongs to the M1-27 PM/BA reconciliation pass.

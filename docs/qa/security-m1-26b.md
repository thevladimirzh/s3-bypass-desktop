# M1-26b — stale-issue verification (issues #3, #4, #5) + D3 sign-off

Status: complete · Method: read-only code verification against CURRENT `main`
(commits through `d50bcd2`/`e5720e3`), sources: issues #3–#5 bodies (M1-10
`docs/qa/security-m1-10.md`), M1-25 `docs/qa/security-m1-25.md` (freshest map),
M1-26 GREEN diff (D3). Reviewer: orchestrator (agent rate-limited twice; manual
pass — findings below are evidence-line based and re-derivable).

## 1. Issue #3 — navigation allowlist (M1-10 S3-3) — **OPEN (medium)**

Evidence: `src/main/index.ts:271-277`

```ts
const isAllowedNavigation = (url: string): boolean =>
  url.startsWith('file://') || (!app.isPackaged && devUrl !== undefined && url === devUrl);
```

- The `devUrl` arm IS now gated with `!app.isPackaged` (S5-4 fix, issue #10) ✓.
- The blanket `url.startsWith('file://')` remains: any local HTML file may
  navigate the main window and keep the 11-member `s3Bypass` bridge attached.
  This is exactly issue #3's original body; unchanged since M1-10.
- Mitigation (why still medium, not high): the sender guard (issue #1,
  `ipc-guard.ts`, call-time `app.isPackaged` allowlist) rejects IPC from a
  foreign origin, and strict CSP blocks injected script — M1-25's S5-9
  assessment ("low because the guard blocks IPC from foreign frames") holds.
  The residual is defense-in-depth depth: navigation still allowed at all.

**Fix scope (QA RED → dev GREEN):** pin `isAllowedNavigation` to (a) the exact
app document (`join(__dirname, …)` packaged path — read the actual
`loadFile` target in code) and (b) the exact dev URL when `!app.isPackaged`.
Everything else `preventDefault()`, both `will-navigate` and `will-redirect`.
Regression: `file://<other-path>` refused; `file://<exact app doc>` allowed
(if any legitimate in-app navigation needs it — verify `loadFile` usage);
dev URL refused when `isPackaged`.

## 2. Issue #4 — secret-store hardening (M1-10 S4-1/S4-2, deadline M1-12 MISSED) — **OPEN (medium; deadline breach recorded)**

Evidence in `src/main/secret-store.ts` (line numbers current):

| Sub-item            | Status   | Evidence                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S4-1 path try-wrap  | **open** | `storePath()` is a bare `app.getPath` (`:96-98`); called OUTSIDE any try in `loadProfile` (`:143`) and in `storedProfileModifiedAt` (`:187`). A throwing `app.getPath` (pre-ready, exotic profile) escapes as a raw exception — FR-48 edge, contradicts "no raw failure reaches the caller". (`saveProfile`'s call at `:125` IS inside the write try.) |
| S4-2a load size cap | **open** | `loadProfile`: `readFileSync(path)` at `:149-150` with no `statSync` cap — a crafted multi-GB `profile-store.blob` is read whole into the main process (same class as S5-5, which was fixed for the import path only).                                                                                                                                 |
| S4-2b save size cap | **open** | `saveProfile(profileJson)` (`:109`) has no byte cap; no `MAX_*` constant exists in the file. The ≤1 MiB limit lives only in the import validator — a caller bug can encrypt/write unbounded blobs.                                                                                                                                                     |

**Fix scope:** wrap path resolution (all three call sites or inside
`storePath()` itself) → documented `E-STOR-005` (or `E-STOR-001` for the
pre-ready case — pick per errors.md §5 and pin in RED); `statSync` cap
(≤10 MB blob) before read → `E-STOR-003`; defensive `profileJson` cap in
`saveProfile` → documented triple (candidate `E-STOR-005` — pin in RED).
Additive tests in `tests/unit/secret-store.test.ts` only, never weaken the
existing 49+ pins.

## 3. Issue #5 — main-side hardening (M1-10 S4-3/S4-4/S4-6) — **PARTIAL: S4-3 covered, S4-4 blocked on owner, S4-6 open**

| Sub-item                            | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-3 broadcast targeting            | **covered → close-worthy (info)** | `broadcastStatus` (`index.ts:70-80`) now: tray mirror first, then per-window `try/catch` send — a destroyed `webContents` throws and is swallowed, renderer re-fetches `status:get` on mount (`:302`). Single-window architecture (no multi-window feature exists; M1-25's "target the loading webContents before any multi-window" precondition never materialized). Log batch flush uses the identical per-window pattern (`:104-114`). Functionally equal to an `isDestroyed()` guard. |
| S4-4 `proxy:set` payload validation | **blocked on owner Q (DV-30(4))** | Handler still returns the M1-06/07 `E-PLAT-001` placeholder — the real `proxy:set` was deliberately kept out of M1-20/21/23b scope pending the owner's auto-vs-manual system-proxy decision. Validation lands WITH the real handler; cannot be closed or fixed meaningfully before that decision.                                                                                                                                                                                         |
| S4-6 dialog dedupe / throttling     | **open (low-medium)**             | M1-25 independently re-confirmed as **S5-11** ("no dialog dedupe/rate limit (S4-6 open)"). `dialog.showOpenDialog` (`index.ts:692`) has no in-flight guard — repeated `profile:import-dialog` invokes can stack native modals. Decrypt/redact-per-call cost is now bounded (batching, caps), so the remaining scope is dialog dedupe (+ optional expensive-handler throttle).                                                                                                             |

**Disposition:** comment on issue #5 recording S4-3 as verified-covered and
S4-4 as blocked on the owner question; keep the issue open for S4-6 (and S4-4
when unblocked). S4-6 folds into the M1-26b RED batch; S4-4 stays parked with
the other owner questions (PRD §8 Q-block + DV-30(4)).

## 4. D3 review — supervisor FR-15 TOCTOU grace + bounded EADDRINUSE re-spawn — **SIGN OFF (as-is), two advisory items**

Code: `src/main/core-supervisor.ts` — `PORT_RELEASE_GRACE_MS = 3_000`
(`:128`), 25 ms poll (`:131`), re-spawn budget 3 (`:134-136`), EADDRINUSE
evidence capture (`:406-408`), exit path skips the crash emission while
`starting` (`:485-487`), grace wait before E-IO-003 (`:545-590`), re-spawn
reuses the SAME T with no emission (`:623-625`).

- **(a) Abuse / port squatter:** a persistent squatter still loses — after
  ≤3 s grace the probe answers `E-IO-003` and Start is refused (FR-15 intact;
  TC-02-05 green, only delayed within its timeout). Worst case under an active
  bind-fighter: ~3 re-spawns × ≤3 s grace ≈ ≤9-12 s of `starting` before a
  documented failure — a UX/DoS-lite cost for a local attacker (who already
  has local code execution), not a bypass. No state emission during retries →
  no UI inconsistency. **Acceptable.**
- **(b) Exhaustion error semantics:** exhaustion → `E-CORE-001` ("engine
  exited with code …"). Semantically imperfect — the underlying condition is
  "port busy" (`E-IO-003`); the user-facing `nextStep` for E-CORE-001 points
  at logs rather than "free port 10808". **Advisory 1 (low):** consider
  returning `E-IO-003` when the re-spawn budget is exhausted by EADDRINUSE
  evidence specifically; not required for M1-28 — record with the S5-16
  docs-drift bundle if not done sooner.
- **(c) Single-child invariant (FR-18):** re-spawn is strictly sequential —
  it is triggered BY the previous child's `close` (exit already handled,
  child reaped), gated on state `starting`, same materialized T, no parallel
  spawn path (M1-25's "finalGate→materialize fully synchronous" remains).
  Verified by TC-02-12 (exactly one child) under the DV-33 mutex. **No
  double-spawn risk found.**
- **(d) BR-V/FR claims:** FR-15 wording ("refuse Start while the port is
  held") is honored for persistent holders; the grace only converts transient
  release lag into success instead of spurious refusal (which is what made
  CI/parallel runs flaky — DV-29/DV-33 lineage). **Advisory 2 (doc):**
  `data-flows.md` §2.1 step 1 should mention the bounded ≤3 s release grace
  so docs match reality — fold into the S5-16 doc-amendment batch.

**Verdict: D3 signed off as-is.** No follow-up issue required; advisories 1-2
ride the existing S5-16 docs-drift item.

## 5. Summary + gate impact

| Item                       | Verdict                       | Action                            |
| -------------------------- | ----------------------------- | --------------------------------- |
| Issue #3 (nav exact-path)  | OPEN, medium                  | RED → GREEN in M1-26b batch       |
| Issue #4 (store hardening) | OPEN, medium (+deadline miss) | RED → GREEN in M1-26b batch       |
| Issue #5 / S4-3            | covered                       | close-comment evidence ready (§3) |
| Issue #5 / S4-4            | blocked on owner (DV-30(4))   | stays open, parked                |
| Issue #5 / S4-6            | open                          | RED → GREEN in M1-26b batch       |
| D3 (TOCTOU grace)          | **signed off**                | advisories → S5-16 bundle         |

M1-28 gate: issues #3/#4 still block a clean PASS-without-open-M1-10-findings
sign-off; the M1-26b RED/GREEN pair above closes them.

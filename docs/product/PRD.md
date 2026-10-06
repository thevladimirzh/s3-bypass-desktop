# PRD — S3 Bypass Desktop

Status: **active** · Owner: Product Manager · Source: `BRIEF.md` · Language: English

Related: `docs/product/stories/` (US-01..US-07), `docs/product/backlog.md`,
`docs/plans/` (Project Manager — M0/M1 plans exist and this PRD aligns with
them). `docs/analysis/` and `docs/qa/` do not exist yet; they are produced by
Business Analyst (M1-02) and QA (M1-03) after these stories (M1-01).

---

## 1. Problem statement

Users in censoring regions need a working internet path, but direct proxy
connections are detected and blocked. Existing solutions require running a
proxy client whose traffic itself looks suspicious. The _fedarisha_ S3 tunnel
solves this by exchanging traffic as ordinary S3 objects through a bucket that
censorship whitelists as cloud storage — but the reference implementation is an
Android app; **desktop users on macOS and Linux have no client**.

Setting up an Xray-core variant manually requires Go toolchain knowledge, JSON
editing, and OS-level proxy configuration. Users fail at the first error
message because core output is raw, technical, and easy to misread.

## 2. Target users

| Persona                                | Description                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 — Censored individual** (primary) | Needs reliable internet access; non-developer; will paste a config JSON they received from a friend/bot and expect it to just work. Judge of success: "the internet works" within 2 minutes. |
| **P2 — Tech-comfortable volunteer**    | Can read a JSON config, understands what a SOCKS port is, may need logs to debug a broken profile. Judge of success: errors and logs are complete enough to diagnose without a debugger.     |

No enterprise/admin persona in MVP.

## 3. Product principles

1. **One-liner first:** import → Start → internet works. Every UI element must
   serve that loop or be cut.
2. **Honest errors, never stack traces.** Every failure the user can hit has a
   written, human-readable message and a next step (or an explicit "we don't
   know — see logs").
3. **Secrets are never exposed.** S3 keys and full configs never appear in
   logs, never reach the renderer, never sit in plaintext on disk.
4. **Fail closed on proxy changes.** If we change the system proxy, we know how
   to revert it; if we can't revert cleanly, we tell the user exactly what to
   change manually.
5. **Small surface, strict boundary.** `main` owns everything privileged;
   `preload` exposes a minimal `contextBridge` API; `renderer` is UI only.
6. **English-first, i18n-ready.** No hardcoded user-facing strings that would
   block a later Russian locale.

## 4. P0 scope (MVP, milestone M1)

The 7 MVP items from `BRIEF.md §2`. Each maps to exactly one user story.

| #   | Feature             | Story | "Done" means                                                                                                                  |
| --- | ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Profile import      | US-01 | Client-config JSON via file picker, validated with human-readable errors, no raw stack traces.                                |
| 2   | Start / Stop        | US-02 | Spawn/kill the bundled per-platform core binary; local SOCKS inbound on `127.0.0.1:10808`.                                    |
| 3   | Status              | US-03 | `running` / `stopped` / `core-crashed` state always visible; last error readable.                                             |
| 4   | System-proxy toggle | US-04 | macOS via `networksetup`, Linux via GNOME `gsettings`; unsupported desktop → honest "do it manually" hint.                    |
| 5   | Tray                | US-05 | App starts hidden to tray; closing the window keeps it running.                                                               |
| 6   | Logs view           | US-06 | Bounded in-memory buffer; never secrets or full configs.                                                                      |
| 7   | Secret storage      | US-07 | Config and S3 keys at rest encrypted via OS keychain (`safeStorage`); never sent to the renderer; never written in plaintext. |

Scope guard: any feature not in this table is **backlog** (`backlog.md`) until
the owner explicitly promotes it.

M1 execution notes (consistent with `docs/plans/m1-mvp.md`): the core binary in
M1 is a **stub/dev-provided** process — real version/SHA-256 pinning lands in
M2 (US-02 AC-02.4 scope note); tests use fixtures, no real S3 credentials.

## 5. Non-functional requirements

### NFR-1 — Security of S3 credentials

- Credentials and profile configs are stored only through Electron
  `safeStorage` (OS keychain: Keychain on macOS, kwallet/gnome-libsecret on
  Linux). If `safeStorage.isEncryptionAvailable()` is false, the app must
  **refuse to persist** credentials and explain why — no plaintext fallback.
- Credentials exist only in the `main` process. `preload` IPC surface must not
  include any channel that returns secrets to the renderer.
- The core child process receives credentials via its own config file or env
  in a `main`-controlled location with `0600` permissions, deleted on exit;
  the file path is never logged.

### NFR-2 — No secrets in logs

- The log buffer, log file (if any), and any error surfaced in the UI are
  scrubbed: no access keys, secret keys, session tokens, bucket credentials,
  and no full config JSON. Redaction is applied at the single logging entry
  point, not per call site.
- Config values classified as secret (per `docs/analysis/` once published) are
  replaced with `[REDACTED]`.

### NFR-3 — Performance / startup

- App window (or tray) usable within **3 s** of launch on a reference machine
  (no network calls on startup).
- Start/Stop round-trip: core process state reflected in UI within **1 s** of
  the actual process event.
- Log buffer bounded (default **2000 lines**, configurable constant): memory
  must not grow unbounded in a multi-day session.

### NFR-4 — Offline behavior

- With no network, the app launches fully (import, start attempt, logs, tray
  all work).
- A failed start due to unreachable S3 endpoint shows a distinct, readable
  message (not a generic crash) and leaves the app in `stopped` or
  `core-crashed` with `lastError` set.
- Nothing blocks on startup waiting for connectivity.

### NFR-5 — Accessibility of errors

- Every user-visible error: (a) plain-language title, (b) one-sentence cause,
  (c) a concrete next step or an explicit "unknown — check logs".
- Error text is selectable/copyable in the UI.
- State is never conveyed by color alone — status text label always present
  (tray icon, status badge).
- All actions reachable by keyboard (Tab/Enter) in the main window.

### NFR-6 — Platform & packaging (context, mostly M2)

- Targets: `darwin-x64`, `darwin-arm64`, `linux-x64` (arm64 follows in CI).
- Core binary version- and SHA-256-pinned; mismatch → refuse to start with a
  clear supply-chain error message.
- GPL-3.0 obligations preserved for the bundled core.

## 6. Out of scope (MVP)

Explicitly **not** in P0 — see `backlog.md` for prioritization and rationale:
TUN mode · auto-update · Russian locale (English first, i18n-ready) · profile
distribution from a bot / URL import · split tunneling · Windows · macOS
notarization (unsigned build + Gatekeeper instructions until then) ·
S3-provider presets · deep OS integration.

Also out of scope for M1 (they belong to M2/M3): installer packaging, release
CI artifacts, Playwright E2E, beta usability pass.

## 7. Success criteria

| Criterion       | Measure                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core loop works | QA executes US-01→US-07 happy paths on macOS-arm64 and Linux-x64 with zero interpretation needed.                                                |
| Error quality   | 100% of enumerated failure cases in stories show a human-readable message; zero raw stack traces in UI (QA checklist).                           |
| Secret hygiene  | Automated test: after import + start + stop, no credential string appears in log buffer, log file, renderer DOM, or config at rest in plaintext. |
| Startup         | Window/tray ready < 3 s (measured test).                                                                                                         |
| Proxy safety    | Toggling system proxy on and off restores the exact prior settings (QA verifies pre/post state on macOS + GNOME).                                |
| Scope           | Backlog has zero items silently merged into M1 (any P0 change requires owner sign-off).                                                          |

## 8. QUESTIONS — open product decisions for the owner

> Never invented in specs; resolve or explicitly defer each one.

1. **Q-01 — Multiple profiles:** MVP assumes a single active profile (one
   config). Do we need a profile list with switching in P0, or is one profile
   enough? _(BRIEF says "profile import" singular — confirming.)_
2. **Q-02 — Profile editing:** after import, may the user edit the config JSON
   inside the app, or is import file-only (re-import to change)?
3. **Q-03 — SOCKS port:** fixed `127.0.0.1:10808` for MVP (BRIEF §10 says
   "configurable later") — confirm it stays hardcoded in P0, and what happens
   if 10808 is already occupied (error vs. auto-pick next port?).
4. **Q-04 — Autostart:** should the app auto-start at OS login in MVP, or is
   tray-only enough? _(Proposed: backlog P2 — not in MVP.)_
5. **Q-05 — Log persistence:** logs are in-memory only for MVP — confirm no
   on-disk log file is required (affects NFR-2 scope and QA checks).
6. **Q-06 — macOS Gatekeeper wording:** what exact instruction do we show for
   the unsigned build (right-click → Open vs. `xattr -d`)?
7. **Q-07 — Linux DE support matrix:** `gsettings` is GNOME-only — do we claim
   "GNOME officially, others get manual hint" in docs? KDE/plasma support is
   backlog.
8. **Q-08 — Crash restart policy:** when the core crashes, should the app offer
   a one-click "Restart core" or only surface the error? _(Proposed: error +
   manual Start again in P0; auto-restart to backlog.)_
9. **Q-09 — Core binary delivery:** bundled in installer (M2) vs. downloaded
   on first run — devops input needed; affects US-02 edge case "binary
   missing".
10. **Q-10 — Update of pinned core version:** who bumps the version/SHA pin
    and how often? Owner call, documented in `docs/analysis/` later.

---

_Change control: additions to §4 require owner approval and a note in
`backlog.md`; new ideas go to `backlog.md` with a one-line value statement._

# Requirements & business rules — S3 Bypass Desktop (M1 MVP)

Status: **active** · Owner: Business Analyst (task M1-02) · Language: English
Parent: `docs/product/PRD.md` · Stories: `docs/product/stories/US-01..US-07` · Plan: `docs/plans/m1-mvp.md`
Companion documents: `docs/analysis/data-flows.md`, `docs/analysis/errors.md`

---

## 0. Sources and tagging

Every requirement and rule below carries exactly one primary source tag:

| Tag                        | Meaning                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `[BRIEF §n]`               | `BRIEF.md` section n (MVP item list = §2)                                                                          |
| `[US-xx AC-nn.n]`          | User story US-xx, acceptance criterion AC-nn.n                                                                     |
| `[US-xx edge]`             | Edge-case note inside a user story (weaker than an AC — provisional until confirmed)                               |
| `[PRD §n]` / `[PRD NFR-n]` | `docs/product/PRD.md` section / non-functional requirement                                                         |
| `[README-ref]`             | README of the reference project `github.com/SpaceNeuroX/s3-bypass` (client-config JSON schema, fetched 2026-10-07) |
| `[CORE-CONFIG]`            | Shape/semantics of the fedarisha Xray-core config (constants inherited from Xray core config)                      |
| `[PLAN m1-M1-nn]`          | Task in `docs/plans/m1-mvp.md`                                                                                     |
| `[CODE]`                   | Current repository code (`src/shared/ipc.ts`, `src/shared/constants.ts`, `src/main/index.ts`)                      |
| `[ASSUMPTION]`             | Not decided by any source — analysis assumption, listed in §9, reconfirmed in §10                                  |

Error codes referenced by rules are defined in `docs/analysis/errors.md` and are written `E-CLASS-NNN`.

---

## 1. Feature F1 — Profile import (US-01 / BRIEF §2.1)

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                          | Source                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| FR-01 | The "Import profile" action opens the native file-picker **owned by the `main` process** (renderer never reads files). If the user cancels the picker, no error is shown and the previously loaded profile (if any) remains active.                                                                                                                                                  | `[US-01 AC-01.2]` `[PLAN m1-M1-12]`                                |
| FR-02 | Files larger than **1 MiB (1 048 576 bytes)** are rejected **before** parsing with error `E-VAL-002`. Content that is not decodable as UTF-8 or contains NUL bytes (e.g. a `.pdf` renamed to `.json`) is rejected with `E-VAL-003` ("unsupported file"). The app must not freeze and must not log file contents.                                                                     | `[US-01 AC-01.5]`                                                  |
| FR-03 | Syntactically invalid JSON (including a 0-byte file) is rejected with `E-VAL-001`; the message contains the literal phrase **"not valid JSON"** plus the **line and column** of the failure, and contains **no** stack trace and no `SyntaxError` class name. The actionable part of the message is never truncated (BOM, non-ASCII, and one-very-long-line inputs behave the same). | `[US-01 AC-01.3]` `[US-01 edge]`                                   |
| FR-04 | Syntactically valid JSON that does not satisfy the schema (§4) is rejected with the specific validation code (`E-VAL-004..E-VAL-014`); the message **lists the missing/invalid field names in plain language** (example wording from the AC: `"missing: S3 endpoint"`) and contains no stack trace.                                                                                  | `[US-01 AC-01.4]`                                                  |
| FR-05 | On success, the UI shows a profile **summary built from non-secret fields only** (see §5.2 field classification) and clearly indicates which profile is active. No error is shown.                                                                                                                                                                                                   | `[US-01 AC-01.1]` `[US-01 AC-01.7]`                                |
| FR-06 | If the file becomes unreadable between picker and read (deleted / permissions), the user gets `E-IO-001` — "cannot read file, please try again" — and the app does not crash.                                                                                                                                                                                                        | `[US-01 edge]`                                                     |
| FR-07 | Import while the core is **running** is blocked with the message "Stop the tunnel first" (`E-VAL-015`).                                                                                                                                                                                                                                                                              | `[US-01 edge]` (proposed in story, confirm via Q-A) `[ASSUMPTION]` |
| FR-08 | Re-importing a new valid file **replaces** the previous profile **after an explicit confirmation**; the new profile becomes the active one and the UI shows it.                                                                                                                                                                                                                      | `[US-01 AC-01.7]` `[PLAN m1-M1-13]`                                |
| FR-09 | Nothing secret (§5.2) may appear in the Logs view during or after import — redaction rules of F7 apply.                                                                                                                                                                                                                                                                              | `[US-01 AC-01.6]`                                                  |
| FR-10 | The imported profile is persisted through the secret store (F8) and survives an app restart: Start succeeds after restart without re-import.                                                                                                                                                                                                                                         | `[US-07 AC-07.1]`                                                  |

**Not in F1 (backlog):** profile list/multi-profile (PRD Q-01), in-app JSON editing (PRD Q-02), import from URL/bot (BRIEF §3).

---

## 2. Feature F2 — Config validation (business rules for the imported client-config JSON)

Validation runs at **import time** (F1) and the critical subset re-runs at **start time** (BR-V-15). The allowed shape is the fedarisha **client config** documented in `[README-ref]`:

```jsonc
{
  "log": { "loglevel": "info" },
  "inbounds": [
    {
      "tag": "socks-in",
      "listen": "127.0.0.1",
      "port": 10808,
      "protocol": "socks",
      "settings": { "auth": "noauth", "udp": true },
    },
  ],
  "outbounds": [
    {
      "tag": "proxy",
      "protocol": "fedarisha",
      "settings": {
        "storage": {
          "type": "s3",
          "bucket": "…",
          "endpoint": "https://…",
          "region": "…",
          "prefix": "…",
          "sessionsDir": "sessions",
          "accessKey": "…",
          "secretKey": "…",
        },
        "tuning": {
          "idleTimeoutSec": 300,
          "pollIntervalMs": 100,
          "writeIntervalMs": 20,
          "maxFileSizeBytes": 2097152,
        },
      },
    },
    { "tag": "direct", "protocol": "freedom", "settings": {} },
  ],
}
```

### 2.1 Enforcement requirement

- **FR-11** The validator runs on every import; every rejection uses exactly one error code from `docs/analysis/errors.md`, class `E-VAL-*`, rendered with the NFR-5 message pattern (title / cause / next step). Raw exceptions must never reach the UI or the log buffer.

### 2.2 Validation rules (BR-V-01..BR-V-16)

| Rule    | Condition (testable)                                                                                                                                                                                                                                                                                                      | On violation              | Source                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| BR-V-01 | Root value is a JSON **object** (not array/string/number/null).                                                                                                                                                                                                                                                           | `E-VAL-004`               | `[README-ref]` (schema is an object) `[ASSUMPTION]` for the strictness |
| BR-V-02 | File size ≤ **1 048 576 bytes** (checked before read/parse).                                                                                                                                                                                                                                                              | `E-VAL-002`               | `[US-01 AC-01.5]`                                                      |
| BR-V-03 | Content decodes as UTF-8 and contains no `0x00` byte.                                                                                                                                                                                                                                                                     | `E-VAL-003`               | `[US-01 AC-01.5]`                                                      |
| BR-V-04 | `outbounds` is a non-empty array containing **at least one** outbound with `"protocol": "fedarisha"`.                                                                                                                                                                                                                     | `E-VAL-005`               | `[README-ref]`                                                         |
| BR-V-05 | The fedarisha outbound has `settings.storage` as an object with `"type": "s3"`.                                                                                                                                                                                                                                           | `E-VAL-011`               | `[README-ref]`                                                         |
| BR-V-06 | Required `storage` fields, present and non-empty strings: **`bucket`, `endpoint`, `prefix`, `accessKey`, `secretKey`** (missing set is reported verbatim in one message, e.g. `missing: S3 endpoint`). `region` is required **`[ASSUMPTION]`** — the README always shows it, but endpoint-only providers exist (Q-AN-02). | `E-VAL-006`               | `[README-ref]` `[US-01 AC-01.4]`                                       |
| BR-V-07 | `endpoint` parses as an **absolute URL**, scheme `http` or `https`, non-empty host, **no userinfo** (`user:pass@` rejected), no fragment.                                                                                                                                                                                 | `E-VAL-007`               | `[ASSUMPTION]` (uniform across S3 SDKs; Q-AN-02)                       |
| BR-V-08 | `sessionsDir` if present is a **relative** path without `..` (no traversal out of the materialization dir). Absent → default `"sessions"` `[ASSUMPTION]`.                                                                                                                                                                 | `E-VAL-006`               | `[README-ref]` + `[ASSUMPTION]`                                        |
| BR-V-09 | `inbounds`: if present, must be an array; the SOCKS inbound (protocol `"socks"`) must have `listen` equal to a **loopback** address (`127.0.0.1` or `::1`). `0.0.0.0`/`::`/LAN addresses are **rejected** (would expose the proxy).                                                                                       | `E-VAL-014` / `E-VAL-010` | `[README-ref]` + `[ASSUMPTION]` (security hardening)                   |
| BR-V-10 | SOCKS `port` is an integer in **1..65535** and equals **10808** (`DEFAULT_SOCKS_PORT`, `[CODE]`). A different port is rejected with `E-VAL-009` rather than silently overridden `[ASSUMPTION]` — alternatives in Q-AN-05.                                                                                                 | `E-VAL-008` / `E-VAL-009` | `[BRIEF §10]` `[PRD Q-03]` `[CODE]` + `[ASSUMPTION]`                   |
| BR-V-11 | At Start time the port `127.0.0.1:10808` must be free; if occupied, Start **fails** with `E-IO-003` naming the port — the app never silently binds another port `[ASSUMPTION: fail rather than auto-pick, pending Q-03]`.                                                                                                 | `E-IO-003`                | `[US-02 AC-02.5]` `[PRD Q-03]`                                         |
| BR-V-12 | `settings.tuning`, if present, must be integers in range: `idleTimeoutSec` **5..86400**, `pollIntervalMs` **10..60000**, `writeIntervalMs` **1..60000**, `maxFileSizeBytes` **1024..67108864** (1 KiB..64 MiB). Ranges are `[ASSUMPTION]` (Q-AN-04). Absent → core defaults apply.                                        | `E-VAL-012`               | `[README-ref]` (field names) + `[ASSUMPTION]` (ranges)                 |
| BR-V-13 | `log.loglevel`, if present, ∈ {`debug`, `info`, `warning`, `error`, `none`}.                                                                                                                                                                                                                                              | `E-VAL-013`               | `[CORE-CONFIG]` (Xray enum)                                            |
| BR-V-14 | Unknown/extra fields are **preserved and passed through** to the core (forward compatibility with core releases) `[ASSUMPTION]` (Q-AN-03).                                                                                                                                                                                | — (accepted)              | `[ASSUMPTION]`                                                         |
| BR-V-15 | Re-validation at Start: profile exists, store decrypts, BR-V-10/BR-V-11 hold. Any failure blocks spawn with the same codes as at import.                                                                                                                                                                                  | per rule                  | `[ASSUMPTION]` + `[US-02 AC-02.3]`                                     |
| BR-V-16 | Import performs **no network calls**: endpoint reachability is _not_ validated at import (offline-first). An unreachable bucket surfaces only at Start as `E-CORE-004` (distinct message, NFR-4).                                                                                                                         | `E-CORE-004` at start     | `[PRD NFR-4]` `[PRD NFR-3]`                                            |

### 2.3 Tuning parameters — how they surface to the user

- Tuning values (`idleTimeoutSec`, `pollIntervalMs`, `writeIntervalMs`, `maxFileSizeBytes`) are **validated, then passed through untouched**; in M1 they are **not user-editable** (profile editing is PRD Q-02, backlog) `[ASSUMPTION]`.
- They surface to the user only in (a) validation error messages when out of range (`E-VAL-012`), and (b) the read-only profile detail view (non-secret values allowed per §5.2). The UI must never present them as tunable controls in M1.

---

## 3. Feature F3 — Core supervision: Start / Stop (US-02 / BRIEF §2.2)

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR-12 | With no profile imported, the Start control is **disabled** with the hint "Import a profile first".                                                                                                                                                                                                                                                                                                                                                                                                                         | `[US-02 AC-02.3]`                   |
| FR-13 | Start spawns the per-platform bundled core binary as a child of `main`; the button switches to Stop and status reaches `running` **within 1 s** of the actual process event.                                                                                                                                                                                                                                                                                                                                                | `[US-02 AC-02.1]` `[PRD NFR-3]`     |
| FR-14 | Before spawn, `main` verifies the binary **exists**; from M2 it also verifies the **SHA-256** against the pinned value. On failure **nothing spawns** and `E-IO-004`/`E-IO-005` is shown ("core binary check failed — reinstall the app"), no stack trace. M1 enforces the missing-binary half only (scope note in AC-02.4, risk R-1).                                                                                                                                                                                      | `[US-02 AC-02.4]` `[PRD NFR-6]`     |
| FR-15 | If port 10808 is occupied at Start → `E-IO-003` naming port 10808; never a silent different port.                                                                                                                                                                                                                                                                                                                                                                                                                           | `[US-02 AC-02.5]`                   |
| FR-16 | Stop terminates the child: port 10808 is **no longer listening within 2 s**, status returns to `stopped`, and **no orphan process** remains (process table checked by QA).                                                                                                                                                                                                                                                                                                                                                  | `[US-02 AC-02.2]`                   |
| FR-17 | Unexpected core exit → status `core-crashed` within 1 s with **exit code and/or last (redacted) core log line** as `lastError`; no zombies.                                                                                                                                                                                                                                                                                                                                                                                 | `[US-02 AC-02.6]` `[US-03 AC-03.4]` |
| FR-18 | Rapid double-Start → exactly **one** child process (second invocation rejected by the state machine, `stopped→starting` is the only legal start transition).                                                                                                                                                                                                                                                                                                                                                                | `[US-02 AC-02.7]`                   |
| FR-19 | Quit from tray stops the core **before** app exit (no orphan), reverts the system proxy, and deletes the materialized config file.                                                                                                                                                                                                                                                                                                                                                                                          | `[US-02 AC-02.8]` `[US-05 AC-05.5]` |
| FR-20 | Start timeout: if the core does not become ready within **10 s** of spawn, the child is killed, state → `core-crashed`, `lastError` = "core did not become ready" (`E-CORE-002`). Threshold is `[ASSUMPTION]` (proposed in US-02/US-03 edges, Q-AN-06).                                                                                                                                                                                                                                                                     | `[US-02 edge]` `[US-03 edge]`       |
| FR-21 | Readiness ("running") signal = a successful TCP connect to `127.0.0.1:10808` (or process alive + inbound observed), not "process spawned". `[ASSUMPTION]` (Q-AN-06).                                                                                                                                                                                                                                                                                                                                                        | `[ASSUMPTION]`                      |
| FR-22 | Relative path-like values inside the config are never resolved against the user's CWD. `storage.sessionsDir` (the profile's only such value) is the fedarisha session-rendezvous **S3 key prefix**, not a filesystem path — materialization passes it through verbatim (BR-V-08 keeps it relative/traversal-free). Any genuine filesystem path added later must resolve from the `main`-controlled materialization directory, never the user's CWD. _(Amended after the M2-12 fresh-machine diagnosis — issue #23, DV-56.)_ | `[US-02 edge]`                      |
| FR-23 | Config for the core is materialized from the stored profile into a `main`-controlled location with `0600` permissions, deleted on stop/quit; the path is never logged.                                                                                                                                                                                                                                                                                                                                                      | `[PRD NFR-1]` `[US-07 AC-07.5]`     |

---

## 4. Feature F4 — Status (US-03 / BRIEF §2.3)

| ID    | Requirement                                                                                                                                                                                                                                                 | Source                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FR-24 | Current status is always visible in the main window as a **text label** (never color-only) and mirrored in the tray (menu text + tooltip).                                                                                                                  | `[US-03 AC-03.1]` `[PRD NFR-5]`                            |
| FR-25 | Visible states: `running` (core ready), `stopped` (never started or stopped), `core-crashed` (unexpected exit / start timeout). Internal lifecycle additionally has transient `starting` and `stopping` (see `data-flows.md` §2; mapping reported as C-01). | `[US-03 AC-03.2..03.4]` `[PLAN m1-M1-04]`                  |
| FR-26 | Every state transition reaches renderer + tray **within 1 s** of the process event, including when the window is hidden.                                                                                                                                    | `[US-03 AC-03.4, AC-03.7]` `[PRD NFR-3]` `[US-05 AC-05.6]` |
| FR-27 | `lastError` is displayed on screen, **selectable/copyable**, free of stack traces and secrets; on two consecutive crashes it shows the **most recent** error; long text is truncated in-place with full text available (tooltip/copy).                      | `[US-03 AC-03.5]` `[US-03 edge]` `[PRD NFR-5]`             |
| FR-28 | From `core-crashed`, clicking Start performs a full new start sequence (recovery path) — no automatic restart loop in M1 (auto-restart is backlog, PRD Q-08).                                                                                               | `[US-03 AC-03.6]` `[PRD Q-08]`                             |
| FR-29 | Reopening the window after a tray-only crash shows the same state — no stale `running`.                                                                                                                                                                     | `[US-03 edge]` `[US-05 AC-05.3]`                           |

---

## 5. Feature F5 — System-proxy toggle (US-04 / BRIEF §2.4)

### 5.1 Behavior rules

| ID    | Requirement                                                                                                                                                                                                                                                                                                | Source                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| FR-30 | Toggle is **disabled** with hint "Start the tunnel first" whenever status ≠ `running`.                                                                                                                                                                                                                     | `[US-04 AC-04.4]`                            |
| FR-31 | **macOS:** on enable, `main` snapshots current proxy settings for the active network service, then applies SOCKS `127.0.0.1:10808` via `networksetup` (exec with an **argument array — no shell interpolation**). On disable, the snapshot is restored **byte-for-byte** (QA compares pre/post snapshots). | `[US-04 AC-04.1, AC-04.3]` `[PLAN m1-M1-20]` |
| FR-32 | **Linux/GNOME:** same snapshot→apply→restore cycle via `gsettings` (`org.gnome.system.proxy` + `org.gnome.system.proxy.socks`); after enable, `gsettings` reports SOCKS `127.0.0.1:10808` enabled. If the binary exists but the schema is missing → treat as unsupported (FR-33).                          | `[US-04 AC-04.2]` `[US-04 edge]`             |
| FR-33 | **Any other desktop** (KDE without GNOME schema, i3, …): the toggle is replaced by an honest hint `E-PLAT-001` — "not supported on this desktop — set it manually" — including the exact values `127.0.0.1` and `10808`.                                                                                   | `[US-04 AC-04.5]` `[BRIEF §2.4]`             |
| FR-34 | If the OS command exits non-zero: toggle reverts to **Off**, a plain-language `E-PLAT-002` is shown, and **no partial proxy change is left unreported**.                                                                                                                                                   | `[US-04 AC-04.6]`                            |
| FR-35 | On Stop, crash, or app quit while the toggle is On → proxy restored; if restoration fails, a **persistent warning** `E-PLAT-003` with manual reversion instructions is shown — never a silent leftover (fail closed).                                                                                      | `[US-04 AC-04.7]` `[PRD principle 4]`        |
| FR-36 | After suspend/resume with a dead core, toggle and status must not contradict: the toggle reverts or shows the warning (FR-35).                                                                                                                                                                             | `[US-04 edge]`                               |
| FR-37 | Which macOS service wins when several are active, and snapshot-vs-live-tracking when the user edits the OS proxy mid-session → open (Q-B); until decided, apply to the **active** service as reported by `networksetup`, snapshot semantics `[ASSUMPTION]`.                                                | `[US-04 edge]` `[US-04 Q-B]`                 |

### 5.2 Platform rules (macOS vs Linux differences)

| ID    | Rule                                       | macOS                                                                                             | Linux                                                                                                                                                          | Source                         |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| PR-01 | System-proxy mechanism                     | `networksetup` per active service                                                                 | `gsettings` (GNOME schema)                                                                                                                                     | `[BRIEF §2.4]` `[US-04]`       |
| PR-02 | Unsupported desktop fallback               | n/a (networksetup assumed present)                                                                | Non-GNOME → `E-PLAT-001` manual hint; docs claim "GNOME officially" pending Q-07                                                                               | `[US-04 AC-04.5]` `[PRD Q-07]` |
| PR-03 | Window close semantics                     | Hide window, keep process (Electron default on darwin)                                            | **Must be changed**: current scaffold quits on `window-all-closed` for non-darwin (`src/main/index.ts:47-51`) — conflicts with close-to-tray; reported as C-02 | `[US-05 AC-05.2]` `[CODE]`     |
| PR-04 | Secret store backend                       | Keychain                                                                                          | kwallet / gnome-libsecret (may be unavailable → `E-STOR-001`)                                                                                                  | `[PRD NFR-1]` `[US-07]`        |
| PR-05 | Packaging                                  | `.dmg` (unsigned until notarization, Gatekeeper instructions per Q-06)                            | AppImage + `.deb`                                                                                                                                              | `[BRIEF §4]` `[BRIEF §3]`      |
| PR-06 | Core binary targets                        | `darwin-x64`, `darwin-arm64`                                                                      | `linux-x64` (arm64 follows in CI)                                                                                                                              | `[PRD NFR-6]` `[BRIEF §9]`     |
| PR-07 | Unsigned-binary spawn failure (Gatekeeper) | `E-PLAT-005` with Gatekeeper wording (Q-06)                                                       | n/a                                                                                                                                                            | `[US-02 edge]` `[PRD Q-06]`    |
| PR-08 | OS command execution                       | `execFile`/`spawn` with arg arrays, **never** a shell string, on both platforms (injection guard) | same                                                                                                                                                           | `[PLAN m1-M1-20]`              |
| PR-09 | Tray backend unavailable                   | Detect at startup → fall back to normal window + warning (`E-PLAT-004`), pending Q-C              | same                                                                                                                                                           | `[US-05 edge]`                 |

---

## 6. Feature F6 — Tray (US-05 / BRIEF §2.5)

| ID    | Requirement                                                                                                                                        | Source                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR-38 | App is reachable from the tray within **3 s** of launch; the main window shows on launch (owner decision, issue #25); no network calls on startup. | `[US-05 AC-05.1]` `[BRIEF §2.5]` `[PRD NFR-3]` |
| FR-39 | Closing the window hides it; process stays alive; a running core keeps running.                                                                    | `[US-05 AC-05.2]`                              |
| FR-40 | Tray "Open" restores the window in its last known state with correct, non-stale status.                                                            | `[US-05 AC-05.3]`                              |
| FR-41 | Tray menu always contains, as **text**: status (`Running` / `Stopped` / `Core crashed`) plus items **Show window, Start/Stop tunnel, Quit**.       | `[US-05 AC-05.4]` `[PRD NFR-5]`                |
| FR-42 | Tray "Quit" → stop core → revert proxy → delete materialized config → full app exit; no background process remains.                                | `[US-05 AC-05.5]`                              |
| FR-43 | A core crash updates tray text+icon without the window open.                                                                                       | `[US-05 AC-05.6]`                              |
| FR-44 | Single-instance lock: a second launch focuses the existing window `[ASSUMPTION]` (proposed in US-05, pending Q-C).                                 | `[US-05 edge]`                                 |

---

## 7. Feature F7 — Logs view (US-06 / BRIEF §2.6)

| ID    | Requirement                                                                                                                                                                                                                                               | Source                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR-45 | Logs view shows `main`-side lines (core stdout/stderr + app events) **oldest-first with timestamps**, scrollable.                                                                                                                                         | `[US-06 AC-06.1]`               |
| FR-46 | Buffer bounded at **2000 lines** (constant, configurable in code): oldest evicted; memory must not grow unbounded in a multi-day session or under a log flood.                                                                                            | `[US-06 AC-06.2]` `[PRD NFR-3]` |
| FR-47 | Redaction happens at the **single logging entry point** in `main`: any line containing a secret field value (§8.4) is replaced with `[REDACTED]` **before** it reaches the buffer or renderer; verified by automated search over buffer and renderer DOM. | `[US-06 AC-06.3]` `[PRD NFR-2]` |
| FR-48 | No raw stack trace and no full config JSON anywhere in status, dialogs, or logs.                                                                                                                                                                          | `[US-06 AC-06.4]` `[PRD NFR-5]` |
| FR-49 | "Copy logs" puts exactly the visible (redacted) text on the clipboard.                                                                                                                                                                                    | `[US-06 AC-06.5]`               |
| FR-50 | Logs are **in-memory only**; empty after restart (pending Q-05 confirmation `[ASSUMPTION]`).                                                                                                                                                              | `[US-06 AC-06.6]` `[PRD Q-05]`  |
| FR-51 | Auto-scroll only when already at the bottom; scrolled-up view never jumps.                                                                                                                                                                                | `[US-06 AC-06.7]`               |
| FR-52 | A single line > **4 KiB** is redacted first, then truncated with a visible marker; non-UTF-8 bytes → `U+FFFD`; renderer never crashes.                                                                                                                    | `[US-06 edge]`                  |

---

## 8. Feature F8 — Secret storage (US-07 / BRIEF §2.7)

### 8.1 Storage rules

| ID    | Requirement                                                                                                                                                                                                                                                                         | Source                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR-53 | Profile data (including the full config JSON) is persisted **only** via Electron `safeStorage` (Keychain on macOS, kwallet/gnome-libsecret on Linux). If `safeStorage.isEncryptionAvailable()` is false → **refuse to persist** with `E-STOR-001`; **no plaintext fallback, ever**. | `[PRD NFR-1]` `[US-07 AC-07.4]` |
| FR-54 | Grep of the app data directory after import shows **no credential as plaintext** in any file (automated QA check).                                                                                                                                                                  | `[US-07 AC-07.2]`               |
| FR-55 | Secrets exist only in `main`. No IPC channel returns S3 keys or the full config to the renderer; the renderer sees only the redacted summary (FR-05).                                                                                                                               | `[PRD NFR-1]` `[US-07 AC-07.3]` |
| FR-56 | Core credentials/config file: `main`-controlled location outside user-facing paths, `0600`, deleted on stop and on app exit; path never logged.                                                                                                                                     | `[PRD NFR-1]` `[US-07 AC-07.5]` |
| FR-57 | Keychain denied/locked → clear retryable error `E-STOR-002`; never a silent unencrypted write.                                                                                                                                                                                      | `[US-07 edge]`                  |
| FR-58 | Store data migrated to another OS user account → treat profile as absent with re-import guidance (`E-STOR-004` path), no crash.                                                                                                                                                     | `[US-07 edge]`                  |
| FR-59 | Corrupted/tampered/legacy store blob → `E-STOR-003` "profile store is damaged — re-import your config"; no crash, no partial plaintext output.                                                                                                                                      | `[US-07 edge]`                  |
| FR-60 | If profile removal is offered, the keychain-backed entry is **deleted**, not hidden.                                                                                                                                                                                                | `[US-07 AC-07.7]`               |

### 8.2 What exactly is encrypted (open Q in US-07)

**Analysis decision for M1 `[ASSUMPTION]`:** encrypt the **whole profile document** (config JSON + credentials) with `safeStorage`; keep only a small **redacted display summary** (see §8.3) as plaintext metadata. This satisfies AC-07.2/AC-07.3 with the simplest rule and is what US-07's own proposal suggests. Confirmation tracked as Q-AN-08.

### 8.3 Profile summary (the only config shape the renderer may ever receive)

```ts
interface ProfileSummary {
  displayName: string; // derived: bucket + prefix host label, e.g. "vlt-alpha @ endpoint-host"
  endpointHost: string; // hostname only, no scheme/path/userinfo
  bucket: string;
  prefix: string;
  region: string;
  importedAt: string; // ISO-8601
  socksPort: number; // 10808
}
```

### 8.4 Secret-field classification (feeds NFR-2 redaction)

| Class        | Fields                                                                                                                                                | Rule                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **SECRET**   | `outbounds[].settings.storage.accessKey`, `.secretKey`, any field whose name contains `token`/`Token` (e.g. session tokens), the **full config JSON** | Never logged, never sent to renderer, never on disk unencrypted; replaced with `[REDACTED]` at the single log entry point |
| **INTERNAL** | `bucket`, `endpoint`, `prefix`, `region`, `sessionsDir`                                                                                               | Allowed in the UI summary (FR-05/§8.3); **redacted in logs** `[ASSUMPTION]` (they identify the user's infrastructure)     |
| **PUBLIC**   | protocol names, tags, `listen`, `port`, tuning values, `loglevel`                                                                                     | Log/display freely                                                                                                        |

> PRD NFR-2 defers this list to `docs/analysis/` — this table discharges that obligation. Confirmation tracked as Q-AN-09.

---

## 9. Feature F9 — IPC boundary (BRIEF §4, PRD principles 3/5, PLAN M1-02/M1-06)

| ID    | Requirement                                                                                                                                                                         | Source                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR-61 | Renderer may only reach `main` through an **allowlist** of channels declared in `src/shared/ipc.ts`; any non-allowlisted channel invoked from the renderer fails (tested in M1-06). | `[PLAN m1-M1-06]` `[PRD principle 5]` |
| FR-62 | Every channel has a declared direction and payload type in `src/shared/ipc.ts` (full contract in `data-flows.md` §4); no `any` payloads crossing the bridge.                        | `[PLAN m1-M1-02]`                     |
| FR-63 | Status changes and log lines are **pushed** main→renderer (`webContents.send`); the renderer never polls for state that `main` owns.                                                | `[PLAN m1-M1-07]` `[US-03]`           |
| FR-64 | A dedicated test asserts that no channel returns `accessKey`/`secretKey`/full config (denylist test alongside the allowlist test).                                                  | `[US-07 AC-07.3]` `[PLAN m1-M1-06]`   |

---

## 10. Non-functional requirements — restated to bind development

These are mandatory restatements of `PRD §5`; each line is directly testable.

### NFR-1 — Security of S3 credentials

- Credentials and profile documents are written to disk **only** as `safeStorage`-encrypted blobs; if `safeStorage.isEncryptionAvailable()` is false the app refuses persistence and shows `E-STOR-001` (FR-53).
- Secrets live exclusively in `main`; IPC denylist test proves no channel returns them (FR-55, FR-64).
- The core child reads credentials from a `0600` file in a `main`-controlled directory, deleted on stop/exit; the path never appears in logs (FR-56, FR-23).

### NFR-2 — No secrets in logs

- Redaction is implemented **once**, at the logging entry point in `main` — not per call site (FR-47).
- Forbidden in log buffer, any log file, and any UI error: access keys, secret keys, session tokens, bucket credentials (INTERNAL per §8.4), full config JSON.
- Automated test: after import + start + stop, grep for each credential string over buffer, on-disk files, and renderer DOM returns zero hits (PRD §7 "Secret hygiene").

### NFR-3 — Performance / startup

- Window **or tray** usable within **3 s** of launch on the reference machine; zero network calls during startup (FR-38).
- Start/Stop: core state reflected in UI within **1 s** of the real process event; Stop frees port 10808 within **2 s** (FR-13, FR-16, FR-26).
- Log buffer bounded at **2000 lines**; a 10 000-line flood must not grow memory beyond the bound or freeze the UI (FR-46, FR-52).

### NFR-4 — Offline behavior

- With no network the app launches fully: import, Start _attempt_, logs, tray all work; nothing blocks on startup waiting for connectivity (BR-V-16).
- A Start failing because the S3 endpoint is unreachable shows the **distinct** message `E-CORE-004` (not a generic crash) and leaves status `stopped` or `core-crashed` with `lastError` set (FR-17, `errors.md`).

### NFR-5 — Accessibility of errors

- Every user-visible error = (a) plain-language title, (b) one-sentence cause, (c) concrete next step **or** explicit "unknown — check logs" (all templates in `errors.md`).
- Error text selectable/copyable (FR-27, FR-49); state always has a text label, never color-only (FR-24, FR-41); all main-window actions keyboard-reachable (Tab/Enter).

### NFR-6 — Platform & packaging (binding now, enforced M2)

- Targets `darwin-x64`, `darwin-arm64`, `linux-x64`; other platforms fail fast with `E-PLAT-006` (PR-06).
- Core binary version- and SHA-256-pinned; mismatch → refuse to start with `E-IO-005`, clear supply-chain message (FR-14). M1 ships the missing-binary half only (AC-02.4 scope note).
- License obligations preserved for the bundled core — MPL-2.0
  (documentation/package-level, verified at M2).

---

## 11. Traceability matrix (requirement → source → test)

QA test IDs do not exist yet (`docs/qa/` is written in M1-03, _after_ this document); the last column therefore points at the **RED task** in `docs/plans/m1-mvp.md` that owns the failing tests for each requirement. QA must expand this column with test-case IDs in the M1-03 test strategy.

| Requirement                              | Source                                       | Planned test task                                                                                                              |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| FR-01                                    | US-01 AC-01.2                                | M1-11 / M1-12                                                                                                                  |
| FR-02, BR-V-02, BR-V-03                  | US-01 AC-01.5                                | M1-11                                                                                                                          |
| FR-03                                    | US-01 AC-01.3 + edge                         | M1-11                                                                                                                          |
| FR-04 + BR-V-01, BR-V-04..BR-V-14        | US-01 AC-01.4, README-ref                    | M1-11                                                                                                                          |
| FR-05, FR-08                             | US-01 AC-01.1/01.7, M1-13                    | M1-11, M1-13 (no RED listed — covered by M1-11 validator + M1-24 E2E)                                                          |
| FR-06                                    | US-01 edge                                   | M1-11                                                                                                                          |
| FR-07                                    | US-01 edge `[ASSUMPTION]`                    | M1-11                                                                                                                          |
| FR-09, FR-47..FR-48, FR-52, §8.4         | US-01 AC-01.6, US-06 AC-06.3/06.4, PRD NFR-2 | M1-18                                                                                                                          |
| FR-10, FR-53..FR-60                      | US-07 AC-07.1..07.7, PRD NFR-1               | M1-08                                                                                                                          |
| FR-11                                    | US-01 AC-01.3/01.4, PRD principle 2          | M1-11                                                                                                                          |
| FR-12                                    | US-02 AC-02.3                                | M1-16                                                                                                                          |
| FR-13, FR-16, FR-18, FR-19, FR-22, FR-23 | US-02 AC-02.1/02.2/02.7/02.8, PRD NFR-1      | M1-14                                                                                                                          |
| FR-14                                    | US-02 AC-02.4, PRD NFR-6                     | M1-14 (missing-binary); SHA half re-tested M2                                                                                  |
| FR-15, BR-V-11                           | US-02 AC-02.5, PRD Q-03                      | M1-14                                                                                                                          |
| FR-17, FR-20, FR-21                      | US-02 AC-02.6, US-03 AC-03.4, edges          | M1-14                                                                                                                          |
| BR-V-10                                  | BRIEF §10, PRD Q-03 `[ASSUMPTION]`           | M1-11                                                                                                                          |
| BR-V-15, BR-V-16                         | `[ASSUMPTION]`, PRD NFR-4                    | M1-14 (start path), M1-11                                                                                                      |
| FR-24..FR-29                             | US-03 AC-03.1..03.7                          | M1-04 (state machine), M1-16 (exposure)                                                                                        |
| FR-30..FR-37, PR-01, PR-02               | US-04 AC-04.1..04.7                          | M1-20                                                                                                                          |
| PR-03                                    | US-05 AC-05.2 vs `src/main/index.ts` (C-02)  | M1-22                                                                                                                          |
| PR-04, PR-05, PR-06, PR-07, PR-09        | PRD NFR-1/NFR-6, BRIEF §4                    | M1-08 (PR-04), M2 tasks (PR-05/06/07), M1-22 (PR-09)                                                                           |
| PR-08                                    | M1-20                                        | M1-20                                                                                                                          |
| FR-38..FR-44                             | US-05 AC-05.1..05.6                          | M1-22                                                                                                                          |
| FR-45, FR-46, FR-49..FR-51               | US-06 AC-06.1/06.2/06.5/06.6/06.7            | M1-18                                                                                                                          |
| FR-61..FR-64                             | PRD principles 3/5, M1-06/M1-07              | M1-06                                                                                                                          |
| NFR-1..NFR-6                             | PRD §5                                       | M1-08 (NFR-1), M1-18 (NFR-2), M1-14 + M1-22 + measurement test (NFR-3), M1-14 (NFR-4), M1-11/M1-16 (NFR-5), M1-14 + M2 (NFR-6) |

---

## 12. Assumptions register (all `[ASSUMPTION]` items)

| ID   | Assumption                                                                                         | Impacted FR/BR                     | Confirm by              |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| A-01 | Import is blocked while the core runs ("Stop the tunnel first").                                   | FR-07                              | Q-A                     |
| A-02 | "Unsupported file" (vs "not valid JSON") is detected by size → UTF-8/NUL sniff → parse order.      | FR-02                              | QA M1-11 wording review |
| A-03 | `region` is a required storage field.                                                              | BR-V-06                            | Q-AN-02                 |
| A-04 | `sessionsDir` optional, defaults to `"sessions"`, must be traversal-free.                          | BR-V-08                            | Q-AN-02                 |
| A-05 | `endpoint` must be http(s), host present, no userinfo.                                             | BR-V-07                            | Q-AN-02                 |
| A-06 | Config with SOCKS port ≠ 10808 is **rejected**, not overridden.                                    | BR-V-10                            | Q-AN-05 / Q-03          |
| A-07 | Occupied port 10808 → fail (never silent auto-pick).                                               | BR-V-11                            | Q-03                    |
| A-08 | Tuning ranges as in BR-V-12.                                                                       | BR-V-12                            | Q-AN-04                 |
| A-09 | Unknown config fields pass through untouched.                                                      | BR-V-14                            | Q-AN-03                 |
| A-10 | Critical rules re-validated at every Start.                                                        | BR-V-15                            | analysis sign-off       |
| A-11 | Start timeout = 10 s → `E-CORE-002`.                                                               | FR-20                              | Q-AN-06                 |
| A-12 | "Running" = TCP readiness of 127.0.0.1:10808.                                                      | FR-21                              | Q-AN-06                 |
| A-13 | Exit observed during `stopping` (requested stop) → `stopped` regardless of exit code.              | data-flows §2                      | QA M1-14                |
| A-14 | UI shows 3 visible states; `starting`/`stopping` render as busy/transition text on the same badge. | FR-25                              | C-01 resolution         |
| A-15 | INTERNAL fields redacted in logs, allowed in UI summary.                                           | §8.4                               | Q-AN-09                 |
| A-16 | S3-unreachable / key-rejected / clock-skew are detected from core output patterns.                 | FR-17, errors.md `E-CORE-004..006` | Q-AN-07                 |
| A-17 | Single-instance lock with focus of existing window.                                                | FR-44                              | Q-C                     |
| A-18 | Logs in-memory only, empty after restart.                                                          | FR-50                              | Q-05                    |
| A-19 | Buffer bound 2000 lines as a code constant (not a user setting).                                   | FR-46                              | Q-05/US-06 open Q       |
| A-20 | Whole profile document is `safeStorage`-encrypted; only §8.3 summary is plaintext.                 | §8.2                               | Q-AN-08                 |
| A-21 | Profile detail view is read-only in M1 (no JSON editing).                                          | §2.3                               | Q-02                    |

---

## 13. Contradictions between sources (reported, not resolved)

- **C-01 — State count.** `US-03` says the indicator has "exactly three states" (`running` / `stopped` / `core-crashed`), while `docs/plans/m1-mvp.md` M1-04 defines a **five-state** machine (`stopped → starting → running → stopped`, `starting/running → core-crashed`) and this brief asks for `stopping` too. Reconciliation proposal (A-14): five internal states, three visible labels + transient busy text. Needs PM confirmation — not silently resolved.
- **C-02 — Close-to-tray on Linux.** `US-05 AC-05.2` requires close → keep running on **both** platforms, but the M0 scaffold quits when all windows close on non-darwin (`src/main/index.ts:47-51`). Code contradicts requirement; M1-22/M1-23 must change it. (Reported, not fixed here — analyst does not touch code.)
- **C-03 — Who owns the SOCKS inbound.** `[README-ref]` client configs embed their own `inbounds` entry (with a port); `BRIEF §2.2` makes `127.0.0.1:10808` an **app guarantee**. If an imported config declares another port, sources do not say whether the app rejects (BR-V-10/A-06) or overrides. Pending Q-AN-05 / Q-03.
- **C-04 — SHA-256 pinning timing (reported & explicitly reconciled by the source).** `US-02 AC-02.4` demands integrity check at Start, but M1 has no pinned binary (risk R-1, M2 scope). The story itself scopes AC-02.4: M1 = missing-binary half, M2 = hash half. Recorded so QA does not "fix" the gap by weakening the test.

---

## 14. Open questions (undecided — do not implement past these)

### Carried from product (owner)

- **Q-01** single profile vs profile list (PRD) — affects FR-05/FR-08, A-20 summary uniqueness.
- **Q-02** in-app profile editing (PRD) — affects §2.3 tuning surfacing (A-21).
- **Q-03** occupied port 10808: fail vs auto-pick (PRD; AC-02.5) — affects BR-V-11/A-07.
- **Q-05** on-disk log file or memory-only (PRD; US-06) — affects FR-50/A-18, NFR-2 scope.
- **Q-06** exact Gatekeeper wording for unsigned builds (PRD) — affects PR-07/`E-PLAT-005`.
- **Q-07** claim GNOME-only proxy support in docs? (PRD; US-04) — affects PR-02.
- **Q-08** crash: one-click restart vs manual Start (PRD; US-03) — affects FR-28 (currently manual).
- **Q-09** core binary bundled vs downloaded on first run (PRD; US-02) — affects `E-IO-004` wording.
- **Q-10** who bumps the core version/SHA pin (PRD) — affects FR-14/NFR-6 (documented here later per PRD).
- **Q-A** (US-01) profile list? editing? credentials embedded in JSON vs entered in-app — affects FR-07/A-01 and whether `accessKey/secretKey` absence is fatal (BR-V-06).
- **Q-B** (US-04) macOS multi-service selection; snapshot vs live tracking — affects FR-37.
- **Q-C** (US-05) RESOLVED 2026-10-08 (issue #25): hidden-to-tray every launch vs first run → the main window shows on launch (FR-38 amended); still open: single-instance; crash icon set — affects FR-38/FR-44/PR-09.

### Raised by this analysis (owner/devops input)

- **Q-AN-01** Config **versioning against the core**: the `[README-ref]` client config has no version field. How do we detect a config written for a newer/different fedarisha-core release? (Reject unknown shapes? Pin "config schema rev" to the core release SHA?)
- **Q-AN-02** Required-field set for storage: is `region` mandatory (A-03)? Are `prefix` and `sessionsDir` mandatory/optional (A-04)? Endpoint-only S3 providers?
- **Q-AN-03** Unknown-field policy: pass through (A-09) vs strict reject?
- **Q-AN-04** Tuning ranges and defaults: confirm BR-V-12 numbers; who owns them — core release notes or app?
- **Q-AN-05** Imported config declares a SOCKS port ≠ 10808: reject (A-06) or override with the app's inbound?
- **Q-AN-06** Start-timeout threshold (10 s?) and the exact readiness signal for `running` (A-11/A-12).
- **Q-AN-07** Detection of bucket-unreachable / keys-revoked / clock-skew from core output: exact core log patterns to match (needed for `E-CORE-004..006`); fedarisha-core README/log samples required from devops.
- **Q-AN-08** Encryption scope of the store (whole document vs credentials subset) — A-20.
- **Q-AN-09** Confirm §8.4 classification, especially INTERNAL redaction in logs (bucket/endpoint/prefix/region).
- **Q-AN-10** Does M1 need `profile:remove` (FR-60/AC-07.7 "if offered")? Story is conditional — decide in or out of MVP.

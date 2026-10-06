# Error taxonomy — S3 Bypass Desktop (M1 MVP)

Status: **active** · Owner: Business Analyst (task M1-02) · Language: English
Companions: `docs/analysis/requirements.md` (FR/BR IDs), `docs/analysis/data-flows.md` (where each error fires)

## 0. Message contract (binds every entry below)

Every user-visible error is rendered as the **NFR-5 triple** (`PRD §5 NFR-5`), carried across IPC as `AppError { code, title, cause, nextStep }` (`data-flows.md` §4.2):

1. **Title** — plain language, ≤ 60 chars, no jargon, no error codes in the title.
2. **Cause** — exactly one sentence, states what happened; may interpolate concrete facts (line/column, field names, port number, exit code).
3. **Next step** — a concrete action the user can take, **or** the explicit phrase "We don't know why — check the Logs view." when no action is derivable.

Global rules (tested per PRD §7 "Error quality"):

- **No stack traces, no exception class names** (`SyntaxError`, `ENOENT`, …) ever reach UI, logs shown to the user, or `lastError` (FR-48, AC-01.3).
- Error text is **selectable/copyable** in the UI (NFR-5, FR-27).
- `code` is internal (for logs/tests); it is never part of the user-facing title. Codes follow `E-<CLASS>-<NNN>`; class ∈ {`VAL`, `IO`, `CORE`, `PLAT`, `STOR`}.
- **Recoverable in-place** = the user can retry the same action without restarting the app or reconfiguring the OS. `partial` = retryable after an external fix (file edit, OS setting).

---

## 1. Class `E-VAL-*` — Validation errors (import / pre-start)

Source: US-01, BR-V-01..BR-V-16. Fired **before** any data is persisted or any process spawned. All are user-input problems: message must name the field/line and never the code path.

| Code        | Title                                | Cause (pattern)                                                                          | Next step                                                                                      | In-place? | FR/BR             |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- | ----------------- |
| `E-VAL-001` | This file is not a valid profile     | The file is not valid JSON — syntax error at **line L, column C**.                       | Fix the file at that position or get a fresh config, then import again.                        | Yes       | FR-03, BR-V-01    |
| `E-VAL-002` | Profile file too large               | The selected file is **X MiB**; profiles must be under 1 MiB.                            | Pick the actual profile JSON — this file is probably something else.                           | Yes       | FR-02, BR-V-02    |
| `E-VAL-003` | Unsupported file type                | The file content is not readable text (binary data).                                     | Choose a `.json` profile exported from your provider or bot.                                   | Yes       | FR-02, BR-V-03    |
| `E-VAL-004` | This is not a profile config         | The top level of the file must be a JSON object `{ … }`.                                 | Re-export the profile as a JSON object and import again.                                       | Yes       | BR-V-01           |
| `E-VAL-005` | No fedarisha connection found        | The config contains no outbound with protocol `fedarisha`.                               | Import a client config issued for the S3 tunnel, not a server config.                          | Yes       | BR-V-04           |
| `E-VAL-006` | Profile is missing required settings | The config is missing or has empty: **[list, e.g. "S3 endpoint", "access key"]**.        | Ask your provider for a complete config, fill in the listed fields, re-import.                 | Yes       | FR-04, BR-V-06/08 |
| `E-VAL-007` | Invalid S3 endpoint                  | The endpoint is not a valid `http(s)://` URL (found: **[value]**).                       | Correct the endpoint to a full URL like `https://s3.example.com` and re-import.                | Yes       | BR-V-07           |
| `E-VAL-008` | Invalid SOCKS port                   | The inbound port **[value]** is not a number between 1 and 65535.                        | Use port `10808` (the app's fixed local port) and re-import.                                   | Yes       | BR-V-10           |
| `E-VAL-009` | Unsupported SOCKS port               | The config requests port **[value]** but the app runs the tunnel on **10808**.           | Re-export the config for port 10808 (see Open question Q-AN-05 — rule may change to override). | Yes       | BR-V-10, C-03     |
| `E-VAL-010` | Unsafe listen address                | The proxy inbound listens on **[value]**; it must listen on loopback only (`127.0.0.1`). | Set `listen` to `127.0.0.1` and re-import.                                                     | Yes       | BR-V-09           |
| `E-VAL-011` | Invalid storage settings             | `settings.storage` must be an object with `type` = `s3`.                                 | Re-export the profile; if it's a custom config, set `storage.type` to `s3`.                    | Yes       | BR-V-05           |
| `E-VAL-012` | Invalid tuning value                 | **[field]** must be a whole number between **[min]** and **[max]** (found **[value]**).  | Fix the value in the config or remove the `tuning` block to use defaults; re-import.           | Yes       | BR-V-12           |
| `E-VAL-013` | Invalid log level                    | `log.loglevel` must be one of `debug`, `info`, `warning`, `error`, `none`.               | Correct the value or remove the `log` block; re-import.                                        | Yes       | BR-V-13           |
| `E-VAL-014` | Invalid inbound settings             | The `inbounds` entry must be a `socks` listener object.                                  | Re-export the profile; the app only supports a local SOCKS inbound.                            | Yes       | BR-V-09           |
| `E-VAL-015` | Stop the tunnel first                | A profile can only be changed while the tunnel is stopped.                               | Click Stop, then import the new profile. `[ASSUMPTION A-01]`                                   | Yes       | FR-07             |

Notes:

- FR-04 requires **all** missing fields in one message (single `E-VAL-006` with a list), not one dialog per field.
- Picker cancel is **not an error** (FR-01): no `AppError` is produced.

---

## 2. Class `E-IO-*` — I/O errors (files, port, binary)

Source: US-01/US-02 edges, BR-V-11, NFR-6. Cause may name OS facts (permissions, port) but never an errno/stack.

| Code       | Title                               | Cause (pattern)                                                                           | Next step                                                                                                                                                                | In-place?      | FR                                     |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------- |
| `E-IO-001` | Could not read the profile file     | The file could not be read — it may have been moved, deleted, or its permissions changed. | Check the file still exists, then import again.                                                                                                                          | Yes            | FR-06                                  |
| `E-IO-002` | File dialog could not open          | The system file dialog failed to open.                                                    | Try again; if it repeats, restart the app.                                                                                                                               | Yes            | FR-01 `[ASSUMPTION]` (defensive entry) |
| `E-IO-003` | Local port 10808 is busy            | Another program is already using `127.0.0.1:10808`.                                       | Quit that program, then click Start. (Never auto-picks another port — BR-V-11, pending Q-03.)                                                                            | Yes            | FR-15                                  |
| `E-IO-004` | Core binary check failed            | The tunnel engine (Xray-core) was not found in the app installation.                      | Reinstall the app.                                                                                                                                                       | No (reinstall) | FR-14, AC-02.4                         |
| `E-IO-005` | Core binary check failed            | The tunnel engine failed its integrity (SHA-256) check against the pinned version.        | Reinstall the app from the official source; do not run a modified binary. _(M2+ enforcement; M1 shows the same wording per AC-02.4.)_                                    | No (reinstall) | FR-14, NFR-6                           |
| `E-IO-006` | Could not prepare the tunnel config | The temporary config file could not be written to the app's private directory.            | Free disk space / check permissions, then Start again.                                                                                                                   | Yes            | FR-23 `[ASSUMPTION]` (defensive entry) |
| `E-IO-007` | Could not clean up the config file  | The temporary config file could not be deleted on exit.                                   | Nothing dangerous remains readable **only if**… → next step: delete the reported directory manually; the file is `0600` and encrypted-at-rest equivalent. `[ASSUMPTION]` | partial        | FR-19/FR-23                            |

---

## 3. Class `E-CORE-*` — Core-process errors (crash, readiness, S3 runtime)

Source: US-02/US-03, NFR-4. These set state → `core-crashed` (or block Start) with `lastError` = this triple; exit code and last redacted core line are attached for P2 (US-03 AC-03.4).

| Code         | Title                               | Cause (pattern)                                                                                                                          | Next step                                                                                                    | In-place?                      | FR             |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------- |
| `E-CORE-001` | The tunnel stopped unexpectedly     | The tunnel engine exited with code **[code]**: **[last redacted core line]**.                                                            | Click Start to try again; if it repeats, check the Logs view.                                                | Yes (manual restart)           | FR-17          |
| `E-CORE-002` | The tunnel did not start in time    | The tunnel engine did not become ready within **10 s** of starting.                                                                      | Click Start again; if it repeats, check the Logs view. `[ASSUMPTION A-11]`                                   | Yes                            | FR-20          |
| `E-CORE-003` | The tunnel could not be launched    | The tunnel engine failed to launch (**[plain cause: not executable / permission denied]**).                                              | Reinstall the app; on macOS, allow the unsigned app per the Gatekeeper instructions (`E-PLAT-005`).          | partial                        | FR-13          |
| `E-CORE-004` | The storage endpoint is unreachable | The tunnel engine cannot reach the S3 endpoint **[host]** — network offline or endpoint blocked. _(Distinct message required by NFR-4.)_ | Check your internet connection / try another network; the app itself works — only the bucket is unreachable. | Yes (fix network, Start again) | NFR-4, BR-V-16 |
| `E-CORE-005` | Storage access denied               | The S3 provider rejected the credentials (keys revoked, expired, or wrong bucket).                                                       | Ask your provider for fresh keys and re-import the profile. `[ASSUMPTION A-16: detected from core output]`   | partial (new config)           | Q-AN-07        |
| `E-CORE-006` | Device clock may be wrong           | The S3 provider rejected requests because the device time differs from the server time.                                                  | Set the system date/time automatically, then Start again. `[ASSUMPTION A-16]`                                | Yes (fix clock)                | Q-AN-07        |
| `E-CORE-007` | Unknown tunnel failure              | The tunnel engine stopped and the logs do not show a clear reason. _(The explicit NFR-5 "we don't know" case.)_                          | Check the Logs view (copy logs if you want to share them).                                                   | Yes                            | NFR-5          |

Detection note (`[ASSUMPTION A-16]`, pending Q-AN-07): `E-CORE-004..006` are classified by matching the **last redacted core output lines** against known fedarisha-core patterns (connect/timeout, `InvalidAccessKeyId`/`SignatureDoesNotMatch`/403, date-skew). No pattern match → `E-CORE-007`. Patterns must be confirmed against real core output by devops (Q-AN-07); unknown patterns must degrade to `E-CORE-007`, never to a raw line.

---

## 4. Class `E-PLAT-*` — Platform-unsupported / OS-command errors

Source: US-04, US-05 edges, PRD Q-06/Q-07, NFR-5.

| Code         | Title                              | Cause (pattern)                                                                       | Next step                                                                                                                                                                                                                    | In-place?            | FR           |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------ |
| `E-PLAT-001` | Manual proxy setup required        | Automatic system-proxy control is not supported on this desktop environment.          | Set it manually: SOCKS proxy **`127.0.0.1`**, port **`10808`**. _(Hint, not a failure — the toggle is replaced by this text; exact values mandatory, AC-04.5.)_                                                              | n/a (info)           | FR-33        |
| `E-PLAT-002` | System proxy change failed         | The operating system command (**[networksetup / gsettings]**) failed.                 | The toggle was returned to Off; set the proxy manually per `E-PLAT-001` values, or retry.                                                                                                                                    | Yes (retry / manual) | FR-34        |
| `E-PLAT-003` | System proxy could not be restored | The app could not revert the system proxy to its previous settings.                   | **Manual action required:** restore your proxy settings to **[snapshot values]**, or set SOCKS to `127.0.0.1:10808` off. _(Persistent warning until acknowledged/dismissed with the values on screen — fail closed, FR-35.)_ | No (manual OS fix)   | FR-35        |
| `E-PLAT-004` | Tray is unavailable                | The system tray could not be created on this desktop.                                 | The app will behave as a normal window; close-to-tray is disabled. `[ASSUMPTION A-17 related; pending Q-C]`                                                                                                                  | partial              | PR-09        |
| `E-PLAT-005` | macOS blocked the app              | macOS Gatekeeper prevented the bundled tunnel engine from running (unsigned build).   | Right-click the app → Open → confirm. _(Exact wording per Q-06.)_                                                                                                                                                            | partial              | PR-07        |
| `E-PLAT-006` | Unsupported system                 | This app runs on macOS (x64/arm64) and Linux x64 only; detected: **[platform/arch]**. | Use a supported machine; see the download page.                                                                                                                                                                              | No                   | PR-06, NFR-6 |

---

## 5. Class `E-STOR-*` — Secret-storage errors (at rest)

Source: US-07, NFR-1. **Hard rule for this class:** on any failure the app must never fall back to writing plaintext (AC-07.4, FR-53) and never crash (AC-07 edge entries).

| Code         | Title                          | Cause (pattern)                                                                                      | Next step                                                                                                                      | In-place?          | FR                                     |
| ------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------- |
| `E-STOR-001` | Profile storage unavailable    | The OS keychain encryption is not available on this system, so the profile cannot be saved securely. | Profiles cannot be imported until a keychain is available (install/enable a keyring on Linux). Nothing is stored in plaintext. | No (OS config)     | FR-53, AC-07.4, NFR-1                  |
| `E-STOR-002` | Keychain access denied         | The OS keychain refused access (locked or permission denied).                                        | Unlock/keychain prompt → allow access, then retry the action.                                                                  | Yes (after unlock) | FR-57                                  |
| `E-STOR-003` | Profile store is damaged       | The stored profile could not be read (corrupted, tampered, or from another user account).            | Re-import your config — the damaged entry will be replaced.                                                                    | Yes (re-import)    | FR-59, FR-58                           |
| `E-STOR-004` | Profile could not be decrypted | The stored profile was encrypted for a different OS user account or keychain.                        | Re-import your config on this account.                                                                                         | Yes (re-import)    | FR-58                                  |
| `E-STOR-005` | Profile could not be saved     | Writing the encrypted profile to the app data directory failed (**[disk full / permissions]**).      | Free disk space / fix permissions, then import again.                                                                          | Yes                | FR-54 `[ASSUMPTION]` (defensive entry) |

---

## 6. Recovery matrix (what the app must do after each class)

| Class                  | App state after error                                                             | Automatic side effects required                                  | UI recovery path                              |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `E-VAL-*`              | unchanged (profile kept if one was active; nothing persisted for a rejected file) | none — reject before write                                       | fix file → re-import (dialog stays open)      |
| `E-IO-001..003, 006`   | `stopped`                                                                         | nothing spawned                                                  | retry same action                             |
| `E-IO-004/005`         | `stopped`, Start remains enabled                                                  | **no spawn**                                                     | reinstall → retry                             |
| `E-CORE-001..003, 007` | `core-crashed`, `lastError` set                                                   | child reaped (no zombies), `T` deleted, proxy reverted per FR-35 | manual Start (AC-03.6; no auto-restart, Q-08) |
| `E-CORE-004..006`      | `core-crashed`, `lastError` set                                                   | same as above                                                    | fix network/keys/clock → Start                |
| `E-PLAT-001`           | `running` (info only)                                                             | none                                                             | follow manual hint                            |
| `E-PLAT-002`           | `running`, toggle = Off                                                           | snapshot restore attempted; any partial change reported          | retry / manual                                |
| `E-PLAT-003`           | warning persists across views                                                     | none — values displayed until resolved                           | manual OS restore                             |
| `E-STOR-001..005`      | profile considered absent                                                         | **no plaintext write ever**                                      | OS fix or re-import                           |

## 7. Traceability (error class → tests)

| Class                 | QA RED task (M1)                                                                                                | Cross-check                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `E-VAL-*`             | M1-11 (validator: assert exact message text, no stack traces)                                                   | requirements §11 FR-02..FR-07 |
| `E-IO-003/004/005`    | M1-14 (supervisor: port busy, binary missing, hash — hash M2)                                                   | FR-14, FR-15, NFR-6           |
| `E-CORE-*`            | M1-14 (stub crash/timeout fixtures), M1-16 (lastError exposure)                                                 | FR-17, FR-20, NFR-4           |
| `E-PLAT-001/002/003`  | M1-20 (command construction + failure paths, exact hint wording)                                                | FR-31..FR-35                  |
| `E-STOR-*`            | M1-08 (safeStorage failure paths; no plaintext fallback)                                                        | FR-53..FR-59, NFR-1           |
| Message contract (§0) | M1-11 + M1-16 + M1-18 (assert `AppError` triple everywhere; zero stack traces = PRD §7 error-quality checklist) | NFR-5                         |

## 8. Open questions affecting this taxonomy

- **Q-AN-07** — exact core log patterns for `E-CORE-004/005/006` (devops/fedarisha-core samples required; until confirmed these three are `[ASSUMPTION]` and must degrade to `E-CORE-007`).
- **Q-06** — final Gatekeeper wording inside `E-PLAT-005`.
- **Q-03 / Q-AN-05** — whether `E-VAL-009` exists (reject foreign port) or the app overrides the inbound instead.
- **Q-09** — wording of `E-IO-004` if the binary is downloaded on first run instead of bundled.
- **Q-C** — whether `E-PLAT-004` (tray fallback) is M1 or backlog.
- **Q-A** — if credentials may be entered in-app rather than embedded in the JSON, `E-VAL-006` splits into "missing S3 settings" vs "missing credentials" variants.

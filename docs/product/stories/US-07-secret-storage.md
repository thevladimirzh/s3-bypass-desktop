# US-07 — Secret storage

|                |                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | US-07                                                                                                                                                                                        |
| **P0 item**    | BRIEF §2.7 — Secret storage                                                                                                                                                                  |
| **Persona**    | P1 (primary)                                                                                                                                                                                 |
| **Priority**   | P0                                                                                                                                                                                           |
| **INVEST**     | Independent (storage is a `main`-side concern with its own ACs), Negotiable (what exactly is encrypted — see open question), Valuable (survives restarts safely), Estimable, Small, Testable |
| **Depends on** | US-01 (produces the secrets to store), US-06 (shares the redaction rules)                                                                                                                    |

## Narrative

On import, credentials are handed to the `main` process and persisted only
through Electron `safeStorage` (OS keychain: Keychain on macOS,
kwallet/gnome-libsecret on Linux). The renderer never receives them; they are
never written plaintext; the core gets them via a `main`-controlled `0600`
file deleted on stop/exit.

## Acceptance criteria (Given/When/Then)

- **AC-07.1** Given an imported profile with S3 credentials, When the app
  restarts, Then the profile still works (Start succeeds) — proving
  persistence.
- **AC-07.2** Given the persisted store, When QA greps the app data directory
  on disk, Then no credential appears as plaintext in any file (automated
  check over store/profile files).
- **AC-07.3** Given the renderer devtools/IPC surface, When the user inspects
  all `contextBridge` channels and their payloads, Then no channel returns S3
  keys or the full config — the renderer sees only a redacted summary.
- **AC-07.4** Given `safeStorage.isEncryptionAvailable()` is false (unsupported
  platform), When the user tries to import/persist, Then persistence is
  refused with a plain-language explanation; no plaintext fallback occurs
  (NFR-1).
- **AC-07.5** Given the core is running, Then its credentials file has `0600`
  permissions and lives outside any user-facing location; When the core stops
  or the app exits, Then the file is deleted (QA verifies absence).
- **AC-07.6** Given any log output during import/start/stop, Then secrets are
  redacted per AC-06.3.
- **AC-07.7** Given the user clears/removes the profile (if offered), Then the
  keychain-backed store entry is deleted, not just hidden from the UI.

## Edge cases

- Keychain access denied/locked by the OS → clear error + retry; never a
  silent unencrypted write.
- Profile data migrated to another OS user account → keychain material not
  portable → app treats the profile as absent with re-import guidance (no
  crash).
- Corrupted/tampered store blob (or legacy format) → "profile store is
  damaged — re-import your config"; no crash, no partial plaintext output.
- App uninstalled with data left behind → only the encrypted blob remains
  (acceptable; documented in security notes).

## Open questions

- Whether the whole config JSON (secrets included) or only a credentials
  subset is `safeStorage`-encrypted — proposed: encrypt everything sensitive,
  keep only a redacted display summary unencrypted. Confirm in
  `docs/analysis/` (security section).
- **Q-01 (PRD):** single stored profile vs. multiple.

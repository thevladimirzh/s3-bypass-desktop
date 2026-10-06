# US-01 — Profile import

|                |                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**         | US-01                                                                                                                                                              |
| **P0 item**    | BRIEF §2.1 — Profile import                                                                                                                                        |
| **Persona**    | P1 (primary), P2 (secondary — re-import to update)                                                                                                                 |
| **Priority**   | P0                                                                                                                                                                 |
| **INVEST**     | Independent (import needs no other feature), Negotiable (edge-case rules), Valuable (unblocks the whole loop), Estimable, Small (one sitting), Testable (AC below) |
| **Depends on** | Nothing (storage half lands with US-07)                                                                                                                            |

## Narrative

The user receives a client-config JSON (from a friend, a bot, a docs page).
They click "Import profile", pick the file, and either get a clear success
state or a human-readable explanation of exactly what is wrong — never a raw
stack trace.

## Acceptance criteria (Given/When/Then)

- **AC-01.1** Given the app is open, When the user clicks "Import profile" and
  selects a valid client-config JSON file, Then the profile is accepted, its
  name/summary (non-secret fields only) is displayed, and no error is shown.
- **AC-01.2** Given the picker is open, When the user cancels it, Then no
  error appears and the previously loaded profile (if any) stays active.
- **AC-01.3** Given the user selects a file that is not valid JSON, Then the
  error message contains "not valid JSON" plus the parse location
  (line/column) and contains **no** stack trace and no `SyntaxError` class name.
- **AC-01.4** Given the user selects JSON that is syntactically valid but
  missing required fields for the tunnel to work, Then the error lists the
  missing/invalid field names in plain language (e.g. "missing: S3 endpoint")
  and contains no stack trace.
- **AC-01.5** Given the user selects a file larger than 1 MiB or a non-JSON
  file (e.g. `.pdf` renamed to `.json`), Then a clear "unsupported file" error
  is shown; the app does not freeze and does not log file contents.
- **AC-01.6** Given a successful import, When the user inspects the Logs view
  during the import, Then no secret values from the config appear (redaction
  per US-06/US-07).
- **AC-01.7** Given a previously imported profile, When the user imports a new
  valid file, Then the new profile replaces the old one and the UI shows which
  profile is active.

## Edge cases

- Empty file (0 bytes) → same "not valid JSON" handling as AC-01.3.
- File becomes unreadable between picker and read (deleted/permissions) →
  "cannot read file, please try again"; no crash.
- Config valid but S3 credentials absent → invalid-profile error with a
  field-level message (see Q-A).
- Non-ASCII / BOM / one very long line → parses or fails with the normal
  line/column message; the actionable part of the error is never truncated
  away.
- Import while the core is running → proposed: blocked with "Stop the tunnel
  first" (confirm via Q-A).

## Open questions

- **Q-A (links PRD Q-01/Q-02):** single profile or profile list? editable
  after import? credentials embedded in the imported JSON vs. entered in-app?

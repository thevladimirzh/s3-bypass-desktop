# US-02 — Start / Stop the core

|                |                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | US-02                                                                                                                        |
| **P0 item**    | BRIEF §2.2 — Start / Stop                                                                                                    |
| **Persona**    | P1 (primary), P2 (secondary)                                                                                                 |
| **Priority**   | P0                                                                                                                           |
| **INVEST**     | Independent (needs US-01 profile to be useful, but ships with its own ACs), Negotiable, Valuable, Estimable, Small, Testable |
| **Depends on** | US-01 (a profile must exist to start; AC-02.3 covers the missing case)                                                       |

## Narrative

After a profile is loaded, a single Start button spawns the bundled Xray-core
binary (`Fedarisha/Xray-core-fedarisha`, version- and SHA-256-pinned) as a
child process with a local SOCKS inbound on `127.0.0.1:10808`. Stop kills it
cleanly. The user never sees a terminal.

## Acceptance criteria (Given/When/Then)

- **AC-02.1** Given a valid imported profile and the core stopped, When the
  user clicks Start, Then the core binary spawns, the button becomes Stop, and
  within 1 s the status shows `running` (US-03).
- **AC-02.2** Given the core is running, When the user clicks Stop, Then the
  child process is terminated (port 10808 no longer listening within 2 s),
  status returns to `stopped`, and no orphan process remains.
- **AC-02.3** Given no profile is imported, When the user reaches the Start
  control, Then it is disabled with the hint "Import a profile first".
- **AC-02.4** Given the bundled core binary is missing or its SHA-256 does not
  match the pinned value, When the user clicks Start, Then nothing spawns and
  a clear integrity/availability error is shown ("core binary check failed —
  reinstall the app"); no stack trace.
  _Consistency note (`docs/plans/milestones.md` M2, risk R-1): during M1 the
  binary is dev/stub-provided and unpinned — the "binary missing" half of this
  AC applies in M1; the SHA-256 mismatch half is enforced from M2 onward. QA
  scopes AC-02.4 accordingly; the message wording is the same in both._
- **AC-02.5** Given the SOCKS port 10808 is already occupied by another
  process, When the user clicks Start, Then the behavior follows PRD Q-03
  (fail vs. auto-pick) and, if it fails, the message names the port; the app
  never silently uses a different port without telling the user.
- **AC-02.6** Given the core exits on its own (crash), Then no zombie process
  remains and the app transitions to `core-crashed` (US-03) with the exit code
  / last error visible.
- **AC-02.7** Given the user clicks Start twice rapidly, Then only one child
  process exists.
- **AC-02.8** Given the core is running, When the user quits the app from the
  tray, Then the core process is stopped before app exit (no orphan).

## Edge cases

- Double-click during spawn → second click ignored, single spawn (AC-02.7).
- Core prints nothing for N seconds → status stays honest; start-timeout
  threshold proposed at 10 s (confirm via PRD Q-08 territory / analysis doc).
- Config references relative paths → resolved from the `main`-controlled temp
  location, not the user's CWD.
- macOS Gatekeeper killing the unsigned bundled binary → packaging concern
  (M2); QA must verify spawn on a clean machine.
- Binary missing at runtime (see PRD Q-09: bundled vs. downloaded).

## Open questions

- **Q-03 (PRD):** fixed port 10808 — fail or auto-pick when occupied?
- **Q-09 (PRD):** binary bundled in installer vs. downloaded on first run.

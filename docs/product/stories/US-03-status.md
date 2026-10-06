# US-03 — Status surfacing

|                |                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | US-03                                                                                                                                           |
| **P0 item**    | BRIEF §2.3 — Status                                                                                                                             |
| **Persona**    | P1 (primary), P2 (secondary)                                                                                                                    |
| **Priority**   | P0                                                                                                                                              |
| **INVEST**     | Independent (displays state produced by US-02/US-04, but all ACs are observable on their own), Negotiable, Valuable, Estimable, Small, Testable |
| **Depends on** | US-02 (produces the process events), US-05 (tray shows the same state)                                                                          |

## Narrative

A single status indicator (main window + tray) has exactly three states:
`running`, `stopped`, `core-crashed`. In `core-crashed`, the last error is
readable on screen without opening anything else.

## Acceptance criteria (Given/When/Then)

- **AC-03.1** Given any app state, Then the current status is visible in the
  main window as a text label (not color-only) and reflected in the tray.
- **AC-03.2** Given the core is running, Then status is `running`.
- **AC-03.3** Given the core was never started or was stopped, Then status is
  `stopped`.
- **AC-03.4** Given the core process exited unexpectedly, Then status changes
  to `core-crashed` within 1 s of the process event, and the last error (exit
  code and/or last core log line, redacted) is displayed on screen.
- **AC-03.5** Given `core-crashed` with a last error, When the user reads the
  status area, Then the error text is selectable/copyable and free of stack
  traces.
- **AC-03.6** Given the status is `core-crashed`, When the user clicks Start,
  Then a new core process is spawned (recovery path) and status follows
  AC-03.1..2.
- **AC-03.7** Given a simulated core crash (QA kills the child process), Then
  status updates correctly even when the window is hidden — the tray
  menu/tooltip shows the same state.

## Edge cases

- Crash while the window is closed (tray-only) → status visible in tray menu;
  reopening the window shows the same state, no stale "running".
- Two crashes in a row → `lastError` shows the most recent, not the first.
- Long error text → truncated with full text available (tooltip/copy); still
  no secrets (US-06 redaction rules apply).
- Start timeout (core alive but never binds) → proposed: surface as
  `core-crashed` with "core did not become ready" (confirm with analysis).

## Open questions

- **Q-08 (PRD):** auto-restart on crash — backlog; P0 is error + manual
  Start (AC-03.6).

# US-05 — Tray behavior

|                |                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **ID**         | US-05                                                                                                                    |
| **P0 item**    | BRIEF §2.5 — Tray                                                                                                        |
| **Persona**    | P1 (primary)                                                                                                             |
| **Priority**   | P0                                                                                                                       |
| **INVEST**     | Independent (window/tray behavior stands alone), Negotiable (first-run visibility), Valuable, Estimable, Small, Testable |
| **Depends on** | US-02 (Stop/Quit must kill core), US-03 (tray state text), US-04 (Quit reverts proxy)                                    |

## Narrative

The app lives in the system tray and keeps running when the window is closed.
The tray icon shows state at a glance (with a text label per NFR-5) and offers
the key actions: Show window, Start/Stop tunnel, Quit.

## Acceptance criteria (Given/When/Then)

- **AC-05.1** Given a fresh launch, Then the app is reachable from the tray
  within 3 s of start (NFR-3).
- **AC-05.2** Given the window is open, When the user clicks the window close
  button, Then the window hides, the app process stays alive, and the core (if
  running) keeps running.
- **AC-05.3** Given the app is running with the window closed, When the user
  chooses tray "Open", Then the window reopens in its last known state (same
  tab, status correct — no stale values).
- **AC-05.4** Given any state, Then the tray menu shows the status as text
  (`Running` / `Stopped` / `Core crashed`) plus: Show window, Start/Stop
  tunnel, Quit.
- **AC-05.5** Given "Quit" from the tray, Then the core process is stopped,
  the system proxy is reverted (US-04 AC-04.7), and the app exits fully (no
  background process remains — QA checks the process table).
- **AC-05.6** Given a core crash while minimized to tray, Then the tray state
  changes (text + icon) without the window being open.

## Edge cases

- Platform/tray backend unavailable → detect at startup, fall back to a
  normal window app with a warning (Q-C).
- Second app instance launched while one runs → single-instance lock; focus
  the existing window (proposed, Q-C).
- OS session end while window closed → no hung child process (QA checks).
- Launch behavior: the main window shows on launch (owner decision, issue
  #25 — the hidden-to-tray half of Q-C is resolved); closing the window
  hides it to tray (FR-39).

## Open questions

- **Q-C:** RESOLVED 2026-10-08 (issue #25) — the main window shows on
  launch (the original BRIEF "starts hidden to tray" is retired); still
  open: single-instance lock (proposed: yes); tray icon set for
  `core-crashed`.

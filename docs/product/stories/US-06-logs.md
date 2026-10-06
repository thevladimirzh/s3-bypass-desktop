# US-06 — Logs view

|                |                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**         | US-06                                                                                                                                      |
| **P0 item**    | BRIEF §2.6 — Logs view                                                                                                                     |
| **Persona**    | P2 (primary reader), P1 (must not be harmed by it)                                                                                         |
| **Priority**   | P0                                                                                                                                         |
| **INVEST**     | Independent (reads any state), Negotiable (buffer size, copy feature), Valuable (diagnosis without a terminal), Estimable, Small, Testable |
| **Depends on** | US-02 (produces core output), US-07 (defines what is secret)                                                                               |

## Narrative

The window has a Logs section fed by a bounded in-memory buffer written by the
`main` process (core stdout/stderr + app events), with secrets redacted at the
single logging entry point. No on-disk log in MVP (Q-05).

## Acceptance criteria (Given/When/Then)

- **AC-06.1** Given the app has been running, Then the Logs view shows core
  and app log lines oldest-first (newest appended), scrollable, with
  timestamps.
- **AC-06.2** Given more than **2000** lines are produced, Then the buffer
  drops the oldest lines; memory does not grow beyond the configured bound
  (asserted by an automated QA test).
- **AC-06.3** Given a config containing S3 access key / secret key / token was
  imported and the core printed lines containing them, When those lines pass
  through logging, Then the rendered and buffered text contains `[REDACTED]`
  instead of the secret — verified by automated search over the buffer and
  over the renderer DOM.
- **AC-06.4** Given any app error surfaced anywhere (status, dialogs, logs),
  Then no raw stack trace and no full config JSON is present (NFR-2, NFR-5).
- **AC-06.5** Given the user clicks "Copy logs", Then the clipboard receives
  the visible (redacted) log text and nothing else.
- **AC-06.6** Given the app restarts, Then the logs view is empty (in-memory
  only, per Q-05).
- **AC-06.7** Given lines are appended while the user has scrolled up, Then
  the view does not auto-jump; auto-scroll applies only when already at the
  bottom.

## Edge cases

- A single line longer than 4 KiB (core echoing a config) → truncated in the
  buffer with a marker; still redacted before truncation.
- Secret of unknown shape (provider-specific field) → mitigated by rendering
  config echoes from an allow-list of known-safe fields; QA covers the known
  shapes (note for `docs/qa/`).
- Core writes non-UTF8 bytes → replaced with U+FFFD; renderer never crashes.
- Log flood (core spinning) → buffer bound holds; UI stays responsive
  (NFR-3).

## Open questions

- **Q-05 (PRD):** confirm no on-disk log file in MVP.
- Buffer size 2000 lines: constant (proposed) vs. user setting?

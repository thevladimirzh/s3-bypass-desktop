# User Stories — P0 (US-01 .. US-07)

One story per P0 item in `../PRD.md §4` / `BRIEF.md §2`. Each file contains:
statement, persona, narrative, acceptance criteria (Given/When/Then), edge
cases, open questions. All AC are checkable by QA without interpretation.

| ID    | Story                 | File                                               | Persona                  |
| ----- | --------------------- | -------------------------------------------------- | ------------------------ |
| US-01 | Profile import        | [US-01-profile-import.md](US-01-profile-import.md) | P1 primary               |
| US-02 | Start / Stop the core | [US-02-start-stop.md](US-02-start-stop.md)         | P1 primary               |
| US-03 | Status surfacing      | [US-03-status.md](US-03-status.md)                 | P1 primary               |
| US-04 | System-proxy toggle   | [US-04-system-proxy.md](US-04-system-proxy.md)     | P1 primary               |
| US-05 | Tray behavior         | [US-05-tray.md](US-05-tray.md)                     | P1 primary               |
| US-06 | Logs view             | [US-06-logs.md](US-06-logs.md)                     | P2 reader / P1 protected |
| US-07 | Secret storage        | [US-07-secret-storage.md](US-07-secret-storage.md) | P1 primary               |

Personas (see `../PRD.md §2`):

- **P1 — Censored individual** (primary): non-developer; success = "the internet
  works" within 2 minutes.
- **P2 — Tech-comfortable volunteer**: can read JSON and a SOCKS port; success =
  errors and logs are enough to diagnose without a debugger.

Cross-story rules:

- **Redaction** is defined once (US-06 AC-06.3) and enforced everywhere
  (status errors, dialogs, tray, copy).
- **No raw stack traces** anywhere (PRD principle 2; AC-06.4 is the blanket
  check).
- **Status text, not color alone** (NFR-5) in window and tray (AC-03.1,
  AC-05.4).

Every open question inside a story is cross-referenced to a `Q-xx` in
`../PRD.md §8` or a story-local `Q-A/B/C`; none of them may be resolved by
guessing — owner decides.

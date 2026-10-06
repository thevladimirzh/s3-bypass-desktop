# docs/analysis — Requirements & flows (owner: Business Systems Analyst)

| File                               | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| [requirements.md](requirements.md) | Numbered FRs with story traceability, business/platform rules      |
| [data-flows.md](data-flows.md)     | Import, supervision, proxy paths; IPC contract; core state machine |
| [errors.md](errors.md)             | Error taxonomy: class, code, user-facing pattern, recoverability   |

## Conventions

- Every FR cites its source (`US-xx` or `BRIEF.md` §2).
- Requirements must be testable — QA maps them 1:1 to test cases.
- Anything undecided goes to "Open questions", never into rules.

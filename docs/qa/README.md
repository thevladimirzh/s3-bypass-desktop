# docs/qa — Quality artifacts (owner: QA)

| File                                     | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [strategy.md](strategy.md)               | Test pyramid, tooling, naming, RED→GREEN contract, NFR verification |
| [m0-verification.md](m0-verification.md) | Executed M0 verification record (commands + results)                |
| [m1-test-plan.md](m1-test-plan.md)       | US-01..US-07 → test areas → TC IDs → fixtures → M1 task links       |

## Conventions

- QA writes failing tests first (RED); Development turns them green (GREEN).
- Tests are never weakened or deleted to make a build pass.
- Test IDs: `TC-<story>-<nn>` (e.g. `TC-02-03`), mapped to `docs/plans/m1-mvp.md`.

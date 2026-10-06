# s3-bypass-desktop

Desktop client (macOS + Linux) for the fedarisha S3 tunnel: traffic is exchanged
as objects through an S3-compatible bucket, while a supervised Xray-core binary
(`Fedarisha/Xray-core-fedarisha`) provides the local SOCKS proxy.

**Status:** M0 done (scaffold, CI green on both OS legs, security spot-check PASS). M1 — MVP core loop in progress. Not usable yet.

## Idea in one line

Import a config — press Start — the internet works.

## Development

```bash
npm install
npm run dev        # Electron + Vite dev session
npm test           # Vitest unit tests
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Documentation

- [BRIEF.md](BRIEF.md) — product brief, scope, milestones
- `docs/product/` — PRD and user stories
- `docs/analysis/` — requirements and data flows
- `docs/plans/` — milestones and task breakdown
- `docs/qa/` — test strategy and checklists

## License

Client code: see repository license. Bundled core binary: GPL-3.0
(`Fedarisha/Xray-core-fedarisha`).

# s3-bypass-desktop

Desktop client (macOS + Linux) for the fedarisha S3 tunnel: traffic is exchanged
as objects through an S3-compatible bucket, while a supervised Xray-core binary
(`Fedarisha/Xray-core-fedarisha`) provides the local SOCKS proxy.

**Status:** M1 and M2 accepted; M3 (polish + beta) in progress — installers
build unsigned (macOS: a Control-click → Open step on first launch). Testers
start at [docs/user/beta-setup.md](docs/user/beta-setup.md).

## Idea in one line

Import a config — press Start — the internet works.

## Install (beta)

- macOS (unsigned build + Gatekeeper): [docs/user/install-macos.md](docs/user/install-macos.md)
- Linux (AppImage / .deb / .rpm): [docs/user/install-linux.md](docs/user/install-linux.md)
- Beta tester setup (verify SHA256SUMS, report): [docs/user/beta-setup.md](docs/user/beta-setup.md)

## First run & troubleshooting

- Import a profile and start the tunnel: [docs/user/first-profile.md](docs/user/first-profile.md)
- Logs, manual proxy 127.0.0.1:10808, crashes: [docs/user/troubleshooting.md](docs/user/troubleshooting.md)

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

Client code: see repository license (GPL-3.0). Bundled core binary: MPL-2.0
(`Fedarisha/Xray-core-fedarisha` — its own LICENSE ships inside the package;
evidence in `docs/analysis/core-pin.md`).

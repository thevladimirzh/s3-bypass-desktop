# E2E smoke in CI — proposal (deferred per strategy §2 L3: post-M1 / M2)

Status: **proposal only** — `.github/workflows/ci.yml` untouched. Authored with the
M1-24 smoke (DV-31). Rationale for deferral: `ci.yml` sets
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` today (no Electron binary in CI), Linux legs need a
display (xvfb), and safeStorage on headless Linux may hit `E-STOR-001` (no keyring)
until verified. macOS leg mirrors the locally verified environment (3 consecutive greens + 1 preflight-failure run, DV-31).

## Proposed job (add to `.github/workflows/ci.yml`)

```yaml
e2e:
  name: e2e smoke (${{ matrix.os }})
  strategy:
    fail-fast: false
    matrix:
      os: [macos-latest, ubuntu-latest]
  runs-on: ${{ matrix.os }}
  timeout-minutes: 20
  # NOTE: do NOT set ELECTRON_SKIP_BINARY_DOWNLOAD here — this job needs the real Electron binary.
  env:
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' # _electron drives the local Electron binary
    # CORE_BINARY_PATH is injected by the suite's launchEnv (pinned in the spec)
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      with: { persist-credentials: false }
    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npm run lint
    - run: npm run typecheck
    - name: Port preflight (suite also fails loudly on a held port)
      run: node -e 'const s=require("node:net").connect({port:10808,host:"127.0.0.1"});s.on("connect",()=>{console.error("127.0.0.1:10808 held on runner");process.exit(1)});s.on("error",()=>process.exit(0))'
    - name: Smoke E2E (macOS)
      if: runner.os == 'macOS'
      run: npm run test:e2e
    - name: Smoke E2E (Linux, xvfb) # safeStorage needs a keyring → Linux leg may hit E-STOR-001 until verified
      if: runner.os == 'Linux'
      run: |
        sudo apt-get update && sudo apt-get install -y xvfb
        xvfb-run -a npm run test:e2e
```

## Rollout order (suggested)

1. macOS leg first (closest to the verified local run) — land green, then
2. Linux leg behind a keyring/safeStorage verification (R-5 mitigation path), then
3. Drop the `lint`/`typecheck` duplication if job fan-out cost matters (optional).

Owner: handoff with M1-28 (project-manager) → devops (M2), per strategy §2 L3.

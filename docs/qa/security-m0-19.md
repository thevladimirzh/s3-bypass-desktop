# Security spot-check M0-19 — scaffold review record

Date: 2026-10-07 · Reviewer: `cybersecurity` agent (read-only) · Scope: static
review of the M0 tree · **Verdict: PASS — no S1 (critical), no S2 (high).**

Findings dispositioned below. Full evidence (file:line per pass) is preserved in
the review transcript; this file is the tracking record required by
`docs/plans/m0-scaffold.md` M0-19 ("findings → issues, not comments").

## Findings

| ID   | Sev    | Finding                                                                                                                       | Disposition                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 | medium | No `will-navigate`/`will-redirect` guard: renderer could navigate the top frame to remote content with preload still attached | **Fixed in M0-19 pass** — `src/main/index.ts` allows only `file://` and the exact dev URL; everything else `preventDefault()`                                                                                                                                                                                                                                          |
| S3-2 | medium | CI actions pinned by mutable tag (`@v4`)                                                                                      | **Fixed** — pinned to commit SHAs with version comments (`checkout 11d5960… # v4.4.0`, `setup-node 49933ea… # v4.4.0`), `persist-credentials: false` added                                                                                                                                                                                                             |
| S3-3 | medium | Dev-mode CSP: inline React-refresh preamble + HMR WebSocket blocked by strict policy; prod rendering never asserted           | **Fixed + verified** — dev-only `transformIndexHtml` relaxation in `electron.vite.config.ts` (applies only when a dev server is attached; built artifact keeps the strict CSP — verified byte-for-byte in `out/renderer/index.html`). Empirical dev run: renderer boot marker logged, zero CSP violations against scripts. Prod render assertion → `TC-E2E-01` (M1-24) |
| S4-1 | low    | `shell.openExternal` accepted any `http(s)` URL from the renderer                                                             | **Fixed** — https-only; non-https silently dropped, popup still denied                                                                                                                                                                                                                                                                                                 |
| S4-2 | low    | CSP missing `base-uri`/`object-src`/`frame-src`/`form-action`/explicit `connect-src`                                          | **Fixed** — full directive set in `src/renderer/index.html` (`object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'; connect-src 'self'`)                                                                                                                                                                                                           |
| S4-3 | low    | Dev URL loaded whenever `ELECTRON_RENDERER_URL` is set                                                                        | **Fixed** — guarded with `!app.isPackaged`                                                                                                                                                                                                                                                                                                                             |
| S4-4 | low    | IPC handlers do not validate `event.senderFrame`; no deny-by-default permission handler                                       | **Tracked → GitHub issue**: becomes mandatory with the M1 channel expansion (contract addition per `docs/analysis/data-flows.md`)                                                                                                                                                                                                                                      |
| S4-5 | low    | `npm audit` shows 8 moderate advisories (electron-builder chain); static assessment only, real audit run owed                 | **Evidence attached** — live `npm audit`: 8 moderate, all in the dev-only packaging chain (`electron-builder`/`app-builder-lib`), excluded from shipped artifacts by `electron-builder.yml` (`files: out/**`) → does not block M0. **Gate: clean audit (or accepted risk note) required for M2 release** → GitHub issue                                                |
| S4-6 | low    | `out/` build artifacts on disk — tracked-file status unproven (reviewer had no git)                                           | **Verified by main agent** — `git ls-files out/` → 0 files; `git check-ignore -v out/` → `.gitignore:3`                                                                                                                                                                                                                                                                |

## Explicit passes (from the review)

1. Window flags: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; no `webSecurity:false`/remote module anywhere (`src/main/index.ts:15-17`).
2. `setWindowOpenHandler`: popups denied unconditionally.
3. Preload surface minimal (`ping` + static `versions`), typed end-to-end, no raw `ipcRenderer` leakage.
4. CSP present in source **and** build output.
5. Secrets hygiene: `.env` absent from disk, gitignored; `.env.example` placeholders only; repo-wide pattern scan (AWS/tokens/keys/passwords/URL-creds) → 0 matches.
6. CI: `permissions: contents: read`, `npm ci` from lockfile, all registry URLs `https` with integrity hashes, timeout + concurrency set, no `${{ secrets.* }}`.
7. IPC contract typed and namespaced (`app:ping`), returns static secret-free data.
8. GPL-3.0: full `LICENSE`, `package.json` license field, bundled-binary notice in README/BRIEF.
9. No `innerHTML`/`eval`/`dangerouslySetInnerHTML`; user-visible data passes through JSX escaping.
10. No input surface yet; validation correctly deferred to M1 with FR traceability.
11. Single window, allocation-free handler, no listeners/loops/child processes.
12. NFR-1/NFR-2 trivially conformant at M0 (no channels that could leak, no logging yet).

## Standing guidance for M1 (from the review)

- Spawn the core with `execFile`/`spawn(args[])` — never string interpolation.
- Validate config JSON against the schema before it touches anything.
- Every new IPC handler must validate `event.senderFrame` (S4-4) and never return secret-class fields (`docs/analysis/data-flows.md` denylist).

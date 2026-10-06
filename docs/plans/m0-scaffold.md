# M0 — Repo scaffold: task breakdown

Milestone: **M0** (BRIEF §8) · Owner: Project Manager · Status: **IN PROGRESS**
Parent plan: `docs/plans/milestones.md`

**Legend:** task ID · owner · size (S ≈ 0.5 d, M ≈ 0.5–1.5 d, L ≈ 2+ d) · deps · status
**Status values:** `todo` / `in progress` / `done` / `blocked`
**Estimate range:** 4–7 working days total (assumptions in `milestones.md` §Estimates).

TDD note: M0 is _tooling_ work — here "tests first" means the smoke tests listed in
each test task are written before (or together with) the code they exercise, and no
task is `done` until `npm run lint && npm run typecheck && npm test` are green.

---

## Checklist (ordered — do not reorder without re-checking deps)

### Phase 0 — Foundation & rules

- [ ] **M0-01** · project-manager · **S** · deps: — · `todo`
      Confirm toolchain baseline and record it in this file: Node LTS version, npm
      (not yarn/pnpm), package manager lockfile committed. Assumption: npm.
- [ ] **M0-02** · developer · **S** · deps: M0-01 · `todo`
      Create `package.json` (name `s3-bypass-desktop`, private, English metadata),
      `.gitignore` (incl. `.env`, `node_modules`, `dist`, `release/`), `.env.example`
      template with placeholder S3 keys only (BRIEF §7).
- [ ] **M0-03** · developer · **S** · deps: M0-02 · `todo`
      `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`,
      `exactOptionalPropertyTypes`, `noImplicitOverride`; per-part configs for
      main/preload/renderer. Verify: `npx tsc --noEmit` runs (empty project OK).

### Phase 1 — App skeleton (three-process split, BRIEF §4)

- [ ] **M0-04** · developer · **M** · deps: M0-03 · `todo`
      Vite + React renderer scaffold under `src/renderer/` (entry `index.html`,
      `App.tsx`, minimal placeholder UI). Verify: `npm run dev` serves renderer.
- [ ] **M0-05** · developer · **M** · deps: M0-03 · `todo`
      Electron `main` process under `src/main/`: app entry, single BrowserWindow
      with **secure defaults** (`contextIsolation: true`, `sandbox: true`,
      `nodeIntegration: false`), no remote module, no `file://` loading of remote
      content.
- [ ] **M0-06** · developer · **S** · deps: M0-05 · `todo`
      `src/preload/`: minimal `contextBridge` surface — placeholder channel only
      (real IPC contract arrives in M1 from `docs/analysis/`). Renderer-only
      access pattern documented in a comment.
- [ ] **M0-07** · developer · **M** · deps: M0-04, M0-05, M0-06 · `todo`
      Wire `electron-vite` (or equivalent) dev/build: `npm run dev` boots Electron
      with Vite HMR for renderer; `npm run build` produces main/preload/renderer
      bundles. Verify end-to-end on macOS locally.

### Phase 2 — Folder structure & docs skeleton

- [ ] **M0-08** · project-manager · **S** · deps: M0-04 · `todo`
      Create folder structure with `.gitkeep`/README stubs:
      `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/` (cross-process
      types), `docs/product/`, `docs/analysis/`, `docs/plans/`, `docs/qa/`.
- [ ] **M0-09** · project-manager · **S** · deps: M0-08 · `todo`
      Docs skeleton: `docs/product/README.md` (PRD template + user-story template),
      `docs/analysis/README.md` (requirements template), `docs/qa/README.md`
      (test-strategy pointer). This plan set (`milestones.md`, `m0-scaffold.md`,
      `m1-mvp.md`) already exists — link them.
- [ ] **M0-10** · developer · **S** · deps: M0-08 · `todo`
      `LICENSE` / licensing note: client code license + GPL-3.0 notice for the
      bundled `Fedarisha/Xray-core-fedarisha` binary (BRIEF §5, §4).

### Phase 3 — Lint / format / test tooling

- [ ] **M0-11** · qa · **S** · deps: M0-03 · `todo`
      **RED first:** write failing smoke tests in `tests/` (Vitest): one pure
      function test in `src/shared/`, one renderer component render test
      (@testing-library/react). Tests must fail because the code does not exist yet.
- [ ] **M0-12** · developer · **M** · deps: M0-11 · `todo`
      **GREEN:** Vitest config (jsdom for renderer, node for main/shared), implement
      the two minimal targets so M0-11 passes. No test weakened.
- [ ] **M0-13** · developer · **S** · deps: M0-11 · `todo`
      ESLint flat config + typescript-eslint + react hooks rules + import order;
      `npm run lint` must exit 0.
- [ ] **M0-14** · developer · **S** · deps: M0-13 · `todo`
      Prettier config; `npm run format` + `npm run format:check`; wire Prettier
      into ESLint or as separate check (decision recorded here: separate check).
- [ ] **M0-15** · developer · **S** · deps: M0-12, M0-13, M0-14, M0-07 · `todo`
      npm scripts finalized: `dev`, `build`, `lint`, `format`, `format:check`,
      `typecheck`, `test`, `test:watch`. Verify full sequence locally.

### Phase 4 — CI

- [ ] **M0-16** · devops · **M** · deps: M0-15 · `todo`
      `.github/workflows/ci.yml`: on every push + PR → install, `lint`,
      `format:check`, `typecheck`, `test` on matrix **macos-latest + ubuntu-latest**.
      Cache npm. Artifacts-on-tags workflow is M2, not here.
- [ ] **M0-17** · devops · **S** · deps: M0-16 · `todo`
      Verify CI green on `main` for both legs; fix flakes (a flaky first CI is a
      blocker, not a nuisance). Record run URL here: `<pending>`.

### Phase 5 — Verification & handoff

- [ ] **M0-18** · qa · **S** · deps: M0-17 · `todo`
      Clean-clone verification: fresh `git clone` → `npm install` → full script
      sequence (M0-15) on macOS **and** Linux (CI legs may substitute for Linux).
- [ ] **M0-19** · cybersecurity · **S** · deps: M0-05, M0-06 · `todo`
      Spot-check scaffold security: window flags, preload surface is minimal,
      no secrets patterns, `.env` gitignored. Findings → issues, not comments.
- [ ] **M0-20** · project-manager · **S** · deps: M0-17, M0-18, M0-19 · `todo`
      Update `milestones.md` current-status table (M0 → `done`), update README
      status line, announce handoff: **M0 done → QA may start M1 RED (M1-04)**.

---

## Handoffs (explicit)

1. M0-11 (qa, RED) → M0-12 (developer, GREEN): written test files are the contract.
2. M0-15 (developer) → M0-16 (devops): local scripts green is CI's precondition.
3. M0-19 (cybersecurity) + M0-17/M0-18 → M0-20 (project-manager): DoD evidence for
   milestone flip; only then does M1 open.

## Risks specific to M0

| Risk                                                               | Mitigation                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Electron native deps fail on one OS in CI                          | Pin Electron version; matrix legs run in parallel; fix before Phase 5.          |
| No repo history yet — "on every push" CI untested until first push | M0-17 verifies on the first real push; main agent commits (PM does not commit). |
| Test framework choice churn (Vitest assumed per BRIEF §5)          | Deviation from Vitest requires recording decision in this file.                 |

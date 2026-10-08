# BRIEF — s3-bypass-desktop

Status: active · Language: English · Repo: private

## 1. Product

A desktop client for **macOS and Linux** for the _fedarisha_ S3 tunnel: instead of
connecting to a proxy directly, the app exchanges traffic as objects through an
S3-compatible bucket, so an outside observer sees ordinary cloud-storage traffic
(whitelisted transport). The app supervises a bundled, modified Xray-core binary
from `github.com/Fedarisha/Xray-core-fedarisha` (Go, MPL-2.0 — corrected
2026-10-08: the release artifacts' LICENSE is the Mozilla Public License 2.0,
evidence in `docs/analysis/core-pin.md`). Reference
implementation for mobile: `SpaceNeuroX/s3-bypass` (Android).

**One-liner:** _Import a config — press Start — the internet works._

## 2. MVP (P0) — "done" means

1. **Profile import** — client-config JSON via file picker, validated with clear,
   human-readable errors (no raw stack traces).
2. **Start / Stop** — spawn and kill the core binary (bundled per platform),
   local SOCKS inbound on `127.0.0.1:10808`.
3. **Status** — running / stopped / core-crashed, with the last error readable.
4. **System-proxy toggle** — macOS via `networksetup`, Linux via GNOME
   `gsettings`; anywhere else → an honest "do it manually" hint.
5. **Tray** — app starts hidden to tray; closing the window keeps it running.
6. **Logs view** — bounded in-memory buffer, **never** secrets or full configs.
7. **Secret storage** — config and S3 keys at rest through OS keychain
   (`safeStorage`); never sent to the renderer, never written in plaintext.

## 3. Out of MVP (backlog)

TUN mode · auto-update · Russian locale (UI is English first) · profile
distribution from a bot / URL import · split tunneling · Windows · macOS
notarization (until then: unsigned build + Gatekeeper instructions) ·
S3-provider presets · deep OS integration.

## 4. Architecture

- **Electron + TypeScript (strict) + Vite + React.**
- Process split: `main` (supervisor, proxy control, tray, storage) →
  `preload` (minimal `contextBridge` surface) → `renderer` (UI only).
- The core Go binary is a **child process**: version- and SHA-256-pinned,
  cross-built for `darwin-x64`, `darwin-arm64`, `linux-x64`.
- Packaging: `electron-builder` → `.dmg` (macOS), AppImage + `.deb` (Linux).

## 5. Quality & team workflow

- **TDD:** QA writes failing tests first (Vitest; Playwright E2E later),
  Development turns them green. Tests are never weakened to pass.
- ESLint + Prettier; CI on every push (lint + test), build artifacts on tags.
- Security review before any external distribution (S3 keys handling, IPC
  surface, supply chain). License obligations preserved (client: GPL-3.0;
  bundled core: MPL-2.0).
- Roles: `product-manager`, `project-manager`, `business-analyst`, `qa`,
  `developer`, `cybersecurity` (read-only), `devops` — see `.opencode/agents/`.

## 6. Documentation structure

- `docs/product/` — PRD, user stories (Product Manager)
- `docs/analysis/` — requirements, rules, data flows (Business Analyst)
- `docs/plans/` — milestones, task breakdown (Project Manager)
- `docs/qa/` — test strategy, checklists (QA)

## 7. Repository & git rules

- Private repo; all texts and commits in **English**.
- Author of every commit: `vladimir-opencode-agent[bot]` (via `git-bot`).
- Trunk-based while solo: direct commits to `main`.
- Secrets never enter the repo: `.env` is gitignored, `.env.example` is the
  only template; real S3 credentials are entered by the user only.

## 8. Milestones

| Milestone | Content                                                      |
| --------- | ------------------------------------------------------------ |
| **M0**    | Repo scaffold: Electron + Vite + React, lint/format/test, CI |
| **M1**    | MVP core loop: import → start → status → proxy → tray → logs |
| **M2**    | Packaging (dmg/AppImage/deb), pinned core binary, release CI |
| **M3**    | Polish + beta (usability, error wording, docs)               |

## 9. Defaults (change on request)

- App display name: **S3 Bypass Desktop**.
- UI language: English (i18n-ready, Russian later).
- Core binary pinned to the latest `Fedarisha/Xray-core-fedarisha` release;
  commit SHA recorded in docs.
- Linux targets: `x64` first; `arm64` follows in CI matrix.
- Linux package formats: **AppImage + `.deb` + `.rpm`** (owner decision 2026-10-08).

## 10. Open questions

- macOS signing/notarization: **resolved 2026-10-08** — no Apple Developer account
  (cost, owner call); ship an unsigned build + Gatekeeper instructions, notarization
  stays out of scope.
- Exact default SOCKS port: 10808 for now (configurable later).
- Which S3 providers deserve presets first (owner call, post-MVP).

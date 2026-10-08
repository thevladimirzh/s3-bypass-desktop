# M3 — Polish + beta: task breakdown

Milestone: **M3** (BRIEF §8) · Owner: product-manager / qa · Status: **in progress**
(2026-10-08 — unblocked by the M2 handoff, `docs/qa/acceptance-m2-13.md`)
Parent plan: `docs/plans/milestones.md`

**Legend:** task ID · owner · size (S ≈ 0.5 d, M ≈ 0.5–1.5 d, L ≈ 2+ d) · deps · status
**Status values:** `todo` / `in progress` / `done` / `blocked-owner` / `blocked-xx`
**Estimate range:** 1–2 weeks + beta soak time (assumptions in `milestones.md` §Estimates).

TDD note: the M1/M2 rule carries over verbatim — QA writes the RED test first, dev writes
GREEN second, RED and GREEN are separate commits, prettier before every commit, tests only
ever grow (additive barriers/setup are allowed; weakening is not). New TC IDs and wording
rows are declared in `docs/qa/m3-test-plan.md` per batch; raw-text doc/config pins follow
the DV-36/DV-37 pattern.

---

## Owner decisions recorded before any pin (2026-10-08)

- **Batch sequence A→G approved:** A error-wording pass → B UX surfaces → C icon +
  naming → D i18n groundwork → E user docs → F darwin-x64 dmg leg (#27) → G beta
  distribution + feedback triage. Parallelism allowed only where deps say so.
- **App icon is generated in-repo:** a minimal SVG source (`assets/app-icon.svg`, the
  power-glyph language of the Start/Stop toggle) + a build script producing the platform
  icons — no owner artwork, no external asset.
- Scope guard (M2 carry-over, owner 2026-10-08): BRIEF §3 stays **out of MVP** — beta
  feedback is triaged INTO `docs/product/backlog.md`, never into this board.

### Carried over from M2 (see `milestones.md` §M3)

- **Issue #5** (S4-3 broadcast targeting, S4-6 handler throttling): S4-4 evidenced closed
  by M2-09; S4-3/S4-6 stay conditional (single window, cheap handlers) — re-verify note is
  recorded at acceptance (M3-13), no code batch.
- **Issue #27** — darwin-x64 (Intel) dmg leg (M2 DoD #1 waiver follow-up) → Phase F.
- Pre-M3 fix series **#20/#21/#22/#24 — all DONE and closed** before this board opened
  (GREEN: `bfa3740`, `5f3b49d`, `7701bd8`, `b26e0a2`).

---

## Checklist (ordered — do not reorder without re-checking deps)

### Phase A — Error-wording pass (BRIEF §2.1 global, strategy §7 NFR-5)

- [x] **M3-01** · project-manager · **S** · deps: — · `done`
      Record the owner decisions above in this board and link it from
      `docs/plans/milestones.md` §M3 — this commit. Spec-before-pin (house rule).
- [x] **M3-02** · qa · **S** · deps: M3-01 · `done`
      Open `docs/qa/m3-test-plan.md` — scope: wording-table growth + contract
      hardening, UX-surface pins (hint/footer/quit-failure/states), icon &
      naming config pins, i18n seam, user-docs consistency; declare the
      `TC-POL-nn` family and the deviations log in the M2-test-plan style.
- [x] **M3-03** · qa · **M** · deps: M3-02 · `done` (RED, 2026-10-08 — m3-test-plan §10/§11)
      RED for the audit (scoping 2026-10-08): new wording rows for the FIVE
      unpinned triples — E-IO-006 config write, E-CORE-003 spawn (its nextStep
      currently cites `E-PLAT-005`), E-IO-001 file read (strategy §7 promised
      this row), E-IO-002 dialog, E-STOR-005 save (assert BOTH duplicated
      literals); promote the sibling-only pins into table rows (E-IO-004,
      E-IO-003, E-CORE-001, E-CORE-002, E-VAL-015, the no-profile refusal);
      harden `expectHumanError` — FORBIDDEN `E-(VAL|IO|CORE|PLAT|STOR)-\d{3}`
      and errno tokens (`ENOENT`, `EACCES`, …) inside title/cause/nextStep.
- [x] **M3-04** · developer · **M** · deps: M3-03 · `done` (GREEN, 2026-10-08 — 299/299)
      GREEN for the wording pass: align the status-machine illegal-transition
      triple with errors.md (audit B-8c — impl title diverges from the doc);
      drop the internal `E-PLAT-001` out of E-PLAT-002's nextStep (B-9); give
      the no-profile Start refusal a real `E-…` code (B-8d); deduplicate the
      E-STOR-005 literal into ONE source; reword whatever the new FORBIDDEN
      rows catch (E-CORE-003 nextStep must point at the Gatekeeper doc, not
      cite a code; E-IO-006/E-IO-001/E-IO-002 humanized per errors.md).

### Phase B — UX surfaces (usability pass, BRIEF §2 deliverable 2)

- [x] **M3-05** · qa · **M** · deps: M3-02 · `done` (RED, 2026-10-08 — m3-test-plan §3/§10, TC-POL-03)
      RED for the surface audit findings: AC-04.5 manual-proxy hint actually
      rendered (the renderer must read `ProxyState.supported`/`hint` — today it
      ignores both, so a KDE user sees a broken toggle, no honest hint);
      the stale footer `App.tsx:353` ("M0 scaffold — tunnel features land in
      M1.") replaced with shipped copy; quit-teardown `stopCore` failure
      surfaced through the dialog path instead of swallowed (AC-05.5 fail
      closed, audit B-13); LogsView empty-state text pinned; the duplicated
      status-label maps (renderer vs tray) pinned equal; the dev-only
      "run inside Electron" IPC line treated per the RED note.
- [x] **M3-06** · developer · **M** · deps: M3-05 · `done` (GREEN, 2026-10-08 — 308/308)
      GREEN for the surface pins (renderer proxy section, footer copy, quit
      dialog wiring, shared status-label source).

### Phase C — App icon + naming (BRIEF §9 defaults)

- [x] **M3-07** · qa+developer · **S** · deps: — · `done` (RED `6f16e68` + GREEN, 2026-10-08 — 312/312, TC-POL-04)
      Icon: RED config pin first (builder config must declare an icon produced
      from `assets/app-icon.svg`; the `productName` pin stays exactly
      `S3 Bypass Desktop`), GREEN = the SVG source + `scripts/build-icon.mjs`
      (`.icns` for
      darwin via the iconutil toolchain, `.png` for linux) wired into
      `electron-builder.yml` `icon:`; builder-config tests extended.

### Phase D — i18n groundwork (English first, Russian → backlog)

- [ ] **M3-08** · qa+developer · **M** · deps: M3-05 · `todo`
      Extract renderer + tray + hint strings into a single EN strings module
      with a `t(key)` seam (no RU content — BRIEF §3): every existing
      exact-wording pin must stay byte-identical GREEN (the seam re-exports the
      very strings the pins already assert).

### Phase E — User documentation (M3 deliverable 3 + DoD #1 input)

- [ ] **M3-09** · qa+project-manager · **M** · deps: M3-04, M3-06 · `todo`
      `docs/user/` — install (macOS unsigned + Gatekeeper, Linux
      AppImage/deb/rpm), first profile, troubleshooting, manual system-proxy
      hints (127.0.0.1:10808); the **beta setup doc** handed to the tester
      (DoD #1); README split into user vs development sections;
      `docs-consistency.test.ts` extended over the new docs.

### Phase F — darwin-x64 dmg leg (issue #27)

- [ ] **M3-10** · devops · **S** · deps: — · issue #27 · `todo`
      `release.yml`: add the Intel leg (matrix entry / `--x64` dist args on the
      mac job); RED/GREEN config pin — the mac build asserts BOTH arch
      artifacts staged/built (rows continue the `TC-PKG-nn` family in
      `docs/qa/m2-test-plan.md` §6, fix-20 precedent); validation tag run →
      observe both dmg artifacts + manifests → delete the tag (M2-07 pattern).

### Phase G — Beta & acceptance (DoD 1–4)

- [ ] **M3-11** · owner · **—** · deps: M3-09, M3-10 · `blocked-owner-cohort`
      Hand the beta installers + setup doc to at least one external tester
      (DoD #1); feedback triage into `docs/product/backlog.md` — BRIEF §3
      items never land on this board.
- [ ] **M3-12** · cybersecurity · **S** · deps: M3-04, M3-06, M3-10 · `todo`
      Security re-review before external distribution (DoD #2 gate): error
      surfaces, IPC surface, supply chain — deltas since `security-m2-09.md`.
- [ ] **M3-13** · project-manager · **S** · deps: M3-11, M3-12 · `todo`
      Acceptance report `docs/qa/acceptance-m3-*.md` → flip M3 in
      `milestones.md` (DoD 1–4 evidenced; issue #5 S4-3/S4-6 re-verify note
      recorded — single-window re-verify stays conditional until multi-window).

---

## Dependency graph

```
M3-01 → M3-02 → M3-03 → M3-04 ─┐
              └→ M3-05 → M3-06 ─┼→ M3-09 ─┐
M3-07 (parallel)                │         ├→ M3-11 ─┐
              M3-08 (after 05)  │         │         ├→ M3-13
                                └→ M3-12 ←┘  M3-10 ─┘
```

## Open items tracked outside the board

- Issue **#5** — no batch; re-verify note lands in M3-13's acceptance report.
- BRIEF §3 backlog (RU locale, auto-update, notarization, presets, …) —
  `docs/product/backlog.md`, post-MVP.
- Beta soak time is calendar time, not a task — DoD #1 waits on the cohort.

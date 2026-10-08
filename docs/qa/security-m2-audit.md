# M2-08 — live `npm audit` evidence for the packaging chain

**Gate**: issue #2 — _"M2 gate: live npm audit evidence for the packaging
chain (M0-19 S4-5)"_ ← security spot-check `docs/qa/security-m0-19.md`
S4-5 and the M1 security review `docs/qa/security-m1-25.md` S5-13.
**Recorded**: 2026-10-08, node v22.12.0, npm 10.9.0, lockfile of
M2-08 (electron-builder chain at 26.17.0). Board row: M2-08.

## 1. Live outputs (captured, not summarized)

### `npm audit` — full tree — **exit 1**

```
# npm audit report

sprintf-js  *
Severity: moderate
sprintf-js vulnerable to denial of service through unbounded precision specifiers - https://github.com/advisories/GHSA-hp3w-g68c-fv3c
fix available via `npm audit fix --force`
Will install electron-builder@26.5.0, which is a breaking change
node_modules/sprintf-js
  roarr  <=2.15.4
  Depends on vulnerable versions of sprintf-js
  node_modules/roarr
    global-agent  <=3.0.0
    Depends on vulnerable versions of roarr
    node_modules/global-agent
      @electron/get  1.6.0 - 4.0.3
      Depends on vulnerable versions of global-agent
      node_modules/app-builder-lib/node_modules/@electron/get
        app-builder-lib  25.1.1 || 26.6.0 - 27.0.0-alpha.2
        Depends on vulnerable versions of @electron/get
        Depends on vulnerable versions of dmg-builder
        Depends on vulnerable versions of electron-builder-squirrel-windows
        node_modules/app-builder-lib
          dmg-builder  26.6.0 - 27.0.0-alpha.2
          Depends on vulnerable versions of app-builder-lib
          node_modules/dmg-builder
            electron-builder  19.25.0 || 26.6.0 - 27.0.0-alpha.2
            Depends on vulnerable versions of app-builder-lib
            Depends on vulnerable versions of dmg-builder
            node_modules/electron-builder
          electron-builder-squirrel-windows  26.6.0 - 27.0.0-alpha.2
          Depends on vulnerable versions of app-builder-lib
          node_modules/electron-builder-squirrel-windows

8 moderate severity vulnerabilities
```

### `npm audit --omit=dev` — shipped tree — **exit 0**

```
found 0 vulnerabilities
```

### `npm audit --audit-level=high` — **exit 0**

No high or critical advisories in ANY tree → the board instruction
_"triage highs into GitHub issues"_ has **nothing to triage**: 0 highs,
0 criticals were filed (this document is the evidence record instead).

## 2. Advisory triage

| #   | Package                             | Role                             | Severity             | Advisory                                       |
| --- | ----------------------------------- | -------------------------------- | -------------------- | ---------------------------------------------- |
| 1   | `sprintf-js@1.1.3`                  | **ROOT** — the only real finding | moderate (CVSS 6.9)  | `GHSA-hp3w-g68c-fv3c` / `CVE-2026-97058`       |
| 2   | `roarr@2.15.4`                      | dependent of #1                  | moderate (inherited) | depends on vulnerable versions of sprintf-js   |
| 3   | `global-agent@3.0.0`                | dependent chain                  | moderate (inherited) | depends on vulnerable versions of roarr        |
| 4   | `@electron/get@3.1.0`               | dependent chain                  | moderate (inherited) | depends on vulnerable versions of global-agent |
| 5   | `app-builder-lib@26.17.0`           | dependent chain                  | moderate (inherited) | depends on #4, #6, #7, #8                      |
| 6   | `dmg-builder@26.17.0`               | dependent chain                  | moderate (inherited) | depends on #5                                  |
| 7   | `electron-builder@26.17.0`          | dependent chain                  | moderate (inherited) | depends on #5, #6                              |
| 8   | `electron-builder-squirrel-windows` | dependent chain                  | moderate (inherited) | depends on #5                                  |

Root-advisory facts (GitHub Advisory Database, verified 2026-10-08):

- **`GHSA-hp3w-g68c-fv3c`** / **`CVE-2026-97058`** — _"sprintf-js
  vulnerable to denial of service through unbounded precision
  specifiers"_ (CWE-1284), published 2026-09-24, reviewed 2026-10-05;
- affected `<= 1.1.3`; **Patched versions: none** — the installed
  `sprintf-js@1.1.3` **is** the latest release (`npm view
sprintf-js version` = 1.1.3), so no version in the ecosystem is
  remediated;
- CVSS 6.9 — impact limited to Availability (low); exploit
  preconditions: the attacker must **control the format string**
  (AV:N/AC:L/PR:N/UI:N, no C/I impact), EPSS 0.366 % (28th
  percentile).

## 3. Why none of this reaches the shipped artifact

1. **Dev-only provenance.** All 8 entries hang off
   `devDependencies` (`npm ls sprintf-js` →
   `electron-builder → app-builder-lib → @electron/get →
global-agent → roarr → sprintf-js`). The production dependency set
   is exactly `react` + `react-dom`, and `npm audit --omit=dev`
   reports `found 0 vulnerabilities`.
2. **Packaging exclusion.** `electron-builder.yml` ships
   `files: out/**` (pinned by TC-PKG-06, assembled into asar) — neither
   `node_modules` nor the packaging toolchain is ever packed; the
   runtime bundle is Electron + the pinned Xray core (digest-verified,
   M2-04) + the compiled React bundle + the license attributions
   (M2-06).
3. **Attack-surface reasoning.** The advisory fires when a caller
   passes an attacker-controlled format string into sprintf. In this
   chain sprintf is called only by the build tooling's own log
   formatting on trusted runners (local machine / GitHub CI); none of
   the app's runtime surfaces (IPC, navigation, core supervision —
   covered by M1 issues #1/#10) can reach it.

## 4. Upgrade assessment (issue #2 option 1) — no remediation exists

| Check                                                                     | Result                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit fix`                                                           | no non-breaking path (npm proposes `--force` only)                                                                                                        |
| `npm audit fix --force`                                                   | **rejected**: downgrades `electron-builder` to 26.5.0 — a breaking toolchain downgrade in exchange for removing a build-time moderate DoS; strictly worse |
| `npm outdated electron-builder app-builder-lib dmg-builder @electron/get` | installed chain 26.17.0 vs registry `latest` 26.15.3 → nothing newer to move to                                                                           |
| upstream GHSA patch                                                       | **none** (`Patched versions: none`; tracking: alexei/sprintf.js#237)                                                                                      |

→ Issue #2's option 2 (**accepted-risk note**) is the only viable path.

## 5. Accepted risk note (issue #2, option 2)

**Decision**: accept the 8 moderate dev-chain advisories for M2 release
packaging. **Scope of acceptance**: the `devDependencies`-only
electron-builder chain at lockfile 26.17.0 — nothing else.

**Rationale**:

- the root is a _build-time_ moderate DoS requiring format-string
  control inside tooling we invoke ourselves (§3.3);
- the shipped tree is verified clean (`found 0 vulnerabilities`,
  exit 0) and the toolchain is excluded from artifacts by
  `files: out/**` (§3.1–3.2);
- no remediation exists anywhere in the ecosystem (§4) — the only
  npm-proposed "fix" is a breaking downgrade;
- CVSS 6.9 with availability-only impact, EPSS 0.366 %.

**Re-evaluation triggers** (the note is re-opened when any fires):

1. an upstream patch for `GHSA-hp3w-g68c-fv3c` lands (sprintf-js
   > 1.1.3, or roarr/global-agent stop depending on it) → bump the
   > electron-builder chain in the next packaging batch;
2. any advisory reaches the production tree (`npm audit --omit=dev`
   non-zero) or severity reaches high/critical anywhere → the CI legs
   below redden/flag and the risk is re-triaged;
3. the M2-09 security review and M2-13 acceptance checklist re-read
   this note.

## 6. CI legs landed with this gate (pinned by TC-PKG-16)

- **blocking**: `npm audit --omit=dev` in the `checks` job — a
  production-tree advisory fails CI (M1 review S5-13's
  recommendation);
- **informational, non-blocking** (`continue-on-error: true`):
  `npm audit --audit-level=high` — the optional leg issue #2
  requested; dev-chain highs are reported in the step log but never
  block a build.

Both legs are exercised on every push; this document is the
point-in-time evidence for the M2 exit gate.

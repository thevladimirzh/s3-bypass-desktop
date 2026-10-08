# Core binary pin — Xray-core-fedarisha

Status: **active** · Owner: DevOps (board task M2-03) · Language: English
Basis: `BRIEF.md` §9 ("Core binary pinned to the latest
`Fedarisha/Xray-core-fedarisha` release; commit SHA recorded in docs"),
M2 DoD #1 (SHA-256 of the bundled core verified at build time).
Verifier: `npm run verify:core-pin -- <file> <asset>` →
`scripts/verify-core-pin.mjs` (exit 0 match, exit 1 MISMATCH naming the
asset, exit 2 usage).

## Pinned release

| Field       | Value              |
| ----------- | ------------------ |
| Release tag | `v26.9.9-1.0.1fed` |

Release published 2026-09-26T16:07:45Z (upstream releases API); tag commit
committer date 2026-09-26T16:06:17Z:

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| Commit SHA | `036606649aae3ee36102b02e6437c7266bc2f2be` |

Source repository: `github.com/Fedarisha/Xray-core-fedarisha` (Go,
**MPL-2.0** — corrected 2026-10-08 from the BRIEF's GPL-3.0 claim: the LICENSE
file inside every release asset reads "Mozilla Public License Version 2.0" and
the GitHub license API reports `MPL-2.0`; the bundled binary still triggers
the BRIEF §5 / M2-06 attribution duties — the client itself stays GPL-3.0).

## Pinned assets

One row per bundled platform (darwin-x64, darwin-arm64, linux-x64 per
BRIEF §9; Linux package formats AppImage + `.deb` + `.rpm` per the owner
decision of 2026-10-08). SHA-256 values were computed from the downloaded
release assets on 2026-10-08 and cross-checked against the upstream
`.dgst` files shipped with the release (`SHA2-256=` lines) — all three
matched.

| Asset                      | SHA-256                                                          | Bytes    |
| -------------------------- | ---------------------------------------------------------------- | -------- |
| `Xray-linux-64.zip`        | bf586dbff2ae9e79ebf1619c2c9b3516fd60f09c19b0b944e56327915e705648 | 22964959 |
| `Xray-macos-64.zip`        | 552c1789b28d0ca0d41f704b62e5c7b16f5ca616a7859a4d4c20a29f6ab84f71 | 22733366 |
| `Xray-macos-arm64-v8a.zip` | 13a8eb7d8220c9f61a174ef309a402424db5b91fad4e06732a8c9b9799fa29e1 | 21388276 |

## Verification contract (M2 DoD #1)

- Build/pack time: every downloaded asset goes through
  `npm run verify:core-pin -- <file> <asset>`; a non-zero exit fails the
  build (wired into the release CI in M2-07).
- Pin bumps are a deliberate act: update the release-tag row, the
  commit-SHA row and the asset table together, then re-run the verifier.
  The raw-text pins in `tests/unit/core-pin.test.ts` read this file
  directly (DV-39), so the structure above is contract, not decoration.

# Third-party notices

S3 Bypass Desktop (the "application") ships the following third-party
components inside its artifacts (dmg / AppImage / deb / rpm). Full license
texts live **in this directory** — they are copied verbatim from the
upstream sources listed below.

## Bundled components

### Xray-core-fedarisha — MPL-2.0

- Project: `github.com/Fedarisha/Xray-core-fedarisha` (Go), a fork of
  Xray-core.
- License: **Mozilla Public License 2.0** (`xray-core-fedarisha-LICENSE.txt`
  in this directory). The client-side license reconciliation of 2026-10-08
  corrected an earlier GPL-3.0 claim about this component — see
  `docs/analysis/core-pin.md` for the provenance of the pinned build
  (release tag, commit SHA and SHA-256 of every asset) and the evidence.
- How it is used: executed as a separate child process to run the tunnel;
  the source of the exact binary is the pinned release, staged by
  `npm run prepare:core`.

### Electron — MIT

- Project: `github.com/electron/electron`.
- License: MIT (`electron-LICENSE.txt` in this directory).

### react, react-dom — MIT

- Project: `github.com/facebook/react`.
- License: MIT (`react-LICENSE.txt` in this directory).

## The application itself

- S3 Bypass Desktop client code: **GPL-3.0-or-later** — see the repository
  root `LICENSE` and the `license` field of `package.json`.

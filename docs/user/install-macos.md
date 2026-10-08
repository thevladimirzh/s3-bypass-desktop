# Install on macOS

The macOS build is **unsigned**: there is no Apple Developer account behind it,
so macOS treats any downloaded dmg as an unidentified developer. That is
expected, not a bug — nothing is wrong with your Mac.

> Longer Gatekeeper background and the exact dialog wording:
> [docs/product/macos-gatekeeper.md](../product/macos-gatekeeper.md).

## Steps

1. Download `S3 Bypass Desktop-<version>-arm64.dmg` (Apple Silicon) or
   `S3 Bypass Desktop-<version>-x64.dmg` (Intel) — check
   `release/SHA256SUMS.txt` if the download came from a release run.
2. Open the dmg and drag **S3 Bypass Desktop** into Applications.
3. First launch — Gatekeeper blocks the app. **Control-click** (or
   right-click) the app icon in Applications, choose **Open** in the menu, then
   click **Open** again in the dialog. The app launches and macOS remembers
   this approval — subsequent launches are normal double-clicks.

## Why this way

Picking **Open** from the Control-click menu approves this specific app once.
You do not have to turn Gatekeeper off system-wide, and you should not.

If macOS still refuses (for example after re-downloading, which re-sets the
quarantine flag), repeat the Control-click → **Open** step — do not disable
Gatekeeper globally.

## Next

- [First profile](first-profile.md) — import a config and start the tunnel.

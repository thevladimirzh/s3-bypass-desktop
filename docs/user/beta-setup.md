# Beta setup — tester handout

You are testing **S3 Bypass Desktop**, a desktop client for the fedarisha S3
tunnel. This page is everything you need to install the beta, check it is
intact, and report what you find.

## 1. Download the right installer

| Platform             | Artifact                                 |
| -------------------- | ---------------------------------------- |
| macOS, Apple Silicon | `S3 Bypass Desktop-<version>-arm64.dmg`  |
| macOS, Intel         | `S3 Bypass Desktop-<version>-x64.dmg`    |
| Linux, any distro    | `S3 Bypass Desktop-<version>.AppImage`   |
| Debian / Ubuntu      | `s3-bypass-desktop_<version>_amd64.deb`  |
| Fedora / RHEL        | `s3-bypass-desktop-<version>.x86_64.rpm` |

## 2. Verify the download

Every release run writes `release/SHA256SUMS.txt`. Check your file against it
before installing:

```bash
shasum -a 256 "S3 Bypass Desktop-<version>…"   # macOS
sha256sum "S3 Bypass Desktop-<version>…"        # Linux
```

The line in `SHA256SUMS.txt` must match byte for byte. If it does not — do not
install, report it.

## 3. Install

- macOS (unsigned build + Gatekeeper): [install-macos.md](install-macos.md)
- Linux: [install-linux.md](install-linux.md)

## 4. Run the first loop

[first-profile.md](first-profile.md) — import the config you were given,
press **Start**, wait for the `Running` badge, browse.

## 5. Report what you see

Use [troubleshooting.md](troubleshooting.md) to find the **Copy logs** button
and paste the copied log rows into your report. Please include:

- OS + version, chip (Apple Silicon / Intel / x64 Linux)
- installer artifact name and whether `SHA256SUMS` matched
- what you did, what you expected, what happened (screenshot helps)

Known limitations for this beta: the macOS build is unsigned (Control-click →
Open — see install-macos), and the manual-proxy fallback exists for desktops
the app cannot configure itself.

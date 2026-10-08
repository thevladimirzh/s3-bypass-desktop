# Install on Linux

Three artifacts ship for Linux, all x64 — pick the one your distribution
wants (names follow `S3 Bypass Desktop-<version>.<ext>`; verify against
`release/SHA256SUMS.txt` when the file came from a release run):

| Artifact    | For                         |
| ----------- | --------------------------- |
| `.AppImage` | any distro, no install step |
| `.deb`      | Debian, Ubuntu and friends  |
| `.rpm`      | Fedora, RHEL, openSUSE      |

## AppImage

```bash
chmod +x "S3 Bypass Desktop-<version>.AppImage"
./"S3 Bypass Desktop-<version>.AppImage"
```

The file must be executable (`chmod +x`) or the shell refuses to run it —
this is the one step downloads never do for you.

## Debian / Ubuntu (.deb)

```bash
sudo dpkg -i s3-bypass-desktop_<version>_amd64.deb
```

If `dpkg` complains about a missing dependency:

```bash
sudo apt-get install -f
```

## Fedora / RHEL (.rpm)

```bash
sudo rpm -i s3-bypass-desktop-<version>.x86_64.rpm
# or
sudo dnf install ./s3-bypass-desktop-<version>.x86_64.rpm
```

## Next

- [First profile](first-profile.md) — import a config and start the tunnel.

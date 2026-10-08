# macOS: opening the unsigned build

Status: active · Owner: DevOps (board task M2-05) · Language: English
Gatekeeper instructions for the packaging promise in
`docs/plans/milestones.md` §M2 (BRIEF §9: "unsigned build + Gatekeeper
instructions").

**Why it is unsigned:** the owner decided on 2026-10-08 not to buy an
Apple Developer account (cost, BRIEF §10). S3 Bypass Desktop therefore
ships an unsigned build that carries **NO notarization** and no
code-signing identity (`mac.identity: null` in `electron-builder.yml`,
TC-PKG-05). macOS will warn on the first launch — nothing is broken;
pick ONE of the paths below.

## First launch (recommended)

1. In Finder, **right-click** (Control-click) `S3 Bypass Desktop.app`
   and choose **Open**.
2. When macOS says it cannot verify the developer, click **Open**
   again.
3. The app is remembered from then on — a normal double-click works.

## System Settings path (when double-click was blocked)

1. Try to open the app once (it gets blocked).
2. Open **System Settings → Privacy & Security**.
3. Scroll to the Security section — you will see a line saying
   "S3 Bypass Desktop" was blocked from use — click **Open Anyway**.
4. Confirm with **Open** in the dialog.

## Alternative: clear the quarantine flag

Apps downloaded through a browser carry the `com.apple.quarantine`
attribute. Remove it from a Terminal and the app opens normally:

```sh
xattr -cr "/Applications/S3 Bypass Desktop.app"
```

## What was deliberately not done

- No Developer ID signing and **no notarization** — owner decision of
  2026-10-08 (BRIEF §10), not a defect.
- No auto-update channel: every new version is downloaded and verified
  the same way as this one (SHA-256 pins in
  `docs/analysis/core-pin.md`).

If Gatekeeper behaves differently from the paths above, capture the
exact wording and file it as a GitHub issue.

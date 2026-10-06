# Backlog — post-MVP

Source: `BRIEF.md §3` (Out of MVP). Owner: Product Manager.
Rule: **nothing here enters a milestone without explicit owner promotion**;
promoting an item requires moving it into `PRD.md §4` and writing a story.
New ideas arrive here with a one-line value statement — never into the spec.

Priority key: **P1** = next after MVP, high user value · **P2** = valuable,
not urgent · **P3** = nice to have / blocked on external dependency.

## P1 — strong candidates for the first post-MVP milestone

| ID   | Item                                                  | Rationale (one line)                                                                                                |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B-01 | Russian locale (i18n)                                 | Primary audience is Russian-speaking; English-only UI is the biggest adoption friction after the core loop works.   |
| B-02 | Profile distribution from a bot / URL import          | The config already reaches users via a bot — importing from URL closes the last manual step of "paste a JSON file". |
| B-03 | S3-provider presets                                   | Pre-filled presets remove the most common source of invalid configs (field names differ per provider).              |
| B-04 | Auto-restart on core crash (with backoff)             | Turns a `core-crashed` dead-end into self-healing connectivity, the user's actual goal.                             |
| B-05 | Configurable SOCKS port (+ port-occupied auto-choice) | Unblocks users whose 10808 is taken and coexistence with other proxy tools (resolves PRD Q-03 beyond MVP).          |

## P2 — valuable, not urgent

| ID   | Item                                  | Rationale (one line)                                                                                                            |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B-06 | TUN mode                              | Catches traffic that ignores system proxy settings (DNS leaks, CLI tools), closing a coverage gap of the system-proxy approach. |
| B-07 | Split tunneling                       | Lets users exempt specific apps from the tunnel, reducing support load for "app X doesn't work" reports.                        |
| B-08 | Start at OS login (autostart)         | Removes a manual step on every boot for a tool whose value is always-on connectivity.                                           |
| B-09 | On-disk log export (redacted, opt-in) | Makes remote debugging with P2 volunteers possible without screen sharing.                                                      |
| B-10 | Profile list with switching           | Supports users with several configs/providers (depends on PRD Q-01 decision).                                                   |

## P3 — nice to have / blocked on external dependency

| ID   | Item                                                          | Rationale (one line)                                                                                 |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| B-11 | Auto-update                                                   | Reduces version fragmentation, but blocked until signing/notarization and release CI exist (M2+).    |
| B-12 | macOS notarization                                            | Removes Gatekeeper friction; blocked on an Apple Developer account (owner call, PRD Q-06 context).   |
| B-13 | Windows support                                               | Largest untouched audience, but triples the packaging/QA matrix — only after macOS/Linux are stable. |
| B-14 | Deep OS integration (quick settings, KDE proxy backend, etc.) | Polish beyond the honest manual hint in US-04; low marginal value until the DE matrix grows.         |
| B-15 | Linux `arm64` in CI matrix                                    | Parity with darwin-arm64; deferred per BRIEF §9 ("arm64 follows").                                   |

## Triage log

| Date    | Event                                                |
| ------- | ---------------------------------------------------- |
| Initial | All items above seeded from BRIEF §3; no P0 changes. |

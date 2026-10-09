# Backlog — post-MVP

Source: `BRIEF.md §3` (Out of MVP). Owner: Product Manager.
Rule: **nothing here enters a milestone without explicit owner promotion**;
promoting an item requires moving it into `PRD.md §4` and writing a story.
New ideas arrive here with a one-line value statement — never into the spec.

Priority key: **P1** = next after MVP, high user value · **P2** = valuable,
not urgent · **P3** = nice to have / blocked on external dependency.

## P1 — strong candidates for the first post-MVP milestone

| ID   | Item                                                  | Rationale (one line)                                                                                                               |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | Russian locale (i18n)                                 | Primary audience is Russian-speaking; English-only UI is the biggest adoption friction after the core loop works.                  |
| B-02 | Profile distribution from a bot / URL import          | The config already reaches users via a bot — importing from URL closes the last manual step of "paste a JSON file".                |
| B-03 | S3-provider presets                                   | Pre-filled presets remove the most common source of invalid configs (field names differ per provider).                             |
| B-04 | Auto-restart on core crash (with backoff)             | Turns a `core-crashed` dead-end into self-healing connectivity, the user's actual goal.                                            |
| B-05 | Configurable SOCKS port (+ port-occupied auto-choice) | Unblocks users whose 10808 is taken and coexistence with other proxy tools (resolves PRD Q-03 beyond MVP).                         |
| B-16 | Data-plane health check (dead-tunnel detection)       | Core process can stay alive while the tunnel stalls — UI shows "Connected" though no traffic flows (beta observation, 2026-10-09). |

## P2 — valuable, not urgent

| ID   | Item                                  | Rationale (one line)                                                                                                            |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B-06 | TUN mode                              | Catches traffic that ignores system proxy settings (DNS leaks, CLI tools), closing a coverage gap of the system-proxy approach. |
| B-07 | Split tunneling                       | Lets users exempt specific apps from the tunnel, reducing support load for "app X doesn't work" reports.                        |
| B-08 | Start at OS login (autostart)         | Removes a manual step on every boot for a tool whose value is always-on connectivity.                                           |
| B-09 | On-disk log export (redacted, opt-in) | Makes remote debugging with P2 volunteers possible without screen sharing.                                                      |
| B-10 | Profile list with switching           | Supports users with several configs/providers (depends on PRD Q-01 decision).                                                   |

## P3 — nice to have / blocked on external dependency

| ID   | Item                                                          | Rationale (one line)                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-11 | Auto-update                                                   | Reduces version fragmentation, but blocked until signing/notarization and release CI exist (M2+).                                                                                                                    |
| B-12 | macOS notarization                                            | Removes Gatekeeper friction; blocked on an Apple Developer account (owner call, PRD Q-06 context).                                                                                                                   |
| B-13 | Windows support                                               | Largest untouched audience, but triples the packaging/QA matrix — only after macOS/Linux are stable.                                                                                                                 |
| B-14 | Deep OS integration (quick settings, KDE proxy backend, etc.) | Polish beyond the honest manual hint in US-04; low marginal value until the DE matrix grows.                                                                                                                         |
| B-15 | Linux `arm64` in CI matrix                                    | Parity with darwin-arm64; deferred per BRIEF §9 ("arm64 follows").                                                                                                                                                   |
| B-17 | Tunnel stalls under parallel network load (upstream core)     | yamux/S3 session holes + 60 s ACK timeouts under concurrent downloads degrade the tunnel until self-redial (~1–2 min); blocked on `Fedarisha/Xray-core-fedarisha`.                                                   |
| B-18 | Fork the core as our own build (owner intent)                 | If the upstream stall is not fixed, take over the core at fork level (own versioning/CI, MPL-2.0 compliant) — owner decision 2026-10-09: "level 2 minimum"; wire protocol stays compatible with the upstream server. |

## Triage log

| Date       | Event                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial    | All items above seeded from BRIEF §3; no P0 changes.                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-09 | Beta observation (owner machine): 6 parallel 50 MB downloads through the SOCKS froze all traffic (15 s timeouts, `CLOSE_WAIT` pile-up) while the core process stayed alive; logs showed `hole at seq … closing for re-dial` and `server did not ACK within 60s`; recovered by itself in ~1.5 min. Seeded B-16 (app-side detection) and B-17 (upstream core robustness). Direct line unaffected: ~216 Mbit/s, 0 % loss. |
| 2026-10-09 | Upstream `Fedarisha/Xray-core-fedarisha` has issues+discussions disabled; stall report filed as PR #2 (docs report). Owner decision: if the stall is not addressed upstream, take over the core at fork level (level 2, own build/versioning) — seeded B-18.                                                                                                                                                           |

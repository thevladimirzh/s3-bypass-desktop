# US-04 — System-proxy toggle

> **Amended 2026-10-08 — owner decisions (M1-27 acceptance Q1/Q2, recorded in
> `docs/qa/acceptance-m1-27.md` §8):** system proxy applies **automatically at
> tunnel start** (toggle stays as visible control/override), and apply is
> **SOCKS-only per FR-31** — AC-04.1's `-getsecurewebproxy` literal was
> removed; AC-04.6/AC-04.7 reworded to match. No new AC IDs (baseline
> unchanged).

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | US-04                                                                                                                              |
| **P0 item**    | BRIEF §2.4 — System-proxy toggle                                                                                                   |
| **Persona**    | P1 (primary)                                                                                                                       |
| **Priority**   | P0                                                                                                                                 |
| **INVEST**     | Independent (usable without US-05/06; logically follows US-02), Negotiable (per-DE behavior), Valuable, Estimable, Small, Testable |
| **Depends on** | US-02 (proxy must be running first, AC-04.4)                                                                                       |

## Narrative

One toggle. On macOS the app runs `networksetup`; on GNOME Linux it uses
`gsettings`. On any other desktop environment the toggle is replaced by an
honest manual-instructions hint. The system proxy is applied automatically
when the tunnel starts; the toggle mirrors that state and may turn it
off/on while the core runs. Turning it off must restore the exact previous
settings — fail closed (PRD principle 4).

## Acceptance criteria (Given/When/Then)

- **AC-04.1** Given the core is `running`, When the tunnel starts (auto-apply)
  or the user turns the toggle On on macOS, Then
  `networksetup -getsocksfirewallproxy` for the active service shows
  `127.0.0.1:10808` (SOCKS enabled), the secure-web proxy settings are left
  unchanged (snapshot/restore input only — SOCKS-only per FR-31), and the
  toggle shows "On".
- **AC-04.2** Given the toggle is On on a GNOME Linux session, When inspected,
  Then `gsettings` reports SOCKS proxy `127.0.0.1:10808` enabled for the
  active connection scheme.
- **AC-04.3** Given the toggle is On, When the user turns it Off, Then the
  system proxy settings are byte-for-byte equal to their pre-toggle values
  (QA captures before/after snapshots).
- **AC-04.4** Given the core is not `running`, Then the toggle is disabled
  with the hint "Start the tunnel first".
- **AC-04.5** Given a non-GNOME Linux desktop (e.g. KDE without the GNOME
  schema, or i3), When the user opens the proxy section, Then instead of a
  broken toggle the app shows an honest "not supported on this desktop — set
  it manually" hint including the exact values (`127.0.0.1`, `10808`).
- **AC-04.6** Given an apply attempt (auto at start or toggle-On) fails with
  a non-zero exit, Then the system proxy stays unapplied, the core keeps
  running (the proxy layer is optional — cf. AC-04.4), the toggle shows Off,
  a plain-language error is shown, and no partial proxy change is left
  unreported.
- **AC-04.7** Given the system proxy is applied (auto at start or by the
  toggle), When the user stops the core or quits the app, Then the proxy is
  reverted; if revert fails, a persistent warning with manual instructions is
  shown — never a silent leftover.

## Edge cases

- Several active network services on macOS → applies to the active one; if
  ambiguous, behavior per Q-B and stated in the UI.
- User edits system proxy manually while the toggle is On → app does not fight
  the user; toggle-Off restores the pre-toggle snapshot or warns on conflict
  (Q-B).
- `gsettings` binary present but schema missing → same as AC-04.5.
- Toggle On, then suspend/resume with core dead → status (US-03) and toggle
  must not contradict each other (toggle reverts or warns).

## Open questions

- **Q-B:** which macOS service wins when several are active; snapshot vs.
  live tracking when the user edits OS proxy mid-session.
- **Q-07 (PRD):** officially claim GNOME-only support for the toggle?

# Security Review M1-10 — IPC surface + secret storage

Date: 2026-10-07 · Reviewer: `security` agent (read-only) · Scope: M1-07 (IPC) +
M1-09 (secret store) tree · **Verdict: PASS — no S1, no S2. M1-07 and M1-09 not
blocked from `done`.** Three S3 findings → issues; six S4 findings → tracking issues.

## Findings

| ID   | Sev    | Finding                                                                                                                                                   | Disposition                                                                                                                                                                |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 | medium | Sender validation (M0-19 S4-4 / issue #1) landed **zero** while channels grew 1 → 11: no handler checks `event.senderFrame` (`src/main/index.ts:101-191`) | **Issue #1 updated — deadline: before M1-12** (shared `assertTrustedSender(event)` first in every handler, using the already-computed allowed origins at `index.ts:68-70`) |
| S3-2 | medium | Deny-by-default permission handler (issue #1 second half) landed **zero**: no `setPermissionRequestHandler` anywhere                                      | **Issue #1 updated — same deadline**; default Electron handling is allow-by-default for several permissions                                                                |
| S3-3 | medium | Navigation allowlist accepts ANY `file://` URL (`index.ts:69-70`) — a local attacker-controlled HTML would keep the 11-member bridge attached             | **New issue** — allow only the exact app document path + exact dev URL                                                                                                     |
| S4-1 | low    | `loadProfile`: `storePath()` outside try (raw exception if `getPath` throws pre-ready); `readFileSync` with no size cap (`secret-store.ts:143,150`)       | **New issue** (store hardening) — wrap path, `statSync` cap ≤ 10 MB → `E-STOR-003`                                                                                         |
| S4-2 | low    | `saveProfile` accepts unbounded `profileJson` — defensive cap belongs in the store, not only the future validator (`secret-store.ts:109`)                 | same issue as S4-1 — cap ≤ 1 MB                                                                                                                                            |
| S4-3 | low    | `broadcastStatus` sends to all windows; no `isDestroyed()` guard (harmless today: single window, non-secret payload)                                      | **Tracking issue** — target the loading `webContents` before multi-window                                                                                                  |
| S4-4 | low    | `proxy:set` payload not runtime-validated (TS types erased; placeholder today)                                                                            | **Tracking issue — deadline M1-21** (typeof checks; applies to all future payload-bearing handlers)                                                                        |
| S4-5 | low    | `CORE_BINARY_PATH` env override will mean executable substitution once M1-15 spawns the core (`.env.example:6-7`)                                         | **Tracking issue — deadline M1-15** — honor only when `!app.isPackaged`                                                                                                    |
| S4-6 | low    | No rate limiting on invoke handlers (trivial now; M1-12 modal-per-call, M1-13/19 decrypt-per-call change the math)                                        | **Tracking issue** — dedupe dialogs, throttle expensive handlers when they land                                                                                            |

## Explicit passes (evidence preserved in the review transcript)

1. **Secrets scan** — repo-wide credential patterns hit only deliberate `EXAMPLE…` canaries and empty `.env.example` placeholders; no `.env`, no keys/logs; no `console.*` in `src` except the boot marker; E-IO-004 / E-PLAT-001 / E-STOR-* triples match `errors.md` verbatim, raw OS messages dropped.
2. **Denylist** — no secret-class field in any payload type (`ProfileSummary` is INTERNAL-only per §8.4); grep clean; type-level pin in `ipc-contract.test.ts:665-673`.
3. **Preload bridge** — no raw passthrough (channel args compile-time constrained), 1:1 allowlist mapping, unsubscribe-per-wrapper only, zero `any`/`@ts-ignore`.
4. **Handlers & window** — 11 handlers ≡ `IPC_INVOKE_CHANNELS`; placeholders persist nothing; window flags intact; popup/navigation/https/packaged guards all in place.
5. **Secret store** — availability-check → refuse → encrypt → write order (no plaintext fallback), 0600 create+overwrite, fixed path (no traversal), no IPC imports, idempotent delete, documented triples only.
6. **Injection** — no `innerHTML`/`eval`/shell sinks; JSX escaping; strict prod CSP; dev relaxation dev-gated.
7. **Interplay** — no IPC path returns/stores/moves secret material; `main/index.ts` does not import `secret-store`; placeholders write nothing.
8. **Dependencies** — runtime deps still react/react-dom only; M0 S4-5 unchanged (gated at M2).

## Answers to specific questions

- **Issue #1 status:** zero of both halves landed; scope correct, but severity rose low → medium with the channel expansion; deadline set to **before M1-12**.
- **`Partial<S3BypassApi>` (M1-07 deviation):** type-only on the window binding; cannot admit extra members or loosen payload types; runtime allowlist tests enumerate the real object → **no security impact**. Recommendation: prefer a named test-stub type over `Partial` so renderer code isn't nudged toward optional-member calls (logged as DV follow-up for QA).
- **Blocking:** none — M1-07 and M1-09 move to `done`.

## Standing guidance for upcoming tasks

- M1-12: sender validation lands (issue #1) before native dialogs open per call; dialog opens deduped (S4-6).
- M1-15: `CORE_BINARY_PATH` guard (S4-5); spawn via `execFile`/`spawn(args[])` per M0-19 standing note.
- M1-21: runtime payload validation pattern (S4-4).

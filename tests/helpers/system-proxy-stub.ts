/**
 * Shared machinery for the M1-20 (RED) system-proxy batch — pure command
 * construction + platform branching only: NO real `networksetup`/`gsettings`
 * ever runs, because every OS call travels through the injected `run`
 * (docs/qa/strategy §1 synthetic-only rule; plan M1-20 is construction-level).
 *
 * Declares the M1-21 contract surface (full text in the header of
 * `tests/unit/system-proxy.test.ts`): module `src/main/system-proxy.ts`
 * exporting pure argv builders (`buildMac*`/`buildGnome*`), a parameterised
 * `isSupportedPlatform(platform, desktopEnv?)`, and
 * `setSystemProxy(ctx)` / `restoreSystemProxy(ctx, snapshot|null)` over an
 * injected executor `run(args: string[]) => Promise<{code, stdout, stderr}>`
 * (PR-08: arg arrays, never a shell string).
 *
 * Loader note: `import(systemProxyModule)` takes a NON-LITERAL specifier on
 * purpose — `tests/**` is inside `tsconfig.node.json`'s `include`, so a
 * literal import of the not-yet-existing module would make `npm run typecheck`
 * fail (which must stay exit 0 during RED). At runtime Vitest resolves the
 * relative specifier against this file, so the moment M1-21 creates the module
 * the very same line loads it: absence RED becomes assertion RED with zero
 * test edits (strategy §5.2). Verified: the same non-literal pattern resolves
 * existing modules.
 *
 * This file is a helper, not a suite: `vitest.config.ts` collects only
 * `*.test.ts(x)` under `tests/`.
 */
import { expect } from 'vitest';

import type { OperationResult } from '../../src/shared/ipc';
import type { AppError } from '../../src/shared/status-machine';

/** Result of one argv-array command (contract: PR-08, data-flows (c)). */
export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injectable executor — the ONLY way the module may reach the OS. */
export type RunCommand = (args: string[]) => Promise<CommandResult>;

/** Everything a `setSystemProxy`/`restoreSystemProxy` call needs. */
export interface SystemProxyContext {
  /** `process.platform` equivalent — PASSED IN, never read from the ambient env. */
  readonly platform: string;
  /** `XDG_CURRENT_DESKTOP` value — PASSED IN (may be undefined). */
  readonly desktopEnv?: string | undefined;
  /** Injected command executor; tests record/answer through it. */
  readonly run: RunCommand;
}

/** One `-get*proxy` line group as the module must parse it (Enabled/Server/Port). */
export interface MacProxySetting {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
}

/** macOS snapshot captured before apply, replayed byte-for-byte on restore (FR-31/AC-04.3). */
export interface MacProxySnapshot {
  readonly service: string;
  readonly socks: MacProxySetting;
  readonly secureWeb: MacProxySetting;
}

/** GNOME snapshot: the documented `(mode, host, port)` triple (data-flows §3.2). */
export interface GnomeProxySnapshot {
  readonly mode: string;
  readonly socksHost: string;
  readonly socksPort: number;
}

export type SystemProxySnapshot = MacProxySnapshot | GnomeProxySnapshot;

/** Platform-detection answer; `hint` is the exact data-flows §3.3 sentence when unsupported. */
export interface PlatformSupport {
  readonly supported: boolean;
  readonly hint?: string | undefined;
}

/** `setSystemProxy`: success carries the captured snapshot the caller must restore later. */
export type SetSystemProxyResult =
  | { readonly ok: true; readonly snapshot: SystemProxySnapshot }
  | { readonly ok: false; readonly error: AppError };

/** Module surface QA declares for M1-21 (header-contract style, cf. DV-09/DV-16/DV-23). */
export interface SystemProxyApi {
  /** data-flows §3.1 step 1 — `['networksetup', '-listnetworkserviceorder']`. */
  buildMacDetectCommand(): string[];
  /** §3.1 step 2 — snapshot reads: `-getsocksfirewallproxy`, `-getsecurewebproxy`. */
  buildMacSnapshotCommands(service: string): string[][];
  /** §3.1 step 3 — APPLY argv arrays (SOCKS `127.0.0.1:<port>`, then `on`). */
  buildMacOnCommands(service: string, host: string, port: number): string[][];
  /** DISABLE step 1 — inverse argv arrays replaying the captured snapshot. */
  buildMacRestoreCommands(snapshot: MacProxySnapshot): string[][];
  /** §3.2 SNAPSHOT — `gsettings get` for mode / socks host / socks port. */
  buildGnomeSnapshotCommands(): string[][];
  /** §3.2 APPLY — `gsettings set` for socks host, socks port, mode `manual`. */
  buildGnomeOnCommands(host: string, port: number): string[][];
  /** §3.2 DISABLE step 1 — restore the `(mode, host, port)` triple. */
  buildGnomeRestoreCommands(snapshot: GnomeProxySnapshot): string[][];
  /** Pure platform rule (PR-01/PR-02) — parameterised, never reads `process.env`. */
  isSupportedPlatform(platform: string, desktopEnv?: string | undefined): PlatformSupport;
  /**
   * Full ENABLE flow of data-flows (c): support check → detect/probe → snapshot
   * → apply → verify. Resolves `{ ok:true, snapshot }`, or `{ ok:false, error }`
   * with the documented triple (E-PLAT-001 unsupported / E-PLAT-002 command
   * failure after a snapshot-restore attempt).
   */
  setSystemProxy(context: SystemProxyContext): Promise<SetSystemProxyResult>;
  /**
   * DISABLE/STOP/CRASH/QUIT flow: replays `snapshot` through the executor.
   * `snapshot === null` (nothing was ever set) is an idempotent no-op that
   * resolves `{ ok:true }` without invoking `run` at all; a failing command
   * resolves `{ ok:false, E-PLAT-003 }` (FR-35, fail closed — never throws).
   */
  restoreSystemProxy(
    context: SystemProxyContext,
    snapshot: SystemProxySnapshot | null,
  ): Promise<OperationResult>;
}

/**
 * Non-literal on purpose (see file header): typecheck stays green while
 * `src/main/system-proxy.ts` does not exist; the runtime resolution is the
 * legitimate *absence RED* reason for this batch (strategy §5.2) — never
 * weaken this path or the tests behind it.
 */
const systemProxyModule: string = '../../src/main/system-proxy';

export async function loadSystemProxy(): Promise<SystemProxyApi> {
  return (await import(/* @vite-ignore */ systemProxyModule)) as SystemProxyApi;
}

/** Answers one `run` call: `{ code, stdout, stderr }` — canned or failing. */
export type RunResponder = (callIndex: number, args: string[]) => CommandResult;

/** Records every argv array the module hands to the executor, in call order. */
export interface RunRecorder {
  readonly calls: string[][];
  readonly run: RunCommand;
}

/**
 * Build a recording executor. PR-08 structural guarantee: `run` refuses
 * anything that is not an argv array, so a shell-string implementation can
 * never satisfy these suites even by accident.
 */
export function recordingRun(respond?: RunResponder): RunRecorder {
  const calls: string[][] = [];
  const run: RunCommand = async (args) => {
    if (!Array.isArray(args)) {
      throw new Error(
        `run must receive an argv array (PR-08) — received ${typeof args}: ${String(args)}`,
      );
    }
    const index = calls.length;
    calls.push([...args]);
    if (respond === undefined) {
      return { code: 0, stdout: '', stderr: '' };
    }
    return respond(index, args);
  };
  return { calls, run };
}

/** Successful command with the given stdout (synthetic, no real OS output). */
export function ok(stdout = ''): CommandResult {
  return { code: 0, stdout, stderr: '' };
}

/** Failing command as `FAKE_CMD_FAIL=1`/a broken OS would report it. */
export function fail(stderr = 'simulated command failure'): CommandResult {
  return { code: 1, stdout: '', stderr };
}

// ─── Canned OS outputs (synthetic; exact formats per data-flows (c)) ─────────

/** `-listnetworkserviceorder` with exactly ONE candidate (multi-service = Q-B). */
export const MAC_DETECT_WIFI = '(1) Hardware Port: Wi-Fi, Device: en0\n';
/** Same, single Ethernet candidate — the Wi-Fi/Ethernet service pair of TC-04-01. */
export const MAC_DETECT_ETHERNET = '(1) Hardware Port: Ethernet, Device: en1\n';

/** `-getsocksfirewallproxy` / `-getsecurewebproxy` — prior state: disabled. */
export const MAC_SETTING_DISABLED =
  'Enabled: No\nServer: \nPort: 0\nAuthenticated Proxy Enabled: 0\n';
/** Getter output — prior state: some other proxy `proxy.example.internal:8080`. */
export const MAC_SETTING_OTHER_PROXY =
  'Enabled: Yes\nServer: proxy.example.internal\nPort: 8080\nAuthenticated Proxy Enabled: 0\n';
/** Getter output after a successful apply (verify step — AC-04.1). */
export const MAC_SETTING_APPLIED =
  'Enabled: Yes\nServer: 127.0.0.1\nPort: 10808\nAuthenticated Proxy Enabled: 0\n';

/** `gsettings get` outputs (string keys come back single-quoted). */
export const GNOME_GET_MODE_NONE = "'none'\n";
export const GNOME_GET_MODE_MANUAL = "'manual'\n";
export const GNOME_GET_HOST_EMPTY = "''\n";
export const GNOME_GET_HOST_LOOPBACK = "'127.0.0.1'\n";
export const GNOME_GET_PORT_ZERO = '0\n';
export const GNOME_GET_PORT_10808 = '10808\n';

/** The EXACT unsupported-desktop hint sentence (data-flows §3.3, E-PLAT-001). */
export const MANUAL_HINT =
  'Not supported on this desktop — set it manually: SOCKS proxy 127.0.0.1, port 10808.';

/** The E-PLAT-001 triple exactly as `errors.md` §4 + the existing placeholder word it. */
export const MANUAL_PROXY_ERROR = {
  code: 'E-PLAT-001',
  title: 'Manual proxy setup required',
  cause: 'Automatic system-proxy control is not supported on this desktop environment.',
  nextStep: 'Set it manually: SOCKS proxy 127.0.0.1, port 10808.',
} as const;

/** Narrowing helper: the operation must fail with `code`; returns the triple. */
export async function failedOperation(
  resultPromise: Promise<SetSystemProxyResult | OperationResult>,
  code: string,
): Promise<AppError> {
  const result = await resultPromise;
  if (result.ok) {
    throw new Error(`expected the operation to fail with ${code} but it resolved ok:true`);
  }
  expect(result.error.code, `expected ${code}`).toBe(code);
  return result.error;
}

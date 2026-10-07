/**
 * Core supervisor — M1-15 (GREEN half of the M1-14 contract declared in the
 * header of `tests/unit/core-supervisor.test.ts` and mirrored as types in
 * `tests/helpers/core-supervisor-stub.ts`, DV-23 in docs/qa/m1-test-plan.md §14).
 *
 * Spec: docs/analysis/data-flows.md flow (b) §2.1–§2.3 (materialization →
 * spawn → readiness → exit supervision + state machine);
 * docs/analysis/requirements.md F3 (FR-13..FR-23) and PR-08 (argv arrays,
 * never a shell string); docs/analysis/errors.md §2/§3 (E-IO-003/004/006,
 * E-CORE-001/002/003) and §6 (child reaped, T deleted);
 * docs/plans/m1-mvp.md M1-15.
 *
 * Pure node on purpose (TC-02-14): no Electron import and no shell — the core
 * child is spawned with an argument array, and state pushes plus raw output
 * travel through the injected `onStateChange`/`logSink` callbacks only (the
 * wiring into main belongs to M1-16/M1-17).
 *
 * `start()` sequence (data-flows (b) steps 1–6, re-derived in the test header):
 *   1. binary exists → else E-IO-004 (FR-14); no transition, no spawn.
 *   2. state gate via the EXISTING status-machine reducer → else E-VAL-015
 *      (FR-18). It runs BEFORE the port probe: while the core runs, its own
 *      inbound holds 10808, so a port-first order would misreport a double
 *      Start as E-IO-003 instead of the reducer's E-VAL-015 (TC-02-07).
 *   3. port 10808 free → else E-IO-003 (FR-15); still no transition.
 *   4. materialize T (FR-22/FR-23): merge the app-owned loopback inbound,
 *      resolve profile paths from T's directory, write mode 0600. This runs
 *      BEFORE the `starting` emission because the reducer has no
 *      `starting → stopped` edge — a write failure must settle with
 *      E-IO-006 while the observable state stays `stopped` (errors.md §2).
 *   5. `stopped → starting` emitted; spawn `binaryPath` with the documented
 *      argv `[run, -c, T]` (PR-08: args array, no shell; no `env` option so
 *      the child inherits `process.env` — the FAKE_CORE_* fixture contract).
 *   6. readiness = TCP connect 127.0.0.1:10808 within 10 s of spawn (FR-20,
 *      FR-21, A-11/A-12): ok → `starting → running`, lastError cleared;
 *      timeout → SIGTERM (2 s → SIGKILL), reap, `starting → crashed` with
 *      E-CORE-002.
 *   7. exit watcher (step 8): unexpected exit while `starting`/`running` →
 *      `crashed` + E-CORE-001 (cause names the exit code and the last child
 *      line); requested stop → `stopping → stopped`, exit code ignored (A-13).
 *      Every terminal path reaps the child (errors.md §6) and deletes T (FR-23).
 *
 * `stop()` (steps 7–8): `running → stopping` emitted → SIGTERM (2 s budget →
 * SIGKILL, FR-16) → child exit observed → T deleted → `stopped` emitted. The
 * exit is observed on the child's `close` event, i.e. only after its stdio
 * pipes (shared with any grandchild) are gone — so when `stop()` resolves the
 * port is free and no zombie remains (TC-02-02).
 *
 * NFR-1/FR-23: the materialized path T never enters `lastError` or any emitted
 * text (TC-07-15); raw child output reaches `logSink` line-based with partial-
 * line buffering, never chunk-based and never on any other channel (TC-02-13).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';

import { DEFAULT_SOCKS_PORT } from '../shared/constants';
import type { OperationResult } from '../shared/ipc';
import {
  type AppError,
  type CoreEvent,
  INITIAL_STATUS,
  type StatusSnapshot,
  transition,
} from '../shared/status-machine';

/** One raw child-output line, delivered line-based (data-flows (b) step 6). */
export interface CoreLogLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** `createSupervisor` options — all injected, nothing global (plan M1-15). */
export interface SupervisorOptions {
  /** Path to the core executable; pre-checked for existence (FR-14). */
  readonly binaryPath: string;
  /** Stored-profile JSON — the input of T's materialization (flow (b) step 3). */
  readonly config: string;
  /** Called on every status-machine transition with the post-transition snapshot; no initial emission. */
  readonly onStateChange: (snapshot: StatusSnapshot) => void;
  /** Receives raw stdout/stderr lines — redaction/buffering belong to M1-18/19. */
  readonly logSink: (line: CoreLogLine) => void;
}

/** The supervisor instance M1-15 returns from `createSupervisor` (DV-23). */
export interface CoreSupervisor {
  /** Settles the start sequence: `{ ok: true }` at `running`, documented triple otherwise. */
  start(): Promise<OperationResult>;
  /** Settles at `stopped` — child exited, T deleted (FR-16/FR-23). */
  stop(): Promise<OperationResult>;
  /** True while the child process is alive. */
  isRunning(): boolean;
}

/** App-owned loopback endpoint (BRIEF §2.4) — inbound and readiness probe alike. */
const LOOPBACK_HOST = '127.0.0.1';

/** FR-20 / A-11: the child must accept a TCP connect within 10 s of spawn. */
const READINESS_TIMEOUT_MS = 10_000;

/** Readiness poll cadence — bounded by the deadline above, never by a count (FR-21). */
const READINESS_POLL_MS = 50;

/** One TCP probe settles this fast on loopback (connect or refuse, both immediate). */
const PROBE_TIMEOUT_MS = 500;

/** FR-16: SIGTERM gets a 2 s budget before SIGKILL. */
const TERM_BUDGET_MS = 2_000;

/** FR-23: the materialized config file must be owner-read/write only. */
const CONFIG_FILE_MODE = 0o600;

/** errors.md §2 E-IO-004 (FR-14): the core binary is absent — nothing spawns. */
function binaryMissingError(): AppError {
  return {
    code: 'E-IO-004',
    title: 'Core binary check failed',
    cause: 'The tunnel engine (Xray-core) was not found in the app installation.',
    nextStep: 'Reinstall the app.',
  };
}

/** errors.md §2 E-IO-003 (FR-15): the port is held — never a silent other port. */
function portBusyError(): AppError {
  return {
    code: 'E-IO-003',
    title: `Local port ${DEFAULT_SOCKS_PORT} is busy`,
    cause: `Another program is already using ${LOOPBACK_HOST}:${DEFAULT_SOCKS_PORT}.`,
    nextStep: 'Quit that program, then click Start.',
  };
}

/** errors.md §2 E-IO-006 (FR-23 defensive entry): T could not be written. */
function configWriteError(): AppError {
  return {
    code: 'E-IO-006',
    title: 'Could not prepare the tunnel config',
    cause: "The temporary config file could not be written to the app's private directory.",
    nextStep: 'Free disk space / check permissions, then Start again.',
  };
}

/** errors.md §3 E-CORE-001 (FR-17): unexpected exit — exit code + last child line. */
function unexpectedExitError(
  code: number | null,
  signal: string | null,
  lastLine: string | null,
): AppError {
  let cause: string;
  if (code !== null) {
    cause =
      lastLine === null
        ? `The tunnel engine exited with code ${code}.`
        : `The tunnel engine exited with code ${code}: ${lastLine}.`;
  } else if (lastLine === null) {
    cause =
      signal === null
        ? 'The tunnel engine exited unexpectedly.'
        : `The tunnel engine exited unexpectedly (signal ${signal}).`;
  } else {
    cause =
      signal === null
        ? `The tunnel engine exited unexpectedly: ${lastLine}.`
        : `The tunnel engine exited unexpectedly (signal ${signal}): ${lastLine}.`;
  }
  return {
    code: 'E-CORE-001',
    title: 'The tunnel stopped unexpectedly',
    cause,
    nextStep: 'Click Start to try again; if it repeats, check the Logs view.',
  };
}

/** errors.md §3 E-CORE-002 (FR-20, A-11): the 10 s readiness budget elapsed. */
function readinessTimeoutError(): AppError {
  return {
    code: 'E-CORE-002',
    title: 'The tunnel did not start in time',
    cause: 'The tunnel engine did not become ready within 10 s of starting.',
    nextStep: 'Click Start again; if it repeats, check the Logs view.',
  };
}

/** errors.md §3 E-CORE-003 (data-flows (b) step 4): the spawn itself failed. */
function launchFailedError(failure: Error | null): AppError {
  const errno = (failure as NodeJS.ErrnoException | null)?.code;
  let plain = 'the operating system refused to start it';
  if (errno === 'EACCES') {
    plain = 'not executable (permission denied)';
  } else if (errno === 'ENOENT') {
    plain = 'the file was not found';
  }
  return {
    code: 'E-CORE-003',
    title: 'The tunnel could not be launched',
    cause: `The tunnel engine failed to launch (${plain}).`,
    nextStep:
      'Reinstall the app; on macOS, allow the unsigned app per the Gatekeeper instructions (E-PLAT-005).',
  };
}

/** A materialized run of T: the file itself plus the per-start temp dir holding it. */
interface MaterializedConfig {
  readonly dir: string;
  readonly path: string;
}

/** Plain-object guard — arrays and null are never config documents. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges the app-owned inbound (data-flows (b) step 3): the SOCKS listener is
 * the app's (127.0.0.1:10808, BR-V-09/BR-V-11) — an existing socks inbound is
 * pinned back onto the loopback values, a profile without one gains a new entry.
 */
function mergeLoopbackInbound(doc: Record<string, unknown>): void {
  const inbounds = doc['inbounds'];
  const entries: unknown[] = Array.isArray(inbounds) ? inbounds : [];
  const existing = entries.find(
    (entry): entry is Record<string, unknown> => isRecord(entry) && entry['protocol'] === 'socks',
  );
  if (existing !== undefined) {
    existing['listen'] = LOOPBACK_HOST;
    existing['port'] = DEFAULT_SOCKS_PORT;
    return;
  }
  doc['inbounds'] = [
    ...entries,
    {
      tag: 'socks-in',
      listen: LOOPBACK_HOST,
      port: DEFAULT_SOCKS_PORT,
      protocol: 'socks',
      settings: { auth: 'noauth', udp: true },
    },
  ];
}

/**
 * FR-22: relative profile paths resolve from T's directory, never the user's
 * CWD. `sessionsDir` is the profile schema's only filesystem path (BR-V-08
 * already rejects absolute/traversal values at import, so resolving here is
 * purely a base-directory decision).
 */
function resolveProfilePaths(doc: Record<string, unknown>, baseDir: string): void {
  const outbounds = doc['outbounds'];
  if (!Array.isArray(outbounds)) {
    return;
  }
  for (const outbound of outbounds) {
    if (!isRecord(outbound)) continue;
    const settings = outbound['settings'];
    if (!isRecord(settings)) continue;
    const storage = settings['storage'];
    if (!isRecord(storage)) continue;
    const sessionsDir = storage['sessionsDir'];
    if (typeof sessionsDir === 'string' && !isAbsolute(sessionsDir)) {
      storage['sessionsDir'] = resolve(baseDir, sessionsDir);
    }
  }
}

/**
 * Materializes T from the stored profile (FR-22/FR-23, data-flows (b) step 3):
 * a fresh directory under the app's temp area (NOT the CWD), the app-owned
 * inbound merged in, relative paths resolved from T's directory, file mode
 * 0600 (written with the mode AND chmod'ed — umask must never weaken it).
 * Any failure throws; the caller maps it to E-IO-006 without surfacing the
 * raw reason (NFR-5: one documented triple, no exception text).
 */
function materializeConfig(profileJson: string): MaterializedConfig {
  const dir = mkdtempSync(join(tmpdir(), 's3bypass-core-'));
  try {
    const parsed: unknown = JSON.parse(profileJson);
    if (!isRecord(parsed)) {
      throw new Error('profile document must be a JSON object');
    }
    mergeLoopbackInbound(parsed);
    resolveProfilePaths(parsed, dir);
    const path = join(dir, 'core-config.json');
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, { mode: CONFIG_FILE_MODE });
    chmodSync(path, CONFIG_FILE_MODE);
    return { dir, path };
  } catch (failure) {
    rmSync(dir, { recursive: true, force: true });
    throw failure;
  }
}

/**
 * One TCP probe of `127.0.0.1:10808` — the ONLY readiness/pre-check mechanism
 * (FR-15, FR-21): on loopback an accepted connect means "listening" and an
 * immediate refusal means "free"; the timeout arm is a belt-and-braces bound.
 */
function probeListening(): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect({ port: DEFAULT_SOCKS_PORT, host: LOOPBACK_HOST });
    let settled = false;
    const done = (listening: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(listening);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
  });
}

/** Timer promise for the readiness poll cadence. */
function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * Creates the child-process core supervisor (DV-23 contract): `start()`/
 * `stop()` settle whole sequences as `OperationResult`, `isRunning()` reports
 * the child's liveness, and every transition of the SHARED status-machine
 * reducer is pushed through `onStateChange` (never a duplicated state list,
 * never an initial emission).
 */
export function createSupervisor(options: SupervisorOptions): CoreSupervisor {
  let snapshot: StatusSnapshot = INITIAL_STATUS;
  let child: ChildProcess | null = null;
  let configPath: string | null = null;
  let configDir: string | null = null;
  let exitHandled = true;
  let readinessTimedOut = false;
  let crashError: AppError | null = null;
  let lastCoreLine: string | null = null;
  let exited: Promise<void> = Promise.resolve();
  let resolveExit: (() => void) | null = null;

  /** Applies `event` through the shared reducer and emits the resulting snapshot. */
  function applyEvent(event: CoreEvent, detail?: AppError): boolean {
    const result = transition(snapshot, event, detail);
    if (!result.ok) {
      return false;
    }
    snapshot = result.snapshot;
    options.onStateChange(snapshot);
    return true;
  }

  /** Line-based delivery to the injected sink (step 6) — raw, unredacted. */
  function emitLine(stream: CoreLogLine['stream'], text: string): void {
    lastCoreLine = text;
    try {
      options.logSink({ stream, text });
    } catch {
      // A sink failure must never break the pipes — supervision continues.
    }
  }

  /** Splits one child stream into complete lines; a trailing partial line is flushed on end. */
  function attachLineReader(stream: Readable, name: CoreLogLine['stream']): void {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      let newlineAt = buffer.indexOf('\n');
      while (newlineAt !== -1) {
        const raw = buffer.slice(0, newlineAt);
        buffer = buffer.slice(newlineAt + 1);
        emitLine(name, raw.endsWith('\r') ? raw.slice(0, -1) : raw);
        newlineAt = buffer.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (buffer !== '') {
        const rest = buffer;
        buffer = '';
        emitLine(name, rest);
      }
    });
  }

  /** FR-23: deletes T (and its per-start dir) — idempotent, best effort. */
  function cleanupMaterialized(): void {
    const path = configPath;
    const dir = configDir;
    configPath = null;
    configDir = null;
    if (path !== null) {
      try {
        rmSync(path, { force: true });
      } catch {
        // Best effort — FR-23 cleanup must never mask the real outcome.
      }
    }
    if (dir !== null) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort — same rule as above.
      }
    }
  }

  /**
   * The single exit path (data-flows (b) step 8): runs on `close` (stdio
   * drained, child reaped) or on a spawn `error`, exactly once. Drives
   * `stopping → stopped` for a requested stop (A-13: exit code ignored) and
   * `starting|running → crashed` otherwise; every branch deletes T (errors.md §6).
   */
  function handleChildExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    launchFailure: Error | null,
  ): void {
    if (exitHandled) {
      return;
    }
    exitHandled = true;
    child = null;
    const state = snapshot.state;
    if (state === 'stopping') {
      cleanupMaterialized();
      applyEvent('stopped');
    } else if (state === 'starting' || state === 'running') {
      const error = readinessTimedOut
        ? readinessTimeoutError()
        : launchFailure !== null
          ? launchFailedError(launchFailure)
          : unexpectedExitError(code, signal, lastCoreLine);
      crashError = error;
      cleanupMaterialized();
      applyEvent('crash', error);
    }
    // Any other state was already settled by a terminal path — nothing to emit.
    resolveExit?.();
  }

  /** FR-16: SIGTERM first, SIGKILL only if the child is still alive after 2 s. */
  async function terminateChild(): Promise<void> {
    const current = child;
    if (current === null || exitHandled) {
      return;
    }
    current.kill('SIGTERM');
    const escalate = setTimeout(() => {
      if (child !== null && !exitHandled) {
        child.kill('SIGKILL');
      }
    }, TERM_BUDGET_MS);
    try {
      await exited;
    } finally {
      clearTimeout(escalate);
    }
  }

  /**
   * FR-21/A-12 readiness: poll the loopback connect until it accepts (`ready`),
   * the child is gone (`exited`) or the 10 s deadline passes (`timeout`).
   */
  async function waitUntilReady(): Promise<'ready' | 'timeout' | 'exited'> {
    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    for (;;) {
      if (child === null || exitHandled) return 'exited';
      if (await probeListening()) return 'ready';
      if (child === null || exitHandled) return 'exited';
      if (Date.now() >= deadline) return 'timeout';
      await delay(READINESS_POLL_MS);
    }
  }

  async function start(): Promise<OperationResult> {
    // data-flows (b) step 1a / FR-14 — BEFORE any transition (TC-02-04).
    if (!existsSync(options.binaryPath)) {
      return { ok: false, error: binaryMissingError() };
    }

    // Step 0 / FR-18: the state gate precedes the port probe — while the core
    // runs, its own inbound holds 10808, and a rejected Start must surface the
    // reducer's E-VAL-015, never E-IO-003 (TC-02-07). Rejection emits nothing.
    const gate = transition(snapshot, 'start');
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }

    // Step 1b / FR-15: still no transition and no spawn while the port is held
    // (TC-02-05). On loopback the probe answers immediately either way.
    if (await probeListening()) {
      return { ok: false, error: portBusyError() };
    }

    // Re-evaluate against the current snapshot: the probe above was the only
    // await, so a Start that raced this one now loses here — with no emission
    // and no materialized file (single-child guard, AC-02.7).
    const finalGate = transition(snapshot, 'start');
    if (!finalGate.ok) {
      return { ok: false, error: finalGate.error };
    }

    // Step 3/4: materialize T BEFORE the `starting` emission (see header step
    // 4) — a write failure settles E-IO-006 with the state still `stopped`.
    let materialized: MaterializedConfig;
    try {
      materialized = materializeConfig(options.config);
    } catch {
      // The raw reason never surfaces (NFR-5: one documented triple).
      return { ok: false, error: configWriteError() };
    }
    configPath = materialized.path;
    configDir = materialized.dir;

    // Step 5: state → starting (the first emission of the sequence).
    snapshot = finalGate.snapshot;
    options.onStateChange(snapshot);

    // Step 6: spawn with the EXACT documented argv — an args array, no shell
    // (PR-08); no `env` option means the child inherits `process.env`.
    let spawned: ChildProcess | null = null;
    try {
      spawned = spawn(options.binaryPath, ['run', '-c', materialized.path], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (failure) {
      cleanupMaterialized();
      const error = launchFailedError(failure instanceof Error ? failure : null);
      applyEvent('crash', error);
      return { ok: false, error };
    }

    child = spawned;
    exitHandled = false;
    readinessTimedOut = false;
    crashError = null;
    lastCoreLine = null;
    exited = new Promise<void>((resolvePromise) => {
      resolveExit = resolvePromise;
    });

    if (spawned.stdout !== null) attachLineReader(spawned.stdout, 'stdout');
    if (spawned.stderr !== null) attachLineReader(spawned.stderr, 'stderr');
    spawned.once('close', (code, signal) => {
      handleChildExit(code, signal, null);
    });
    spawned.once('error', (failure) => {
      handleChildExit(null, null, failure);
    });

    // Steps 6/7: readiness races the exit watcher — whichever settles first
    // decides how `start()` resolves (FR-13 / FR-17 / FR-20).
    const outcome = await Promise.race([waitUntilReady(), exited.then(() => 'exited' as const)]);

    if (outcome === 'ready') {
      if (applyEvent('ready')) {
        return { ok: true };
      }
      // The exit watcher settled first after all — fall through to its error.
      return { ok: false, error: crashError ?? unexpectedExitError(null, null, lastCoreLine) };
    }

    if (outcome === 'exited') {
      return { ok: false, error: crashError ?? unexpectedExitError(null, null, lastCoreLine) };
    }

    // FR-20: the 10 s budget elapsed with no listener — kill, reap, then the
    // exit path above emits `crashed` with E-CORE-002 and deletes T.
    readinessTimedOut = true;
    await terminateChild();
    await exited;
    return { ok: false, error: crashError ?? readinessTimeoutError() };
  }

  async function stop(): Promise<OperationResult> {
    // data-flows §2.3: only `running → stopping` accepts Stop; any other
    // state answers the reducer's documented E-VAL-015 with no emission.
    const gate = transition(snapshot, 'stop');
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
    snapshot = gate.snapshot;
    options.onStateChange(snapshot);

    // Steps 7/8: SIGTERM (2 s → SIGKILL). `terminateChild` resolves only on
    // `close`, i.e. after the exit path emitted `stopped` and deleted T.
    await terminateChild();
    return { ok: true };
  }

  return {
    start,
    stop,
    isRunning(): boolean {
      return child !== null;
    },
  };
}

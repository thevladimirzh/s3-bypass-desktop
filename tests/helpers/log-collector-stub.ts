/**
 * Shared machinery for the M1-18 (RED) logs batch — the bounded buffer,
 * line conversion, and redaction entry point of the logs subsystem
 * (docs/qa/m1-test-plan.md §6, plan M1-18 → M1-19).
 *
 * Declares the M1-19 contract surface (full text in the headers of
 * `tests/unit/log-buffer.test.ts` and `tests/unit/log-redaction.test.ts`):
 * module `src/main/log-collector.ts` exporting `createLogCollector(options?)`
 * → `{ push, pushApp, get, clear, subscribe }`.
 *
 * Loader note: `import(logCollectorModule)` takes a NON-LITERAL specifier on
 * purpose — `tests/**` is inside `tsconfig.node.json`'s `include`, so a
 * literal import of the not-yet-existing module would make `npm run typecheck`
 * fail (which must stay exit 0 during RED); precedent: the M1-14 loader in
 * `core-supervisor-stub.ts` (DV-23/DV-24). At runtime Vitest resolves the
 * relative specifier against this file, so the moment M1-19 creates the module
 * the very same line loads it: absence RED becomes assertion RED with zero
 * test edits (strategy §5.2). The `existsSync` gate rethrows the absence as an
 * explicit, greppable RED reason instead of a bare resolution error.
 *
 * This file is a helper, not a suite: `vitest.config.ts` collects only
 * `*.test.ts(x)` under `tests/`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { LogLine, LogsView } from '../../src/shared/ipc';
import type { CoreLogLine } from './core-supervisor-stub';
import { fakeCorePath } from './core-supervisor-stub';

export type { CoreLogLine };

/** App-side log event (FR-45: "core stdout/stderr + app events"). */
export interface AppLogEvent {
  readonly text: string;
  /** Defaults to a plain level when omitted — the exact default is not pinned (DV-25). */
  readonly level?: LogLine['level'];
}

/** `createLogCollector` options — FR-46: bounded at 2000 lines, configurable constant. */
export interface LogCollectorOptions {
  readonly maxLines?: number;
}

/** The collector instance M1-19 must return from `createLogCollector`. */
export interface LogCollector {
  /** Single entry point for core child output (data-flows (b) step 6): redacts, stores, notifies. */
  push(line: CoreLogLine): LogLine;
  /** Single entry point for app events (FR-45/FR-47): same redaction, `source: 'app'`. */
  pushApp(event: AppLogEvent): LogLine;
  /** `logs:get` payload: oldest-first, redacted, ≤ cap (§4.2). */
  get(): LogsView;
  /** `logs:clear` side effect (FR-46 view clear). */
  clear(): void;
  /** Notifies with each stored (post-redaction) line; returns an unsubscribe function (FR-63 push). */
  subscribe(fn: (line: LogLine) => void): () => void;
}

/** Module surface QA declares for M1-19 (header-contract style, cf. DV-09/DV-16/DV-23). */
export interface LogCollectorApi {
  createLogCollector(options?: LogCollectorOptions): LogCollector;
}

/** Non-literal on purpose (see file header): typecheck stays green while the module is absent. */
const logCollectorModule: string = '../../src/main/log-collector';

/** Path of the module under test, for structural gates/scans. */
export function logCollectorPath(): string {
  return fileURLToPath(new URL('../../src/main/log-collector.ts', import.meta.url));
}

/**
 * Loads the module under test. RED until M1-19 creates
 * `src/main/log-collector.ts`: the gate throws the explicit absence-RED
 * reason, which is the legitimate failure for this batch (strategy §5.1) —
 * never weaken this path or the tests behind it.
 */
export async function loadLogCollector(): Promise<LogCollectorApi> {
  if (!existsSync(logCollectorPath())) {
    throw new Error(
      'src/main/log-collector.ts must exist — M1-19 GREEN implements the M1-18 contract ' +
        '(bounded buffer + redaction entry point; strategy §5.1 absence RED)',
    );
  }
  return (await import(/* @vite-ignore */ logCollectorModule)) as LogCollectorApi;
}

/** Fresh collector per test; fails with the absence-RED reason above while the module is absent. */
export async function createCollector(options?: LogCollectorOptions): Promise<LogCollector> {
  const api = await loadLogCollector();
  if (typeof api.createLogCollector !== 'function') {
    throw new Error(
      'src/main/log-collector.ts must export createLogCollector(options?) — ' +
        'M1-19 GREEN implements the M1-18 contract',
    );
  }
  return options === undefined ? api.createLogCollector() : api.createLogCollector(options);
}

/** utf-8 path of the §9.1 canary client config (for `FAKE_CORE_CONFIG`). */
export function canaryConfigPath(): string {
  return fileURLToPath(new URL('../fixtures/configs/valid-client-config.json', import.meta.url));
}

/** Result of one fixture invocation — stdout kept as raw bytes (non-UTF-8 pins, TC-06-11). */
export interface FakeCoreRun {
  readonly code: number | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

/**
 * Runs `tests/fixtures/fake-core.sh --mode=<mode>` as a standalone process
 * (§9.2: argv `--mode=` exists for standalone debugging; no port is bound by
 * the echo-secrets/flood/nonutf8 modes, so the M1-15 environment prerequisite
 * on 127.0.0.1:10808 does not apply here).
 */
export function runFakeCoreMode(
  mode: string,
  env: Record<string, string> = {},
): Promise<FakeCoreRun> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', [fakeCorePath(), `--mode=${mode}`], {
      env: { ...process.env, ...env },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) => reject(error));
    child.on('close', (code) =>
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }),
    );
  });
}

/** Decodes raw child output the way a line-based reader does, then splits on `\n`. */
export function decodedLines(stdout: Buffer): string[] {
  const lines = stdout.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Pushes every decoded line into the collector as core child output. */
export function pushAll(collector: LogCollector, lines: readonly string[]): void {
  for (const text of lines) {
    collector.push({ stream: 'stdout', text });
  }
}

/** Comments stripped before structural source scans (same rule as TC-01-15/TC-07-17/TC-02-14). */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

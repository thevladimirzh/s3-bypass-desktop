/**
 * Bounded in-memory log buffer with the single redaction entry point
 * (FR-45..FR-48, data-flows (b) step 6) — M1-19 GREEN for the M1-18 contract
 * declared in the headers of `tests/unit/log-buffer.test.ts` and
 * `tests/unit/log-redaction.test.ts` (DV-25).
 *
 * Pure node on purpose (TC-06-14, NFR-2): this module sees raw child output,
 * so it imports no Electron/IPC primitive — the window wiring lives in
 * `src/main/index.ts` (TC-06-15), mirroring `broadcastStatus`.
 *
 * Redaction (FR-47) runs HERE, inside `push`/`pushApp`, before the buffer
 * insert and before every subscriber notification: a secret-bearing line is
 * replaced with exactly `[REDACTED]` — never passed through, never dropped
 * (AC-06.3), and never observable unredacted at any observation point.
 *
 * Spec: docs/analysis/requirements.md F7 (FR-45..FR-48) and §8.4
 * (SECRET/INTERNAL/PUBLIC classification), docs/product/stories/US-06-logs.md
 * (AC-06.1..06.3, oversize edge), docs/qa/strategy.md §7 NFR-2.
 */
import type { LogLine, LogsView } from '../shared/ipc';

/** Core child output as the M1-15 supervisor's line reader delivers it. */
export interface CoreLogLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** App-side log event (FR-45: "core stdout/stderr + app events"). */
export interface AppLogEvent {
  readonly text: string;
  /** Explicit level; an omitted level defaults to `info` (default not pinned, DV-25). */
  readonly level?: LogLine['level'];
}

/** `createLogCollector` options — FR-46: bounded at 2000 lines, configurable constant. */
export interface LogCollectorOptions {
  readonly maxLines?: number;
}

/** The collector instance returned by `createLogCollector` (M1-18 contract). */
export interface LogCollector {
  /** Single entry point for core child output: redacts, stores, notifies. */
  push(line: CoreLogLine): LogLine;
  /** Single entry point for app events (FR-45/FR-47): same redaction, `source: 'app'`. */
  pushApp(event: AppLogEvent): LogLine;
  /** `logs:get` payload: oldest-first, redacted, ≤ cap (§4.2). */
  get(): LogsView;
  /** `logs:clear` side effect (FR-46 view clear). */
  clear(): void;
  /** Notifies with each stored (post-redaction) line; returns unsubscribe (FR-63 push). */
  subscribe(fn: (line: LogLine) => void): () => void;
}

/** FR-46 / PRD §5 NFR-3: a LINE count bound, not a byte size. */
const DEFAULT_MAX_LINES = 2000;

/** US-06 oversize edge (DV-25): body cap, after redaction. */
const MAX_TEXT_CHARS = 4096;

/** Truncation marker, ≤ 32 chars of headroom (DV-25: marker text itself unspecified). */
const TRUNCATION_MARKER = '…[truncated]';

/** FR-47 literal wording: a matching line is REPLACED with exactly this marker. */
const REDACTED = '[REDACTED]';

/**
 * Redaction triggers (§8.4 classification, FR-47/FR-48) — any hit replaces
 * the WHOLE line with `[REDACTED]` (DV-25 whole-line reading):
 *
 *  1. SECRET field names (strategy §7.5 list), separator-tolerant, so both a
 *     quoted config key (`"accessKey"`) and a value shaped like its field
 *     name (the §9.3 canaries: `EXAMPLEACCESSKEYID01`,
 *     `example-bucket-password`, …) hit the same rule.
 *  2. SECRET — the full config JSON document marker (`"outbounds"`).
 *  3./4. errors.md §0 — no stack frames, no exception class messages.
 *  5..8. INTERNAL value shapes [ASSUMPTION, Q-AN-09]: path/URL values
 *     (`prefix`, `endpoint`), region codes, bucket names, session-directory
 *     names identify the user's infrastructure and stay out of the logs.
 *
 * PUBLIC lines (protocol, tags, listen, port, loglevel, loopback, READY, …)
 * match none of these and pass through byte-for-byte (§8.4, AC-06.1).
 */
const REDACTION_RULES: readonly RegExp[] = [
  /access[-_\s]?key|secret[-_\s]?key|session[-_\s]?token|bucket[-_\s]?password/i,
  /"outbounds"/,
  /(^|\n)\s+at\s.*\(/,
  /Error:/,
  /\//,
  /\b[a-z]{2,3}-[a-z0-9]+-\d{1,3}\b/i,
  /\bbucket\b/i,
  /\bsessions?\b/i,
];

/** Stream→level mapping is unspecified in the docs — only union membership is pinned (DV-25). */
const STREAM_LEVELS: Readonly<Record<CoreLogLine['stream'], LogLine['level']>> = {
  stdout: 'info',
  stderr: 'error',
};

/** FR-47: redact first, so a secret can never survive even as a cut fragment. */
function redact(text: string): string {
  for (const rule of REDACTION_RULES) {
    if (rule.test(text)) {
      return REDACTED;
    }
  }
  return text;
}

/** Redaction (FR-47) then the US-06 size cap — in exactly that order (TC-06-10). */
function prepareText(text: string): string {
  const redacted = redact(text);
  if (redacted.length <= MAX_TEXT_CHARS) {
    return redacted;
  }
  return redacted.slice(0, MAX_TEXT_CHARS) + TRUNCATION_MARKER;
}

/**
 * Creates the bounded, redacting log buffer (FR-45/FR-46, AC-06.1/06.2).
 *
 * Lines are stored oldest-first, capped at `maxLines` (oldest evicted first);
 * every line carries exactly the §4.2 `LogLine` shape — no pre-redaction
 * field ever rides along (FR-64 denylist, TC-06-18).
 */
export function createLogCollector(options: LogCollectorOptions = {}): LogCollector {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const lines: LogLine[] = [];
  const subscribers = new Set<(line: LogLine) => void>();
  // AC-06.1: timestamps are ISO-8601 and non-decreasing even if the system
  // clock steps backwards mid-session (oldest-first must stay observable).
  let lastTs = 0;

  const timestamp = (): string => {
    const now = Date.now();
    lastTs = now > lastTs ? now : lastTs;
    return new Date(lastTs).toISOString();
  };

  /** The single observation point: cap first, then notify with the stored line. */
  const store = (line: LogLine): LogLine => {
    lines.push(line);
    while (lines.length > maxLines) {
      lines.shift();
    }
    for (const subscriber of subscribers) {
      subscriber(line);
    }
    return line;
  };

  return {
    push(line: CoreLogLine): LogLine {
      return store({
        ts: timestamp(),
        level: STREAM_LEVELS[line.stream],
        source: 'core',
        text: prepareText(line.text),
      });
    },
    pushApp(event: AppLogEvent): LogLine {
      return store({
        ts: timestamp(),
        level: event.level ?? 'info',
        source: 'app',
        text: prepareText(event.text),
      });
    },
    get(): LogsView {
      return { lines: [...lines] };
    },
    clear(): void {
      lines.length = 0;
    },
    subscribe(fn: (line: LogLine) => void): () => void {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}

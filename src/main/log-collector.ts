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
 * insert and before every subscriber notification — never passed through,
 * never dropped (AC-06.3), never observable unredacted at any observation
 * point. Issue #24/DV-63 (owner decision 2026-10-08) replaced the old
 * whole-line reading: TOKEN-level masks with the rule's class marker
 * (`[REDACTED:<class>]`), configured §8.4 INTERNAL values via the
 * collector's `redactionContext`, whole-line plain `[REDACTED]` only for
 * document mode, stack frames and self-closed single-line JSON documents.
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

/**
 * Issue #24/DV-63: the §8.4 INTERNAL values of the imported profile —
 * exact occurrences become `[REDACTED:<field>]` markers BEFORE the shape
 * rules run (so `prefix` beats `path`, the endpoint beats the URL rule).
 * Extracted by `redactionContextFromConfig`, handed over by index.ts at
 * startup and after every (re-)import — fields merge, never clear.
 */
export interface RedactionContext {
  readonly endpoint?: string;
  readonly bucket?: string;
  readonly prefix?: string;
  readonly sessionsDir?: string;
  readonly region?: string;
}

/** `createLogCollector` options — FR-46: bounded at 2000 lines, configurable constant. */
export interface LogCollectorOptions {
  readonly maxLines?: number;
  /** Issue #24/DV-63: §8.4 INTERNAL values of the imported profile (hybrid redaction). */
  readonly redactionContext?: RedactionContext;
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
  /**
   * Issue #24/DV-63: refresh the §8.4 INTERNAL values after (re-)import —
   * fields MERGE, never clear (fail-closed: removal does not un-redact).
   */
  setRedactionContext(context: RedactionContext): void;
}

/** FR-46 / PRD §5 NFR-3: a LINE count bound, not a byte size. */
const DEFAULT_MAX_LINES = 2000;

/** US-06 oversize edge (DV-25): body cap, after redaction. */
const MAX_TEXT_CHARS = 4096;

/** Truncation marker, ≤ 32 chars of headroom (DV-25: marker text itself unspecified). */
const TRUNCATION_MARKER = '…[truncated]';

/** Whole-line replacement marker (document mode, stack frames, self-closed JSON). */
const REDACTED = '[REDACTED]';

/** errors.md §0: `XxxError:` masks from the class token to end-of-line. */
const REDACTED_ERROR = '[REDACTED:Error]';

/** errors.md §0 / FR-48: the `XxxError:` class token (`Error:`, `TypeError:`, …). */
const ERROR_CLASS = /[A-Za-z]*Error:/;

/** errors.md §0 / FR-48: a stack frame replaces the WHOLE line. */
const STACK_FRAME = /(^|\n)\s+at\s.*\(/;

/**
 * Redaction rules (§8.4 classification, FR-47/FR-48) — TOKEN-level masks
 * carrying the class name of the rule that fired (issue #24/DV-63):
 *
 *  1. SECRET field names (strategy §7.5 list), separator-tolerant over the
 *     `[-_\s.]*` class (S5-6 gap 3), so a quoted config key (`"accessKey"`),
 *     a camelCase spelling (`clientSecret`, `privateKey`), a dotted or
 *     space-separated variant (`access..key`, `ACCESS  KEY`) and a value
 *     shaped like its field name (the §9.3 canaries: `EXAMPLEACCESSKEYID01`,
 *     `example-bucket-password`, …) all hit the same rules. The matched
 *     TOKEN goes whole — never a cut fragment — and when the match IS a
 *     standalone token the ADJACENT value token is masked too, so a
 *     credential key name never survives in any spelling (§7.5) and a bare
 *     prose keyword fails closed onto the next token.
 *  1b. S5-6 gap 1: GENERIC credential key names the four-name denylist did
 *     not cover — password/pass, cookie, authorization, signature/signing.
 *  2. S5-6 gap 2: nameless secret VALUE shapes [ASSUMPTION] — an AWS-style
 *     `AKIA…` id → awsKey, a JWT triple → jwt, and a long base64/hex run
 *     (≥ 40 chars of the token alphabet containing a lowercase letter, so a
 *     pure-uppercase flood line of US-06 stays a PUBLIC line) → run.
 *  3./4. errors.md §0 — stack frames and `XxxError:` messages (suffix mask).
 *  5..7. INTERNAL value shapes [ASSUMPTION, Q-AN-09]: paths (logger names,
 *     config file paths — digit-first segments like `2026/10/08` are exempt)
 *     → path, URLs → endpoint, region codes → region.
 *
 * The bare `bucket`/`session` word rules are GONE (issue #24): their real
 * values ride in through `RedactionContext` as exact configured-value
 * matches, so `session accepted` / `Reading config` stay SIGNAL.
 *
 * PUBLIC lines (protocol, tags, listen, port, loglevel, loopback, READY, …)
 * match none of these and pass through byte-for-byte (§8.4, AC-06.1).
 */
interface ClassRule {
  /** Global — `String.matchAll` scans every occurrence. */
  readonly pattern: RegExp;
  /** Marker class: `[REDACTED:<cls>]`. */
  readonly cls: string;
}

/** Rules keyed on a SECRET field name — also mask the adjacent value token. */
const NAME_RULES: readonly ClassRule[] = [
  { pattern: /access[-_\s.]*key/gi, cls: 'accessKey' },
  { pattern: /secret[-_\s.]*key/gi, cls: 'secretKey' },
  { pattern: /session[-_\s.]*token/gi, cls: 'sessionToken' },
  { pattern: /bucket[-_\s.]*password/gi, cls: 'bucketPassword' },
  { pattern: /\bpass(?:word|wd)?\b/gi, cls: 'password' },
  { pattern: /\bcookie\b/gi, cls: 'cookie' },
  { pattern: /\bauthorization\b/gi, cls: 'authorization' },
  { pattern: /\bsign(?:ature|ing)\b/gi, cls: 'signing' },
  { pattern: /\bclient[-_\s.]*secret\b/gi, cls: 'clientSecret' },
  { pattern: /\bprivate[-_\s.]*key\b/gi, cls: 'privateKey' },
];

/**
 * Rules keyed on a VALUE shape — span = the match expanded to token
 * boundaries. Checked AFTER the context values (DV-63 order: so a
 * configured endpoint/prefix keeps its field marker, not a shape one).
 */
const SHAPE_RULES: readonly ClassRule[] = [
  { pattern: /"outbounds"/g, cls: 'config' }, // §8.4 full-config marker (stray = fragment)
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, cls: 'awsKey' },
  { pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, cls: 'jwt' },
  { pattern: /\b[a-z]{2,3}-[a-z0-9]+-\d{1,3}\b/gi, cls: 'region' },
  { pattern: /(?:[a-z][a-z0-9+.-]*):\/\/[^\s]+/gi, cls: 'endpoint' },
  { pattern: /\/?[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+/g, cls: 'path' },
  { pattern: /[A-Za-z0-9+/=_-]{40,}/g, cls: 'run' },
];

/** §8.4 INTERNAL context fields, longest-relevance order (endpoint first). */
const CONTEXT_FIELDS = ['endpoint', 'bucket', 'prefix', 'sessionsDir', 'region'] as const;

/** The context extraction picks exactly these §8.4 INTERNAL storage keys. */
const CONTEXT_CONFIG_FIELDS = ['bucket', 'endpoint', 'region', 'prefix', 'sessionsDir'] as const;

/** Token alphabet for span expansion (issue #24/DV-63): never cut a fragment. */
const TOKEN_CHAR = /[A-Za-z0-9+/_=./-]/;

/** Start of the token containing `at` (scans left over token chars). */
function tokenStart(text: string, at: number): number {
  let index = at;
  while (index > 0 && TOKEN_CHAR.test(text.charAt(index - 1))) {
    index -= 1;
  }
  return index;
}

/** End of the token containing `at` (scans right over token chars). */
function tokenEnd(text: string, at: number): number {
  let index = at;
  while (index < text.length && TOKEN_CHAR.test(text.charAt(index))) {
    index += 1;
  }
  return index;
}

/** Net `{`/`}` depth change of a line — JSON braces always balance. */
function braceDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === '{') delta += 1;
    else if (char === '}') delta -= 1;
  }
  return delta;
}

/** A masked half-open span of the (context-applied) line. */
interface MaskSpan {
  readonly start: number;
  readonly end: number;
  readonly marker: string;
}

/**
 * Name-rule spans: the whole matched token, plus — for a STANDALONE match
 * (the match itself is a full token) — the next token after separator
 * skipping (the configured value / adjacent value, fail-closed for prose).
 */
function nameSpans(text: string): MaskSpan[] {
  const spans: MaskSpan[] = [];
  for (const rule of NAME_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (match[0].length === 0) continue;
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      const start = tokenStart(text, matchStart);
      const end = tokenEnd(text, matchEnd);
      spans.push({ start, end, marker: `[REDACTED:${rule.cls}]` });
      if (matchStart !== start || matchEnd !== end) continue; // embedded canary
      let valueStart = end;
      while (valueStart < text.length && !TOKEN_CHAR.test(text.charAt(valueStart))) {
        valueStart += 1;
      }
      if (valueStart < text.length) {
        spans.push({
          start: valueStart,
          end: tokenEnd(text, valueStart),
          marker: `[REDACTED:${rule.cls}]`,
        });
      }
    }
  }
  return spans;
}

/** Shape-rule spans: the match expanded to token boundaries (`run` lowercased). */
function shapeSpans(text: string): MaskSpan[] {
  const spans: MaskSpan[] = [];
  for (const rule of SHAPE_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      // S5-6 gap 2 / US-06: a pure-uppercase run is the flood line, not a secret.
      if (rule.cls === 'run' && !/[a-z]/.test(match[0])) continue;
      spans.push({
        start: tokenStart(text, match.index),
        end: tokenEnd(text, match.index + match[0].length),
        marker: `[REDACTED:${rule.cls}]`,
      });
    }
  }
  return spans;
}

/**
 * Cut the masked spans out — leftmost, then widest, wins an overlap (a
 * canary token masked by two rules keeps one whole-token marker).
 */
function applySpans(text: string, spans: MaskSpan[]): string {
  if (spans.length === 0) return text;
  spans.sort((left, right) => left.start - right.start || right.end - left.end);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start) + span.marker;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

/** Exact configured §8.4 INTERNAL values → their FIELD markers (first stage). */
function applyContext(text: string, context: RedactionContext): string {
  let out = text;
  for (const field of CONTEXT_FIELDS) {
    const value = context[field];
    if (typeof value === 'string' && value.length > 0) {
      out = out.split(value).join(`[REDACTED:${field}]`);
    }
  }
  return out;
}

/** Stream→level mapping is unspecified in the docs — only union membership is pinned (DV-25). */
const STREAM_LEVELS: Readonly<Record<CoreLogLine['stream'], LogLine['level']>> = {
  stdout: 'info',
  stderr: 'error',
};

/**
 * FR-47/issue #24 DV-63: redact first, so a secret can never survive even
 * as a cut fragment. Stateless on purpose — the same single entry point
 * answers the supervisor's "last redacted core line" (S5-2, errors.md §3),
 * which has no collector (that path carries no context: shape rules only).
 *
 * Order (DV-63): self-closed JSON → stack frame → `XxxError:` suffix →
 * context values (so `prefix` beats `path`) → name spans → shape spans.
 */
export function redactLine(text: string, context?: RedactionContext): string {
  const trimmed = text.trim();
  // A self-closed single-line `{…}` document IS the full config — §8.4
  // SECRET as a whole (TC-06-04 pins it), never token-level.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return REDACTED;
  }
  // errors.md §0 / FR-48: a stack frame is the ENTIRE line replaced.
  if (STACK_FRAME.test(text)) {
    return REDACTED;
  }
  // errors.md §0: from the `XxxError:` class token to EOL — no exception
  // message may reach a dump; the prefix scaffolding still takes the rules.
  const errorAt = text.search(ERROR_CLASS);
  const prefix = errorAt >= 0 ? text.slice(0, errorAt) : text;
  const suffix = errorAt >= 0 ? REDACTED_ERROR : '';
  const ready = context === undefined ? prefix : applyContext(prefix, context);
  return applySpans(ready, [...nameSpans(ready), ...shapeSpans(ready)]) + suffix;
}

/**
 * Issue #24/DV-63: pure extraction of the §8.4 INTERNAL values from the
 * PARSED config document (index.ts feeds it `parseStoredProfile` output at
 * startup and after every import). SECRET credential fields are deliberately
 * NOT part of the context — they ride the name rules. Tolerant by design:
 * a non-document yields an empty context, never a throw.
 */
export function redactionContextFromConfig(doc: unknown): RedactionContext {
  const context: { -readonly [Key in keyof RedactionContext]?: string } = {};
  if (typeof doc !== 'object' || doc === null) {
    return context;
  }
  const outbounds = (doc as { outbounds?: unknown }).outbounds;
  if (!Array.isArray(outbounds)) {
    return context;
  }
  for (const entry of outbounds) {
    if (typeof entry !== 'object' || entry === null) continue;
    const settings = (entry as { settings?: unknown }).settings;
    if (typeof settings !== 'object' || settings === null) continue;
    const storage = (settings as { storage?: unknown }).storage;
    if (typeof storage !== 'object' || storage === null) continue;
    for (const field of CONTEXT_CONFIG_FIELDS) {
      const value = (storage as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.length > 0) {
        context[field] = value;
      }
    }
  }
  return context;
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
  // Issue #24/DV-63: the §8.4 INTERNAL values — live state, merged never
  // cleared (fail-closed), independent of `clear()`.
  let context: RedactionContext = options.redactionContext ?? {};
  const lines: LogLine[] = [];
  const subscribers = new Set<(line: LogLine) => void>();
  // AC-06.1: timestamps are ISO-8601 and non-decreasing even if the system
  // clock steps backwards mid-session (oldest-first must stay observable).
  let lastTs = 0;
  // S5-6 gap 4: document mode — a line whose TRIMMED text starts with `{`
  // opens a config document; every subsequent line is replaced until the
  // document's OWN closer (that closer included, then exit); an unclosed
  // document redacts the rest of the stream (fail-safe). Depth-counted
  // (issue #12 gap 4: one of the two report-accepted shapes) so inner `}`
  // closers of a pretty-printed config do NOT exit early — TC-06-23's pins
  // hold for both shapes. Per-instance state that `clear()` deliberately
  // does NOT reset: the buffer and the redaction context are independent
  // (FR-47 runs before the insert).
  let inDocument = false;
  let documentDepth = 0;

  const timestamp = (): string => {
    const now = Date.now();
    lastTs = now > lastTs ? now : lastTs;
    return new Date(lastTs).toISOString();
  };

  /**
   * Document-mode gate, then the rule-based redaction (FR-47), then the
   * US-06 size cap — in exactly that order (TC-06-10: redaction before
   * truncation).
   */
  const prepareText = (text: string): string => {
    const trimmed = text.trim();
    if (inDocument) {
      documentDepth += braceDelta(trimmed);
      if (documentDepth <= 0) {
        inDocument = false;
        documentDepth = 0; // redact-then-exit: the document's own closer leaves as [REDACTED]
      }
      return REDACTED;
    }
    if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      inDocument = true; // multi-line opener; a self-closed `{…}` never opens it
      documentDepth = braceDelta(trimmed);
    }
    const redacted = redactLine(text, context);
    if (redacted.length <= MAX_TEXT_CHARS) {
      return redacted;
    }
    return redacted.slice(0, MAX_TEXT_CHARS) + TRUNCATION_MARKER;
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
    setRedactionContext(next: RedactionContext): void {
      // Fail-closed (issue #24/DV-63): fields MERGE — re-importing a profile
      // without a field (or removing it) never un-redacts earlier values.
      context = { ...context, ...next };
    },
  };
}

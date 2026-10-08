#!/bin/sh
# fake-core.sh — stub core binary for the M1-14 supervisor integration tests
# (docs/qa/m1-test-plan.md §9.2; plan R-1: no real Xray binary until M2).
#
# POSIX sh, works on macOS (bash-as-sh) and Linux CI (dash). Synthetic data
# only, loopback only, no network beyond 127.0.0.1 (strategy §1).
#
# Fixture contract (pinned by tests/unit/core-supervisor.test.ts, DV-22):
#
#   mode     selected via env FAKE_CORE_MODE (the supervisor's own argv is the
#            documented data-flows (b) step-4 array `[run, -c, T]`, so the mode
#            cannot travel on argv) — `--mode=<name>` argv is accepted for
#            standalone debugging (`sh tests/fixtures/fake-core.sh --mode=…`):
#     sleep | ready   print `READY` on stdout, bind 127.0.0.1:$FAKE_CORE_PORT
#                     (default 10808) via a node helper, wait for SIGTERM,
#                     record the signal, kill the helper, exit 0 (FR-16/FR-21)
#     chatty          same as sleep, preceded by 2 stdout + 2 stderr lines
#                     (line-based log-sink pin, data-flows (b) step 6)
#     fail | exit-nonzero
#                     print a diagnostic line on stderr, exit 3 (FR-17 →
#                     E-CORE-001; the plan-time "exit 1" expectation was
#                     replaced by exit 3, DV-22)
#     silent          no output, never binds, sleep until killed (FR-20
#                     start-timeout path)
#     echo-secrets    cat $FAKE_CORE_CONFIG (required, else exit 64) to
#                     stdout, exit 0 — the core echoing its own config
#                     (M1-18 batch, §9.2; NFR-2 leak for TC-06-03 /
#                     TC-NFR2-01 / TC-07-06)
#     flood           $FAKE_CORE_FLOOD_LINES numbered stdout lines
#                     (default 10 000), exit 0 — log-flood bound for
#                     TC-06-12 (M1-18 batch)
#     nonutf8         one stdout line containing invalid UTF-8 bytes
#                     (\377\376), exit 0 — non-UTF-8 core output for
#                     TC-06-11 (M1-18 batch)
#     fail-canary     two stderr lines then exit 3: line 1
#                     `fake-core: simulated fatal storage failure`, line 2
#                     (last) `failed to open <configPath>: access
#                     EXAMPLEACCESSKEYID01 denied` where <configPath> is the
#                     value of the `-c` argv (last-line secret fixture for
#                     TC-02-06 / S5-2; M1-26 batch, DV-32). Without a `-c`
#                     arg (standalone `--mode=` debugging) the placeholder
#                     `<config>` is printed instead — no live paths leak.
#     gibberish       binds like `sleep` (READY on stdout), then streams
#                     20 x 8320 'x' bytes with NO newline and keeps running
#                     until killed — the no-newline flood repro for the
#                     unbounded line-reader buffer, TC-02-28 (issue #22,
#                     M1-25 finding S5-8; pre-M3 fix batch)
#     hold-stdio      binds like `sleep` but IGNOREs SIGTERM (`trap '' TERM`)
#                     and leaves a `(sleep 20)` grandchild holding the stdio
#                     pipes; the port binder is an INLINE node one-liner
#                     (stdout to /dev/null) that exits as soon as this parent
#                     dies (200 ms pid poll) — the PORT never leaks, only the
#                     stdio stays held (<= 20 s). Repro for the stop
#                     last-resort bound, TC-02-29 (issue #22, M1-25 finding
#                     S5-15; pre-M3 fix batch)
#     anything else   diagnostic on stderr, exit 64 (fixture misuse)
#
#   argv     every invocation appends `### pid=$$` + one `arg=<value>` line per
#            argument to $FAKE_CORE_ARGV_FILE (if set) — the test proves the
#            supervisor passed exactly `run -c <configPath>` (PR-08, step 4).
#   signals  a trapped SIGTERM appends `TERM` to $FAKE_CORE_SIGNAL_FILE (if
#            set) before a clean exit 0 — the stop-path signal pin (FR-16).
#   port     FAKE_CORE_PORT overrides the bound port (default 10808); the
#            supervisor probes DEFAULT_SOCKS_PORT (src/shared/constants.ts).
set -u

mode=sleep
mode_from_argv=0
for arg in "$@"; do
  case "$arg" in
    --mode=*)
      mode=${arg#--mode=}
      mode_from_argv=1
      ;;
  esac
done
if [ "$mode_from_argv" -eq 0 ] && [ -n "${FAKE_CORE_MODE:-}" ]; then
  mode=$FAKE_CORE_MODE
fi

record_argv() {
  if [ -n "${FAKE_CORE_ARGV_FILE:-}" ]; then
    {
      printf '### pid=%s\n' "$$"
      for value in "$@"; do
        printf 'arg=%s\n' "$value"
      done
    } >>"$FAKE_CORE_ARGV_FILE"
  fi
}

record_signal() {
  if [ -n "${FAKE_CORE_SIGNAL_FILE:-}" ]; then
    printf '%s\n' "$1" >>"$FAKE_CORE_SIGNAL_FILE"
  fi
}

binder_pid=

on_term() {
  record_signal TERM
  if [ -n "$binder_pid" ]; then
    kill "$binder_pid" 2>/dev/null || :
  fi
  exit 0
}

start_binder() {
  # sh cannot bind a TCP port; a node one-liner stands in for the core's
  # SOCKS inbound so the supervisor's documented readiness probe (FR-21/A-12:
  # TCP connect to 127.0.0.1:10808) has something real to connect to.
  node -e '
    const net = require("node:net");
    const port = Number(process.env.FAKE_CORE_PORT || 10808);
    const server = net.createServer();
    server.listen(port, "127.0.0.1");
    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000); // do not wait on a lingering probe socket
    });
  ' &
  binder_pid=$!
}

record_argv "$@"

case "$mode" in
  sleep | ready)
    trap 'on_term' TERM
    start_binder
    printf 'READY\n'
    wait
    ;;
  chatty)
    trap 'on_term' TERM
    printf 'fake-core: stdout line 1\n'
    printf 'fake-core: stderr line 1\n' >&2
    printf 'fake-core: stdout line 2\n'
    printf 'fake-core: stderr line 2\n' >&2
    start_binder
    printf 'READY\n'
    wait
    ;;
  fail | exit-nonzero)
    printf 'fake-core: simulated fatal storage failure\n' >&2
    exit 3
    ;;
  silent)
    exec sleep 86400
    ;;
  echo-secrets)
    if [ -z "${FAKE_CORE_CONFIG:-}" ]; then
      printf 'fake-core: echo-secrets requires FAKE_CORE_CONFIG\n' >&2
      exit 64
    fi
    cat "$FAKE_CORE_CONFIG"
    exit 0
    ;;
  flood)
    total=${FAKE_CORE_FLOOD_LINES:-10000}
    i=1
    while [ "$i" -le "$total" ]; do
      printf 'fake-core: flood line %s\n' "$i"
      i=$((i + 1))
    done
    exit 0
    ;;
  nonutf8)
    printf 'fake-core: raw bytes \377\376 follow\n'
    exit 0
    ;;
  fail-canary)
    canary_cfg='<config>'
    expect_cfg=0
    for value in "$@"; do
      if [ "$expect_cfg" -eq 1 ]; then
        canary_cfg=$value
        expect_cfg=0
      elif [ "$value" = "-c" ]; then
        expect_cfg=1
      fi
    done
    printf 'fake-core: simulated fatal storage failure\n' >&2
    printf 'failed to open %s: access EXAMPLEACCESSKEYID01 denied\n' "$canary_cfg" >&2
    exit 3
    ;;
  gibberish)
    # TC-02-28 (issue #22, S5-8): a flood WITHOUT newlines — the reader
    # buffer must cap at 64 KB force-flushed segments instead of growing
    # unbounded until stream end.
    trap 'on_term' TERM
    start_binder
    printf 'READY\n'
    chunk=$(printf '%08320d' 0 | tr '0' 'x')
    i=1
    while [ "$i" -le 20 ]; do
      printf '%s' "$chunk"
      i=$((i + 1))
    done
    while :; do sleep 1; done
    ;;
  hold-stdio)
    # TC-02-29 (issue #22, S5-15): TERM is ignored and a grandchild holds
    # the stdio pipes — 'close' (and thus the supervisor's `exited`) cannot
    # fire within the stop budget. The inline binder frees the PORT the
    # moment this parent dies, so no later case inherits a held listener.
    trap '' TERM
    FAKE_CORE_PARENT=$$ node -e '
      const net = require("node:net");
      const parent = Number(process.env.FAKE_CORE_PARENT);
      const port = Number(process.env.FAKE_CORE_PORT || 10808);
      const server = net.createServer();
      server.listen(port, "127.0.0.1");
      const poll = setInterval(() => {
        try {
          process.kill(parent, 0);
        } catch {
          clearInterval(poll);
          server.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 1000); // do not wait on a lingering probe socket
        }
      }, 200);
    ' >/dev/null 2>&1 &
    (sleep 20) &
    printf 'READY\n'
    while :; do sleep 1; done
    ;;
  *)
    printf 'fake-core: unknown mode: %s\n' "$mode" >&2
    exit 64
    ;;
esac

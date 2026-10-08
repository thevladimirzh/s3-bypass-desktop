# Troubleshooting

## Start is grey / nothing happens

- **Import a profile first** — no config is loaded. Import one, then Start.
- **Start the tunnel first** — the local proxy is not up; browsing will not be
  proxied until the badge reads `Running`.

## The app says the desktop is not supported

Some desktop environments cannot be configured automatically. The app tells
you exactly what to set by hand: a **SOCKS** proxy at **127.0.0.1**, port
**10808** (the hint in the app repeats this sentence — use those numbers).

In your browser or system network settings:

- Proxy type: SOCKS5
- Host: `127.0.0.1`
- Port: `10808`

Turn the manual proxy off again when the tunnel is stopped, or connections
will fail while nothing is listening.

## The status badge reads `Core crashed`

1. Open the **Logs** section.
2. Press **Copy logs** — one click puts the visible log rows on the clipboard.
3. Paste them into your report (see [beta-setup](beta-setup.md)).

**Clear** empties the log view; it does not uninstall or reconfigure anything.

## Import fails

- The file must be the tunnel config you were given (`.json`).
- Re-download it if the parser complains — a truncated download parses as
  garbage.

## Still stuck

Copy the logs (**Copy logs**), note your OS and app version, and send both
with your report.

# First profile

The whole loop is three steps: import a config, press **Start**, browse.

## 1. Import a profile

Click **Import** and pick your tunnel config file (`.json`). The app parses it
and shows the connection profile it received.

Until a profile is imported the app refuses to start and tells you so with the
exact hint **Import a profile first** — that refusal is deliberate: there is
nothing to connect with yet.

## 2. Start the tunnel

Press **Start**. The status badge walks through the states:

| Badge          | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `Stopped`      | idle, nothing running                                                    |
| `Starting...`  | core is launching and connecting                                         |
| `Running`      | tunnel is up, the local SOCKS proxy is live                              |
| `Stopping...`  | shutting down                                                            |
| `Core crashed` | the core exited unexpectedly — see [troubleshooting](troubleshooting.md) |

While the app is **not running** the hint **Start the tunnel first** tells you
why browsing is not proxied yet.

Once the badge reads `Running`, point your browser or system proxy at the
local SOCKS endpoint shown in the app (default `127.0.0.1:10808`).

## 3. Stop

Press **Stop** to shut the tunnel down cleanly. Your imported profile stays —
next launch it is already there.

## Tray

The tray menu keeps the essentials close: **Show window**, **Start tunnel**,
**Stop tunnel**, **Quit**. The start/stop entries grey out when the state makes
them meaningless.

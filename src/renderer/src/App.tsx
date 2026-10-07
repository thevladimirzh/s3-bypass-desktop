import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_SOCKS_PORT } from '../../shared/constants';
import type { AppError, PingResult, ProfileSummary, StatusSnapshot } from '../../shared/ipc';
import LogsView from './components/LogsView';

/** The §2.3 lifecycle states — derived from the IPC payload (shared §4.2). */
type CoreState = StatusSnapshot['state'];

/**
 * FR-41 visible-state wording mirrored into the main window (FR-24 /
 * AC-03.1: a TEXT label, never color-only): `Stopped`/`Running`/
 * `Core crashed` verbatim, exactly as the tray shows them. The transient
 * `starting`/`stopping` states print busy text on the SAME badge (A-14;
 * wording open per DV-27(5), pinned only as "retires the previous label,
 * never blank" — the wording here mirrors the tray's statusText).
 */
const STATUS_LABELS: Record<CoreState, string> = {
  stopped: 'Stopped',
  starting: 'Starting...',
  running: 'Running',
  stopping: 'Stopping...',
  crashed: 'Core crashed',
};

/** FR-12 / FR-30 exact user-visible hint wording, verbatim (AC-02.3 / AC-04.4). */
const HINT_NO_PROFILE = 'Import a profile first';
const HINT_PROXY_NOT_RUNNING = 'Start the tunnel first';

export default function App() {
  const [ping, setPing] = useState<PingResult | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [importError, setImportError] = useState<AppError | null>(null);

  // Current §4.2 status snapshot — initial `stopped` (data-flows §5 startup
  // render), then the single `status:get` answer and every pushed transition.
  const [status, setStatus] = useState<StatusSnapshot>({
    state: 'stopped',
    lastError: null,
    socksPort: DEFAULT_SOCKS_PORT,
  });
  // The error VISIBLE on screen (§2.3 retention): set from a pushed/answer
  // `lastError`, kept through the recovery `starting`, cleared only on a
  // successful `→ running` — never by stop/stopped (FR-27).
  const [shownError, setShownError] = useState<AppError | null>(null);
  // US-04 "One toggle" (M1-27b, D-01 / issue #14): the CONFIRMED mirror of
  // main's applied proxy state — the initial position arrives from
  // `proxy:get` at mount, the box flips ONLY when a `setProxy` round-trip
  // answers ok (AC-04.6 — never optimistic), and every main-side change
  // (auto-on-start / stop-restore, AC-04.1/AC-04.7) is re-read back in.
  const [proxyEnabled, setProxyEnabled] = useState(false);
  // While a toggle write is in flight its RESULT owns the flip — a
  // background re-read (push/focus) must not clobber the confirmed state
  // that is about to land.
  const proxyWritePending = useRef(false);

  // One confirmed-state mirror: adopt main's `active` flag through
  // `proxy:get` (the §4.2 channel — a read on events, never a status poll).
  // Stable identity so effects may depend on it (react-hooks/exhaustive-deps).
  const readProxyState = useCallback((): void => {
    if (proxyWritePending.current) return;
    window.s3Bypass
      ?.getProxy?.()
      .then((snapshot) => setProxyEnabled(snapshot.active))
      .catch(() => {
        // FR-48: a bridge failure has nothing safe to render — state stays.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.s3Bypass
      ?.ping()
      .then((result) => {
        if (!cancelled) setPing(result);
      })
      .catch(() => {
        if (!cancelled) setPing(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Startup path (data-flows §5): the stored profile arrives as its §8.3
  // summary through profile:get — never the config document (FR-55).
  useEffect(() => {
    let cancelled = false;
    window.s3Bypass
      ?.getProfile?.()
      .then((view) => {
        if (!cancelled) setProfile(view.summary);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Status exposure (FR-63/FR-26, data-flows (b) step 7 + §5): ONE
  // `onStatusChanged` listener is registered at mount — every later update
  // arrives by push, never by a second `getStatus()` poll. The subscribe
  // happens BEFORE the startup `status:get` (same race rule as LogsView), so
  // a transition racing the round-trip is either already in the snapshot or
  // follows immediately as a push.
  useEffect(() => {
    let cancelled = false;
    const applySnapshot = (snapshot: StatusSnapshot): void => {
      if (cancelled) return;
      setStatus(snapshot);
      // §2.3 lastError rules (AC-03.4): a pushed error replaces the shown
      // one; `running` clears it; every other transition retains it.
      setShownError((previous) =>
        snapshot.state === 'running' ? null : (snapshot.lastError ?? previous),
      );
      // M1-27b (AC-04.1/AC-04.7): a push may carry a transition main drove
      // WITHOUT this window (tray start/stop + auto-on-start/restore) —
      // re-read the proxy mirror so the toggle shows the HOST, not a guess.
      readProxyState();
    };
    const unsubscribe = window.s3Bypass?.onStatusChanged?.(applySnapshot);
    window.s3Bypass
      ?.getStatus?.()
      .then(applySnapshot)
      .catch(() => {
        // No bridge / failed startup fetch — the initial `stopped` render
        // stands; pushes keep working whenever the bridge appears (FR-48:
        // nothing raw to render from a failure).
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [readProxyState]);

  // M1-27b (D-01): the proxy mirror READS at mount (the position is main's
  // truth, never a guessed default) and re-reads whenever the window
  // regains focus — a tray-driven start/stop may have changed the host
  // proxy while the window was hidden, and the status push can race the
  // auto-apply (main orders the apply AFTER the `running` push; FR-26 keeps
  // that push single, so focus is the honest re-sync point).
  useEffect(() => {
    readProxyState();
    const onFocus = (): void => readProxyState();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [readProxyState]);

  // FR-01/AC-01.1/AC-01.2: success shows the summary and clears any previous
  // error, cancel changes nothing (it is not an error), and only an explicit
  // NFR-5 triple from main is rendered as title / cause / next step.
  const importProfile = (): void => {
    window.s3Bypass
      ?.importProfileDialog?.()
      .then((result) => {
        if (result.ok) {
          setProfile(result.summary);
          setImportError(null);
        } else if ('error' in result) {
          setImportError(result.error);
        }
      })
      .catch(() => {
        // Main answers with documented triples; a rejection here is a bridge
        // failure with nothing safe to render (FR-48), so state stays as-is.
      });
  };

  // §4.2 core:start / core:stop — the enabled control drives the bridge
  // member once (FR-13); status transitions themselves arrive ONLY as pushes
  // (FR-63), so a result is only surfaced as text when it carries a triple.
  // M1-27b: a successful round-trip also re-reads the proxy mirror — the
  // auto-apply/restore happened INSIDE main during this very call
  // (amended AC-04.1/AC-04.7), so the toggle must follow the HOST result.
  const runTunnelAction = (action: 'startCore' | 'stopCore'): void => {
    window.s3Bypass?.[action]?.()
      .then((result) => {
        if (result.ok) {
          readProxyState();
        } else {
          setShownError(result.error);
        }
      })
      .catch(() => {
        // Bridge failure with nothing safe to render (FR-48) — state stays.
      });
  };

  const state = status.state;
  const running = state === 'running';
  const busy = state === 'starting' || state === 'stopping';
  const hasProfile = profile !== null;
  // §2.3 legal actions (plan M1-17 disabled/busy matrix): Start only from
  // `stopped`/`crashed` WITH a profile (FR-12/AC-02.1/AC-03.6 recovery),
  // Stop only while `running` (FR-13), and during `starting`/`stopping` BOTH
  // controls are disabled (FR-18 UI half — busy, no legal action).
  const startDisabled = busy || !hasProfile || (state !== 'stopped' && state !== 'crashed');
  const stopDisabled = busy || !running;

  return (
    <main className="shell">
      <h1>S3 Bypass Desktop</h1>
      <p className="tagline">Import a config — press Start — the internet works.</p>
      <section className="status">
        {ping ? (
          <p>
            Core IPC: <strong>ready</strong> · default SOCKS port {ping.socksPort} · {ping.app}
          </p>
        ) : (
          <p>
            Core IPC: <strong>not connected</strong> (run inside Electron)
          </p>
        )}
      </section>
      {/* US-03 / FR-24: the status area — text badge (never color-only), the
          §2.3 Start/Stop controls with their guards, and the last error as
          selectable document text (AC-03.4/AC-03.5, FR-27 — no stacks). */}
      <section className="status tunnel">
        <h2>Tunnel</h2>
        <p className="status-badge">{STATUS_LABELS[state]}</p>
        <div className="controls">
          <button
            type="button"
            onClick={() => runTunnelAction('startCore')}
            disabled={startDisabled}
          >
            Start
          </button>
          <button type="button" onClick={() => runTunnelAction('stopCore')} disabled={stopDisabled}>
            Stop
          </button>
        </div>
        {/* FR-12 (AC-02.3): Start exists but is disabled while no profile is
            imported — the exact hint wording carries the reason. */}
        {!hasProfile && <p className="hint">{HINT_NO_PROFILE}</p>}
        {shownError !== null && (
          <div className="error" role="alert">
            <p>
              <strong>{shownError.title}</strong>
            </p>
            <p>{shownError.cause}</p>
            <p>{shownError.nextStep}</p>
          </div>
        )}
      </section>
      {/* FR-30 / AC-04.4: while the core is not `running` the toggle is
          disabled and the exact hint is visible; a pushed `running` retires
          the hint. M1-27b (D-01): the On/Off position is the CONFIRMED mirror
          driven through the bridge — click sends `setProxy`, the box flips
          only on {ok:true}, a refused attempt renders the module's triple
          (AC-04.6) and keeps/returns the box to main's reported truth. */}
      <section className="status proxy">
        <h2>System proxy</h2>
        <label className="proxy-toggle">
          <input
            type="checkbox"
            checked={proxyEnabled}
            disabled={!running}
            onChange={() => {
              const next = !proxyEnabled;
              proxyWritePending.current = true;
              window.s3Bypass
                ?.setProxy?.({ enabled: next })
                .then((result) => {
                  proxyWritePending.current = false;
                  if (result.ok) {
                    // Confirmed — flip ONLY here (AC-04.6: never optimistic).
                    setProxyEnabled(next);
                  } else {
                    // Plain-language triple, rendered by the existing
                    // role=alert area untouched (NFR-5, FR-48: nothing raw).
                    setShownError(result.error);
                    readProxyState();
                  }
                })
                .catch(() => {
                  // Bridge failure (FR-48): nothing safe to render — re-adopt
                  // main's truth instead of guessing a local position.
                  proxyWritePending.current = false;
                  readProxyState();
                });
            }}
          />{' '}
          Use system proxy
        </label>
        {!running && <p className="hint">{HINT_PROXY_NOT_RUNNING}</p>}
      </section>
      <section className="status profile">
        <h2>Profile</h2>
        {profile !== null ? (
          <dl className="profile-summary">
            <dt>Name</dt>
            <dd>{profile.displayName}</dd>
            <dt>Endpoint</dt>
            <dd>{profile.endpointHost}</dd>
            <dt>Bucket</dt>
            <dd>{profile.bucket}</dd>
            <dt>Prefix</dt>
            <dd>{profile.prefix}</dd>
            <dt>Region</dt>
            <dd>{profile.region}</dd>
            <dt>Imported</dt>
            <dd>{profile.importedAt}</dd>
          </dl>
        ) : (
          <p>No profile imported yet.</p>
        )}
        <button type="button" onClick={importProfile}>
          Import profile
        </button>
        {importError !== null && (
          <div className="error" role="alert">
            <p>
              <strong>{importError.title}</strong>
            </p>
            <p>{importError.cause}</p>
            <p>{importError.nextStep}</p>
          </div>
        )}
      </section>
      {/* M1-19 (FR-45/FR-49): the logs view — main-redacted lines, copy/clear. */}
      <LogsView />
      <footer>M0 scaffold — tunnel features land in M1.</footer>
    </main>
  );
}

import { useEffect, useState } from 'react';

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
  // US-04 "One toggle": the local On/Off position — the OS wiring itself
  // lands with M1-21; this round pins only the status-driven enablement.
  const [proxyEnabled, setProxyEnabled] = useState(false);

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
  }, []);

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
  const runTunnelAction = (action: 'startCore' | 'stopCore'): void => {
    window.s3Bypass?.[action]?.()
      .then((result) => {
        if (!result.ok) setShownError(result.error);
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
          the hint. The working On/Off behavior itself stays M1-21's. */}
      <section className="status proxy">
        <h2>System proxy</h2>
        <label className="proxy-toggle">
          <input
            type="checkbox"
            checked={proxyEnabled}
            disabled={!running}
            onChange={() => setProxyEnabled((value) => !value)}
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

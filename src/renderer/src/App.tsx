import { useEffect, useState } from 'react';

import type { AppError, PingResult, ProfileSummary } from '../../shared/ipc';

export default function App() {
  const [ping, setPing] = useState<PingResult | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [importError, setImportError] = useState<AppError | null>(null);

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
      <footer>M0 scaffold — tunnel features land in M1.</footer>
    </main>
  );
}

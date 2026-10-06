import { useEffect, useState } from 'react';
import type { PingResult } from '../../shared/ipc';

export default function App() {
  const [ping, setPing] = useState<PingResult | null>(null);

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
      <footer>M0 scaffold — tunnel features land in M1.</footer>
    </main>
  );
}

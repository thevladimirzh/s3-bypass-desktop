/**
 * M3-08 (RED) — i18n groundwork (board Phase D, batch D): ONE English
 * strings module with a `t(key)` seam. The renderer, the tray menu and the
 * hints must render through that seam — and every existing exact-wording
 * pin must stay byte-identical GREEN (the seam re-exports the very strings
 * the pins already assert: e2e `Import a profile first`, TC-04-04
 * `Start the tunnel first`, TC-05-04 `Show window`, TC-06-05
 * `No log lines yet.`, the AC-04.5 manual-proxy sentence, FR-41 status
 * words).
 *
 * Test plan: TC-POL-05 (docs/qa/m3-test-plan.md §5).
 * Spec: BRIEF §3 (English first, Russian → backlog — NO RU content lands
 * in the MVP), BRIEF §9 productName stays out of the translatable set
 * (identity, pinned by builder-config), plan M3-08 ("the seam re-exports
 * the very strings the pins already assert").
 *
 * Scope decisions recorded in m3-test-plan §5: identity strings (the
 * `S3 Bypass Desktop` h1/footer and section headings that are product
 * names) and the dev-only IPC line stay outside the seam — they are not
 * translatable copy; error triples stay out because their wording lives in
 * `docs/analysis/errors.md` and the main-process modules (batch A), never
 * in renderer copy.
 *
 * ABSENCE RED (strategy §5.1): `src/shared/strings.ts` does not exist yet —
 * the loader below reports that by name, never by a raw module error, and
 * the literal specifier keeps it out of tsc's module graph so the RED keeps
 * typecheck at 0 (the `error-triples-stub` trick).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../helpers/log-collector-stub';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

function repoFile(relative: string): string {
  const full = join(ROOT, relative);
  expect(existsSync(full), `repo file ${relative} must exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

/** Comment-stripped consumer source (precedent TC-IPC-10 / TC-06-15). */
function consumerCode(relative: string): string {
  return stripComments(repoFile(relative));
}

/** ABSENCE RED loader for the planned `src/shared/strings.ts`. */
async function loadStrings(): Promise<Record<string, unknown> | null> {
  const specifier = ['..', '..', 'src', 'shared', 'strings'].join('/');
  try {
    return (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `[key, byte-identical value]` — every value EXACTLY as pins assert today. */
const EXACT_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['status.stopped', 'Stopped'],
  ['status.starting', 'Starting...'],
  ['status.running', 'Running'],
  ['status.stopping', 'Stopping...'],
  ['status.crashed', 'Core crashed'],
  ['hint.noProfile', 'Import a profile first'],
  ['hint.proxyNotRunning', 'Start the tunnel first'],
  ['action.start', 'Start'],
  ['action.stop', 'Stop'],
  ['tray.showWindow', 'Show window'],
  ['tray.startTunnel', 'Start tunnel'],
  ['tray.stopTunnel', 'Stop tunnel'],
  ['tray.quit', 'Quit'],
  ['logs.title', 'Logs'],
  ['logs.empty', 'No log lines yet.'],
  ['logs.copy', 'Copy logs'],
  ['logs.clear', 'Clear logs'],
  ['app.tagline', 'Import a config — press Start — the internet works.'],
];

const UNSUPPORTED_FORMAT =
  'Not supported on this desktop — set it manually: SOCKS proxy {host}, port {port}.';

describe('TC-POL-05 — single EN strings module with a t(key) seam (M3-08)', () => {
  it('strings.moduleExistsAndTSeamIsByteIdentical', async () => {
    expect(
      existsSync(join(ROOT, 'src/shared/strings.ts')),
      'M3-08 (board Phase D): the single EN strings module src/shared/strings.ts ' +
        'must exist — renderer/tray/hint copy concentrates there (ABSENCE RED)',
    ).toBe(true);
    const mod = await loadStrings();
    if (mod === null) {
      throw new Error('src/shared/strings.ts must be importable (M3-08 ABSENCE RED)');
    }
    if (typeof mod.t !== 'function') {
      throw new Error('src/shared/strings.ts must export a t(key) seam function (M3-08)');
    }
    const t = mod.t as (key: string, params?: Record<string, string | number>) => string;

    for (const [key, expected] of EXACT_ROWS) {
      expect(
        t(key),
        `t('${key}') must be byte-identical to the string every existing pin asserts ` +
          '(M3-08 contract: the seam re-exports the very strings, never reworded)',
      ).toBe(expected);
    }
    expect(
      t('hint.unsupportedDesktop', { host: '127.0.0.1', port: 10808 }),
      'AC-04.5 (TC-POL-03): the parameterized manual-proxy sentence must render ' +
        'byte-identical through the seam',
    ).toBe(UNSUPPORTED_FORMAT.replace('{host}', '127.0.0.1').replace('{port}', '10808'));
  });

  it('strings.enMapCarriesNoRussianContent', async () => {
    // BRIEF §3: English first, Russian → backlog — the EN map must contain
    // NO Cyrillic (a RU value landing here would be an M3 scope violation).
    const mod = await loadStrings();
    if (mod === null || typeof mod.t !== 'function') {
      throw new Error(
        'src/shared/strings.ts with a t(key) seam must exist to scan it (M3-08 ABSENCE RED)',
      );
    }
    const t = mod.t as (key: string, params?: Record<string, string | number>) => string;
    const values = EXACT_ROWS.map(([key]) => t(key));
    values.push(t('hint.unsupportedDesktop', { host: '127.0.0.1', port: 10808 }));
    for (const value of values) {
      expect(
        /\p{Script=Cyrillic}/u.test(value),
        `BRIEF §3: the EN value "${value}" must not contain Cyrillic — RU is backlog, ` +
          'not MVP content',
      ).toBe(false);
    }
  });

  it('strings.consumersRenderThroughTheSeam', () => {
    // The consumers must stop hardcoding the copy: the literal is GONE from
    // their source (comment-stripped — comments may still cite the wording)
    // and the t('…') key is present instead. Rendered output is unchanged
    // (byte-identical seam), so every existing wording pin stays green.
    const app = consumerCode('src/renderer/src/App.tsx');
    expect(app.includes("from '../../shared/strings'"), 'M3-08: App.tsx imports the seam').toBe(
      true,
    );
    for (const literal of [
      "'Import a profile first'",
      "'Start the tunnel first'",
      'Not supported on this desktop — set it manually:',
    ]) {
      expect(
        app.includes(literal),
        `M3-08: App.tsx must not hardcode ${literal} — it renders through t(key)`,
      ).toBe(false);
    }
    for (const key of [
      "t('hint.noProfile')",
      "t('hint.proxyNotRunning')",
      "t('hint.unsupportedDesktop'",
      "t('action.start')",
      "t('action.stop')",
      "t('app.tagline')",
    ]) {
      expect(app, `M3-08: App.tsx renders ${key}`).toContain(key);
    }

    const logs = consumerCode('src/renderer/src/components/LogsView.tsx');
    for (const literal of ["'No log lines yet.'", '>Copy logs<', 'Copy logs', 'Clear logs']) {
      // 'Copy logs'/'Clear logs' appear as JSX text today; after the seam
      // they exist only as t('logs.copy')/t('logs.clear') keys.
      expect(logs.includes(literal), `M3-08: LogsView.tsx must not hardcode ${literal}`).toBe(
        false,
      );
    }
    for (const key of ["t('logs.title')", "t('logs.empty')", "t('logs.copy')", "t('logs.clear')"]) {
      expect(logs, `M3-08: LogsView.tsx renders ${key}`).toContain(key);
    }

    const tray = consumerCode('src/main/window-lifecycle.ts');
    for (const literal of ["'Show window'", "'Start tunnel'", "'Stop tunnel'", "label: 'Quit'"]) {
      expect(
        tray.includes(literal),
        `M3-08: window-lifecycle.ts must not hardcode ${literal} (tray copy moves to the seam)`,
      ).toBe(false);
    }
    for (const key of [
      "t('tray.showWindow')",
      "t('tray.startTunnel')",
      "t('tray.stopTunnel')",
      "t('tray.quit')",
    ]) {
      expect(tray, `M3-08: window-lifecycle.ts renders ${key}`).toContain(key);
    }

    const labels = consumerCode('src/shared/status-labels.ts');
    expect(
      labels.includes(": 'Stopped'"),
      'M3-08: the status-label map must not hardcode its words — each entry is t(status.*)',
    ).toBe(false);
    for (const key of [
      "t('status.stopped')",
      "t('status.starting')",
      "t('status.running')",
      "t('status.stopping')",
      "t('status.crashed')",
    ]) {
      expect(labels, `M3-08: status-labels.ts renders ${key}`).toContain(key);
    }
  });
});

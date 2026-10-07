/**
 * M1-24 smoke E2E — TC-E2E-01 `smoke.importStartRunningLogsStopStopped`
 * (docs/qa/m1-test-plan.md §8) plus the DOM half of TC-NFR2-01 (zero
 * canaries anywhere in the rendered page). Plan row: docs/plans/m1-mvp.md
 * M1-24; layer contract: docs/qa/strategy.md §2 L3 — "exactly one happy-path
 * smoke path".
 *
 * One scenario against the REAL Electron app built by `npm run build`:
 *   launch `out/main/index.js` → import the `valid-client-config.json`
 *   fixture → Start → status badge `Running` (FR-41) → Logs view shows the
 *   fake core's `READY` line → Stop → badge `Stopped` → app still alive →
 *   quit through the app's own teardown → no orphan core (port released).
 *
 * Declared deviations (docs/qa/m1-test-plan.md §14 DV-31) — declared, not
 * hidden:
 *  1. File lives at `tests/e2e/*.spec.ts` (strategy §4.1). The default
 *     `vitest.config.ts` include requires the `.test.` infix under `tests/`
 *     (i.e. `tests/` + `**` + `/*.test.{ts,tsx}`) and does NOT match
 *     `.spec.ts`, so the unit suite (191 cases) never picks it up;
 *     this file runs only via `npm run test:e2e`
 *     (`vitest.e2e.config.ts`, long timeouts, no parallelism).
 *  2. Import drives the NATIVE file dialog: the only entry is the
 *     `profile:import-dialog` handler whose body calls
 *     `dialog.showOpenDialog` in main — no programmatic-path IPC exists and
 *     `src/**` may not be changed. Standard Playwright-Electron workaround:
 *     stub `dialog.showOpenDialog` on the main-process singleton through
 *     `electronApp.evaluate` BEFORE clicking Import.
 *  3. App-state isolation: `src/main/secret-store.ts` persists at
 *     `app.getPath('userData')/profile-store.blob` with NO env override in
 *     `src/main/index.ts` (overrides are read only when `!app.isPackaged`:
 *     `CORE_BINARY_PATH` plus the M1-27b `DISABLE_AUTO_PROXY` fixture flag
 *     below — neither touches userData). The launch passes Electron's
 *     standard `--user-data-dir=<per-run temp dir>` switch (verified honored
 *     by `app.getPath('userData')` — no `src/**` change), asserts the app
 *     actually resolved to that temp dir (isolation pin: fail loudly instead
 *     of touching real user data), and removes the temp dir in `afterAll`.
 *  4. Port preflight: a BIND probe fails the suite with a clear message when
 *     127.0.0.1:10808 is held — never a silent skip.
 *  5. Core binary: `CORE_BINARY_PATH` → `tests/fixtures/fake-core.sh`,
 *     `FAKE_CORE_MODE=sleep`, `FAKE_CORE_PORT=10808` (the supervisor's
 *     readiness probe port, FR-21) — synthetic loopback data only (strategy
 *     §1): fixture config with canary credentials, `example.com` hosts, no
 *     live network.
 *  6. Host-OS safety (M1-27b, strategy §1): `DISABLE_AUTO_PROXY=1` keeps the
 *     amended AC-04.1 auto-on-start from ever touching the HOST system
 *     proxy while this fixture drives Start (honored only when
 *     `!app.isPackaged` — the S4-5 `CORE_BINARY_PATH` pattern); Stop/quit
 *     remain the module's `restoreSystemProxy(ctx, null)` no-op (nothing
 *     was applied, no command runs).
 */
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { waitFor, waitForPortFree } from '../helpers/core-supervisor-stub';

/** Repo root — this file lives at `tests/e2e/smoke.spec.ts`. */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The app-owned loopback port every start-path pin needs free (BRIEF §2.4). */
const SOCKS_PORT = 10808;

/** Built production entry (electron-vite → `out/`, package.json `main`). */
const APP_ENTRY = join(REPO_ROOT, 'out', 'main', 'index.js');

/** Fake core for the run (S4-5 dev override `CORE_BINARY_PATH`). */
const FAKE_CORE = join(REPO_ROOT, 'tests', 'fixtures', 'fake-core.sh');

/** The import fixture (§9.1 — canary credentials, loopback inbound). */
const FIXTURE_CONFIG = join(REPO_ROOT, 'tests', 'fixtures', 'configs', 'valid-client-config.json');

/** Synthetic canaries (§9.3) — the redaction invariant greps the DOM for. */
const CANARIES_FILE = join(REPO_ROOT, 'tests', 'fixtures', 'secrets', 'canary.secrets.txt');

/**
 * The §8.3 summary the fixture must render as its Name — prefix
 * `profiles/vlt-alpha` (label `vlt-alpha`) @ endpoint `https://s3.example.com`
 * (host `s3.example.com`), exactly what `buildProfileSummary` derives.
 */
const IMPORTED_PROFILE_NAME = 'vlt-alpha @ s3.example.com';

/** Canary lines (synthetic, §9.3) — must never appear in the rendered DOM. */
const CANARIES: readonly string[] = readFileSync(CANARIES_FILE, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '');

let app: ElectronApplication | null = null;
let page: Page | null = null;
let userDataDir: string | null = null;

function requireApp(): ElectronApplication {
  if (app === null) {
    throw new Error('E2E app was not launched — beforeAll did not reach launch');
  }
  return app;
}

function requirePage(): Page {
  if (page === null) {
    throw new Error('E2E window was not captured — beforeAll did not reach firstWindow()');
  }
  return page;
}

/**
 * Launch environment: the parent env (PATH, HOME, TMPDIR — the fake core's
 * `node` binder and the materialized config need it) minus anything that
 * would hijack the run, plus the sanctioned overrides (DV-31(5)).
 */
function launchEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  // Never load a dev URL or run as Node — the smoke tests the BUILT app.
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  env.CORE_BINARY_PATH = FAKE_CORE;
  env.FAKE_CORE_MODE = 'sleep';
  env.FAKE_CORE_PORT = String(SOCKS_PORT);
  // M1-27b host-OS safety: never rewrite the fixture machine's system proxy
  // when the smoke's Start auto-applies (strategy §1, S4-5 pattern gate).
  env.DISABLE_AUTO_PROXY = '1';
  return env;
}

/**
 * One bind attempt on 127.0.0.1:`port` — true only when the bind succeeds
 * (i.e. nothing else is listening), and the probe server is fully closed
 * before resolving. Same rule as DV-29's `waitForPortFree`: a successful
 * bind is the strongest "free" evidence available.
 */
function bindProbeFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;
    const settle = (free: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(free);
    };
    server.once('error', () => settle(false)); // EADDRINUSE — still held
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => settle(true));
    });
  });
}

/** Fails the step with the error block's text — a triple, never a timeout. */
async function failOnVisibleError(target: Page, step: string): Promise<void> {
  const errors = target.locator('.error');
  if ((await errors.count()) > 0) {
    throw new Error(`${step} surfaced an error block: ${await errors.first().textContent()}`);
  }
}

describe('M1-24 smoke E2E — real Electron app (TC-E2E-01)', () => {
  beforeAll(async () => {
    // Preflight (DV-31(4)): the built entry must exist and the readiness
    // port must be free — both FAIL loudly, never skip.
    if (!existsSync(APP_ENTRY)) {
      throw new Error(
        `built app entry missing: ${APP_ENTRY} — run \`npm run build\` first (\`npm run test:e2e\` does)`,
      );
    }
    if (!(await bindProbeFree(SOCKS_PORT))) {
      throw new Error(
        `E2E preflight failed: 127.0.0.1:${SOCKS_PORT} is already in use — quit the program ` +
          'holding it (e.g. a VPN/system daemon) and rerun `npm run test:e2e`; refusing to run silently.',
      );
    }

    // Per-run userData (DV-31(3)): Electron's standard `--user-data-dir`
    // switch redirects `app.getPath('userData')` — full isolation from any
    // real profile, no `src/**` change. Fresh empty dir → the store starts
    // empty by construction, no backup/restore of real user data at all.
    userDataDir = realpathSync(mkdtempSync(join(tmpdir(), 's3bypass-e2e-userdata-')));

    app = await electron.launch({
      args: [APP_ENTRY, `--user-data-dir=${userDataDir}`],
      env: launchEnv(),
    });
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Import profile' }).waitFor({ timeout: 15_000 });

    // Isolation pin: if the switch were ever NOT honored, fail loudly here
    // instead of silently reading/writing the machine's real profile store.
    const observedUserData: string = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath('userData'),
    );
    expect(
      observedUserData,
      'E2E app-state isolation broken: --user-data-dir was not honored',
    ).toBe(userDataDir);

    // Native-dialog stub (DV-31(2)): `profile:import-dialog` resolves
    // `dialog.showOpenDialog` on this very singleton at invoke time.
    await app.evaluate(({ dialog }, fixturePath: string) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [fixturePath],
      })) as unknown as typeof dialog.showOpenDialog;
    }, FIXTURE_CONFIG);
  });

  afterAll(async () => {
    try {
      const currentApp = app;
      if (currentApp !== null) {
        // Capture the handle BEFORE the quit — once the connection closes,
        // Playwright's `process()` accessor itself throws (observed M1-24).
        const child = currentApp.process();
        try {
          if (child.exitCode === null && child.signalCode === null) {
            // Quit through the app's OWN teardown (FR-42: before-quit → stop
            // core → restore proxy → exit) — never a bare process kill.
            await currentApp.evaluate(({ app: electronApp }) => {
              electronApp.quit();
            });
            await waitFor(
              () => child.exitCode !== null || child.signalCode !== null,
              15_000,
              'the Electron process to exit after its own app.quit() teardown',
            );
          }
        } finally {
          // No orphan fake-core: its binder would still hold the port (DV-29
          // release barrier) — a real leak fails here, loudly.
          await waitForPortFree(
            SOCKS_PORT,
            5_000,
            'no orphan fake-core holding 127.0.0.1:10808 after the app quit',
          );
        }
      }
    } finally {
      // Per-run userData (DV-31(3)): gone with the run — even when a step
      // above failed, no test residue stays on the machine.
      if (userDataDir !== null) {
        rmSync(userDataDir, { recursive: true, force: true });
      }
    }
  });

  it('smoke.importStartRunningLogsStopStopped', async () => {
    const target = requirePage();
    const badge = target.locator('.status-badge');
    const startButton = target.getByRole('button', { name: 'Start', exact: true });
    const stopButton = target.getByRole('button', { name: 'Stop', exact: true });

    // — Step 0: clean startup state (data-flows §5, FR-12) — no profile,
    // badge `Stopped` (FR-41), Start disabled with the exact hint, logs empty.
    await waitFor(
      async () => (await badge.textContent()) === 'Stopped',
      10_000,
      'the initial status badge to read "Stopped"',
    );
    expect(await target.locator('.profile-summary').count()).toBe(0);
    expect(await target.locator('.log-empty').count()).toBe(1);
    expect(await startButton.isDisabled()).toBe(true);
    expect(await target.locator('.hint', { hasText: 'Import a profile first' }).count()).toBe(1);

    // — Step 1: import the fixture profile through the (stubbed) dialog —
    // US-01: validation, encryption at rest, §8.3 summary on screen.
    await target.getByRole('button', { name: 'Import profile' }).click();
    await waitFor(
      async () =>
        (await target.locator('.profile-summary').count()) === 1 ||
        (await target.locator('.error').count()) > 0,
      10_000,
      'the imported profile summary (or an error block) after Import',
    );
    await failOnVisibleError(target, 'Import');
    expect(await target.locator('.profile-summary dd').first().textContent()).toBe(
      IMPORTED_PROFILE_NAME,
    );
    expect(await target.locator('.hint', { hasText: 'Import a profile first' }).count()).toBe(0);
    await waitFor(
      async () => !(await startButton.isDisabled()),
      5_000,
      'the Start control to enable once a profile exists (AC-02.1)',
    );

    // — Step 2: Start → status `running` reaches the badge (FR-41 text) —
    // supervisor: binary check → port free → materialize → spawn → readiness
    // probe on 127.0.0.1:10808 within 10 s (FR-20/FR-21).
    await startButton.click();
    await waitFor(
      async () =>
        (await badge.textContent()) === 'Running' || (await target.locator('.error').count()) > 0,
      15_000,
      'the status badge to read "Running" (or an error block) after Start',
    );
    await failOnVisibleError(target, 'Start');
    expect(await badge.textContent()).toBe('Running');
    await waitFor(
      async () => !(await stopButton.isDisabled()),
      5_000,
      'the Stop control to enable while running (FR-13)',
    );

    // — Step 3: Logs visible (US-06) — at least the fake core's readiness
    // line arrived through the redaction pipeline and rendered (FR-45/FR-47).
    await waitFor(
      async () => (await target.locator('.log-list li').count()) >= 1,
      10_000,
      'at least one line in the Logs view',
    );
    const logsText = (await target.locator('.log-list').textContent()) ?? '';
    expect(logsText).toContain('READY');
    expect(await target.locator('.log-empty').count()).toBe(0);

    // — Redaction invariant (TC-NFR2-01 DOM half, NFR-2): the canary
    // credentials from the imported fixture appear NOWHERE in the DOM —
    // profile summary, badges, errors or log rows.
    const dom = await target.content();
    for (const canary of CANARIES) {
      expect(dom, `canary "${canary}" must not appear in the rendered DOM`).not.toContain(canary);
    }

    // — Step 4: Stop → status `stopped` (FR-13/FR-41) and the core is
    // really gone while the app still runs: its binder released the port.
    await stopButton.click();
    await waitFor(
      async () =>
        (await badge.textContent()) === 'Stopped' || (await target.locator('.error').count()) > 0,
      10_000,
      'the status badge to read "Stopped" (or an error block) after Stop',
    );
    await failOnVisibleError(target, 'Stop');
    expect(await badge.textContent()).toBe('Stopped');
    await waitForPortFree(
      SOCKS_PORT,
      5_000,
      'the fake-core port release after Stop — no core may outlive the stop',
    );

    // — Step 5: the app is still alive after Stop (US-02 AC-02.x): same
    // process, same window, no exit.
    expect(requireApp().process().exitCode).toBeNull();
    expect(await target.locator('main.shell').isVisible()).toBe(true);
  });
});

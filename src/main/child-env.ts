/**
 * M2-21 fix — the explicit environment of the spawned core child
 * (issue #21; M1-25 finding S5-12, re-surfaced by M2-09 §3): `spawn` used
 * no `env` option, so the child inherited the ENTIRE parent environment —
 * the user's own secrets (a terminal-launched app exports AWS_*-class
 * keys/tokens), `CORE_BINARY_PATH` and `ELECTRON_*` all reached a child
 * that never reads them. PR-08's args-array rule stays (no shell), and the
 * env is now explicit beside it.
 *
 * Contract fixed by tests/unit/child-env.test.ts (TC-02-26/27,
 * m1-test-plan §2, DV-61):
 *
 *   - allowlist `{ PATH, HOME, TMPDIR, LANG }` plus the platform basics
 *     `{ USER, LOGNAME }` (issue #21's "allowlist … + platform basics",
 *     the reading declared in DV-61);
 *   - `FAKE_CORE_*` passes ONLY when `isPackaged !== true` — the
 *     documented dev/test seam behind the same `!isPackaged` gate idea as
 *     `CORE_BINARY_PATH` (issue #6's resolver gate);
 *   - the env is BUILT from the allowlist (never filtered by deletion),
 *     so secrets, `CORE_BINARY_PATH`, `ELECTRON_*` and any other parent
 *     var cannot ride in either arm;
 *   - an omitted `isPackaged` (every existing rig) = the dev arm — the
 *     FAKE_CORE_* fixture contract survives with zero rig edits.
 */

/** Host keys the pinned core may legitimately see (platform basics included). */
export const CHILD_ENV_ALLOWLIST = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER', 'LOGNAME'] as const;

export interface ChildEnvOptions {
  /** `app.isPackaged` from the host — false/omitted keeps the dev/test seam. */
  readonly isPackaged?: boolean | undefined;
}

/**
 * Build the child's env from the allowlist (fail-closed by construction:
 * unknown keys are absent, not stripped afterwards).
 */
export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  options: ChildEnvOptions = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = base[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (options.isPackaged !== true) {
    for (const [key, value] of Object.entries(base)) {
      if (key.startsWith('FAKE_CORE_') && value !== undefined) {
        env[key] = value;
      }
    }
  }
  return env;
}

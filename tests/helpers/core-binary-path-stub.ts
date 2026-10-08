/**
 * Shared machinery for the M2-04 (RED) bundled-core-path batch — the pure
 * host-side resolver that decides which executable the supervisor may spawn
 * (board task M2-04, `docs/plans/m2-packaging.md` Phase B). No Electron, no
 * process, no filesystem: every input arrives as an argument (DV-28
 * pure-glue pattern).
 *
 * Declares the M2-04 contract surface (full text in the header of
 * `tests/unit/core-binary-path.test.ts`): module
 * `src/main/core-binary-path.ts` exporting `resolveCoreBinaryPath(env)` where
 * the packaged bundle path ALWAYS wins (S4-5 / issue #6 — a packaged run can
 * never be steered to another executable), the `CORE_BINARY_PATH` dev
 * override is honored only while `!app.isPackaged` (M1 contract, DV-31 /
 * issue #6), and the bundle path is the per-platform layout
 * `join(resourcesPath ?? '.', 'core', platform, 'xray')`.
 *
 * Loader note: `import(coreBinaryPathModule)` takes a NON-LITERAL specifier
 * on purpose — `tests/**` is inside `tsconfig.node.json`'s `include`, so a
 * literal import of the not-yet-existing module would make
 * `npm run typecheck` fail (which must stay exit 0 during RED). At runtime
 * Vitest resolves the relative specifier against this file, so the moment
 * M2-04 GREEN creates the module the very same line loads it: absence RED
 * becomes assertion RED with zero test edits (strategy §5.2). Verified
 * pattern: the identical non-literal loader already ships for
 * `core-wiring`, `system-proxy`, `core-supervisor` and `window-lifecycle`
 * (M1-16 RED, DV-28).
 *
 * This file is a helper, not a suite: `vitest.config.ts` collects only
 * `*.test.ts(x)` under `tests/`.
 */

/** Injected inputs of the resolver — the host environment, nothing global. */
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

/** Module surface QA declares for M2-04 (header-contract style). */
export interface CoreBinaryPathModule {
  /** Pure resolution order: packaged bundle > dev override > bundle path. */
  resolveCoreBinaryPath(env: CoreBinaryPathEnv): string;
}

/**
 * Non-literal on purpose (see file header): typecheck stays green while
 * `src/main/core-binary-path.ts` does not exist; the runtime resolution is
 * the legitimate *absence RED* reason for this batch (strategy §5.2) — never
 * weaken this path or the tests behind it.
 */
const coreBinaryPathModule: string = '../../src/main/core-binary-path';

export async function loadCoreBinaryPath(): Promise<CoreBinaryPathModule> {
  try {
    return (await import(/* @vite-ignore */ coreBinaryPathModule)) as CoreBinaryPathModule;
  } catch (failure) {
    throw new Error(
      'M2-04 contract missing: src/main/core-binary-path.ts could not be loaded — ' +
        'M2-04 GREEN implements this module (plan m2-packaging.md Phase B, ' +
        'm2-test-plan §3). Absence RED is the expected failure until then ' +
        '(strategy §5.2). Cause: ' +
        (failure instanceof Error ? failure.message : String(failure)),
    );
  }
}

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ad-hoc sign the packaged macOS bundle.
 *
 * The build is deliberately unsigned (BRIEF §10 — no Apple Developer account,
 * `mac.identity: null`). But "unsigned" left the bundle with a Mach-O the linker
 * had signed ad-hoc on its own and no `Contents/_CodeSignature` at all. `spctl`
 * reads that as "code has no resources but signature indicates they must be
 * present", and macOS answers with "приложение повреждено" — which reads like a
 * corrupt download and sends testers hunting for a bad hash instead of clicking
 * through one honest prompt. Both published betas shipped that way.
 *
 * An ad-hoc signature is not a Developer ID: Gatekeeper still asks a human to
 * confirm the first launch (right-click → Open), or the quarantine attribute has
 * to be cleared. What it fixes is that the failure becomes honest — a bundle
 * whose signature is internally consistent instead of one macOS calls damaged.
 *
 * Must run after every file is packed: adding files to a bundle invalidates any
 * earlier signature, so this belongs at the end of the pack hook.
 */
export function signMacBundle(appPath, { platform = process.platform } = {}) {
  if (platform !== 'darwin') {
    return { signed: false, reason: `not darwin (${platform})` };
  }
  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    throw new Error(`mac sign: no app bundle at ${appPath}`);
  }

  // --deep covers nested frameworks, helpers and the bundled core binary.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], {
    stdio: 'pipe',
  });

  const hasSignature = existsSync(join(appPath, 'Contents', '_CodeSignature'));
  if (!hasSignature) {
    throw new Error(`mac sign: codesign produced no Contents/_CodeSignature in ${appPath}`);
  }
  return { signed: true, appPath };
}

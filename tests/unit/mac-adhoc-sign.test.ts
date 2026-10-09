import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression guard for the "приложение повреждено" dialog on macOS.
 *
 * Both published betas shipped a bundle with no Contents/_CodeSignature.
 * spctl reads that as "code has no resources but signature indicates they must
 * be present" and macOS calls the app damaged — which sends testers verifying
 * download hashes instead of clicking through one honest Gatekeeper prompt.
 */
interface MacAdhocSignModule {
  signMacBundle: (
    appPath: string,
    opts?: { platform?: NodeJS.Platform },
  ) => { signed: boolean; reason?: string; appPath?: string };
}

const moduleSpecifier: string = '../../scripts/mac-adhoc-sign';

let signMacBundle: MacAdhocSignModule['signMacBundle'];
beforeAll(async () => {
  signMacBundle = ((await import(/* @vite-ignore */ moduleSpecifier)) as MacAdhocSignModule)
    .signMacBundle;
});

const onDarwin = process.platform === 'darwin';

/** A minimal but structurally real bundle: a Mach-O that codesign accepts. */
function makeBundle(): string {
  const root = mkdtempSync(join(tmpdir(), 'mac-sign-'));
  const app = join(root, 'Test.app');
  const contents = join(app, 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), '<plist/>');
  // A real Mach-O; a shell script would fail codesign.
  execFileSync('cp', ['/bin/echo', join(contents, 'MacOS', 'Test')]);
  return app;
}

describe('mac ad-hoc signing (TC-PKG-24)', () => {
  it('is a no-op off darwin, and says why', () => {
    const res = signMacBundle('/nonexistent/Test.app', { platform: 'linux' });
    expect(res.signed).toBe(false);
    expect(res.reason).toContain('not darwin');
  });

  it('refuses a missing bundle on darwin instead of silently skipping', () => {
    if (!onDarwin) return;
    expect(() => signMacBundle('/nonexistent/Test.app')).toThrow(/no app bundle/);
  });

  it.runIf(onDarwin)('produces Contents/_CodeSignature', () => {
    const app = makeBundle();
    expect(existsSync(join(app, 'Contents', '_CodeSignature'))).toBe(false);

    expect(signMacBundle(app).signed).toBe(true);
    expect(existsSync(join(app, 'Contents', '_CodeSignature'))).toBe(true);
  });

  it.runIf(onDarwin)('leaves a bundle codesign considers internally consistent', () => {
    const app = makeBundle();
    signMacBundle(app);

    // codesign --verify must pass — the exact property whose absence produced
    // the "damaged" dialog.
    expect(() => execFileSync('codesign', ['--verify', app], { stdio: 'pipe' })).not.toThrow();

    // spctl must no longer report the broken-resource-seal error. It still
    // rejects an unnotarised ad-hoc build: that is the honest prompt we want.
    let assessment = '';
    try {
      assessment = execFileSync('spctl', ['-a', '-vv', app], { stdio: 'pipe' }).toString();
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      assessment = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(assessment).not.toContain('code has no resources');
  });

  it.runIf(onDarwin)('is idempotent — re-signing does not fail', () => {
    const app = makeBundle();
    signMacBundle(app);
    expect(() => signMacBundle(app)).not.toThrow();
  });
});

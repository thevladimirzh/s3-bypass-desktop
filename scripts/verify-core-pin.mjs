#!/usr/bin/env node
/**
 * M2-03 — verify a downloaded core asset against the pinned SHA-256
 * recorded in docs/analysis/core-pin.md (BRIEF §9; M2 DoD #1: SHA-256 of
 * the bundled core verified at build time).
 *
 * Contract fixed by tests/unit/core-pin.test.ts (TC-PKG-01..03, DV-39):
 *
 *   node scripts/verify-core-pin.mjs [--pin-doc <path>] <file> <asset>
 *
 *   - exit 0 + "core pin OK" on a digest match;
 *   - exit 1 + "MISMATCH" naming the asset when the digest differs, the
 *     asset has no pin row, or the file/doc cannot be read;
 *   - exit 2 + usage on bad arguments.
 *
 * The default pin doc resolves from this script's location, not from cwd,
 * so `npm run verify:core-pin` works from anywhere. The `--pin-doc`
 * override exists for tests (synthetic records) — the three ~23 MB release
 * assets never enter the repo.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PIN_DOC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'analysis',
  'core-pin.md',
);
const SHA256_RE = /\b[0-9a-f]{64}\b/;

/**
 * Return the pinned SHA-256 for `assetName` from the pin-doc text, or null
 * when the asset has no pin row (first line that names the asset and
 * carries a 64-hex digest wins).
 */
export function expectedShaForAsset(docText, assetName) {
  const row = docText.split('\n').find((line) => line.includes(assetName) && SHA256_RE.test(line));
  const match = row === undefined ? null : SHA256_RE.exec(row);
  return match === null ? null : match[0];
}

function usage(message) {
  process.stderr.write(
    `${message}\nUsage: node scripts/verify-core-pin.mjs [--pin-doc <path>] <file> <asset>\n`,
  );
  process.exit(2);
}

function fail(message) {
  process.stderr.write(`MISMATCH: ${message}\n`);
  process.exit(1);
}

function main(args) {
  let pinDoc = DEFAULT_PIN_DOC;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--pin-doc') {
      const value = args[i + 1];
      if (value === undefined) usage('--pin-doc requires a path');
      pinDoc = resolve(value);
      i += 1;
    } else if (arg.startsWith('--')) {
      usage(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 2) usage('expected exactly <file> and <asset>');
  const [file, asset] = positional;

  let docText;
  try {
    docText = readFileSync(pinDoc, 'utf8');
  } catch (error) {
    fail(`cannot read pin doc ${pinDoc} (${String(error)})`);
  }
  const expected = expectedShaForAsset(docText, asset);
  if (expected === null) fail(`no pinned SHA-256 for asset ${asset} in ${pinDoc}`);

  let actual;
  try {
    actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (error) {
    fail(`cannot read asset file ${file} (${String(error)})`);
  }
  if (actual !== expected) {
    fail(`digest for ${asset}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
  process.stdout.write(`core pin OK: ${asset} ${actual}\n`);
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

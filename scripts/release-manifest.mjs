#!/usr/bin/env node
/**
 * M2-07 — write AND verify the release SHA-256 manifest (M2 DoD #1:
 * "writes a SHA-256 manifest verified at build time").
 *
 * Contract fixed by tests/unit/release-ci.test.ts (TC-PKG-14, DV-43):
 *
 *   node scripts/release-manifest.mjs <dir>
 *
 *   1. FIRST RUN (no `<dir>/SHA256SUMS.txt` yet): hash every top-level
 *      FILE of `<dir>` (subdirectories and the manifest itself are
 *      skipped), sorted by filename, and write
 *      `<sha256>  <filename>` lines; then re-read the manifest and
 *      re-hash the files against it — any drift → exit 1.
 *   2. RE-RUN (manifest exists): verify the CURRENT files against the
 *      existing manifest — a changed, missing or unlisted file → stderr
 *      `MISMATCH <file>` with expected/actual digests, exit 1. The
 *      manifest is NEVER rewritten on drift (it is the record of
 *      evidence). All match → stdout `manifest OK …`, exit 0.
 *   3. Anything other than exactly one positional argument (or a dir that
 *      cannot be read) → usage on stderr, exit 2.
 *
 * The two-run semantics is what makes the tool a verifier: the workflow
 * writes the manifest at build time and any later touch of an artifact
 * (re-run before upload, local re-check) is caught against the original
 * record. Used by .github/workflows/release.yml after `npm run dist`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST = 'SHA256SUMS.txt';

function usage(message) {
  process.stderr.write(`${message}\nUsage: node scripts/release-manifest.mjs <dir>\n`);
  process.exit(2);
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function mismatch(name, expected, actual) {
  process.stderr.write(`MISMATCH ${name}\n  expected: ${expected}\n  actual:   ${actual}\n`);
  process.exit(1);
}

function main(args) {
  if (args.length !== 1) usage('expected exactly one positional <dir>');
  const dir = args[0];

  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== MANIFEST)
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    usage(`cannot read directory ${dir}: ${String(error)}`);
  }

  const manifestPath = join(dir, MANIFEST);
  let existing;
  try {
    existing = readFileSync(manifestPath, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing === undefined) {
    // First run: write from freshly computed digests, then re-verify the
    // write against a second hashing pass.
    const lines = names.map((name) => `${hashFile(join(dir, name))}  ${name}`);
    writeFileSync(manifestPath, lines.map((line) => `${line}\n`).join(''));
    for (const line of lines) {
      const expected = line.slice(0, 64);
      const name = line.slice(66);
      const actual = hashFile(join(dir, name));
      if (actual !== expected) mismatch(name, expected, actual);
    }
    process.stdout.write(`manifest OK: created ${lines.length} entries in ${manifestPath}\n`);
    return;
  }

  // Re-run: the existing manifest is the record of evidence — verify the
  // current files against it and never rewrite on drift.
  const recorded = new Map();
  for (const line of existing.split('\n')) {
    if (line.trim() === '') continue;
    recorded.set(line.slice(66), line.slice(0, 64));
  }
  for (const name of names) {
    const expected = recorded.get(name);
    if (expected === undefined) {
      mismatch(name, 'absent from the existing manifest', 'new file present');
    }
    let actual;
    try {
      actual = hashFile(join(dir, name));
    } catch (error) {
      mismatch(name, expected, `unreadable (${String(error)})`);
    }
    if (actual !== expected) mismatch(name, expected, actual);
    recorded.delete(name);
  }
  if (recorded.size > 0) {
    const [name] = [...recorded.keys()];
    mismatch(name, recorded.get(name), 'file missing from the directory');
  }
  process.stdout.write(`manifest OK: ${names.length} files verified against ${manifestPath}\n`);
}

main(process.argv.slice(2));

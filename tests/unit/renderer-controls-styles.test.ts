/**
 * TC-02-25 (styles half) — issue #26, owner decision 2026-10-08.
 *
 * The single round connect toggle's SHAPE (incy-style: a large circle) is a
 * stylesheet contract: jsdom computes no layout, and the renderer test
 * project may not read files (tsconfig.web.json carries no node types; vitest
 * processes `?raw` CSS imports to empty strings), so this structural scan
 * runs in the plain node env exactly like its scan-style siblings
 * (TC-05-15 / TC-01-15 — source pins for seams a runtime test cannot see).
 *
 * The DOM half of the same TC ID (single button, `.connect-toggle` marker
 * class, exact accessible-name seam Start/Stop) lives in
 * tests/unit/status-exposure.test.tsx (startStop.controls.
 * singleRoundConnectToggle); the guard semantics stay TC-02-15's.
 *
 * Plan row: docs/qa/m1-test-plan.md §2 TC-02-25 (DV-59).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const STYLES_CSS = fileURLToPath(new URL('../../src/renderer/src/styles.css', import.meta.url));

describe('connect toggle shape — round and large (issue #26, TC-02-25)', () => {
  it('startStop.controls.connectToggleStylesRoundAndLarge', () => {
    const css = readFileSync(STYLES_CSS, 'utf8');
    const rule = css.match(/\.connect-toggle\s*\{([^}]*)\}/);
    expect(rule, 'styles.css must define the .connect-toggle rule').not.toBeNull();
    const body = rule?.[1] ?? '';

    expect(body, 'issue #26: the toggle is a CIRCLE (border-radius: 50%)').toMatch(
      /border-radius:\s*50%/,
    );

    const width = body.match(/(?:^|[^-\w])width:\s*([\d.]+)rem/);
    const height = body.match(/(?:^|[^-\w])height:\s*([\d.]+)rem/);
    expect(width, '.connect-toggle pins a rem width (square canvas)').not.toBeNull();
    expect(height, '.connect-toggle pins a rem height (square canvas)').not.toBeNull();
    expect(
      Number(width?.[1]),
      'issue #26: width and height must be EQUAL — the control is a circle',
    ).toBe(Number(height?.[1]));
    expect(
      Number(width?.[1]),
      'issue #26: LARGE — at least 6rem across (incy-style, not a small pill)',
    ).toBeGreaterThanOrEqual(6);
  });
});

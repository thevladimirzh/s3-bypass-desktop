/**
 * ONE source for the visible status words (FR-41 / AC-03.1: a TEXT label,
 * never color-only) — M3-06, m3-test-plan TC-POL-03.
 *
 * The renderer's badge (`src/renderer/src/App.tsx`, re-exported as
 * `STATUS_LABELS`) and the tray menu's `statusText`
 * (`src/main/window-lifecycle.ts`, re-exported as `STATUS_TEXT`) used to be
 * duplicated literals that could drift; the pin in
 * `tests/unit/app-render.test.tsx` compares the two exports, so both
 * consumers now re-export THIS map and the words can never disagree.
 *
 * Wording: `stopped`/`running`/`crashed` verbatim per FR-41; the transient
 * `starting`/`stopping` busy labels keep their M1-22 wording (A-14 /
 * DV-27(5): only "non-empty text that retires the previous label" was ever
 * pinned — these exact strings are now the shared source of that pin).
 */
import type { CoreState } from './status-machine';

/** The complete state → visible-label map (data-flows §2.3 state set). */
export const STATUS_LABELS: Readonly<Record<CoreState, string>> = {
  stopped: 'Stopped',
  starting: 'Starting...',
  running: 'Running',
  stopping: 'Stopping...',
  crashed: 'Core crashed',
};

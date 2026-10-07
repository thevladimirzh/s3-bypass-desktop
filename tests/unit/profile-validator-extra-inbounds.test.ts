/**
 * M1-26 (RED) — S5-1 (GitHub issue #7): BR-V-09 must cover EVERY inbound
 * entry, not only the first socks listener.
 *
 * Test plan IDs: TC-01-37, TC-01-38, TC-01-39 (docs/qa/m1-test-plan.md §1,
 * allocated in §14 DV-32) — US-01/US-02; the defense-in-depth materialization
 * twin (TC-02-19) lives in tests/unit/core-supervisor-hardening.test.ts.
 *
 * Spec sources: docs/qa/security-m1-25.md §2/§3 S5-1 (findings: the validator
 * locates the FIRST inbound with protocol === "socks", breaks, and passes the
 * document through — additional entries bind 0.0.0.0 unchallenged, "exactly
 * the exposure BR-V-09 exists to prevent"); docs/analysis/requirements.md
 * BR-V-09 (loopback-only, otherwise the proxy would be exposed); docs/analysis/
 * errors.md §1 (E-VAL-010 address half, E-VAL-014 shape half); docs/analysis/
 * data-flows.md flow (a) step 4 (the import validator is the ONLY enforcement
 * point — §2.1 step 0's start-time re-validation does not exist, S5-1);
 * docs/product/stories/US-01-profile-import.md AC-01.4.
 *
 * Layer: L1 unit, pure node over the M1-12 contract (`validateClientConfig(raw)`
 * → NFR-5 triple, no fs/IPC/network — BR-V-16, strategy §1). Synthetic
 * fixtures only: the three §10 row fixtures below are the canary config plus
 * ONE non-conforming extra entry each (S5-1 fix item 3), reserved endpoints
 * and the §9.3 canary credentials throughout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT FOR M1-26 (header-contract style, DV-09/DV-16; any deviation
 * requires an upstream spec note first — strategy §5.2, never a silent test
 * edit): `validateClientConfig` iterates ALL `inbounds` entries and rejects
 * the document when ANY entry is not a socks listener bound to a loopback
 * address:
 *
 *   · entry is not a socks listener object (wrong protocol, non-record) →
 *     E-VAL-014 ("Invalid inbound settings", errors.md §1 shape half);
 *   · entry IS a socks listener but `listen` ∉ {127.0.0.1, ::1} →
 *     E-VAL-010 ("Unsafe listen address", address half — the found value is
 *     interpolated, cf. TC-01-25);
 *   · an entry that violates BOTH halves may answer either documented code
 *     (TC-01-37's mixed fixture — the fix options in S5-1 name both codes
 *     for the same entry; QA pins the SET, not the precedence).
 *
 * Every rejection additionally runs the shared NFR-5 wording contract
 * (`expectHumanError` + `wordingRowFor` — DV-19: only documented codes, an
 * unpinned code fails loudly in `wordingRowFor`).
 *
 * Precondition guard: each fixture minus its extra entry (the canary config's
 * single loopback socks inbound) must be ACCEPTED — so a rejection below can
 * only be caused by the extra entry, never by an unrelated fixture defect.
 *
 * RED status: ASSERTION RED — today's BR-V-09 loop breaks at the first socks
 * entry (src/main/profile-validator.ts:324-328), so all three fixtures are
 * ACCEPTED; each case fails inside `captureValidationError` ("returned ok")
 * after its green precondition. Never a mock-setup error. Strategy §5.2: do
 * not weaken, skip, or delete; M1-26 GREEN implements this contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from 'vitest';

import type { AppError } from '../../src/shared/status-machine';
import { expectHumanError, wordingRowFor } from '../helpers/error-wording';
import {
  captureValidationError,
  loadProfileValidator,
  readConfigFixture,
} from '../helpers/profile-validator-stub';

/** Fixture documents here carry only what this batch reads. */
interface FixtureDoc {
  readonly inbounds?: unknown[];
}

/** The fixture with only its FIRST inbound entry (the loopback socks one). */
function baseWithoutExtraInbound(fixture: string): string {
  const doc = JSON.parse(readConfigFixture(fixture)) as FixtureDoc;
  return JSON.stringify({ ...doc, inbounds: (doc.inbounds ?? []).slice(0, 1) });
}

/**
 * Precondition: the fixture minus its extra entry is a conforming profile, so
 * every rejection below is attributable to that entry alone (S5-1). A failure
 * here is a FIXTURE defect, never an implementation verdict.
 */
async function expectBaseAccepted(fixture: string): Promise<void> {
  const validator = await loadProfileValidator();
  const base = validator.validateClientConfig(baseWithoutExtraInbound(fixture));
  expect(
    base.ok,
    `precondition (${fixture}): the canary config plus a single loopback socks inbound ` +
      `must stay accepted — otherwise this fixture is defective, not non-conforming ` +
      `(got ${JSON.stringify(base)})`,
  ).toBe(true);
}

/**
 * The fixture must be rejected with one of `allowedCodes`, and the triple must
 * satisfy the shared NFR-5 contract (an undocumented code fails in
 * `wordingRowFor` — DV-19).
 */
async function rejectWith(
  raw: string,
  allowedCodes: readonly string[],
  context: string,
): Promise<AppError> {
  const validator = await loadProfileValidator();
  const error = captureValidationError(validator.validateClientConfig(raw), context);
  expect(
    allowedCodes,
    `${context}: S5-1 — the offending extra inbound must be rejected with a documented ` +
      `BR-V-09 code (${allowedCodes.join(' | ')}); got ${error.code}`,
  ).toContain(error.code);
  expectHumanError(wordingRowFor(error.code), error);
  return error;
}

describe('profile validator — every inbound entry is validated (S5-1, BR-V-09)', () => {
  it('profileValidator.inbounds.extraNonLoopbackInboundRejected', async () => {
    // TC-01-37 / S5-1 fix item 3, mixed fixture: a loopback socks inbound
    // PLUS a dokodemo-door listener on 0.0.0.0:18080. The document must be
    // refused — either documented half of BR-V-09 answers (address E-VAL-010
    // or shape E-VAL-014), because the entry violates both.
    const FIXTURE = 'extra-inbound-0-0-0-0.json';
    await expectBaseAccepted(FIXTURE);

    const error = await rejectWith(
      readConfigFixture(FIXTURE),
      ['E-VAL-010', 'E-VAL-014'],
      'TC-01-37 / S5-1 (dokodemo-door 0.0.0.0)',
    );
    if (error.code === 'E-VAL-010') {
      expect(
        error.cause,
        'address half: the cause interpolates the found value (errors.md §1, cf. TC-01-25)',
      ).toContain('0.0.0.0');
    } else {
      expect(
        error.cause,
        'shape half: the cause states the socks-listener requirement (errors.md §1, cf. TC-01-26)',
      ).toContain('listener object');
    }
  });

  it('profileValidator.inbounds.secondNonLoopbackSocksRejected', async () => {
    // TC-01-38 / S5-1: a SECOND socks inbound on a public interface — the
    // first (loopback) entry satisfies today's loop, the exposed twin is
    // never seen. Address half only (the entry IS a socks listener object),
    // so exactly E-VAL-010 documents this rejection.
    const FIXTURE = 'second-socks-0-0-0-0.json';
    await expectBaseAccepted(FIXTURE);

    const error = await rejectWith(
      readConfigFixture(FIXTURE),
      ['E-VAL-010'],
      'TC-01-38 / S5-1 (second socks 0.0.0.0)',
    );
    expect(
      error.cause,
      'errors.md §1 pattern names the offending address (cf. TC-01-25)',
    ).toContain('0.0.0.0');
  });

  it('profileValidator.inbounds.nonListenerEntryRejected', async () => {
    // TC-01-39 / S5-1, fixture 3 ("non-record inbound entry"): an entry that
    // is not a listener object at all rides along behind the valid socks
    // inbound. Shape half only → exactly E-VAL-014 (errors.md §1).
    const FIXTURE = 'non-record-inbound.json';
    await expectBaseAccepted(FIXTURE);

    const error = await rejectWith(
      readConfigFixture(FIXTURE),
      ['E-VAL-014'],
      'TC-01-39 / S5-1 (non-record entry)',
    );
    expect(
      error.cause,
      'the cause must state the socks-listener requirement (errors.md §1)',
    ).toContain('listener object');
  });
});

/**
 * What every test of the tax engine needs before it can assert anything: a
 * clock that does not move, and an independent implementation of the one
 * worksheet the whole page hangs off.
 *
 * These were the head of a single 3,000-line `tax.test.ts`. Splitting that file
 * along the modules it tests left them with ten readers instead of one, so they
 * live here rather than being pasted into each — a second copy of Worksheet 1
 * is a second thing that can drift from the publication it transcribes.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import { TAX_YEAR_PARAMS } from '../lib/tax';
import type { FilingStatus, TaxYear } from '../lib/tax';

/**
 * Every dollar figure in these files is a 2025 one, checked against Rev. Proc.
 * 2024-40 and IRS Pub 915 (2025). Scenarios that do not name a year inherit
 * `defaultTaxYear()`, which follows the calendar — so the clock is pinned
 * rather than letting January silently re-point these assertions at a different
 * Rev. Proc. The `tax year` describe in `params.test.ts` passes its own years
 * explicitly.
 */
export const PINNED_YEAR: TaxYear = 2025;

/**
 * Pins the clock for one test file. Called at the top level of each, where the
 * `beforeEach` it registers reads as the file's own.
 */
export function pinTaxYear(year: TaxYear = PINNED_YEAR): void {
  beforeEach(() => {
    // Date only: faking setTimeout as well would deadlock anything async.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${year}-07-01T00:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

/** Shorthand for the pinned year's figures, which most assertions read. */
export const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].avgAnnualSSBenefit;
export const MAX_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].maxAnnualSSBenefit;

/**
 * Line-by-line reference implementation of IRS Pub 915 (2025), Worksheet 1
 * "Figuring Your Taxable Benefits", assuming no exclusions or Schedule 1
 * adjustments (lines 5 and 7 = 0). See docs/irs-pub915-worksheet1-2025.md.
 */
export function pub915Worksheet1(
  ssBenefit: number,
  otherIncome: number,
  filingStatus: FilingStatus = 'single',
  muniInterest = 0,
): number {
  const line1 = ssBenefit; // box 5 of Forms SSA-1099/RRB-1099
  const line2 = 0.5 * line1;
  const line3 = otherIncome; // Form 1040 lines 1z, 2b, 3b, 4b, 5b, 7, 8
  const line4 = muniInterest; // tax-exempt interest, Form 1040 line 2a
  const line6 = line2 + line3 + line4;
  const line8 = line6; // provisional income
  // Base amount, worksheet line 9.
  const line9 = { single: 25_000, mfj: 32_000 }[filingStatus];
  const line10 = Math.max(0, line8 - line9);
  if (line10 === 0) return 0; // none of the benefits are taxable
  // Adjusted base amount less base amount: $34,000 - $25,000 single,
  // $44,000 - $32,000 joint.
  const line11 = { single: 9_000, mfj: 12_000 }[filingStatus];
  const line12 = Math.max(0, line10 - line11);
  const line13 = Math.min(line10, line11);
  const line14 = 0.5 * line13;
  const line15 = Math.min(line2, line14);
  const line16 = 0.85 * line12;
  const line17 = line15 + line16;
  const line18 = 0.85 * line1;
  return Math.min(line17, line18); // line 19: taxable benefits
}

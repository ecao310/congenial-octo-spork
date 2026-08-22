import type { FilingStatus, TaxYear } from './types';
import { FILING_STATUSES, TAX_YEARS, PAGE_TAX_YEAR, defaultTaxYear, taxYearParams, filingParams } from './params';
import { filingParamsFor } from './scenario';
import { SS_BASES, SS_BASE50_ENACTED, SS_BASE85_ENACTED, maxAnnualSSBenefit, avgAnnualSSBenefit, taxableSocialSecurity } from './socialSecurity';
import { standardDeductionFor } from './deductions';
import { federalIncomeTax, totalTax } from './income';
import { FPL_YEAR_PARAMS } from './ptc';
import { pinTaxYear, PINNED_YEAR } from '../../test/taxFixtures';

pinTaxYear();

describe('tax year', () => {
  /**
   * The year the page prices, and the one figure in this file that is a render
   * decision rather than a rule. It is pinned here rather than in `App.test.tsx`
   * because what has to hold is not what the page shows — that is asserted
   * there — but that whatever this constant names is a year the engine can
   * actually price. Setting it to a year with no Rev. Proc. behind it would
   * fail every figure on the page at once, and fail it here first.
   */
  it('prices a year that is on file', () => {
    expect(TAX_YEARS).toContain(PAGE_TAX_YEAR);
    // Deliberately not `defaultTaxYear()`: a constant is what keeps a link
    // sent in December meaning the same thing in January. They coincide today
    // and the point is that nothing requires them to.
    expect(taxYearParams(PAGE_TAX_YEAR)).toBeDefined();
  });

  it('defaults to the calendar year, clamped to the years on file', () => {
    // The pinned clock is the point: an un-yeared scenario follows the wall
    // calendar, so it moves to next year's figures on its own.
    expect(defaultTaxYear()).toBe(PINNED_YEAR);
    for (const year of TAX_YEARS) {
      expect(defaultTaxYear(year)).toBe(year);
    }
    const first = TAX_YEARS[0];
    const last = TAX_YEARS[TAX_YEARS.length - 1];
    // Before the first year on file and after the last, clamp rather than
    // throw: the app has to keep working in the January before a Rev. Proc.
    // is published, and the nearest year on file is the closest thing to right.
    expect(defaultTaxYear(first - 5)).toBe(first);
    expect(defaultTaxYear(last + 5)).toBe(last);
    // The invariant behind both clamps: whatever comes back is a year with
    // parameters behind it, for any calendar year at all.
    for (let year = first - 5; year <= last + 5; year++) {
      expect(TAX_YEARS).toContain(defaultTaxYear(year));
    }
  });

  it('is a well-formed schedule for every year and filing status', () => {
    for (const year of TAX_YEARS) {
      const params = taxYearParams(year);
      expect(params.year).toBe(year);
      expect(params.source).not.toBe('');
      expect(params.maxAnnualSSBenefit).toBeGreaterThan(params.avgAnnualSSBenefit);
      // A joint return puts two benefits on line 6a. The ceiling is exactly two
      // maximum records — two people, 35 years at the taxable maximum each,
      // each claiming at 70 — so it is checked as a doubling rather than as a
      // figure, and a year added to the table cannot get one end right and the
      // other wrong. The average is not two average ones and cannot be: SSA
      // publishes the couple figure separately and it lands well under twice
      // the retired-worker one, because so many second benefits are spousal.
      expect(params.maxAnnualCoupleSSBenefit).toBe(2 * params.maxAnnualSSBenefit);
      expect(params.avgAnnualCoupleSSBenefit).toBeGreaterThan(params.avgAnnualSSBenefit);
      expect(params.avgAnnualCoupleSSBenefit).toBeLessThan(2 * params.avgAnnualSSBenefit);
      for (const status of FILING_STATUSES) {
        const filing = filingParams(year, status);
        for (const schedule of [filing.brackets, filing.ltcgBrackets]) {
          // Ascending, and open-ended at the top so no income falls off the end.
          const tops = schedule.map((b) => b.upTo);
          expect(tops).toEqual([...tops].sort((a, b) => a - b));
          expect(tops[tops.length - 1]).toBe(Infinity);
          const rates = schedule.map((b) => b.rate);
          expect(rates).toEqual([...rates].sort((a, b) => a - b));
        }
        expect(filing.standardDeduction).toBeGreaterThan(0);
        expect(filing.additionalStdDeduction65).toBeGreaterThan(0);
      }
    }
  });

  it('reads 2026 off Rev. Proc. 2025-32 and the 2.8% COLA', () => {
    const single = filingParams(2026, 'single');
    expect(single.standardDeduction).toBe(16_100);
    expect(single.additionalStdDeduction65).toBe(2_050);
    expect(single.brackets.find((b) => b.rate === 0.12)?.upTo).toBe(50_400);
    expect(single.ltcgBrackets[0].upTo).toBe(49_450);
    expect(filingParams(2026, 'mfj').standardDeduction).toBe(32_200);
    expect(filingParams(2026, 'mfj').additionalStdDeduction65).toBe(1_650);
    expect(filingParams(2026, 'mfj').ltcgBrackets[0].upTo).toBe(98_900);
    expect(taxYearParams(2026).colaPercent).toBe(2.8);
    expect(maxAnnualSSBenefit(2026)).toBe(62_172); // $5,181/mo at age 70
    expect(avgAnnualSSBenefit(2026)).toBe(24_852); // $2,071/mo, January 2026
    expect(maxAnnualSSBenefit(2026, 'mfj')).toBe(124_344); // two of those records
    expect(avgAnnualSSBenefit(2026, 'mfj')).toBe(38_496); // $3,208/mo, a couple
    // Every 2026 figure is above its 2025 counterpart, because all of them are
    // indexed. The thresholds tested below are the exception that matters.
    expect(single.standardDeduction).toBeGreaterThan(
      filingParams(2025, 'single').standardDeduction,
    );
    expect(avgAnnualSSBenefit(2026)).toBeGreaterThan(avgAnnualSSBenefit(2025));
  });

  it('applies the selected year to the deduction, brackets and gain bands', () => {
    expect(standardDeductionFor({ year: 2025 })).toBe(15_750);
    expect(standardDeductionFor({ year: 2026 })).toBe(16_100);
    expect(standardDeductionFor({ year: 2026, seniors: 1 })).toBe(18_150);
    // The same nominal income costs less in 2026: the bands all widened.
    expect(federalIncomeTax(60_000, { year: 2026 })).toBeLessThan(
      federalIncomeTax(60_000, { year: 2025 }),
    );
    const gains = { ordinaryIncome: 0, ltcg: 49_000 };
    // $49,000 of pure gains clears the 2025 0% band by $650 but fits inside the
    // 2026 one — and the standard deduction covers the excess either way.
    expect(filingParamsFor({ year: 2025 }).ltcgBrackets[0].upTo).toBe(48_350);
    expect(filingParamsFor({ year: 2026 }).ltcgBrackets[0].upTo).toBe(49_450);
    expect(totalTax({ ...gains, year: 2026 })).toBeLessThanOrEqual(
      totalTax({ ...gains, year: 2025 }),
    );
  });

  it('never indexes the Social Security thresholds', () => {
    expect(SS_BASE50_ENACTED).toBe(1983);
    expect(SS_BASE85_ENACTED).toBe(1993);
    const scenario = { ordinaryIncome: 20_000, ssBenefit: 30_000 };
    // Same benefit, same other income, same taxable share — the one figure on
    // this page a new tax year cannot move.
    const taxable = TAX_YEARS.map((year) =>
      taxableSocialSecurity({ ...scenario, year }),
    );
    expect(new Set(taxable).size).toBe(1);
    // And the two bracket tables and the gain band all move underneath them.
    const bracketTop = (year: TaxYear, rate: number): number =>
      filingParams(year, 'single').brackets.find((b) => b.rate === rate)!.upTo;
    expect(bracketTop(2025, 0.12)).toBe(48_475);
    expect(bracketTop(2026, 0.12)).toBe(50_400);
    expect(filingParams(2025, 'single').ltcgBrackets[0].upTo).toBe(48_350);
    expect(filingParams(2026, 'single').ltcgBrackets[0].upTo).toBe(49_450);
  });

  it('taxes a larger share of the average benefit every year', () => {
    // The app's whole argument, as a number. The 50% base is frozen at $25,000
    // while the average benefit rises with each COLA, and half the benefit
    // counts toward provisional income — so the room for other income before
    // any benefit is taxable shrinks by half the COLA, every year.
    const headroom = (year: TaxYear): number =>
      SS_BASES.single.ssBase50 - 0.5 * avgAnnualSSBenefit(year);
    expect(headroom(2025)).toBeCloseTo(13_144, 6);
    expect(headroom(2026)).toBeCloseTo(12_574, 6);
    expect(headroom(2026)).toBeLessThan(headroom(2025));
    expect(headroom(2025) - headroom(2026)).toBeCloseTo(
      0.5 * (avgAnnualSSBenefit(2026) - avgAnnualSSBenefit(2025)),
      6,
    );
    // Stated the other way: at a fixed $20,000 of other income, the average
    // retiree has a bigger share of their benefit in the tax base each year.
    const share = (year: TaxYear): number =>
      taxableSocialSecurity({
        ordinaryIncome: 20_000,
        ssBenefit: avgAnnualSSBenefit(year),
        year,
      }) / avgAnnualSSBenefit(year);
    expect(share(2025)).toBeCloseTo(0.1446, 4);
    expect(share(2026)).toBeCloseTo(0.1494, 4);
    expect(share(2026)).toBeGreaterThan(share(2025));
  });
});

/**
 * The figures as the IRS printed them, checked against the tables this app
 * prices with.
 *
 * Every other test in this file asserts what the engine *does* with a
 * parameter. These assert that the parameter is the published one, which is a
 * different kind of failure and needs a different kind of test: a transcription
 * error survives every behavioural test in the suite, because the engine
 * happily computes the wrong bracket to six decimal places.
 *
 * The transcription is deliberately redundant. A Rev. Proc. rate table prints
 * three things per row — the threshold, the rate, and the cumulative tax at
 * that threshold ("$39,207 plus 32% of the excess over $201,750") — and the
 * third is a function of every row above it. Pinning all three means a mistyped
 * threshold has to be matched by a mistyped base amount to go unnoticed, and
 * the base amounts are the one column that is not a round number. That is what
 * caught the 2026 head-of-household 24% band sitting at the single filer's
 * $201,775 instead of its own $201,750: a $25 error, worth $2 of tax, invisible
 * to every other assertion here.
 *
 * Sources: Rev. Proc. 2024-40 section 2 (2025), Rev. Proc. 2025-32 sections 3
 * and 4 (2026, and the OBBBA standard deductions it substitutes into 2025),
 * Rev. Proc. 2025-25 section 3.01 (the 36B applicable percentage table).
 * Reproduced in docs/irs-published-figures.md.
 */
describe('the published IRS figures', () => {
  /**
   * One row of a rate table: "$base plus rate% of the excess over $over". The
   * first row's `over` is $0 and its `base` is $0 — Rev. Proc. prints it as
   * "Not over $X: 10% of the taxable income", which is the same row.
   */
  type RateRow = { over: number; rate: number; base: number };

  /** Section 2.01 (2025) and 4.01 (2026), Tables 1 through 4. */
  const RATE_TABLES: Record<TaxYear, Record<FilingStatus, RateRow[]>> = {
    2025: {
      mfj: [
        { over: 0, rate: 0.1, base: 0 },
        { over: 23_850, rate: 0.12, base: 2_385 },
        { over: 96_950, rate: 0.22, base: 11_157 },
        { over: 206_700, rate: 0.24, base: 35_302 },
        { over: 394_600, rate: 0.32, base: 80_398 },
        { over: 501_050, rate: 0.35, base: 114_462 },
        { over: 751_600, rate: 0.37, base: 202_154.5 },
      ],
      single: [
        { over: 0, rate: 0.1, base: 0 },
        { over: 11_925, rate: 0.12, base: 1_192.5 },
        { over: 48_475, rate: 0.22, base: 5_578.5 },
        { over: 103_350, rate: 0.24, base: 17_651 },
        { over: 197_300, rate: 0.32, base: 40_199 },
        { over: 250_525, rate: 0.35, base: 57_231 },
        { over: 626_350, rate: 0.37, base: 188_769.75 },
      ],
    },
    2026: {
      mfj: [
        { over: 0, rate: 0.1, base: 0 },
        { over: 24_800, rate: 0.12, base: 2_480 },
        { over: 100_800, rate: 0.22, base: 11_600 },
        { over: 211_400, rate: 0.24, base: 35_932 },
        { over: 403_550, rate: 0.32, base: 82_048 },
        { over: 512_450, rate: 0.35, base: 116_896 },
        { over: 768_700, rate: 0.37, base: 206_583.5 },
      ],
      single: [
        { over: 0, rate: 0.1, base: 0 },
        { over: 12_400, rate: 0.12, base: 1_240 },
        { over: 50_400, rate: 0.22, base: 5_800 },
        { over: 105_700, rate: 0.24, base: 17_966 },
        { over: 201_775, rate: 0.32, base: 41_024 },
        { over: 256_225, rate: 0.35, base: 58_448 },
        { over: 640_600, rate: 0.37, base: 192_979.25 },
      ],
    },
  };

  /** Section 2.15(1) as replaced by 3.01 (2025), and 4.14(1) (2026). */
  const STANDARD_DEDUCTION: Record<TaxYear, Record<FilingStatus, number>> = {
    2025: { mfj: 31_500, single: 15_750 },
    2026: { mfj: 32_200, single: 16_100 },
  };

  /**
   * Section 2.15(3) and 4.14(3): the 63(f) aged addition, "increased ... if the
   * individual is also unmarried and not a surviving spouse". Filing status is
   * the whole test of that, so the table is two figures rather than one per
   * status.
   */
  const AGED_ADDITION: Record<TaxYear, { married: number; unmarried: number }> = {
    2025: { married: 1_600, unmarried: 2_000 },
    2026: { married: 1_650, unmarried: 2_050 },
  };
  const MARRIED: FilingStatus[] = ['mfj'];

  /** Section 2.03 and 4.03: the 1(j)(5)(B) maximum zero and 15 percent amounts. */
  const CAPITAL_GAIN_AMOUNTS: Record<
    TaxYear,
    Record<FilingStatus, { maxZero: number; max15: number }>
  > = {
    2025: {
      mfj: { maxZero: 96_700, max15: 600_050 },
      single: { maxZero: 48_350, max15: 533_400 },
    },
    2026: {
      mfj: { maxZero: 98_900, max15: 613_700 },
      single: { maxZero: 49_450, max15: 545_500 },
    },
  };

  const STATUSES: FilingStatus[] = ['mfj', 'single'];

  describe.each(TAX_YEARS)('%d', (year) => {
    describe.each(STATUSES)('%s', (filingStatus) => {
      const rows = RATE_TABLES[year][filingStatus];

      it('has the published rate schedule', () => {
        expect(filingParams(year, filingStatus).brackets).toEqual(
          rows.map((row, i) => ({
            upTo: rows[i + 1]?.over ?? Infinity,
            rate: row.rate,
          })),
        );
      });

      it('owes what the table says at every threshold in it', () => {
        for (const { over, base } of rows) {
          expect(federalIncomeTax(over, { filingStatus, year })).toBeCloseTo(base, 6);
        }
      });

      it('charges each band its own rate on the next dollar', () => {
        for (const { over, rate, base } of rows) {
          // "$base plus rate% of the excess over $over", read one dollar in.
          expect(federalIncomeTax(over + 1, { filingStatus, year })).toBeCloseTo(
            base + rate,
            6,
          );
        }
      });

      it('has the published standard deduction and age-65 addition', () => {
        const params = filingParams(year, filingStatus);
        expect(params.standardDeduction).toBe(STANDARD_DEDUCTION[year][filingStatus]);
        const { married, unmarried } = AGED_ADDITION[year];
        expect(params.additionalStdDeduction65).toBe(
          MARRIED.includes(filingStatus) ? married : unmarried,
        );
      });

      it('has the published capital-gain amounts', () => {
        const { maxZero, max15 } = CAPITAL_GAIN_AMOUNTS[year][filingStatus];
        expect(filingParams(year, filingStatus).ltcgBrackets).toEqual([
          { upTo: maxZero, rate: 0 },
          { upTo: max15, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ]);
      });
    });
  });

  it('has the published applicable percentage at the top of the 36B table', () => {
    // Rev. Proc. 2025-25 section 3.01, last row: "At least 300% but not more
    // than 400% — 9.96%, 9.96%". 2025 has no such row: ARPA replaced the table
    // with one that runs past 400% and tops out at 8.5%.
    expect(FPL_YEAR_PARAMS[2026].topApplicablePercentage).toBe(0.0996);
    expect(FPL_YEAR_PARAMS[2025].topApplicablePercentage).toBe(0.085);
  });
});

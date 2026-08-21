import { describe, it, expect } from 'vitest';
import {
  BACK_PAY_FIRST_MODELLED_YEAR,
  LUMP_SUM_ELECTION_BOX,
  backPayCurve,
  backPayYearIncrease,
  lumpSumElection,
  splitBackPay,
} from './lumpSum';
import type { BackPayPlan, BackPayYear } from './lumpSum';
import {
  FilingStatus,
  SS_BASES,
  Scenario,
  agiFor,
  federalIncomeTax,
  irmaaMagi,
  standardDeductionFor,
  taxableSocialSecurity,
  totalTax,
} from '../utils/tax';

/**
 * Line-by-line reference implementation of IRS Pub 915 Worksheet 2, "Figure
 * Your Additional Taxable Benefits (From a Lump-Sum Payment for a Year After
 * 1993)", with no line 4 exclusions.
 *
 * Written out rather than delegating to `taxableSocialSecurity` so that the
 * assertions below compare two independent implementations. The base amounts
 * are hardcoded for the same reason, and because Worksheet 2 hardcodes them
 * too — it prints one figure for every earlier year, with no year to look up,
 * since 86(c) has not been indexed since the tiers were written.
 */
function pub915Worksheet2(
  benefitsReceived: number,
  lumpSumPortion: number,
  otherIncome: number,
  filingStatus: FilingStatus = 'single',
  muniInterest = 0,
  previouslyReported = 0,
): number {
  const line1 = benefitsReceived + lumpSumPortion;
  if (line1 <= 0) return 0;
  const line2 = 0.5 * line1;
  // Lines 3 and 7 together: AGI as reported for the earlier year, less the
  // taxable benefits that were part of it.
  const line3 = otherIncome + previouslyReported;
  const line5 = muniInterest;
  const line6 = line2 + line3 + line5;
  const line7 = previouslyReported;
  const line8 = line6 - line7;
  const line9 = { single: 25_000, mfj: 32_000, mfs: 0, hoh: 25_000 }[filingStatus];
  if (line8 <= line9) return 0; // worksheet line 10, "No"
  const line10 = line8 - line9;
  const line11 = { single: 9_000, mfj: 12_000, mfs: 0, hoh: 9_000 }[filingStatus];
  const line12 = Math.max(0, line10 - line11);
  const line13 = Math.min(line10, line11);
  const line14 = 0.5 * line13;
  const line15 = Math.min(line2, line14);
  const line16 = 0.85 * line12;
  const line17 = line15 + line16;
  const line18 = 0.85 * line1;
  const line19 = Math.min(line17, line18);
  const line20 = previouslyReported;
  return line19 - line20; // line 21: additional taxable benefits
}

/**
 * Pub 915 Worksheet 4, "Figure Your Taxable Benefits Under the Lump-Sum
 * Election Method". Line 21 is the sum of the year-of-receipt figure computed
 * on its own benefits and every Worksheet 2 line 21.
 */
function pub915Worksheet4(
  currentYearOnly: number,
  worksheet2Totals: number[],
): number {
  const line19 = currentYearOnly;
  const line20 = worksheet2Totals.reduce((sum, n) => sum + n, 0);
  return line19 + line20;
}

const MONTHLY = 2_000;
const ONGOING = MONTHLY * 12;

/** A single filer whose award, after a two-year wait, lands all at once. */
const PLAN: Omit<BackPayPlan, 'months'> = {
  awardYear: 2025,
  monthlyBenefit: MONTHLY,
  otherIncome: 20_000,
  filingStatus: 'single',
};

const SCENARIO: Scenario = {
  ordinaryIncome: 20_000,
  ssBenefit: ONGOING,
  filingStatus: 'single',
  year: 2025,
};

describe('splitBackPay', () => {
  it('cuts the award into whole years working backwards from the award year', () => {
    const award = splitBackPay({ ...PLAN, months: 30 });
    expect(award.years.map((y) => [y.year, y.months])).toEqual([
      [2022, 6],
      [2023, 12],
      [2024, 12],
    ]);
    expect(award.lumpSum).toBe(30 * MONTHLY);
    expect(award.years.map((y) => y.portion)).toEqual([
      6 * MONTHLY,
      12 * MONTHLY,
      12 * MONTHLY,
    ]);
  });

  it('leaves the remainder on the earliest year, not the latest', () => {
    // 13 months of back pay is all of the year before the award and one month
    // of the year before that — not the other way round. The award reaches
    // backwards from the present.
    const award = splitBackPay({ ...PLAN, months: 13 });
    expect(award.years.map((y) => [y.year, y.months])).toEqual([
      [2023, 1],
      [2024, 12],
    ]);
  });

  it('returns no years at all when there is no back pay', () => {
    const award = splitBackPay({ ...PLAN, months: 0 });
    expect(award.years).toEqual([]);
    expect(award.lumpSum).toBe(0);
  });

  it('never attributes anything to the award year itself', () => {
    for (const months of [1, 11, 12, 13, 47, 60]) {
      const award = splitBackPay({ ...PLAN, months });
      expect(award.years.every((y) => y.year < PLAN.awardYear)).toBe(true);
      expect(award.years.reduce((sum, y) => sum + y.months, 0)).toBe(months);
      expect(award.years.reduce((sum, y) => sum + y.portion, 0)).toBe(
        award.lumpSum,
      );
    }
  });

  it('carries the plan’s prior-year circumstances onto every year', () => {
    const award = splitBackPay({
      ...PLAN,
      months: 24,
      muniInterest: 3_000,
      benefitsReceived: 1_200,
      filingStatus: 'mfj',
    });
    for (const year of award.years) {
      expect(year.muniInterest).toBe(3_000);
      expect(year.benefitsReceived).toBe(1_200);
      expect(year.filingStatus).toBe('mfj');
      expect(year.otherIncome).toBe(PLAN.otherIncome);
    }
  });

  it('floors a fractional month rather than paying part of one', () => {
    expect(splitBackPay({ ...PLAN, months: 6.9 }).months).toBe(6);
    expect(splitBackPay({ ...PLAN, months: -3 }).months).toBe(0);
  });
});

describe('Pub 915 Worksheet 2: one earlier year', () => {
  it('agrees with the worksheet across a grid of years and statuses', () => {
    for (const status of ['single', 'mfj', 'mfs', 'hoh'] as FilingStatus[]) {
      for (const otherIncome of [0, 12_000, 25_000, 40_000, 90_000]) {
        for (const portion of [0, 6_000, 24_000, 48_000]) {
          for (const received of [0, 9_000]) {
            for (const muni of [0, 4_000]) {
              const backPay: BackPayYear = {
                year: 2022,
                months: 12,
                portion,
                benefitsReceived: received,
                otherIncome,
                muniInterest: muni,
                filingStatus: status,
              };
              const previouslyReported = taxableSocialSecurity({
                ordinaryIncome: otherIncome,
                ssBenefit: received,
                muniInterest: muni,
                filingStatus: status,
              });
              expect(
                backPayYearIncrease(backPay).additional,
                `${status} ${otherIncome} ${portion} ${received} ${muni}`,
              ).toBeCloseTo(
                pub915Worksheet2(
                  received,
                  portion,
                  otherIncome,
                  status,
                  muni,
                  previouslyReported,
                ),
                6,
              );
            }
          }
        }
      }
    }
  });

  it('reports the year’s own return as the baseline it subtracts', () => {
    const result = backPayYearIncrease({
      year: 2022,
      months: 12,
      portion: 24_000,
      benefitsReceived: 12_000,
      otherIncome: 30_000,
      muniInterest: 0,
      filingStatus: 'single',
    });
    // Worksheet 2 line 20 is what that year actually reported: $12,000 of
    // benefit against $30,000 of income.
    expect(result.previouslyReported).toBeCloseTo(
      taxableSocialSecurity({ ordinaryIncome: 30_000, ssBenefit: 12_000 }),
      6,
    );
    expect(result.additional).toBeCloseTo(
      result.refigured - result.previouslyReported,
      6,
    );
  });

  it('gives a year with no income at all its whole set of thresholds back', () => {
    // $24,000 of benefit and nothing else: provisional income is $12,000,
    // under the $25,000 base, so none of the slice is taxable in that year.
    const result = backPayYearIncrease({
      year: 2021,
      months: 12,
      portion: 24_000,
      benefitsReceived: 0,
      otherIncome: 0,
      muniInterest: 0,
      filingStatus: 'single',
    });
    expect(result.additional).toBe(0);
  });

  it('needs no bracket table, deduction or rate for the earlier year', () => {
    // 86(e)(1) caps an amount of gross income, not an amount of tax, so the
    // earlier year contributes an inclusion figured on thresholds that have
    // not moved since 1993 — nothing that would need that year's Rev. Proc.
    const backPay: BackPayYear = {
      year: 1995,
      months: 12,
      portion: 20_000,
      benefitsReceived: 0,
      otherIncome: 30_000,
      muniInterest: 0,
      filingStatus: 'single',
    };
    const nineties = backPayYearIncrease(backPay);
    const recent = backPayYearIncrease({ ...backPay, year: 2024 });
    expect(nineties.additional).toBe(recent.additional);
    expect(nineties.additional).toBeGreaterThan(0);
  });
});

describe('the lump-sum election', () => {
  it('reproduces a two-year retroactive award end to end', () => {
    const award = splitBackPay({ ...PLAN, months: 24 });
    const result = lumpSumElection(SCENARIO, award);

    expect(result.lumpSum).toBe(48_000);
    expect(result.years).toHaveLength(2);

    // No election: $72,000 of benefit against $20,000 of income. Provisional
    // income $56,000; tier one is 50% of the $9,000 band = $4,500, then 85% of
    // the $22,000 above $34,000 = $18,700.
    expect(result.taxableWithout).toBe(23_200);

    // The election: the year of receipt on its own benefit is $32,000 of
    // provisional income, $3,500 taxable...
    expect(result.currentYearOnly).toBe(3_500);
    // ...and each earlier year, with its own $25,000 base back, does the same.
    expect(result.years.map((y) => y.additional)).toEqual([3_500, 3_500]);
    expect(result.priorYearIncrease).toBe(7_000);
    expect(result.taxableWithElection).toBe(10_500);
    expect(result.worthElecting).toBe(true);
    expect(result.taxableElected).toBe(10_500);
    expect(result.taxableSaved).toBe(12_700);
  });

  it('matches Worksheet 4 line 21 across a grid', () => {
    for (const status of ['single', 'mfj', 'hoh'] as FilingStatus[]) {
      for (const currentIncome of [0, 20_000, 60_000]) {
        for (const priorIncome of [0, 20_000, 60_000]) {
          for (const months of [0, 7, 24, 41]) {
            const award = splitBackPay({
              ...PLAN,
              months,
              otherIncome: priorIncome,
              filingStatus: status,
            });
            const scenario: Scenario = {
              ...SCENARIO,
              ordinaryIncome: currentIncome,
              filingStatus: status,
            };
            const result = lumpSumElection(scenario, award);
            const expected = pub915Worksheet4(
              taxableSocialSecurity(scenario),
              award.years.map((y) =>
                pub915Worksheet2(0, y.portion, priorIncome, status),
              ),
            );
            expect(
              result.taxableWithElection,
              `${status} ${currentIncome} ${priorIncome} ${months}`,
            ).toBeCloseTo(expected, 6);
          }
        }
      }
    }
  });

  it('is a ceiling, so it can never make the year worse', () => {
    for (const status of ['single', 'mfj', 'mfs', 'hoh'] as FilingStatus[]) {
      for (const currentIncome of [0, 15_000, 45_000, 120_000]) {
        for (const priorIncome of [0, 15_000, 45_000, 120_000]) {
          for (const months of [0, 5, 12, 30, 60]) {
            const award = splitBackPay({
              ...PLAN,
              months,
              otherIncome: priorIncome,
              filingStatus: status,
            });
            const result = lumpSumElection(
              { ...SCENARIO, ordinaryIncome: currentIncome, filingStatus: status },
              award,
            );
            const where = `${status} ${currentIncome} ${priorIncome} ${months}`;
            expect(result.taxableElected, where).toBeLessThanOrEqual(
              result.taxableWithout,
            );
            expect(result.taxSaved, where).toBeGreaterThanOrEqual(0);
            expect(result.taxableElected, where).toBe(
              Math.min(result.taxableWithout, result.taxableWithElection),
            );
            expect(result.worthElecting, where).toBe(
              result.taxableWithElection < result.taxableWithout,
            );
          }
        }
      }
    }
  });

  it('declines to help when the earlier years were the richer ones', () => {
    // Worked through the wait, retired into the award. The year of receipt has
    // a threshold to spare; every earlier year is deep in the 85% tier.
    const award = splitBackPay({
      ...PLAN,
      months: 12,
      otherIncome: 80_000,
    });
    const result = lumpSumElection(
      { ...SCENARIO, ordinaryIncome: 0 },
      award,
    );
    // $48,000 of benefit and no other income is $24,000 of provisional income,
    // under the base — nothing is taxable without the election at all.
    expect(result.taxableWithout).toBe(0);
    // The election would drag in 85% of the slice, capped at 85% of $24,000.
    expect(result.taxableWithElection).toBe(20_400);
    expect(result.worthElecting).toBe(false);
    expect(result.taxableElected).toBe(0);
    expect(result.taxSaved).toBe(0);
  });

  it('changes nothing when there is no back pay', () => {
    const result = lumpSumElection(SCENARIO, splitBackPay({ ...PLAN, months: 0 }));
    expect(result.lumpSum).toBe(0);
    expect(result.years).toEqual([]);
    expect(result.priorYearIncrease).toBe(0);
    expect(result.taxableWithout).toBe(result.currentYearOnly);
    expect(result.taxableWithElection).toBe(result.taxableWithout);
    expect(result.worthElecting).toBe(false);
    expect(result.taxSaved).toBe(0);
    expect(result.taxWithout).toBe(Math.round(totalTax(SCENARIO)));
  });

  it('taxes the elected amount at the year of receipt’s own rates', () => {
    // The amount comes from thresholds frozen since 1993; the rate comes from
    // the year the money landed. Switching tax years must move the tax without
    // moving a single taxable-benefit figure.
    const award = splitBackPay({ ...PLAN, months: 24 });
    const in2025 = lumpSumElection({ ...SCENARIO, year: 2025 }, award);
    const in2026 = lumpSumElection({ ...SCENARIO, year: 2026 }, award);

    expect(in2026.taxableWithout).toBe(in2025.taxableWithout);
    expect(in2026.taxableElected).toBe(in2025.taxableElected);
    expect(in2026.priorYearIncrease).toBe(in2025.priorYearIncrease);
    // 2026's larger standard deduction is the only thing that moved.
    expect(in2026.taxWith).toBeLessThan(in2025.taxWith);

    // And the elected figure really is run through the year of receipt's own
    // return: ordinary income plus the capped benefit, less this year's
    // deduction, through this year's brackets.
    const scenario = { ...SCENARIO, year: 2025 } as const;
    const taxable =
      SCENARIO.ordinaryIncome! + in2025.taxableElected -
      standardDeductionFor(scenario);
    expect(in2025.taxWith).toBe(
      Math.round(federalIncomeTax(taxable, scenario)),
    );
  });

  it('does not amend the earlier year, so nothing is taxed at its rates', () => {
    // Pub 915: "no adjustment is made to the earlier year's return." The
    // earlier years contribute an inclusion and nothing else — in particular
    // not their own deduction, which would wipe out a $24,000 slice entirely.
    const award = splitBackPay({ ...PLAN, months: 12, otherIncome: 0 });
    const result = lumpSumElection({ ...SCENARIO, ordinaryIncome: 0 }, award);
    expect(result.taxWith).toBe(Math.round(totalTax({
      ...SCENARIO,
      ordinaryIncome: 0,
      ssBenefit: ONGOING + award.lumpSum,
      taxableSSCap: result.taxableWithElection,
    })));
  });

  it('flags a back-pay year that Worksheet 3 would have to handle', () => {
    const modern = lumpSumElection(SCENARIO, splitBackPay({ ...PLAN, months: 24 }));
    expect(modern.reachesBefore1994).toBe(false);
    const ancient = lumpSumElection(
      SCENARIO,
      splitBackPay({ ...PLAN, months: 24, awardYear: 1995 }),
    );
    expect(ancient.reachesBefore1994).toBe(true);
    expect(BACK_PAY_FIRST_MODELLED_YEAR).toBe(1994);
  });

  it('lowers Medicare’s MAGI along with the tax base', () => {
    // A big award on top of a comfortable income: without the election the
    // whole thing lands in one year's AGI, which is the figure IRMAA reads two
    // years later.
    const award = splitBackPay({ ...PLAN, months: 48, otherIncome: 10_000 });
    const result = lumpSumElection(
      { ...SCENARIO, ordinaryIncome: 95_000 },
      award,
    );
    expect(result.agiWith).toBeLessThan(result.agiWithout);
    expect(result.irmaaMagiWithout - result.irmaaMagiWith).toBe(
      result.taxableSaved,
    );
    expect(result.irmaaTierWith).toBeLessThan(result.irmaaTierWithout);
    expect(result.irmaaSurchargeSaved).toBeGreaterThan(0);
  });

  it('quotes the share of the award it keeps out of the base', () => {
    const award = splitBackPay({ ...PLAN, months: 24 });
    const result = lumpSumElection(SCENARIO, award);
    expect(result.taxableSavedPercent).toBeCloseTo(
      (12_700 / 48_000) * 100,
      2,
    );
    // Nothing to divide by when there is no award.
    expect(
      lumpSumElection(SCENARIO, splitBackPay({ ...PLAN, months: 0 }))
        .taxableSavedPercent,
    ).toBe(0);
  });

  it('names the Form 1040 checkbox that makes the election', () => {
    expect(LUMP_SUM_ELECTION_BOX).toBe('6c');
  });

  describe('capBindsEveryYear', () => {
    it('is set when the two treatments agree because nothing has room left', () => {
      // $150,000 now and $150,000 through each waiting year: every year is far
      // past its adjusted base, so each one includes 85% of its own benefit and
      // the two treatments cannot help but agree.
      const scenario: Scenario = {
        ordinaryIncome: 150_000,
        ssBenefit: 24_000,
        filingStatus: 'single',
        year: 2025,
      };
      const result = lumpSumElection(
        scenario,
        splitBackPay({
          awardYear: 2025,
          months: 24,
          monthlyBenefit: 2_000,
          otherIncome: 150_000,
        }),
      );
      expect(result.taxableWithElection).toBe(result.taxableWithout);
      expect(result.capBindsEveryYear).toBe(true);
      expect(result.currentYearOnly).toBe(Math.round(0.85 * 24_000));
      for (const y of result.years) {
        expect(y.additional).toBeCloseTo(0.85 * y.portion, 6);
      }
    });

    it('is clear when they agree by coincidence inside the 50% tier', () => {
      // The knife edge: a waiting year sitting exactly on the $25,000 base
      // hands back precisely what the award would have added to the year of
      // receipt, so the totals match to the cent with nothing at the ceiling.
      const scenario: Scenario = {
        ordinaryIncome: 15_000,
        ssBenefit: 23_712,
        filingStatus: 'single',
        year: 2025,
      };
      const result = lumpSumElection(
        scenario,
        splitBackPay({
          awardYear: 2025,
          months: 3,
          monthlyBenefit: 23_712 / 12,
          otherIncome: SS_BASES.single.ssBase50,
        }),
      );
      expect(result.taxableWithElection).toBe(result.taxableWithout);
      expect(result.capBindsEveryYear).toBe(false);
      // Every figure involved is a 50%-tier one, nowhere near 85% of anything.
      expect(result.currentYearOnly).toBe(928);
      expect(result.years[0].additional).toBe(1_482);
      expect(result.taxableWithout).toBe(2_410);
    });

    it('is a claim about each year’s own benefit, not about the award', () => {
      // The year of receipt is capped on its own benefit while the waiting
      // years, on $20,000 apiece, are only in the 50% tier. Reading the cap off
      // the no-election figure — which is 85% here — would say the opposite.
      // $65,000 rather than a rounder number because the aggregate only reaches
      // its own 85% ceiling above $64,706 of other income; below that the
      // no-election figure is a tier-2 slice and the contrast this test is
      // built on does not exist yet.
      const result = lumpSumElection(
        { ordinaryIncome: 65_000, ssBenefit: 24_000, filingStatus: 'single', year: 2025 },
        splitBackPay({
          awardYear: 2025,
          months: 24,
          monthlyBenefit: 2_000,
          otherIncome: 20_000,
        }),
      );
      expect(result.currentYearOnly).toBe(Math.round(0.85 * 24_000));
      expect(result.taxableWithout).toBe(Math.round(0.85 * 72_000));
      expect(result.years[0].additional).toBeLessThan(0.85 * 24_000);
      expect(result.capBindsEveryYear).toBe(false);
    });
  });
});

describe('the frozen thresholds are what make the election work', () => {
  it('hands each earlier year the same base the year of receipt gets', () => {
    // The election is worth something precisely because 86(c) is not indexed:
    // a 2019 back-pay year is measured against the same $25,000 as 2025, so
    // stacking N years into one costs N-1 sets of thresholds.
    const { ssBase50 } = SS_BASES.single;
    const perYearFree = ssBase50 - 0.5 * ONGOING;
    expect(perYearFree).toBeGreaterThan(0);

    // A slice this size is exactly free in a year with no other income...
    const free = backPayYearIncrease({
      year: 2020,
      months: 12,
      portion: ONGOING,
      benefitsReceived: 0,
      otherIncome: perYearFree,
      muniInterest: 0,
      filingStatus: 'single',
    });
    expect(free.additional).toBe(0);
    // ...and a dollar more is not.
    const notFree = backPayYearIncrease({
      year: 2020,
      months: 12,
      portion: ONGOING,
      benefitsReceived: 0,
      otherIncome: perYearFree + 2,
      muniInterest: 0,
      filingStatus: 'single',
    });
    expect(notFree.additional).toBe(1);
  });

  it('counts tax-exempt interest in the earlier year too', () => {
    // 86(b)(2)(B) adds it back for every year, not just the year of receipt.
    const backPay: BackPayYear = {
      year: 2021,
      months: 12,
      portion: ONGOING,
      benefitsReceived: 0,
      otherIncome: 10_000,
      muniInterest: 0,
      filingStatus: 'single',
    };
    const withMuni = backPayYearIncrease({ ...backPay, muniInterest: 6_000 });
    expect(withMuni.additional).toBeGreaterThan(
      backPayYearIncrease(backPay).additional,
    );
  });
});

describe('backPayCurve', () => {
  const curve = backPayCurve(SCENARIO, PLAN, { maxMonths: 60, step: 1 });

  it('starts flat at no back pay and covers the whole axis', () => {
    expect(curve).toHaveLength(61);
    expect(curve[0]).toMatchObject({
      months: 0,
      lumpSum: 0,
      yearsCovered: 0,
      taxSaved: 0,
    });
    expect(curve[0].taxableWithout).toBe(curve[0].taxableWith);
    expect(curve[60].months).toBe(60);
    expect(curve[60].yearsCovered).toBe(5);
  });

  it('never shows the election costing anything', () => {
    for (const point of curve) {
      expect(point.taxableWith, `${point.months}`).toBeLessThanOrEqual(
        point.taxableWithout,
      );
      expect(point.taxSaved, `${point.months}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('widens as the award reaches back through more unused thresholds', () => {
    // Every point is at least as good as the one before it on this scenario:
    // the no-election figure is already in the 85% tier, so each extra month
    // costs 85 cents there and less than that inside an earlier year.
    for (let i = 1; i < curve.length; i += 1) {
      expect(
        curve[i].taxSaved,
        `${curve[i - 1].months} -> ${curve[i].months}`,
      ).toBeGreaterThanOrEqual(curve[i - 1].taxSaved);
    }
    expect(curve[60].taxSaved).toBeGreaterThan(curve[12].taxSaved);
  });

  it('agrees point for point with the election it summarises', () => {
    for (const months of [0, 1, 13, 24, 47, 60]) {
      const point = curve[months];
      const result = lumpSumElection(
        SCENARIO,
        splitBackPay({ ...PLAN, months }),
      );
      expect(point.taxableWithout).toBe(result.taxableWithout);
      expect(point.taxableWith).toBe(result.taxableElected);
      expect(point.taxWithout).toBe(result.taxWithout);
      expect(point.taxWith).toBe(result.taxWith);
      expect(point.lumpSum).toBe(result.lumpSum);
    }
  });

  it('honours a coarser sampling step', () => {
    const coarse = backPayCurve(SCENARIO, PLAN, { maxMonths: 24, step: 6 });
    expect(coarse.map((p) => p.months)).toEqual([0, 6, 12, 18, 24]);
  });
});

describe('Scenario.taxableSSCap', () => {
  const uncapped: Scenario = { ordinaryIncome: 40_000, ssBenefit: 30_000 };

  it('binds only when it is below the 86(a) figure', () => {
    const full = taxableSocialSecurity(uncapped);
    expect(full).toBeGreaterThan(0);
    expect(taxableSocialSecurity({ ...uncapped, taxableSSCap: full - 1_000 })).toBe(
      full - 1_000,
    );
    expect(taxableSocialSecurity({ ...uncapped, taxableSSCap: full + 1_000 })).toBe(
      full,
    );
    expect(taxableSocialSecurity({ ...uncapped, taxableSSCap: null })).toBe(full);
  });

  it('carries through AGI, the tax and Medicare’s MAGI alike', () => {
    const capped: Scenario = { ...uncapped, taxableSSCap: 1_000, muniInterest: 5_000 };
    expect(agiFor(capped)).toBe(41_000);
    expect(totalTax(capped)).toBeCloseTo(
      federalIncomeTax(41_000 - standardDeductionFor(capped), capped),
      6,
    );
    // Medicare adds the tax-exempt interest back on top of the capped AGI.
    expect(irmaaMagi(capped)).toBe(46_000);
    expect(totalTax(capped)).toBeLessThan(totalTax({ ...uncapped, muniInterest: 5_000 }));
  });

  it('leaves provisional income alone — it caps the output, not the input', () => {
    // 86(e) limits "the amount included in gross income", so the benefit still
    // counts in full toward provisional income. Capping below the 86(a) figure
    // must not change what a *larger* benefit would have produced.
    const cap = 500;
    expect(taxableSocialSecurity({ ...uncapped, taxableSSCap: cap })).toBe(cap);
    expect(
      taxableSocialSecurity({ ...uncapped, ssBenefit: 60_000, taxableSSCap: cap }),
    ).toBe(cap);
    expect(taxableSocialSecurity({ ...uncapped, ssBenefit: 60_000 })).toBeGreaterThan(
      taxableSocialSecurity(uncapped),
    );
  });
});

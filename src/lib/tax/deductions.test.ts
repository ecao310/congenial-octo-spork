import type { FilingStatus } from './types';
import { filingParams } from './params';
import { maxSeniors } from './scenario';
import { standardDeductionFor, SENIOR_DEDUCTION, SENIOR_DEDUCTION_PHASEOUT_RATE, SENIOR_DEDUCTION_PHASEOUT_START, seniorDeductionPhaseoutEnd, seniorDeductionFor, deductionFor } from './deductions';
import { totalTax } from './income';
import { marginalRateCurve } from './curve';
import { pinTaxYear, PINNED_YEAR, AVG_ANNUAL_SS_BENEFIT, MAX_ANNUAL_SS_BENEFIT } from '../../test/taxFixtures';

pinTaxYear();

describe('age 65+ additional standard deduction (2025)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('adds $2,000 for a single filer and $1,600 per qualifying spouse for MFJ', () => {
    expect({
      single: filingParams(PINNED_YEAR, 'single').additionalStdDeduction65,
      mfj: filingParams(PINNED_YEAR, 'mfj').additionalStdDeduction65,
    }).toEqual({
      single: 2_000,
      mfj: 1_600,
    });
    expect(standardDeductionFor({ filingStatus: 'single', seniors: 0 })).toBe(15_750);
    expect(standardDeductionFor({ filingStatus: 'single', seniors: 1 })).toBe(17_750);
    expect(standardDeductionFor({ filingStatus: 'mfj', seniors: 0 })).toBe(31_500);
    expect(standardDeductionFor({ filingStatus: 'mfj', seniors: 1 })).toBe(33_100);
    expect(standardDeductionFor({ filingStatus: 'mfj', seniors: 2 })).toBe(34_700);
  });

  it('clamps the count to what the filing status allows', () => {
    expect(maxSeniors('single')).toBe(1);
    expect(maxSeniors('mfj')).toBe(2);
    // A single filer cannot claim it twice, and neither can a couple claim it
    // three times.
    expect(standardDeductionFor({ filingStatus: 'single', seniors: 2 })).toBe(standardDeductionFor(
      { filingStatus: 'single', seniors: 1 },
    ));
    expect(standardDeductionFor({ filingStatus: 'mfj', seniors: 3 })).toBe(standardDeductionFor(
      { filingStatus: 'mfj', seniors: 2 },
    ));
    expect(standardDeductionFor({ filingStatus: 'single', seniors: -1 })).toBe(15_750);
  });

  it('defaults to the base deduction everywhere, so nothing moves unless asked', () => {
    expect(standardDeductionFor({ filingStatus: 'single' })).toBe(
      filingParams(PINNED_YEAR, 'single').standardDeduction,
    );
    expect(totalTax(
      { ordinaryIncome: 40_000, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    )).toBe(totalTax(
      { ordinaryIncome: 40_000, ssBenefit: SS, filingStatus: 'single' },
    ));
    expect(totalTax(
      { ordinaryIncome: 20_000, ssBenefit: SS, ltcg: 10_000, filingStatus: 'mfj', seniors: 0 },
    )).toBe(
      totalTax(
        { ordinaryIncome: 20_000, ssBenefit: SS, ltcg: 10_000, filingStatus: 'mfj' },
      ),
    );
  });

  it('pushes the first taxed dollar out by the whole deduction stack when there are no benefits', () => {
    expect(totalTax(
      { ordinaryIncome: 15_750, ssBenefit: 0, filingStatus: 'single', seniors: 0 },
    )).toBe(0);
    expect(totalTax(
      { ordinaryIncome: 15_751, ssBenefit: 0, filingStatus: 'single', seniors: 0 },
    )).toBeGreaterThan(0);
    // $15,750 base + $2,000 age-65 addition + the $6,000 senior deduction,
    // which is unreduced this far below its $75,000 phaseout threshold.
    expect(totalTax(
      { ordinaryIncome: 23_750, ssBenefit: 0, filingStatus: 'single', seniors: 1 },
    )).toBe(0);
    expect(totalTax(
      { ordinaryIncome: 23_751, ssBenefit: 0, filingStatus: 'single', seniors: 1 },
    )).toBeGreaterThan(0);
  });

  it('saves the whole deduction stack times the marginal bracket rate', () => {
    // Single, $30,000 of other income and the average benefit: $2,000 of
    // age-65 addition plus $6,000 of senior deduction, all of it coming off
    // the top of the 12% bracket.
    expect(totalTax(
      { ordinaryIncome: 30_000, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    ) - totalTax(
      { ordinaryIncome: 30_000, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
    ))
      .toBeCloseTo((2_000 + 6_000) * 0.12, 6);
    // MFJ at $60,000: $1,600 + $6,000 per qualifying spouse, and both spouses
    // land the couple in the 12% bracket. (At $30,000 the couple's taxable
    // income runs out before the deduction does, so nothing is left to save.)
    expect(totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 0 },
    ) - totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 1 },
    ))
      .toBeCloseTo((1_600 + 6_000) * 0.12, 6);
    expect(totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 1 },
    ) - totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 2 },
    ))
      .toBeCloseTo((1_600 + 6_000) * 0.12, 6);
  });

  it('widens the 0%-rate valley, but by less than the deduction once benefits are being dragged in', () => {
    // Taxable income is 1.5x income once provisional income clears $25,000, so
    // the $8,000 of extra deduction only buys about $5,333 of extra income
    // room.
    const lastZeroRateIncome = (seniors: number): number => {
      let last = 0;
      for (const point of marginalRateCurve(
        { ssBenefit: SS, filingStatus: 'single', seniors },
        { maxIncome: 60_000, step: 250 },
      )) {
        if (point.marginalRate !== 0) break;
        last = point.income;
      }
      return last;
    };
    expect(lastZeroRateIncome(0)).toBe(14_750);
    expect(lastZeroRateIncome(1)).toBe(20_000);
    // The exact crossings: 1.5 * income - 6,572 = deduction.
    expect(totalTax(
      { ordinaryIncome: 14_881, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    )).toBe(0);
    expect(totalTax(
      { ordinaryIncome: 14_882, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    )).toBeGreaterThan(0);
    expect(totalTax(
      { ordinaryIncome: 20_214, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
    )).toBe(0);
    expect(totalTax(
      { ordinaryIncome: 20_215, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
    )).toBeGreaterThan(0);
    expect(20_214 - 14_881).toBeCloseTo((2_000 + 6_000) / 1.5, 0);
  });

  it('lets the addition offset capital gains when ordinary income underruns it', () => {
    // Single, $100,000 of gains and nothing else: the whole deduction lands on
    // the LTCG band, where the marginal rate is 15%. $100,000 of AGI is
    // $25,000 into the senior deduction's phaseout, so only $4,500 of the
    // $6,000 survives: 17,750 + 4,500 = 22,250 of deduction, and the $2,000 +
    // $4,500 above the base saves 15% of itself.
    expect(totalTax(
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 100_000, filingStatus: 'single', seniors: 0 },
    )).toBe(5_385);
    expect(totalTax(
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 100_000, filingStatus: 'single', seniors: 1 },
    )).toBe(4_410);
    expect(5_385 - 4_410).toBeCloseTo((2_000 + 4_500) * 0.15, 6);
  });
});

describe('OBBBA senior deduction (2025-2028)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;
  const MAX_SS = MAX_ANNUAL_SS_BENEFIT;

  it('is $6,000 for each qualifying person below the phaseout threshold', () => {
    expect(SENIOR_DEDUCTION).toBe(6_000);
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 1 }, 0)).toBe(6_000);
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 1 }, 75_000)).toBe(6_000);
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 1 }, 150_000)).toBe(6_000);
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 2 }, 150_000)).toBe(12_000);
  });

  it('stays zero for a filer under 65, however low the MAGI', () => {
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 0 }, 0)).toBe(0);
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 0 }, 10_000)).toBe(0);
    expect(deductionFor({ filingStatus: 'single', seniors: 0 }, 10_000)).toBe(15_750);
  });

  it('clamps the count the way the standard deduction does', () => {
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 2 }, 0)).toBe(6_000);
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 3 }, 0)).toBe(12_000);
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: -1 }, 0)).toBe(0);
  });

  it("reduces each person's $6,000 by 6% of MAGI over the threshold", () => {
    expect(SENIOR_DEDUCTION_PHASEOUT_RATE).toBe(0.06);
    expect(SENIOR_DEDUCTION_PHASEOUT_START).toEqual({
      single: 75_000,
      mfj: 150_000,
    });
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 1 }, 76_000)).toBeCloseTo(5_940, 6);
    expect(seniorDeductionFor({ filingStatus: 'single', seniors: 1 }, 125_000)).toBeCloseTo(3_000, 6);
    // The statute reduces "the $6,000 amount", i.e. each spouse's own, so a
    // couple where both qualify loses 12 cents per dollar rather than 6.
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 1 }, 200_000)).toBeCloseTo(3_000, 6);
    expect(seniorDeductionFor({ filingStatus: 'mfj', seniors: 2 }, 200_000)).toBeCloseTo(6_000, 6);
  });

  it('runs out exactly $100,000 above the threshold for both filing statuses', () => {
    expect(seniorDeductionPhaseoutEnd('single')).toBe(175_000);
    expect(seniorDeductionPhaseoutEnd('mfj')).toBe(250_000);
    const cases: [FilingStatus, number][] = [
      ['single', 1],
      ['mfj', 1],
      ['mfj', 2],
    ];
    for (const [fs, seniors] of cases) {
      const end = seniorDeductionPhaseoutEnd(fs);
      if (end === null) throw new Error(`${fs} should have a phaseout end`);
      expect(seniorDeductionFor({ filingStatus: fs, seniors }, end - 1)).toBeGreaterThan(0);
      expect(seniorDeductionFor({ filingStatus: fs, seniors }, end)).toBe(0);
      expect(seniorDeductionFor({ filingStatus: fs, seniors }, end + 1_000_000)).toBe(0);
      expect(deductionFor({ filingStatus: fs, seniors }, end)).toBe(standardDeductionFor(
        { filingStatus: fs, seniors },
      ));
    }
  });

  it('stacks on the standard deduction and its age-65 addition', () => {
    expect(deductionFor({ filingStatus: 'single', seniors: 1 }, 50_000)).toBe(15_750 + 2_000 + 6_000);
    expect(deductionFor({ filingStatus: 'mfj', seniors: 2 }, 50_000)).toBe(31_500 + 3_200 + 12_000);
  });

  it('acts as a 6% stealth surtax on income inside the phaseout range', () => {
    // Single, $60,000 of other income and the average benefit: the 85% cap has
    // already bound, so a dollar of income is a dollar of MAGI - but it also
    // destroys 6 cents of deduction, so taxable income rises by $1.06 and the
    // 22% bracket bites at 23.32%.
    expect(totalTax(
      { ordinaryIncome: 60_001, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
    ) - totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
    ))
      .toBeCloseTo(0.22 * 1.06, 6);
    expect(totalTax(
      { ordinaryIncome: 60_001, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    ) - totalTax(
      { ordinaryIncome: 60_000, ssBenefit: SS, filingStatus: 'single', seniors: 0 },
    ))
      .toBeCloseTo(0.22, 6);
  });

  it('doubles that surtax when both spouses qualify', () => {
    // MFJ, $150,000 of other income: MAGI is $170,155, i.e. $20,155 into the
    // range, and still inside the 22% bracket either way.
    expect(totalTax(
      { ordinaryIncome: 150_001, ssBenefit: SS, filingStatus: 'mfj', seniors: 1 },
    ) - totalTax(
      { ordinaryIncome: 150_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 1 },
    ))
      .toBeCloseTo(0.22 * 1.06, 6);
    expect(totalTax(
      { ordinaryIncome: 150_001, ssBenefit: SS, filingStatus: 'mfj', seniors: 2 },
    ) - totalTax(
      { ordinaryIncome: 150_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 2 },
    ))
      .toBeCloseTo(0.22 * 1.12, 6);
  });

  it('multiplies with the torpedo where the two overlap', () => {
    // Single, the maximum benefit and $50,000 of other income: benefits are
    // still being dragged in, so a dollar earned is $1.85 of MAGI, which then
    // destroys 6% of itself in deduction. 1.85 x 1.06 = $1.96 of taxable
    // income, and 22% becomes 43.14% rather than the torpedo's own 40.7%.
    const withPhaseout =
      totalTax(
        { ordinaryIncome: 50_001, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
      ) - totalTax(
        { ordinaryIncome: 50_000, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
      );
    expect(withPhaseout).toBeCloseTo(0.22 * 1.85 * 1.06, 6);
    expect(withPhaseout).toBeCloseTo(0.431_42, 6);
    expect(
      totalTax(
        { ordinaryIncome: 50_001, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 0 },
      ) - totalTax(
        { ordinaryIncome: 50_000, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 0 },
      ),
    ).toBeCloseTo(0.22 * 1.85, 6);
  });

  it('puts a second hump on the marginal-rate curve', () => {
    const rates = (seniors: number) =>
      new Set(
        marginalRateCurve(
          { ssBenefit: SS, filingStatus: 'single', seniors },
          { maxIncome: 150_000, step: 250 },
        ).map(
          (p) => p.marginalRate,
        ),
      );
    expect(rates(0)).toContain(22);
    expect(rates(0)).not.toContain(23.32);
    // 22% and 24% amplified by the 6% phaseout.
    expect(rates(1)).toContain(23.32);
    expect(rates(1)).toContain(25.44);
  });

  it('falls back to the plain bracket rate once the deduction is gone', () => {
    // Single with the maximum benefit: MAGI clears $175,000 while other income
    // is still on the chart, so this hump has a right-hand edge too.
    expect(totalTax(
      { ordinaryIncome: 120_001, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
    ) - totalTax(
      { ordinaryIncome: 120_000, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
    ))
      .toBeCloseTo(0.24 * 1.06, 6);
    expect(totalTax(
      { ordinaryIncome: 140_001, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
    ) - totalTax(
      { ordinaryIncome: 140_000, ssBenefit: MAX_SS, filingStatus: 'single', seniors: 1 },
    ))
      .toBeCloseTo(0.24, 6);
  });
});

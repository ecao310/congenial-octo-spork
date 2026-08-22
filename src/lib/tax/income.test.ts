import type { Scenario } from './scenario';
import { taxableSocialSecurity } from './socialSecurity';
import { federalIncomeTax, agiFor, totalIncomeFor, splitOtherIncome, totalTax } from './income';
import { otherIncomeAtIrmaaMagi } from './irmaa';
import { marginalRateCurve } from './curve';
import { pinTaxYear, PINNED_YEAR } from '../../test/taxFixtures';

pinTaxYear();

describe('federalIncomeTax', () => {
  it('is zero on zero taxable income', () => {
    expect(federalIncomeTax(0)).toBe(0);
  });

  it('applies 10% within the first bracket', () => {
    expect(federalIncomeTax(10000)).toBe(1000);
  });

  it('stacks brackets', () => {
    // 11925 * 0.10 + (48475 - 11925) * 0.12 + (50000 - 48475) * 0.22
    expect(federalIncomeTax(50000)).toBeCloseTo(5914, 2);
  });

  it('uses the wider MFJ brackets', () => {
    expect(federalIncomeTax(20000, { filingStatus: 'mfj' })).toBe(2000); // all in the 10% bracket
    // 23850 * 0.10 + (96950 - 23850) * 0.12 + (100000 - 96950) * 0.22
    expect(federalIncomeTax(100000, { filingStatus: 'mfj' })).toBeCloseTo(11828, 2);
  });
});

describe('totalTax', () => {
  it('is zero when income is under the standard deduction', () => {
    expect(totalTax({ ordinaryIncome: 15000, ssBenefit: 0 })).toBe(0);
  });

  it('taxes other income plus the taxable portion of benefits', () => {
    // taxable SS = 26600; taxable income = 40000 + 26600 - 15750 = 50850
    expect(totalTax({ ordinaryIncome: 40000, ssBenefit: 40000 })).toBeCloseTo(federalIncomeTax(50850), 2);
  });

  it('applies the MFJ standard deduction and thresholds', () => {
    expect(totalTax({ ordinaryIncome: 30000, ssBenefit: 0, filingStatus: 'mfj' })).toBe(0); // under the $31,500 deduction
    // taxable SS = 6000 + 0.85 * (60000 - 44000) = 19600;
    // taxable income = 40000 + 19600 - 31500 = 28100
    expect(totalTax({ ordinaryIncome: 40000, ssBenefit: 40000, filingStatus: 'mfj' })).toBeCloseTo(
      federalIncomeTax(28100, { filingStatus: 'mfj' }),
      2,
    );
  });
});

describe('totalTax with capital gains stacked on top', () => {
  it('is unchanged whether LTCG is zero or omitted', () => {
    expect(totalTax({ ordinaryIncome: 40000, ssBenefit: 30000, ltcg: 0 })).toBeCloseTo(totalTax(
      { ordinaryIncome: 40000, ssBenefit: 30000 },
    ), 2);
    expect(totalTax(
      { ordinaryIncome: 40000, ssBenefit: 30000, ltcg: 0, filingStatus: 'mfj' },
    )).toBeCloseTo(totalTax(
      { ordinaryIncome: 40000, ssBenefit: 30000, filingStatus: 'mfj' },
    ), 2);
  });

  it('taxes LTCG at 0% when total taxable income stays below the threshold', () => {
    // Single: standard deduction $15,750, 0% LTCG threshold $48,350.
    // ordinaryIncome = 0, ssBenefit = 0, ltcg = 10,000.
    // ordinaryTaxable = 0, totalTaxable = max(0, 10,000 - 15,750) = 0 → no tax.
    expect(totalTax({ ordinaryIncome: 0, ssBenefit: 0, ltcg: 10000 })).toBe(0);
  });

  it('lets the unused standard deduction offset LTCG', () => {
    // Regression: the deduction reduces AGI once, so any part of it not
    // absorbed by ordinary income must reduce the LTCG stacked on top.
    // Single, no ordinary income and no SS, $100,000 of LTCG:
    //   taxable income = 100,000 - 15,750 = 84,250
    //   48,350 @ 0% + 35,900 @ 15% = $5,385
    // Ignoring the spillover would tax the full $100,000 band and yield
    // $7,747.50 — overstated by 15% of the whole standard deduction.
    expect(totalTax({ ordinaryIncome: 0, ssBenefit: 0, ltcg: 100_000 })).toBeCloseTo(5_385, 2);

    // MFJ: taxable income = 100,000 - 31,500 = 68,500, entirely inside the
    // $96,700 0% bracket, so the tax is zero rather than $495.
    expect(totalTax(
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 100_000, filingStatus: 'mfj' },
    )).toBe(0);
  });

  it('starts taxing LTCG only after the deduction and the 0% bracket are used up', () => {
    // With no other income the 0% zone runs to 15,750 + 48,350 = $64,100 of
    // gains, not $48,350.
    const firstTaxedGain = (scenario: Scenario, maxLTCG: number): number => {
      for (let ltcg = 0; ltcg <= maxLTCG; ltcg += 50) {
        const at = (gain: number): number => totalTax({ ...scenario, ltcg: gain });
        if (at(ltcg + 1) - at(ltcg) > 0) return ltcg;
      }
      throw new Error('the gain is never taxed across the sweep');
    };
    expect(firstTaxedGain({ ssBenefit: 0, ordinaryIncome: 0 }, 100_000)).toBe(64_100);
    expect(
      firstTaxedGain({ ssBenefit: 0, ordinaryIncome: 0, filingStatus: 'mfj' }, 200_000),
    ).toBe(31_500 + 96_700);
  });

  it('never taxes more than total taxable income across the LTCG sweep', () => {
    // Cross-check against a direct AGI − deduction computation: the amount
    // subject to any rate at all is capped at taxable income.
    for (const ordinary of [0, 5_000, 12_000, 40_000]) {
      for (const ss of [0, 24_000]) {
        for (const ltcg of [0, 10_000, 30_000, 90_000]) {
          const taxableSS = taxableSocialSecurity(
            { ssBenefit: ss, ordinaryIncome: ordinary + ltcg },
          );
          const taxableIncome = Math.max(
            0,
            ordinary + ltcg + taxableSS - 15_750,
          );
          const tax = totalTax(
            { ordinaryIncome: ordinary, ssBenefit: ss, ltcg },
          );
          // Nothing is taxed above 37%, and nothing at all when taxable
          // income is zero.
          expect(tax).toBeLessThanOrEqual(taxableIncome * 0.37 + 1e-9);
          if (taxableIncome === 0) expect(tax).toBe(0);
        }
      }
    }
  });

  it('taxes LTCG at 15% when ordinary income pushes past the 0% threshold', () => {
    // Single: ordinary income of $60,000, no SS. ordinaryTaxable = 60000 - 15750 = 44250.
    // 44250 < 48350, so the first $4100 of LTCG is at 0%, rest at 15%.
    const tax = totalTax({ ordinaryIncome: 60000, ssBenefit: 0, ltcg: 10000 });
    const ordinaryPart = totalTax(
      { ordinaryIncome: 60000, ssBenefit: 0, ltcg: 0 },
    );
    const ltcgPart = tax - ordinaryPart;
    // $4,100 at 0% + $5,900 at 15% = $885
    expect(ltcgPart).toBeCloseTo(885, 0);
  });

  it('uses the MFJ 0% threshold ($96,700)', () => {
    // MFJ: ordinary income $120k, no SS. ordinaryTaxable = 120000 - 31500 = 88500.
    // 88500 < 96700, so first $8200 of LTCG at 0%, rest at 15%.
    const tax = totalTax(
      { ordinaryIncome: 120000, ssBenefit: 0, ltcg: 10000, filingStatus: 'mfj' },
    );
    const ordinaryPart = totalTax(
      { ordinaryIncome: 120000, ssBenefit: 0, ltcg: 0, filingStatus: 'mfj' },
    );
    const ltcgPart = tax - ordinaryPart;
    expect(ltcgPart).toBeCloseTo(0.15 * (10000 - 8200), 0);
  });

  it('LTCG triggers the SS torpedo by raising provisional income', () => {
    // Single: $20k ordinary, $24k SS, adding LTCG should drag SS into taxability.
    // Without LTCG: provisional = 20000 + 12000 = 32000 → some SS taxable.
    // With $20k LTCG: provisional = 40000 + 12000 = 52000 → much more SS taxable.
    const taxWithout = totalTax(
      { ordinaryIncome: 20000, ssBenefit: 24000, ltcg: 0 },
    );
    const taxWith = totalTax(
      { ordinaryIncome: 20000, ssBenefit: 24000, ltcg: 20000 },
    );
    const increase = taxWith - taxWithout;
    // LTCG sits in the 0% bracket at these income levels, so the increase
    // comes entirely from dragged-in SS being taxed at ordinary rates.
    // Without the torpedo the increase would be $0 (all LTCG at 0%).
    expect(increase).toBeGreaterThan(0);
    // And the effective rate on the $20k of LTCG should exceed 0% — proof
    // that the SS torpedo is adding ordinary tax via the stacking channel.
    expect(increase / 20000).toBeGreaterThan(0.05);
  });
});


/* ------------------------------------------------------------------ */
/*  What the return takes in                                           */
/* ------------------------------------------------------------------ */

/**
 * The page quotes this figure in four places — both charts' axis labels and
 * both charts' tooltips — and before `totalIncomeFor` existed each of them
 * spelled it out separately and two of them got it wrong. These tests pin the
 * three things that make it neither AGI nor taxable income.
 */
describe('totalIncomeFor', () => {
  const base = { ordinaryIncome: 40_000, ssBenefit: 24_000, year: PINNED_YEAR };

  it('counts the whole benefit, not the share the torpedo drags in', () => {
    expect(totalIncomeFor(base)).toBe(64_000);
    // AGI sees only part of the benefit, and that gap is the page's subject.
    expect(agiFor(base)).toBeLessThan(totalIncomeFor(base));
  });

  it('counts tax-exempt interest, which AGI never does', () => {
    expect(totalIncomeFor({ ...base, muniInterest: 10_000 })).toBe(74_000);
  });

  it('leaves the gain where it is: a share of the income, not an addition', () => {
    // $40,000 of other income, $15,000 of it a gain, is still $40,000.
    expect(
      totalIncomeFor({ ...base, ordinaryIncome: 25_000, ltcg: 15_000 }),
    ).toBe(64_000);
  });

  it('never reports a negative total', () => {
    expect(totalIncomeFor({ ordinaryIncome: -5_000 })).toBe(0);
    expect(totalIncomeFor()).toBe(0);
  });
});

/**
 * The app asks for one income figure and then asks how much of it is a
 * long-term gain, so a gain is a share of the income a filer has rather than
 * something stacked on top of it. The statute takes the additive reading —
 * ordinary income and gains are separate line items — which is why the sweeps
 * keep it as their default and `gainsWithinIncome` is what opts out.
 */
describe('gains carved out of income rather than stacked on top', () => {
  describe('splitOtherIncome', () => {
    it('takes the gain out of the income rather than adding to it', () => {
      expect(splitOtherIncome(60_000, 20_000)).toEqual({
        ordinaryIncome: 40_000,
        ltcg: 20_000,
      });
    });

    it('leaves the whole figure ordinary when there is no gain', () => {
      expect(splitOtherIncome(60_000)).toEqual({
        ordinaryIncome: 60_000,
        ltcg: 0,
      });
      expect(splitOtherIncome(60_000, 0)).toEqual({
        ordinaryIncome: 60_000,
        ltcg: 0,
      });
    });

    /** There is no $10,000 gain inside $5,000 of income. */
    it('clamps a gain bigger than the income it came out of', () => {
      expect(splitOtherIncome(5_000, 10_000)).toEqual({
        ordinaryIncome: 0,
        ltcg: 5_000,
      });
    });

    it('never drives either half negative', () => {
      expect(splitOtherIncome(0, 10_000)).toEqual({ ordinaryIncome: 0, ltcg: 0 });
      expect(splitOtherIncome(-5_000, -5_000)).toEqual({
        ordinaryIncome: 0,
        ltcg: 0,
      });
    });
  });

  describe('marginalRateCurve with gainsWithinIncome', () => {
    const scenario = { ssBenefit: 0, ltcg: 20_000 };

    it('prices the axis value as the whole of the income, gain included', () => {
      const within = marginalRateCurve(scenario, {
        maxIncome: 100_000,
        step: 1_000,
        gainsWithinIncome: true,
      });
      const at = (income: number): number =>
        within.find((d) => d.income === income)!.totalTax;
      expect(at(60_000)).toBe(
        Math.round(totalTax({ ordinaryIncome: 40_000, ltcg: 20_000 })),
      );
      // The default reading puts the same gain on top of the same axis value,
      // so it prices $20,000 more income at every point.
      const stacked = marginalRateCurve(scenario, {
        maxIncome: 100_000,
        step: 1_000,
      });
      expect(stacked.find((d) => d.income === 60_000)!.totalTax).toBe(
        Math.round(totalTax({ ordinaryIncome: 60_000, ltcg: 20_000 })),
      );
      expect(at(60_000)).toBeLessThan(
        stacked.find((d) => d.income === 60_000)!.totalTax,
      );
    });

    it('is the plain ordinary curve where the axis is under the gain', () => {
      const within = marginalRateCurve(scenario, {
        maxIncome: 100_000,
        step: 1_000,
        gainsWithinIncome: true,
      });
      // At $12,000 of income there is nothing but gain to have — the $20,000
      // does not fit inside it — so the point prices $12,000 of pure gain.
      expect(within.find((d) => d.income === 12_000)!.totalTax).toBe(
        Math.round(totalTax({ ordinaryIncome: 0, ltcg: 12_000 })),
      );
    });

    /**
     * The stacking effect, showing up on the ordinary-income chart: the next
     * dollar of ordinary income lifts the gain stack with it, and can shove
     * part of it out of the 0% band into 15%. Nothing about that dollar is
     * different — what it costs is.
     */
    it('charges more for a dollar of income when a gain is stacked above it', () => {
      const withGain = marginalRateCurve(
        { ssBenefit: 0, ltcg: 30_000 },
        { maxIncome: 100_000, step: 250, gainsWithinIncome: true },
      );
      const withoutGain = marginalRateCurve(
        { ssBenefit: 0 },
        { maxIncome: 100_000, step: 250 },
      );
      const dearer = withGain.filter((point, i) => {
        // Only where the gain actually fits inside the income; below that the
        // two curves are pricing different things.
        return point.income > 30_000 && point.marginalRate > withoutGain[i].marginalRate;
      });
      expect(dearer.length).toBeGreaterThan(0);
    });
  });

  describe('otherIncomeAtIrmaaMagi with a gain inside the axis', () => {
    /**
     * MAGI counts a gain and an ordinary dollar at face value, and provisional
     * income does too, so where a cliff lands on the other-income axis does not
     * depend on how that income is split.
     */
    it('puts the cliff in the same place whatever the split', () => {
      const base = { ssBenefit: 24_000 };
      expect(otherIncomeAtIrmaaMagi(106_000, { ...base, ltcg: 40_000 })).toBeCloseTo(
        otherIncomeAtIrmaaMagi(106_000, base),
        4,
      );
    });
  });
});

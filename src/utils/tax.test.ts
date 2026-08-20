import {
  federalIncomeTax,
  muniInterestEffect,
  FilingStatus,
  ltcgMarginalRateCurve,
  marginalRateCurve,
  taxableSocialSecurity,
  totalTax,
  segmentCurve,
  conversionCeilings,
  conversionMeasureValue,
  maxConversionUnder,
  sizeConversion,
  irmaaFirstCliffMagi,
  allIrmaaTiers,
  irmaaMagiYear,
  partBStandardPremium,
  irmaaMagi,
  irmaaTierFor,
  irmaaFor,
  otherIncomeAtIrmaaMagi,
  irmaaCliffs,
  irmaaTiersFor,
  firstIrmaaTier,
  seniorDeductionAllowed,
  SS_BASES,
  SS_BASE50_ENACTED,
  SS_BASE85_ENACTED,
  TAX_YEARS,
  TAX_YEAR_PARAMS,
  taxYearParams,
  filingParams,
  filingParamsFor,
  defaultTaxYear,
  avgAnnualSSBenefit,
  maxAnnualSSBenefit,
  standardDeductionFor,
  maxSeniors,
  deductionFor,
  seniorDeductionFor,
  seniorDeductionPhaseoutEnd,
  qcdAnnualLimit,
  qcdSplitInterestLimit,
  qcdLimitFor,
  qcdAllowed,
  qcdFor,
  ordinaryIncomeAfterQcd,
  qcdEffect,
  agiFor,
  QCD_MIN_AGE,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
} from './tax';
import type { ConversionCeiling, ConversionCeilingId, TaxYear } from './tax';
import { vi } from 'vitest';

/**
 * Every dollar figure in this file is a 2025 one, checked against Rev. Proc.
 * 2024-40 and IRS Pub 915 (2025). Scenarios that do not name a year inherit
 * `defaultTaxYear()`, which follows the calendar — so the clock is pinned here
 * rather than letting January silently re-point these assertions at a different
 * Rev. Proc. The `tax year` describe below passes its own years explicitly.
 */
const PINNED_YEAR: TaxYear = 2025;

beforeEach(() => {
  // Date only: faking setTimeout as well would deadlock anything async.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${PINNED_YEAR}-07-01T00:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Shorthand for the pinned year's figures, which most assertions read. */
const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].avgAnnualSSBenefit;
const MAX_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].maxAnnualSSBenefit;

/**
 * Line-by-line reference implementation of IRS Pub 915 (2025), Worksheet 1
 * "Figuring Your Taxable Benefits", assuming no exclusions or Schedule 1
 * adjustments (lines 5 and 7 = 0). See docs/irs-pub915-worksheet1-2025.md.
 */
function pub915Worksheet1(
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
  // Base amount, worksheet line 9. IRC 86(c)(1)(C)(ii) makes it $0 for a
  // married taxpayer who files separately and does not live apart from their
  // spouse for the whole year; Pub 915 prints the same instruction.
  const line9 = { single: 25_000, mfj: 32_000, mfs: 0 }[filingStatus];
  const line10 = Math.max(0, line8 - line9);
  if (line10 === 0) return 0; // none of the benefits are taxable
  // Adjusted base amount less base amount. single: $34,000 - $25,000;
  // MFJ: $44,000 - $32,000; separate: $0 - $0, per 86(c)(2)(C).
  const line11 = { single: 9_000, mfj: 12_000, mfs: 0 }[filingStatus];
  const line12 = Math.max(0, line10 - line11);
  const line13 = Math.min(line10, line11);
  const line14 = 0.5 * line13;
  const line15 = Math.min(line2, line14);
  const line16 = 0.85 * line12;
  const line17 = line15 + line16;
  const line18 = 0.85 * line1;
  return Math.min(line17, line18); // line 19: taxable benefits
}

describe('IRS Pub 915 Worksheet 1 (2025)', () => {
  it('reproduces the worked example from the publication', () => {
    // Single filer: $5,980 in box 5, plus an $18,600 pension, $9,400 of
    // wages, and $990 of interest. Worksheet: line 8 = 31,980,
    // line 10 = 6,980, line 14 = 3,490, line 15 = line 19 = 2,990.
    const otherIncome = 18_600 + 9_400 + 990;
    expect(pub915Worksheet1(5_980, otherIncome)).toBe(2_990);
    expect(taxableSocialSecurity({ ssBenefit: 5_980, ordinaryIncome: otherIncome })).toBe(2_990);
  });

  it('is zero with provisional income exactly at the $25,000 base amount', () => {
    expect(taxableSocialSecurity({ ssBenefit: 10_000, ordinaryIncome: 20_000 })).toBe(0);
    expect(pub915Worksheet1(10_000, 20_000)).toBe(0);
  });

  it('phases in at 50 cents per dollar just above the base amount', () => {
    expect(taxableSocialSecurity({ ssBenefit: 10_000, ordinaryIncome: 20_002 })).toBe(1);
    expect(pub915Worksheet1(10_000, 20_002)).toBe(1);
  });

  it('caps tier 1 at $4,500 with provisional income exactly at $34,000', () => {
    // line 10 = 9,000, line 12 = 0, line 14 = 4,500, line 15 = 4,500
    expect(taxableSocialSecurity({ ssBenefit: 10_000, ordinaryIncome: 29_000 })).toBe(4_500);
    expect(pub915Worksheet1(10_000, 29_000)).toBe(4_500);
  });

  it('adds 85 cents per dollar above the $34,000 threshold', () => {
    expect(taxableSocialSecurity({ ssBenefit: 10_000, ordinaryIncome: 29_001 })).toBeCloseTo(4_500.85, 8);
    expect(pub915Worksheet1(10_000, 29_001)).toBeCloseTo(4_500.85, 8);
  });

  it('agrees with the worksheet across a grid of benefits and incomes', () => {
    const benefits = [0, 1, 2_000, 5_980, 10_000, 24_000, 40_000, 60_000];
    const incomes = [
      0, 5_000, 15_000, 24_999, 25_000, 28_990, 33_999, 34_000, 34_001,
      50_000, 100_000,
    ];
    const mismatches: string[] = [];
    for (const ss of benefits) {
      for (const income of incomes) {
        const actual = taxableSocialSecurity(
          { ssBenefit: ss, ordinaryIncome: income },
        );
        const expected = pub915Worksheet1(ss, income);
        if (Math.abs(actual - expected) > 1e-8) {
          mismatches.push(
            `ssBenefit=${ss}, otherIncome=${income}: ${actual} !== ${expected}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('IRS Pub 915 Worksheet 1 (2025), married filing jointly', () => {
  it('is zero with provisional income exactly at the $32,000 base amount', () => {
    expect(taxableSocialSecurity(
      { ssBenefit: 10_000, ordinaryIncome: 27_000, filingStatus: 'mfj' },
    )).toBe(0);
    expect(pub915Worksheet1(10_000, 27_000, 'mfj')).toBe(0);
  });

  it('phases in at 50 cents per dollar just above the base amount', () => {
    expect(taxableSocialSecurity(
      { ssBenefit: 10_000, ordinaryIncome: 27_002, filingStatus: 'mfj' },
    )).toBe(1);
    expect(pub915Worksheet1(10_000, 27_002, 'mfj')).toBe(1);
  });

  it('caps tier 1 at $6,000 with provisional income exactly at $44,000', () => {
    // line 10 = 12,000, line 12 = 0, line 14 = 6,000, line 15 = 6,000
    expect(taxableSocialSecurity(
      { ssBenefit: 20_000, ordinaryIncome: 34_000, filingStatus: 'mfj' },
    )).toBe(6_000);
    expect(pub915Worksheet1(20_000, 34_000, 'mfj')).toBe(6_000);
  });

  it('adds 85 cents per dollar above the $44,000 threshold', () => {
    expect(taxableSocialSecurity(
      { ssBenefit: 20_000, ordinaryIncome: 34_001, filingStatus: 'mfj' },
    )).toBeCloseTo(6_000.85, 8);
    expect(pub915Worksheet1(20_000, 34_001, 'mfj')).toBeCloseTo(6_000.85, 8);
  });

  it('caps at 85% of benefits', () => {
    expect(taxableSocialSecurity(
      { ssBenefit: 10_000, ordinaryIncome: 100_000, filingStatus: 'mfj' },
    )).toBe(8_500);
    expect(pub915Worksheet1(10_000, 100_000, 'mfj')).toBe(8_500);
  });

  it('agrees with the worksheet across a grid of benefits and incomes', () => {
    const benefits = [0, 1, 2_000, 5_980, 10_000, 24_000, 40_000, 60_000];
    const incomes = [
      0, 5_000, 15_000, 31_999, 32_000, 38_000, 43_999, 44_000, 44_001,
      50_000, 100_000,
    ];
    const mismatches: string[] = [];
    for (const ss of benefits) {
      for (const income of incomes) {
        const actual = taxableSocialSecurity(
          { ssBenefit: ss, ordinaryIncome: income, filingStatus: 'mfj' },
        );
        const expected = pub915Worksheet1(ss, income, 'mfj');
        if (Math.abs(actual - expected) > 1e-8) {
          mismatches.push(
            `ssBenefit=${ss}, otherIncome=${income}: ${actual} !== ${expected}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('taxableSocialSecurity', () => {
  it('is zero when provisional income is at or below the first threshold', () => {
    expect(taxableSocialSecurity({ ssBenefit: 30000, ordinaryIncome: 5000 })).toBe(0);
    expect(taxableSocialSecurity({ ssBenefit: 50000, ordinaryIncome: 0 })).toBe(0);
  });

  it('includes 50% of the excess in the middle band', () => {
    // provisional = 20000 + 10000 = 30000, excess over 25000 is 5000
    expect(taxableSocialSecurity({ ssBenefit: 20000, ordinaryIncome: 20000 })).toBe(2500);
  });

  it('never exceeds 50% of benefits in the middle band', () => {
    // provisional = 32000 + 1000 = 33000, half the excess (4000) > half of benefits (1000)
    expect(taxableSocialSecurity({ ssBenefit: 2000, ordinaryIncome: 32000 })).toBe(1000);
  });

  it('includes 85% of the excess above the second threshold', () => {
    // provisional = 40000 + 20000 = 60000: 4500 + 0.85 * 26000 = 26600
    expect(taxableSocialSecurity({ ssBenefit: 40000, ordinaryIncome: 40000 })).toBe(26600);
  });

  it('caps at 85% of benefits', () => {
    expect(taxableSocialSecurity({ ssBenefit: 10000, ordinaryIncome: 100000 })).toBe(8500);
  });
});

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

describe('marginalRateCurve', () => {
  it('samples from zero to maxIncome inclusive', () => {
    const data = marginalRateCurve({ ssBenefit: 0 }, { maxIncome: 10000, step: 250 });
    expect(data).toHaveLength(41);
    expect(data[0].income).toBe(0);
    expect(data[40].income).toBe(10000);
  });

  it('matches plain bracket rates with no benefits', () => {
    const data = marginalRateCurve({ ssBenefit: 0 }, { maxIncome: 100000, step: 250 });
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    expect(at(0)).toBe(0); // under the standard deduction
    expect(at(20000)).toBe(10);
    expect(at(40000)).toBe(12);
    expect(at(80000)).toBe(22);
  });

  it('shows the 1.85x torpedo while benefits phase in, then reverts after the cap', () => {
    const data = marginalRateCurve(
      { ssBenefit: 30000 },
      { maxIncome: 100000, step: 250 },
    );
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    // 85% band, 12% bracket: each extra dollar drags in $0.85 of benefits
    expect(at(40000)).toBeCloseTo(22.2, 1);
    // benefits fully taxed, back to the ordinary 22% rate
    expect(at(60000)).toBeCloseTo(22, 1);
  });

  it('hits 40.7% in the 22% bracket while benefits phase in', () => {
    const data = marginalRateCurve(
      { ssBenefit: 45000 },
      { maxIncome: 100000, step: 250 },
    );
    const point = data.find((d) => d.income === 45000)!;
    expect(point.marginalRate).toBeCloseTo(40.7, 1);
  });

  it('uses MFJ deduction and brackets with no benefits', () => {
    const data = marginalRateCurve(
      { ssBenefit: 0, filingStatus: 'mfj' },
      { maxIncome: 100000, step: 250 },
    );
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    expect(at(30000)).toBe(0); // under the $31,500 standard deduction
    expect(at(40000)).toBe(10);
    expect(at(80000)).toBe(12);
  });

  it('includes the total tax at each sampled income', () => {
    const data = marginalRateCurve(
      { ssBenefit: 30000 },
      { maxIncome: 100000, step: 250 },
    );
    const at = (income: number) => data.find((d) => d.income === income)!;
    expect(at(0).totalTax).toBe(0);
    expect(at(40000).totalTax).toBe(Math.round(totalTax(
      { ordinaryIncome: 40000, ssBenefit: 30000 },
    )));
    expect(at(80000).totalTax).toBe(Math.round(totalTax(
      { ordinaryIncome: 80000, ssBenefit: 30000 },
    )));
  });

  it('reports total tax as non-decreasing in income', () => {
    const data = marginalRateCurve(
      { ssBenefit: 30000 },
      { maxIncome: 100000, step: 250 },
    );
    for (let i = 1; i < data.length; i++) {
      expect(data[i].totalTax).toBeGreaterThanOrEqual(data[i - 1].totalTax);
    }
  });

  it('shows the MFJ torpedo phasing in later, then reverting after the cap', () => {
    const data = marginalRateCurve(
      { ssBenefit: 30000, filingStatus: 'mfj' },
      { maxIncome: 100000, step: 250 },
    );
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    // 85% band (provisional 55,000 > 44,000), 12% bracket: 1.85 * 12%
    expect(at(40000)).toBeCloseTo(22.2, 1);
    // benefits fully taxed (cap hit near $51,941), back to the plain 12% rate
    expect(at(60000)).toBeCloseTo(12, 1);
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
    const single = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0 },
      { maxLTCG: 100_000, step: 50 },
    );
    expect(single.find((d) => d.marginalRate > 0)!.ltcg).toBe(64_100);

    const mfj = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0, filingStatus: 'mfj' },
      { maxLTCG: 200_000, step: 50 },
    );
    expect(mfj.find((d) => d.marginalRate > 0)!.ltcg).toBe(31_500 + 96_700);
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

describe('ltcgMarginalRateCurve', () => {
  it('samples from zero to maxLTCG inclusive', () => {
    const data = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0 },
      { maxLTCG: 10000, step: 250 },
    );
    expect(data).toHaveLength(41);
    expect(data[0].ltcg).toBe(0);
    expect(data[40].ltcg).toBe(10000);
  });

  it('shows 0% marginal rate on LTCG when all income is below the threshold', () => {
    // Single: no SS, no ordinary income, LTCG starts at $0.
    const data = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0 },
      { maxLTCG: 50000, step: 250 },
    );
    const at = (ltcg: number) => data.find((d) => d.ltcg === ltcg)!.marginalRate;
    expect(at(0)).toBe(0);
    expect(at(10000)).toBe(0);
  });

  it('shows elevated marginal rates from SS torpedo stacking', () => {
    // Single: $30k ordinary, $30k SS. LTCG raises provisional income,
    // dragging SS into taxability at ordinary rates while LTCG itself
    // is taxed at capital-gains rates. The combined effect produces
    // marginal rates well above the bare 15% LTCG rate.
    const data = ltcgMarginalRateCurve(
      { ssBenefit: 30000, ordinaryIncome: 30000 },
      { maxLTCG: 100000, step: 250 },
    );
    const maxRate = Math.max(...data.map((d) => d.marginalRate));
    // The stacking pushes the effective marginal rate above 25%
    // (15% LTCG + torpedo-amplified ordinary tax on dragged-in SS).
    expect(maxRate).toBeGreaterThan(25);
  });

  it('reports total tax as non-decreasing', () => {
    const data = ltcgMarginalRateCurve(
      { ssBenefit: 24000, ordinaryIncome: 30000 },
      { maxLTCG: 100000, step: 250 },
    );
    for (let i = 1; i < data.length; i++) {
      expect(data[i].totalTax).toBeGreaterThanOrEqual(data[i - 1].totalTax);
    }
  });

  it('uses MFJ thresholds so LTCG stays at 0% longer', () => {
    // MFJ 0% threshold is $96,700 vs single $48,350.
    const dataSingle = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 60000 },
      { maxLTCG: 100000, step: 250 },
    );
    const dataMfj = ltcgMarginalRateCurve(
      { ssBenefit: 0, ordinaryIncome: 60000, filingStatus: 'mfj' },
      { maxLTCG: 100000, step: 250 },
    );
    // Single: ordinaryTaxable = 60k - 15750 = 44250. 0% zone = $4100 of LTCG.
    // MFJ: ordinaryTaxable = 60k - 31500 = 28500. 0% zone = $68200 of LTCG.
    const singleFirstNonZero = dataSingle.find((d) => d.marginalRate > 0)!.ltcg;
    const mfjFirstNonZero = dataMfj.find((d) => d.marginalRate > 0)!.ltcg;
    expect(mfjFirstNonZero).toBeGreaterThan(singleFirstNonZero);
  });
});

describe('segmentCurve', () => {
  it('groups constant rate points and classifies hills/valleys correctly', () => {
    const mockCurve = [
      { income: 0, marginalRate: 0 },
      { income: 1000, marginalRate: 0 },
      { income: 2000, marginalRate: 15 },
      { income: 3000, marginalRate: 15 },
      { income: 4000, marginalRate: 22 },
      { income: 5000, marginalRate: 22 },
      { income: 6000, marginalRate: 12 },
      { income: 7000, marginalRate: 12 },
      { income: 8000, marginalRate: 22 },
    ];
    const segments = segmentCurve(mockCurve, (p) => p.income);
    expect(segments).toHaveLength(5);

    // Segment 0: 0% -> valley
    expect(segments[0]).toMatchObject({
      rate: 0,
      start: 0,
      end: 1000,
      type: 'valley',
    });

    // Segment 1: 15% -> flat
    expect(segments[1]).toMatchObject({
      rate: 15,
      start: 2000,
      end: 3000,
      type: 'flat',
    });

    // Segment 2: 22% -> hill (since 22 > 15 and 22 > 12)
    expect(segments[2]).toMatchObject({
      rate: 22,
      start: 4000,
      end: 5000,
      type: 'hill',
    });

    // Segment 3: 12% -> valley (since 12 < 22 and 12 < 22)
    expect(segments[3]).toMatchObject({
      rate: 12,
      start: 6000,
      end: 7000,
      type: 'valley',
    });

    // Segment 4: 22% -> flat (last segment is not classified as hill/valley)
    expect(segments[4]).toMatchObject({
      rate: 22,
      start: 8000,
      end: 8000,
      type: 'flat',
    });
  });
});


describe('Roth conversion sizing', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  const ceiling = (id: ConversionCeilingId, filingStatus: FilingStatus = 'single'): ConversionCeiling => {
    const found = conversionCeilings({ filingStatus }).find((c) => c.id === id);
    if (!found) throw new Error(`no ceiling ${id}`);
    return found;
  };

  it('takes its ceiling amounts from the same tables the charts use', () => {
    const single = conversionCeilings({ filingStatus: 'single' });
    expect(single.map((c) => c.id)).toEqual([
      'bracket12',
      'bracket22',
      'ss50',
      'ss85',
      'ltcg0',
      'irmaa1',
    ]);
    expect(ceiling('bracket12').amount).toBe(48_475);
    expect(ceiling('bracket22').amount).toBe(103_350);
    expect(ceiling('ss50').amount).toBe(SS_BASES.single.ssBase50);
    expect(ceiling('ss85').amount).toBe(SS_BASES.single.ssBase85);
    expect(ceiling('ltcg0').amount).toBe(filingParams(PINNED_YEAR, 'single').ltcgBrackets[0].upTo);
    expect(ceiling('irmaa1').amount).toBe(irmaaFirstCliffMagi({ filingStatus: 'single' }));

    expect(ceiling('bracket12', 'mfj').amount).toBe(96_950);
    expect(ceiling('ss85', 'mfj').amount).toBe(44_000);
    expect(ceiling('irmaa1', 'mfj').amount).toBe(212_000);
  });

  it('sizes a conversion to the top of the 12% bracket, net of the SS drag', () => {
    // Single, $30,000 ordinary income, average benefit. Taxable SS starts at
    // $11,177.60, so taxable income starts at 30,000 + 11,177.60 - 15,750 =
    // $25,427.60 and the raw headroom under $48,475 is $23,047.40. Only
    // $14,069 of it is usable: the first $10,561 of conversion also drags in
    // 85 cents of benefits per dollar, until the 85% cap ($20,155.20) binds.
    expect(maxConversionUnder(
      ceiling('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    )).toBe(14_069);
    expect(
      conversionMeasureValue(
        'ordinaryTaxableIncome',
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0 },
        14_069,
      ),
    ).toBeCloseTo(48_474.2, 2);
    expect(
      conversionMeasureValue(
        'ordinaryTaxableIncome',
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0 },
        14_070,
      ),
    ).toBeGreaterThan(48_475);
  });

  it('sizes a conversion straight up to a provisional-income ceiling', () => {
    // No other income, so provisional income is half the benefit ($11,856) and
    // every converted dollar adds exactly one dollar of provisional income.
    expect(maxConversionUnder(ceiling('ss50'), { ordinaryIncome: 0, ssBenefit: SS })).toBe(25_000 - 11_856);
    expect(maxConversionUnder(ceiling('ss85'), { ordinaryIncome: 0, ssBenefit: SS })).toBe(34_000 - 11_856);
    expect(maxConversionUnder(
      ceiling('ss50', 'mfj'),
      { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'mfj' },
    )).toBe(32_000 - 11_856);
  });

  it('counts planned capital gains against the 0% capital-gains ceiling', () => {
    // $20,000 ordinary + $30,000 of gains, no benefits: total taxable income is
    // 50,000 - 15,750 = $34,250, leaving $14,100 under the $48,350 top of the
    // 0% bracket.
    expect(maxConversionUnder(
      ceiling('ltcg0'),
      { ordinaryIncome: 20_000, ssBenefit: 0, ltcg: 30_000 },
    )).toBe(14_100);
    // Without the gains the same ceiling leaves far more room.
    expect(maxConversionUnder(
      ceiling('ltcg0'),
      { ordinaryIncome: 20_000, ssBenefit: 0, ltcg: 0 },
    )).toBe(44_100);
  });

  it('measures the IRMAA ceiling against MAGI, which includes taxable benefits', () => {
    // $50,000 ordinary + $40,000 of benefits: the 85% cap ($34,000) already
    // binds, so MAGI is 84,000 + conversion and $22,000 fits under $106,000.
    expect(maxConversionUnder(
      ceiling('irmaa1'),
      { ordinaryIncome: 50_000, ssBenefit: 40_000 },
    )).toBe(22_000);
    expect(conversionMeasureValue(
      'magi',
      { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0 },
      22_000,
    )).toBe(106_000);
  });

  it('returns zero when the scenario is already over the ceiling', () => {
    const sizing = sizeConversion(
      ceiling('ss50'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    );
    expect(sizing.conversion).toBe(0);
    expect(sizing.alreadyOver).toBe(true);
    expect(sizing.headroom).toBeCloseTo(-16_856, 6);
    expect(sizing.taxCost).toBe(0);
    expect(sizing.costPerDollar).toBe(0);
  });

  it('flags a ceiling the search bound never reaches', () => {
    const sizing = sizeConversion(
      ceiling('bracket22'),
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 0, filingStatus: 'single', seniors: 0 },
      1_000,
    );
    expect(sizing.conversion).toBe(1_000);
    expect(sizing.unbounded).toBe(true);
    expect(sizeConversion(ceiling('bracket22'), { ordinaryIncome: 0, ssBenefit: 0 }).unbounded).toBe(false);
  });

  it('prices the conversion and the rate on the far side of the ceiling', () => {
    const sizing = sizeConversion(
      ceiling('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    );
    expect(sizing.conversion).toBe(14_069);
    expect(sizing.taxBefore).toBe(2_813);
    expect(sizing.taxAfter).toBe(5_578);
    expect(sizing.taxCost).toBe(2_765);
    expect(sizing.taxAfter - sizing.taxBefore).toBe(sizing.taxCost);
    // 19.65 cents per dollar converted while nominally "in the 12% bracket" —
    // the torpedo is dragging benefits in alongside the conversion.
    expect(sizing.costPerDollar).toBeCloseTo(19.65, 2);
    // Past the top of the 12% bracket the benefits are capped, so the rate is
    // the plain 22% statutory bracket rather than 1.85x it.
    expect(sizing.rateAboveCeiling).toBe(22);
  });

  it('lands exactly on every ceiling, for both filing statuses', () => {
    const scenarios = [
      { ordinary: 0, ss: 0, ltcg: 0 },
      { ordinary: 30_000, ss: SS, ltcg: 0 },
      { ordinary: 12_000, ss: 61_296, ltcg: 40_000 },
      { ordinary: 60_000, ss: 30_000, ltcg: 10_000 },
    ];
    const failures: string[] = [];
    for (const filingStatus of ['single', 'mfj'] as FilingStatus[]) {
      for (const c of conversionCeilings({ filingStatus })) {
        for (const { ordinary, ss, ltcg } of scenarios) {
          const sizing = sizeConversion(
            c,
            { ordinaryIncome: ordinary, ssBenefit: ss, ltcg, filingStatus },
          );
          const at = (conversion: number) =>
            conversionMeasureValue(
              c.measure,
              { ordinaryIncome: ordinary, ssBenefit: ss, ltcg, filingStatus },
              conversion,
            );
          const where = `${filingStatus}/${c.id}/ordinary=${ordinary}`;

          if (sizing.alreadyOver) {
            if (sizing.conversion !== 0 || at(0) <= c.amount) {
              failures.push(`${where}: flagged already-over but ${at(0)} <= ${c.amount}`);
            }
            continue;
          }
          if (sizing.unbounded) {
            failures.push(`${where}: unexpectedly unbounded`);
            continue;
          }
          // The answer fits, and one more dollar does not.
          if (at(sizing.conversion) > c.amount + 1e-6) {
            failures.push(`${where}: ${sizing.conversion} overshoots (${at(sizing.conversion)} > ${c.amount})`);
          }
          if (at(sizing.conversion + 1) <= c.amount) {
            failures.push(`${where}: ${sizing.conversion} undershoots (one more dollar still fits)`);
          }
          // Converting can never reduce the tax bill.
          if (sizing.taxCost < 0) {
            failures.push(`${where}: negative tax cost ${sizing.taxCost}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('age 65+ additional standard deduction (2025)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('adds $2,000 for a single filer and $1,600 per qualifying spouse for MFJ', () => {
    expect({
      single: filingParams(PINNED_YEAR, 'single').additionalStdDeduction65,
      mfj: filingParams(PINNED_YEAR, 'mfj').additionalStdDeduction65,
      mfs: filingParams(PINNED_YEAR, 'mfs').additionalStdDeduction65,
    }).toEqual({
      single: 2_000,
      mfj: 1_600,
      // Still married, so the married rate rather than the unmarried $2,000.
      mfs: 1_600,
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

  it('leaves provisional-income ceilings alone but widens taxable-income ones', () => {
    const ceilingFor = (id: ConversionCeilingId, fs: FilingStatus = 'single') =>
      conversionCeilings({ filingStatus: fs }).find((c) => c.id === id) as ConversionCeiling;
    // Provisional income is measured before any deduction, so the addition
    // buys no extra room at all against the SS bases.
    expect(maxConversionUnder(
      ceilingFor('ss50'),
      { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    )).toBe(
      maxConversionUnder(
        ceilingFor('ss50'),
        { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
      ),
    );
    // The top of the 12% bracket is measured against taxable income, and the
    // 85% cap already binds by then, so the room grows dollar for dollar with
    // the $8,000 of extra deduction.
    expect(maxConversionUnder(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
    )).toBe(14_069);
    expect(maxConversionUnder(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    )).toBe(22_069);
  });

  it('prices a conversion more cheaply for a filer over 65', () => {
    const ceilingFor = (id: ConversionCeilingId) =>
      conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === id) as ConversionCeiling;
    const sizing = sizeConversion(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    );
    expect(sizing.conversion).toBe(22_069);
    expect(sizing.taxBefore).toBe(1_853);
    // Both scenarios end at the top of the 12% bracket, so the tax after is the
    // same $5,578 — the over-65 filer simply gets $8,000 more converted for it.
    expect(sizing.taxAfter).toBe(5_578);
    expect(sizing.taxCost).toBe(3_725);
    expect(sizing.costPerDollar).toBeCloseTo(16.88, 2);
    // The conversion stops short of the $75,000 MAGI phaseout threshold, so the
    // dollar past the ceiling is taxed at the plain bracket rate.
    expect(sizing.rateAboveCeiling).toBe(22);
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
      // Section 151(d)(5)(C)(v) requires a joint return from married filers.
      mfs: null,
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

  it('prices the phaseout into a conversion ceiling and the rate past it', () => {
    const ceiling = conversionCeilings({ filingStatus: 'single' }).find(
      (c) => c.id === 'bracket22',
    ) as ConversionCeiling;
    const plain = sizeConversion(
      ceiling,
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
    );
    const senior = sizeConversion(
      ceiling,
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    );
    expect(plain.conversion).toBe(68_944);
    expect(plain.rateAboveCeiling).toBe(24);
    // $8,000 more deduction would buy $76,944 of room, but every converted
    // dollar above $75,000 of MAGI burns 6 cents of that deduction, so the
    // ceiling arrives $2,949 early - and the next dollar costs 25.44%.
    expect(senior.conversion).toBe(73_995);
    expect(senior.rateAboveCeiling).toBe(25.44);
  });
});

describe('tax-exempt (municipal) interest', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  const ceiling = (id: ConversionCeilingId): ConversionCeiling => {
    const found = conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === id);
    if (!found) throw new Error(`no ceiling ${id}`);
    return found;
  };

  it('agrees with Worksheet 1 line 4 across a grid', () => {
    for (const ss of [0, 12_000, SS, MAX_ANNUAL_SS_BENEFIT]) {
      for (const income of [0, 10_000, 25_000, 60_000]) {
        for (const muni of [0, 2_500, 10_000, 40_000]) {
          for (const status of ['single', 'mfj'] as FilingStatus[]) {
            expect(taxableSocialSecurity(
              { ssBenefit: ss, ordinaryIncome: income, filingStatus: status, muniInterest: muni },
            )).toBeCloseTo(
              pub915Worksheet1(ss, income, status, muni),
              8,
            );
          }
        }
      }
    }
  });

  it('counts toward provisional income exactly like other income', () => {
    // Worksheet 1 adds line 3 and line 4 together on line 6, so a dollar of
    // muni interest and a dollar of pension income are interchangeable here.
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 20_000, filingStatus: 'single', muniInterest: 5_000 },
    )).toBeCloseTo(
      taxableSocialSecurity(
        { ssBenefit: SS, ordinaryIncome: 25_000, filingStatus: 'single' },
      ),
      8,
    );
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 20_000, filingStatus: 'mfj', muniInterest: 5_000 },
    )).toBeCloseTo(
      taxableSocialSecurity(
        { ssBenefit: SS, ordinaryIncome: 25_000, filingStatus: 'mfj' },
      ),
      8,
    );
  });

  it('never enters taxable income itself', () => {
    // $20,000 of other income + the average benefit. Provisional income is
    // 20,000 + 11,856 = 31,856, so 50% of the excess over $25,000 is taxable:
    // $3,428 of benefits, AGI $23,428, taxable $7,678, all at 10% = $767.80.
    expect(totalTax({ ordinaryIncome: 20_000, ssBenefit: SS, filingStatus: 'single' })).toBeCloseTo(767.8, 6);
    // Add $5,000 of muni interest: provisional income clears $34,000, so the
    // benefits dragged in rise to $6,927.60 - but AGI is only $26,927.60,
    // because the interest itself is excluded by IRC 103.
    expect(totalTax(
      { ordinaryIncome: 20_000, ssBenefit: SS, filingStatus: 'single', seniors: 0, muniInterest: 5_000 },
    )).toBeCloseTo(1_117.76, 6);
    // The same $5,000 as ordinary income costs far more: it is taxed itself
    // *and* it drags in the identical amount of benefits.
    expect(totalTax({ ordinaryIncome: 25_000, ssBenefit: SS, filingStatus: 'single' })).toBeCloseTo(1_702.812, 6);
  });

  it('moves the torpedo left on the marginal-rate curve', () => {
    const rateOnsetAt = (muni: number): number | undefined =>
      marginalRateCurve(
        { ssBenefit: SS, filingStatus: 'single', seniors: 0, muniInterest: muni },
        { maxIncome: 150_000, step: 250 },
      ).find(
        (p) => p.marginalRate > 0,
      )?.income;
    // Without muni interest the first taxed dollar arrives at $15,000 of other
    // income; $10,000 of muni interest pulls that in to $11,750. The shift is
    // $3,250 rather than the full $10,000 because the interest raises taxable
    // income only through the benefits it drags in, and only 50 cents of
    // benefit come in per dollar in this band.
    expect(rateOnsetAt(0)).toBe(15_000);
    expect(rateOnsetAt(10_000)).toBe(11_750);
  });

  it('costs nothing once benefits are capped at 85%', () => {
    // $100,000 of other income already puts 85% of the benefits in the tax
    // base, so there is nothing left for the interest to drag in.
    expect(totalTax(
      { ordinaryIncome: 100_000, ssBenefit: SS, filingStatus: 'single', seniors: 0, muniInterest: 10_000 },
    )).toBe(
      totalTax({ ordinaryIncome: 100_000, ssBenefit: SS, filingStatus: 'single' }),
    );
    // Same with the senior deduction in play: muni interest is not added back
    // for its MAGI, so it cannot touch the phaseout either.
    expect(totalTax(
      { ordinaryIncome: 100_000, ssBenefit: SS, filingStatus: 'single', seniors: 1, muniInterest: 10_000 },
    )).toBe(
      totalTax(
        { ordinaryIncome: 100_000, ssBenefit: SS, filingStatus: 'single', seniors: 1 },
      ),
    );
  });

  it('is added back for the IRMAA MAGI ceiling but not for AGI', () => {
    // $50,000 ordinary + $22,000 converted + $40,000 of benefits: the 85% cap
    // binds, so AGI is $106,000. Medicare adds tax-exempt interest back.
    expect(conversionMeasureValue(
      'magi',
      { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0 },
      22_000,
    )).toBe(106_000);
    expect(
      conversionMeasureValue(
        'magi',
        { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 10_000 },
        22_000,
      ),
    ).toBe(116_000);
    // So $10,000 of muni interest costs exactly $10,000 of conversion room.
    expect(maxConversionUnder(
      ceiling('irmaa1'),
      { ordinaryIncome: 50_000, ssBenefit: 40_000 },
    )).toBe(22_000);
    expect(
      maxConversionUnder(
        ceiling('irmaa1'),
        { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 10_000 },
        1_000_000,
      ),
    ).toBe(12_000);
  });

  it('eats provisional-income headroom dollar for dollar', () => {
    // Provisional income is 5,000 + conversion + 11,856, so $8,144 fits under
    // the $25,000 base amount - $2,000 less with $2,000 of muni interest.
    expect(maxConversionUnder(ceiling('ss50'), { ordinaryIncome: 5_000, ssBenefit: SS })).toBe(8_144);
    expect(
      maxConversionUnder(
        ceiling('ss50'),
        { ordinaryIncome: 5_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 2_000 },
        1_000_000,
      ),
    ).toBe(6_144);
  });
});

describe('muniInterestEffect', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('prices the benefits the interest drags into taxable income', () => {
    const effect = muniInterestEffect(
      { muniInterest: 5_000, ordinaryIncome: 20_000, ssBenefit: SS },
    );
    expect(effect.taxableSSWithout).toBe(3_428);
    expect(effect.taxableSSWith).toBe(6_928); // 6,927.60 rounded
    expect(effect.taxableSSDelta).toBe(3_500);
    expect(effect.taxWithout).toBe(768);
    expect(effect.taxWith).toBe(1_118);
    expect(effect.taxCost).toBe(350);
    // $3,499.60 of extra taxable benefits, all inside the 10% bracket, on
    // $5,000 of interest: 7 cents of tax per "tax-free" dollar.
    expect(effect.costPerDollar).toBeCloseTo(7, 2);
    // The next dollar lands above $34,000 of provisional income, so it drags
    // in 85 cents of benefits at 10%.
    expect(effect.ratePerNextDollar).toBeCloseTo(8.5, 2);
  });

  it('is all zeros when provisional income stays under the first threshold', () => {
    const effect = muniInterestEffect(
      { muniInterest: 5_000, ordinaryIncome: 5_000, ssBenefit: SS },
    );
    expect(effect.taxableSSDelta).toBe(0);
    expect(effect.taxCost).toBe(0);
    expect(effect.costPerDollar).toBe(0);
    expect(effect.ratePerNextDollar).toBe(0);
  });

  it('is all zeros once the 85% cap already binds', () => {
    const effect = muniInterestEffect(
      { muniInterest: 10_000, ordinaryIncome: 100_000, ssBenefit: SS },
    );
    expect(effect.taxableSSWithout).toBe(20_155);
    expect(effect.taxableSSDelta).toBe(0);
    expect(effect.taxCost).toBe(0);
    expect(effect.ratePerNextDollar).toBe(0);
  });

  it('reports zero cost per dollar rather than dividing by zero', () => {
    expect(muniInterestEffect(
      { muniInterest: 0, ordinaryIncome: 30_000, ssBenefit: SS },
    ).costPerDollar).toBe(0);
  });

  it('counts planned capital gains in the provisional income it prices against', () => {
    // $20,000 of gains on top of $20,000 of ordinary income already puts
    // provisional income at $51,856, which leaves only $477.60 of benefits
    // below the 85% cap. The gains have spent the torpedo before the interest
    // gets to it, so the same $5,000 that cost $350 without them now drags in
    // $478 and the dollar after that is free.
    expect(muniInterestEffect(
      { muniInterest: 5_000, ordinaryIncome: 20_000, ssBenefit: SS, ltcg: 0 },
    ).taxableSSDelta).toBe(3_500);
    const withGains = muniInterestEffect(
      { muniInterest: 5_000, ordinaryIncome: 20_000, ssBenefit: SS, ltcg: 20_000 },
    );
    expect(withGains.taxableSSDelta).toBe(478);
    expect(withGains.ratePerNextDollar).toBe(0);
  });

  it('matches the marginal rate the tax chain reports at the same point', () => {
    const effect = muniInterestEffect(
      { muniInterest: 5_000, ordinaryIncome: 20_000, ssBenefit: SS, ltcg: 0, filingStatus: 'mfj', seniors: 1 },
    );
    const direct =
      totalTax(
        { ordinaryIncome: 20_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 1, muniInterest: 5_001 },
      ) - totalTax(
        { ordinaryIncome: 20_000, ssBenefit: SS, filingStatus: 'mfj', seniors: 1, muniInterest: 5_000 },
      );
    expect(effect.ratePerNextDollar).toBeCloseTo(
      Math.round(direct * 10_000) / 100,
      6,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Married filing separately, having lived with the spouse           */
/* ------------------------------------------------------------------ */

describe('married filing separately (lived with spouse)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  /** 85% of the benefit — the ceiling the separate return hits almost at once. */
  const SS_CAP = 0.85 * SS; // $20,155.20

  it('agrees with the Pub 915 worksheet run at $0 base amounts', () => {
    for (const otherIncome of [0, 1, 2_500, 11_855, 11_856, 40_000, 150_000]) {
      expect(taxableSocialSecurity(
        { ssBenefit: SS, ordinaryIncome: otherIncome, filingStatus: 'mfs' },
      )).toBeCloseTo(
        pub915Worksheet1(SS, otherIncome, 'mfs'),
        6,
      );
    }
    // And with tax-exempt interest in provisional income too.
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 5_000, filingStatus: 'mfs', muniInterest: 3_000 },
    )).toBeCloseTo(
      pub915Worksheet1(SS, 5_000, 'mfs', 3_000),
      6,
    );
  });

  it('has both provisional-income thresholds at $0', () => {
    expect(SS_BASES.mfs.ssBase50).toBe(0);
    expect(SS_BASES.mfs.ssBase85).toBe(0);
  });

  it('taxes 42.5% of the benefit before any other income arrives', () => {
    // Provisional income is half the benefit, and 85% of that is taxable.
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 0, filingStatus: 'mfs' },
    )).toBeCloseTo(0.425 * SS, 6);
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 0, filingStatus: 'mfs' },
    )).toBeCloseTo(10_077.6, 6);
    // A single filer with the same benefit owes nothing on it at all.
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 0, filingStatus: 'single' },
    )).toBe(0);
  });

  it('hits the 85% cap once other income reaches half the benefit', () => {
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: SS / 2 - 1, filingStatus: 'mfs' },
    )).toBeCloseTo(
      SS_CAP - 0.85,
      6,
    );
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: SS / 2, filingStatus: 'mfs' },
    )).toBeCloseTo(SS_CAP, 6);
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: 150_000, filingStatus: 'mfs' },
    )).toBeCloseTo(SS_CAP, 6);
    // Tax-exempt interest is in provisional income, so it brings the cap
    // forward dollar for dollar.
    expect(taxableSocialSecurity(
      { ssBenefit: SS, ordinaryIncome: SS / 2 - 3_000, filingStatus: 'mfs', muniInterest: 3_000 },
    )).toBeCloseTo(
      SS_CAP,
      6,
    );
  });

  it('never draws the 50% band, so the curve skips straight to 1.85x', () => {
    const bands = (fs: FilingStatus): number[] => [
      ...new Set(
        marginalRateCurve(
          { ssBenefit: SS, filingStatus: fs },
          { maxIncome: 40_000, step: 250 },
        )
          .map((p) => p.marginalRate)
          .filter((r) => r > 0),
      ),
    ];
    // A single filer passes through 10% x 1.5 on the way up. A separate
    // filer has no 50% tier to pass through.
    expect(bands('single')).toContain(15);
    expect(bands('mfs')).not.toContain(15);
    expect(bands('mfs')).toEqual([18.5, 22.2, 12]);
  });

  it('is done with the torpedo by half the benefit', () => {
    const curve = marginalRateCurve(
      { ssBenefit: SS, filingStatus: 'mfs' },
      { maxIncome: 40_000, step: 250 },
    );
    const amplified = curve.filter((p) => p.marginalRate > 12);
    expect(amplified[0].income).toBe(3_250);
    // The last amplified sample sits below half the benefit ($11,856); every
    // sample past it is back on the plain bracket rate.
    expect(amplified[amplified.length - 1].income).toBeLessThan(SS / 2);
    expect(
      curve
        .filter((p) => p.income >= SS / 2)
        .every((p) => p.marginalRate === 12),
    ).toBe(true);
  });

  it('borrows the single filer brackets until $375,800 and then diverges', () => {
    // Section 1(j)(2)(D). The tax at each break matches Rev. Proc. 2024-40's
    // own "the tax is" column.
    expect(federalIncomeTax(250_525, { filingStatus: 'mfs' })).toBeCloseTo(57_231, 6);
    expect(federalIncomeTax(375_800, { filingStatus: 'mfs' })).toBeCloseTo(101_077.25, 6);
    for (const taxable of [0, 11_925, 48_475, 103_350, 197_300, 375_800]) {
      expect(federalIncomeTax(taxable, { filingStatus: 'mfs' })).toBeCloseTo(
        federalIncomeTax(taxable, { filingStatus: 'single' }),
        6,
      );
    }
    // Past $375,800 a separate return is already at 37% while a single one
    // still has $250,550 of 35% bracket left.
    expect(federalIncomeTax(400_000, { filingStatus: 'mfs' })).toBeCloseTo(110_031.25, 6);
    expect(federalIncomeTax(400_000, { filingStatus: 'single' })).toBeCloseTo(109_547.25, 6);
  });

  it('shares the single standard deduction but takes the married age-65 amount', () => {
    expect(filingParams(PINNED_YEAR, 'mfs').standardDeduction).toBe(
      filingParams(PINNED_YEAR, 'single').standardDeduction,
    );
    expect(filingParams(PINNED_YEAR, 'mfs').additionalStdDeduction65).toBe(1_600);
    expect(standardDeductionFor({ filingStatus: 'mfs', seniors: 0 })).toBe(15_750);
    expect(standardDeductionFor({ filingStatus: 'mfs', seniors: 1 })).toBe(17_350);
    // Only one person can claim it on a separate return.
    expect(maxSeniors('mfs')).toBe(1);
    expect(standardDeductionFor({ filingStatus: 'mfs', seniors: 2 })).toBe(17_350);
  });

  it('gets no senior deduction at all, at any income', () => {
    // Section 151(d)(5)(C)(v) conditions it on filing jointly.
    expect(seniorDeductionAllowed('mfs')).toBe(false);
    expect(seniorDeductionPhaseoutEnd('mfs')).toBeNull();
    for (const magi of [0, 40_000, 75_000, 100_000, 175_000]) {
      expect(seniorDeductionFor({ filingStatus: 'mfs', seniors: 1 }, magi)).toBe(0);
      expect(deductionFor({ filingStatus: 'mfs', seniors: 1 }, magi)).toBe(standardDeductionFor(
        { filingStatus: 'mfs', seniors: 1 },
      ));
    }
    // So there is no second hump: the rate curve for a 65-year-old separate
    // filer is the same one a 64-year-old sees, shifted only by the $1,600.
    const rates = (seniors: number): number[] =>
      marginalRateCurve(
        { ssBenefit: SS, filingStatus: 'mfs', seniors },
        { maxIncome: 150_000, step: 250 },
      ).map(
        (p) => p.marginalRate,
      );
    expect(new Set(rates(1))).toEqual(new Set(rates(0)));
  });

  it('halves the 0% capital-gains band but not the 15% one', () => {
    expect(filingParams(PINNED_YEAR, 'mfs').ltcgBrackets[0].upTo).toBe(48_350);
    expect(filingParams(PINNED_YEAR, 'mfs').ltcgBrackets[0].upTo).toBe(filingParams(PINNED_YEAR, 'mfj').ltcgBrackets[0].upTo / 2);
    // $600,050 / 2 is $300,025; Rev. Proc. 2024-40 prints $300,000, because
    // each status is inflation-adjusted and rounded from its own base amount.
    expect(filingParams(PINNED_YEAR, 'mfs').ltcgBrackets[1].upTo).toBe(300_000);
    expect(filingParams(PINNED_YEAR, 'mfj').ltcgBrackets[1].upTo / 2).toBe(300_025);
    // $400,000 of pure gains: 0% to $48,350, 15% to $300,000, 20% after.
    expect(totalTax(
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 400_000, filingStatus: 'mfs' },
    )).toBeCloseTo(54_597.5, 6);
    expect(totalTax(
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 400_000, filingStatus: 'single' },
    )).toBeCloseTo(50_385, 6);
  });

  it('skips IRMAA tiers 1 through 3 entirely', () => {
    // 42 U.S.C. 1395r(i)(3)(C) gives a separate return its own two-step
    // schedule, which reuses tiers 4 and 5's premiums at its own thresholds.
    expect(irmaaTiersFor({ filingStatus: 'mfs' }).map((t) => t.tier)).toEqual([0, 4, 5]);
    expect(irmaaTiersFor({ filingStatus: 'single' }).map((t) => t.tier)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(firstIrmaaTier({ filingStatus: 'mfs' }).tier).toBe(4);
    expect(irmaaFirstCliffMagi({ filingStatus: 'mfs' })).toBe(106_000);
    // Same first threshold as a single filer, four times the surcharge.
    expect(irmaaFirstCliffMagi({ filingStatus: 'single' })).toBe(106_000);
    expect(irmaaFor(106_001, { filingStatus: 'mfs' }).annualSurcharge).toBeCloseTo(5_826, 6);
    expect(irmaaFor(106_001, { filingStatus: 'single' }).annualSurcharge).toBeCloseTo(1_052.4, 6);
  });

  it('walks its own tier ladder for the next cliff and its cost', () => {
    const under = irmaaFor(106_000, { filingStatus: 'mfs' });
    expect(under.tier).toBe(0);
    expect(under.nextThreshold).toBe(106_000);
    expect(under.headroom).toBe(0);
    expect(under.nextStep).toBeCloseTo(5_826, 6);

    const over = irmaaFor(106_001, { filingStatus: 'mfs' });
    expect(over.tier).toBe(4);
    // Not tier 5's $500,000/$750,000, and not tier 1's — the mfs ladder's.
    expect(over.nextThreshold).toBe(394_000);
    expect(over.headroom).toBe(287_999);
    expect(over.nextStep).toBeCloseTo(530.4, 6);
  });

  it('reaches its top tier at $394,000 exactly, as every status does', () => {
    // The last row of all three of CMS's 2025 tables reads "Greater than or
    // equal to" — $394,000 separate, $500,000 individual, $750,000 joint —
    // where every row above it reads "Greater than". The inclusive top rung is
    // not an MFS quirk; it applies to all three statuses.
    expect(irmaaTierFor(394_000, { filingStatus: 'mfs' }).tier).toBe(5);
    expect(irmaaTierFor(500_000, { filingStatus: 'single' }).tier).toBe(5);
    expect(irmaaTierFor(750_000, { filingStatus: 'mfj' }).tier).toBe(5);
    // The rung below each is exclusive, so a cent under stays put.
    expect(irmaaTierFor(393_999.99, { filingStatus: 'mfs' }).tier).toBe(4);
    expect(irmaaTierFor(499_999.99, { filingStatus: 'single' }).tier).toBe(4);
    expect(irmaaTierFor(749_999.99, { filingStatus: 'mfj' }).tier).toBe(4);
  });

  it('places its two cliffs on the other-income axis', () => {
    const cliffs = irmaaCliffs({ ssBenefit: SS, filingStatus: 'mfs' });
    expect(cliffs.map((c) => c.tier)).toEqual([4, 5]);
    // Past the cap the benefit contributes a fixed $20,155.20 to AGI, so each
    // cliff sits exactly that far below its MAGI figure.
    expect(cliffs[0].otherIncome).toBeCloseTo(106_000 - SS_CAP, 6);
    expect(cliffs[1].otherIncome).toBeCloseTo(394_000 - SS_CAP, 6);
    // The first step is the whole four-tier climb taken at once.
    expect(cliffs[0].step).toBeCloseTo(5_826, 6);
    expect(cliffs[1].step).toBeCloseTo(530.4, 6);
    // A single filer reaches the same $5,826 only at their fourth cliff.
    expect(irmaaCliffs({ ssBenefit: SS, filingStatus: 'single' })[3].annualSurcharge).toBeCloseTo(5_826, 6);
  });

  it('names the right IRMAA ceiling and collapses the two SS ceilings', () => {
    const ceilings = conversionCeilings({ filingStatus: 'mfs' });
    const irmaa = ceilings.find((c) => c.id === 'irmaa1')!;
    expect(irmaa.label).toBe('IRMAA tier 4 (Medicare surcharge)');
    expect(irmaa.amount).toBe(106_000);
    expect(conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === 'irmaa1')!.label).toBe(
      'IRMAA tier 1 (Medicare surcharge)',
    );
    // Both Social Security ceilings are $0, so neither can be sized against.
    for (const id of ['ss50', 'ss85'] as ConversionCeilingId[]) {
      const ceiling = ceilings.find((c) => c.id === id)!;
      expect(ceiling.amount).toBe(0);
      expect(ceiling.note).toContain('separate return');
      const sized = sizeConversion(
        ceiling,
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'mfs' },
      );
      expect(sized.alreadyOver).toBe(true);
      expect(sized.conversion).toBe(0);
      // Provisional income is already other income plus half the benefit.
      expect(sized.headroom).toBeCloseTo(-(30_000 + SS / 2), 6);
    }
  });

  it('costs more federal tax than a single filer on identical income', () => {
    // $30,000 of other income: identical brackets and standard deduction, but
    // $20,155.20 of benefits in the base instead of $11,177.60.
    expect(totalTax({ ordinaryIncome: 30_000, ssBenefit: SS, filingStatus: 'mfs' })).toBeCloseTo(3_890.12, 2);
    expect(totalTax({ ordinaryIncome: 30_000, ssBenefit: SS, filingStatus: 'single' })).toBeCloseTo(2_812.81, 2);
  });
});

describe('IRMAA (Medicare income-related monthly adjustment amount)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  /** 85% of the average benefit — the cap the torpedo tops out at. */
  const SS_CAP = 0.85 * AVG_ANNUAL_SS_BENEFIT; // $20,155.20

  it('reads MAGI from the return filed two years before the premium year', () => {
    // The premium year is the tax year selected on the page, not a constant:
    // pick 2026 and the table has to say it is priced off 2024 income.
    expect(irmaaMagiYear(2025)).toBe(2023);
    expect(irmaaMagiYear(2026)).toBe(2024);
    // Un-yeared, it follows the same pinned clock as everything else here.
    expect(irmaaMagiYear()).toBe(PINNED_YEAR - 2);
    for (const year of TAX_YEARS) {
      expect(irmaaMagiYear(year)).toBe(year - 2);
    }
  });

  it('matches the 2025 CMS premium schedule', () => {
    // Federal Register 89 FR 89843 (Nov 14 2024) / CMS 2025 fact sheet.
    expect(partBStandardPremium(2025)).toBe(185);
    expect(allIrmaaTiers(2025).map((t) => t.partBMonthly)).toEqual([
      185, 259, 370, 480.9, 591.9, 628.9,
    ]);
    expect(allIrmaaTiers(2025).map((t) => t.partDSurchargeMonthly)).toEqual([
      0, 13.7, 35.3, 57, 78.6, 85.8,
    ]);
    expect(allIrmaaTiers(2025).map((t) => t.partBSurchargeMonthly)).toEqual([
      0, 74, 185, 295.9, 406.9, 443.9,
    ]);
    expect(allIrmaaTiers(2025).slice(1).map((t) => t.magiOver.single)).toEqual([
      106_000, 133_000, 167_000, 200_000, 500_000,
    ]);
    expect(allIrmaaTiers(2025).slice(1).map((t) => t.magiOver.mfs)).toEqual([
      Infinity, Infinity, Infinity, 106_000, 394_000,
    ]);
  });

  it('matches the 2026 CMS premium schedule', () => {
    // 90 FR 52065 (Nov 19 2025), the rule CMS's fact sheet reproduces. The
    // whole point of the year selector: pick 2026 and this section re-prices
    // rather than sitting a year stale next to 2026 brackets.
    expect(partBStandardPremium(2026)).toBe(202.9);
    expect(allIrmaaTiers(2026).map((t) => t.partBMonthly)).toEqual([
      202.9, 284.1, 405.8, 527.5, 649.2, 689.9,
    ]);
    expect(allIrmaaTiers(2026).map((t) => t.partDSurchargeMonthly)).toEqual([
      0, 14.5, 37.5, 60.4, 83.3, 91,
    ]);
    expect(allIrmaaTiers(2026).map((t) => t.partBSurchargeMonthly)).toEqual([
      0, 81.2, 202.9, 324.6, 446.3, 487,
    ]);
    expect(allIrmaaTiers(2026).slice(1).map((t) => t.magiOver.single)).toEqual([
      109_000, 137_000, 171_000, 205_000, 500_000,
    ]);
    // A separate return's ladder is the unmarried first threshold and then
    // $500,000 less that threshold — so its top rung *fell* from $394,000 to
    // $391,000 while the single top rung stayed put at $500,000.
    expect(allIrmaaTiers(2026).slice(1).map((t) => t.magiOver.mfs)).toEqual([
      Infinity, Infinity, Infinity, 109_000, 391_000,
    ]);
  });

  it('keeps every year’s Part B surcharge equal to its premium over standard', () => {
    // The surcharge column is transcribed from CMS rather than derived, so
    // that a year's figures can be checked against the fact sheet line by
    // line. This is the check that the two columns did not drift apart.
    for (const year of TAX_YEARS) {
      const standard = partBStandardPremium(year);
      for (const tier of allIrmaaTiers(year)) {
        expect(tier.partBMonthly - standard).toBeCloseTo(
          tier.partBSurchargeMonthly,
          6,
        );
      }
      expect(allIrmaaTiers(year).map((t) => t.tier)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(allIrmaaTiers(year)[0].partBMonthly).toBe(standard);
    }
  });

  it('doubles the joint thresholds except at the statutory top tier', () => {
    for (const year of TAX_YEARS) {
      const tiers = allIrmaaTiers(year);
      for (const tier of tiers.slice(1, 5)) {
        expect(tier.magiOver.mfj).toBe(2 * tier.magiOver.single);
      }
      // $500,000/$750,000 came from the Bipartisan Budget Act of 2018 and is
      // not indexed until years beginning after 2027, so it never doubled and
      // is the one threshold that does not move between 2025 and 2026.
      expect(tiers[5].magiOver.single).toBe(500_000);
      expect(tiers[5].magiOver.mfj).toBe(750_000);
    }
  });

  it('keeps the conversion ceiling and the tier table in sync', () => {
    for (const year of TAX_YEARS) {
      const tiers = allIrmaaTiers(year);
      expect(irmaaFirstCliffMagi({ year, filingStatus: 'single' })).toBe(
        tiers[1].magiOver.single,
      );
      expect(irmaaFirstCliffMagi({ year, filingStatus: 'mfj' })).toBe(
        tiers[1].magiOver.mfj,
      );
      // A separate return's first cliff is tier 4, not tier 1.
      expect(irmaaFirstCliffMagi({ year, filingStatus: 'mfs' })).toBe(
        tiers[4].magiOver.mfs,
      );
    }
    // And the Roth ceiling follows the selected year rather than 2025's.
    expect(
      conversionCeilings({ year: 2026 }).find((c) => c.id === 'irmaa1')?.amount,
    ).toBe(109_000);
  });

  it('adds tax-exempt interest back into MAGI but never into the tax base', () => {
    // AGI at $50,000 of other income: the 85% cap already binds.
    expect(irmaaMagi({ ordinaryIncome: 50_000, ssBenefit: SS })).toBeCloseTo(50_000 + SS_CAP, 6);
    // The interest lands in MAGI twice over: once directly, and once through
    // the benefits it drags in — except here the cap has already bound, so
    // only the direct dollar counts.
    expect(irmaaMagi(
      { ordinaryIncome: 50_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', muniInterest: 10_000 },
    )).toBeCloseTo(
      60_000 + SS_CAP,
      6,
    );
    // Capital gains are ordinary AGI for this purpose, preferential rate or not.
    expect(irmaaMagi({ ordinaryIncome: 50_000, ssBenefit: SS, ltcg: 20_000 })).toBeCloseTo(70_000 + SS_CAP, 6);
  });

  it('treats the thresholds as exclusive cliffs, except the top one', () => {
    expect(irmaaTierFor(106_000).tier).toBe(0);
    expect(irmaaTierFor(106_000.01).tier).toBe(1);
    expect(irmaaTierFor(133_000).tier).toBe(1);
    expect(irmaaTierFor(133_000.01).tier).toBe(2);
    expect(irmaaTierFor(1e9).tier).toBe(5);
    // The last row of the statutory rate table at 42 U.S.C.
    // 1395r(i)(3)(C)(i)(III) reads "At least $500,000" where every row above
    // it reads "More than", and CMS reproduces that verbatim: "Greater than
    // $205,000 and less than $500,000", then "Greater than or equal to
    // $500,000". So $500,000 on the nose is already the top tier.
    expect(irmaaTierFor(500_000).tier).toBe(5);
    expect(irmaaTierFor(499_999.99).tier).toBe(4);
    // A joint return at the same MAGI sits two tiers lower.
    expect(irmaaTierFor(220_000, { filingStatus: 'mfj' }).tier).toBe(1);
    expect(irmaaTierFor(220_000, { filingStatus: 'single' }).tier).toBe(4);
  });

  it('re-tiers the same MAGI when the premium year changes', () => {
    // $107,000 is over 2025's first threshold and under 2026's — the same
    // income, a $1,052.40 surcharge one year and nothing the next.
    expect(irmaaTierFor(107_000, { year: 2025 }).tier).toBe(1);
    expect(irmaaTierFor(107_000, { year: 2026 }).tier).toBe(0);
    expect(irmaaFor(107_000, { year: 2025 }).annualSurcharge).toBeCloseTo(1_052.4, 6);
    expect(irmaaFor(107_000, { year: 2026 }).annualSurcharge).toBe(0);
    // Tier 0 still bills the standard premium, and it went up either way.
    expect(irmaaFor(107_000, { year: 2026 }).annualPartB).toBeCloseTo(2_434.8, 6);
    // (81.20 Part B + 14.50 Part D) x 12, 2026's first step.
    expect(irmaaFor(109_001, { year: 2026 }).annualSurcharge).toBeCloseTo(1_148.4, 6);
    // And the cliffs the chart draws move with it.
    expect(irmaaCliffs({ ssBenefit: 0, year: 2026 }).map((c) => c.magi)).toEqual([
      109_000, 137_000, 171_000, 205_000, 500_000,
    ]);
  });

  it('annualizes the Part B and Part D surcharges per beneficiary', () => {
    const standard = irmaaFor(50_000);
    expect(standard.tier).toBe(0);
    expect(standard.annualSurcharge).toBe(0);
    expect(standard.annualPartB).toBe(2_220); // 185 x 12
    expect(standard.nextThreshold).toBe(106_000);
    expect(standard.headroom).toBe(56_000);
    expect(standard.nextStep).toBe(1_052.4);

    const tier1 = irmaaFor(106_001);
    expect(tier1.tier).toBe(1);
    // (74.00 Part B + 13.70 Part D) x 12
    expect(tier1.annualSurcharge).toBe(1_052.4);
    expect(tier1.annualPartB).toBe(3_108); // 259 x 12
    expect(tier1.nextStep).toBe(1_591.2);

    const top = irmaaFor(600_000);
    expect(top.tier).toBe(5);
    expect(top.annualSurcharge).toBe(6_356.4);
    expect(top.nextThreshold).toBeNull();
    expect(top.headroom).toBeNull();
    expect(top.nextStep).toBe(0);
  });

  it('charges a couple twice off one MAGI figure', () => {
    const couple = irmaaFor(213_000, { filingStatus: 'mfj', beneficiaries: 2 });
    expect(couple.tier).toBe(1);
    expect(couple.beneficiaries).toBe(2);
    expect(couple.annualSurcharge).toBe(2 * 1_052.4);
    expect(couple.nextStep).toBe(2 * 1_591.2);
    // Per-beneficiary figures stay per-beneficiary.
    expect(couple.partBMonthly).toBe(259);
    expect(couple.partBSurchargeMonthly).toBe(74);
  });

  it('inverts MAGI onto the chart’s other-income axis', () => {
    // Past the 85% cap the benefit is a fixed $20,155.20 of AGI, so the cliff
    // arrives that much earlier than its MAGI figure reads.
    expect(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS })).toBeCloseTo(106_000 - SS_CAP, 4);
    expect(irmaaMagi(
      { ordinaryIncome: otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS }), ssBenefit: SS },
    )).toBeCloseTo(
      106_000,
      4,
    );
    // With no benefit at all there is nothing to drag in, so it is 1:1.
    expect(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: 0 })).toBeCloseTo(106_000, 4);
    // Already over the threshold with no other income: clamp at zero.
    expect(otherIncomeAtIrmaaMagi(
      106_000,
      { ssBenefit: 0, filingStatus: 'single', muniInterest: 200_000 },
    )).toBe(0);
  });

  it('moves the cliff more than a dollar per dollar inside the torpedo', () => {
    // At the maximum benefit the 85% cap has not bound by $106,000 of MAGI, so
    // MAGI climbs at $1.85 per dollar earned and the first cliff arrives at
    // $56,405 of other income rather than $85,845.
    const x = otherIncomeAtIrmaaMagi(106_000, { ssBenefit: MAX_ANNUAL_SS_BENEFIT });
    expect(x).toBeCloseTo(56_404.97, 2);
    expect(irmaaMagi({ ordinaryIncome: x, ssBenefit: MAX_ANNUAL_SS_BENEFIT })).toBeCloseTo(106_000, 4);
    expect(x).toBeLessThan(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS }));
  });

  it('shifts every cliff left by each dollar of tax-exempt interest', () => {
    const plain = irmaaCliffs({ ssBenefit: SS });
    const withMuni = irmaaCliffs(
      { ssBenefit: SS, filingStatus: 'single', muniInterest: 10_000 },
    );
    for (let i = 0; i < plain.length; i += 1) {
      expect(plain[i].otherIncome - withMuni[i].otherIncome).toBeCloseTo(10_000, 4);
    }
  });

  it('places the five cliffs with their annual cost', () => {
    const cliffs = irmaaCliffs({ ssBenefit: SS });
    expect(cliffs.map((c) => c.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(cliffs.map((c) => c.magi)).toEqual([
      106_000, 133_000, 167_000, 200_000, 500_000,
    ]);
    expect(cliffs[0].otherIncome).toBeCloseTo(85_844.8, 4);
    expect(cliffs[1].otherIncome).toBeCloseTo(112_844.8, 4);
    expect(cliffs[2].otherIncome).toBeCloseTo(146_844.8, 4);
    expect(cliffs.map((c) => c.annualSurcharge)).toEqual([
      1_052.4, 2_643.6, 4_234.8, 5_826, 6_356.4,
    ]);
    // The three middle cliffs cost exactly the same to cross.
    expect(cliffs.map((c) => c.step)).toEqual([
      1_052.4, 1_591.2, 1_591.2, 1_591.2, 530.4,
    ]);
    // A couple both on Medicare pays each step twice.
    expect(irmaaCliffs(
      { ssBenefit: SS, filingStatus: 'mfj', muniInterest: 0, beneficiaries: 2 },
    ).map((c) => c.step)).toEqual([
      2_104.8, 3_182.4, 3_182.4, 3_182.4, 1_060.8,
    ]);
  });

  it('dwarfs the income tax on the dollar that crosses it', () => {
    // One dollar over the tier-1 threshold costs $1,052.40 of Medicare premium
    // on top of whatever the income tax takes — a marginal rate of six figures
    // on that dollar, and the reason the cliff is worth drawing at all.
    const x = otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS });
    const incomeTaxOnTheDollar = totalTax({ ordinaryIncome: x + 1, ssBenefit: SS }) - totalTax(
      { ordinaryIncome: x, ssBenefit: SS },
    );
    expect(incomeTaxOnTheDollar).toBeLessThan(1);
    expect(irmaaFor(irmaaMagi({ ordinaryIncome: x + 1, ssBenefit: SS })).annualSurcharge).toBe(1_052.4);
    expect(irmaaFor(irmaaMagi({ ordinaryIncome: x - 1, ssBenefit: SS })).annualSurcharge).toBe(0);
  });
});

describe('tax year', () => {
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
      for (const status of ['single', 'mfj', 'mfs'] as FilingStatus[]) {
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
      // IRC 63(c)(2) files single and separate under "any other case", and
      // 1(j)(2)(D) halves the joint brackets — which reproduces the single
      // schedule until a separate return runs out of 35% band.
      expect(filingParams(year, 'mfs').standardDeduction).toBe(
        filingParams(year, 'single').standardDeduction,
      );
      const mfs = filingParams(year, 'mfs').brackets;
      const single = filingParams(year, 'single').brackets;
      expect(mfs.slice(0, -2)).toEqual(single.slice(0, -2));
      expect(mfs[mfs.length - 2].upTo).toBeCloseTo(
        filingParams(year, 'mfj').brackets[mfs.length - 2].upTo / 2,
        6,
      );
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
    // And the two ceilings measured against those thresholds hold still while
    // the two bracket ceilings and the gain band all move.
    const amount = (year: TaxYear, id: ConversionCeilingId): number =>
      conversionCeilings({ year }).find((c) => c.id === id)!.amount;
    expect(amount(2026, 'ss50')).toBe(amount(2025, 'ss50'));
    expect(amount(2026, 'ss85')).toBe(amount(2025, 'ss85'));
    expect(amount(2025, 'bracket12')).toBe(48_475);
    expect(amount(2026, 'bracket12')).toBe(50_400);
    expect(amount(2025, 'ltcg0')).toBe(48_350);
    expect(amount(2026, 'ltcg0')).toBe(49_450);
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

/* ------------------------------------------------------------------ */
/*  Qualified charitable distributions (IRC 408(d)(8))                */
/* ------------------------------------------------------------------ */

describe('qualified charitable distributions', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('reads the published annual limits, which are indexed', () => {
    // SECURE 2.0 section 307 started indexing the statutory $100,000 in 2024.
    expect(qcdAnnualLimit(2025)).toBe(108_000); // Notice 2024-80
    expect(qcdAnnualLimit(2026)).toBe(111_000); // Notice 2025-67
    expect(qcdSplitInterestLimit(2025)).toBe(54_000);
    expect(qcdSplitInterestLimit(2026)).toBe(55_000);
    expect(qcdAnnualLimit(2026)).toBeGreaterThan(qcdAnnualLimit(2025));
  });

  it('starts at 70 1/2, which no act has moved even as the RMD age climbed', () => {
    expect(QCD_MIN_AGE).toBe(70.5);
    // The gap that opens up: someone with an applicable age of 75 can give from
    // the IRA five years before anything is required to come out of it.
    expect(QCD_MIN_AGE).toBeLessThan(73);
  });

  it('is a per-individual limit, so only a joint return gets it twice', () => {
    expect(qcdLimitFor({ filingStatus: 'single', year: 2025 })).toBe(108_000);
    expect(qcdLimitFor({ filingStatus: 'mfj', year: 2025 })).toBe(216_000);
    // A separate return carries one individual, exactly like a single one.
    expect(qcdLimitFor({ filingStatus: 'mfs', year: 2025 })).toBe(108_000);
    expect(qcdLimitFor({ filingStatus: 'mfj', year: 2026 })).toBe(222_000);
  });

  it('caps the exclusion at the statutory limit, then at the income to take it from', () => {
    const single = { filingStatus: 'single' as const, year: PINNED_YEAR };
    // Under both caps: exactly what was asked for.
    expect(qcdFor({ ...single, ordinaryIncome: 40_000, qcd: 10_000 })).toBe(10_000);
    // Over the statutory limit.
    expect(qcdAllowed({ ...single, ordinaryIncome: 200_000, qcd: 130_000 })).toBe(108_000);
    expect(qcdFor({ ...single, ordinaryIncome: 200_000, qcd: 130_000 })).toBe(108_000);
    // Allowed by law, but there is only $40,000 of ordinary income to exclude.
    expect(qcdAllowed({ ...single, ordinaryIncome: 40_000, qcd: 50_000 })).toBe(50_000);
    expect(qcdFor({ ...single, ordinaryIncome: 40_000, qcd: 50_000 })).toBe(40_000);
    // Nonsense inputs clamp rather than going negative.
    expect(qcdFor({ ...single, ordinaryIncome: 40_000, qcd: -5_000 })).toBe(0);
    expect(qcdFor({ ...single, ordinaryIncome: -1_000, qcd: 5_000 })).toBe(0);
  });

  it('never drives ordinary income below zero', () => {
    expect(ordinaryIncomeAfterQcd({ ordinaryIncome: 40_000, qcd: 10_000 })).toBe(30_000);
    expect(ordinaryIncomeAfterQcd({ ordinaryIncome: 40_000, qcd: 90_000 })).toBe(0);
    expect(ordinaryIncomeAfterQcd({ ordinaryIncome: 40_000 })).toBe(40_000);
  });

  it('takes benefits back out of the tax base, 85 cents per dollar in the top tier', () => {
    const base = { ordinaryIncome: 40_000, ssBenefit: SS, seniors: 1, year: PINNED_YEAR };
    // $40,000 of other income puts provisional income at $51,856, well past the
    // $34,000 adjusted base, so every excluded dollar unwinds 85 cents.
    expect(taxableSocialSecurity(base)).toBeCloseTo(19_677.6, 4);
    expect(taxableSocialSecurity({ ...base, qcd: 10_000 })).toBeCloseTo(11_177.6, 4);
    expect(
      taxableSocialSecurity(base) - taxableSocialSecurity({ ...base, qcd: 10_000 }),
    ).toBeCloseTo(8_500, 4);
    // AGI falls by the gift *and* the benefits it took with it: $18,500 on a
    // $10,000 distribution.
    expect(agiFor(base) - agiFor({ ...base, qcd: 10_000 })).toBeCloseTo(18_500, 4);
  });

  it('is worth the torpedo rate rather than the bracket rate', () => {
    const base = { ordinaryIncome: 40_000, ssBenefit: SS, seniors: 1, year: PINNED_YEAR };
    const effect = qcdEffect({ ...base, qcd: 10_000 });
    expect(effect.excluded).toBe(10_000);
    expect(effect.taxableSSRemoved).toBe(8_500);
    expect(effect.taxWithout).toBe(4_073);
    expect(effect.taxWith).toBe(1_853);
    expect(effect.taxSaved).toBe(2_220);
    // 12% on $1.85 of taxable income per excluded dollar. A charitable
    // deduction for the same gift would be worth nothing at all here, because
    // this filer takes the standard deduction.
    expect(effect.savedPerDollar).toBeCloseTo(22.2, 2);
    expect(effect.ratePerNextDollar).toBeCloseTo(22.2, 2);
  });

  it('reports the caps it hit, and stops saving anything once it hits one', () => {
    const byLaw = qcdEffect({
      ordinaryIncome: 200_000,
      ssBenefit: 30_000,
      qcd: 130_000,
      year: PINNED_YEAR,
    });
    expect(byLaw.limitedByLaw).toBe(true);
    expect(byLaw.limitedByIncome).toBe(false);
    expect(byLaw.excluded).toBe(108_000);
    // The 130,001st dollar is over the limit, so it is an ordinary
    // distribution and saves nothing.
    expect(byLaw.ratePerNextDollar).toBe(0);

    const byIncome = qcdEffect({
      ordinaryIncome: 40_000,
      ssBenefit: SS,
      qcd: 50_000,
      seniors: 1,
      year: PINNED_YEAR,
    });
    expect(byIncome.limitedByLaw).toBe(false);
    expect(byIncome.limitedByIncome).toBe(true);
    expect(byIncome.excluded).toBe(40_000);
    expect(byIncome.ordinaryIncomeAfter).toBe(0);
    expect(byIncome.taxWith).toBe(0);
    expect(byIncome.ratePerNextDollar).toBe(0);
    // Averaged over what was asked for rather than what was excluded would
    // read 8.1%; the exclusion that happened was worth 10.18%.
    expect(byIncome.savedPerDollar).toBeCloseTo(10.18, 2);
  });

  it('reports zero saved per dollar rather than dividing by zero', () => {
    const none = qcdEffect({ ordinaryIncome: 40_000, ssBenefit: SS, year: PINNED_YEAR });
    expect(none.excluded).toBe(0);
    expect(none.savedPerDollar).toBe(0);
    expect(none.taxSaved).toBe(0);
    // The slider is still worth moving, and the readout says by how much.
    expect(none.ratePerNextDollar).toBeCloseTo(22.2, 2);
  });

  it('drops the IRMAA tier the same dollars set, two years out', () => {
    const effect = qcdEffect({
      ordinaryIncome: 100_000,
      ssBenefit: 40_000,
      seniors: 1,
      qcd: 8_000,
      year: PINNED_YEAR,
    });
    // $134,000 of MAGI is in tier 2; $126,000 is in tier 1.
    expect(effect.irmaaMagiWithout).toBe(134_000);
    expect(effect.irmaaMagiWith).toBe(126_000);
    expect(effect.irmaaTierWithout).toBe(2);
    expect(effect.irmaaTierWith).toBe(1);
    expect(effect.irmaaSurchargeSaved).toBeCloseTo(1_591.2, 2);
    // The surcharge saving is most of the tax saving again, and it is not in
    // the tax figures at all.
    expect(effect.taxSaved).toBe(2_036);
  });

  it('shifts the whole marginal-rate curve right by the amount excluded', () => {
    const base = { ssBenefit: SS, seniors: 1, year: PINNED_YEAR };
    const plain = marginalRateCurve(base, { maxIncome: 120_000, step: 1_000 });
    const given = marginalRateCurve({ ...base, qcd: 10_000 }, { maxIncome: 120_000, step: 1_000 });
    // Same rate 10 rows later, all the way along: a QCD moves the torpedo the
    // way tax-exempt interest moves it, only in the other direction.
    for (let i = 0; i + 10 < plain.length; i += 1) {
      expect(given[i + 10].marginalRate).toBeCloseTo(plain[i].marginalRate, 6);
      expect(given[i + 10].totalTax).toBe(plain[i].totalTax);
    }
    // And the excluded stretch is flat at zero, because none of it is income.
    expect(given.slice(0, 10).every((p) => p.marginalRate === 0)).toBe(true);
  });

  it('moves the IRMAA cliffs right by the same amount', () => {
    const base = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
    const plain = irmaaCliffs(base);
    const given = irmaaCliffs({ ...base, qcd: 10_000 });
    expect(given).toHaveLength(plain.length);
    plain.forEach((cliff, i) => {
      expect(given[i].magi).toBe(cliff.magi);
      // Without the QCD term in the bisection bound this converged on the
      // search ceiling instead of the threshold.
      expect(given[i].otherIncome).toBeCloseTo(cliff.otherIncome + 10_000, 4);
    });
    expect(otherIncomeAtIrmaaMagi(106_000, { ...base, qcd: 10_000 })).toBeCloseTo(
      otherIncomeAtIrmaaMagi(106_000, base) + 10_000,
      4,
    );
  });

  it('leaves more room under a conversion ceiling', () => {
    const base = {
      ordinaryIncome: 30_000,
      ssBenefit: SS,
      filingStatus: 'single' as const,
      year: PINNED_YEAR,
    };
    const ss85 = conversionCeilings(base).find((c) => c.id === 'ss85')!;
    // Provisional income is built out of gross income, so the exclusion buys
    // headroom under a provisional-income ceiling dollar for dollar.
    expect(conversionMeasureValue('provisionalIncome', base, 0)).toBeCloseTo(41_856, 4);
    expect(
      conversionMeasureValue('provisionalIncome', { ...base, qcd: 10_000 }, 0),
    ).toBeCloseTo(31_856, 4);
    expect(maxConversionUnder(ss85, base)).toBe(0);
    expect(maxConversionUnder(ss85, { ...base, qcd: 10_000 })).toBe(2_144);
  });

  it('stays monotonic when a conversion un-caps an income-limited exclusion', () => {
    // $5,000 of ordinary income and a $20,000 gift: the exclusion is capped at
    // $5,000 until a conversion supplies more income for it to come out of, so
    // the first $15,000 of conversion is absorbed and the measure is flat.
    // Flat is fine; falling would break the binary search.
    const base = { ordinaryIncome: 5_000, ssBenefit: SS, qcd: 20_000, year: PINNED_YEAR };
    let previous = -Infinity;
    for (let conversion = 0; conversion <= 40_000; conversion += 500) {
      const value = conversionMeasureValue('provisionalIncome', base, conversion);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(conversionMeasureValue('provisionalIncome', base, 0)).toBeCloseTo(11_856, 4);
    expect(conversionMeasureValue('provisionalIncome', base, 15_000)).toBeCloseTo(11_856, 4);
    expect(conversionMeasureValue('provisionalIncome', base, 20_000)).toBeCloseTo(16_856, 4);
  });

  it('changes nothing at all when it is not set', () => {
    const base = {
      ordinaryIncome: 45_000,
      ssBenefit: SS,
      ltcg: 12_000,
      muniInterest: 3_000,
      filingStatus: 'mfj' as const,
      seniors: 2,
      year: PINNED_YEAR,
    };
    expect(totalTax({ ...base, qcd: 0 })).toBe(totalTax(base));
    expect(taxableSocialSecurity({ ...base, qcd: 0 })).toBe(taxableSocialSecurity(base));
    expect(agiFor({ ...base, qcd: 0 })).toBe(agiFor(base));
    expect(irmaaMagi({ ...base, qcd: 0 })).toBe(irmaaMagi(base));
  });
});

import {
  federalIncomeTax,
  muniInterestEffect,
  FilingStatus,
  ltcgMarginalRateCurve,
  marginalRateCurve,
  taxableSocialSecurity,
  totalTax,
  segmentCurve,
  standingOn,
  splitOtherIncome,
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
  totalIncomeFor,
  QCD_MIN_AGE,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  otherIncomeAtTaxableSSCap,
  otherIncomeAtAgi,
  incomeAxisFeatures,
  incomeAxisMax,
  MIN_INCOME_AXIS,
  niitFor,
  niitMagi,
  ptcCliff,
  ptcCliffMagi,
  ptcFor,
  ptcParams,
  acaMagi,
  povertyLine,
  povertyLineFor,
  fplMultipleOf,
  fplGuidelineYear,
  defaultHouseholdSize,
  otherIncomeAtAcaMagi,
  resolveScenario,
  FPL_YEAR_PARAMS,
  FPL_GUIDELINE_LOOKBACK_YEARS,
  IRMAA_LOOKBACK_YEARS,
  PTC_CLIFF_PERCENT,
  CONVERSION_MEASURE_LABELS,
  niitThreshold,
  netInvestmentIncomeFor,
  netInvestmentIncomeTax,
  totalFederalTax,
  NIIT_RATE,
  NIIT_ENACTED,
  NIIT_THRESHOLDS,
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
  // Head of household falls under 86(c)(1)(B)'s "any other case", so Pub 915
  // has it tick the same $25,000 box a single filer does.
  const line9 = { single: 25_000, mfj: 32_000, mfs: 0, hoh: 25_000 }[filingStatus];
  const line10 = Math.max(0, line8 - line9);
  if (line10 === 0) return 0; // none of the benefits are taxable
  // Adjusted base amount less base amount. single: $34,000 - $25,000;
  // MFJ: $44,000 - $32,000; separate: $0 - $0, per 86(c)(2)(C).
  const line11 = { single: 9_000, mfj: 12_000, mfs: 0, hoh: 9_000 }[filingStatus];
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

/**
 * The app asks for one income figure and then asks how much of it is a
 * long-term gain, so a gain is a share of the income a filer has rather than
 * something stacked on top of it. The statute takes the additive reading —
 * ordinary income and gains are separate line items — which is why the sweeps
 * keep it as their default and `gainsWithinIncome` is what opts out.
 */
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

  it('takes off the charitable gift the law allows, not the one asked for', () => {
    expect(totalIncomeFor({ ...base, qcd: 10_000 })).toBe(54_000);
    // Only $25,000 of ordinary income is left beside the gain to take a gift
    // from, so a $40,000 gift removes $25,000 and the rest is not a gift at all.
    expect(
      totalIncomeFor({ ...base, ordinaryIncome: 25_000, ltcg: 15_000, qcd: 40_000 }),
    ).toBe(39_000);
  });

  it('never reports a negative total', () => {
    expect(totalIncomeFor({ ordinaryIncome: -5_000 })).toBe(0);
    expect(totalIncomeFor()).toBe(0);
  });
});

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

  describe('ltcgMarginalRateCurve with gainsWithinIncome', () => {
    const scenario = { ssBenefit: 24_000, ordinaryIncome: 60_000 };

    it('holds total income still and moves only the split', () => {
      const curve = ltcgMarginalRateCurve(scenario, {
        maxLTCG: 60_000,
        step: 1_000,
        gainsWithinIncome: true,
      });
      const at = (gain: number): number =>
        curve.find((d) => d.ltcg === gain)!.totalTax;
      expect(at(0)).toBe(Math.round(totalTax(scenario)));
      expect(at(20_000)).toBe(
        Math.round(totalTax({ ...scenario, ordinaryIncome: 40_000, ltcg: 20_000 })),
      );
      expect(at(60_000)).toBe(
        Math.round(totalTax({ ...scenario, ordinaryIncome: 0, ltcg: 60_000 })),
      );
    });

    /**
     * A dollar of gain and a dollar of ordinary income raise provisional
     * income identically, so the taxable share of the benefit is the same at
     * every point on this axis. That is what makes the curve readable: the
     * torpedo is held fixed and only the rate schedule each dollar is charged
     * under is moving.
     */
    it('leaves the taxable benefit untouched across the whole axis', () => {
      const taxable = (gain: number): number =>
        taxableSocialSecurity({ ...scenario, ...splitOtherIncome(60_000, gain) });
      expect(taxable(20_000)).toBeCloseTo(taxable(0), 6);
      expect(taxable(60_000)).toBeCloseTo(taxable(0), 6);
    });

    /**
     * The preferential rate is below the ordinary one at every position in the
     * stack, so re-labelling a dollar of the same income as a gain can never
     * cost more. (With a charitable distribution in play it can, because the
     * gift has only the ordinary half to come out of — hence no QCD here.)
     */
    it('never charges more for the same income as the gain share grows', () => {
      const curve = ltcgMarginalRateCurve(scenario, {
        maxLTCG: 60_000,
        step: 500,
        gainsWithinIncome: true,
      });
      for (let i = 1; i < curve.length; i += 1) {
        expect(curve[i].totalTax).toBeLessThanOrEqual(curve[i - 1].totalTax);
      }
      expect(curve[curve.length - 1].totalTax).toBeLessThan(curve[0].totalTax);
    });

    it('still stacks on top when the flag is left off', () => {
      const stacked = ltcgMarginalRateCurve(scenario, {
        maxLTCG: 60_000,
        step: 1_000,
      });
      expect(stacked.find((d) => d.ltcg === 20_000)!.totalTax).toBe(
        Math.round(totalTax({ ...scenario, ltcg: 20_000 })),
      );
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

    /**
     * The one exception: a charitable distribution is an exclusion of an IRA
     * distribution, so it has only the ordinary half to come out of. Make the
     * gain big enough and part of the gift can no longer be excluded, which
     * brings the cliff nearer.
     */
    it('brings the cliff nearer when a gain crowds out the charitable gift', () => {
      const base = { ssBenefit: 24_000, qcd: 30_000 };
      const crowded = otherIncomeAtIrmaaMagi(106_000, { ...base, ltcg: 100_000 });
      expect(crowded).toBeLessThan(otherIncomeAtIrmaaMagi(106_000, base));
    });
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

describe('standingOn', () => {
  /**
   * The same shape the segmentCurve test uses, and for the same reason: a hand
   * written curve says which stretch is which without depending on a year's
   * figures. Segments run valley(0%) - flat(15%) - hill(22%) - valley(12%) -
   * flat(22%).
   */
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
  const mockSegments = segmentCurve(mockCurve, (p) => p.income);
  const standAt = (x: number) => standingOn(mockSegments, x);

  it('puts a reader below the first rise on the valley floor, hump ahead', () => {
    const standing = standAt(0);
    expect(standing).toMatchObject({
      kind: 'valley',
      here: { rate: 0 },
      prev: null,
      next: { rate: 15 },
      hump: { rate: 22, start: 4000, end: 5000 },
    });
  });

  it('puts a reader on a raised stretch below the hump on the climb', () => {
    expect(standAt(2500)).toMatchObject({
      kind: 'climbing',
      here: { rate: 15 },
      prev: { rate: 0 },
      hump: { rate: 22, start: 4000 },
    });
  });

  it('puts a reader inside the hump at the peak, with both ways off it', () => {
    expect(standAt(4000)).toMatchObject({
      kind: 'peak',
      here: { rate: 22, start: 4000, end: 5000 },
      prev: { rate: 15 },
      next: { rate: 12 },
      hump: { rate: 22, start: 4000 },
    });
  });

  it('prefers the hump ahead to the hump behind', () => {
    // The dip after a hump is a valley by shape, but with nothing higher left
    // to warn about the advice is about the one already cleared.
    expect(standAt(6500)).toMatchObject({
      kind: 'past',
      here: { rate: 12 },
      hump: { rate: 22, start: 4000, end: 5000 },
    });
    expect(standAt(8000)).toMatchObject({ kind: 'past', here: { rate: 22, start: 8000 } });
  });

  it('reads a curve with no hump as flat, whichever end the reader is at', () => {
    const climbing = segmentCurve(
      [
        { income: 0, marginalRate: 0 },
        { income: 1000, marginalRate: 10 },
        { income: 2000, marginalRate: 12 },
      ],
      (p) => p.income,
    );
    expect(standingOn(climbing, 0)).toMatchObject({ kind: 'flat', hump: null });
    expect(standingOn(climbing, 2000)).toMatchObject({ kind: 'flat', hump: null });
  });

  it('clamps to the nearest stretch at or below a value that misses a sample', () => {
    // Between segment 0's last sample ($1,000) and segment 1's first ($2,000).
    expect(standAt(1500)).toMatchObject({ kind: 'valley', here: { rate: 0 } });
    // Past the right edge of the curve entirely.
    expect(standAt(80_000)).toMatchObject({ here: { rate: 22, start: 8000 } });
  });

  it('has nothing to say about an empty curve', () => {
    expect(standingOn([], 0)).toBeNull();
  });

  /**
   * What deferral is worth: the nearest stretch behind the reader that charges
   * less than they do. Nearest rather than cheapest, because the cheapest is
   * almost always the run below the standard deduction — true, and no use to
   * anyone deciding whether to hold a withdrawal back a year.
   */
  it('finds the nearest cheaper ground behind, not the cheapest', () => {
    // From the 22% at the far right: the 12% dip it just cleared, not the 0%
    // floor at the left edge.
    expect(standAt(8000)?.cheaperBehind).toMatchObject({ rate: 12, start: 6000 });
    // From the 12% dip: everything between it and the 0% floor is dearer.
    expect(standAt(6500)?.cheaperBehind).toMatchObject({ rate: 0, start: 0 });
    // Nothing at all behind the first stretch.
    expect(standAt(0)?.cheaperBehind).toBeNull();
  });

  it('walks a real single filer from the valley floor over the torpedo', () => {
    const curve = marginalRateCurve(
      { ssBenefit: AVG_ANNUAL_SS_BENEFIT, filingStatus: 'single', year: PINNED_YEAR },
      { maxIncome: 150_000, step: 250 },
    );
    const segments = segmentCurve(curve, (p) => p.income);
    const hump = segments.find((seg) => seg.type === 'hill');
    if (!hump) throw new Error('the average benefit should still make a hump');

    // Every dollar of the hump is dearer than either side of it: that is what
    // makes the advice on it "go round, not through".
    expect(standingOn(segments, hump.start)?.kind).toBe('peak');
    expect(standingOn(segments, hump.end)?.kind).toBe('peak');
    expect(standingOn(segments, 0)?.kind).toBe('valley');
    expect(standingOn(segments, 150_000)?.kind).toBe('past');

    // And the hump the reader is warned about from below is the one they are
    // standing on when they get there.
    expect(standingOn(segments, 0)?.hump).toBe(hump);
    expect(standingOn(segments, 150_000)?.hump).toBe(hump);
  });

  it('sends a return with no benefit to drag in past the humps entirely', () => {
    const curve = marginalRateCurve(
      { ssBenefit: 0, filingStatus: 'single', year: PINNED_YEAR },
      { maxIncome: 150_000, step: 250 },
    );
    const segments = segmentCurve(curve, (p) => p.income);
    expect(segments.some((seg) => seg.type === 'hill')).toBe(false);
    expect(standingOn(segments, 40_000)).toMatchObject({ kind: 'flat', hump: null });
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
      hoh: 75_000,
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

describe('head of household', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712

  it('agrees with the Pub 915 worksheet run at the default base amounts', () => {
    for (const otherIncome of [0, 5_000, 13_144, 22_144, 40_000, 150_000]) {
      expect(
        taxableSocialSecurity({ ssBenefit: SS, ordinaryIncome: otherIncome, filingStatus: 'hoh' }),
      ).toBeCloseTo(pub915Worksheet1(SS, otherIncome, 'hoh'), 6);
    }
    // And with tax-exempt interest in provisional income too.
    expect(
      taxableSocialSecurity({
        ssBenefit: SS,
        ordinaryIncome: 5_000,
        filingStatus: 'hoh',
        muniInterest: 3_000,
      }),
    ).toBeCloseTo(pub915Worksheet1(SS, 5_000, 'hoh', 3_000), 6);
  });

  it("shares the single filer's thresholds exactly", () => {
    // IRC 86(c)(1) and (c)(2) name a joint return and a separate return that
    // lived together, and put everything else under "any other case".
    expect(SS_BASES.hoh).toEqual({ ssBase50: 25_000, ssBase85: 34_000 });
    expect(SS_BASES.hoh).toEqual(SS_BASES.single);
    for (const ordinaryIncome of [0, 5_000, 20_000, 40_000, 100_000]) {
      expect(
        taxableSocialSecurity({ ordinaryIncome, ssBenefit: SS, filingStatus: 'hoh' }),
      ).toBe(taxableSocialSecurity({ ordinaryIncome, ssBenefit: SS, filingStatus: 'single' }));
    }
  });

  it('carries its own standard deduction, 150% of the single one', () => {
    for (const year of TAX_YEARS) {
      const hoh = filingParams(year, 'hoh').standardDeduction;
      expect(hoh).toBe(1.5 * filingParams(year, 'single').standardDeduction);
    }
    expect(standardDeductionFor({ filingStatus: 'hoh', year: 2025 })).toBe(23_625);
    expect(standardDeductionFor({ filingStatus: 'hoh', year: 2026 })).toBe(24_150);
  });

  it('takes the unmarried age-65 addition, not the married one', () => {
    // 63(f)(3) raises the addition for someone "not married and not a
    // surviving spouse". A head of household is unmarried by definition.
    for (const year of TAX_YEARS) {
      const { additionalStdDeduction65 } = filingParams(year, 'hoh');
      expect(additionalStdDeduction65).toBe(
        filingParams(year, 'single').additionalStdDeduction65,
      );
      expect(additionalStdDeduction65).toBeGreaterThan(
        filingParams(year, 'mfj').additionalStdDeduction65,
      );
    }
    expect(standardDeductionFor({ filingStatus: 'hoh', seniors: 1, year: 2025 })).toBe(25_625);
    expect(standardDeductionFor({ filingStatus: 'hoh', seniors: 2, year: 2025 })).toBe(25_625);
    expect(standardDeductionFor({ filingStatus: 'hoh', seniors: 1, year: 2026 })).toBe(26_200);
  });

  it('has its own rate schedule, materially wider in the 10% and 12% bands', () => {
    expect(filingParams(2025, 'hoh').brackets.map((b) => b.upTo)).toEqual([
      17_000, 64_850, 103_350, 197_300, 250_500, 626_350, Infinity,
    ]);
    expect(filingParams(2026, 'hoh').brackets.map((b) => b.upTo)).toEqual([
      17_700, 67_450, 105_700, 201_775, 256_200, 640_600, Infinity,
    ]);
    // $50,000 of taxable income is still in the 12% band for a head of
    // household and already in the 22% one for a single filer.
    expect(federalIncomeTax(50_000, { filingStatus: 'hoh' })).toBeCloseTo(5_660, 6);
    expect(federalIncomeTax(50_000, { filingStatus: 'single' })).toBeCloseTo(5_914, 6);
  });

  it('carries its own capital-gain bands', () => {
    expect(filingParams(2025, 'hoh').ltcgBrackets.map((b) => b.upTo)).toEqual([
      64_750, 566_700, Infinity,
    ]);
    expect(filingParams(2026, 'hoh').ltcgBrackets.map((b) => b.upTo)).toEqual([
      66_200, 579_600, Infinity,
    ]);
    // $80,000 of gains and nothing else: the deduction plus the wider 0% band
    // covers all of it, where a single filer already owes 15% on $15,900.
    expect(totalTax({ ltcg: 80_000, filingStatus: 'hoh' })).toBe(0);
    expect(totalTax({ ltcg: 80_000, filingStatus: 'single' })).toBeCloseTo(2_385, 6);
  });

  it('starts taxing at the same provisional income but the same benefit costs less', () => {
    // Identical taxable benefit at $50,000 of other income - the thresholds
    // are the same - but the wider deduction and 12% band price it lower.
    expect(totalTax({ ordinaryIncome: 50_000, ssBenefit: SS, filingStatus: 'hoh' })).toBeCloseTo(
      5_243.624,
      6,
    );
    expect(totalTax({ ordinaryIncome: 50_000, ssBenefit: SS, filingStatus: 'single' })).toBeCloseTo(
      6_883.144,
      6,
    );
  });

  it('pushes the first taxed dollar right by the deduction gap over 1.5', () => {
    // Inside the 50% tier each extra dollar of other income raises AGI by
    // $1.50 - the dollar itself plus fifty cents of benefit - so the extra
    // $7,875 of deduction buys $5,250 of income, not $7,875 of it.
    const firstTaxed = (filingStatus: FilingStatus): number => {
      let income = 0;
      while (totalTax({ ordinaryIncome: income, ssBenefit: SS, filingStatus }) === 0) income += 1;
      return income;
    };
    expect(firstTaxed('hoh')).toBe(20_132);
    expect(firstTaxed('single')).toBe(14_882);
    expect(firstTaxed('hoh') - firstTaxed('single')).toBe(
      (filingParams(PINNED_YEAR, 'hoh').standardDeduction -
        filingParams(PINNED_YEAR, 'single').standardDeduction) /
        1.5,
    );
  });

  it('gets the senior deduction at the unmarried threshold', () => {
    // 151(d)(5)(C)(i) reads "$150,000 in the case of a joint return" and
    // $75,000 otherwise; clause (v) only excludes married separate filers.
    expect(seniorDeductionAllowed('hoh')).toBe(true);
    expect(SENIOR_DEDUCTION_PHASEOUT_START.hoh).toBe(75_000);
    expect(seniorDeductionPhaseoutEnd('hoh')).toBe(175_000);
    expect(seniorDeductionFor({ filingStatus: 'hoh', seniors: 1 }, 100_000)).toBeCloseTo(4_500, 6);
    expect(deductionFor({ filingStatus: 'hoh', seniors: 1 }, 100_000)).toBeCloseTo(30_125, 6);
  });

  it('is one person for every per-person figure', () => {
    expect(maxSeniors('hoh')).toBe(1);
    // 408(d)(8)(A) caps a QCD per individual, and doubling needs two people.
    expect(qcdLimitFor({ filingStatus: 'hoh' })).toBe(qcdAnnualLimit(PINNED_YEAR));
    expect(qcdLimitFor({ filingStatus: 'hoh' })).toBe(qcdLimitFor({ filingStatus: 'single' }));
  });

  it("uses Medicare's individual-return column, not a fourth one", () => {
    // 42 U.S.C. 1395r(i)(3)(C) has three clauses: joint, married separate, and
    // everyone else. SSA POMS HI 01101.020 heads that third table "Single,
    // head-of-household, or qualifying surviving spouse".
    for (const year of TAX_YEARS) {
      for (const tier of allIrmaaTiers(year)) {
        expect(tier.magiOver.hoh).toBe(tier.magiOver.single);
      }
    }
    expect(irmaaTiersFor({ filingStatus: 'hoh' })).toEqual(
      irmaaTiersFor({ filingStatus: 'single' }),
    );
    expect(irmaaTiersFor({ filingStatus: 'hoh' })).toHaveLength(6);
    expect(firstIrmaaTier({ filingStatus: 'hoh' }).tier).toBe(1);
    expect(irmaaFirstCliffMagi({ filingStatus: 'hoh', year: 2025 })).toBe(106_000);
    expect(irmaaFirstCliffMagi({ filingStatus: 'hoh', year: 2026 })).toBe(109_000);
    // The top rung is inclusive for every status, this one included.
    expect(irmaaTierFor(500_000, { filingStatus: 'hoh' }).tier).toBe(5);
    expect(irmaaTierFor(499_999, { filingStatus: 'hoh' }).tier).toBe(4);
  });

  it('prices the conversion ceilings off its own figures', () => {
    const amounts = Object.fromEntries(
      conversionCeilings({ filingStatus: 'hoh', year: 2025 }).map((c) => [c.id, c.amount]),
    );
    expect(amounts).toEqual({
      bracket12: 64_850,
      bracket22: 103_350,
      ss50: 25_000,
      ss85: 34_000,
      ltcg0: 64_750,
      irmaa1: 106_000,
    });
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

/**
 * The chart's right edge used to be a constant, and a constant cannot be right
 * for every return: $150,000 shows an unmarried filer the whole torpedo and
 * three IRMAA cliffs, but stops halfway through the senior deduction's
 * phaseout, which does not finish until $175,000 of MAGI unmarried and
 * $250,000 joint. So the axis is now derived from the scenario — it ends a
 * little past the last thing that happens on the curve, and never narrows
 * below the figure it used to be fixed at.
 */
describe('sizing the income axis to the return', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712

  describe('otherIncomeAtTaxableSSCap', () => {
    /**
     * 86(a)(2)(B): the inclusion stops at 85% of the benefit. For a single
     * filer that needs provisional income of $34,000 + ($20,155.20 - $4,500) /
     * 0.85 = $52,417.88, and provisional income already holds half the benefit,
     * so $40,561.88 of other income gets there.
     */
    it('finds where the taxable share of the benefit stops rising', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const };
      const cap = otherIncomeAtTaxableSSCap(scenario);
      expect(cap).toBeCloseTo(40_561.88, 1);
      // At that income the cap binds to the cent, and a hundred dollars short
      // of it the next dollar of income is still dragging benefits in.
      expect(
        taxableSocialSecurity({ ...scenario, ordinaryIncome: cap }),
      ).toBeCloseTo(0.85 * SS, 1);
      expect(
        taxableSocialSecurity({ ...scenario, ordinaryIncome: cap - 100 }),
      ).toBeLessThan(0.85 * SS - 1);
    });

    it('gives each filing status its own end of the torpedo', () => {
      const at = (filingStatus: FilingStatus): number =>
        otherIncomeAtTaxableSSCap({ ssBenefit: SS, filingStatus });
      // Joint bases are $8,000 and $10,000 higher, so the hump ends later.
      expect(at('mfj')).toBeCloseTo(48_797.18, 1);
      expect(at('hoh')).toBeCloseTo(at('single'), 6);
      // $0/$0 bases: half the benefit alone is provisional income enough, so
      // the whole torpedo is over by the time the benefit itself is matched.
      expect(at('mfs')).toBeCloseTo(0.5 * SS, 1);
    });

    it('has nothing to find when there is no benefit', () => {
      expect(otherIncomeAtTaxableSSCap({ ssBenefit: 0 })).toBe(0);
      // Nor when the cap already binds at no other income at all.
      expect(
        otherIncomeAtTaxableSSCap({
          ssBenefit: SS,
          filingStatus: 'mfs',
          muniInterest: 30_000,
        }),
      ).toBe(0);
    });

    it('moves with everything else in provisional income', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const };
      const plain = otherIncomeAtTaxableSSCap(base);
      // Tax-exempt interest is provisional income, so it does the dragging
      // that other income would have done: the hump ends that much earlier.
      expect(otherIncomeAtTaxableSSCap({ ...base, muniInterest: 5_000 })).toBeCloseTo(
        plain - 5_000,
        1,
      );
      // A charitable distribution never reaches provisional income at all, so
      // it takes that much more income to finish the job.
      expect(otherIncomeAtTaxableSSCap({ ...base, qcd: 5_000 })).toBeCloseTo(
        plain + 5_000,
        1,
      );
    });
  });

  describe('otherIncomeAtAgi', () => {
    it('inverts AGI onto the chart’s own axis', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const };
      const income = otherIncomeAtAgi(175_000, scenario);
      expect(agiFor({ ...scenario, ordinaryIncome: income })).toBeCloseTo(175_000, 1);
      // Less other income than the AGI figure names, because $20,155.20 of
      // benefit is in AGI by then and got there first.
      expect(income).toBeCloseTo(175_000 - 0.85 * SS, 1);
    });

    it('returns nothing to travel when AGI starts past the target', () => {
      // It solves on the chart's axis, so whatever `ordinaryIncome` the
      // scenario carries is swept away — what can put AGI past a small target
      // with no other income at all is tax-exempt interest, which drags
      // benefits into AGI without ever landing there itself.
      expect(
        otherIncomeAtAgi(10_000, { ssBenefit: SS, muniInterest: 40_000 }),
      ).toBe(0);
      expect(otherIncomeAtAgi(1_000, { ssBenefit: SS, ordinaryIncome: 90_000 })).toBe(
        1_000,
      );
    });

    it('makes room for a gift that never enters AGI', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const };
      expect(otherIncomeAtAgi(175_000, { ...base, qcd: 20_000 })).toBeCloseTo(
        otherIncomeAtAgi(175_000, base) + 20_000,
        1,
      );
    });
  });

  describe('incomeAxisFeatures', () => {
    it('reports the second hump only when there is one to phase out', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      // Under 65: nothing to phase out, so nothing to make room for.
      expect(incomeAxisFeatures(base).seniorPhaseoutEnd).toBeNull();
      expect(incomeAxisFeatures({ ...base, seniors: 1 }).seniorPhaseoutEnd).toBeCloseTo(
        154_844.8,
        1,
      );
      // A separate return is barred from the deduction outright by
      // 151(d)(5)(C)(v), age or no age.
      expect(
        incomeAxisFeatures({ ...base, filingStatus: 'mfs', seniors: 1 })
          .seniorPhaseoutEnd,
      ).toBeNull();
    });

    it('puts a joint return’s phaseout $75,000 further out', () => {
      const features = incomeAxisFeatures({
        ssBenefit: SS,
        filingStatus: 'mfj',
        seniors: 2,
        year: PINNED_YEAR,
      });
      expect(features.torpedoEnd).toBeCloseTo(48_797.18, 1);
      expect(features.seniorPhaseoutEnd).toBeCloseTo(229_844.8, 1);
    });

    it('counts one qualifying spouse the same as two', () => {
      const base = { ssBenefit: SS, filingStatus: 'mfj' as const, year: PINNED_YEAR };
      // Each person's own $6,000 phases out at 6% of the same excess, so the
      // couple's $12,000 runs out exactly where one spouse's $6,000 would.
      expect(incomeAxisFeatures({ ...base, seniors: 1 }).seniorPhaseoutEnd).toBeCloseTo(
        incomeAxisFeatures({ ...base, seniors: 2 }).seniorPhaseoutEnd ?? 0,
        6,
      );
    });

    /**
     * The gift's own far side. Left of it every ordinary dollar is given away;
     * right of it the return starts again from zero.
     */
    it('reports where a charitable gift stops covering the income', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      expect(incomeAxisFeatures(base).giftEnd).toBe(0);
      expect(incomeAxisFeatures({ ...base, qcd: 40_000 }).giftEnd).toBe(40_000);
      // 408(d)(8)(A) caps it, so asking for more moves nothing.
      expect(incomeAxisFeatures({ ...base, qcd: 500_000 }).giftEnd).toBe(
        qcdLimitFor(base),
      );
      // Twice the cap on a joint return, which is the whole reason the axis
      // had to learn about the gift at all.
      expect(
        incomeAxisFeatures({ ...base, filingStatus: 'mfj', qcd: 500_000 }).giftEnd,
      ).toBe(2 * qcdLimitFor(base));
    });

    /**
     * A gain is a sale, not a distribution, so it is income the gift cannot be
     * excluded from — and the chart reads the gain as a share *of* the swept
     * income. Both together put the last excludable dollar that much further
     * along the axis.
     */
    it('pushes the gift’s far side out past the gain inside the income', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      expect(incomeAxisFeatures({ ...base, qcd: 40_000, ltcg: 25_000 }).giftEnd).toBe(
        65_000,
      );
      // No gift, no far side, however big the gain.
      expect(incomeAxisFeatures({ ...base, ltcg: 25_000 }).giftEnd).toBe(0);
    });
  });

  describe('incomeAxisMax', () => {
    it('leaves the axis where it was for a filer under 65', () => {
      for (const filingStatus of ['single', 'mfj', 'mfs', 'hoh'] as FilingStatus[]) {
        expect(
          incomeAxisMax({ ssBenefit: SS, filingStatus, year: PINNED_YEAR }),
        ).toBe(MIN_INCOME_AXIS);
      }
    });

    it('widens it to fit the senior deduction phaseout', () => {
      // $154,844.8 of other income plus 5% of tail, rounded up to a figure the
      // tick labels can live with.
      expect(
        incomeAxisMax({ ssBenefit: SS, filingStatus: 'single', seniors: 1, year: PINNED_YEAR }),
      ).toBe(175_000);
      expect(
        incomeAxisMax({ ssBenefit: SS, filingStatus: 'mfj', seniors: 2, year: PINNED_YEAR }),
      ).toBe(250_000);
    });

    /**
     * The whole point of deriving the axis: whatever the return, if there is a
     * phaseout on the curve then its far side is on the chart. This is what a
     * constant could not do.
     */
    it('always contains the phaseout it is drawn for', () => {
      for (const year of TAX_YEARS) {
        for (const filingStatus of ['single', 'mfj', 'mfs', 'hoh'] as FilingStatus[]) {
          for (const seniors of [1, 2]) {
            for (const muniInterest of [0, 20_000]) {
              for (const qcd of [0, 30_000]) {
                const scenario = {
                  ssBenefit: avgAnnualSSBenefit(year),
                  filingStatus,
                  seniors,
                  muniInterest,
                  qcd,
                  year,
                };
                const { seniorPhaseoutEnd } = incomeAxisFeatures(scenario);
                if (seniorPhaseoutEnd === null) continue;
                expect(incomeAxisMax(scenario)).toBeGreaterThan(seniorPhaseoutEnd);
              }
            }
          }
        }
      }
    });

    /**
     * The gift is the second thing the reader sets in dollars of this axis,
     * and 408(d)(8)(A) lets a joint return set $216,000 of them. Sizing the
     * axis by the torpedo alone was not enough: the same gift pushes the
     * torpedo right dollar for dollar, so it usually carries the gift along
     * with it — but a return with no benefit has no torpedo to push, and the
     * gift would have run off a $150,000 chart with nothing to widen it.
     */
    it('widens to fit a gift that outruns the chart', () => {
      const limit = qcdLimitFor({ filingStatus: 'mfj', year: PINNED_YEAR });
      expect(limit).toBe(216_000);
      const scenario = {
        ssBenefit: 0,
        filingStatus: 'mfj' as const,
        qcd: limit,
        year: PINNED_YEAR,
      };
      // Without the gift there is nothing on this curve at all, so the axis
      // sits at its floor; the gift alone takes it out past $216,000.
      expect(incomeAxisMax({ ...scenario, qcd: 0 })).toBe(MIN_INCOME_AXIS);
      expect(incomeAxisMax(scenario)).toBe(250_000);
    });

    it('always contains the gift it is drawn for', () => {
      for (const year of TAX_YEARS) {
        for (const filingStatus of ['single', 'mfj', 'mfs', 'hoh'] as FilingStatus[]) {
          for (const ssBenefit of [0, avgAnnualSSBenefit(year)]) {
            for (const seniors of [0, 1, 2]) {
              for (const muniInterest of [0, 40_000]) {
                const scenario = {
                  ssBenefit,
                  filingStatus,
                  seniors,
                  muniInterest,
                  qcd: 500_000,
                  year,
                };
                expect(incomeAxisMax(scenario)).toBeGreaterThan(
                  qcdLimitFor({ filingStatus, year }),
                );
              }
            }
          }
        }
      }
    });

    it('never narrows below the constant it replaced, and lands on a round figure', () => {
      for (const seniors of [0, 1, 2]) {
        for (const muniInterest of [0, 40_000]) {
          const max = incomeAxisMax({
            ssBenefit: MAX_ANNUAL_SS_BENEFIT,
            filingStatus: 'mfj',
            seniors,
            muniInterest,
            year: PINNED_YEAR,
          });
          expect(max).toBeGreaterThanOrEqual(MIN_INCOME_AXIS);
          expect(max % 25_000).toBe(0);
        }
      }
    });

    it('takes a floor from the caller, for the point the reader is standing on', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      // Rounded up like everything else, so a reader parked at $160,000 gets a
      // $175,000 axis rather than one that ends under their own marker.
      expect(incomeAxisMax(scenario, { minimum: 160_000 })).toBe(175_000);
      // The floor is a default, not a law: a caller that wants the frame drawn
      // tight around the curve can ask for one, and gets the torpedo's own
      // $40,561.88 plus a tail, rounded up.
      expect(incomeAxisMax(scenario, { minimum: 0 })).toBe(50_000);
    });
  });
});

/**
 * IRC 1411 — the 3.8% net investment income tax.
 *
 * The third stacking effect on the same axis as the other two, and the third
 * frozen threshold on a page built around frozen thresholds. Every figure here
 * is the statute: 3.8% under 1411(a)(1), $200,000/$250,000/$125,000 under
 * 1411(b), the lesser-of rule under 1411(a)(1)(A)-(B), and the IRA and wage
 * exclusions of 1411(c)(5) and (c)(1).
 */
describe('net investment income tax (IRC 1411)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  const YEAR = { year: PINNED_YEAR };

  describe('the thresholds', () => {
    it('is 3.8% over $200,000 unmarried, $250,000 joint, $125,000 separate', () => {
      expect(NIIT_RATE).toBe(0.038);
      expect(NIIT_THRESHOLDS).toEqual({
        single: 200_000,
        mfj: 250_000,
        mfs: 125_000,
        hoh: 200_000,
      });
      // Head of household files on the unmarried figure, as it does under
      // 86(c) — the two statutes agree about that much.
      expect(niitThreshold('hoh')).toBe(niitThreshold('single'));
      // And the separate return gets half the joint one, the same halving
      // 86(c)(1)(C) does to a filer who lived with their spouse.
      expect(niitThreshold('mfs')).toBe(niitThreshold('mfj') / 2);
    });

    /**
     * The point of the bullet this came from: 1411(b) provides no inflation
     * adjustment, so the same figures apply in every year this app prices.
     */
    it('does not move between tax years, because 1411(b) never indexed it', () => {
      const scenario = { ordinaryIncome: 190_000, ltcg: 30_000 };
      for (const year of TAX_YEARS) {
        expect(niitFor({ ...scenario, year }).threshold).toBe(200_000);
        expect(niitFor({ ...scenario, year }).tax).toBeCloseTo(760, 6);
      }
      // Enacted in 2010, effective for tax years beginning after 2012.
      expect(NIIT_ENACTED).toBe(2013);
      expect(NIIT_ENACTED).toBeGreaterThan(SS_BASE85_ENACTED);
    });
  });

  describe('what counts as net investment income', () => {
    it('counts the capital gain and nothing else this app models', () => {
      expect(netInvestmentIncomeFor({ ltcg: 30_000 })).toBe(30_000);
      // An IRA or pension distribution is excluded by name under 1411(c)(5),
      // and wages are outside 1411(c)(1) altogether.
      expect(netInvestmentIncomeFor({ ordinaryIncome: 300_000 })).toBe(0);
      // A Social Security benefit is in no 1411(c)(1) category, taxable share
      // or not.
      expect(netInvestmentIncomeFor({ ssBenefit: MAX_ANNUAL_SS_BENEFIT })).toBe(0);
      // 1411(c)(1)(A)(i) reaches interest only to the extent it is in gross
      // income, and 103 keeps this out of gross income entirely.
      expect(netInvestmentIncomeFor({ muniInterest: 100_000 })).toBe(0);
    });

    /**
     * A return with no investment income has nothing for 1411 to charge, at
     * any income at all. This is the branch the page's default scenario takes.
     */
    it('charges nothing on a return with no gain, however high the income', () => {
      const huge = { ordinaryIncome: 2_000_000, ssBenefit: SS, ...YEAR };
      expect(niitFor(huge).tax).toBe(0);
      expect(netInvestmentIncomeTax(huge)).toBe(0);
      expect(totalFederalTax(huge)).toBe(totalTax(huge));
      // Nothing to be short of, so there is no headroom to report either.
      expect(niitFor(huge).headroom).toBeNull();
      expect(niitFor(huge).toFullyTaxed).toBeNull();
    });
  });

  describe('the MAGI it is measured against', () => {
    /**
     * Three MAGIs on this page, and this is the plainest of them: 1411(d) is
     * AGI plus the section 911 exclusion, which no scenario here has.
     */
    it('is plain AGI, not the one Medicare adds tax-exempt interest back to', () => {
      const scenario = {
        ordinaryIncome: 190_000,
        ltcg: 30_000,
        muniInterest: 25_000,
        ...YEAR,
      };
      expect(niitMagi(scenario)).toBe(agiFor(scenario));
      expect(niitMagi(scenario)).toBe(220_000);
      // Medicare's MAGI is $25,000 higher on the same return.
      expect(irmaaMagi(scenario)).toBe(245_000);
      expect(irmaaMagi(scenario) - niitMagi(scenario)).toBe(25_000);
    });

    /**
     * The one input on this page that moves the torpedo, moves Medicare, and
     * leaves 1411 completely alone.
     */
    it('is untouched by tax-exempt interest except through the benefits it drags in', () => {
      const without = { ordinaryIncome: 190_000, ltcg: 30_000, ...YEAR };
      const with25k = { ...without, muniInterest: 25_000 };
      expect(niitFor(with25k).magi).toBe(niitFor(without).magi);
      expect(niitFor(with25k).tax).toBeCloseTo(niitFor(without).tax, 6);

      // With a benefit in play it does move it — but only by the benefit it
      // pulls into AGI, never by a dollar of its own.
      const benefit = { ordinaryIncome: 190_000, ltcg: 30_000, ssBenefit: SS, ...YEAR };
      const shifted = niitMagi({ ...benefit, muniInterest: 25_000 }) - niitMagi(benefit);
      expect(shifted).toBeGreaterThanOrEqual(0);
      expect(shifted).toBeLessThan(25_000);
      expect(shifted).toBeCloseTo(
        taxableSocialSecurity({ ...benefit, muniInterest: 25_000 }) -
          taxableSocialSecurity(benefit),
        6,
      );
    });
  });

  describe('the lesser-of rule, which is what makes it stack', () => {
    const gain = 40_000;
    const at = (ordinary: number) => ({
      ordinaryIncome: ordinary,
      ltcg: gain,
      filingStatus: 'single' as const,
      ...YEAR,
    });

    it('charges nothing under the threshold', () => {
      const under = niitFor(at(150_000));
      expect(under.magi).toBe(190_000);
      expect(under.excess).toBe(0);
      expect(under.base).toBe(0);
      expect(under.tax).toBe(0);
      expect(under.headroom).toBe(10_000);
      expect(under.toFullyTaxed).toBe(gain);
    });

    it('charges the excess while the excess is the smaller of the two', () => {
      const straddling = niitFor(at(175_000));
      expect(straddling.magi).toBe(215_000);
      expect(straddling.excess).toBe(15_000);
      expect(straddling.nii).toBe(gain);
      expect(straddling.base).toBe(15_000);
      expect(straddling.tax).toBeCloseTo(0.038 * 15_000, 6);
      expect(straddling.headroom).toBe(0);
      expect(straddling.toFullyTaxed).toBe(25_000);
    });

    it('stops at the whole gain once the excess passes it', () => {
      const past = niitFor(at(250_000));
      expect(past.excess).toBe(90_000);
      expect(past.base).toBe(gain);
      expect(past.tax).toBeCloseTo(0.038 * gain, 6);
      expect(past.toFullyTaxed).toBe(0);
    });

    /**
     * The sentence the whole bullet is about. Every dollar in this band is an
     * IRA distribution 1411(c)(5) excludes by name — and every one of them
     * still costs 3.8 cents, because it drags a dollar of an already-realized
     * gain into the base.
     */
    it('makes a distribution 1411 never taxes cost 3.8% anyway', () => {
      const before = niitFor(at(175_000));
      const after = niitFor(at(176_000));
      expect(netInvestmentIncomeFor(at(176_000))).toBe(gain);
      expect(after.nii).toBe(before.nii);
      expect(after.base - before.base).toBe(1_000);
      expect(after.tax - before.tax).toBeCloseTo(38, 6);
    });
  });

  describe('totalFederalTax', () => {
    const scenario = {
      ordinaryIncome: 180_000,
      ltcg: 60_000,
      ssBenefit: SS,
      filingStatus: 'single' as const,
      ...YEAR,
    };

    /**
     * Chapter 1 and chapter 2A stay separate functions, because they are
     * separate lines on a 1040 — the income tax line and Schedule 2's other
     * taxes, off Form 8960.
     */
    it('is chapter 1 plus chapter 2A, and totalTax is still chapter 1 alone', () => {
      const surtax = netInvestmentIncomeTax(scenario);
      expect(surtax).toBeCloseTo(0.038 * 60_000, 6);
      expect(totalFederalTax(scenario)).toBeCloseTo(totalTax(scenario) + surtax, 6);
      // The benefit of keeping them apart: `totalTax` did not move, so nothing
      // that means "income tax" silently started meaning something else.
      expect(totalTax(scenario)).toBeCloseTo(46_104.248, 3);
      expect(totalFederalTax(scenario)).toBeCloseTo(48_384.248, 3);
    });

    it('does not include the Medicare surcharge, which is a premium', () => {
      const magi = irmaaMagi(scenario);
      expect(irmaaFor(magi, scenario).annualSurcharge).toBeGreaterThan(0);
      expect(totalFederalTax(scenario)).toBeCloseTo(totalTax(scenario) + 2_280, 3);
    });
  });

  describe('on the charts', () => {
    /**
     * The third hump. Between the threshold and the threshold plus the gain,
     * the next dollar of ordinary income costs its bracket rate plus 3.8 —
     * and then the rate falls back, exactly like the torpedo does.
     */
    it('raises the ordinary-income curve by 3.8 points over a band as wide as the gain', () => {
      const curve = marginalRateCurve(
        { ssBenefit: 0, ltcg: 20_000, filingStatus: 'single', ...YEAR },
        { maxIncome: 260_000, step: 1_000, gainsWithinIncome: true },
      );
      const rateAt = (income: number): number =>
        curve.find((p) => p.income === income)!.marginalRate;
      expect(rateAt(199_000)).toBe(24);
      expect(rateAt(200_000)).toBe(27.8);
      expect(rateAt(219_000)).toBe(27.8);
      // $200,000 + the $20,000 gain: the whole gain is in the base, so the
      // next dollar stops adding to it.
      expect(rateAt(220_000)).toBe(24);

      // And the tax the curve reports is the whole bill, not chapter 1.
      const point = curve.find((p) => p.income === 210_000)!;
      const scenario = {
        ...splitOtherIncome(210_000, 20_000),
        ssBenefit: 0,
        filingStatus: 'single' as const,
        ...YEAR,
      };
      expect(point.totalTax).toBe(Math.round(totalFederalTax(scenario)));
      expect(point.totalTax).toBeGreaterThan(Math.round(totalTax(scenario)));
    });

    /**
     * From the other side: a gain dollar past the threshold is both net
     * investment income and MAGI, so it enters the base from both ends and
     * pays 3.8 on top of its own 15%.
     */
    it('raises the gains curve by 3.8 points on top of the capital-gain rate', () => {
      const curve = ltcgMarginalRateCurve(
        { ssBenefit: 0, ordinaryIncome: 260_000, filingStatus: 'single', ...YEAR },
        { maxLTCG: 40_000, step: 5_000, gainsWithinIncome: true },
      );
      // MAGI is $260,000 all the way across — the sweep only moves the split —
      // so every gain dollar on this axis is inside the surtax base.
      for (const point of curve) {
        expect(point.marginalRate).toBeCloseTo(18.8, 6);
      }
      // Under the threshold there is no surtax to add, and the same sweep is
      // the bare 15%.
      const below = ltcgMarginalRateCurve(
        { ssBenefit: 0, ordinaryIncome: 150_000, filingStatus: 'single', ...YEAR },
        { maxLTCG: 40_000, step: 5_000, gainsWithinIncome: true },
      );
      for (const point of below) {
        expect(point.marginalRate).toBeCloseTo(15, 6);
      }
    });

    /**
     * The reason `niitEnd` had to become an axis feature: the threshold sits
     * $50,000 past the axis this chart used to be fixed at, so the surtax was
     * drawn nowhere.
     */
    it('widens the income axis to reach the band, and only when there is a gain', () => {
      const noGain = { ssBenefit: SS, filingStatus: 'single' as const, ...YEAR };
      expect(incomeAxisFeatures(noGain).niitEnd).toBeNull();
      expect(incomeAxisMax(noGain)).toBe(MIN_INCOME_AXIS);

      const withGain = { ...noGain, ltcg: 60_000 };
      const { niitEnd } = incomeAxisFeatures(withGain);
      expect(niitEnd).not.toBeNull();
      // $200,000 + $60,000 of MAGI, less the benefit already dragged into AGI
      // by that much other income — so it lands at less other income than the
      // raw MAGI figure suggests.
      expect(niitEnd!).toBeCloseTo(239_844.8, 1);
      expect(niitEnd!).toBeLessThan(260_000);
      expect(agiFor({ ...withGain, ...splitOtherIncome(niitEnd!, 60_000) })).toBeCloseTo(
        260_000,
        4,
      );
      expect(incomeAxisMax(withGain)).toBe(275_000);
      expect(incomeAxisMax(withGain)).toBeGreaterThan(niitEnd!);
    });
  });

  /**
   * A conversion is ordinary income and so is never itself net investment
   * income — which is exactly why sizing one has to price the surtax: the
   * conversion pushes MAGI up and drags somebody's old gain in behind it.
   */
  describe('sizing a conversion against it', () => {
    const scenario = {
      ordinaryIncome: 150_000,
      ltcg: 60_000,
      ssBenefit: 0,
      filingStatus: 'single' as const,
      ...YEAR,
    };

    it('prices the surtax into the bill a conversion starts from', () => {
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'irmaa1')!;
      const sizing = sizeConversion(ceiling, scenario);
      expect(sizing.taxBefore).toBe(Math.round(totalFederalTax(scenario)));
      expect(sizing.taxBefore - Math.round(totalTax(scenario))).toBe(380);
      // MAGI is $210,000, so $10,000 of the $60,000 gain is already surtaxed.
      expect(niitFor(scenario).base).toBe(10_000);
    });

    it('reports the 3.8 points in the rate just past the ceiling', () => {
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'bracket22')!;
      expect(sizeConversion(ceiling, scenario).rateAboveCeiling).toBeCloseTo(27.8, 6);
    });
  });
});

/**
 * The second true cliff on this page, and the one that bites before 65.
 *
 * Every figure here is a 2026 one, because 2026 is the first year since 2020
 * that has a cliff at all — ARPA section 9661, extended through 2025 by the
 * Inflation Reduction Act, took the 400% ceiling out of 36B(c)(1)(A) and let
 * the credit taper past it instead. `PINNED_YEAR` is 2025, so any assertion
 * below that omits a year is asserting on the *absence* of the cliff, which is
 * a case worth having tests for rather than an oversight.
 */
describe('the premium tax credit’s 400% cliff (IRC 36B)', () => {
  const CLIFF_YEAR: TaxYear = 2026;
  const Y26 = { year: CLIFF_YEAR };
  /** The 2026 average benefit, $24,852 — not `AVG_ANNUAL_SS_BENEFIT`, which is 2025's. */
  const SS = TAX_YEAR_PARAMS[CLIFF_YEAR].avgAnnualSSBenefit;
  /** 400% of the one-person line: 4 × $15,650. */
  const CLIFF = 62_600;

  describe('the poverty line it is measured against', () => {
    /**
     * 26 CFR 1.36B-1(h) fixes the guidelines at the ones in effect when the
     * regular enrolment period opened, which is the previous 1 November — so
     * the figure is a year old before the coverage year starts.
     */
    it('prices a coverage year off the guidelines published the January before', () => {
      expect(FPL_GUIDELINE_LOOKBACK_YEARS).toBe(1);
      expect(fplGuidelineYear(2026)).toBe(2025);
      expect(fplGuidelineYear(2025)).toBe(2024);
      expect(ptcParams(2026).guidelineYear).toBe(2025);
      // Medicare looks back two, and for the same reason at twice the distance.
      expect(FPL_GUIDELINE_LOOKBACK_YEARS).toBeLessThan(IRMAA_LOOKBACK_YEARS);
      expect(fplGuidelineYear()).toBe(PINNED_YEAR - 1);
    });

    it('is the HHS table for the contiguous states: a first person plus an increment', () => {
      // 2025 guidelines, 90 Fed. Reg. 5917, which price 2026 coverage.
      expect(povertyLine(1, 2026)).toBe(15_650);
      expect(povertyLine(2, 2026)).toBe(21_150);
      expect(povertyLine(4, 2026)).toBe(32_150);
      expect(povertyLine(8, 2026)).toBe(54_150);
      // 2024 guidelines, which priced 2025 coverage.
      expect(povertyLine(1, 2025)).toBe(15_060);
      expect(povertyLine(2, 2025)).toBe(20_440);
      expect(povertyLine(4, 2025)).toBe(31_200);
      // The published table is linear past the first person, so the increment
      // is not an approximation of it — it is the rest of it.
      for (const year of TAX_YEARS) {
        const { perAdditionalPerson } = FPL_YEAR_PARAMS[year];
        expect(povertyLine(5, year) - povertyLine(4, year)).toBe(perAdditionalPerson);
      }
    });

    it('never sizes a household below one person', () => {
      expect(povertyLine(0, CLIFF_YEAR)).toBe(povertyLine(1, CLIFF_YEAR));
      expect(povertyLine(-3, CLIFF_YEAR)).toBe(povertyLine(1, CLIFF_YEAR));
    });

    /**
     * The tax code sizes its own figures by filing status; 36B sizes its line
     * by head count. This is the one place on the page where a fifth person
     * moves a line, which is why `householdSize` exists at all.
     */
    it('sizes the household from the filing status until the reader says otherwise', () => {
      expect(defaultHouseholdSize('single')).toBe(1);
      expect(defaultHouseholdSize('mfs')).toBe(1);
      expect(defaultHouseholdSize('mfj')).toBe(2);
      // Head of household requires a qualifying person, so it is never one.
      expect(defaultHouseholdSize('hoh')).toBe(2);
      expect(resolveScenario({}).householdSize).toBe(1);
      expect(resolveScenario({ filingStatus: 'mfj' }).householdSize).toBe(2);
      expect(resolveScenario({ householdSize: 4 }).householdSize).toBe(4);
      expect(povertyLineFor({ householdSize: 4, ...Y26 })).toBe(32_150);
    });
  });

  describe('household income under 36B(d)(2)(B)', () => {
    /** The clause that undoes this page's own subject. */
    it('adds the untaxed part of the benefit back, so the whole benefit counts', () => {
      const scenario = { ordinaryIncome: 20_000, ssBenefit: SS, ...Y26 };
      const taxable = taxableSocialSecurity(scenario);
      // A point on the hump, not past it: part of the benefit is still out.
      expect(taxable).toBeGreaterThan(0);
      expect(taxable).toBeLessThan(0.85 * SS);
      expect(acaMagi(scenario)).toBeCloseTo(20_000 + SS, 6);
      expect(acaMagi(scenario) - agiFor(scenario)).toBeCloseTo(SS - taxable, 6);
    });

    it('is Medicare’s MAGI plus that untaxed part, on the same return', () => {
      const scenario = {
        ordinaryIncome: 20_000,
        ssBenefit: SS,
        muniInterest: 8_000,
        ...Y26,
      };
      const untaxed = SS - taxableSocialSecurity(scenario);
      expect(untaxed).toBeGreaterThan(0);
      expect(acaMagi(scenario) - irmaaMagi(scenario)).toBeCloseTo(untaxed, 6);
      // Three MAGIs, widest first: 36B, Medicare's, then 1411's plain AGI.
      expect(irmaaMagi(scenario) - niitMagi(scenario)).toBeCloseTo(8_000, 6);
    });

    /**
     * The consequence the page's prose is built on: because the whole benefit
     * is already in, no dollar of other income can drag any more of it in.
     */
    it('rises a flat dollar per dollar of other income, where Medicare’s rises up to $1.85', () => {
      const at = (income: number) => ({ ordinaryIncome: income, ssBenefit: SS, ...Y26 });
      const slopes = [];
      for (let income = 0; income <= 60_000; income += 1_000) {
        slopes.push({
          aca: acaMagi(at(income + 1)) - acaMagi(at(income)),
          irmaa: irmaaMagi(at(income + 1)) - irmaaMagi(at(income)),
        });
      }
      for (const { aca } of slopes) expect(aca).toBeCloseTo(1, 6);
      expect(Math.max(...slopes.map((s) => s.irmaa))).toBeCloseTo(1.85, 6);
      expect(Math.min(...slopes.map((s) => s.irmaa))).toBeCloseTo(1, 6);
    });

    /**
     * Not a coincidence worth hiding: 36B household income and the "total
     * income" the close already quotes are the same arithmetic, because both
     * mean everything the return took in. A reader who has read one figure has
     * read the other.
     */
    it('is the total income this page already states, on every scenario it can build', () => {
      const scenarios = [
        { ordinaryIncome: 0, ssBenefit: SS },
        { ordinaryIncome: 40_000, ssBenefit: SS, muniInterest: 9_000 },
        { ordinaryIncome: 90_000, ssBenefit: SS, ltcg: 30_000, qcd: 7_000 },
        { ordinaryIncome: 120_000, ssBenefit: 0, filingStatus: 'mfj' as const },
      ];
      for (const scenario of scenarios) {
        const full = { ...scenario, ...Y26 };
        expect(acaMagi(full)).toBeCloseTo(totalIncomeFor(full), 6);
      }
    });

    /**
     * The correction this bullet's first draft got wrong: a QCD is out of
     * gross income before AGI is struck, so it comes off all three MAGIs. What
     * differs is by how much — this one falls by the gift and no more, because
     * the benefit it un-taxes was already counted here in full.
     */
    it('comes down by the gift alone, where the AGI-based MAGIs come down by more', () => {
      const base = { ordinaryIncome: 25_000, ssBenefit: SS, ...Y26 };
      const given = { ...base, qcd: 8_000 };
      expect(acaMagi(base) - acaMagi(given)).toBeCloseTo(8_000, 6);
      // The gift also drops provisional income, which un-taxes benefit on the
      // way — so AGI falls by the gift *plus* that.
      const untaxed = taxableSocialSecurity(base) - taxableSocialSecurity(given);
      expect(untaxed).toBeGreaterThan(0);
      expect(niitMagi(base) - niitMagi(given)).toBeCloseTo(8_000 + untaxed, 6);
      expect(irmaaMagi(base) - irmaaMagi(given)).toBeCloseTo(8_000 + untaxed, 6);
    });
  });

  describe('the cliff itself', () => {
    it('is 400% of the line, and the dollar past it is the one that costs', () => {
      expect(PTC_CLIFF_PERCENT).toBe(4);
      expect(ptcCliffMagi(Y26)).toBe(CLIFF);
      expect(ptcCliffMagi({ filingStatus: 'mfj', ...Y26 })).toBe(84_600);
      // 36B(c)(1)(A) reads "not more than 400 percent", so the line itself is
      // still inside the table.
      expect(ptcFor(CLIFF, Y26).overCliff).toBe(false);
      expect(ptcFor(CLIFF, Y26).headroom).toBe(0);
      expect(ptcFor(CLIFF + 1, Y26).overCliff).toBe(true);
      expect(ptcFor(CLIFF + 1, Y26).headroom).toBe(0);
      expect(ptcFor(50_000, Y26).headroom).toBe(12_600);
      expect(ptcFor(CLIFF, Y26).fplMultiple).toBeCloseTo(4, 6);
      expect(fplMultipleOf(31_300, Y26)).toBeCloseTo(2, 6);
    });

    /**
     * The reason `FPL_YEAR_PARAMS` carries a flag rather than assuming a
     * cliff: on a 2025 return this line does not exist.
     */
    it('did not exist from 2021 through 2025, and returns in 2026', () => {
      expect(FPL_YEAR_PARAMS[2025].cliff).toBe(false);
      expect(FPL_YEAR_PARAMS[2026].cliff).toBe(true);
      expect(ptcCliffMagi({ year: 2025 })).toBeNull();
      expect(ptcCliff({ year: 2025 })).toBeNull();

      const flat = ptcFor(400_000, { year: 2025 });
      expect(flat.cliffApplies).toBe(false);
      expect(flat.cliffMagi).toBeNull();
      expect(flat.overCliff).toBe(false);
      expect(flat.headroom).toBeNull();
      // The poverty line still exists in a year with no cliff drawn on it, so
      // the multiple is still reported.
      expect(flat.povertyLine).toBe(15_060);
      expect(flat.fplMultiple).toBeCloseTo(400_000 / 15_060, 6);
    });

    it('quotes what the household pays under the line, not what it loses over it', () => {
      const cliff = ptcCliff(Y26)!;
      // Rev. Proc. 2025-25 section 3.01, last row: 300% to 400% pays 9.96%.
      expect(cliff.topApplicablePercentage).toBe(0.0996);
      expect(cliff.cappedContribution).toBeCloseTo(0.0996 * CLIFF, 2);
      expect(cliff.cappedContribution).toBe(6_234.96);
      expect(cliff.povertyLine).toBe(15_650);
      expect(cliff.magi).toBe(CLIFF);
    });

    it('sizes the line for the household, not for the filing status', () => {
      expect(ptcCliff(Y26)!.householdSize).toBe(1);
      expect(ptcCliff({ filingStatus: 'hoh', ...Y26 })!.householdSize).toBe(2);

      const family = ptcCliff({ filingStatus: 'mfj', householdSize: 4, ...Y26 })!;
      expect(family.povertyLine).toBe(32_150);
      expect(family.magi).toBe(4 * 32_150);
      // Two dependents move the line by 400% of two increments, which is the
      // whole reason the field exists.
      expect(family.magi - ptcCliff({ filingStatus: 'mfj', ...Y26 })!.magi).toBe(
        PTC_CLIFF_PERCENT * 2 * FPL_YEAR_PARAMS[CLIFF_YEAR].perAdditionalPerson,
      );
    });
  });

  describe('where it lands on the other-income axis', () => {
    const base = { ssBenefit: SS, ...Y26 };

    it('inverts household income exactly, because household income is a straight line', () => {
      const cliff = ptcCliff(base)!;
      expect(cliff.otherIncome).toBeCloseTo(CLIFF - SS, 4);
      expect(cliff.otherIncome).toBeCloseTo(37_748, 4);
      expect(acaMagi({ ...base, ordinaryIncome: cliff.otherIncome })).toBeCloseTo(
        CLIFF,
        4,
      );
      for (const target of [30_000, CLIFF, 120_000]) {
        const income = otherIncomeAtAcaMagi(target, base);
        expect(acaMagi({ ...base, ordinaryIncome: income })).toBeCloseTo(target, 4);
      }
    });

    it('clamps to nothing when the benefit alone is already over the line', () => {
      const big = { ssBenefit: MAX_ANNUAL_SS_BENEFIT, muniInterest: 40_000, ...Y26 };
      expect(acaMagi(big)).toBeGreaterThan(CLIFF);
      expect(ptcCliff(big)!.otherIncome).toBe(0);
      expect(otherIncomeAtAcaMagi(CLIFF, big)).toBe(0);
    });

    it('is pushed right by the gift and left by the tax-exempt interest, dollar for dollar', () => {
      const plain = ptcCliff(base)!.otherIncome;
      expect(ptcCliff({ ...base, qcd: 5_000 })!.otherIncome - plain).toBeCloseTo(5_000, 4);
      expect(plain - ptcCliff({ ...base, muniInterest: 5_000 })!.otherIncome).toBeCloseTo(
        5_000,
        4,
      );
    });

    /**
     * What the explainer beside the chart claims, checked: the two cliffs
     * travel at different speeds, so neither can be read off the other.
     */
    it('moves left a full dollar per dollar of benefit, where Medicare’s move 85 cents', () => {
      const step = 1_000;
      const richer = { ...base, ssBenefit: SS + step };
      expect(ptcCliff(base)!.otherIncome - ptcCliff(richer)!.otherIncome).toBeCloseTo(
        step,
        4,
      );
      // 85 cents is all of an extra benefit dollar 86(a) can ever put in the
      // tax base, so 85 cents is all Medicare's MAGI can gain from it.
      const irmaaShift =
        irmaaCliffs(base)[0].otherIncome - irmaaCliffs(richer)[0].otherIncome;
      expect(irmaaShift).toBeCloseTo(0.85 * step, 4);
      expect(irmaaShift).toBeLessThan(step);
    });
  });

  describe('as a line a conversion can be sized against', () => {
    it('joins the ceilings in a year with a cliff and is absent from one without', () => {
      const ids = (year: TaxYear): ConversionCeilingId[] =>
        conversionCeilings({ year }).map((c) => c.id);
      expect(ids(2026)).toContain('fpl400');
      expect(ids(2025)).not.toContain('fpl400');
      // Every other ceiling is offered in both years, so this is the only id a
      // reader's pick can be retired by switching year.
      expect(ids(2025)).toEqual(ids(2026).filter((id) => id !== 'fpl400'));

      const ceiling = conversionCeilings(Y26).find((c) => c.id === 'fpl400')!;
      expect(ceiling.measure).toBe('acaMagi');
      expect(ceiling.amount).toBe(CLIFF);
      expect(CONVERSION_MEASURE_LABELS.acaMagi).toBe('household income (36B MAGI)');
    });

    it('measures the conversion against household income, benefit and all', () => {
      const scenario = { ordinaryIncome: 30_000, ssBenefit: SS, ...Y26 };
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'fpl400')!;
      // $62,600 less the $24,852 benefit less the $30,000 already there. The
      // headroom is exact rather than searched-for, because nothing about this
      // measure bends.
      expect(maxConversionUnder(ceiling, scenario)).toBe(7_748);
      expect(conversionMeasureValue('acaMagi', scenario, 7_748)).toBeCloseTo(CLIFF, 6);

      const sizing = sizeConversion(ceiling, scenario);
      expect(sizing.conversion).toBe(7_748);
      expect(sizing.alreadyOver).toBe(false);
      expect(sizing.unbounded).toBe(false);
      // What the dollar past the line costs in income tax is a bracket rate.
      // What it actually costs is a year of premium tax credit, which depends
      // on ages and county and so is nowhere in these figures.
      expect(sizing.rateAboveCeiling).toBeGreaterThan(0);
      expect(sizing.taxCost).toBeGreaterThan(0);
    });

    it('reports nothing fits once household income is already over the line', () => {
      const scenario = { ordinaryIncome: 80_000, ssBenefit: SS, ...Y26 };
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'fpl400')!;
      expect(acaMagi(scenario)).toBeGreaterThan(CLIFF);
      expect(maxConversionUnder(ceiling, scenario)).toBe(0);
      expect(sizeConversion(ceiling, scenario).alreadyOver).toBe(true);
    });
  });
});

import {
  federalIncomeTax,
  FilingStatus,
  ltcgMarginalRateCurve,
  marginalRateCurve,
  taxableSocialSecurity,
  totalTax,
  totalTaxWithLTCG,
  segmentCurve,
  conversionCeilings,
  conversionMeasureValue,
  maxConversionUnder,
  sizeConversion,
  IRMAA_TIER1_MAGI,
  FILING_PARAMS,
  LTCG_BRACKETS,
  AVG_ANNUAL_SS_BENEFIT,
  standardDeductionFor,
  maxSeniors,
  ADDITIONAL_STD_DEDUCTION_65,
  deductionFor,
  seniorDeductionFor,
  seniorDeductionPhaseoutEnd,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  MAX_ANNUAL_SS_BENEFIT,
} from './tax';
import type { ConversionCeiling, ConversionCeilingId } from './tax';

/**
 * Line-by-line reference implementation of IRS Pub 915 (2025), Worksheet 1
 * "Figuring Your Taxable Benefits", assuming no tax-exempt interest,
 * exclusions, or Schedule 1 adjustments (lines 4, 5, and 7 = 0).
 * See docs/irs-pub915-worksheet1-2025.md.
 */
function pub915Worksheet1(
  ssBenefit: number,
  otherIncome: number,
  filingStatus: FilingStatus = 'single',
): number {
  const line1 = ssBenefit; // box 5 of Forms SSA-1099/RRB-1099
  const line2 = 0.5 * line1;
  const line3 = otherIncome; // Form 1040 lines 1z, 2b, 3b, 4b, 5b, 7, 8
  const line6 = line2 + line3;
  const line8 = line6; // provisional income
  const line9 = filingStatus === 'single' ? 25_000 : 32_000; // base amount
  const line10 = Math.max(0, line8 - line9);
  if (line10 === 0) return 0; // none of the benefits are taxable
  // single: $34,000 - $25,000; MFJ: $44,000 - $32,000
  const line11 = filingStatus === 'single' ? 9_000 : 12_000;
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
    expect(taxableSocialSecurity(5_980, otherIncome)).toBe(2_990);
  });

  it('is zero with provisional income exactly at the $25,000 base amount', () => {
    expect(taxableSocialSecurity(10_000, 20_000)).toBe(0);
    expect(pub915Worksheet1(10_000, 20_000)).toBe(0);
  });

  it('phases in at 50 cents per dollar just above the base amount', () => {
    expect(taxableSocialSecurity(10_000, 20_002)).toBe(1);
    expect(pub915Worksheet1(10_000, 20_002)).toBe(1);
  });

  it('caps tier 1 at $4,500 with provisional income exactly at $34,000', () => {
    // line 10 = 9,000, line 12 = 0, line 14 = 4,500, line 15 = 4,500
    expect(taxableSocialSecurity(10_000, 29_000)).toBe(4_500);
    expect(pub915Worksheet1(10_000, 29_000)).toBe(4_500);
  });

  it('adds 85 cents per dollar above the $34,000 threshold', () => {
    expect(taxableSocialSecurity(10_000, 29_001)).toBeCloseTo(4_500.85, 8);
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
        const actual = taxableSocialSecurity(ss, income);
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
    expect(taxableSocialSecurity(10_000, 27_000, 'mfj')).toBe(0);
    expect(pub915Worksheet1(10_000, 27_000, 'mfj')).toBe(0);
  });

  it('phases in at 50 cents per dollar just above the base amount', () => {
    expect(taxableSocialSecurity(10_000, 27_002, 'mfj')).toBe(1);
    expect(pub915Worksheet1(10_000, 27_002, 'mfj')).toBe(1);
  });

  it('caps tier 1 at $6,000 with provisional income exactly at $44,000', () => {
    // line 10 = 12,000, line 12 = 0, line 14 = 6,000, line 15 = 6,000
    expect(taxableSocialSecurity(20_000, 34_000, 'mfj')).toBe(6_000);
    expect(pub915Worksheet1(20_000, 34_000, 'mfj')).toBe(6_000);
  });

  it('adds 85 cents per dollar above the $44,000 threshold', () => {
    expect(taxableSocialSecurity(20_000, 34_001, 'mfj')).toBeCloseTo(6_000.85, 8);
    expect(pub915Worksheet1(20_000, 34_001, 'mfj')).toBeCloseTo(6_000.85, 8);
  });

  it('caps at 85% of benefits', () => {
    expect(taxableSocialSecurity(10_000, 100_000, 'mfj')).toBe(8_500);
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
        const actual = taxableSocialSecurity(ss, income, 'mfj');
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
    expect(taxableSocialSecurity(30000, 5000)).toBe(0);
    expect(taxableSocialSecurity(50000, 0)).toBe(0);
  });

  it('includes 50% of the excess in the middle band', () => {
    // provisional = 20000 + 10000 = 30000, excess over 25000 is 5000
    expect(taxableSocialSecurity(20000, 20000)).toBe(2500);
  });

  it('never exceeds 50% of benefits in the middle band', () => {
    // provisional = 32000 + 1000 = 33000, half the excess (4000) > half of benefits (1000)
    expect(taxableSocialSecurity(2000, 32000)).toBe(1000);
  });

  it('includes 85% of the excess above the second threshold', () => {
    // provisional = 40000 + 20000 = 60000: 4500 + 0.85 * 26000 = 26600
    expect(taxableSocialSecurity(40000, 40000)).toBe(26600);
  });

  it('caps at 85% of benefits', () => {
    expect(taxableSocialSecurity(10000, 100000)).toBe(8500);
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
    expect(federalIncomeTax(20000, 'mfj')).toBe(2000); // all in the 10% bracket
    // 23850 * 0.10 + (96950 - 23850) * 0.12 + (100000 - 96950) * 0.22
    expect(federalIncomeTax(100000, 'mfj')).toBeCloseTo(11828, 2);
  });
});

describe('totalTax', () => {
  it('is zero when income is under the standard deduction', () => {
    expect(totalTax(15000, 0)).toBe(0);
  });

  it('taxes other income plus the taxable portion of benefits', () => {
    // taxable SS = 26600; taxable income = 40000 + 26600 - 15750 = 50850
    expect(totalTax(40000, 40000)).toBeCloseTo(federalIncomeTax(50850), 2);
  });

  it('applies the MFJ standard deduction and thresholds', () => {
    expect(totalTax(30000, 0, 'mfj')).toBe(0); // under the $31,500 deduction
    // taxable SS = 6000 + 0.85 * (60000 - 44000) = 19600;
    // taxable income = 40000 + 19600 - 31500 = 28100
    expect(totalTax(40000, 40000, 'mfj')).toBeCloseTo(
      federalIncomeTax(28100, 'mfj'),
      2,
    );
  });
});

describe('marginalRateCurve', () => {
  it('samples from zero to maxIncome inclusive', () => {
    const data = marginalRateCurve(0, 10000, 250);
    expect(data).toHaveLength(41);
    expect(data[0].income).toBe(0);
    expect(data[40].income).toBe(10000);
  });

  it('matches plain bracket rates with no benefits', () => {
    const data = marginalRateCurve(0, 100000, 250);
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    expect(at(0)).toBe(0); // under the standard deduction
    expect(at(20000)).toBe(10);
    expect(at(40000)).toBe(12);
    expect(at(80000)).toBe(22);
  });

  it('shows the 1.85x torpedo while benefits phase in, then reverts after the cap', () => {
    const data = marginalRateCurve(30000, 100000, 250);
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    // 85% band, 12% bracket: each extra dollar drags in $0.85 of benefits
    expect(at(40000)).toBeCloseTo(22.2, 1);
    // benefits fully taxed, back to the ordinary 22% rate
    expect(at(60000)).toBeCloseTo(22, 1);
  });

  it('hits 40.7% in the 22% bracket while benefits phase in', () => {
    const data = marginalRateCurve(45000, 100000, 250);
    const point = data.find((d) => d.income === 45000)!;
    expect(point.marginalRate).toBeCloseTo(40.7, 1);
  });

  it('uses MFJ deduction and brackets with no benefits', () => {
    const data = marginalRateCurve(0, 100000, 250, 'mfj');
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    expect(at(30000)).toBe(0); // under the $31,500 standard deduction
    expect(at(40000)).toBe(10);
    expect(at(80000)).toBe(12);
  });

  it('includes the total tax at each sampled income', () => {
    const data = marginalRateCurve(30000, 100000, 250);
    const at = (income: number) => data.find((d) => d.income === income)!;
    expect(at(0).totalTax).toBe(0);
    expect(at(40000).totalTax).toBe(Math.round(totalTax(40000, 30000)));
    expect(at(80000).totalTax).toBe(Math.round(totalTax(80000, 30000)));
  });

  it('reports total tax as non-decreasing in income', () => {
    const data = marginalRateCurve(30000, 100000, 250);
    for (let i = 1; i < data.length; i++) {
      expect(data[i].totalTax).toBeGreaterThanOrEqual(data[i - 1].totalTax);
    }
  });

  it('shows the MFJ torpedo phasing in later, then reverting after the cap', () => {
    const data = marginalRateCurve(30000, 100000, 250, 'mfj');
    const at = (income: number) =>
      data.find((d) => d.income === income)!.marginalRate;
    // 85% band (provisional 55,000 > 44,000), 12% bracket: 1.85 * 12%
    expect(at(40000)).toBeCloseTo(22.2, 1);
    // benefits fully taxed (cap hit near $51,941), back to the plain 12% rate
    expect(at(60000)).toBeCloseTo(12, 1);
  });
});

describe('totalTaxWithLTCG', () => {
  it('matches totalTax when LTCG is zero', () => {
    expect(totalTaxWithLTCG(40000, 30000, 0)).toBeCloseTo(totalTax(40000, 30000), 2);
    expect(totalTaxWithLTCG(40000, 30000, 0, 'mfj')).toBeCloseTo(totalTax(40000, 30000, 'mfj'), 2);
  });

  it('taxes LTCG at 0% when total taxable income stays below the threshold', () => {
    // Single: standard deduction $15,750, 0% LTCG threshold $48,350.
    // ordinaryIncome = 0, ssBenefit = 0, ltcg = 10,000.
    // ordinaryTaxable = 0, totalTaxable = max(0, 10,000 - 15,750) = 0 → no tax.
    expect(totalTaxWithLTCG(0, 0, 10000)).toBe(0);
  });

  it('lets the unused standard deduction offset LTCG', () => {
    // Regression: the deduction reduces AGI once, so any part of it not
    // absorbed by ordinary income must reduce the LTCG stacked on top.
    // Single, no ordinary income and no SS, $100,000 of LTCG:
    //   taxable income = 100,000 - 15,750 = 84,250
    //   48,350 @ 0% + 35,900 @ 15% = $5,385
    // Ignoring the spillover would tax the full $100,000 band and yield
    // $7,747.50 — overstated by 15% of the whole standard deduction.
    expect(totalTaxWithLTCG(0, 0, 100_000)).toBeCloseTo(5_385, 2);

    // MFJ: taxable income = 100,000 - 31,500 = 68,500, entirely inside the
    // $96,700 0% bracket, so the tax is zero rather than $495.
    expect(totalTaxWithLTCG(0, 0, 100_000, 'mfj')).toBe(0);
  });

  it('starts taxing LTCG only after the deduction and the 0% bracket are used up', () => {
    // With no other income the 0% zone runs to 15,750 + 48,350 = $64,100 of
    // gains, not $48,350.
    const single = ltcgMarginalRateCurve(0, 0, 100_000, 50);
    expect(single.find((d) => d.marginalRate > 0)!.ltcg).toBe(64_100);

    const mfj = ltcgMarginalRateCurve(0, 0, 200_000, 50, 'mfj');
    expect(mfj.find((d) => d.marginalRate > 0)!.ltcg).toBe(31_500 + 96_700);
  });

  it('never taxes more than total taxable income across the LTCG sweep', () => {
    // Cross-check against a direct AGI − deduction computation: the amount
    // subject to any rate at all is capped at taxable income.
    for (const ordinary of [0, 5_000, 12_000, 40_000]) {
      for (const ss of [0, 24_000]) {
        for (const ltcg of [0, 10_000, 30_000, 90_000]) {
          const taxableSS = taxableSocialSecurity(ss, ordinary + ltcg);
          const taxableIncome = Math.max(
            0,
            ordinary + ltcg + taxableSS - 15_750,
          );
          const tax = totalTaxWithLTCG(ordinary, ss, ltcg);
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
    const tax = totalTaxWithLTCG(60000, 0, 10000);
    const ordinaryPart = totalTaxWithLTCG(60000, 0, 0);
    const ltcgPart = tax - ordinaryPart;
    // $4,100 at 0% + $5,900 at 15% = $885
    expect(ltcgPart).toBeCloseTo(885, 0);
  });

  it('uses the MFJ 0% threshold ($96,700)', () => {
    // MFJ: ordinary income $120k, no SS. ordinaryTaxable = 120000 - 31500 = 88500.
    // 88500 < 96700, so first $8200 of LTCG at 0%, rest at 15%.
    const tax = totalTaxWithLTCG(120000, 0, 10000, 'mfj');
    const ordinaryPart = totalTaxWithLTCG(120000, 0, 0, 'mfj');
    const ltcgPart = tax - ordinaryPart;
    expect(ltcgPart).toBeCloseTo(0.15 * (10000 - 8200), 0);
  });

  it('LTCG triggers the SS torpedo by raising provisional income', () => {
    // Single: $20k ordinary, $24k SS, adding LTCG should drag SS into taxability.
    // Without LTCG: provisional = 20000 + 12000 = 32000 → some SS taxable.
    // With $20k LTCG: provisional = 40000 + 12000 = 52000 → much more SS taxable.
    const taxWithout = totalTaxWithLTCG(20000, 24000, 0);
    const taxWith = totalTaxWithLTCG(20000, 24000, 20000);
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
    const data = ltcgMarginalRateCurve(0, 0, 10000, 250);
    expect(data).toHaveLength(41);
    expect(data[0].ltcg).toBe(0);
    expect(data[40].ltcg).toBe(10000);
  });

  it('shows 0% marginal rate on LTCG when all income is below the threshold', () => {
    // Single: no SS, no ordinary income, LTCG starts at $0.
    const data = ltcgMarginalRateCurve(0, 0, 50000, 250);
    const at = (ltcg: number) => data.find((d) => d.ltcg === ltcg)!.marginalRate;
    expect(at(0)).toBe(0);
    expect(at(10000)).toBe(0);
  });

  it('shows elevated marginal rates from SS torpedo stacking', () => {
    // Single: $30k ordinary, $30k SS. LTCG raises provisional income,
    // dragging SS into taxability at ordinary rates while LTCG itself
    // is taxed at capital-gains rates. The combined effect produces
    // marginal rates well above the bare 15% LTCG rate.
    const data = ltcgMarginalRateCurve(30000, 30000, 100000, 250);
    const maxRate = Math.max(...data.map((d) => d.marginalRate));
    // The stacking pushes the effective marginal rate above 25%
    // (15% LTCG + torpedo-amplified ordinary tax on dragged-in SS).
    expect(maxRate).toBeGreaterThan(25);
  });

  it('reports total tax as non-decreasing', () => {
    const data = ltcgMarginalRateCurve(24000, 30000, 100000, 250);
    for (let i = 1; i < data.length; i++) {
      expect(data[i].totalTax).toBeGreaterThanOrEqual(data[i - 1].totalTax);
    }
  });

  it('uses MFJ thresholds so LTCG stays at 0% longer', () => {
    // MFJ 0% threshold is $96,700 vs single $48,350.
    const dataSingle = ltcgMarginalRateCurve(0, 60000, 100000, 250);
    const dataMfj = ltcgMarginalRateCurve(0, 60000, 100000, 250, 'mfj');
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
    const found = conversionCeilings(filingStatus).find((c) => c.id === id);
    if (!found) throw new Error(`no ceiling ${id}`);
    return found;
  };

  it('takes its ceiling amounts from the same tables the charts use', () => {
    const single = conversionCeilings('single');
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
    expect(ceiling('ss50').amount).toBe(FILING_PARAMS.single.ssBase50);
    expect(ceiling('ss85').amount).toBe(FILING_PARAMS.single.ssBase85);
    expect(ceiling('ltcg0').amount).toBe(LTCG_BRACKETS.single[0].upTo);
    expect(ceiling('irmaa1').amount).toBe(IRMAA_TIER1_MAGI.single);

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
    expect(maxConversionUnder(ceiling('bracket12'), 30_000, SS)).toBe(14_069);
    expect(
      conversionMeasureValue('ordinaryTaxableIncome', 30_000, SS, 0, 14_069),
    ).toBeCloseTo(48_474.2, 2);
    expect(
      conversionMeasureValue('ordinaryTaxableIncome', 30_000, SS, 0, 14_070),
    ).toBeGreaterThan(48_475);
  });

  it('sizes a conversion straight up to a provisional-income ceiling', () => {
    // No other income, so provisional income is half the benefit ($11,856) and
    // every converted dollar adds exactly one dollar of provisional income.
    expect(maxConversionUnder(ceiling('ss50'), 0, SS)).toBe(25_000 - 11_856);
    expect(maxConversionUnder(ceiling('ss85'), 0, SS)).toBe(34_000 - 11_856);
    expect(maxConversionUnder(ceiling('ss50', 'mfj'), 0, SS, 0, 'mfj')).toBe(32_000 - 11_856);
  });

  it('counts planned capital gains against the 0% capital-gains ceiling', () => {
    // $20,000 ordinary + $30,000 of gains, no benefits: total taxable income is
    // 50,000 - 15,750 = $34,250, leaving $14,100 under the $48,350 top of the
    // 0% bracket.
    expect(maxConversionUnder(ceiling('ltcg0'), 20_000, 0, 30_000)).toBe(14_100);
    // Without the gains the same ceiling leaves far more room.
    expect(maxConversionUnder(ceiling('ltcg0'), 20_000, 0, 0)).toBe(44_100);
  });

  it('measures the IRMAA ceiling against MAGI, which includes taxable benefits', () => {
    // $50,000 ordinary + $40,000 of benefits: the 85% cap ($34,000) already
    // binds, so MAGI is 84,000 + conversion and $22,000 fits under $106,000.
    expect(maxConversionUnder(ceiling('irmaa1'), 50_000, 40_000)).toBe(22_000);
    expect(conversionMeasureValue('magi', 50_000, 40_000, 0, 22_000)).toBe(106_000);
  });

  it('returns zero when the scenario is already over the ceiling', () => {
    const sizing = sizeConversion(ceiling('ss50'), 30_000, SS);
    expect(sizing.conversion).toBe(0);
    expect(sizing.alreadyOver).toBe(true);
    expect(sizing.headroom).toBeCloseTo(-16_856, 6);
    expect(sizing.taxCost).toBe(0);
    expect(sizing.costPerDollar).toBe(0);
  });

  it('flags a ceiling the search bound never reaches', () => {
    const sizing = sizeConversion(ceiling('bracket22'), 0, 0, 0, 'single', 0, 1_000);
    expect(sizing.conversion).toBe(1_000);
    expect(sizing.unbounded).toBe(true);
    expect(sizeConversion(ceiling('bracket22'), 0, 0).unbounded).toBe(false);
  });

  it('prices the conversion and the rate on the far side of the ceiling', () => {
    const sizing = sizeConversion(ceiling('bracket12'), 30_000, SS);
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
      for (const c of conversionCeilings(filingStatus)) {
        for (const { ordinary, ss, ltcg } of scenarios) {
          const sizing = sizeConversion(c, ordinary, ss, ltcg, filingStatus);
          const at = (conversion: number) =>
            conversionMeasureValue(c.measure, ordinary, ss, ltcg, conversion, filingStatus);
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
    expect(ADDITIONAL_STD_DEDUCTION_65).toEqual({ single: 2_000, mfj: 1_600 });
    expect(standardDeductionFor('single', 0)).toBe(15_750);
    expect(standardDeductionFor('single', 1)).toBe(17_750);
    expect(standardDeductionFor('mfj', 0)).toBe(31_500);
    expect(standardDeductionFor('mfj', 1)).toBe(33_100);
    expect(standardDeductionFor('mfj', 2)).toBe(34_700);
  });

  it('clamps the count to what the filing status allows', () => {
    expect(maxSeniors('single')).toBe(1);
    expect(maxSeniors('mfj')).toBe(2);
    // A single filer cannot claim it twice, and neither can a couple claim it
    // three times.
    expect(standardDeductionFor('single', 2)).toBe(standardDeductionFor('single', 1));
    expect(standardDeductionFor('mfj', 3)).toBe(standardDeductionFor('mfj', 2));
    expect(standardDeductionFor('single', -1)).toBe(15_750);
  });

  it('defaults to the base deduction everywhere, so nothing moves unless asked', () => {
    expect(standardDeductionFor('single')).toBe(FILING_PARAMS.single.standardDeduction);
    expect(totalTax(40_000, SS, 'single', 0)).toBe(totalTax(40_000, SS, 'single'));
    expect(totalTaxWithLTCG(20_000, SS, 10_000, 'mfj', 0)).toBe(
      totalTaxWithLTCG(20_000, SS, 10_000, 'mfj'),
    );
  });

  it('pushes the first taxed dollar out by the whole deduction stack when there are no benefits', () => {
    expect(totalTax(15_750, 0, 'single', 0)).toBe(0);
    expect(totalTax(15_751, 0, 'single', 0)).toBeGreaterThan(0);
    // $15,750 base + $2,000 age-65 addition + the $6,000 senior deduction,
    // which is unreduced this far below its $75,000 phaseout threshold.
    expect(totalTax(23_750, 0, 'single', 1)).toBe(0);
    expect(totalTax(23_751, 0, 'single', 1)).toBeGreaterThan(0);
  });

  it('saves the whole deduction stack times the marginal bracket rate', () => {
    // Single, $30,000 of other income and the average benefit: $2,000 of
    // age-65 addition plus $6,000 of senior deduction, all of it coming off
    // the top of the 12% bracket.
    expect(totalTax(30_000, SS, 'single', 0) - totalTax(30_000, SS, 'single', 1))
      .toBeCloseTo((2_000 + 6_000) * 0.12, 6);
    // MFJ at $60,000: $1,600 + $6,000 per qualifying spouse, and both spouses
    // land the couple in the 12% bracket. (At $30,000 the couple's taxable
    // income runs out before the deduction does, so nothing is left to save.)
    expect(totalTax(60_000, SS, 'mfj', 0) - totalTax(60_000, SS, 'mfj', 1))
      .toBeCloseTo((1_600 + 6_000) * 0.12, 6);
    expect(totalTax(60_000, SS, 'mfj', 1) - totalTax(60_000, SS, 'mfj', 2))
      .toBeCloseTo((1_600 + 6_000) * 0.12, 6);
  });

  it('widens the 0%-rate valley, but by less than the deduction once benefits are being dragged in', () => {
    // Taxable income is 1.5x income once provisional income clears $25,000, so
    // the $8,000 of extra deduction only buys about $5,333 of extra income
    // room.
    const lastZeroRateIncome = (seniors: number): number => {
      let last = 0;
      for (const point of marginalRateCurve(SS, 60_000, 250, 'single', seniors)) {
        if (point.marginalRate !== 0) break;
        last = point.income;
      }
      return last;
    };
    expect(lastZeroRateIncome(0)).toBe(14_750);
    expect(lastZeroRateIncome(1)).toBe(20_000);
    // The exact crossings: 1.5 * income - 6,572 = deduction.
    expect(totalTax(14_881, SS, 'single', 0)).toBe(0);
    expect(totalTax(14_882, SS, 'single', 0)).toBeGreaterThan(0);
    expect(totalTax(20_214, SS, 'single', 1)).toBe(0);
    expect(totalTax(20_215, SS, 'single', 1)).toBeGreaterThan(0);
    expect(20_214 - 14_881).toBeCloseTo((2_000 + 6_000) / 1.5, 0);
  });

  it('lets the addition offset capital gains when ordinary income underruns it', () => {
    // Single, $100,000 of gains and nothing else: the whole deduction lands on
    // the LTCG band, where the marginal rate is 15%. $100,000 of AGI is
    // $25,000 into the senior deduction's phaseout, so only $4,500 of the
    // $6,000 survives: 17,750 + 4,500 = 22,250 of deduction, and the $2,000 +
    // $4,500 above the base saves 15% of itself.
    expect(totalTaxWithLTCG(0, 0, 100_000, 'single', 0)).toBe(5_385);
    expect(totalTaxWithLTCG(0, 0, 100_000, 'single', 1)).toBe(4_410);
    expect(5_385 - 4_410).toBeCloseTo((2_000 + 4_500) * 0.15, 6);
  });

  it('leaves provisional-income ceilings alone but widens taxable-income ones', () => {
    const ceilingFor = (id: ConversionCeilingId, fs: FilingStatus = 'single') =>
      conversionCeilings(fs).find((c) => c.id === id) as ConversionCeiling;
    // Provisional income is measured before any deduction, so the addition
    // buys no extra room at all against the SS bases.
    expect(maxConversionUnder(ceilingFor('ss50'), 0, SS, 0, 'single', 1)).toBe(
      maxConversionUnder(ceilingFor('ss50'), 0, SS, 0, 'single', 0),
    );
    // The top of the 12% bracket is measured against taxable income, and the
    // 85% cap already binds by then, so the room grows dollar for dollar with
    // the $8,000 of extra deduction.
    expect(maxConversionUnder(ceilingFor('bracket12'), 30_000, SS, 0, 'single', 0)).toBe(14_069);
    expect(maxConversionUnder(ceilingFor('bracket12'), 30_000, SS, 0, 'single', 1)).toBe(22_069);
  });

  it('prices a conversion more cheaply for a filer over 65', () => {
    const ceilingFor = (id: ConversionCeilingId) =>
      conversionCeilings('single').find((c) => c.id === id) as ConversionCeiling;
    const sizing = sizeConversion(ceilingFor('bracket12'), 30_000, SS, 0, 'single', 1);
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
    expect(seniorDeductionFor('single', 1, 0)).toBe(6_000);
    expect(seniorDeductionFor('single', 1, 75_000)).toBe(6_000);
    expect(seniorDeductionFor('mfj', 1, 150_000)).toBe(6_000);
    expect(seniorDeductionFor('mfj', 2, 150_000)).toBe(12_000);
  });

  it('stays zero for a filer under 65, however low the MAGI', () => {
    expect(seniorDeductionFor('single', 0, 0)).toBe(0);
    expect(seniorDeductionFor('mfj', 0, 10_000)).toBe(0);
    expect(deductionFor('single', 0, 10_000)).toBe(15_750);
  });

  it('clamps the count the way the standard deduction does', () => {
    expect(seniorDeductionFor('single', 2, 0)).toBe(6_000);
    expect(seniorDeductionFor('mfj', 3, 0)).toBe(12_000);
    expect(seniorDeductionFor('single', -1, 0)).toBe(0);
  });

  it("reduces each person's $6,000 by 6% of MAGI over the threshold", () => {
    expect(SENIOR_DEDUCTION_PHASEOUT_RATE).toBe(0.06);
    expect(SENIOR_DEDUCTION_PHASEOUT_START).toEqual({
      single: 75_000,
      mfj: 150_000,
    });
    expect(seniorDeductionFor('single', 1, 76_000)).toBeCloseTo(5_940, 6);
    expect(seniorDeductionFor('single', 1, 125_000)).toBeCloseTo(3_000, 6);
    // The statute reduces "the $6,000 amount", i.e. each spouse's own, so a
    // couple where both qualify loses 12 cents per dollar rather than 6.
    expect(seniorDeductionFor('mfj', 1, 200_000)).toBeCloseTo(3_000, 6);
    expect(seniorDeductionFor('mfj', 2, 200_000)).toBeCloseTo(6_000, 6);
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
      expect(seniorDeductionFor(fs, seniors, end - 1)).toBeGreaterThan(0);
      expect(seniorDeductionFor(fs, seniors, end)).toBe(0);
      expect(seniorDeductionFor(fs, seniors, end + 1_000_000)).toBe(0);
      expect(deductionFor(fs, seniors, end)).toBe(standardDeductionFor(fs, seniors));
    }
  });

  it('stacks on the standard deduction and its age-65 addition', () => {
    expect(deductionFor('single', 1, 50_000)).toBe(15_750 + 2_000 + 6_000);
    expect(deductionFor('mfj', 2, 50_000)).toBe(31_500 + 3_200 + 12_000);
  });

  it('acts as a 6% stealth surtax on income inside the phaseout range', () => {
    // Single, $60,000 of other income and the average benefit: the 85% cap has
    // already bound, so a dollar of income is a dollar of MAGI - but it also
    // destroys 6 cents of deduction, so taxable income rises by $1.06 and the
    // 22% bracket bites at 23.32%.
    expect(totalTax(60_001, SS, 'single', 1) - totalTax(60_000, SS, 'single', 1))
      .toBeCloseTo(0.22 * 1.06, 6);
    expect(totalTax(60_001, SS, 'single', 0) - totalTax(60_000, SS, 'single', 0))
      .toBeCloseTo(0.22, 6);
  });

  it('doubles that surtax when both spouses qualify', () => {
    // MFJ, $150,000 of other income: MAGI is $170,155, i.e. $20,155 into the
    // range, and still inside the 22% bracket either way.
    expect(totalTax(150_001, SS, 'mfj', 1) - totalTax(150_000, SS, 'mfj', 1))
      .toBeCloseTo(0.22 * 1.06, 6);
    expect(totalTax(150_001, SS, 'mfj', 2) - totalTax(150_000, SS, 'mfj', 2))
      .toBeCloseTo(0.22 * 1.12, 6);
  });

  it('multiplies with the torpedo where the two overlap', () => {
    // Single, the maximum benefit and $50,000 of other income: benefits are
    // still being dragged in, so a dollar earned is $1.85 of MAGI, which then
    // destroys 6% of itself in deduction. 1.85 x 1.06 = $1.96 of taxable
    // income, and 22% becomes 43.14% rather than the torpedo's own 40.7%.
    const withPhaseout =
      totalTax(50_001, MAX_SS, 'single', 1) - totalTax(50_000, MAX_SS, 'single', 1);
    expect(withPhaseout).toBeCloseTo(0.22 * 1.85 * 1.06, 6);
    expect(withPhaseout).toBeCloseTo(0.431_42, 6);
    expect(
      totalTax(50_001, MAX_SS, 'single', 0) - totalTax(50_000, MAX_SS, 'single', 0),
    ).toBeCloseTo(0.22 * 1.85, 6);
  });

  it('puts a second hump on the marginal-rate curve', () => {
    const rates = (seniors: number) =>
      new Set(
        marginalRateCurve(SS, 150_000, 250, 'single', seniors).map(
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
    expect(totalTax(120_001, MAX_SS, 'single', 1) - totalTax(120_000, MAX_SS, 'single', 1))
      .toBeCloseTo(0.24 * 1.06, 6);
    expect(totalTax(140_001, MAX_SS, 'single', 1) - totalTax(140_000, MAX_SS, 'single', 1))
      .toBeCloseTo(0.24, 6);
  });

  it('prices the phaseout into a conversion ceiling and the rate past it', () => {
    const ceiling = conversionCeilings('single').find(
      (c) => c.id === 'bracket22',
    ) as ConversionCeiling;
    const plain = sizeConversion(ceiling, 30_000, SS, 0, 'single', 0);
    const senior = sizeConversion(ceiling, 30_000, SS, 0, 'single', 1);
    expect(plain.conversion).toBe(68_944);
    expect(plain.rateAboveCeiling).toBe(24);
    // $8,000 more deduction would buy $76,944 of room, but every converted
    // dollar above $75,000 of MAGI burns 6 cents of that deduction, so the
    // ceiling arrives $2,949 early - and the next dollar costs 25.44%.
    expect(senior.conversion).toBe(73_995);
    expect(senior.rateAboveCeiling).toBe(25.44);
  });
});

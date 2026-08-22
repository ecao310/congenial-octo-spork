import type { FilingStatus } from './types';
import { FILING_STATUSES, TAX_YEARS, taxYearParams } from './params';
import { maxAnnualSSBenefit, avgAnnualSSBenefit, taxableSocialSecurity } from './socialSecurity';
import { totalTax } from './income';
import { marginalRateCurve } from './curve';
import { pinTaxYear, AVG_ANNUAL_SS_BENEFIT, MAX_ANNUAL_SS_BENEFIT, pub915Worksheet1 } from '../../test/taxFixtures';

pinTaxYear();

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

describe('tax-exempt (municipal) interest', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
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
});

/**
 * Whose benefit the slider in step 1 is setting.
 *
 * `ssBenefit` is line 6a of the return, and a joint return is the only one
 * where that line holds two people's benefits added together. So the figures
 * the page hands the slider — its right edge and the average marked under it —
 * are the couple's for `mfj` and one worker's for every other status.
 */
describe('whose benefit the year figures describe', () => {
  it('gives a joint return the couple figures and every other status one worker\u2019s', () => {
    for (const year of TAX_YEARS) {
      const params = taxYearParams(year);
      expect(maxAnnualSSBenefit(year, 'mfj')).toBe(params.maxAnnualCoupleSSBenefit);
      expect(avgAnnualSSBenefit(year, 'mfj')).toBe(params.avgAnnualCoupleSSBenefit);
      for (const status of FILING_STATUSES.filter((s) => s !== 'mfj')) {
        expect(maxAnnualSSBenefit(year, status)).toBe(params.maxAnnualSSBenefit);
        expect(avgAnnualSSBenefit(year, status)).toBe(params.avgAnnualSSBenefit);
      }
      // Unstated means one person's, which is what every call site that
      // predates the joint figures meant by it.
      expect(maxAnnualSSBenefit(year)).toBe(params.maxAnnualSSBenefit);
      expect(avgAnnualSSBenefit(year)).toBe(params.avgAnnualSSBenefit);
    }
  });

  /**
   * The interesting half, and the reason the average is a published figure
   * rather than a doubling: a joint slider is nearly twice as long as a single
   * one while the marker on it moves by about half that.
   */
  it('stretches the ceiling further than it moves the average', () => {
    const single = { max: maxAnnualSSBenefit(2026), avg: avgAnnualSSBenefit(2026) };
    const joint = {
      max: maxAnnualSSBenefit(2026, 'mfj'),
      avg: avgAnnualSSBenefit(2026, 'mfj'),
    };
    expect(joint.max / single.max).toBe(2);
    expect(joint.avg / single.avg).toBeCloseTo(1.549, 3);
    // And the average is still a small share of the ceiling either way, which
    // is why the marker is drawn rather than left to the reader to guess.
    expect(joint.avg / joint.max).toBeLessThan(single.avg / single.max);
  });
});

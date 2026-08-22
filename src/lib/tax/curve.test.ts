import { totalTax } from './income';
import { marginalRateCurve } from './curve';
import { pinTaxYear } from '../../test/taxFixtures';

pinTaxYear();

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

  /**
   * The axis the chart is drawn in.
   *
   * The sweep is other income, because that is the one figure the reader sets
   * — but a point on it is not what the return takes in, and plotting the
   * hump at "$41,000" while the filer also has a benefit was only ever half an
   * answer. So each sample carries its own total, and the page reads the axis
   * off the curve rather than re-deriving it point by point.
   */
  describe('the total income each sample stands for', () => {
    it('carries the whole benefit and the tax-exempt interest, taxed or not', () => {
      const data = marginalRateCurve(
        { ssBenefit: 30_000, muniInterest: 5_000 },
        { maxIncome: 100_000, step: 1_000 },
      );
      const at = (income: number) =>
        data.find((d) => d.income === income)!.totalIncome;
      // Nothing but the benefit and the interest, whatever 86(a) makes of it.
      expect(at(0)).toBe(35_000);
      // And then dollar for dollar with the sweep.
      expect(at(40_000)).toBe(75_000);
      expect(at(100_000)).toBe(135_000);
    });

    it('rises with the sweep and never falls', () => {
      const data = marginalRateCurve(
        { ssBenefit: 24_852, seniors: 1, muniInterest: 3_000 },
        { maxIncome: 150_000, step: 500 },
      );
      for (let i = 1; i < data.length; i += 1) {
        expect(data[i].totalIncome).toBeGreaterThanOrEqual(data[i - 1].totalIncome);
      }
      expect(data[0].totalIncome).toBe(27_852);
    });
  });
});

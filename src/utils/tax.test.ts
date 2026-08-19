import {
  federalIncomeTax,
  marginalRateCurve,
  taxableSocialSecurity,
  totalTax,
} from './tax';

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
});

describe('totalTax', () => {
  it('is zero when income is under the standard deduction', () => {
    expect(totalTax(15000, 0)).toBe(0);
  });

  it('taxes other income plus the taxable portion of benefits', () => {
    // taxable SS = 26600; taxable income = 40000 + 26600 - 15750 = 50850
    expect(totalTax(40000, 40000)).toBeCloseTo(federalIncomeTax(50850), 2);
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
});

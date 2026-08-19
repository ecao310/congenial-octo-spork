export interface MarginalRatePoint {
  income: number;
  marginalRate: number;
}

export type FilingStatus = 'single' | 'mfj';

interface FilingParams {
  standardDeduction: number;
  brackets: { upTo: number; rate: number }[];
  /** Provisional-income thresholds for Social Security taxability. */
  ssBase50: number;
  ssBase85: number;
}

/** 2025 federal parameters by filing status (Rev. Proc. 2024-40; OBBBA standard deductions). */
export const FILING_PARAMS: Record<FilingStatus, FilingParams> = {
  single: {
    standardDeduction: 15_750,
    brackets: [
      { upTo: 11_925, rate: 0.1 },
      { upTo: 48_475, rate: 0.12 },
      { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 },
      { upTo: 250_525, rate: 0.32 },
      { upTo: 626_350, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    ssBase50: 25_000,
    ssBase85: 34_000,
  },
  mfj: {
    standardDeduction: 31_500,
    brackets: [
      { upTo: 23_850, rate: 0.1 },
      { upTo: 96_950, rate: 0.12 },
      { upTo: 206_700, rate: 0.22 },
      { upTo: 394_600, rate: 0.24 },
      { upTo: 501_050, rate: 0.32 },
      { upTo: 751_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    ssBase50: 32_000,
    ssBase85: 44_000,
  },
};

/**
 * SSA 2025 benefit figures (monthly x 12). Max is for a worker claiming at
 * age 70 ($5,108/mo); average retired-worker benefit is $1,976/mo after the
 * 2.5% COLA (January 2025).
 */
export const MAX_ANNUAL_SS_BENEFIT = 61_296;
export const AVG_ANNUAL_SS_BENEFIT = 23_712;

/**
 * Taxable portion of Social Security benefits under the 50%/85% rules.
 * Provisional income = other income + half of benefits. Up to 50% of the
 * excess over the first threshold is taxable, then up to 85% of the excess
 * over the second, capped at 85% of total benefits.
 */
export function taxableSocialSecurity(
  ssBenefit: number,
  otherIncome: number,
  filingStatus: FilingStatus = 'single',
): number {
  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];
  const provisional = otherIncome + 0.5 * ssBenefit;
  if (provisional <= ssBase50) return 0;
  if (provisional <= ssBase85) {
    return Math.min(0.5 * (provisional - ssBase50), 0.5 * ssBenefit);
  }
  const tier1 = Math.min(0.5 * (ssBase85 - ssBase50), 0.5 * ssBenefit);
  return Math.min(
    tier1 + 0.85 * (provisional - ssBase85),
    0.85 * ssBenefit,
  );
}

export function federalIncomeTax(
  taxableIncome: number,
  filingStatus: FilingStatus = 'single',
): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of FILING_PARAMS[filingStatus].brackets) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** Total federal tax on other income plus taxable Social Security, after the standard deduction. */
export function totalTax(
  otherIncome: number,
  ssBenefit: number,
  filingStatus: FilingStatus = 'single',
): number {
  const taxable = Math.max(
    0,
    otherIncome +
      taxableSocialSecurity(ssBenefit, otherIncome, filingStatus) -
      FILING_PARAMS[filingStatus].standardDeduction,
  );
  return federalIncomeTax(taxable, filingStatus);
}

/**
 * Marginal tax rate (in percent) on the next dollar of other income, sampled
 * from $0 to maxIncome, for a fixed annual Social Security benefit.
 */
export function marginalRateCurve(
  ssBenefit: number,
  maxIncome = 150_000,
  step = 250,
  filingStatus: FilingStatus = 'single',
): MarginalRatePoint[] {
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const rate =
      totalTax(income + 1, ssBenefit, filingStatus) -
      totalTax(income, ssBenefit, filingStatus);
    data.push({ income, marginalRate: Math.round(rate * 10_000) / 100 });
  }
  return data;
}

export interface MarginalRatePoint {
  income: number;
  marginalRate: number;
}

/** 2025 federal parameters, single filer. */
export const STANDARD_DEDUCTION = 15_750;

/**
 * SSA 2025 benefit figures (monthly x 12). Max is for a worker claiming at
 * age 70 ($5,108/mo); average retired-worker benefit is $1,976/mo after the
 * 2.5% COLA (January 2025).
 */
export const MAX_ANNUAL_SS_BENEFIT = 61_296;
export const AVG_ANNUAL_SS_BENEFIT = 23_712;

const BRACKETS = [
  { upTo: 11_925, rate: 0.1 },
  { upTo: 48_475, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_525, rate: 0.32 },
  { upTo: 626_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

/** Provisional-income thresholds for Social Security taxability, single filer. */
const SS_BASE_50 = 25_000;
const SS_BASE_85 = 34_000;

/**
 * Taxable portion of Social Security benefits under the 50%/85% rules.
 * Provisional income = other income + half of benefits. Up to 50% of the
 * excess over the first threshold is taxable, then up to 85% of the excess
 * over the second, capped at 85% of total benefits.
 */
export function taxableSocialSecurity(
  ssBenefit: number,
  otherIncome: number,
): number {
  const provisional = otherIncome + 0.5 * ssBenefit;
  if (provisional <= SS_BASE_50) return 0;
  if (provisional <= SS_BASE_85) {
    return Math.min(0.5 * (provisional - SS_BASE_50), 0.5 * ssBenefit);
  }
  const tier1 = Math.min(0.5 * (SS_BASE_85 - SS_BASE_50), 0.5 * ssBenefit);
  return Math.min(
    tier1 + 0.85 * (provisional - SS_BASE_85),
    0.85 * ssBenefit,
  );
}

export function federalIncomeTax(taxableIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of BRACKETS) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** Total federal tax on other income plus taxable Social Security, after the standard deduction. */
export function totalTax(otherIncome: number, ssBenefit: number): number {
  const taxable = Math.max(
    0,
    otherIncome + taxableSocialSecurity(ssBenefit, otherIncome) - STANDARD_DEDUCTION,
  );
  return federalIncomeTax(taxable);
}

/**
 * Marginal tax rate (in percent) on the next dollar of other income, sampled
 * from $0 to maxIncome, for a fixed annual Social Security benefit.
 */
export function marginalRateCurve(
  ssBenefit: number,
  maxIncome = 150_000,
  step = 250,
): MarginalRatePoint[] {
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const rate = totalTax(income + 1, ssBenefit) - totalTax(income, ssBenefit);
    data.push({ income, marginalRate: Math.round(rate * 10_000) / 100 });
  }
  return data;
}

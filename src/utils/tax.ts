export interface MarginalRatePoint {
  income: number;
  marginalRate: number;
  /** Total federal tax (whole dollars) at this income level. */
  totalTax: number;
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
 * Marginal tax rate (in percent) on the next dollar of other income, plus the
 * total federal tax at each level, sampled from $0 to maxIncome, for a fixed
 * annual Social Security benefit.
 */
export function marginalRateCurve(
  ssBenefit: number,
  maxIncome = 150_000,
  step = 250,
  filingStatus: FilingStatus = 'single',
): MarginalRatePoint[] {
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const taxHere = totalTax(income, ssBenefit, filingStatus);
    const rate = totalTax(income + 1, ssBenefit, filingStatus) - taxHere;
    data.push({
      income,
      marginalRate: Math.round(rate * 10_000) / 100,
      totalTax: Math.round(taxHere),
    });
  }
  return data;
}

/* ------------------------------------------------------------------ */
/*  Long-Term Capital Gains (LTCG) stacking                           */
/* ------------------------------------------------------------------ */

/** 2025 LTCG rate thresholds by filing status (Rev. Proc. 2024-40).
 *  The `upTo` values refer to total taxable income (ordinary + gains). */
export const LTCG_BRACKETS: Record<FilingStatus, { upTo: number; rate: number }[]> = {
  single: [
    { upTo: 48_350, rate: 0 },
    { upTo: 533_400, rate: 0.15 },
    { upTo: Infinity, rate: 0.20 },
  ],
  mfj: [
    { upTo: 96_700, rate: 0 },
    { upTo: 600_050, rate: 0.15 },
    { upTo: Infinity, rate: 0.20 },
  ],
};

/**
 * Federal tax on LTCG stacked on top of ordinary income + taxable SS.
 *
 * Ordinary income (including taxable SS) fills the brackets first; LTCG is
 * then taxed at its own preferential rates, but the bracket thresholds are
 * measured against the full taxable income (ordinary + LTCG).
 *
 * LTCG also counts toward provisional income for SS taxability, so adding
 * LTCG can drag SS benefits into taxable income at ordinary rates — the
 * "stacking" effect.
 */
export function totalTaxWithLTCG(
  ordinaryIncome: number,
  ssBenefit: number,
  ltcg: number,
  filingStatus: FilingStatus = 'single',
): number {
  const { standardDeduction, brackets } = FILING_PARAMS[filingStatus];
  const ltcgBrackets = LTCG_BRACKETS[filingStatus];

  // LTCG counts toward provisional income (IRS uses full AGI + half SS).
  const totalOtherIncome = ordinaryIncome + ltcg;
  const taxableSS = taxableSocialSecurity(ssBenefit, totalOtherIncome, filingStatus);

  // Ordinary taxable income (before LTCG): ordinary + taxable SS − deduction.
  const ordinaryTaxable = Math.max(0, ordinaryIncome + taxableSS - standardDeduction);

  // Total taxable income (ordinary + LTCG).
  const totalTaxable = ordinaryTaxable + ltcg;

  // --- Ordinary income tax (uses ordinary brackets up to ordinaryTaxable) ---
  let ordinaryTax = 0;
  {
    let lower = 0;
    for (const { upTo, rate } of brackets) {
      if (ordinaryTaxable <= lower) break;
      ordinaryTax += (Math.min(ordinaryTaxable, upTo) - lower) * rate;
      lower = upTo;
    }
  }

  // --- LTCG tax (fills LTCG brackets from ordinaryTaxable to totalTaxable) ---
  let ltcgTax = 0;
  {
    let lower = 0;
    for (const { upTo, rate } of ltcgBrackets) {
      // The LTCG band occupies [ordinaryTaxable, totalTaxable].
      const bandStart = Math.max(ordinaryTaxable, lower);
      const bandEnd = Math.min(totalTaxable, upTo);
      if (bandEnd > bandStart) {
        ltcgTax += (bandEnd - bandStart) * rate;
      }
      lower = upTo;
    }
  }

  return ordinaryTax + ltcgTax;
}

export interface LTCGMarginalRatePoint {
  ltcg: number;
  marginalRate: number;
  totalTax: number;
}

/**
 * Effective marginal rate on the next dollar of LTCG, sampled from $0 to
 * maxLTCG. Captures both the LTCG bracket rate and the SS torpedo
 * amplification (ordinary income dragged in by LTCG raising provisional
 * income).
 */
export function ltcgMarginalRateCurve(
  ssBenefit: number,
  ordinaryIncome: number,
  maxLTCG = 200_000,
  step = 250,
  filingStatus: FilingStatus = 'single',
): LTCGMarginalRatePoint[] {
  const data: LTCGMarginalRatePoint[] = [];
  for (let ltcg = 0; ltcg <= maxLTCG; ltcg += step) {
    const taxHere = totalTaxWithLTCG(ordinaryIncome, ssBenefit, ltcg, filingStatus);
    const rate = totalTaxWithLTCG(ordinaryIncome, ssBenefit, ltcg + 1, filingStatus) - taxHere;
    data.push({
      ltcg,
      marginalRate: Math.round(rate * 10_000) / 100,
      totalTax: Math.round(taxHere),
    });
  }
  return data;
}

export interface CurveSegment<T> {
  rate: number;
  start: number;
  end: number;
  points: T[];
  type: 'hill' | 'valley' | 'flat';
}

/**
 * Groups a curve into segments of constant marginal rate and classifies them.
 */
export function segmentCurve<T extends { marginalRate: number }>(
  points: T[],
  getX: (p: T) => number,
): CurveSegment<T>[] {
  if (points.length === 0) return [];

  const rawSegments: { rate: number; start: number; end: number; points: T[] }[] = [];
  for (const p of points) {
    const x = getX(p);
    const rate = p.marginalRate;
    if (rawSegments.length === 0 || rawSegments[rawSegments.length - 1].rate !== rate) {
      rawSegments.push({
        rate,
        start: x,
        end: x,
        points: [p]
      });
    } else {
      const last = rawSegments[rawSegments.length - 1];
      last.end = x;
      last.points.push(p);
    }
  }

  return rawSegments.map((seg, idx) => {
    const prevRate = idx > 0 ? rawSegments[idx - 1].rate : null;
    const nextRate = idx < rawSegments.length - 1 ? rawSegments[idx + 1].rate : null;

    let type: 'flat' | 'hill' | 'valley' = 'flat';

    if (prevRate !== null && nextRate !== null) {
      if (seg.rate > prevRate && seg.rate > nextRate) {
        type = 'hill';
      } else if (seg.rate < prevRate && seg.rate < nextRate) {
        type = 'valley';
      }
    } else if (prevRate === null && nextRate !== null) {
      if (seg.rate < nextRate) {
        type = 'valley';
      } else if (seg.rate > nextRate) {
        type = 'hill';
      }
    }

    return {
      ...seg,
      type,
    };
  });
}

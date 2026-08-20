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
 * 2025 additional standard deduction for a taxpayer age 65 or older
 * (Rev. Proc. 2024-40 section 2.15). The base amount is $1,600 per qualifying
 * person, raised to $2,000 for someone who is unmarried and not a surviving
 * spouse. The same amounts apply again for blindness, which this app does not
 * model.
 */
export const ADDITIONAL_STD_DEDUCTION_65: Record<FilingStatus, number> = {
  single: 2_000,
  mfj: 1_600,
};

/** How many people on the return can claim the age-65 addition. */
export function maxSeniors(filingStatus: FilingStatus): number {
  return filingStatus === 'mfj' ? 2 : 1;
}

/** Clamps a senior count to what the filing status allows. */
function seniorCount(filingStatus: FilingStatus, seniors: number): number {
  return Math.min(Math.max(0, Math.floor(seniors)), maxSeniors(filingStatus));
}

/**
 * The standard deduction, including the age-65-or-older addition for
 * `seniors` qualifying people on the return. The count is clamped to what the
 * filing status allows (one person, or two spouses filing jointly).
 *
 * Every extra dollar of deduction widens the 0%-rate valley to the left of the
 * torpedo: taxable income stays at zero for that much longer, so the first
 * bracket starts biting later.
 */
export function standardDeductionFor(
  filingStatus: FilingStatus = 'single',
  seniors = 0,
): number {
  return (
    FILING_PARAMS[filingStatus].standardDeduction +
    seniorCount(filingStatus, seniors) * ADDITIONAL_STD_DEDUCTION_65[filingStatus]
  );
}

/* ------------------------------------------------------------------ */
/*  OBBBA senior deduction (tax years 2025-2028 only)                 */
/* ------------------------------------------------------------------ */

/**
 * The temporary "senior deduction" added by P.L. 119-21 (the One Big Beautiful
 * Bill Act) as IRC 151(d)(5): "there shall be allowed a deduction in an amount
 * equal to $6,000 for each qualified individual with respect to the taxpayer",
 * a qualified individual being someone who has attained age 65 by the end of
 * the year. It is allowed whether or not the taxpayer itemizes, and it stacks
 * on top of both the standard deduction and the age-65 addition above.
 */
export const SENIOR_DEDUCTION = 6_000;

/** The only tax years the senior deduction exists for. It expires after 2028. */
export const SENIOR_DEDUCTION_FIRST_YEAR = 2025;
export const SENIOR_DEDUCTION_LAST_YEAR = 2028;

/**
 * The statute reduces "the $6,000 amount" - i.e. each qualified individual's
 * own $6,000 - by 6% of MAGI over the threshold. On a joint return where both
 * spouses qualify the reduction therefore lands twice, at an effective 12% of
 * the excess, which is why the deduction runs out $100,000 above the threshold
 * for every filing status rather than $200,000 above it for couples.
 */
export const SENIOR_DEDUCTION_PHASEOUT_RATE = 0.06;

/** MAGI at which each qualifying individual's $6,000 starts shrinking. */
export const SENIOR_DEDUCTION_PHASEOUT_START: Record<FilingStatus, number> = {
  single: 75_000,
  mfj: 150_000,
};

/**
 * MAGI at which the senior deduction is gone: $175,000 single, $250,000 MFJ.
 * Independent of how many spouses qualify, because the phaseout applies to each
 * one's $6,000 separately.
 */
export function seniorDeductionPhaseoutEnd(
  filingStatus: FilingStatus = 'single',
): number {
  return (
    SENIOR_DEDUCTION_PHASEOUT_START[filingStatus] +
    SENIOR_DEDUCTION / SENIOR_DEDUCTION_PHASEOUT_RATE
  );
}

/**
 * The senior deduction for `seniors` qualifying people at a given MAGI.
 *
 * MAGI here is AGI increased by the foreign-income exclusions of sections 911,
 * 931 and 933, none of which this app models - so it is simply AGI, which
 * already includes whatever share of Social Security benefits is taxable. Note
 * this is a *different* MAGI from the one Medicare uses for IRMAA: tax-exempt
 * interest is not added back here.
 *
 * Inside the phaseout range every extra dollar of income also destroys 6 cents
 * of deduction per qualifying person, so taxable income rises by $1.06 (or
 * $1.12 for a couple where both qualify) per dollar earned. That is a stealth
 * surtax on top of the bracket rate, and it stacks multiplicatively with the
 * Social Security torpedo, because the benefits the torpedo drags into taxable
 * income are part of MAGI too.
 */
export function seniorDeductionFor(
  filingStatus: FilingStatus = 'single',
  seniors = 0,
  magi = 0,
): number {
  const count = seniorCount(filingStatus, seniors);
  if (count === 0) return 0;
  const excess = Math.max(0, magi - SENIOR_DEDUCTION_PHASEOUT_START[filingStatus]);
  const perPerson = Math.max(
    0,
    SENIOR_DEDUCTION - SENIOR_DEDUCTION_PHASEOUT_RATE * excess,
  );
  return count * perPerson;
}

/**
 * Everything that comes off AGI: the standard deduction, its age-65 addition,
 * and the temporary senior deduction. Depends on MAGI because of the senior
 * deduction's phaseout — but the senior deduction is taken *from* AGI rather
 * than added to it, so there is no circular definition.
 */
export function deductionFor(
  filingStatus: FilingStatus = 'single',
  seniors = 0,
  magi = 0,
): number {
  return (
    standardDeductionFor(filingStatus, seniors) +
    seniorDeductionFor(filingStatus, seniors, magi)
  );
}

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

/** Total federal tax on other income plus taxable Social Security, after deductions. */
export function totalTax(
  otherIncome: number,
  ssBenefit: number,
  filingStatus: FilingStatus = 'single',
  seniors = 0,
): number {
  // AGI, which is also the MAGI the senior deduction phases out against.
  const magi =
    otherIncome + taxableSocialSecurity(ssBenefit, otherIncome, filingStatus);
  const taxable = Math.max(0, magi - deductionFor(filingStatus, seniors, magi));
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
  seniors = 0,
): MarginalRatePoint[] {
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const taxHere = totalTax(income, ssBenefit, filingStatus, seniors);
    const rate = totalTax(income + 1, ssBenefit, filingStatus, seniors) - taxHere;
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
  seniors = 0,
): number {
  const { brackets } = FILING_PARAMS[filingStatus];
  const ltcgBrackets = LTCG_BRACKETS[filingStatus];

  // LTCG counts toward provisional income (IRS uses full AGI + half SS).
  const totalOtherIncome = ordinaryIncome + ltcg;
  const taxableSS = taxableSocialSecurity(ssBenefit, totalOtherIncome, filingStatus);

  // Gains are part of AGI, so they phase out the senior deduction too.
  const deduction = deductionFor(filingStatus, seniors, totalOtherIncome + taxableSS);

  // Ordinary taxable income (before LTCG): ordinary + taxable SS − deduction.
  const ordinaryTaxable = Math.max(0, ordinaryIncome + taxableSS - deduction);

  // Total taxable income. The deduction offsets ordinary income first; whatever
  // is left over offsets the LTCG stacked on top of it. Form 1040 subtracts the
  // deduction from AGI once, and the Qualified Dividends and Capital Gain Tax
  // Worksheet caps the preferentially-taxed amount at total taxable income
  // (line 1), so the LTCG band is [ordinaryTaxable, totalTaxable] — which is
  // narrower than `ltcg` exactly when ordinary income underruns the deduction.
  const totalTaxable = Math.max(0, ordinaryIncome + taxableSS + ltcg - deduction);

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
  seniors = 0,
): LTCGMarginalRatePoint[] {
  const data: LTCGMarginalRatePoint[] = [];
  for (let ltcg = 0; ltcg <= maxLTCG; ltcg += step) {
    const taxHere = totalTaxWithLTCG(ordinaryIncome, ssBenefit, ltcg, filingStatus, seniors);
    const rate =
      totalTaxWithLTCG(ordinaryIncome, ssBenefit, ltcg + 1, filingStatus, seniors) - taxHere;
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

/* ------------------------------------------------------------------ */
/*  Roth conversion sizing                                            */
/* ------------------------------------------------------------------ */

/**
 * 2025 IRMAA tier-1 MAGI threshold. Medicare sets premiums from the MAGI on
 * the return filed two years earlier, so the 2025 surcharge is driven by 2023
 * income. This is a true cliff: one dollar over the threshold triggers the
 * full first-tier Part B and Part D surcharge for the whole year.
 */
export const IRMAA_TIER1_MAGI: Record<FilingStatus, number> = {
  single: 106_000,
  mfj: 212_000,
};

/** The income definition a conversion ceiling is measured against. */
export type ConversionMeasure =
  | 'ordinaryTaxableIncome'
  | 'totalTaxableIncome'
  | 'provisionalIncome'
  | 'magi';

export type ConversionCeilingId =
  | 'bracket12'
  | 'bracket22'
  | 'ss50'
  | 'ss85'
  | 'ltcg0'
  | 'irmaa1';

export interface ConversionCeiling {
  id: ConversionCeilingId;
  label: string;
  /** Which income definition `amount` caps. */
  measure: ConversionMeasure;
  /** The cap, in dollars, for the selected filing status. */
  amount: number;
  /** What happens on the far side of the ceiling. */
  note: string;
}

export const CONVERSION_MEASURE_LABELS: Record<ConversionMeasure, string> = {
  ordinaryTaxableIncome: 'taxable income',
  totalTaxableIncome: 'total taxable income (ordinary + gains)',
  provisionalIncome: 'provisional income',
  magi: 'MAGI',
};

function bracketTop(filingStatus: FilingStatus, rate: number): number {
  const bracket = FILING_PARAMS[filingStatus].brackets.find((b) => b.rate === rate);
  return bracket ? bracket.upTo : Infinity;
}

/** The ceilings a retiree might size a Roth conversion against, for one filing status. */
export function conversionCeilings(
  filingStatus: FilingStatus = 'single',
): ConversionCeiling[] {
  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];
  return [
    {
      id: 'bracket12',
      label: 'Top of the 12% bracket',
      measure: 'ordinaryTaxableIncome',
      amount: bracketTop(filingStatus, 0.12),
      note: 'The next dollar of ordinary income is taxed at 22% instead of 12%.',
    },
    {
      id: 'bracket22',
      label: 'Top of the 22% bracket',
      measure: 'ordinaryTaxableIncome',
      amount: bracketTop(filingStatus, 0.22),
      note: 'The next dollar of ordinary income is taxed at 24% instead of 22%.',
    },
    {
      id: 'ss50',
      label: 'Social Security 50% base',
      measure: 'provisionalIncome',
      amount: ssBase50,
      note: 'Below this, no benefits are taxable at all. Past it, each extra dollar drags up to 50¢ of benefits into taxable income.',
    },
    {
      id: 'ss85',
      label: 'Social Security 85% base',
      measure: 'provisionalIncome',
      amount: ssBase85,
      note: 'Past this, each extra dollar drags up to 85¢ of benefits into taxable income — the steepest part of the torpedo.',
    },
    {
      id: 'ltcg0',
      label: 'Top of the 0% capital-gains bracket',
      measure: 'totalTaxableIncome',
      amount: LTCG_BRACKETS[filingStatus][0].upTo,
      note: 'Past this, long-term gains stacked on top of ordinary income are taxed at 15% rather than 0%.',
    },
    {
      id: 'irmaa1',
      label: 'IRMAA tier 1 (Medicare surcharge)',
      measure: 'magi',
      amount: IRMAA_TIER1_MAGI[filingStatus],
      note: 'A true cliff, not a phase-in: one dollar over adds a full year of Part B and Part D surcharges. Medicare reads the MAGI from two years earlier, so this year’s conversion sets the premium two years out. The surcharge itself is not included in the tax figures below.',
    },
  ];
}

/**
 * The value of one conversion ceiling's income definition, for a base scenario
 * plus `conversion` dollars of Roth conversion (ordinary income).
 *
 * Every measure here is non-decreasing in `conversion`, which is what makes the
 * binary search in `maxConversionUnder` valid. That still holds with the senior
 * deduction in play: a bigger conversion only ever shrinks the deduction, so
 * taxable income rises at least as fast as the conversion itself.
 */
export function conversionMeasureValue(
  measure: ConversionMeasure,
  ordinaryIncome: number,
  ssBenefit: number,
  ltcg: number,
  conversion: number,
  filingStatus: FilingStatus = 'single',
  seniors = 0,
): number {
  const otherIncome = ordinaryIncome + conversion + ltcg;
  const taxableSS = taxableSocialSecurity(ssBenefit, otherIncome, filingStatus);
  // AGI (which already includes taxable SS) plus tax-exempt interest, which the
  // app does not model yet. Also the base for the senior deduction's phaseout,
  // where tax-exempt interest would *not* be added back.
  const magi = otherIncome + taxableSS;
  const deduction = deductionFor(filingStatus, seniors, magi);
  switch (measure) {
    case 'provisionalIncome':
      return otherIncome + 0.5 * ssBenefit;
    case 'magi':
      return magi;
    case 'ordinaryTaxableIncome':
      // What the ordinary brackets are measured against: LTCG stacks on top.
      return Math.max(0, ordinaryIncome + conversion + taxableSS - deduction);
    case 'totalTaxableIncome':
      return Math.max(0, magi - deduction);
  }
}

/** Slack for float error in the 0.5/0.85 inclusion factors; far below a dollar. */
const CEILING_EPSILON = 1e-6;

/**
 * The largest whole-dollar Roth conversion that keeps the ceiling's income
 * measure at or below its cap. Binary search, valid because every measure is
 * monotonically non-decreasing in the conversion amount.
 *
 * Returns 0 when the base scenario is already over the ceiling, and
 * `maxConversion` when the ceiling is still not reached at the search bound.
 */
export function maxConversionUnder(
  ceiling: ConversionCeiling,
  ordinaryIncome: number,
  ssBenefit: number,
  ltcg = 0,
  filingStatus: FilingStatus = 'single',
  seniors = 0,
  maxConversion = 1_000_000,
): number {
  const measureAt = (conversion: number): number =>
    conversionMeasureValue(
      ceiling.measure,
      ordinaryIncome,
      ssBenefit,
      ltcg,
      conversion,
      filingStatus,
      seniors,
    );
  const fits = (conversion: number): boolean =>
    measureAt(conversion) <= ceiling.amount + CEILING_EPSILON;

  if (!fits(0)) return 0;
  if (fits(maxConversion)) return maxConversion;

  let low = 0;
  let high = maxConversion;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface ConversionSizing {
  ceiling: ConversionCeiling;
  /** Largest conversion, in whole dollars, that stays under the ceiling. */
  conversion: number;
  /** Room under the ceiling before converting anything; negative when over. */
  headroom: number;
  /** Federal tax with no conversion. */
  taxBefore: number;
  /** Federal tax after converting `conversion`. */
  taxAfter: number;
  /** taxAfter - taxBefore. */
  taxCost: number;
  /** Average federal tax cost per dollar converted, in percent. */
  costPerDollar: number;
  /**
   * Marginal rate, in percent, on income just past the ceiling. Sampled one
   * dollar clear of the boundary, because the dollar that straddles the ceiling
   * is split across two rates and reads low (the ceilings are whole dollars but
   * taxable income lands on fractions of one, thanks to the 0.85 SS factor).
   */
  rateAboveCeiling: number;
  /** The scenario already breaches the ceiling, so nothing fits under it. */
  alreadyOver: boolean;
  /** The ceiling was never reached within `maxConversion`. */
  unbounded: boolean;
}

/**
 * Sizes a Roth conversion against one ceiling and prices it: the largest
 * conversion that fits, what it costs in federal tax, the average cost per
 * dollar converted, and the marginal rate that applies past the ceiling.
 */
export function sizeConversion(
  ceiling: ConversionCeiling,
  ordinaryIncome: number,
  ssBenefit: number,
  ltcg = 0,
  filingStatus: FilingStatus = 'single',
  seniors = 0,
  maxConversion = 1_000_000,
): ConversionSizing {
  const conversion = maxConversionUnder(
    ceiling,
    ordinaryIncome,
    ssBenefit,
    ltcg,
    filingStatus,
    seniors,
    maxConversion,
  );
  const headroom =
    ceiling.amount -
    conversionMeasureValue(
      ceiling.measure,
      ordinaryIncome,
      ssBenefit,
      ltcg,
      0,
      filingStatus,
      seniors,
    );

  const taxBefore = Math.round(
    totalTaxWithLTCG(ordinaryIncome, ssBenefit, ltcg, filingStatus, seniors),
  );
  const taxAfterRaw = totalTaxWithLTCG(
    ordinaryIncome + conversion,
    ssBenefit,
    ltcg,
    filingStatus,
    seniors,
  );
  const taxAfter = Math.round(taxAfterRaw);
  const taxCost = taxAfter - taxBefore;
  const rateAboveCeiling =
    totalTaxWithLTCG(
      ordinaryIncome + conversion + 2,
      ssBenefit,
      ltcg,
      filingStatus,
      seniors,
    ) -
    totalTaxWithLTCG(
      ordinaryIncome + conversion + 1,
      ssBenefit,
      ltcg,
      filingStatus,
      seniors,
    );

  return {
    ceiling,
    conversion,
    headroom,
    taxBefore,
    taxAfter,
    taxCost,
    costPerDollar:
      conversion > 0 ? Math.round((taxCost / conversion) * 10_000) / 100 : 0,
    rateAboveCeiling: Math.round(rateAboveCeiling * 10_000) / 100,
    alreadyOver: headroom < 0,
    unbounded: conversion === maxConversion,
  };
}

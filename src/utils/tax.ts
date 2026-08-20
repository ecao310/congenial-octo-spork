export interface MarginalRatePoint {
  income: number;
  marginalRate: number;
  /** Total federal tax (whole dollars) at this income level. */
  totalTax: number;
}

export type FilingStatus = 'single' | 'mfj' | 'mfs';

/**
 * Every input a scenario has, as named fields rather than a positional list.
 *
 * The list had reached eight arguments — `sizeConversion(ceiling, ordinary, ss,
 * ltcg, filingStatus, seniors, maxConversion, muni)` — six of them numbers, and
 * inserting `seniors` in the middle once silently reassigned a caller's
 * `MAX_CONVERSION` to it. The tests caught that one. Named fields make the same
 * mistake a type error, and an unknown key a type error too, so a typo cannot
 * quietly fall back to a default.
 *
 * Every field is optional and defaults to the un-set case: no income, no
 * benefit, filing single, under 65, one Medicare enrollee.
 */
export interface Scenario {
  /** Ordinary income other than Social Security: pensions, IRA withdrawals, wages, interest. */
  ordinaryIncome?: number;
  /** Annual Social Security benefit, gross — before any of it is taxed. */
  ssBenefit?: number;
  /** Long-term capital gains and qualified dividends, taxed in their own brackets. */
  ltcg?: number;
  /** Interest exempt from tax under IRC 103 — municipal bonds. */
  muniInterest?: number;
  filingStatus?: FilingStatus;
  /** How many people on the return have reached 65; clamped by `maxSeniors`. */
  seniors?: number;
  /** Medicare enrollees on the return. IRMAA is charged per enrollee. */
  beneficiaries?: number;
}

/**
 * Fills in the defaults. Written out field by field rather than spread over a
 * defaults object, because `{ ...DEFAULTS, ...scenario }` would let an explicit
 * `{ ltcg: undefined }` — which `{ ...base, ltcg: someMaybeNumber }` produces —
 * overwrite the default with `undefined`.
 */
export function resolveScenario(scenario: Scenario = {}): Required<Scenario> {
  return {
    ordinaryIncome: scenario.ordinaryIncome ?? 0,
    ssBenefit: scenario.ssBenefit ?? 0,
    ltcg: scenario.ltcg ?? 0,
    muniInterest: scenario.muniInterest ?? 0,
    filingStatus: scenario.filingStatus ?? 'single',
    seniors: scenario.seniors ?? 0,
    beneficiaries: scenario.beneficiaries ?? 1,
  };
}

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
  /**
   * Married filing separately, having lived with the spouse at some point in
   * the year.
   *
   * The brackets are section 1(j)(2)(D)'s — identical to a single filer's until
   * $375,800, where a separate return tops out at 37% while a single one still
   * has room in the 35% band — and the standard deduction is the same $15,750,
   * because section 63(c)(2) files both statuses under "any other case".
   *
   * The Social Security bases are the whole story. IRC 86(c)(1)(C) and
   * 86(c)(2)(C) set both of them to zero for a married taxpayer who does not
   * file jointly and does not live apart from their spouse for the *entire*
   * year. A $0 base and a $0 adjusted base leave the 50% tier zero dollars
   * wide, so the formula collapses to 85% of provisional income capped at 85%
   * of benefits: 42.5% of the benefit is already taxable before a single dollar
   * of other income arrives, and the cap binds as soon as other income reaches
   * half the benefit. There is no valley and no hump — just the ceiling,
   * immediately.
   *
   * A separate filer who lived apart from their spouse for all twelve months is
   * treated as unmarried by 86(c) instead, and should use `single`.
   */
  mfs: {
    standardDeduction: 15_750,
    brackets: [
      { upTo: 11_925, rate: 0.1 },
      { upTo: 48_475, rate: 0.12 },
      { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 },
      { upTo: 250_525, rate: 0.32 },
      { upTo: 375_800, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    ssBase50: 0,
    ssBase85: 0,
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
  // A separate filer is still married, so they get the married $1,600 rather
  // than the $2,000 an unmarried person gets.
  mfs: 1_600,
};

/**
 * How many people on the return can claim the age-65 addition.
 *
 * One, unless the return is joint. Section 63(f)(1)(B) does let a separate
 * filer claim the addition for a spouse aged 65 or older, but only when that
 * spouse has no gross income at all and is not another taxpayer's dependent —
 * an edge case this app does not model, and one that cannot arise for the
 * couples it is aimed at, since a spouse drawing Social Security has gross
 * income.
 */
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
export function standardDeductionFor(scenario: Scenario = {}): number {
  const { filingStatus, seniors } = resolveScenario(scenario);
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

/**
 * MAGI at which each qualifying individual's $6,000 starts shrinking, or `null`
 * for a filing status the deduction is not available to at all.
 *
 * Section 151(d)(5)(C)(v): "If the taxpayer is a married individual (within the
 * meaning of section 7703), this subparagraph shall apply only if the taxpayer
 * and the taxpayer's spouse file a joint return for the taxable year." A
 * separate return therefore gets nothing — not a halved amount, not a halved
 * threshold — which is why `mfs` is null rather than $75,000.
 */
export const SENIOR_DEDUCTION_PHASEOUT_START: Record<FilingStatus, number | null> = {
  single: 75_000,
  mfj: 150_000,
  mfs: null,
};

/** Whether a filing status can claim the senior deduction at all. */
export function seniorDeductionAllowed(filingStatus: FilingStatus): boolean {
  return SENIOR_DEDUCTION_PHASEOUT_START[filingStatus] !== null;
}

/**
 * MAGI at which the senior deduction is gone: $175,000 single, $250,000 MFJ.
 * Independent of how many spouses qualify, because the phaseout applies to each
 * one's $6,000 separately. `null` for a separate return, which never had one.
 */
export function seniorDeductionPhaseoutEnd(
  filingStatus: FilingStatus = 'single',
): number | null {
  const start = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  if (start === null) return null;
  return start + SENIOR_DEDUCTION / SENIOR_DEDUCTION_PHASEOUT_RATE;
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
export function seniorDeductionFor(scenario: Scenario = {}, magi = 0): number {
  const { filingStatus, seniors } = resolveScenario(scenario);
  const count = seniorCount(filingStatus, seniors);
  if (count === 0) return 0;
  const start = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  // A separate return is barred outright, so there is nothing to phase out.
  if (start === null) return 0;
  const excess = Math.max(0, magi - start);
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
export function deductionFor(scenario: Scenario = {}, magi = 0): number {
  return standardDeductionFor(scenario) + seniorDeductionFor(scenario, magi);
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
 * Provisional income = ordinary income + capital gains + tax-exempt interest +
 * half of benefits.
 * Up to 50% of the excess over the first threshold is taxable, then up to 85%
 * of the excess over the second, capped at 85% of total benefits.
 *
 * `muniInterest` is interest exempt from tax under IRC 103 — municipal bond
 * income. IRC 86(b)(2)(B) adds it back when figuring provisional income even
 * though it never enters gross income, so it moves the taxable share of
 * benefits without moving the ordinary tax base at all. See
 * `muniInterestEffect` for what that costs.
 */
export function taxableSocialSecurity(scenario: Scenario = {}): number {
  const { ssBenefit, ordinaryIncome, ltcg, muniInterest, filingStatus } =
    resolveScenario(scenario);
  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];
  const provisional = ordinaryIncome + ltcg + muniInterest + 0.5 * ssBenefit;
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

/**
 * Adjusted gross income: ordinary income, capital gains, and whatever share of
 * the benefit the torpedo has dragged in.
 *
 * Tax-exempt interest is deliberately absent. It raises provisional income, so
 * it can pull benefits into AGI — but it never lands in AGI itself, and it is
 * not added back for the senior deduction's MAGI either (unlike the MAGI
 * Medicare uses for IRMAA, which does add it back; see `irmaaMagi`). The only
 * trace it leaves in the tax base is the benefits it dragged in.
 */
export function agiFor(scenario: Scenario = {}): number {
  const { ordinaryIncome, ltcg } = resolveScenario(scenario);
  return ordinaryIncome + ltcg + taxableSocialSecurity(scenario);
}

/**
 * Marginal tax rate (in percent) on the next dollar of ordinary income, plus
 * the total federal tax at each level, sampled from $0 to `maxIncome`.
 *
 * Sweeps the scenario's `ordinaryIncome`, so whatever it already carries there
 * is overwritten. Every other field is honoured, `ltcg` included — pass a
 * scenario with no gains to plot the ordinary-income chart on its own.
 */
export interface IncomeCurveRange {
  /** Right edge of the swept ordinary-income axis. */
  maxIncome?: number;
  /** Sampling interval, in dollars. */
  step?: number;
}

export function marginalRateCurve(
  scenario: Scenario = {},
  { maxIncome = 150_000, step = 250 }: IncomeCurveRange = {},
): MarginalRatePoint[] {
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const taxHere = totalTax({ ...scenario, ordinaryIncome: income });
    const rate = totalTax({ ...scenario, ordinaryIncome: income + 1 }) - taxHere;
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
  // The 0% band is exactly half the joint one, and so happens to match a single
  // filer's. The 15% band is not: half of $600,050 would be $300,025, but each
  // status is adjusted for inflation from its own base amount and rounded
  // separately, so Rev. Proc. 2024-40 prints $300,000.
  mfs: [
    { upTo: 48_350, rate: 0 },
    { upTo: 300_000, rate: 0.15 },
    { upTo: Infinity, rate: 0.20 },
  ],
};

/**
 * Total federal income tax on the scenario: ordinary income plus whatever share
 * of the benefit is taxable, with long-term gains stacked on top in their own
 * brackets.
 *
 * Ordinary income (taxable SS included) fills the ordinary brackets first; LTCG
 * is then taxed at its preferential rates, but the LTCG thresholds are measured
 * against the *full* taxable income, ordinary and gains together.
 *
 * LTCG also counts toward provisional income, so adding gains can drag benefits
 * into taxable income at ordinary rates — the "stacking" effect. Leave `ltcg`
 * unset and this is the plain ordinary-income tax.
 *
 * The Medicare IRMAA surcharge is not part of this: it is a premium, not a tax.
 * See `irmaaFor`.
 */
export function totalTax(scenario: Scenario = {}): number {
  const { ordinaryIncome, filingStatus } = resolveScenario(scenario);

  const taxableSS = taxableSocialSecurity(scenario);
  // Gains are part of AGI, so they phase out the senior deduction too.
  const agi = agiFor(scenario);
  const deduction = deductionFor(scenario, agi);

  // Ordinary taxable income (before LTCG): ordinary + taxable SS − deduction.
  const ordinaryTaxable = Math.max(0, ordinaryIncome + taxableSS - deduction);

  // Total taxable income. The deduction offsets ordinary income first; whatever
  // is left over offsets the LTCG stacked on top of it. Form 1040 subtracts the
  // deduction from AGI once, and the Qualified Dividends and Capital Gain Tax
  // Worksheet caps the preferentially-taxed amount at total taxable income
  // (line 1), so the LTCG band is [ordinaryTaxable, totalTaxable] — which is
  // narrower than `ltcg` exactly when ordinary income underruns the deduction.
  const totalTaxable = Math.max(0, agi - deduction);

  // --- LTCG tax (fills LTCG brackets from ordinaryTaxable to totalTaxable) ---
  let ltcgTax = 0;
  let lower = 0;
  for (const { upTo, rate } of LTCG_BRACKETS[filingStatus]) {
    const bandStart = Math.max(ordinaryTaxable, lower);
    const bandEnd = Math.min(totalTaxable, upTo);
    if (bandEnd > bandStart) {
      ltcgTax += (bandEnd - bandStart) * rate;
    }
    lower = upTo;
  }

  return federalIncomeTax(ordinaryTaxable, filingStatus) + ltcgTax;
}

export interface LTCGMarginalRatePoint {
  ltcg: number;
  marginalRate: number;
  totalTax: number;
}

/**
 * Effective marginal rate on the next dollar of LTCG, sampled from $0 to
 * `maxLTCG`. Captures both the LTCG bracket rate and the SS torpedo
 * amplification (benefits dragged into AGI by LTCG raising provisional
 * income).
 *
 * Sweeps the scenario's `ltcg`, so whatever it already carries there is
 * overwritten; every other field is honoured.
 */
export interface LtcgCurveRange {
  /** Right edge of the swept capital-gains axis. */
  maxLTCG?: number;
  /** Sampling interval, in dollars. */
  step?: number;
}

export function ltcgMarginalRateCurve(
  scenario: Scenario = {},
  { maxLTCG = 200_000, step = 250 }: LtcgCurveRange = {},
): LTCGMarginalRatePoint[] {
  const data: LTCGMarginalRatePoint[] = [];
  for (let ltcg = 0; ltcg <= maxLTCG; ltcg += step) {
    const taxHere = totalTax({ ...scenario, ltcg });
    const rate = totalTax({ ...scenario, ltcg: ltcg + 1 }) - taxHere;
    data.push({
      ltcg,
      marginalRate: Math.round(rate * 10_000) / 100,
      totalTax: Math.round(taxHere),
    });
  }
  return data;
}

/* ------------------------------------------------------------------ */
/*  Tax-exempt (municipal bond) interest                              */
/* ------------------------------------------------------------------ */

export interface MuniInterestEffect {
  /** The tax-exempt interest the scenario holds. */
  muniInterest: number;
  /** Taxable Social Security if the same portfolio threw off no muni interest. */
  taxableSSWithout: number;
  /** Taxable Social Security once the tax-exempt interest is counted. */
  taxableSSWith: number;
  /** Benefits dragged into taxable income by the tax-exempt interest alone. */
  taxableSSDelta: number;
  /** Federal tax without the tax-exempt interest. */
  taxWithout: number;
  /** Federal tax with it. */
  taxWith: number;
  /** taxWith - taxWithout: what the "tax-free" interest still costs. */
  taxCost: number;
  /** Average federal tax cost per dollar of tax-exempt interest, in percent. */
  costPerDollar: number;
  /** Federal tax on the *next* dollar of tax-exempt interest, in percent. */
  ratePerNextDollar: number;
}

/**
 * What tax-exempt interest actually costs a Social Security recipient.
 *
 * Municipal bond interest is excluded from gross income by IRC 103, so it never
 * reaches taxable income — but IRC 86(b)(2)(B) adds it straight back into
 * provisional income. The only thing it can move, therefore, is the taxable
 * share of benefits, and it moves that dollar for dollar with ordinary income:
 * inside the torpedo a dollar of "tax-free" interest can pull 85 cents of
 * benefits into the tax base and cost 10 to 40 cents in federal tax.
 *
 * Because the interest itself is invisible on the return, this is the effect
 * retirees are least likely to notice: the tax shows up on line 6b, attached to
 * benefits they cannot control, rather than anywhere near the bonds that caused
 * it.
 */
export function muniInterestEffect(scenario: Scenario = {}): MuniInterestEffect {
  const { muniInterest } = resolveScenario(scenario);
  const withoutMuni: Scenario = { ...scenario, muniInterest: 0 };

  const taxableSSWithout = taxableSocialSecurity(withoutMuni);
  const taxableSSWith = taxableSocialSecurity(scenario);

  const taxAt = (muni: number): number => totalTax({ ...scenario, muniInterest: muni });

  const taxWithRaw = taxAt(muniInterest);
  const taxWithout = Math.round(taxAt(0));
  const taxWith = Math.round(taxWithRaw);
  const taxCost = taxWith - taxWithout;

  return {
    muniInterest,
    taxableSSWithout: Math.round(taxableSSWithout),
    taxableSSWith: Math.round(taxableSSWith),
    taxableSSDelta: Math.round(taxableSSWith - taxableSSWithout),
    taxWithout,
    taxWith,
    taxCost,
    costPerDollar:
      muniInterest > 0 ? Math.round((taxCost / muniInterest) * 10_000) / 100 : 0,
    ratePerNextDollar:
      Math.round((taxAt(muniInterest + 1) - taxWithRaw) * 10_000) / 100,
  };
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
/*  IRMAA - Medicare's income-related monthly adjustment amount        */
/* ------------------------------------------------------------------ */

/** The premium year the figures below apply to. */
export const IRMAA_PREMIUM_YEAR = 2025;

/**
 * Medicare sets a year's premium from the MAGI on the return filed two years
 * earlier, because that is the most recent return the IRS has shared with SSA
 * when premiums are set (42 U.S.C. 1395r(i)(4)). So the 2025 premium is driven
 * by 2023 income, and this year's income sets the premium two years out.
 */
export const IRMAA_LOOKBACK_YEARS = 2;

/** The tax year whose MAGI sets the `IRMAA_PREMIUM_YEAR` premium. */
export const IRMAA_MAGI_YEAR = IRMAA_PREMIUM_YEAR - IRMAA_LOOKBACK_YEARS;

/** 2025 standard Part B premium per beneficiary per month (CMS, Nov 2024). */
export const PART_B_STANDARD_PREMIUM = 185;

export interface IrmaaTier {
  /** 0 for the standard premium; 1 through 5 for the surcharge tiers. */
  tier: number;
  /**
   * The tier applies when MAGI is strictly *greater* than this. -Infinity for
   * the standard tier, which has no floor.
   */
  magiOver: Record<FilingStatus, number>;
  /**
   * Filing statuses whose threshold is inclusive - MAGI *at* `magiOver` already
   * lands in the tier. Only the separate-return top tier works this way, and it
   * does because 42 U.S.C. 1395r(i)(3)(C)(ii)(II) says "equal to or greater
   * than" where every other threshold in the statute says "greater than". CMS
   * reproduces the difference verbatim in its own premium table.
   */
  inclusiveFor?: FilingStatus[];
  /** Total monthly Part B premium, standard premium included. */
  partBMonthly: number;
  /**
   * Monthly Part D surcharge. Only the surcharge - the plan's own premium is
   * set by the insurer, not by CMS, so there is no standard amount to add.
   */
  partDSurchargeMonthly: number;
}

/**
 * 2025 IRMAA schedule, keyed to 2023 MAGI (CMS fact sheet, November 2024).
 *
 * The joint thresholds are exactly double the single ones except at the top:
 * the $500,000 / $750,000 tier added by the Bipartisan Budget Act of 2018 is
 * fixed in statute rather than indexed, so it never doubled and does not move
 * with inflation.
 *
 * A separate return that lived with the spouse gets its own two-step schedule
 * under 42 U.S.C. 1395r(i)(3)(C) rather than a halved version of the joint one.
 * It reuses tiers 4 and 5's premiums but reaches them at $106,000 and $394,000,
 * so tiers 1 through 3 simply do not exist for it — marked `Infinity` here and
 * filtered out by `irmaaTiersFor`. The practical effect is brutal: a separate
 * filer's first cliff is the *fourth* tier, and it costs the whole $5,826 a
 * year in one step instead of arriving in four.
 */
export const IRMAA_TIERS: IrmaaTier[] = [
  {
    tier: 0,
    magiOver: { single: -Infinity, mfj: -Infinity, mfs: -Infinity },
    partBMonthly: PART_B_STANDARD_PREMIUM,
    partDSurchargeMonthly: 0,
  },
  {
    tier: 1,
    magiOver: { single: 106_000, mfj: 212_000, mfs: Infinity },
    partBMonthly: 259.0,
    partDSurchargeMonthly: 13.7,
  },
  {
    tier: 2,
    magiOver: { single: 133_000, mfj: 266_000, mfs: Infinity },
    partBMonthly: 370.0,
    partDSurchargeMonthly: 35.3,
  },
  {
    tier: 3,
    magiOver: { single: 167_000, mfj: 334_000, mfs: Infinity },
    partBMonthly: 480.9,
    partDSurchargeMonthly: 57.0,
  },
  {
    tier: 4,
    magiOver: { single: 200_000, mfj: 400_000, mfs: 106_000 },
    partBMonthly: 591.9,
    partDSurchargeMonthly: 78.6,
  },
  {
    tier: 5,
    magiOver: { single: 500_000, mfj: 750_000, mfs: 394_000 },
    inclusiveFor: ['mfs'],
    partBMonthly: 628.9,
    partDSurchargeMonthly: 85.8,
  },
];

/**
 * The tiers a filing status can actually land in, standard-premium tier first
 * and ascending. Everything downstream — which tier a MAGI falls in, what the
 * next cliff is, where the reference lines go — walks this rather than
 * `IRMAA_TIERS`, so a separate return never sees the three tiers it has no
 * access to.
 */
export function irmaaTiersFor(filingStatus: FilingStatus = 'single'): IrmaaTier[] {
  return IRMAA_TIERS.filter(
    (t) => t.tier === 0 || Number.isFinite(t.magiOver[filingStatus]),
  );
}

/** The first surcharge tier a filing status can reach. Tier 1, except for MFS. */
export function firstIrmaaTier(filingStatus: FilingStatus = 'single'): IrmaaTier {
  return irmaaTiersFor(filingStatus)[1];
}

/**
 * 2025 MAGI at which a filing status meets its first IRMAA cliff. A true cliff:
 * one dollar over triggers a full year of Part B and Part D surcharges.
 */
export const IRMAA_FIRST_CLIFF_MAGI: Record<FilingStatus, number> = {
  single: firstIrmaaTier('single').magiOver.single,
  mfj: firstIrmaaTier('mfj').magiOver.mfj,
  mfs: firstIrmaaTier('mfs').magiOver.mfs,
};

/** Whether a MAGI has reached a tier, honouring the one inclusive threshold. */
function irmaaTierReached(
  tier: IrmaaTier,
  magi: number,
  filingStatus: FilingStatus,
): boolean {
  const floor = tier.magiOver[filingStatus];
  return tier.inclusiveFor?.includes(filingStatus) ? magi >= floor : magi > floor;
}

/** Rounds to whole cents, so premium arithmetic does not leak float dust. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The monthly Part B surcharge for a tier: its premium over the standard one. */
export function partBSurchargeMonthly(tier: IrmaaTier): number {
  return toCents(tier.partBMonthly - PART_B_STANDARD_PREMIUM);
}

/**
 * Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4),
 * incorporating IRC 6103(l)(20)). Note this is a *wider* definition than the
 * one the OBBBA senior deduction phases out against, which never adds the
 * tax-exempt interest back - see `seniorDeductionFor`.
 */
export function irmaaMagi(scenario: Scenario = {}): number {
  return agiFor(scenario) + resolveScenario(scenario).muniInterest;
}

/** The tier a given MAGI lands in. Thresholds are exclusive: over, not at. */
export function irmaaTierFor(
  magi: number,
  filingStatus: FilingStatus = 'single',
): IrmaaTier {
  let found = IRMAA_TIERS[0];
  for (const tier of irmaaTiersFor(filingStatus)) {
    if (irmaaTierReached(tier, magi, filingStatus)) found = tier;
  }
  return found;
}

export interface IrmaaAssessment {
  magi: number;
  /** 0 when no surcharge applies. */
  tier: number;
  /** How many people on the return are enrolled in Medicare. */
  beneficiaries: number;
  /** Total monthly Part B premium per beneficiary, surcharge included. */
  partBMonthly: number;
  /** Monthly Part B surcharge per beneficiary. */
  partBSurchargeMonthly: number;
  /** Monthly Part D surcharge per beneficiary. */
  partDSurchargeMonthly: number;
  /** Part B + Part D surcharge for the whole household, annualized. */
  annualSurcharge: number;
  /** Total Part B premium for the household, annualized, surcharge included. */
  annualPartB: number;
  /** MAGI at which the next cliff triggers; null at the top tier. */
  nextThreshold: number | null;
  /** MAGI still available before the next cliff; null at the top tier. */
  headroom: number | null;
  /** What crossing the next cliff costs the household per year; 0 at the top. */
  nextStep: number;
}

/** Household surcharge for a tier, annualized over `beneficiaries` enrollees. */
function annualSurchargeFor(tier: IrmaaTier, beneficiaries: number): number {
  return toCents(
    (partBSurchargeMonthly(tier) + tier.partDSurchargeMonthly) *
      12 *
      beneficiaries,
  );
}

/**
 * What Medicare charges at a given MAGI, and how close the next cliff is.
 *
 * The surcharge is per enrollee, not per return, so a couple with both spouses
 * on Medicare pays it twice off a single MAGI figure - which is why the joint
 * thresholds being double the single ones still leaves couples worse off per
 * dollar of income.
 */
export function irmaaFor(magi: number, scenario: Scenario = {}): IrmaaAssessment {
  const { filingStatus, beneficiaries } = resolveScenario(scenario);
  const tiers = irmaaTiersFor(filingStatus);
  const tier = irmaaTierFor(magi, filingStatus);
  const next = tiers[tiers.indexOf(tier) + 1] ?? null;
  const partBSurcharge = partBSurchargeMonthly(tier);
  const annualSurcharge = annualSurchargeFor(tier, beneficiaries);
  return {
    magi,
    tier: tier.tier,
    beneficiaries,
    partBMonthly: tier.partBMonthly,
    partBSurchargeMonthly: partBSurcharge,
    partDSurchargeMonthly: tier.partDSurchargeMonthly,
    annualSurcharge,
    annualPartB: toCents(tier.partBMonthly * 12 * beneficiaries),
    nextThreshold: next ? next.magiOver[filingStatus] : null,
    headroom: next ? next.magiOver[filingStatus] - magi : null,
    nextStep: next
      ? toCents(annualSurchargeFor(next, beneficiaries) - annualSurcharge)
      : 0,
  };
}

/**
 * The other (non-SS, non-muni) income at which IRMAA MAGI first reaches
 * `targetMagi`, for a fixed benefit and tax-exempt interest. Returns 0 when
 * the threshold is already breached with no other income at all.
 *
 * MAGI is continuous and strictly increasing in other income - its slope is 1,
 * 1.5 or 1.85 depending on which part of the torpedo the dollar lands in - so
 * bisection inverts it exactly. And because the slope exceeds 1 inside the
 * torpedo, a cliff arrives at *less* other income than its MAGI figure
 * suggests: benefits dragged into AGI get there first.
 */
export function otherIncomeAtIrmaaMagi(
  targetMagi: number,
  scenario: Scenario = {},
): number {
  // Solves on the chart's x-axis, which is ordinary income with no gains on it,
  // so the scenario's `ordinaryIncome` and `ltcg` are both overwritten.
  const magiAt = (income: number): number =>
    irmaaMagi({ ...scenario, ordinaryIncome: income, ltcg: 0 });
  if (magiAt(0) >= targetMagi) return 0;
  // MAGI is never below other income, so targetMagi always overshoots.
  let low = 0;
  let high = targetMagi;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (magiAt(mid) < targetMagi) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export interface IrmaaCliff {
  /** 1 through 5 — but only 4 and 5 exist on a separate return. */
  tier: number;
  /** The MAGI threshold this cliff sits at. */
  magi: number;
  /** Where the cliff falls on an other-income axis. */
  otherIncome: number;
  /** Household annual surcharge once the cliff is crossed. */
  annualSurcharge: number;
  /** The jump in household annual surcharge at this cliff. */
  step: number;
}

/**
 * Every IRMAA cliff placed on the chart's other-income axis, for overlaying as
 * reference lines. Tax-exempt interest shifts them left dollar for dollar (it
 * is in Medicare's MAGI *and* in provisional income), and so does a larger
 * benefit.
 */
export function irmaaCliffs(scenario: Scenario = {}): IrmaaCliff[] {
  const { filingStatus, beneficiaries } = resolveScenario(scenario);
  const tiers = irmaaTiersFor(filingStatus);
  return tiers.slice(1).map((tier, index) => {
    const magi = tier.magiOver[filingStatus];
    // The tier below on *this* status's ladder, which is not tier - 1 for a
    // separate return: its first cliff steps straight off the standard premium.
    const previous = tiers[index];
    const annualSurcharge = annualSurchargeFor(tier, beneficiaries);
    return {
      tier: tier.tier,
      magi,
      otherIncome: otherIncomeAtIrmaaMagi(magi, scenario),
      annualSurcharge,
      step: toCents(annualSurcharge - annualSurchargeFor(previous, beneficiaries)),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Roth conversion sizing                                            */
/* ------------------------------------------------------------------ */

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
  // Both bases are $0 on a separate return that lived with the spouse, so the
  // two Social Security ceilings collapse onto each other. Say so rather than
  // offering the same $0 twice with different explanations.
  const basesCollapse = ssBase50 === ssBase85;
  const firstCliff = firstIrmaaTier(filingStatus);
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
      note: basesCollapse
        ? 'There is no 50% tier on a separate return: both bases are $0, so this ceiling sits at the same place as the one below and nothing fits under either.'
        : 'Below this, no benefits are taxable at all. Past it, each extra dollar drags up to 50¢ of benefits into taxable income.',
    },
    {
      id: 'ss85',
      label: 'Social Security 85% base',
      measure: 'provisionalIncome',
      amount: ssBase85,
      note: basesCollapse
        ? 'A separate return that lived with the spouse has a $0 base, so it starts past this ceiling: 85¢ of every provisional dollar is already in the tax base, up to 85% of benefits.'
        : 'Past this, each extra dollar drags up to 85¢ of benefits into taxable income — the steepest part of the torpedo.',
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
      label: `IRMAA tier ${firstCliff.tier} (Medicare surcharge)`,
      measure: 'magi',
      amount: IRMAA_FIRST_CLIFF_MAGI[filingStatus],
      note:
        'A true cliff, not a phase-in: one dollar over adds a full year of Part B and Part D surcharges. Medicare reads the MAGI from two years earlier, so this year’s conversion sets the premium two years out. The surcharge itself is not included in the tax figures below.' +
        (firstCliff.tier > 1
          ? ' A separate return skips the lower tiers entirely, so its first cliff is the fourth one and arrives in a single step.'
          : ''),
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
  scenario: Scenario = {},
  conversion = 0,
): number {
  const { ordinaryIncome, ltcg, muniInterest, ssBenefit } = resolveScenario(scenario);
  // A Roth conversion is ordinary income, so it simply moves that field.
  const converted: Scenario = {
    ...scenario,
    ordinaryIncome: ordinaryIncome + conversion,
  };
  const taxableSS = taxableSocialSecurity(converted);
  // AGI, which already includes taxable SS but never includes tax-exempt
  // interest. This is also the base for the senior deduction's phaseout, where
  // tax-exempt interest is *not* added back.
  const agi = agiFor(converted);
  const deduction = deductionFor(converted, agi);
  switch (measure) {
    case 'provisionalIncome':
      return ordinaryIncome + conversion + ltcg + muniInterest + 0.5 * ssBenefit;
    case 'magi':
      // The only ceiling measured this way is IRMAA, and Medicare's MAGI is
      // AGI plus tax-exempt interest — a wider definition than the one the
      // senior deduction phases out against.
      return agi + muniInterest;
    case 'ordinaryTaxableIncome':
      // What the ordinary brackets are measured against: LTCG stacks on top.
      return Math.max(0, ordinaryIncome + conversion + taxableSS - deduction);
    case 'totalTaxableIncome':
      return Math.max(0, agi - deduction);
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
  scenario: Scenario = {},
  maxConversion = 1_000_000,
): number {
  const measureAt = (conversion: number): number =>
    conversionMeasureValue(ceiling.measure, scenario, conversion);
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
  scenario: Scenario = {},
  maxConversion = 1_000_000,
): ConversionSizing {
  const { ordinaryIncome } = resolveScenario(scenario);
  const conversion = maxConversionUnder(ceiling, scenario, maxConversion);
  const headroom =
    ceiling.amount - conversionMeasureValue(ceiling.measure, scenario, 0);

  const taxAt = (ordinary: number): number =>
    totalTax({ ...scenario, ordinaryIncome: ordinary });

  const taxBefore = Math.round(taxAt(ordinaryIncome));
  const taxAfter = Math.round(taxAt(ordinaryIncome + conversion));
  const taxCost = taxAfter - taxBefore;
  const rateAboveCeiling =
    taxAt(ordinaryIncome + conversion + 2) - taxAt(ordinaryIncome + conversion + 1);

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

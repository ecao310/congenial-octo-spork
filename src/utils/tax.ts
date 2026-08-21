export interface MarginalRatePoint {
  income: number;
  marginalRate: number;
  /** Total federal tax (whole dollars) at this income level. */
  totalTax: number;
}

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';

/** A tax year this app has published figures for. See `TAX_YEAR_PARAMS`. */
export type TaxYear = 2025 | 2026;

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
 * benefit, filing single, under 65, one Medicare enrollee, current tax year.
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
  /**
   * Qualified charitable distributions under IRC 408(d)(8): IRA money paid
   * straight to charity, which never enters gross income at all.
   *
   * Taken *out of* `ordinaryIncome` rather than added on top of it, because
   * the gift is a distribution the filer was going to report anyway — see
   * `ordinaryIncomeAfterQcd`. Capped by the annual limit and by the ordinary
   * income there is to exclude it from.
   */
  qcd?: number;
  filingStatus?: FilingStatus;
  /** How many people on the return have reached 65; clamped by `maxSeniors`. */
  seniors?: number;
  /** Medicare enrollees on the return. IRMAA is charged per enrollee. */
  beneficiaries?: number;
  /**
   * Which year's brackets, standard deduction and capital-gain bands to use.
   * Defaults to the current calendar year — see `defaultTaxYear`. The Social
   * Security thresholds ignore this, because they are not indexed at all.
   */
  year?: TaxYear;
  /**
   * A year past the last one Congress and the IRS have published figures for,
   * with those figures indexed forward — see `projectFilingParams`.
   *
   * `year` can only name a year in `TAX_YEAR_PARAMS`, which is the right
   * constraint everywhere except the multi-year projection, where the whole
   * point is to run past it. When this is set it wins: `filingParamsFor` uses
   * its brackets and deductions, and `scenarioYear` reports its calendar year,
   * so the OBBBA senior deduction can expire on schedule. Nothing else about
   * the scenario changes — in particular `SS_BASES` is frozen either way,
   * which is exactly what the projection exists to show.
   */
  projected?: ProjectedYear | null;
  /**
   * A ceiling on how much benefit 86(a) may include in gross income — the
   * lump-sum election of IRC 86(e) — or null, which is every ordinary year.
   *
   * A cap rather than a substitution because that is what the statute is:
   * "the amount included in gross income under this section ... shall not
   * exceed the sum of the increases in gross income ... for prior taxable
   * years". Electing can therefore never raise the bill, which is why Pub 915
   * Worksheet 4 ends by telling you to use the smaller of the two figures.
   *
   * Set by `lumpSumElection` and by nothing else. Because it lands inside
   * `taxableSocialSecurity`, everything downstream — AGI, the senior
   * deduction's phaseout, the gain stacking, Medicare's MAGI two years later —
   * follows it without knowing it exists.
   */
  taxableSSCap?: number | null;
}

/** One tax year's figures, for a year `TAX_YEAR_PARAMS` does not cover. */
export interface ProjectedYear {
  /** The calendar year these figures are for. May be any year, past 2026. */
  year: number;
  /** Brackets, standard deduction and capital-gain bands, indexed forward. */
  filing: FilingYearParams;
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
    qcd: scenario.qcd ?? 0,
    filingStatus: scenario.filingStatus ?? 'single',
    seniors: scenario.seniors ?? 0,
    beneficiaries: scenario.beneficiaries ?? 1,
    year: scenario.year ?? defaultTaxYear(),
    projected: scenario.projected ?? null,
    taxableSSCap: scenario.taxableSSCap ?? null,
  };
}

/**
 * The calendar year a scenario is being taxed in.
 *
 * The same as `year` for every scenario the charts build, and the projected
 * year for one the multi-year projection builds. Use this — not `year` — for
 * anything that turns on the calendar, such as whether a temporary provision
 * has expired.
 */
export function scenarioYear(scenario: Scenario = {}): number {
  const { year, projected } = resolveScenario(scenario);
  return projected ? projected.year : year;
}

/** One rate band. `upTo` is the top of the band; the last band is Infinity. */
export interface Bracket {
  upTo: number;
  rate: number;
}

/** The inflation-adjusted figures for one filing status in one tax year. */
export interface FilingYearParams {
  /** Base standard deduction, IRC 63(c) as amended by the OBBBA. */
  standardDeduction: number;
  /**
   * Additional standard deduction per qualifying person age 65 or older,
   * IRC 63(f)(1). The same amount applies again for blindness, which this app
   * does not model.
   */
  additionalStdDeduction65: number;
  /** Ordinary-income rate schedule, IRC 1(j). */
  brackets: Bracket[];
  /**
   * Long-term capital gain and qualified dividend rate schedule, IRC 1(h).
   * The `upTo` values refer to total taxable income (ordinary + gains).
   */
  ltcgBrackets: Bracket[];
}

/** Everything about a tax year that this app needs. */
export interface TaxYearParams {
  year: TaxYear;
  /** Where the inflation-adjusted figures come from. */
  source: string;
  filing: Record<FilingStatus, FilingYearParams>;
  /**
   * SSA maximum annual benefit for a worker who claims at age 70 in this year.
   * Not last year's maximum times the COLA: it also depends on the earnings
   * record and delayed retirement credits of whoever turns 70 this year.
   */
  maxAnnualSSBenefit: number;
  /** SSA average annual benefit for a retired worker in January of this year. */
  avgAnnualSSBenefit: number;
  /** The COLA that produced this year's benefit figures, in percent. */
  colaPercent: number;
  /**
   * The IRC 408(d)(8)(A) annual limit on qualified charitable distributions,
   * per individual. SECURE 2.0 section 307 started indexing the statutory
   * $100,000 in 2024; the IRS announces the adjusted figure in its annual
   * retirement-plan limits notice rather than in the Rev. Proc. above.
   */
  qcdAnnualLimit: number;
  /**
   * The 408(d)(8)(F) one-time limit on a QCD to a split-interest entity — a
   * charitable remainder trust or charitable gift annuity. Indexed alongside
   * the annual limit, elective once in a lifetime, and counted against that
   * year's annual limit rather than on top of it. Reference only: this app
   * models the ordinary annual QCD.
   */
  qcdSplitInterestLimit: number;
}

/**
 * The Social Security provisional-income thresholds, which are the one set of
 * figures on this page that does *not* move.
 *
 * IRC 86(c) wrote $25,000/$32,000 into the statute in 1983 and $34,000/$44,000
 * in 1993, and neither has ever been indexed for inflation. Every other number
 * in this file — brackets, standard deduction, capital-gain bands, the benefit
 * itself — is adjusted annually. So each COLA pushes the same real income
 * further past a threshold that has not moved in decades, and the share of
 * beneficiaries paying tax on benefits ratchets up year after year by design.
 * That contrast is the whole point of the tax-year selector, so these live
 * outside `TAX_YEAR_PARAMS` rather than being repeated identically in it.
 */
export const SS_BASES: Record<FilingStatus, { ssBase50: number; ssBase85: number }> = {
  single: { ssBase50: 25_000, ssBase85: 34_000 },
  mfj: { ssBase50: 32_000, ssBase85: 44_000 },
  /**
   * Married filing separately, having lived with the spouse at some point in
   * the year.
   *
   * IRC 86(c)(1)(C) and 86(c)(2)(C) set both the base and the adjusted base to
   * zero for a married taxpayer who does not file jointly and does not live
   * apart from their spouse for the *entire* year. A $0 base and a $0 adjusted
   * base leave the 50% tier zero dollars wide, so the formula collapses to 85%
   * of provisional income capped at 85% of benefits: 42.5% of the benefit is
   * already taxable before a single dollar of other income arrives, and the cap
   * binds as soon as other income reaches half the benefit. There is no valley
   * and no hump — just the ceiling, immediately.
   *
   * A separate filer who lived apart from their spouse for all twelve months is
   * treated as unmarried by 86(c) instead, and should use `single`.
   */
  mfs: { ssBase50: 0, ssBase85: 0 },
  /**
   * Head of household.
   *
   * IRC 86(c)(1) names exactly two special cases — $32,000 for a joint return
   * and $0 for a separate return that lived with the spouse — and puts every
   * other status under "$25,000, in the case of a taxpayer not described in
   * subparagraph (A) or (C)". 86(c)(2) does the same for the $34,000 adjusted
   * base. So a head of household gets a single filer's thresholds exactly,
   * while getting a standard deduction half again as large and a much wider
   * 12% bracket. The valley to the left of the torpedo is therefore longer
   * than a single filer's and the hump starts in the same place.
   */
  hoh: { ssBase50: 25_000, ssBase85: 34_000 },
};

/** The year each threshold in `SS_BASES` was last set by Congress. */
export const SS_BASE50_ENACTED = 1983;
export const SS_BASE85_ENACTED = 1993;

/**
 * Federal parameters by tax year.
 *
 * Adding a year means adding one entry here; nothing downstream changes. The
 * separate-return brackets are the joint ones halved (IRC 1(j)(2)(D)), which
 * makes them identical to a single filer's until the 35% band, where a separate
 * return tops out and jumps to 37% while a single one still has room. The
 * separate-return standard deduction is the single one, because IRC 63(c)(2)
 * files both statuses under "any other case".
 *
 * The head-of-household schedule is not derived from any other status: IRC
 * 1(j)(2)(B) gives it its own bracket amounts and 63(c)(2)(B) its own standard
 * deduction, set at 150% of the single one. The 10% and 12% bands are the ones
 * that differ enough to matter here, because those are the bands the Social
 * Security torpedo lands in.
 */
export const TAX_YEAR_PARAMS: Record<TaxYear, TaxYearParams> = {
  2025: {
    year: 2025,
    source: 'Rev. Proc. 2024-40; OBBBA standard deductions; SSA (2.5% COLA)',
    maxAnnualSSBenefit: 61_296, // $5,108/mo at age 70
    avgAnnualSSBenefit: 23_712, // $1,976/mo, January 2025
    colaPercent: 2.5,
    qcdAnnualLimit: 108_000, // Notice 2024-80
    qcdSplitInterestLimit: 54_000, // Notice 2024-80
    filing: {
      single: {
        standardDeduction: 15_750,
        additionalStdDeduction65: 2_000,
        brackets: [
          { upTo: 11_925, rate: 0.1 },
          { upTo: 48_475, rate: 0.12 },
          { upTo: 103_350, rate: 0.22 },
          { upTo: 197_300, rate: 0.24 },
          { upTo: 250_525, rate: 0.32 },
          { upTo: 626_350, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 48_350, rate: 0 },
          { upTo: 533_400, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfj: {
        standardDeduction: 31_500,
        additionalStdDeduction65: 1_600,
        brackets: [
          { upTo: 23_850, rate: 0.1 },
          { upTo: 96_950, rate: 0.12 },
          { upTo: 206_700, rate: 0.22 },
          { upTo: 394_600, rate: 0.24 },
          { upTo: 501_050, rate: 0.32 },
          { upTo: 751_600, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 96_700, rate: 0 },
          { upTo: 600_050, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfs: {
        standardDeduction: 15_750,
        // A separate filer is still married, so they get the married $1,600
        // rather than the $2,000 an unmarried person gets.
        additionalStdDeduction65: 1_600,
        brackets: [
          { upTo: 11_925, rate: 0.1 },
          { upTo: 48_475, rate: 0.12 },
          { upTo: 103_350, rate: 0.22 },
          { upTo: 197_300, rate: 0.24 },
          { upTo: 250_525, rate: 0.32 },
          { upTo: 375_800, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        // The 0% band is exactly half the joint one, and so happens to match a
        // single filer's. The 15% band is not: half of $600,050 would be
        // $300,025, but each status is adjusted for inflation from its own base
        // amount and rounded separately, so Rev. Proc. 2024-40 prints $300,000.
        ltcgBrackets: [
          { upTo: 48_350, rate: 0 },
          { upTo: 300_000, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      hoh: {
        // Rev. Proc. 2024-40 printed $22,500; the OBBBA replaced the three
        // 63(c)(2) amounts for 2025 and raised this one to $23,625. It is
        // exactly 1.5x the single figure, which is the ratio the statute has
        // set since 63(c)(2)(B) was written.
        standardDeduction: 23_625,
        // A head of household is unmarried, so 63(f)(3) gives the larger
        // "not married and not a surviving spouse" addition — the same $2,000
        // a single filer gets, not the $1,600 a married one does.
        additionalStdDeduction65: 2_000,
        // The 10% and 12% bands are their own amounts under IRC 1(j)(2)(B),
        // materially wider than a single filer's; from the 22% band up the
        // schedule converges on the single one and the top three thresholds
        // are within $25 of it.
        brackets: [
          { upTo: 17_000, rate: 0.1 },
          { upTo: 64_850, rate: 0.12 },
          { upTo: 103_350, rate: 0.22 },
          { upTo: 197_300, rate: 0.24 },
          { upTo: 250_500, rate: 0.32 },
          { upTo: 626_350, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 64_750, rate: 0 },
          { upTo: 566_700, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
    },
  },
  2026: {
    year: 2026,
    source: 'Rev. Proc. 2025-32; SSA (2.8% COLA)',
    maxAnnualSSBenefit: 62_172, // $5,181/mo at age 70
    avgAnnualSSBenefit: 24_852, // $2,071/mo, January 2026
    colaPercent: 2.8,
    qcdAnnualLimit: 111_000, // Notice 2025-67
    qcdSplitInterestLimit: 55_000, // Notice 2025-67
    filing: {
      single: {
        standardDeduction: 16_100,
        additionalStdDeduction65: 2_050,
        // The OBBBA gave the bottom two brackets an extra inflation adjustment
        // (roughly 4% against 2.3% for the rest), so the 12% band widened by
        // more than the bands above it.
        brackets: [
          { upTo: 12_400, rate: 0.1 },
          { upTo: 50_400, rate: 0.12 },
          { upTo: 105_700, rate: 0.22 },
          { upTo: 201_775, rate: 0.24 },
          { upTo: 256_225, rate: 0.32 },
          { upTo: 640_600, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 49_450, rate: 0 },
          { upTo: 545_500, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfj: {
        standardDeduction: 32_200,
        additionalStdDeduction65: 1_650,
        brackets: [
          { upTo: 24_800, rate: 0.1 },
          { upTo: 100_800, rate: 0.12 },
          { upTo: 211_400, rate: 0.22 },
          { upTo: 403_550, rate: 0.24 },
          { upTo: 512_450, rate: 0.32 },
          { upTo: 768_700, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 98_900, rate: 0 },
          { upTo: 613_700, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfs: {
        standardDeduction: 16_100,
        additionalStdDeduction65: 1_650,
        brackets: [
          { upTo: 12_400, rate: 0.1 },
          { upTo: 50_400, rate: 0.12 },
          { upTo: 105_700, rate: 0.22 },
          { upTo: 201_775, rate: 0.24 },
          { upTo: 256_225, rate: 0.32 },
          { upTo: 384_350, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        // Half of $613,700 is $306,850 exactly, so for 2026 the separate 15%
        // band really is the halved joint one — unlike 2025, where separate
        // rounding put it $25 below half.
        ltcgBrackets: [
          { upTo: 49_450, rate: 0 },
          { upTo: 306_850, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      hoh: {
        standardDeduction: 24_150,
        additionalStdDeduction65: 2_050,
        brackets: [
          { upTo: 17_700, rate: 0.1 },
          { upTo: 67_450, rate: 0.12 },
          { upTo: 105_700, rate: 0.22 },
          { upTo: 201_775, rate: 0.24 },
          { upTo: 256_200, rate: 0.32 },
          { upTo: 640_600, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 66_200, rate: 0 },
          { upTo: 579_600, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
    },
  },
};

/** Every year this app has figures for, ascending. */
export const TAX_YEARS: TaxYear[] = [2025, 2026];

/**
 * The year to start on: the calendar year, when there are figures for it.
 *
 * Clamped into `TAX_YEARS` rather than left to fail, so the app keeps working
 * in January of a year whose Rev. Proc. has not been published yet (and in any
 * year after that, if nobody adds the new figures). It falls back to the most
 * recent year on file, which is the closest thing to correct that exists.
 */
export function defaultTaxYear(calendarYear = new Date().getFullYear()): TaxYear {
  const first = TAX_YEARS[0];
  const last = TAX_YEARS[TAX_YEARS.length - 1];
  if (calendarYear <= first) return first;
  if (calendarYear >= last) return last;
  // Matched against the list rather than cast into it, so a gap in the years on
  // file (2025 and 2027 but not 2026) falls back to a year that exists instead
  // of returning one with no parameters behind it.
  return TAX_YEARS.find((y) => y === calendarYear) ?? last;
}

/** Whether this app has published figures for a calendar year. */
export function hasPublishedParams(year: number): year is TaxYear {
  return TAX_YEARS.some((y) => y === year);
}

/**
 * The latest year with published figures at or below `year`.
 *
 * This is the base a projection past `TAX_YEARS` should index forward from:
 * for a year Congress and the IRS have already priced, the published figure is
 * not an estimate to be improved on. Scanned rather than compared against the
 * last element, so a gap in the years on file (2025 and 2027 but not 2026)
 * anchors on 2025 for 2026 instead of on a year with no parameters behind it.
 *
 * Falls back to the earliest year on file for anything below it — unreachable
 * from the app, whose year selector only offers `TAX_YEARS`, but it keeps the
 * return type honest.
 */
export function publishedAnchorYear(year: number): TaxYear {
  let anchor = TAX_YEARS[0];
  for (const y of TAX_YEARS) {
    if (y <= year) anchor = y;
  }
  return anchor;
}

/** The parameters for one tax year. */
export function taxYearParams(year: TaxYear = defaultTaxYear()): TaxYearParams {
  return TAX_YEAR_PARAMS[year];
}

/** The parameters for one filing status in one tax year. */
export function filingParams(
  year: TaxYear = defaultTaxYear(),
  filingStatus: FilingStatus = 'single',
): FilingYearParams {
  return TAX_YEAR_PARAMS[year].filing[filingStatus];
}

/** The same, read straight off a scenario. */
export function filingParamsFor(scenario: Scenario = {}): FilingYearParams {
  const { year, filingStatus, projected } = resolveScenario(scenario);
  return projected ? projected.filing : filingParams(year, filingStatus);
}

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
  const { standardDeduction, additionalStdDeduction65 } = filingParamsFor(scenario);
  return (
    standardDeduction + seniorCount(filingStatus, seniors) * additionalStdDeduction65
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
  // 151(d)(5)(C)(i) names one threshold, $150,000, "in the case of a joint
  // return", and $75,000 in every other case. A head of household is not a
  // married individual, so clause (v) never bites and the deduction is
  // available in full at the unmarried threshold.
  hoh: 75_000,
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
  // 151(d)(5)(D): "shall not apply to taxable years beginning after December
  // 31, 2028." Unreachable while `year` is the only dating on a scenario, since
  // every published year is inside the window — but the projection runs past
  // 2028, and the deduction vanishing there is a step in the curve, not a
  // rounding error.
  const taxYear = scenarioYear(scenario);
  if (taxYear < SENIOR_DEDUCTION_FIRST_YEAR || taxYear > SENIOR_DEDUCTION_LAST_YEAR) {
    return 0;
  }
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
 * SSA benefit figures for a tax year (monthly x 12). Max is for a worker
 * claiming at age 70; average is the retired-worker benefit in January of that
 * year. Both move with the COLA — unlike the thresholds in `SS_BASES`, which
 * is exactly why the torpedo widens every year.
 */
export function maxAnnualSSBenefit(year: TaxYear = defaultTaxYear()): number {
  return taxYearParams(year).maxAnnualSSBenefit;
}

export function avgAnnualSSBenefit(year: TaxYear = defaultTaxYear()): number {
  return taxYearParams(year).avgAnnualSSBenefit;
}

/* ------------------------------------------------------------------ */
/*  Qualified charitable distributions (IRC 408(d)(8))                */
/* ------------------------------------------------------------------ */

/**
 * The age at which an IRA owner may start making QCDs: 70 1/2, measured to the
 * day, not to the tax year.
 *
 * Deliberately *not* the required-beginning age. SECURE raised the RMD age to
 * 72 and SECURE 2.0 to 73 and then 75, but 408(d)(8)(B)(ii) still says "on or
 * after the date that the individual for whose benefit the plan is maintained
 * has attained age 70 1/2", and neither act touched it. So there is a window —
 * five years wide for someone with an applicable age of 75 — where a filer can
 * give from the IRA before anything is required to come out of it, which is the
 * cheapest QCD there is: it shrinks the balance every later RMD is measured
 * against, with no distribution to displace.
 */
export const QCD_MIN_AGE = 70.5;

/** The per-individual annual QCD limit for a tax year. */
export function qcdAnnualLimit(year: TaxYear = defaultTaxYear()): number {
  return taxYearParams(year).qcdAnnualLimit;
}

/** The one-time split-interest-entity QCD limit for a tax year. */
export function qcdSplitInterestLimit(year: TaxYear = defaultTaxYear()): number {
  return taxYearParams(year).qcdSplitInterestLimit;
}

/**
 * The most this return may exclude in a year.
 *
 * 408(d)(8)(A) caps "the aggregate amount of distributions ... which may be
 * excluded" per *individual*, not per return, so a joint return where both
 * spouses have reached 70 1/2 and each gives from their own IRA gets the limit
 * twice. A separate return carries one individual, so it gets it once, exactly
 * like a single filer.
 *
 * The doubling assumes both spouses qualify and both own an IRA — the app has
 * no field for either — but the limit only binds past six figures of ordinary
 * income, well beyond where this makes any difference to the curve.
 *
 * Read off `year` rather than `scenarioYear`, because the limit only exists for
 * years the IRS has published. A projected year borrows its anchor year's
 * figure; nothing projects a QCD today.
 */
export function qcdLimitFor(scenario: Scenario = {}): number {
  const { filingStatus, year } = resolveScenario(scenario);
  return qcdAnnualLimit(year) * (filingStatus === 'mfj' ? 2 : 1);
}

/**
 * The gift after the statutory limit but before the income cap — how much of
 * what was asked for the law would allow, if there were a distribution that
 * size to take it from.
 */
export function qcdAllowed(scenario: Scenario = {}): number {
  const { qcd } = resolveScenario(scenario);
  return Math.min(Math.max(0, qcd), qcdLimitFor(scenario));
}

/**
 * What the QCD actually keeps off the return: `qcdAllowed`, capped again by the
 * ordinary income there is to exclude it from.
 *
 * The second cap is what makes `ordinaryIncome` the pre-QCD figure rather than
 * the post-QCD one. A QCD is not a deduction that can run past the income it
 * offsets — it is an exclusion of a distribution, so there has to be a
 * distribution. The app cannot tell how much of the ordinary-income slider is
 * IRA money and how much is a pension or a paycheck, so it assumes the whole of
 * it could be: a loose upper bound, and the only one available.
 */
export function qcdFor(scenario: Scenario = {}): number {
  const { ordinaryIncome } = resolveScenario(scenario);
  return Math.min(qcdAllowed(scenario), Math.max(0, ordinaryIncome));
}

/**
 * Ordinary income as the return will actually show it, with the QCD removed.
 *
 * This — not `Scenario.ordinaryIncome` — is what every downstream figure is
 * built on, and it is the whole point of the provision. 408(d)(8)(A) excludes
 * the distribution from gross income outright, so it never reaches AGI, and
 * because 86(b)(2) builds provisional income out of AGI, it never reaches
 * provisional income either. A charitable *deduction* for the same gift would
 * do neither: deductions come off after AGI is fixed, so they cannot untax a
 * single dollar of Social Security. And a retiree taking the standard deduction
 * gets nothing at all from a cash gift, which is most of them.
 */
export function ordinaryIncomeAfterQcd(scenario: Scenario = {}): number {
  return resolveScenario(scenario).ordinaryIncome - qcdFor(scenario);
}

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
  const included = includedUnder86a(scenario);
  const { taxableSSCap } = resolveScenario(scenario);
  // IRC 86(e) caps the inclusion; it never raises it. See `Scenario.taxableSSCap`.
  return taxableSSCap === null ? included : Math.min(included, taxableSSCap);
}

/** 86(a) on its own, before the 86(e) ceiling. Split out only so the cap has
 * one place to apply rather than three early returns to chase. */
function includedUnder86a(scenario: Scenario = {}): number {
  const { ssBenefit, ltcg, muniInterest, filingStatus } = resolveScenario(scenario);
  // Deliberately not read off the tax year: IRC 86(c) has never been indexed.
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];
  // Net of any QCD: provisional income is built from gross income, and an
  // excluded distribution never got there. See `ordinaryIncomeAfterQcd`.
  const provisional =
    ordinaryIncomeAfterQcd(scenario) + ltcg + muniInterest + 0.5 * ssBenefit;
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

/**
 * The ordinary-income tax on an already-computed taxable income, under the
 * scenario's filing status and tax year. Takes the whole scenario rather than
 * the two fields it reads, so a caller cannot pass a status and forget a year.
 */
export function federalIncomeTax(
  taxableIncome: number,
  scenario: Scenario = {},
): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of filingParamsFor(scenario).brackets) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/**
 * Adjusted gross income: ordinary income net of any qualified charitable
 * distribution, capital gains, and whatever share of the benefit the torpedo
 * has dragged in.
 *
 * Tax-exempt interest is deliberately absent. It raises provisional income, so
 * it can pull benefits into AGI — but it never lands in AGI itself, and it is
 * not added back for the senior deduction's MAGI either (unlike the MAGI
 * Medicare uses for IRMAA, which does add it back; see `irmaaMagi`). The only
 * trace it leaves in the tax base is the benefits it dragged in.
 */
export function agiFor(scenario: Scenario = {}): number {
  const { ltcg } = resolveScenario(scenario);
  return ordinaryIncomeAfterQcd(scenario) + ltcg + taxableSocialSecurity(scenario);
}

/**
 * Split a point on an other-income axis into the two halves the tax chain
 * wants: what is charged under the ordinary rate schedule, and what is charged
 * under the capital-gain one.
 *
 * A gain is a *share* of the income a filer has, not something stacked on top
 * of it — the $12,000 of stock they sold is part of the $60,000 they lived on,
 * not $12,000 more. Both halves reach provisional income identically, so the
 * split is invisible to the Social Security torpedo; where it shows up is the
 * rate schedule each half is charged under, and the charitable exclusion,
 * which has only the ordinary half to come out of (see `qcdFor`).
 *
 * A gain larger than the income it is carved from is clamped rather than
 * driving the ordinary half negative: there is no $10,000 gain inside $5,000
 * of income.
 */
export function splitOtherIncome(
  otherIncome: number,
  ltcg = 0,
): { ordinaryIncome: number; ltcg: number } {
  const gain = Math.min(Math.max(0, ltcg), Math.max(0, otherIncome));
  return { ordinaryIncome: Math.max(0, otherIncome) - gain, ltcg: gain };
}

/* ------------------------------------------------------------------ */
/*  Where the income axis should stop                                  */
/* ------------------------------------------------------------------ */

/**
 * Bisects a monotonically non-decreasing function of other income for the
 * first point at which it reaches `target`.
 *
 * Every income definition on this page — provisional income, AGI, Medicare's
 * MAGI — rises with other income at a slope of 1, 1.5 or 1.85 depending on
 * which part of the torpedo the dollar lands in, and never falls. That is
 * enough for bisection to invert them exactly; a closed form would need one
 * case per segment of one function, and this app has three of them.
 *
 * `high` has to be an income the target is certainly reached by, and every
 * caller here has one to hand.
 */
function otherIncomeAt(
  target: number,
  high: number,
  valueAt: (income: number) => number,
): number {
  if (valueAt(0) >= target) return 0;
  let low = 0;
  let top = Math.max(0, high);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + top) / 2;
    if (valueAt(mid) < target) low = mid;
    else top = mid;
  }
  return (low + top) / 2;
}

/**
 * The other income at which the taxable share of the benefit stops rising —
 * the right-hand foot of the torpedo, where 85% of the benefit is in the tax
 * base and no further dollar can drag in a cent more.
 *
 * This is the one point on the chart the whole app is about. Everything to the
 * left of it is the hump; everything to the right is an ordinary rate schedule
 * with the benefit fully taxed. Returns 0 when the cap already binds at no
 * other income at all, which a separate return living with a spouse manages by
 * half the benefit alone.
 */
export function otherIncomeAtTaxableSSCap(scenario: Scenario = {}): number {
  const { ssBenefit, filingStatus, ltcg, taxableSSCap } = resolveScenario(scenario);
  if (ssBenefit <= 0) return 0;
  // 86(e) can hold the inclusion below 85% for a retroactive award, and then
  // the curve flattens at the ceiling instead. See `Scenario.taxableSSCap`.
  const cap =
    taxableSSCap === null ? 0.85 * ssBenefit : Math.min(0.85 * ssBenefit, taxableSSCap);
  const gift = qcdAllowed(scenario);
  // Provisional income is other income less the excluded gift, plus muni
  // interest and half the benefit, and the cap needs at most `ssBase85` plus
  // the whole benefit of it — so this always overshoots.
  const high = SS_BASES[filingStatus].ssBase85 + ssBenefit + gift;
  return otherIncomeAt(cap - 0.01, high, (income) =>
    taxableSocialSecurity({ ...scenario, ...splitOtherIncome(income, ltcg) }),
  );
}

/**
 * The other income at which AGI first reaches `targetAgi`, for a fixed benefit.
 *
 * The senior deduction's phaseout is measured against AGI, so this is what puts
 * its two ends on the chart's own axis — and they land at *less* other income
 * than their MAGI figures suggest, because the benefits the torpedo has dragged
 * in are in AGI too. Note this is not Medicare's MAGI: tax-exempt interest is
 * not added back here, so muni interest moves this only through the benefits it
 * pulls in. See `otherIncomeAtIrmaaMagi` for the other one.
 */
export function otherIncomeAtAgi(
  targetAgi: number,
  scenario: Scenario = {},
): number {
  const { ltcg } = resolveScenario(scenario);
  // AGI is never below other income less the excluded gift, so the target plus
  // the gift always overshoots.
  const high = targetAgi + qcdAllowed(scenario);
  return otherIncomeAt(targetAgi, high, (income) =>
    agiFor({ ...scenario, ...splitOtherIncome(income, ltcg) }),
  );
}

/** Where the things worth seeing fall on the ordinary-income axis. */
export interface IncomeAxisFeatures {
  /** Where the torpedo ends: `otherIncomeAtTaxableSSCap`. */
  torpedoEnd: number;
  /**
   * Where the senior deduction's phaseout ends, or `null` when this return
   * cannot claim it — a separate return, a filer under 65, a year outside
   * 2025-2028. Null means there is no second hump to make room for.
   */
  seniorPhaseoutEnd: number | null;
  /**
   * Where the charitable gift runs out: the last dollar of other income it can
   * be excluded from, which is the gift itself plus whatever of that income is
   * a gain — 408(d)(8) excludes a *distribution*, and a sale is not one. 0
   * when there is no gift.
   *
   * Left of it every ordinary dollar is given away and the curve is flat at
   * nothing; right of it the return starts again from zero. Normally it sits
   * well inside `torpedoEnd`, which the same gift pushes right dollar for
   * dollar — it binds only when there is no torpedo left to push, which is a
   * benefit of $0, or enough tax-exempt interest to have capped the taxable
   * share before the first dollar of other income lands.
   */
  giftEnd: number;
}

/**
 * The right-hand feet of everything worth seeing, on the axis the chart
 * actually plots.
 *
 * All three are *ends*: past them the curve is a flat rate schedule that says
 * nothing the reader has not already seen. That is what makes them the right
 * thing to size an axis by.
 */
export function incomeAxisFeatures(scenario: Scenario = {}): IncomeAxisFeatures {
  const { filingStatus, seniors, ltcg } = resolveScenario(scenario);
  // Read off `seniorDeductionFor` rather than re-testing its conditions: the
  // phaseout is worth axis space exactly when there is a deduction to phase
  // out, which is age, filing status and tax year all at once.
  const claimed = seniorDeductionFor({ ...scenario, seniors }, 0) > 0;
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  const gift = qcdAllowed(scenario);
  return {
    torpedoEnd: otherIncomeAtTaxableSSCap(scenario),
    seniorPhaseoutEnd:
      claimed && phaseoutEnd !== null ? otherIncomeAtAgi(phaseoutEnd, scenario) : null,
    giftEnd: gift > 0 ? gift + Math.max(0, ltcg) : 0,
  };
}

/**
 * The floor under every income axis: the constant the axis used to be, kept as
 * the narrowest it may become.
 *
 * $150,000 was wrong at the top end and fine at the bottom. It puts an
 * unmarried return's first three IRMAA cliffs on the chart — the first lands
 * around $86,000 of other income once a typical benefit is in AGI, which is
 * well past where any torpedo ends — and it is as far as the slider under the
 * chart has ever let a reader take their own income. Neither is worth taking
 * away to tighten the frame around a hump that is already fully drawn, so the
 * axis only ever grows from here.
 */
export const MIN_INCOME_AXIS = 150_000;

/** How the axis is sized around `incomeAxisFeatures`. */
export interface IncomeAxisRange {
  /** Fraction of the last feature to leave as tail past it. */
  headroom?: number;
  /** Round the answer up to a multiple of this, for legible ticks. */
  roundTo?: number;
  /** Never stop short of this. */
  minimum?: number;
}

/**
 * Where the ordinary-income axis should stop for this scenario.
 *
 * A constant cannot do this job. $150,000 shows a single filer the whole
 * torpedo and three IRMAA cliffs, but cuts the senior-deduction phaseout in
 * half — it ends at $175,000 of MAGI for an unmarried return and $250,000 for
 * a joint one — so the second hump on the curve had no right-hand side, and
 * the explainer under the chart had to say so in prose instead of the chart
 * showing it.
 *
 * So the axis ends a little past the last thing that happens on the curve,
 * never below `MIN_INCOME_AXIS`, rounded up to something the tick labels can
 * live with. Callers who need the axis to contain a point of their own — the
 * reader's own income, wherever they left the slider — pass it as `minimum`.
 *
 * A charitable gift is the other input the reader sets in dollars of this same
 * axis, and 408(d)(8) lets a joint return give $216,000 of them. The axis has
 * to reach past it or the gift is a slider whose effect is off the right edge
 * of every chart: see `IncomeAxisFeatures.giftEnd`.
 */
export function incomeAxisMax(
  scenario: Scenario = {},
  { headroom = 0.05, roundTo = 25_000, minimum = MIN_INCOME_AXIS }: IncomeAxisRange = {},
): number {
  const { torpedoEnd, seniorPhaseoutEnd, giftEnd } = incomeAxisFeatures(scenario);
  const lastFeature = Math.max(torpedoEnd, seniorPhaseoutEnd ?? 0, giftEnd);
  const wanted = Math.max(minimum, lastFeature * (1 + headroom));
  return Math.ceil(wanted / roundTo) * roundTo;
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
  /**
   * Read the scenario's `ltcg` as a share *of* the swept income rather than a
   * gain stacked on top of it, so the axis is every dollar that is not Social
   * Security and the composition — how much of it is gain — is held fixed
   * across the sweep. See `splitOtherIncome`.
   *
   * Off by default, which is the additive reading the statute takes: gains and
   * ordinary income are separate line items and nothing stops a filer having
   * both. On is what a chart wants when the reader has been asked for one
   * income figure and then asked how much of it is gain.
   *
   * The marginal dollar follows the same rule. Above the gain the next dollar
   * of income is ordinary, because the gain is already fully counted; below it
   * the next dollar is gain, because at that income there is nothing else it
   * could be.
   */
  gainsWithinIncome?: boolean;
}

export function marginalRateCurve(
  scenario: Scenario = {},
  { maxIncome = 150_000, step = 250, gainsWithinIncome = false }: IncomeCurveRange = {},
): MarginalRatePoint[] {
  const gain = resolveScenario(scenario).ltcg;
  const at = (income: number): Scenario =>
    gainsWithinIncome
      ? { ...scenario, ...splitOtherIncome(income, gain) }
      : { ...scenario, ordinaryIncome: income };
  const data: MarginalRatePoint[] = [];
  for (let income = 0; income <= maxIncome; income += step) {
    const taxHere = totalTax(at(income));
    const rate = totalTax(at(income + 1)) - taxHere;
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

/**
 * Total federal income tax on the scenario: ordinary income plus whatever share
 * of the benefit is taxable, with long-term gains stacked on top in their own
 * brackets.
 *
 * Ordinary income (taxable SS included, any QCD already excluded) fills the
 * ordinary brackets first; LTCG is then taxed at its preferential rates, but
 * the LTCG thresholds are measured against the *full* taxable income, ordinary
 * and gains together.
 *
 * LTCG also counts toward provisional income, so adding gains can drag benefits
 * into taxable income at ordinary rates — the "stacking" effect. Leave `ltcg`
 * unset and this is the plain ordinary-income tax.
 *
 * The Medicare IRMAA surcharge is not part of this: it is a premium, not a tax.
 * See `irmaaFor`.
 */
export function totalTax(scenario: Scenario = {}): number {
  const ordinaryIncome = ordinaryIncomeAfterQcd(scenario);

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
  for (const { upTo, rate } of filingParamsFor(scenario).ltcgBrackets) {
    const bandStart = Math.max(ordinaryTaxable, lower);
    const bandEnd = Math.min(totalTaxable, upTo);
    if (bandEnd > bandStart) {
      ltcgTax += (bandEnd - bandStart) * rate;
    }
    lower = upTo;
  }

  return federalIncomeTax(ordinaryTaxable, scenario) + ltcgTax;
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
  /**
   * Carve the swept gain out of the scenario's `ordinaryIncome` instead of
   * stacking it on top, so the axis stops being "how much gain do you add" and
   * becomes "how much of the income you already have is gain". Total income is
   * then the same at every point on the sweep and only its composition moves.
   * See `splitOtherIncome`.
   *
   * Provisional income does not move either — a dollar of gain and a dollar of
   * ordinary income raise it identically — so the swept axis holds the taxable
   * share of the benefit fixed, and what is left varying is which rate
   * schedule the dollar is charged under and where the gain stack sits against
   * the 0%/15%/20% bands.
   *
   * The reported rate is still the cost of the *next* dollar realized as a
   * gain, on top of everything: the axis says how the income already there is
   * split, the rate says what one more gain dollar would cost given that
   * split. Off by default, which is the additive reading.
   */
  gainsWithinIncome?: boolean;
}

export function ltcgMarginalRateCurve(
  scenario: Scenario = {},
  { maxLTCG = 200_000, step = 250, gainsWithinIncome = false }: LtcgCurveRange = {},
): LTCGMarginalRatePoint[] {
  const otherIncome = resolveScenario(scenario).ordinaryIncome;
  const at = (gain: number): Scenario =>
    gainsWithinIncome
      ? { ...scenario, ...splitOtherIncome(otherIncome, gain) }
      : { ...scenario, ltcg: gain };
  const data: LTCGMarginalRatePoint[] = [];
  for (let ltcg = 0; ltcg <= maxLTCG; ltcg += step) {
    const here = at(ltcg);
    const taxHere = totalTax(here);
    const rate = totalTax({ ...here, ltcg: (here.ltcg ?? 0) + 1 }) - taxHere;
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

/* ------------------------------------------------------------------ */
/*  What a qualified charitable distribution is worth                 */
/* ------------------------------------------------------------------ */

export interface QcdEffect {
  /** The gift the scenario asked for, before either cap. */
  requested: number;
  /** This return's annual statutory limit — see `qcdLimitFor`. */
  limit: number;
  /** The gift after the statutory limit, before the income cap. */
  allowed: number;
  /** What actually stays off the return — see `qcdFor`. */
  excluded: number;
  /** The statutory limit is what stopped it. */
  limitedByLaw: boolean;
  /** There was not enough ordinary income to exclude it from. */
  limitedByIncome: boolean;
  /** Ordinary income before the exclusion. */
  ordinaryIncomeBefore: number;
  /** Ordinary income the return actually shows. */
  ordinaryIncomeAfter: number;
  /** Taxable Social Security with the gift taken as a taxable distribution. */
  taxableSSWithout: number;
  /** Taxable Social Security once the distribution is excluded. */
  taxableSSWith: number;
  /** Benefits the exclusion takes back out of the tax base. */
  taxableSSRemoved: number;
  /** AGI without the exclusion. */
  agiWithout: number;
  /** AGI with it. */
  agiWith: number;
  /** Federal tax without the exclusion. */
  taxWithout: number;
  /** Federal tax with it. */
  taxWith: number;
  /** taxWithout - taxWith: what the exclusion saves. */
  taxSaved: number;
  /** Average federal tax saved per excluded dollar, in percent. */
  savedPerDollar: number;
  /** Federal tax saved by the *next* excluded dollar, in percent. */
  ratePerNextDollar: number;
  /** Medicare's MAGI without the exclusion. */
  irmaaMagiWithout: number;
  /** Medicare's MAGI with it. */
  irmaaMagiWith: number;
  /** IRMAA tier without the exclusion; 0 when no surcharge applies. */
  irmaaTierWithout: number;
  /** IRMAA tier with it. */
  irmaaTierWith: number;
  /** Household annual IRMAA surcharge without the exclusion. */
  irmaaSurchargeWithout: number;
  /** Household annual IRMAA surcharge with it. */
  irmaaSurchargeWith: number;
  /** What the exclusion saves in surcharge, two years out. */
  irmaaSurchargeSaved: number;
}

/**
 * What a qualified charitable distribution is worth to a Social Security
 * recipient, against the same gift taken as an ordinary distribution.
 *
 * The comparison is deliberately *not* "gift versus no gift". Someone choosing
 * between a QCD and a check has already decided to give; what they are choosing
 * is the route. Taken as a distribution the money lands in gross income, drags
 * benefits in behind it under 86(b), and — for the roughly nine in ten filers
 * who take the standard deduction — buys no offsetting deduction whatever. Sent
 * under 408(d)(8) it never enters gross income, so provisional income never
 * sees it, and neither does Medicare's MAGI two years later.
 *
 * That last part is why a QCD can be worth far more than its own bracket rate:
 * a dollar excluded inside the torpedo removes up to 85 cents of benefits from
 * the tax base as well as itself, and a dollar excluded just over an IRMAA
 * threshold takes a whole year of surcharges with it.
 */
export function qcdEffect(scenario: Scenario = {}): QcdEffect {
  const { qcd, ordinaryIncome } = resolveScenario(scenario);
  const without: Scenario = { ...scenario, qcd: 0 };

  const limit = qcdLimitFor(scenario);
  const allowed = qcdAllowed(scenario);
  const excluded = qcdFor(scenario);

  const taxAt = (amount: number): number => totalTax({ ...scenario, qcd: amount });
  const taxWithRaw = taxAt(qcd);
  const taxWithout = Math.round(taxAt(0));
  const taxWith = Math.round(taxWithRaw);
  const taxSaved = taxWithout - taxWith;

  const taxableSSWithout = taxableSocialSecurity(without);
  const taxableSSWith = taxableSocialSecurity(scenario);

  const magiWithout = irmaaMagi(without);
  const magiWith = irmaaMagi(scenario);
  const irmaaWithout = irmaaFor(magiWithout, without);
  const irmaaWith = irmaaFor(magiWith, scenario);

  return {
    requested: qcd,
    limit,
    allowed,
    excluded,
    limitedByLaw: qcd > limit,
    limitedByIncome: allowed > Math.max(0, ordinaryIncome),
    ordinaryIncomeBefore: Math.round(ordinaryIncome),
    ordinaryIncomeAfter: Math.round(ordinaryIncomeAfterQcd(scenario)),
    taxableSSWithout: Math.round(taxableSSWithout),
    taxableSSWith: Math.round(taxableSSWith),
    taxableSSRemoved: Math.round(taxableSSWithout - taxableSSWith),
    agiWithout: Math.round(agiFor(without)),
    agiWith: Math.round(agiFor(scenario)),
    taxWithout,
    taxWith,
    taxSaved,
    savedPerDollar:
      excluded > 0 ? Math.round((taxSaved / excluded) * 10_000) / 100 : 0,
    // Backwards against the muni version on purpose: there the next dollar
    // costs, here it saves, so both read as a positive percentage.
    ratePerNextDollar: Math.round((taxWithRaw - taxAt(qcd + 1)) * 10_000) / 100,
    irmaaMagiWithout: Math.round(magiWithout),
    irmaaMagiWith: Math.round(magiWith),
    irmaaTierWithout: irmaaWithout.tier,
    irmaaTierWith: irmaaWith.tier,
    irmaaSurchargeWithout: irmaaWithout.annualSurcharge,
    irmaaSurchargeWith: irmaaWith.annualSurcharge,
    irmaaSurchargeSaved: toCents(
      irmaaWithout.annualSurcharge - irmaaWith.annualSurcharge,
    ),
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

/**
 * Medicare sets a year's premium from the MAGI on the return filed two years
 * earlier, because that is the most recent return the IRS has shared with SSA
 * when premiums are set (42 U.S.C. 1395r(i)(4)(B)). So the 2026 premium is
 * driven by 2024 income, and this year's income sets the premium two years out.
 */
export const IRMAA_LOOKBACK_YEARS = 2;

/** The tax year whose MAGI sets a given premium year's surcharge. */
export function irmaaMagiYear(premiumYear: TaxYear = defaultTaxYear()): number {
  return premiumYear - IRMAA_LOOKBACK_YEARS;
}

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
   * lands in the tier. Only the top tier works this way, and it does for every
   * status: the last row of the rate table at 42 U.S.C. 1395r(i)(3)(C)(i)(III)
   * reads "At least $500,000" where every row above it reads "More than", and
   * clauses (ii) and (iii) carry that row across to joint and separate returns.
   * CMS reproduces the difference verbatim - "greater than or equal to" in the
   * last row of all three of its tables, "greater than" everywhere else.
   */
  inclusiveFor?: FilingStatus[];
  /**
   * Monthly Part B surcharge - CMS's "income-related monthly adjustment amount"
   * column, taken as published rather than derived, so a year's figures can be
   * checked against the fact sheet line by line. 0 for the standard tier.
   */
  partBSurchargeMonthly: number;
  /** Total monthly Part B premium, standard premium included. */
  partBMonthly: number;
  /**
   * Monthly Part D surcharge. Only the surcharge - the plan's own premium is
   * set by the insurer, not by CMS, so there is no standard amount to add.
   */
  partDSurchargeMonthly: number;
}

/** One premium year's published Medicare schedule. */
export interface IrmaaYearParams {
  /** Where the figures come from. */
  source: string;
  /** Standard Part B premium per beneficiary per month, before any surcharge. */
  partBStandardPremium: number;
  /** Tier 0 first, then the five surcharge tiers ascending. */
  tiers: IrmaaTier[];
}

/**
 * The IRMAA schedule by premium year, keyed to the MAGI of two years earlier.
 *
 * This is deliberately its own table rather than a field on `TAX_YEAR_PARAMS`:
 * the figures come from a CMS fact sheet each November, not from the autumn
 * Rev. Proc., and they are premiums rather than tax. `Record<TaxYear, ...>`
 * still makes them exhaustive, so adding a year to `TaxYear` fails to compile
 * until its premiums are filled in here too.
 *
 * Within a year, the joint thresholds are exactly double the single ones except
 * at the top: the $500,000 / $750,000 tier added by the Bipartisan Budget Act
 * of 2018 is fixed in statute and not indexed until years beginning after 2027
 * (42 U.S.C. 1395r(i)(5)(C)), which is why it is the one threshold that does
 * not move between 2025 and 2026.
 *
 * Head of household is not a Medicare category at all. 42 U.S.C.
 * 1395r(i)(3)(C) has exactly three clauses - (ii) for a joint return, (iii) for
 * a married individual filing separately, and (i) for "an individual with a
 * taxable year beginning in such calendar year who is not described in clause
 * (ii) or (iii)". A head of household is not described in either, so it lands
 * in (i) alongside single filers, and SSA's POMS HI 01101.020 heads that table
 * "Single, head-of-household, or qualifying surviving spouse with dependent
 * child tax filing status". Its thresholds are therefore the single column
 * repeated, not an amount of its own - which is why the table on screen shows
 * one "individual return" column for the two of them.
 *
 * A separate return that lived with the spouse gets its own two-step schedule
 * under 42 U.S.C. 1395r(i)(3)(C)(iii) rather than a halved version of the joint
 * one. It reuses tiers 4 and 5's premiums but reaches them at the unmarried
 * threshold and at $500,000 less that threshold - which is why its top rung
 * fell from $394,000 to $391,000 while the single top rung stayed at $500,000.
 * Tiers 1 through 3 simply do not exist for it - marked `Infinity` here and
 * filtered out by `irmaaTiersFor`. The practical effect is brutal: a separate
 * filer's first cliff is the *fourth* tier, so the whole surcharge lands in one
 * step instead of arriving in four.
 */
export const IRMAA_YEAR_PARAMS: Record<TaxYear, IrmaaYearParams> = {
  2025: {
    source: 'CMS fact sheet, November 2024 (2025 premiums, 2023 MAGI)',
    partBStandardPremium: 185.0,
    tiers: [
      {
        tier: 0,
        magiOver: { single: -Infinity, mfj: -Infinity, mfs: -Infinity, hoh: -Infinity },
        partBSurchargeMonthly: 0,
        partBMonthly: 185.0,
        partDSurchargeMonthly: 0,
      },
      {
        tier: 1,
        magiOver: { single: 106_000, mfj: 212_000, mfs: Infinity, hoh: 106_000 },
        partBSurchargeMonthly: 74.0,
        partBMonthly: 259.0,
        partDSurchargeMonthly: 13.7,
      },
      {
        tier: 2,
        magiOver: { single: 133_000, mfj: 266_000, mfs: Infinity, hoh: 133_000 },
        partBSurchargeMonthly: 185.0,
        partBMonthly: 370.0,
        partDSurchargeMonthly: 35.3,
      },
      {
        tier: 3,
        magiOver: { single: 167_000, mfj: 334_000, mfs: Infinity, hoh: 167_000 },
        partBSurchargeMonthly: 295.9,
        partBMonthly: 480.9,
        partDSurchargeMonthly: 57.0,
      },
      {
        tier: 4,
        magiOver: { single: 200_000, mfj: 400_000, mfs: 106_000, hoh: 200_000 },
        partBSurchargeMonthly: 406.9,
        partBMonthly: 591.9,
        partDSurchargeMonthly: 78.6,
      },
      {
        tier: 5,
        magiOver: { single: 500_000, mfj: 750_000, mfs: 394_000, hoh: 500_000 },
        inclusiveFor: ['single', 'mfj', 'mfs', 'hoh'],
        partBSurchargeMonthly: 443.9,
        partBMonthly: 628.9,
        partDSurchargeMonthly: 85.8,
      },
    ],
  },
  2026: {
    source: 'CMS fact sheet, November 14 2025 (2026 premiums, 2024 MAGI)',
    partBStandardPremium: 202.9,
    tiers: [
      {
        tier: 0,
        magiOver: { single: -Infinity, mfj: -Infinity, mfs: -Infinity, hoh: -Infinity },
        partBSurchargeMonthly: 0,
        partBMonthly: 202.9,
        partDSurchargeMonthly: 0,
      },
      {
        tier: 1,
        magiOver: { single: 109_000, mfj: 218_000, mfs: Infinity, hoh: 109_000 },
        partBSurchargeMonthly: 81.2,
        partBMonthly: 284.1,
        partDSurchargeMonthly: 14.5,
      },
      {
        tier: 2,
        magiOver: { single: 137_000, mfj: 274_000, mfs: Infinity, hoh: 137_000 },
        partBSurchargeMonthly: 202.9,
        partBMonthly: 405.8,
        partDSurchargeMonthly: 37.5,
      },
      {
        tier: 3,
        magiOver: { single: 171_000, mfj: 342_000, mfs: Infinity, hoh: 171_000 },
        partBSurchargeMonthly: 324.6,
        partBMonthly: 527.5,
        partDSurchargeMonthly: 60.4,
      },
      {
        tier: 4,
        magiOver: { single: 205_000, mfj: 410_000, mfs: 109_000, hoh: 205_000 },
        partBSurchargeMonthly: 446.3,
        partBMonthly: 649.2,
        partDSurchargeMonthly: 83.3,
      },
      {
        tier: 5,
        magiOver: { single: 500_000, mfj: 750_000, mfs: 391_000, hoh: 500_000 },
        inclusiveFor: ['single', 'mfj', 'mfs', 'hoh'],
        partBSurchargeMonthly: 487.0,
        partBMonthly: 689.9,
        partDSurchargeMonthly: 91.0,
      },
    ],
  },
};

/** One premium year's schedule. */
export function irmaaParams(year: TaxYear = defaultTaxYear()): IrmaaYearParams {
  return IRMAA_YEAR_PARAMS[year];
}

/** Standard Part B premium per beneficiary per month, before any surcharge. */
export function partBStandardPremium(year: TaxYear = defaultTaxYear()): number {
  return IRMAA_YEAR_PARAMS[year].partBStandardPremium;
}

/** Every published tier for a year, whether or not a given status can reach it. */
export function allIrmaaTiers(year: TaxYear = defaultTaxYear()): IrmaaTier[] {
  return IRMAA_YEAR_PARAMS[year].tiers;
}

/**
 * The tiers a scenario's filing status can actually land in, standard-premium
 * tier first and ascending. Everything downstream - which tier a MAGI falls in,
 * what the next cliff is, where the reference lines go - walks this rather than
 * the raw schedule, so a separate return never sees the three tiers it has no
 * access to.
 */
export function irmaaTiersFor(scenario: Scenario = {}): IrmaaTier[] {
  const { filingStatus, year } = resolveScenario(scenario);
  return allIrmaaTiers(year).filter(
    (t) => t.tier === 0 || Number.isFinite(t.magiOver[filingStatus]),
  );
}

/** The first surcharge tier a filing status can reach. Tier 1, except for MFS. */
export function firstIrmaaTier(scenario: Scenario = {}): IrmaaTier {
  return irmaaTiersFor(scenario)[1];
}

/**
 * The MAGI at which a scenario meets its first IRMAA cliff. A true cliff: one
 * dollar over triggers a full year of Part B and Part D surcharges.
 */
export function irmaaFirstCliffMagi(scenario: Scenario = {}): number {
  const { filingStatus } = resolveScenario(scenario);
  return firstIrmaaTier(scenario).magiOver[filingStatus];
}

/** Whether a MAGI has reached a tier, honouring the inclusive top threshold. */
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

/**
 * Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4),
 * incorporating IRC 6103(l)(20)). Note this is a *wider* definition than the
 * one the OBBBA senior deduction phases out against, which never adds the
 * tax-exempt interest back - see `seniorDeductionFor`.
 */
export function irmaaMagi(scenario: Scenario = {}): number {
  return agiFor(scenario) + resolveScenario(scenario).muniInterest;
}

/**
 * The tier a given MAGI lands in. Thresholds are exclusive - over, not at -
 * except for the top one, which the statute writes as "at least".
 */
export function irmaaTierFor(
  magi: number,
  scenario: Scenario = {},
): IrmaaTier {
  const { filingStatus } = resolveScenario(scenario);
  const tiers = irmaaTiersFor(scenario);
  let found = tiers[0];
  for (const tier of tiers) {
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
    (tier.partBSurchargeMonthly + tier.partDSurchargeMonthly) * 12 * beneficiaries,
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
  const tiers = irmaaTiersFor(scenario);
  const tier = irmaaTierFor(magi, scenario);
  const next = tiers[tiers.indexOf(tier) + 1] ?? null;
  const partBSurcharge = tier.partBSurchargeMonthly;
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
  // Solves on the chart's x-axis, which is every dollar that is not Social
  // Security, so the scenario's `ordinaryIncome` is overwritten and its `ltcg`
  // is read as a share of the swept figure rather than a gain on top of it —
  // the same reading the charts take. See `splitOtherIncome`.
  //
  // MAGI is very nearly blind to that split, because AGI counts both halves at
  // face value and provisional income does too. The one place it shows is the
  // charitable exclusion, which has only the ordinary half to come out of: a
  // gift bigger than what is left after the gain cannot be excluded in full,
  // and the cliff arrives earlier for it.
  const magiAt = (income: number): number =>
    irmaaMagi({ ...scenario, ...splitOtherIncome(income, resolveScenario(scenario).ltcg) });
  if (magiAt(0) >= targetMagi) return 0;
  // MAGI is never below other income *less the QCD excluded from it*, so
  // targetMagi plus the allowed gift always overshoots. Without that term the
  // bound is too low whenever a QCD is in play and the bisection converges on
  // its own ceiling instead of on the threshold.
  let low = 0;
  let high = targetMagi + qcdAllowed(scenario);
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
  const tiers = irmaaTiersFor(scenario);
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

function bracketTop(scenario: Scenario, rate: number): number {
  const bracket = filingParamsFor(scenario).brackets.find((b) => b.rate === rate);
  return bracket ? bracket.upTo : Infinity;
}

/**
 * The ceilings a retiree might size a Roth conversion against.
 *
 * Takes the whole scenario because three of the six ceilings move with the tax
 * year — the two bracket tops and the 0% capital-gain band — while the two
 * Social Security bases never do. Only `filingStatus` and `year` are read; the
 * income fields are ignored, since a ceiling is a fixed line, not a position
 * relative to one.
 */
export function conversionCeilings(scenario: Scenario = {}): ConversionCeiling[] {
  const { filingStatus } = resolveScenario(scenario);
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];
  // Both bases are $0 on a separate return that lived with the spouse, so the
  // two Social Security ceilings collapse onto each other. Say so rather than
  // offering the same $0 twice with different explanations.
  const basesCollapse = ssBase50 === ssBase85;
  const firstCliff = firstIrmaaTier(scenario);
  return [
    {
      id: 'bracket12',
      label: 'Top of the 12% bracket',
      measure: 'ordinaryTaxableIncome',
      amount: bracketTop(scenario, 0.12),
      note: 'The next dollar of ordinary income is taxed at 22% instead of 12%.',
    },
    {
      id: 'bracket22',
      label: 'Top of the 22% bracket',
      measure: 'ordinaryTaxableIncome',
      amount: bracketTop(scenario, 0.22),
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
      amount: filingParamsFor(scenario).ltcgBrackets[0].upTo,
      note: 'Past this, long-term gains stacked on top of ordinary income are taxed at 15% rather than 0%.',
    },
    {
      id: 'irmaa1',
      label: `IRMAA tier ${firstCliff.tier} (Medicare surcharge)`,
      measure: 'magi',
      amount: irmaaFirstCliffMagi(scenario),
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
  // Net of any QCD, and net of it *after* the conversion, because the exclusion
  // is capped by the ordinary income available to take it from. When that cap
  // is what binds, the first conversion dollars restore excluded dollars
  // one for one and the measure is flat rather than falling — still
  // non-decreasing, so the binary search below stays valid.
  const netOrdinary = ordinaryIncomeAfterQcd(converted);
  const taxableSS = taxableSocialSecurity(converted);
  // AGI, which already includes taxable SS but never includes tax-exempt
  // interest. This is also the base for the senior deduction's phaseout, where
  // tax-exempt interest is *not* added back.
  const agi = agiFor(converted);
  const deduction = deductionFor(converted, agi);
  switch (measure) {
    case 'provisionalIncome':
      return netOrdinary + ltcg + muniInterest + 0.5 * ssBenefit;
    case 'magi':
      // The only ceiling measured this way is IRMAA, and Medicare's MAGI is
      // AGI plus tax-exempt interest — a wider definition than the one the
      // senior deduction phases out against.
      return agi + muniInterest;
    case 'ordinaryTaxableIncome':
      // What the ordinary brackets are measured against: LTCG stacks on top.
      return Math.max(0, netOrdinary + taxableSS - deduction);
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

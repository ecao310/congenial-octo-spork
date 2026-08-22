export interface MarginalRatePoint {
  income: number;
  /**
   * Everything the return takes in at this point on the sweep: `totalIncomeFor`
   * of the same scenario, so the whole benefit and any tax-exempt interest are
   * in it.
   *
   * The swept `income` is what the reader sets; this is what they have. The
   * chart plots against it, so the two are carried together rather than the
   * page re-deriving one from the other point by point.
   */
  totalIncome: number;
  marginalRate: number;
  /**
   * Total federal tax (whole dollars) at this income level: `totalFederalTax`,
   * so the 3.8% surtax of IRC 1411 is in it wherever it applies.
   */
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
  filingStatus?: FilingStatus;
  /** How many people on the return have reached 65; clamped by `maxSeniors`. */
  seniors?: number;
  /** Medicare enrollees on the return. IRMAA is charged per enrollee. */
  beneficiaries?: number;
  /**
   * People in the tax household, which is what the federal poverty line is
   * sized for: the taxpayer, the spouse and the dependents (26 CFR
   * 1.36B-1(d)). Defaults to what the filing status implies — see
   * `defaultHouseholdSize` — so a return with dependents is the only one that
   * has to set it.
   *
   * Nothing but the 400% cliff reads it. The tax code sizes its own figures by
   * filing status rather than by head count, which is exactly why this field
   * exists: 36B is the one place on this page where a fifth person moves a
   * line.
   */
  householdSize?: number;
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
  // Pulled out ahead of the object rather than read off it, because one
  // default is a function of it: a household's size is what the filing status
  // implies until the reader says otherwise.
  const filingStatus = scenario.filingStatus ?? 'single';
  return {
    ordinaryIncome: scenario.ordinaryIncome ?? 0,
    ssBenefit: scenario.ssBenefit ?? 0,
    ltcg: scenario.ltcg ?? 0,
    muniInterest: scenario.muniInterest ?? 0,
    filingStatus,
    seniors: scenario.seniors ?? 0,
    beneficiaries: scenario.beneficiaries ?? 1,
    householdSize: scenario.householdSize ?? defaultHouseholdSize(filingStatus),
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
  /**
   * The same two figures for a joint return, where two people collect.
   *
   * The maximum is the worker maximum doubled: two records, each with 35 years
   * at the taxable maximum, each claimed at 70. The average is not doubled and
   * cannot be. SSA publishes it separately — "aged couple, both receiving
   * benefits" — and it lands well under twice the retired-worker average,
   * because in a large share of those couples the second benefit is a spousal
   * one, worth half the higher earner's primary insurance amount rather than a
   * second full record.
   */
  maxAnnualCoupleSSBenefit: number;
  avgAnnualCoupleSSBenefit: number;
  /** The COLA that produced this year's benefit figures, in percent. */
  colaPercent: number;
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
 * That contrast is the page's whole subject, and these live outside
 * `TAX_YEAR_PARAMS` to say so in the shape of the code rather than being
 * repeated identically under every year in it.
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
    maxAnnualCoupleSSBenefit: 122_592, // two of the above
    avgAnnualCoupleSSBenefit: 37_068, // $3,089/mo, January 2025
    colaPercent: 2.5,
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
    maxAnnualCoupleSSBenefit: 124_344, // two of the above
    avgAnnualCoupleSSBenefit: 38_496, // $3,208/mo, January 2026
    colaPercent: 2.8,
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
          // $201,750, not the single filer's $201,775. Rev. Proc. 2025-32
          // Table 2 prints "$39,207 plus 32% of the excess over $201,750",
          // and $16,155 + 24% x ($201,750 - $105,700) is exactly $39,207 — so
          // the table's own cumulative amounts pin the $25 difference. The
          // 32% band's top is $25 under the single one for the same reason.
          { upTo: 201_750, rate: 0.24 },
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
 * The one year the page prices.
 *
 * The page used to open with a two-button year picker, and switching it was
 * the app's own comparison made live: the COLA raises the benefit every year
 * while IRC 86(c)'s $25,000 and $34,000 bases never move, so the same real
 * retirement is taxed harder each year. That contrast is worth stating and it
 * is not worth a control. It is stated in prose instead — see `SS_BASES` — and
 * every figure on the page now names one year rather than whichever of two the
 * reader last clicked.
 *
 * This is deliberately not `defaultTaxYear()`. That function follows the wall
 * calendar, so a page built on it would silently re-price itself the January
 * after a new year's Rev. Proc. landed, and a link sent in December would mean
 * something different in January. A constant means the year moves when someone
 * changes this line, which is the same moment they check the figures.
 *
 * Everything below `TAX_YEARS` stays parameterized by year regardless: the
 * engine prices any year on file, the tests exercise all of them, and the
 * shelved projection module walks across them. This constant is the render
 * layer's choice, not the calculation's.
 */
export const PAGE_TAX_YEAR: TaxYear = 2026;

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
 * from the page, which prices `PAGE_TAX_YEAR` and nothing else, but it keeps
 * the return type honest.
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
export const SENIOR_DEDUCTION_PHASEOUT_START = {
  single: 75_000,
  mfj: 150_000,
  mfs: null,
  // 151(d)(5)(C)(i) names one threshold, $150,000, "in the case of a joint
  // return", and $75,000 in every other case. A head of household is not a
  // married individual, so clause (v) never bites and the deduction is
  // available in full at the unmarried threshold.
  hoh: 75_000,
  // `satisfies` rather than an annotation, so the table keeps saying *which*
  // status is the null one. A caller naming a status with a threshold gets a
  // number without a check for a case the statute does not give it.
} satisfies Record<FilingStatus, number | null>;

/** Whether a filing status can claim the senior deduction at all. */
export function seniorDeductionAllowed(filingStatus: FilingStatus): boolean {
  return SENIOR_DEDUCTION_PHASEOUT_START[filingStatus] !== null;
}

/**
 * MAGI at which the senior deduction is gone: $175,000 single, $250,000 MFJ.
 * Independent of how many spouses qualify, because the phaseout applies to each
 * one's $6,000 separately. `null` for a separate return, which never had one —
 * and the overloads say so, so only a caller that could be handed that status
 * has a null to answer for.
 */
export function seniorDeductionPhaseoutEnd(
  filingStatus?: 'single' | 'mfj' | 'hoh',
): number;
export function seniorDeductionPhaseoutEnd(filingStatus: FilingStatus): number | null;
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
 *
 * A joint return gets the couple figures instead. `ssBenefit` is line 6a, and
 * on a joint return line 6a holds both spouses' benefits added together; on
 * every other return it holds one person's, including a separate return whose
 * spouse collects a benefit of their own on a return of their own. So the
 * slider's right edge nearly doubles on the way to `mfj` while its average
 * marker moves by much less — see `maxAnnualCoupleSSBenefit` for why those two
 * are not the same multiple.
 */
export function maxAnnualSSBenefit(
  year: TaxYear = defaultTaxYear(),
  filingStatus: FilingStatus = 'single',
): number {
  const params = taxYearParams(year);
  return filingStatus === 'mfj' ? params.maxAnnualCoupleSSBenefit : params.maxAnnualSSBenefit;
}

export function avgAnnualSSBenefit(
  year: TaxYear = defaultTaxYear(),
  filingStatus: FilingStatus = 'single',
): number {
  const params = taxYearParams(year);
  return filingStatus === 'mfj' ? params.avgAnnualCoupleSSBenefit : params.avgAnnualSSBenefit;
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
  const { ordinaryIncome, ssBenefit, ltcg, muniInterest, filingStatus } =
    resolveScenario(scenario);
  // Deliberately not read off the tax year: IRC 86(c) has never been indexed.
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];
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
 * Everything the return takes in, before the tax code decides how much of it
 * to look at.
 *
 * The denominator an effective rate needs, and the figure both charts' axis
 * labels and both charts' tooltips quote. It lives here rather than being
 * spelled out at each of those four sites, because it was spelled out at each
 * of those four sites and they disagreed: with $10,000 of tax-exempt interest
 * set, the torpedo tooltip said $53,712 where the sentence below the same
 * chart said $63,712, for the same return.
 *
 * Deliberately neither AGI nor taxable income. The *whole* benefit counts, not
 * the share 86(a) drags in, because a page about the untaxed portion of Social
 * Security cannot leave that portion out of the income it measures against —
 * against taxable income the torpedo's own subject disappears. Tax-exempt
 * interest counts because the filer spends it, whatever 103 says about it.
 */
export function totalIncomeFor(scenario: Scenario = {}): number {
  const { ordinaryIncome, ltcg, ssBenefit, muniInterest } =
    resolveScenario(scenario);
  return Math.max(0, ordinaryIncome + ltcg + ssBenefit + muniInterest);
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
 * rate schedule each half is charged under.
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
  // Provisional income is other income plus muni interest and half the
  // benefit, and the cap needs at most `ssBase85` plus the whole benefit of
  // it — so this always overshoots.
  const high = SS_BASES[filingStatus].ssBase85 + ssBenefit;
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
  // AGI is never below other income, so the target itself always overshoots.
  return otherIncomeAt(targetAgi, targetAgi, (income) =>
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
   * Where the 3.8% surtax of IRC 1411 finishes biting, or `null` when this
   * return has no net investment income for it to bite on.
   *
   * The surtax applies to the lesser of net investment income and MAGI over
   * the threshold, so it ramps in over a band exactly as wide as the gain: it
   * starts at the threshold and is fully priced at threshold-plus-gain. This
   * is the far end of that band, and past it the curve is flat again — the
   * same "end" the other two fields are.
   *
   * It is the one feature that can sit past `MIN_INCOME_AXIS` for an unmarried
   * return with a modest gain, which is the reason it is here: the $200,000
   * threshold is $50,000 off the right edge of the axis this chart used to be
   * fixed at, so without this entry the surtax would be drawn nowhere at all.
   *
   * Null for every scenario the page can currently build, because none of them
   * carries a gain. See the dormancy note over the 1411 chapter.
   */
  niitEnd: number | null;
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
  const { filingStatus, seniors } = resolveScenario(scenario);
  // Read off `seniorDeductionFor` rather than re-testing its conditions: the
  // phaseout is worth axis space exactly when there is a deduction to phase
  // out, which is age, filing status and tax year all at once.
  const claimed = seniorDeductionFor({ ...scenario, seniors }, 0) > 0;
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  // Read off `netInvestmentIncomeFor` rather than off `ltcg` directly, so the
  // one place that decides what 1411 counts stays the one place.
  const nii = netInvestmentIncomeFor(scenario);
  return {
    torpedoEnd: otherIncomeAtTaxableSSCap(scenario),
    seniorPhaseoutEnd:
      claimed && phaseoutEnd !== null ? otherIncomeAtAgi(phaseoutEnd, scenario) : null,
    // 1411's MAGI is plain AGI, so this solves on the same axis the senior
    // phaseout does — and lands at *less* other income than the raw MAGI
    // figure suggests, because the benefits the torpedo dragged in are in AGI
    // too. See `otherIncomeAtAgi`.
    niitEnd:
      nii > 0
        ? otherIncomeAtAgi(niitThreshold(filingStatus) + nii, scenario)
        : null,
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
 * The 1411 surtax would widen it the same way and for the same reason: its
 * thresholds start at $200,000 of MAGI, which is past where this axis used to
 * stop. It does not widen it today, because it takes a gain to reach and the
 * page sets none — see `IncomeAxisFeatures.niitEnd`.
 */
export function incomeAxisMax(
  scenario: Scenario = {},
  { headroom = 0.05, roundTo = 25_000, minimum = MIN_INCOME_AXIS }: IncomeAxisRange = {},
): number {
  const { torpedoEnd, seniorPhaseoutEnd, niitEnd } = incomeAxisFeatures(scenario);
  const lastFeature = Math.max(torpedoEnd, seniorPhaseoutEnd ?? 0, niitEnd ?? 0);
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
    // `totalFederalTax`, not `totalTax`, so a scenario carrying a gain is
    // priced correctly: between the 1411 threshold and the gain above it, a
    // dollar of ordinary income costs 3.8 cents more than chapter 1 says it
    // does, and that band is a third hump on this very axis.
    //
    // The page passes no `ltcg`, so on the chart that actually ships this is
    // `totalTax` to the dollar and there is no third hump to see. See the
    // dormancy note over the 1411 chapter below.
    const taxHere = totalFederalTax(at(income));
    const rate = totalFederalTax(at(income + 1)) - taxHere;
    data.push({
      income,
      totalIncome: Math.round(totalIncomeFor(at(income))),
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
 * Ordinary income (taxable SS included) fills the ordinary brackets first;
 * LTCG is then taxed at its preferential rates, but
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
  const { ordinaryIncome } = resolveScenario(scenario);

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

export interface LTCGRatePoint {
  ltcg: number;
  /** The next dollar of gain, on top of everything already here. */
  marginalRate: number;
  /**
   * The share of the gain itself that federal tax takes: the whole return's
   * tax, less what the same return would owe with that gain not realized at
   * all, over the gain. Zero while the gain fits under the 0% ceiling, and
   * climbing from there — an average of every rate the gain has met, where
   * `marginalRate` is only the rate the last dollar met.
   */
  effectiveRate: number;
  /** `totalFederalTax` — chapter 1 plus the 1411 surtax. */
  totalTax: number;
}

/**
 * The two rates on a long-term gain, sampled from $0 to `maxLTCG`: what the
 * next dollar of it would cost, and what the gain has cost so far as a share
 * of itself. Both capture the LTCG bracket rate and the SS torpedo
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

export function ltcgRateCurve(
  scenario: Scenario = {},
  { maxLTCG = 200_000, step = 250, gainsWithinIncome = false }: LtcgCurveRange = {},
): LTCGRatePoint[] {
  const otherIncome = resolveScenario(scenario).ordinaryIncome;
  const at = (gain: number): Scenario =>
    gainsWithinIncome
      ? { ...scenario, ...splitOtherIncome(otherIncome, gain) }
      : { ...scenario, ltcg: gain };
  const data: LTCGRatePoint[] = [];
  for (let ltcg = 0; ltcg <= maxLTCG; ltcg += step) {
    const here = at(ltcg);
    // A gain dollar past the 1411 threshold is both net investment income and
    // MAGI, so it enters the surtax base from both ends at once — 3.8 points
    // on top of whichever capital-gain band it lands in. See `niitFor`.
    const taxHere = totalFederalTax(here);
    const rate = totalFederalTax({ ...here, ltcg: (here.ltcg ?? 0) + 1 }) - taxHere;
    // The counterfactual is "this gain was never realized", not "it was taken
    // as ordinary income instead" — so the gain comes out and nothing replaces
    // it, in the additive reading and the within-income one alike. Taking it
    // as ordinary income is the other question, and the readout under the
    // slider is where the page asks it.
    const gained = taxHere - totalFederalTax({ ...here, ltcg: 0 });
    data.push({
      ltcg,
      marginalRate: Math.round(rate * 10_000) / 100,
      effectiveRate: ltcg > 0 ? Math.round((gained / ltcg) * 10_000) / 100 : 0,
      totalTax: Math.round(taxHere),
    });
  }
  return data;
}


/* ------------------------------------------------------------------ */
/*  Net investment income tax (IRC 1411)                              */
/* ------------------------------------------------------------------ */

/*
 * This chapter is dormant, and everything below it is written for the day it
 * is not.
 *
 * `netInvestmentIncomeFor` counts only `ltcg`, for the reasons set out on it,
 * and no control on the page sets `ltcg` — the capital-gains step came off
 * when the page narrowed to the torpedo alone. So every scenario the page can
 * build has $0 of net investment income, `netInvestmentIncomeTax` returns 0,
 * `totalFederalTax` equals `totalTax` to the dollar, and `niitEnd` is null at
 * every income there is. `dormant while the page sets no gain` in
 * `tax.test.ts` pins that, and it fails the moment a gain is back — which is
 * the signal to come back here and delete this note.
 *
 * It stays in `src/utils/` rather than moving to `src/shelf/` because it is
 * not a section's worth of code that lost its section. It is one term of the
 * federal tax total, sitting beside `ltcgRateCurve`, `conversionCeilings` and
 * `sizeConversion` — the rest of what the capital-gains and conversion steps
 * were priced from, all of it equally unreached and all of it coming back
 * together or not at all. The shelf is for whole modules; splitting this one
 * term off from the three functions it was written to serve would cost more to
 * reverse than it saves to state.
 *
 * The arithmetic is not dormant, only its reader: the tests below run the
 * statute against explicit gains and are green.
 */

/**
 * The rate IRC 1411(a)(1) charges: 3.8%, unchanged since it took effect.
 *
 * It is not an income tax. Chapter 1 ends at `totalTax`; this is chapter 2A,
 * "Unearned Income Medicare Contribution", reported on Form 8960 and carried
 * to Schedule 2 rather than to the tax line — which is why the two have
 * separate functions here, and would have separate lines at the foot of the
 * page for a return that owed both. None that this page can build does.
 */
export const NIIT_RATE = 0.038;

/**
 * The first year 1411 applied. Enacted in 2010 and effective for tax years
 * beginning after 31 December 2012.
 *
 * Kept here for the same reason `SS_BASE50_ENACTED` is: the thresholds below
 * carry no inflation adjustment and 1411(b) provides for none, so every year
 * since has moved more filers over a line drawn against a different decade's
 * dollars. The page already tells that story about the $25,000 and $32,000
 * bases of 1983 and 1993; this is the third instance of it.
 */
export const NIIT_ENACTED = 2013;

/**
 * The 1411(b) threshold amounts, by filing status. Not indexed, ever.
 *
 * Head of household shares the unmarried filer's $200,000. A separate return
 * gets $125,000 — half the joint figure, and the same halving that leaves an
 * MFS filer with $0 provisional-income bases under 86(c).
 */
export const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
  hoh: 200_000,
};

/** The 1411(b) threshold this return is measured against. */
export function niitThreshold(filingStatus: FilingStatus = 'single'): number {
  return NIIT_THRESHOLDS[filingStatus];
}

/**
 * The net investment income of this scenario, under 1411(c).
 *
 * Only the capital gain counts. That is a modelling decision about what this
 * app's four income inputs are, and it is worth stating in full, because the
 * whole surtax turns on it:
 *
 * - `ltcg` is gain from the disposition of property and qualified dividends,
 *   both squarely inside 1411(c)(1)(A)(i) and (iii). In.
 * - `ordinaryIncome` is read as what the page has always called it: pensions,
 *   IRA withdrawals and wages. 1411(c)(5) excludes any distribution from a
 *   qualified plan or IRA by name, and wages are excluded as they are subject
 *   to FICA instead. Out. A filer whose "other income" is really taxable bond
 *   interest would have net investment income this app does not price — the
 *   field note says so rather than the code guessing.
 * - `ssBenefit` is not in any 1411(c)(1) category, taxable share or not. Out.
 * - `muniInterest` is excluded from gross income by 103, and 1411(c)(1)(A)(i)
 *   reaches interest only to the extent it is *in* gross income. Out — and
 *   out of the MAGI below as well, which makes tax-exempt interest the one
 *   input on this page that moves the torpedo, moves Medicare's MAGI, and
 *   leaves the surtax entirely alone.
 *
 * The exclusions are the point. Every dollar this function leaves out still
 * raises the MAGI the threshold is measured against, so it drags somebody
 * else's already-realized gain into the surtax without being taxed by it.
 */
export function netInvestmentIncomeFor(scenario: Scenario = {}): number {
  return Math.max(0, resolveScenario(scenario).ltcg);
}

/**
 * Modified AGI for 1411 purposes: AGI, full stop.
 *
 * 1411(d) defines it as AGI increased by the amount excluded under section 911
 * — foreign earned income — and nothing else. No filer this page models has
 * any, so this is `agiFor` under a name that says which MAGI it is.
 *
 * It is emphatically not `irmaaMagi`, which adds tax-exempt interest back, and
 * it is not the AGI the senior deduction phases out against only by accident
 * — that one happens to coincide. Three MAGIs, three definitions; naming each
 * one is cheaper than tracking which is meant at the call site.
 */
export function niitMagi(scenario: Scenario = {}): number {
  return agiFor(scenario);
}

/** What 1411 charges this return, and how close the threshold is. */
export interface NiitAssessment {
  /** The 1411(d) MAGI the threshold is measured against. */
  magi: number;
  /** The 1411(b) threshold for this filing status. */
  threshold: number;
  /** Net investment income under 1411(c) — see `netInvestmentIncomeFor`. */
  nii: number;
  /** MAGI over the threshold; 0 when under it. */
  excess: number;
  /** The amount actually surtaxed: the lesser of `nii` and `excess`. */
  base: number;
  /**
   * 3.8% of `base`, unrounded.
   *
   * Deliberately not rounded to cents the way `IrmaaAssessment` rounds its
   * premiums. Both rate curves read a marginal rate off a one-dollar
   * difference in `totalFederalTax`, so a half-cent of rounding in the surtax
   * is half a percentage point on the chart: cent-rounding drew the band above
   * the threshold at a flat 28% where the true rate is 24% plus 3.8.
   */
  tax: number;
  /**
   * MAGI still available before the first surtaxed dollar; 0 once over.
   * Null when there is no net investment income, because then there is no
   * threshold to worry about however high MAGI goes.
   */
  headroom: number | null;
  /**
   * How much more MAGI it takes before the whole of `nii` is surtaxed and the
   * next ordinary dollar stops costing 3.8% extra. Null when there is no net
   * investment income; 0 once the base is already the whole of it.
   */
  toFullyTaxed: number | null;
}

/**
 * 1411 applied to a scenario.
 *
 * The surtax is 3.8% of the *lesser* of net investment income and the excess
 * of MAGI over the threshold — which is what makes it stack rather than
 * merely add. Below the threshold a gain costs nothing extra. Between the
 * threshold and threshold-plus-gain, every dollar of MAGI drags one more
 * dollar of an already-realized gain into the base, so an IRA withdrawal that
 * is itself exempt from 1411 still costs 3.8 cents on the dollar. Past that
 * the gain is fully surtaxed and the extra rate falls away again.
 *
 * That middle band is a hump on the same axis the torpedo is drawn on, from
 * the same mechanism: an income definition wider than the income being taxed.
 */
export function niitFor(scenario: Scenario = {}): NiitAssessment {
  const { filingStatus } = resolveScenario(scenario);
  const threshold = niitThreshold(filingStatus);
  const magi = niitMagi(scenario);
  const nii = netInvestmentIncomeFor(scenario);
  const excess = Math.max(0, magi - threshold);
  const base = Math.min(nii, excess);
  return {
    magi,
    threshold,
    nii,
    excess,
    base,
    tax: NIIT_RATE * base,
    headroom: nii > 0 ? Math.max(0, threshold - magi) : null,
    toFullyTaxed: nii > 0 ? Math.max(0, nii - excess) : null,
  };
}

/** Just the surtax, for the callers that only want the dollars. */
export function netInvestmentIncomeTax(scenario: Scenario = {}): number {
  return niitFor(scenario).tax;
}

/**
 * Everything this return owes the federal government in tax: chapter 1 plus
 * chapter 2A. Form 1040's total tax line, near enough.
 *
 * This — not `totalTax` — is what both rate curves plot and what the reader's
 * own answer at the foot of the page adds up, because a marginal rate that
 * stops at chapter 1 is wrong by 3.8 points exactly where this app's subject
 * bites hardest. `totalTax` stays chapter 1 on its own so that when a return
 * does owe the surtax there is a name for each half, rather than one figure
 * that quietly means two things.
 *
 * With the gains step off the page, no scenario the reader can build reaches
 * the second half: this is `totalTax` at every point on the shipped chart and
 * at the foot of the page, and the close accordingly has no surtax line to
 * show. See the dormancy note over this chapter.
 *
 * Medicare's IRMAA surcharge is still not in here: it is a premium, not a tax,
 * and it is charged two years later. See `irmaaFor`.
 */
export function totalFederalTax(scenario: Scenario = {}): number {
  return totalTax(scenario) + netInvestmentIncomeTax(scenario);
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

/**
 * Where the reader is standing relative to the nearest hump.
 *
 * `segmentCurve` classifies every stretch of the curve; this says which
 * stretch is *theirs*, which is the difference between a chart that shows a
 * torpedo and a chart that shows them theirs. The four positions are the four
 * pieces of advice: on a valley floor there is room to fill, on the climb the
 * next dollars are the dear ones, at the peak the only cheap move is sideways,
 * and past it the cap has already taken what it can.
 */
export type CurveStandingKind = 'valley' | 'climbing' | 'peak' | 'past' | 'flat';

export interface CurveStanding<T> {
  kind: CurveStandingKind;
  /** The segment the reader's own value falls in. */
  here: CurveSegment<T>;
  /** The stretch below `here`, or null at the left edge. */
  prev: CurveSegment<T> | null;
  /** The stretch above `here`, or null at the right edge. */
  next: CurveSegment<T> | null;
  /**
   * The hump in play: the one ahead when climbing or filling a valley, the one
   * underfoot at the peak, the one behind once it has been cleared. Null only
   * when the curve has no hump at all — a return with no benefit to drag in,
   * where the rate climbs with the brackets and never comes back down.
   */
  hump: CurveSegment<T> | null;
  /**
   * The nearest stretch below the reader that charges less than they do, or
   * null if every dollar behind them was at least as dear.
   *
   * This is what deferral is worth: a dollar held out of this year is only
   * cheaper in a year that sits lower on this same curve, and the nearest such
   * stretch is the reachable one. The *cheapest* stretch behind is almost
   * always the run below the standard deduction, which is true and useless.
   */
  cheaperBehind: CurveSegment<T> | null;
}

/**
 * Reads a segmented curve back at one x and says what the reader should do
 * about it.
 *
 * The nearest hump *ahead* wins over the one behind, because the advice is
 * about the next dollar rather than the last one; a reader in the dip between
 * the Social Security torpedo and the senior deduction's phaseout is filling a
 * valley, not standing past a hump.
 */
export function standingOn<T extends { marginalRate: number }>(
  segments: CurveSegment<T>[],
  x: number,
): CurveStanding<T> | null {
  if (segments.length === 0) return null;

  // The last stretch that starts at or below the reader. Sliders step in a
  // multiple of what the curve samples, so this is an exact hit in practice;
  // the search is written to survive a value that falls between samples.
  let hereIdx = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i].start > x) break;
    hereIdx = i;
  }

  const here = segments[hereIdx];
  const prev = hereIdx > 0 ? segments[hereIdx - 1] : null;
  const next = hereIdx < segments.length - 1 ? segments[hereIdx + 1] : null;
  const earlier = segments.slice(0, hereIdx).reverse();
  const cheaperBehind =
    earlier.find((seg) => seg.rate < here.rate) ?? null;
  const at = { here, prev, next, cheaperBehind };

  if (here.type === 'hill') {
    return { kind: 'peak', ...at, hump: here };
  }

  const ahead = segments.slice(hereIdx + 1).find((seg) => seg.type === 'hill');
  if (ahead) {
    return {
      kind: here.type === 'valley' ? 'valley' : 'climbing',
      ...at,
      hump: ahead,
    };
  }

  const behind = earlier.find((seg) => seg.type === 'hill');
  if (behind) {
    return { kind: 'past', ...at, hump: behind };
  }

  return { kind: 'flat', ...at, hump: null };
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
  // MAGI is blind to that split, because AGI counts both halves at face value
  // and provisional income does too.
  const magiAt = (income: number): number =>
    irmaaMagi({ ...scenario, ...splitOtherIncome(income, resolveScenario(scenario).ltcg) });
  if (magiAt(0) >= targetMagi) return 0;
  // MAGI is never below other income, so targetMagi itself always overshoots.
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
/*  The premium tax credit's 400% cliff (IRC 36B)                      */
/* ------------------------------------------------------------------ */

/**
 * The second cliff on this page, and the one that bites before 65.
 *
 * IRC 36B(c)(1)(A) makes an "applicable taxpayer" one whose household income
 * is "at least 100 percent but not more than 400 percent" of the federal
 * poverty line. Over 400% there is no row in the applicable percentage table
 * to look the credit up in, so the credit is zero: not tapered, not reduced —
 * gone, on the strength of the dollar that crossed the line.
 *
 * It shares IRMAA's shape and almost nothing else. IRMAA is a premium the
 * government charges, published in a CMS table, and it steps five times; this
 * is a credit the government stops paying, its size depends on the price of a
 * silver plan in the reader's own county, and it steps exactly once. What the
 * two have in common is the thing this page is about: an income definition
 * wider than the income being taxed, measured against a line, with a whole
 * year's money turning on one dollar.
 *
 * From 2021 through 2025 there was no cliff at all. ARPA section 9661, which
 * the Inflation Reduction Act section 12001 extended through 2025, replaced
 * the table with one that ran past 400% and capped the household's own share
 * of the benchmark premium at 8.5% of income however high income went. That
 * expired for taxable years beginning after 31 December 2025, which is why
 * `FPL_YEAR_PARAMS` carries a `cliff` flag rather than assuming one: on a 2025
 * return this line does not exist, and on a 2026 return it does.
 */
export const PTC_CLIFF_PERCENT = 4;

/**
 * The premium tax credit reads the poverty guidelines published *before* the
 * plan year opens, not the ones published during it.
 *
 * 26 CFR 1.36B-1(h) fixes the figure at "the most recently published poverty
 * guidelines in effect as of the first day of the regular enrollment period",
 * and open enrollment for a year begins the previous 1 November — so 2026
 * coverage is priced off the guidelines HHS published in January 2025. The
 * same one-year lag Medicare has at two years, and for the same practical
 * reason: the line has to be knowable when the plan is bought.
 */
export const FPL_GUIDELINE_LOOKBACK_YEARS = 1;

/** The calendar year whose poverty guidelines price a coverage year. */
export function fplGuidelineYear(coverageYear: TaxYear = defaultTaxYear()): number {
  return coverageYear - FPL_GUIDELINE_LOOKBACK_YEARS;
}

/** One coverage year's poverty line and applicable-percentage facts. */
export interface PtcYearParams {
  /** Where the figures come from. */
  source: string;
  /** The calendar year of the guidelines this coverage year is priced from. */
  guidelineYear: number;
  /**
   * The poverty guideline for a one-person household in the 48 contiguous
   * states and the District of Columbia.
   *
   * Alaska and Hawaii have guidelines of their own, roughly 25% and 15%
   * higher, so a reader there meets this cliff at more income than the chart
   * draws it at. Drawing the contiguous figure is the conservative direction —
   * it puts the line to the left of where their own line falls — which is why
   * this is one table rather than three.
   */
  firstPerson: number;
  /** Added for each person past the first. The guidelines are that linear. */
  perAdditionalPerson: number;
  /**
   * Whether household income over 400% of the poverty line zeroes the credit.
   * False for 2021 through 2025; true again from 2026.
   */
  cliff: boolean;
  /**
   * The applicable percentage at the top of the 36B(b)(3)(A)(i) table: the
   * share of household income a household just under the line pays for the
   * benchmark silver plan before the credit picks up the rest.
   *
   * This is what makes the cliff quotable without knowing the reader's own
   * premium. Just under the line their cost is capped at this share of income;
   * one dollar over, it is the whole premium, whatever that is where they
   * live. The difference between the two is the price of the dollar.
   */
  topApplicablePercentage: number;
}

/**
 * The poverty line and applicable percentage by coverage year.
 *
 * Its own table rather than a field on `TAX_YEAR_PARAMS`, for the reason
 * `IRMAA_YEAR_PARAMS` is: the guidelines come from an HHS notice each January
 * and the percentages from a summer Rev. Proc., neither of which is the autumn
 * Rev. Proc. that sets the brackets. `Record<TaxYear, ...>` still makes them
 * exhaustive, so a new tax year fails to compile until its figures are here.
 */
export const FPL_YEAR_PARAMS: Record<TaxYear, PtcYearParams> = {
  2025: {
    source:
      'HHS poverty guidelines, January 2024 (2024 guidelines price 2025 coverage); no cliff under ARPA 9661 as extended by IRA 12001',
    guidelineYear: 2024,
    firstPerson: 15_060,
    perAdditionalPerson: 5_380,
    cliff: false,
    // ARPA's replacement table topped out at 8.5% and had no upper income
    // bound at all: past 400% the credit tapered away as the benchmark premium
    // fell under 8.5% of income, rather than stopping.
    topApplicablePercentage: 0.085,
  },
  2026: {
    source:
      'HHS poverty guidelines, 90 Fed. Reg. 5917 (January 17 2025); applicable percentage table, Rev. Proc. 2025-25 section 3.01',
    guidelineYear: 2025,
    firstPerson: 15_650,
    perAdditionalPerson: 5_500,
    cliff: true,
    // Rev. Proc. 2025-25: "At least 300% but not more than 400% — 9.96%,
    // 9.96%". The table's last row, and the last row there is.
    topApplicablePercentage: 0.0996,
  },
};

/** One coverage year's poverty-line figures. */
export function ptcParams(year: TaxYear = defaultTaxYear()): PtcYearParams {
  return FPL_YEAR_PARAMS[year];
}

/**
 * The poverty line for a household of `householdSize`, for a coverage year.
 *
 * The guidelines are linear past the first person by construction — HHS
 * publishes a first-person figure and a per-person increment — so this is the
 * whole table, not an approximation of it.
 */
export function povertyLine(
  householdSize: number,
  year: TaxYear = defaultTaxYear(),
): number {
  const { firstPerson, perAdditionalPerson } = FPL_YEAR_PARAMS[year];
  return firstPerson + perAdditionalPerson * (Math.max(1, householdSize) - 1);
}

/**
 * How many people a filing status implies are in the household, when the
 * reader has not said.
 *
 * 26 CFR 1.36B-1(d) sizes a family as the taxpayer, the spouse and the
 * dependents — so the return itself names everyone this page knows about. A
 * joint return is two people; a head of household is at least two, since the
 * status requires a qualifying person; anything else is one. Dependents past
 * that move the line right by `perAdditionalPerson` each and are the reason
 * `Scenario.householdSize` can be set instead.
 */
export function defaultHouseholdSize(filingStatus: FilingStatus = 'single'): number {
  return filingStatus === 'mfj' || filingStatus === 'hoh' ? 2 : 1;
}

/** The poverty line this scenario's household is measured against. */
export function povertyLineFor(scenario: Scenario = {}): number {
  const { householdSize, year } = resolveScenario(scenario);
  return povertyLine(householdSize, year);
}

/**
 * Household income for 36B: the fourth MAGI on this page, and the widest.
 *
 * 36B(d)(2)(B) takes AGI and adds back the foreign earned income excluded
 * under 911, tax-exempt interest, and — the one that matters here — "the
 * portion of the taxpayer's social security benefits which is not included in
 * gross income under section 86".
 *
 * That last clause undoes the torpedo. Whatever share of the benefit 86(a)
 * drags into AGI, this adds the rest back, so the whole benefit is in
 * household income at every income level. Which has a consequence worth
 * stating: this MAGI rises by exactly one dollar per dollar of other income,
 * where Medicare's rises by up to $1.85 inside the torpedo. The cliff is
 * therefore the one line on step 2's chart that does *not* move left as the
 * benefit grows in the way the IRMAA lines do — it moves left dollar for
 * dollar with the benefit itself, because the benefit was already all of it.
 */
export function acaMagi(scenario: Scenario = {}): number {
  const { ssBenefit, muniInterest } = resolveScenario(scenario);
  const untaxedBenefit = Math.max(0, ssBenefit - taxableSocialSecurity(scenario));
  return agiFor(scenario) + muniInterest + untaxedBenefit;
}

/** A MAGI as a multiple of the poverty line: 4 is 400% of it. */
export function fplMultipleOf(magi: number, scenario: Scenario = {}): number {
  const line = povertyLineFor(scenario);
  return line > 0 ? magi / line : 0;
}

/**
 * The household income at which the credit disappears, or null in a year that
 * has no cliff to disappear over.
 */
export function ptcCliffMagi(scenario: Scenario = {}): number | null {
  const { year } = resolveScenario(scenario);
  return FPL_YEAR_PARAMS[year].cliff
    ? PTC_CLIFF_PERCENT * povertyLineFor(scenario)
    : null;
}

/**
 * The other (non-SS, non-muni) income at which 36B household income first
 * reaches `targetMagi`, for a fixed benefit and tax-exempt interest.
 *
 * The third of these solvers, alongside `otherIncomeAtAgi` and
 * `otherIncomeAtIrmaaMagi`, and the only one whose function is a straight line
 * of slope 1 — see `acaMagi`. It is still solved rather than rearranged,
 * because three solvers that agree in form are easier to trust than two that
 * agree and one that is clever.
 */
export function otherIncomeAtAcaMagi(
  targetMagi: number,
  scenario: Scenario = {},
): number {
  const { ltcg } = resolveScenario(scenario);
  // Household income is never below other income, so the target itself always
  // overshoots.
  return otherIncomeAt(targetMagi, targetMagi, (income) =>
    acaMagi({ ...scenario, ...splitOtherIncome(income, ltcg) }),
  );
}

/** The 400% line, placed on the chart's other-income axis. */
export interface PtcCliff {
  /** How many people the poverty line was sized for. */
  householdSize: number;
  /** The poverty line itself, for that household and coverage year. */
  povertyLine: number;
  /** Household income at the cliff: 400% of the line. */
  magi: number;
  /** Where the cliff falls on an other-income axis. */
  otherIncome: number;
  /** What the household pays for the benchmark plan just under the line. */
  topApplicablePercentage: number;
  /**
   * The most the household can be asked to pay just under the line: the
   * applicable percentage applied to the cliff income itself. One dollar over,
   * they pay the benchmark premium instead — which this app cannot know, since
   * it is set by age and county — so this is the floor under the loss, not the
   * loss.
   */
  cappedContribution: number;
}

/**
 * The 400% line for this scenario, or null when the year has no cliff.
 *
 * Nothing here knows whether the household actually buys its coverage on the
 * Marketplace. It cannot: nobody enrolled in Medicare is eligible for the
 * credit at all, and everyone else may have coverage from an employer, a
 * spouse, or a retiree plan. That is a fact about the reader, so the page asks
 * it — or, where the page can infer it from the ages it already has, infers it
 * — and this function answers the arithmetic question only.
 */
export function ptcCliff(scenario: Scenario = {}): PtcCliff | null {
  const { householdSize, year } = resolveScenario(scenario);
  const magi = ptcCliffMagi(scenario);
  if (magi === null) return null;
  const { topApplicablePercentage } = FPL_YEAR_PARAMS[year];
  return {
    householdSize,
    povertyLine: povertyLineFor(scenario),
    magi,
    otherIncome: otherIncomeAtAcaMagi(magi, scenario),
    topApplicablePercentage,
    cappedContribution: toCents(topApplicablePercentage * magi),
  };
}

/** Where a household income stands against the 400% line. */
export interface PtcAssessment {
  /** The 36B(d)(2)(B) household income this was measured on. */
  magi: number;
  /** The poverty line for this household and coverage year. */
  povertyLine: number;
  /** `magi` as a multiple of the line: 4.2 is 420% of the poverty line. */
  fplMultiple: number;
  /** Whether this year has a cliff at all. False for 2021 through 2025. */
  cliffApplies: boolean;
  /** Household income at the cliff; null in a year without one. */
  cliffMagi: number | null;
  /** Whether the credit is gone. Always false in a year without a cliff. */
  overCliff: boolean;
  /**
   * Household income still available before the credit disappears; 0 once
   * over, null in a year without a cliff.
   *
   * At exactly 400% the credit is still allowed — 36B(c)(1)(A) reads "not more
   * than", and Rev. Proc. 2025-25's last row reads "but not more than 400%" —
   * so the headroom is the distance to the line itself and the dollar that
   * costs is the one past it.
   */
  headroom: number | null;
}

/** Where a given household income stands against this year's 400% line. */
export function ptcFor(magi: number, scenario: Scenario = {}): PtcAssessment {
  const { year } = resolveScenario(scenario);
  const cliffApplies = FPL_YEAR_PARAMS[year].cliff;
  const cliffMagi = ptcCliffMagi(scenario);
  return {
    magi,
    povertyLine: povertyLineFor(scenario),
    fplMultiple: fplMultipleOf(magi, scenario),
    cliffApplies,
    cliffMagi,
    overCliff: cliffMagi !== null && magi > cliffMagi,
    headroom: cliffMagi === null ? null : Math.max(0, cliffMagi - magi),
  };
}

/* ------------------------------------------------------------------ */
/*  Roth conversion sizing                                            */
/* ------------------------------------------------------------------ */

/** The income definition a conversion ceiling is measured against. */
export type ConversionMeasure =
  | 'ordinaryTaxableIncome'
  | 'totalTaxableIncome'
  | 'provisionalIncome'
  | 'magi'
  | 'acaMagi';

export type ConversionCeilingId =
  | 'bracket12'
  | 'bracket22'
  | 'ss50'
  | 'ss85'
  | 'ltcg0'
  | 'irmaa1'
  | 'fpl400';

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
  acaMagi: 'household income (36B MAGI)',
};

function bracketTop(scenario: Scenario, rate: number): number {
  const bracket = filingParamsFor(scenario).brackets.find((b) => b.rate === rate);
  return bracket ? bracket.upTo : Infinity;
}

/**
 * The ceilings a retiree might size a Roth conversion against.
 *
 * Takes the whole scenario because four of the seven ceilings move with the
 * tax year — the two bracket tops, the 0% capital-gain band and the poverty
 * line — while the two Social Security bases never do. Only `filingStatus`,
 * `householdSize` and `year` are read; the income fields are ignored, since a
 * ceiling is a fixed line, not a position relative to one.
 *
 * The seventh is the only one that can be absent: 400% of the poverty line was
 * not a ceiling at all from 2021 through 2025, when the credit tapered past it
 * instead of stopping, so it appears with the cliff rather than being offered
 * as a line that does nothing. See `ptcCliff`.
 */
export function conversionCeilings(scenario: Scenario = {}): ConversionCeiling[] {
  const { filingStatus } = resolveScenario(scenario);
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];
  // Both bases are $0 on a separate return that lived with the spouse, so the
  // two Social Security ceilings collapse onto each other. Say so rather than
  // offering the same $0 twice with different explanations.
  const basesCollapse = ssBase50 === ssBase85;
  const firstCliff = firstIrmaaTier(scenario);
  const subsidyCliff = ptcCliff(scenario);
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
    ...(subsidyCliff
      ? [
          {
            id: 'fpl400' as const,
            label: '400% of the federal poverty line (ACA subsidy)',
            measure: 'acaMagi' as const,
            amount: subsidyCliff.magi,
            note:
              `The other true cliff, and the one that bites before 65: household income a dollar over 400% of the poverty line — this figure, for a household of ${subsidyCliff.householdSize} — ends the Marketplace premium tax credit for the whole year. Just under it the household pays at most ${(subsidyCliff.topApplicablePercentage * 100).toFixed(2)}% of income for the benchmark silver plan; over it, the whole premium, which depends on ages and county and so is not in the tax figures below. Only a household buying its own coverage on the Marketplace meets this line at all — nobody enrolled in Medicare is eligible for the credit.` +
              (filingStatus === 'mfs'
                ? ' And a separate return can claim the credit only under the abandonment or domestic-abuse exception of 26 CFR 1.36B-2(b)(2).'
                : ''),
          },
        ]
      : []),
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
  const netOrdinary = ordinaryIncome + conversion;
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
    case 'acaMagi':
      // Wider again: 36B adds the untaxed share of the benefit back on top of
      // the tax-exempt interest, so a conversion made under this ceiling is
      // measured against every dollar the household took in. See `acaMagi`.
      return acaMagi(converted);
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

  // The whole bill, surtax included. A conversion is ordinary income and so is
  // never itself net investment income — but it raises the MAGI 1411 measures
  // against, so converting into a return that holds a gain can cost 3.8% on
  // dollars that were realized years ago. Pricing a conversion at chapter 1
  // would understate exactly the case this page exists to warn about.
  const taxAt = (ordinary: number): number =>
    totalFederalTax({ ...scenario, ordinaryIncome: ordinary });

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

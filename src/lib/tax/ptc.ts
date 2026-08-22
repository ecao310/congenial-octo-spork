/**
 * The premium tax credit's 400% cliff, under IRC 36B.
 *
 * The second cliff on this page and the one that bites before 65 — and the
 * only figure in this directory that is a credit the government stops paying
 * rather than a tax it charges. See `PTC_CLIFF_PERCENT`.
 */
import type { TaxYear } from './types';
import { defaultTaxYear } from './params';
import { resolveScenario } from './scenario';
import type { Scenario } from './scenario';
import { agiFor, splitOtherIncome } from './income';
import { taxableSocialSecurity } from './socialSecurity';
import { toCents } from './money';
import { otherIncomeAt } from './solve';

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

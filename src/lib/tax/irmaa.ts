/**
 * IRMAA: Medicare's income-related monthly adjustment amount, which is a
 * premium rather than a tax and is charged on a two-year lag.
 *
 * Its own table rather than a field on `TAX_YEAR_PARAMS`, and its own MAGI
 * rather than the tax chain's — see `IRMAA_YEAR_PARAMS` and `irmaaMagi` for
 * both reasons.
 */
import type { FilingStatus, TaxYear } from './types';
import { defaultTaxYear } from './params';
import { resolveScenario } from './scenario';
import type { Scenario } from './scenario';
import { agiFor, splitOtherIncome } from './income';
import { toCents } from './money';
import { otherIncomeAt } from './solve';

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
   * Whether MAGI *at* `magiOver` already lands in this tier. Only the top tier
   * works this way, and it does for every status: the last row of the rate
   * table at 42 U.S.C. 1395r(i)(3)(C)(i)(III) reads "At least $500,000" where
   * every row above it reads "More than", and clause (ii) carries that row
   * across to a joint return. CMS reproduces the difference verbatim -
   * "greater than or equal to" in the last row of its tables, "greater than"
   * everywhere else.
   */
  inclusive?: true;
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
 * Two of the statute's three schedules are gone with the statuses that read
 * them. A separate return that lived with its spouse had its own two-step
 * ladder under 42 U.S.C. 1395r(i)(3)(C)(iii) — tiers 1 through 3 simply did not
 * exist for it, which they said by holding `Infinity` here and being filtered
 * back out downstream. No threshold in this table is `Infinity` any more, and
 * nothing filters.
 */
export const IRMAA_YEAR_PARAMS: Record<TaxYear, IrmaaYearParams> = {
  2025: {
    source: 'CMS fact sheet, November 2024 (2025 premiums, 2023 MAGI)',
    partBStandardPremium: 185.0,
    tiers: [
      {
        tier: 0,
        magiOver: { single: -Infinity, mfj: -Infinity },
        partBSurchargeMonthly: 0,
        partBMonthly: 185.0,
        partDSurchargeMonthly: 0,
      },
      {
        tier: 1,
        magiOver: { single: 106_000, mfj: 212_000 },
        partBSurchargeMonthly: 74.0,
        partBMonthly: 259.0,
        partDSurchargeMonthly: 13.7,
      },
      {
        tier: 2,
        magiOver: { single: 133_000, mfj: 266_000 },
        partBSurchargeMonthly: 185.0,
        partBMonthly: 370.0,
        partDSurchargeMonthly: 35.3,
      },
      {
        tier: 3,
        magiOver: { single: 167_000, mfj: 334_000 },
        partBSurchargeMonthly: 295.9,
        partBMonthly: 480.9,
        partDSurchargeMonthly: 57.0,
      },
      {
        tier: 4,
        magiOver: { single: 200_000, mfj: 400_000 },
        partBSurchargeMonthly: 406.9,
        partBMonthly: 591.9,
        partDSurchargeMonthly: 78.6,
      },
      {
        tier: 5,
        magiOver: { single: 500_000, mfj: 750_000 },
        inclusive: true,
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
        magiOver: { single: -Infinity, mfj: -Infinity },
        partBSurchargeMonthly: 0,
        partBMonthly: 202.9,
        partDSurchargeMonthly: 0,
      },
      {
        tier: 1,
        magiOver: { single: 109_000, mfj: 218_000 },
        partBSurchargeMonthly: 81.2,
        partBMonthly: 284.1,
        partDSurchargeMonthly: 14.5,
      },
      {
        tier: 2,
        magiOver: { single: 137_000, mfj: 274_000 },
        partBSurchargeMonthly: 202.9,
        partBMonthly: 405.8,
        partDSurchargeMonthly: 37.5,
      },
      {
        tier: 3,
        magiOver: { single: 171_000, mfj: 342_000 },
        partBSurchargeMonthly: 324.6,
        partBMonthly: 527.5,
        partDSurchargeMonthly: 60.4,
      },
      {
        tier: 4,
        magiOver: { single: 205_000, mfj: 410_000 },
        partBSurchargeMonthly: 446.3,
        partBMonthly: 649.2,
        partDSurchargeMonthly: 83.3,
      },
      {
        tier: 5,
        magiOver: { single: 500_000, mfj: 750_000 },
        inclusive: true,
        partBSurchargeMonthly: 487.0,
        partBMonthly: 689.9,
        partDSurchargeMonthly: 91.0,
      },
    ],
  },
};

/** Standard Part B premium per beneficiary per month, before any surcharge. */
export function partBStandardPremium(year: TaxYear = defaultTaxYear()): number {
  return IRMAA_YEAR_PARAMS[year].partBStandardPremium;
}

/**
 * The tiers this scenario is measured against: the standard-premium tier first,
 * then the five surcharge tiers ascending.
 *
 * This used to filter, because a separate return could not reach tiers 1
 * through 3 and the table said so with `Infinity`. Every status left reaches
 * every tier, so the whole schedule is the answer and the year is all it takes
 * to pick one.
 */
export function irmaaTiersFor(scenario: Scenario = {}): IrmaaTier[] {
  return IRMAA_YEAR_PARAMS[resolveScenario(scenario).year].tiers;
}

/** Whether a MAGI has reached a tier, honouring the inclusive top threshold. */
function irmaaTierReached(
  tier: IrmaaTier,
  magi: number,
  filingStatus: FilingStatus,
): boolean {
  const floor = tier.magiOver[filingStatus];
  return tier.inclusive ? magi >= floor : magi > floor;
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
}

/** Household surcharge for a tier, annualized over `beneficiaries` enrollees. */
function annualSurchargeFor(tier: IrmaaTier, beneficiaries: number): number {
  return toCents(
    (tier.partBSurchargeMonthly + tier.partDSurchargeMonthly) * 12 * beneficiaries,
  );
}

/**
 * What Medicare charges at a given MAGI, and where the next cliff is.
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
  const annualSurcharge = annualSurchargeFor(tier, beneficiaries);
  return {
    magi,
    tier: tier.tier,
    beneficiaries,
    partBMonthly: tier.partBMonthly,
    partBSurchargeMonthly: tier.partBSurchargeMonthly,
    partDSurchargeMonthly: tier.partDSurchargeMonthly,
    annualSurcharge,
    annualPartB: toCents(tier.partBMonthly * 12 * beneficiaries),
    nextThreshold: next ? next.magiOver[filingStatus] : null,
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
  const { ltcg } = resolveScenario(scenario);
  // MAGI is never below other income, so targetMagi itself always overshoots.
  return otherIncomeAt(targetMagi, targetMagi, (income) =>
    irmaaMagi({ ...scenario, ...splitOtherIncome(income, ltcg) }),
  );
}

export interface IrmaaCliff {
  /** 1 through 5. */
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

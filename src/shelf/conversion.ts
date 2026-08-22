/**
 * The Roth conversion step's arithmetic: the ceilings a conversion might be
 * sized against, and what fitting under one costs.
 *
 * This is what the removed "Sizing the conversion" step read off. It is on the
 * shelf for the reason the shelf exists — nothing a reader can see reaches it —
 * and the move cost nothing, because its only caller in the repo is
 * `sequencing.ts`, which was already here. Until this file existed,
 * `src/utils/` held code whose sole consumer was shelved.
 *
 * The thresholds themselves did not move. Every ceiling below reads its figure
 * out of `tax.ts` — the bracket tops, the two Social Security bases, the 0%
 * capital-gain band, the first IRMAA tier, 400% of the poverty line — so a
 * rate or a limit is still written down exactly once, in the engine. What this
 * file adds is the list, and the search that fits a conversion under one item
 * of it.
 *
 * See `README.md` beside this file.
 */

import {
  SS_BASES,
  Scenario,
  acaMagi,
  agiFor,
  deductionFor,
  filingParamsFor,
  firstIrmaaTier,
  irmaaFirstCliffMagi,
  ptcCliff,
  resolveScenario,
  taxableSocialSecurity,
  totalFederalTax,
} from '../utils/tax';

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

/**
 * The one curve the page draws: the marginal rate on the next dollar, swept
 * across an income axis.
 */
import { resolveScenario } from './scenario';
import type { Scenario } from './scenario';
import { splitOtherIncome, totalIncomeFor, totalTax } from './income';

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
  /** Total federal income tax (whole dollars) at this income level. */
  totalTax: number;
}

/** How far the sweep runs, how finely, and how it reads a gain. */
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

/**
 * Marginal tax rate (in percent) on the next dollar of ordinary income, plus
 * the total federal tax at each level, sampled from $0 to `maxIncome`.
 *
 * Sweeps the scenario's `ordinaryIncome`, so whatever it already carries there
 * is overwritten. Every other field is honoured, `ltcg` included — pass a
 * scenario with no gains to plot the ordinary-income chart on its own.
 */
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
    // The rate is read off a one-dollar difference rather than from the
    // bracket the dollar lands in, because the bracket is not the whole price:
    // the same dollar can drag benefits into the tax base behind it and eat
    // into the senior deduction, and both of those are in this subtraction.
    const taxHere = totalTax(at(income));
    const rate = totalTax(at(income + 1)) - taxHere;
    data.push({
      income,
      totalIncome: Math.round(totalIncomeFor(at(income))),
      marginalRate: Math.round(rate * 10_000) / 100,
      totalTax: Math.round(taxHere),
    });
  }
  return data;
}

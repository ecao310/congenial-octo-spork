/**
 * The capital-gains step's chart data.
 *
 * `ltcgRateCurve` is what the removed "Capital gains stacking" step plotted:
 * the two rates on a long-term gain, swept from $0 — what the next dollar of
 * gain costs, and what the gain has cost so far as a share of itself.
 *
 * The *pricing* of a gain did not come with it. `totalTax` stacks LTCG on top
 * of ordinary taxable income, `netInvestmentIncomeFor` decides what 1411
 * counts, and `splitOtherIncome` carves a gain out of an income — all of them
 * are still in `src/utils/tax.ts`, because the 1040 chain runs through them
 * whether or not today's page sets a gain. What is here is only the sweep the
 * step drew, which has had no caller since the step came off.
 *
 * See `README.md` beside this file.
 */

import {
  Scenario,
  resolveScenario,
  splitOtherIncome,
  totalFederalTax,
} from '../utils/tax';

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

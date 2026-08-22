/**
 * Where the ordinary-income axis should stop, and what is worth seeing before
 * it does.
 *
 * Everything named here is an *end*: past it the curve is a flat rate schedule
 * that says nothing the reader has not already seen. That is what makes them
 * the right things to size an axis by.
 */
import { resolveScenario } from './scenario';
import type { Scenario } from './scenario';
import { SS_BASES, taxableSocialSecurity } from './socialSecurity';
import { seniorDeductionFor, seniorDeductionPhaseoutEnd } from './deductions';
import { agiFor, splitOtherIncome } from './income';
import { otherIncomeAt } from './solve';

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
  const { ssBenefit, filingStatus, ltcg } = resolveScenario(scenario);
  if (ssBenefit <= 0) return 0;
  const cap = 0.85 * ssBenefit;
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
   * cannot claim it — a filer under 65, or a year outside 2025-2028. Null
   * means there is no second hump to make room for.
   */
  seniorPhaseoutEnd: number | null;
}

/**
 * The right-hand feet of everything worth seeing, on the axis the chart
 * actually plots.
 *
 * Both are *ends*: past them the curve is a flat rate schedule that says
 * nothing the reader has not already seen. That is what makes them the right
 * thing to size an axis by.
 */
export function incomeAxisFeatures(scenario: Scenario = {}): IncomeAxisFeatures {
  const { filingStatus } = resolveScenario(scenario);
  // Read off `seniorDeductionFor` rather than re-testing its conditions: the
  // phaseout is worth axis space exactly when there is a deduction to phase
  // out, which is age, filing status and tax year all at once.
  const claimed = seniorDeductionFor(scenario, 0) > 0;
  return {
    torpedoEnd: otherIncomeAtTaxableSSCap(scenario),
    seniorPhaseoutEnd: claimed
      ? otherIncomeAtAgi(seniorDeductionPhaseoutEnd(filingStatus), scenario)
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
 * Anything else that ends on this axis widens it the same way, by becoming a
 * third field on `IncomeAxisFeatures` and a third term in the `max` below.
 */
export function incomeAxisMax(
  scenario: Scenario = {},
  { headroom = 0.05, roundTo = 25_000, minimum = MIN_INCOME_AXIS }: IncomeAxisRange = {},
): number {
  const { torpedoEnd, seniorPhaseoutEnd } = incomeAxisFeatures(scenario);
  const lastFeature = Math.max(torpedoEnd, seniorPhaseoutEnd ?? 0);
  const wanted = Math.max(minimum, lastFeature * (1 + headroom));
  return Math.ceil(wanted / roundTo) * roundTo;
}

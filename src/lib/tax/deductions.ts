/**
 * Everything that comes off AGI before a bracket is applied: the standard
 * deduction, its age-65 addition, and the temporary OBBBA senior deduction
 * with its phaseout.
 *
 * The phaseout is the reason these are one module rather than a constant and a
 * lookup. It is a second hump on the same axis the torpedo is drawn on, from
 * the same mechanism — an income definition wider than the income being taxed
 * — and it is priced here rather than in the rate schedule that never mentions
 * it.
 */
import type { FilingStatus } from './types';
import { filingParamsFor, resolveScenario, seniorCount } from './scenario';
import type { Scenario } from './scenario';

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
 * MAGI at which each qualifying individual's $6,000 starts shrinking.
 *
 * 151(d)(5)(C)(i) names one threshold, $150,000, "in the case of a joint
 * return", and $75,000 in every other case.
 *
 * There used to be a third entry here, and it was `null`: 151(d)(5)(C)(v)
 * denies the deduction outright to a married taxpayer who does not file
 * jointly, so a separate return got nothing — not a halved amount, not a
 * halved threshold. That null was the reason `seniorDeductionPhaseoutEnd`
 * carried a pair of overloads and every caller of it carried a branch. The
 * status is gone, so both are.
 */
export const SENIOR_DEDUCTION_PHASEOUT_START: Record<FilingStatus, number> = {
  single: 75_000,
  mfj: 150_000,
};

/**
 * MAGI at which the senior deduction is gone: $175,000 single, $250,000 MFJ.
 * Independent of how many spouses qualify, because the phaseout applies to each
 * one's $6,000 separately, which is why it is exactly $100,000 past the start
 * for both.
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
export function seniorDeductionFor(scenario: Scenario = {}, magi = 0): number {
  const { filingStatus, seniors, year } = resolveScenario(scenario);
  const count = seniorCount(filingStatus, seniors);
  if (count === 0) return 0;
  // 151(d)(5)(D): "shall not apply to taxable years beginning after December
  // 31, 2028." Every year this app prices is inside the window, so this never
  // fires today — it is here so that adding 2029 to `TAX_YEAR_PARAMS` expires
  // the deduction rather than quietly extending it.
  if (year < SENIOR_DEDUCTION_FIRST_YEAR || year > SENIOR_DEDUCTION_LAST_YEAR) {
    return 0;
  }
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
export function deductionFor(scenario: Scenario = {}, magi = 0): number {
  return standardDeductionFor(scenario) + seniorDeductionFor(scenario, magi);
}

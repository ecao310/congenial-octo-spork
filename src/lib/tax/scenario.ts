/**
 * The return every other module in this directory prices, and the defaults it
 * is read through.
 *
 * Nothing here computes tax. What it does is settle the question every
 * function downstream would otherwise have to answer for itself — what an
 * unset field means — in one place, so that a scenario is a complete return by
 * the time any arithmetic sees it.
 */
import type { FilingStatus, TaxYear } from './types';
import { defaultTaxYear, filingParams } from './params';
import type { FilingYearParams } from './params';

/**
 * Every input a scenario has, as named fields rather than a positional list.
 *
 * The list had reached eight arguments — `sizeConversion(ceiling, ordinary, ss,
 * ltcg, filingStatus, seniors, maxConversion, muni)`, back when that function
 * was in this engine — six of them numbers, and inserting `seniors` in the
 * middle once silently reassigned a caller's `MAX_CONVERSION` to it. The tests
 * caught that one. Named fields make the same mistake a type error, and an
 * unknown key a type error too, so a typo cannot quietly fall back to a
 * default.
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
  };
}

/** The same, read straight off a scenario. */
export function filingParamsFor(scenario: Scenario = {}): FilingYearParams {
  const { year, filingStatus } = resolveScenario(scenario);
  return filingParams(year, filingStatus);
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

/**
 * Clamps a senior count to what the filing status allows.
 *
 * Exported for `deductions.ts`, which is the only reader, and deliberately not
 * re-exported from the barrel: it is how this directory reads its own field,
 * not a question anything outside it has.
 */
export function seniorCount(filingStatus: FilingStatus, seniors: number): number {
  return Math.min(Math.max(0, Math.floor(seniors)), maxSeniors(filingStatus));
}

/**
 * How many people a filing status implies are in the household, when the
 * reader has not said.
 *
 * 26 CFR 1.36B-1(d) sizes a family as the taxpayer, the spouse and the
 * dependents — so the return itself names everyone this page knows about. A
 * joint return is two people and a single one is one. Dependents past that
 * move the line right by `perAdditionalPerson` each and are the reason
 * `Scenario.householdSize` can be set instead.
 */
export function defaultHouseholdSize(filingStatus: FilingStatus = 'single'): number {
  return filingStatus === 'mfj' ? 2 : 1;
}

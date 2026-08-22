/**
 * Chapter 1 of the code, end to end: the rate schedule, the income definitions
 * it is applied to, and the long-term-gain stacking that runs alongside it.
 *
 * `totalTax` is where the whole chain lands, and it is the only tax figure this
 * app quotes. Medicare's IRMAA surcharge is not in it — that is a premium
 * rather than a tax, and it is charged two years later. See `irmaaFor`.
 */
import { filingParamsFor, resolveScenario } from './scenario';
import type { Scenario } from './scenario';
import { taxableSocialSecurity } from './socialSecurity';
import { deductionFor } from './deductions';

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

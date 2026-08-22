/**
 * IRC 86: the thresholds that have never moved, the benefit figures that move
 * every January, and the worksheet that turns the two into a taxable share.
 *
 * The contrast between those first two is the whole subject of this app — see
 * `SS_BASES` — which is why they sit in one file rather than being filed under
 * "constants" and "SSA figures".
 */
import type { FilingStatus, TaxYear } from './types';
import { defaultTaxYear, taxYearParams } from './params';
import { resolveScenario } from './scenario';
import type { Scenario } from './scenario';

/**
 * The Social Security provisional-income thresholds, which are the one set of
 * figures on this page that does *not* move.
 *
 * IRC 86(c) wrote $25,000/$32,000 into the statute in 1983 and $34,000/$44,000
 * in 1993, and neither has ever been indexed for inflation. Every other number
 * in this directory — brackets, standard deduction, capital-gain bands, the
 * benefit itself — is adjusted annually. So each COLA pushes the same real income
 * further past a threshold that has not moved in decades, and the share of
 * beneficiaries paying tax on benefits ratchets up year after year by design.
 * That contrast is the page's whole subject, and these live outside
 * `TAX_YEAR_PARAMS` to say so in the shape of the code rather than being
 * repeated identically under every year in it.
 */
export const SS_BASES: Record<FilingStatus, { ssBase50: number; ssBase85: number }> = {
  single: { ssBase50: 25_000, ssBase85: 34_000 },
  mfj: { ssBase50: 32_000, ssBase85: 44_000 },
};

/** The year each threshold in `SS_BASES` was last set by Congress. */
export const SS_BASE50_ENACTED = 1983;
export const SS_BASE85_ENACTED = 1993;

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
 * benefits without moving the ordinary tax base at all.
 */
export function taxableSocialSecurity(scenario: Scenario = {}): number {
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

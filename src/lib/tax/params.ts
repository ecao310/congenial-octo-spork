/**
 * The federal figures one tax year is priced from, and the accessors that
 * reach them.
 *
 * This is the only module in the directory that holds no arithmetic: adding a
 * year is an entry in `TAX_YEAR_PARAMS` and nothing else. Medicare's premiums
 * and the poverty guidelines are years of their own, published by other
 * agencies on other schedules — see `irmaa.ts` and `ptc.ts` for why they are
 * separate tables rather than fields on this one.
 */
import type { FilingStatus, TaxYear } from './types';

/** One rate band. `upTo` is the top of the band; the last band is Infinity. */
export interface Bracket {
  upTo: number;
  rate: number;
}

/** The inflation-adjusted figures for one filing status in one tax year. */
export interface FilingYearParams {
  /** Base standard deduction, IRC 63(c) as amended by the OBBBA. */
  standardDeduction: number;
  /**
   * Additional standard deduction per qualifying person age 65 or older,
   * IRC 63(f)(1). The same amount applies again for blindness, which this app
   * does not model.
   */
  additionalStdDeduction65: number;
  /** Ordinary-income rate schedule, IRC 1(j). */
  brackets: Bracket[];
  /**
   * Long-term capital gain and qualified dividend rate schedule, IRC 1(h).
   * The `upTo` values refer to total taxable income (ordinary + gains).
   */
  ltcgBrackets: Bracket[];
}

/** Everything about a tax year that this app needs. */
export interface TaxYearParams {
  year: TaxYear;
  /** Where the inflation-adjusted figures come from. */
  source: string;
  filing: Record<FilingStatus, FilingYearParams>;
  /**
   * SSA maximum annual benefit for a worker who claims at age 70 in this year.
   * Not last year's maximum times the COLA: it also depends on the earnings
   * record and delayed retirement credits of whoever turns 70 this year.
   */
  maxAnnualSSBenefit: number;
  /** SSA average annual benefit for a retired worker in January of this year. */
  avgAnnualSSBenefit: number;
  /**
   * The same two figures for a joint return, where two people collect.
   *
   * The maximum is the worker maximum doubled: two records, each with 35 years
   * at the taxable maximum, each claimed at 70. The average is not doubled and
   * cannot be. SSA publishes it separately — "aged couple, both receiving
   * benefits" — and it lands well under twice the retired-worker average,
   * because in a large share of those couples the second benefit is a spousal
   * one, worth half the higher earner's primary insurance amount rather than a
   * second full record.
   */
  maxAnnualCoupleSSBenefit: number;
  avgAnnualCoupleSSBenefit: number;
  /** The COLA that produced this year's benefit figures, in percent. */
  colaPercent: number;
}

/**
 * Federal parameters by tax year.
 *
 * Adding a year means adding one entry here; nothing downstream changes.
 *
 * Two statuses used to sit under each year alongside these: a separate return
 * that lived with its spouse, whose brackets are the joint ones halved under
 * IRC 1(j)(2)(D), and a head of household, whose bracket amounts and standard
 * deduction are its own under 1(j)(2)(B) and 63(c)(2)(B). Both are out — see
 * `FilingStatus` — so every figure below is one a reader can actually reach.
 */
export const TAX_YEAR_PARAMS: Record<TaxYear, TaxYearParams> = {
  2025: {
    year: 2025,
    source: 'Rev. Proc. 2024-40; OBBBA standard deductions; SSA (2.5% COLA)',
    maxAnnualSSBenefit: 61_296, // $5,108/mo at age 70
    avgAnnualSSBenefit: 23_712, // $1,976/mo, January 2025
    maxAnnualCoupleSSBenefit: 122_592, // two of the above
    avgAnnualCoupleSSBenefit: 37_068, // $3,089/mo, January 2025
    colaPercent: 2.5,
    filing: {
      single: {
        standardDeduction: 15_750,
        additionalStdDeduction65: 2_000,
        brackets: [
          { upTo: 11_925, rate: 0.1 },
          { upTo: 48_475, rate: 0.12 },
          { upTo: 103_350, rate: 0.22 },
          { upTo: 197_300, rate: 0.24 },
          { upTo: 250_525, rate: 0.32 },
          { upTo: 626_350, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 48_350, rate: 0 },
          { upTo: 533_400, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfj: {
        standardDeduction: 31_500,
        additionalStdDeduction65: 1_600,
        brackets: [
          { upTo: 23_850, rate: 0.1 },
          { upTo: 96_950, rate: 0.12 },
          { upTo: 206_700, rate: 0.22 },
          { upTo: 394_600, rate: 0.24 },
          { upTo: 501_050, rate: 0.32 },
          { upTo: 751_600, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 96_700, rate: 0 },
          { upTo: 600_050, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
    },
  },
  2026: {
    year: 2026,
    source: 'Rev. Proc. 2025-32; SSA (2.8% COLA)',
    maxAnnualSSBenefit: 62_172, // $5,181/mo at age 70
    avgAnnualSSBenefit: 24_852, // $2,071/mo, January 2026
    maxAnnualCoupleSSBenefit: 124_344, // two of the above
    avgAnnualCoupleSSBenefit: 38_496, // $3,208/mo, January 2026
    colaPercent: 2.8,
    filing: {
      single: {
        standardDeduction: 16_100,
        additionalStdDeduction65: 2_050,
        // The OBBBA gave the bottom two brackets an extra inflation adjustment
        // (roughly 4% against 2.3% for the rest), so the 12% band widened by
        // more than the bands above it.
        brackets: [
          { upTo: 12_400, rate: 0.1 },
          { upTo: 50_400, rate: 0.12 },
          { upTo: 105_700, rate: 0.22 },
          { upTo: 201_775, rate: 0.24 },
          { upTo: 256_225, rate: 0.32 },
          { upTo: 640_600, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 49_450, rate: 0 },
          { upTo: 545_500, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
      mfj: {
        standardDeduction: 32_200,
        additionalStdDeduction65: 1_650,
        brackets: [
          { upTo: 24_800, rate: 0.1 },
          { upTo: 100_800, rate: 0.12 },
          { upTo: 211_400, rate: 0.22 },
          { upTo: 403_550, rate: 0.24 },
          { upTo: 512_450, rate: 0.32 },
          { upTo: 768_700, rate: 0.35 },
          { upTo: Infinity, rate: 0.37 },
        ],
        ltcgBrackets: [
          { upTo: 98_900, rate: 0 },
          { upTo: 613_700, rate: 0.15 },
          { upTo: Infinity, rate: 0.2 },
        ],
      },
    },
  },
};

/** Every year this app has figures for, ascending. */
export const TAX_YEARS: TaxYear[] = [2025, 2026];

/**
 * Every filing status this app prices, in the order they are offered.
 *
 * The inhabitants of `FilingStatus`, written out: a union cannot be iterated,
 * and the strip that asks the question and the link that carries the answer
 * both need to walk the same list in the same order. Beside `TAX_YEARS`
 * because it is the same kind of fact about the same table — the other axis
 * `TAX_YEAR_PARAMS` is indexed along.
 */
export const FILING_STATUSES: FilingStatus[] = ['single', 'mfj'];

/**
 * The one year the page prices.
 *
 * The page used to open with a two-button year picker, and switching it was
 * the app's own comparison made live: the COLA raises the benefit every year
 * while IRC 86(c)'s $25,000 and $34,000 bases never move, so the same real
 * retirement is taxed harder each year. That contrast is worth stating and it
 * is not worth a control. It is stated in prose instead — see `SS_BASES` — and
 * every figure on the page now names one year rather than whichever of two the
 * reader last clicked.
 *
 * This is deliberately not `defaultTaxYear()`. That function follows the wall
 * calendar, so a page built on it would silently re-price itself the January
 * after a new year's Rev. Proc. landed, and a link sent in December would mean
 * something different in January. A constant means the year moves when someone
 * changes this line, which is the same moment they check the figures.
 *
 * Every module in this directory stays parameterized by year regardless: the
 * engine prices any year on file and the tests exercise all of them. This
 * constant is the render layer's choice, not the calculation's.
 */
export const PAGE_TAX_YEAR: TaxYear = 2026;

/**
 * The year to start on: the calendar year, when there are figures for it.
 *
 * Clamped into `TAX_YEARS` rather than left to fail, so the app keeps working
 * in January of a year whose Rev. Proc. has not been published yet (and in any
 * year after that, if nobody adds the new figures). It falls back to the most
 * recent year on file, which is the closest thing to correct that exists.
 */
export function defaultTaxYear(calendarYear = new Date().getFullYear()): TaxYear {
  const first = TAX_YEARS[0];
  const last = TAX_YEARS[TAX_YEARS.length - 1];
  if (calendarYear <= first) return first;
  if (calendarYear >= last) return last;
  // Matched against the list rather than cast into it, so a gap in the years on
  // file (2025 and 2027 but not 2026) falls back to a year that exists instead
  // of returning one with no parameters behind it.
  return TAX_YEARS.find((y) => y === calendarYear) ?? last;
}

/** The parameters for one tax year. */
export function taxYearParams(year: TaxYear = defaultTaxYear()): TaxYearParams {
  return TAX_YEAR_PARAMS[year];
}

/** The parameters for one filing status in one tax year. */
export function filingParams(
  year: TaxYear = defaultTaxYear(),
  filingStatus: FilingStatus = 'single',
): FilingYearParams {
  return TAX_YEAR_PARAMS[year].filing[filingStatus];
}

import {
  FilingStatus,
  Scenario,
  agiFor,
  irmaaFor,
  irmaaMagi,
  resolveScenario,
  taxableSocialSecurity,
  totalTax,
} from './tax';

/* ------------------------------------------------------------------ */
/*  Retroactive awards and the lump-sum election (IRC 86(e))          */
/* ------------------------------------------------------------------ */

/**
 * The first year Pub 915's Worksheet 2 covers.
 *
 * OBRA 1993 added the 85% tier effective for tax years beginning after 1993,
 * so a back-pay year of 1993 or earlier has only the 50% tier and needs
 * Worksheet 3 instead. Nothing here models that: an award reaching back past
 * 1993 would be three decades late, and the app would rather refuse the year
 * than quietly apply a tier that did not exist yet.
 */
export const BACK_PAY_FIRST_MODELLED_YEAR = 1994;

/**
 * The checkbox that makes the election. There is no separate form and nothing
 * to attach — Pub 915 says to keep the worksheets with your records.
 */
export const LUMP_SUM_ELECTION_BOX = '6c';

/** One earlier tax year that a slice of a retroactive award is attributable to. */
export interface BackPayYear {
  /** The earlier tax year. 86(e)(2)(A) attributes a benefit to the year its
   * "generally applicable payment date" fell in, not the year it was paid. */
  year: number;
  /** How many months of benefit accrued in that year, for the prose. */
  months: number;
  /** The slice of the award attributable to it — part of Worksheet 2, line 1. */
  portion: number;
  /**
   * Benefits actually received *during* that year — the rest of Worksheet 2
   * line 1, off that year's own SSA-1099.
   *
   * Zero in the ordinary case, and that is what makes it back pay: the months
   * being paid for now are months nothing was paid for then. It is not always
   * zero — SSA also pays retroactive *increases* to people already collecting —
   * so the field exists rather than being assumed away.
   */
  benefitsReceived: number;
  /**
   * That year's AGI with its taxable benefits taken back out — Worksheet 2's
   * line 3 net of its line 7.
   *
   * Capital gains belong in here rather than in a field of their own. 86(b)
   * builds provisional income out of AGI and does not care what kind of income
   * made it up, and no rate schedule is consulted for a prior year at all — see
   * `backPayYearIncrease` — so a dollar of gain and a dollar of pension are the
   * same dollar to this computation.
   */
  otherIncome: number;
  /** That year's tax-exempt interest — Worksheet 2, line 5. */
  muniInterest: number;
  /** That year's filing status, which chooses Worksheet 2's lines 9 and 11. */
  filingStatus: FilingStatus;
}

/** A back-pay year with the three Worksheet 2 figures that matter. */
export interface BackPayYearResult extends BackPayYear {
  /** Worksheet 2 line 20: what that year's return actually showed as taxable. */
  previouslyReported: number;
  /** Worksheet 2 line 19: the same year refigured with its slice added. */
  refigured: number;
  /** Worksheet 2 line 21: the increase this year contributes to the election. */
  additional: number;
}

/** A retroactive award, already split across the years it is attributable to. */
export interface RetroactiveAward {
  /** Total back pay attributable to years before the award year. */
  lumpSum: number;
  /** Months of benefit it covers, all of them before the award year. */
  months: number;
  /** The monthly rate those months accrued at. */
  monthlyBenefit: number;
  /** Earliest year first. Empty when there is no back pay. */
  years: BackPayYear[];
}

/** Everything needed to build a `RetroactiveAward` out of a month count. */
export interface BackPayPlan {
  /** The year the whole payment lands and is taxed. */
  awardYear: number;
  /**
   * Months of benefit that accrued before January 1 of the award year.
   *
   * Deliberately only the part attributable to *earlier* years. An award also
   * covers the months of the award year itself, but those are attributable to
   * the award year, so they are already inside the ordinary annual benefit and
   * the election has nothing to say about them.
   */
  months: number;
  /** The monthly benefit rate the back pay accrued at. */
  monthlyBenefit: number;
  /** Other income in each back-pay year — see `BackPayYear.otherIncome`. */
  otherIncome: number;
  /** Tax-exempt interest in each back-pay year. */
  muniInterest?: number;
  /** Benefits received in each back-pay year. Zero unless it is a raise. */
  benefitsReceived?: number;
  /** Filing status in each back-pay year. */
  filingStatus?: FilingStatus;
}

/**
 * Cuts `months` of back pay into the calendar years it is attributable to.
 *
 * Twelve months to each year, working backwards from the year before the award,
 * with whatever is left landing on the earliest year — which is what makes the
 * earliest year the small one. A flat monthly rate across the whole stretch is
 * a simplification: real back pay is figured at each year's own COLA, so the
 * earliest slices are a few percent smaller than this makes them. That moves
 * every figure the same direction by the same little, and it would take a
 * second inflation assumption to model, which this section does not need to
 * make its point.
 */
export function splitBackPay(plan: BackPayPlan): RetroactiveAward {
  const monthlyBenefit = Math.max(0, plan.monthlyBenefit);
  const months = Math.max(0, Math.floor(plan.months));
  const years: BackPayYear[] = [];

  let remaining = months;
  let year = plan.awardYear - 1;
  while (remaining > 0) {
    const monthsThisYear = Math.min(12, remaining);
    years.unshift({
      year,
      months: monthsThisYear,
      portion: monthsThisYear * monthlyBenefit,
      benefitsReceived: plan.benefitsReceived ?? 0,
      otherIncome: plan.otherIncome,
      muniInterest: plan.muniInterest ?? 0,
      filingStatus: plan.filingStatus ?? 'single',
    });
    remaining -= monthsThisYear;
    year -= 1;
  }

  return { lumpSum: months * monthlyBenefit, months, monthlyBenefit, years };
}

/**
 * Pub 915 Worksheet 2 for one earlier year: refigure that year's taxable
 * benefits with its slice of the award added, then subtract what that year's
 * return already reported. The difference is what the election lets this year
 * substitute for the slice.
 *
 * The striking part is what this does *not* need. No bracket table, no standard
 * deduction, no rate — 86(e)(1) caps an amount of *gross income*, not an amount
 * of tax, so the earlier year contributes an inclusion and the year of receipt
 * taxes it at its own rates. And the thresholds it does need have not moved
 * since 1993, so a 2019 back-pay year is figured against the same $25,000 and
 * $34,000 as a 2025 one. The whole computation runs on frozen numbers, which is
 * the reason it can reach back years the app has no other figures for.
 */
export function backPayYearIncrease(backPay: BackPayYear): BackPayYearResult {
  const base: Scenario = {
    ordinaryIncome: backPay.otherIncome,
    muniInterest: backPay.muniInterest,
    filingStatus: backPay.filingStatus,
  };
  const previouslyReported = taxableSocialSecurity({
    ...base,
    ssBenefit: backPay.benefitsReceived,
  });
  const refigured = taxableSocialSecurity({
    ...base,
    ssBenefit: backPay.benefitsReceived + Math.max(0, backPay.portion),
  });
  return {
    ...backPay,
    previouslyReported,
    refigured,
    // Worksheet 2 subtracts without a floor, but adding benefits can only ever
    // raise the inclusion, so the floor is a guard rather than a rule.
    additional: Math.max(0, refigured - previouslyReported),
  };
}

/**
 * Whether a year's inclusion is the 85% ceiling itself rather than a slice of
 * the tier below it. Half a cent of tolerance because the comparison is between
 * two float products of 0.85, not between dollars.
 */
function isAtTheCap(taxable: number, benefit: number): boolean {
  return Math.abs(taxable - 0.85 * benefit) < 0.005;
}

/** What the election is worth, and what it would cost not to make it. */
export interface LumpSumElection {
  /** Back pay attributable to earlier years, as received this year. */
  lumpSum: number;
  /** Each earlier year with its Worksheet 2 figures. Earliest first. */
  years: BackPayYearResult[];
  /** Worksheet 1 line 19: everything taxed in the year of receipt, no election. */
  taxableWithout: number;
  /** Worksheet 4 line 19: the year of receipt counting only its own benefits. */
  currentYearOnly: number;
  /** Worksheet 4 line 20: the earlier years' increases, added up. */
  priorYearIncrease: number;
  /** Worksheet 4 line 21: what the election would report. */
  taxableWithElection: number;
  /** Worksheet 4's closing question — is line 21 below Worksheet 1's line 19? */
  worthElecting: boolean;
  /** What the return will actually show: the smaller of the two. */
  taxableElected: number;
  /** Benefits the election keeps out of the tax base. */
  taxableSaved: number;
  /** AGI with the whole award taxed in the year of receipt. */
  agiWithout: number;
  /** AGI under the election. */
  agiWith: number;
  /** Federal tax with the whole award taxed in the year of receipt. */
  taxWithout: number;
  /** Federal tax under the election. */
  taxWith: number;
  /** taxWithout - taxWith. Never negative: 86(e) is a ceiling. */
  taxSaved: number;
  /** Share of the award the election keeps out of the base, in percent. */
  taxableSavedPercent: number;
  /** Medicare's MAGI without the election. */
  irmaaMagiWithout: number;
  /** Medicare's MAGI with it. */
  irmaaMagiWith: number;
  /** IRMAA tier without the election; 0 when no surcharge applies. */
  irmaaTierWithout: number;
  /** IRMAA tier with it. */
  irmaaTierWith: number;
  /** Household annual IRMAA surcharge saved, two years out. */
  irmaaSurchargeSaved: number;
  /** A back-pay year sits at or before 1993, where Worksheet 3 takes over. */
  reachesBefore1994: boolean;
  /**
   * Every year involved — the year of receipt and each waiting year — has its
   * own benefit fully at the 85% ceiling.
   *
   * Exists because of what it rules out. When the two treatments report the
   * same figure it is nearly always because no year has an unused threshold
   * left, and saying so is the whole explanation. But equality is also
   * reachable as a coincidence: a waiting year sitting exactly on the $25,000
   * base hands back exactly what the award would have added to the year of
   * receipt, and every year involved can be in the 50% tier while the totals
   * still match to the dollar. Calling that "the 85% cap binds" would be false
   * in every particular — see the knife-edge test.
   */
  capBindsEveryYear: boolean;
}

/**
 * The whole Worksheet 4 comparison: what a retroactive award costs taxed in one
 * year, and what IRC 86(e) will let it cost instead.
 *
 * `scenario.ssBenefit` is the *ongoing* annual benefit — the year of receipt's
 * own months. The award is added on top of it for the no-election figure,
 * because Worksheet 1 line 1 is every dollar of box 5, back pay included.
 *
 * Why the election usually wins: without it, one year's single set of
 * thresholds has to absorb several years of benefit at once, so the whole award
 * lands above the $34,000 adjusted base and 85 cents of every dollar of it is
 * taxable. With it, each earlier year gets its own $25,000 and $34,000 back,
 * and a year the filer was living on almost nothing — which is the usual reason
 * an award took years to arrive — may absorb its slice at 50 cents on the
 * dollar, or at nothing at all.
 *
 * Why it sometimes loses: the same arithmetic in reverse. A filer who was
 * working through the wait and has little income now can find each earlier year
 * fully in the 85% tier while the year of receipt still has a threshold to
 * spare. 86(e) is a ceiling, so that costs nothing — the election is simply not
 * made — but Worksheet 4 asks the question for a reason.
 */
export function lumpSumElection(
  scenario: Scenario = {},
  award: RetroactiveAward,
): LumpSumElection {
  const { ssBenefit } = resolveScenario(scenario);
  const lumpSum = Math.max(0, award.lumpSum);
  const years = award.years.map(backPayYearIncrease);
  const priorYearIncrease = years.reduce((sum, y) => sum + y.additional, 0);

  // Worksheet 4 lines 1-19. The scenario's benefit is already the year of
  // receipt's own months, so this is the scenario untouched — but with any
  // inherited ceiling cleared, since this figure is an input to the ceiling.
  const currentYearOnly = taxableSocialSecurity({ ...scenario, taxableSSCap: null });

  // Worksheet 1: the default treatment, every dollar received this year.
  const received: Scenario = {
    ...scenario,
    ssBenefit: ssBenefit + lumpSum,
    taxableSSCap: null,
  };
  const taxableWithout = taxableSocialSecurity(received);

  const taxableWithElection = currentYearOnly + priorYearIncrease;
  const elected: Scenario = { ...received, taxableSSCap: taxableWithElection };
  const taxableElected = taxableSocialSecurity(elected);

  const magiWithout = irmaaMagi(received);
  const magiWith = irmaaMagi(elected);
  const irmaaWithout = irmaaFor(magiWithout, received);
  const irmaaWith = irmaaFor(magiWith, elected);

  const taxWithout = Math.round(totalTax(received));
  const taxWith = Math.round(totalTax(elected));
  const taxableSaved = taxableWithout - taxableElected;

  return {
    lumpSum: Math.round(lumpSum),
    years,
    taxableWithout: Math.round(taxableWithout),
    currentYearOnly: Math.round(currentYearOnly),
    priorYearIncrease: Math.round(priorYearIncrease),
    taxableWithElection: Math.round(taxableWithElection),
    worthElecting: taxableWithElection < taxableWithout,
    taxableElected: Math.round(taxableElected),
    taxableSaved: Math.round(taxableSaved),
    agiWithout: Math.round(agiFor(received)),
    agiWith: Math.round(agiFor(elected)),
    taxWithout,
    taxWith,
    taxSaved: taxWithout - taxWith,
    taxableSavedPercent:
      lumpSum > 0 ? Math.round((taxableSaved / lumpSum) * 10_000) / 100 : 0,
    irmaaMagiWithout: Math.round(magiWithout),
    irmaaMagiWith: Math.round(magiWith),
    irmaaTierWithout: irmaaWithout.tier,
    irmaaTierWith: irmaaWith.tier,
    irmaaSurchargeSaved:
      Math.round(
        (irmaaWithout.annualSurcharge - irmaaWith.annualSurcharge) * 100,
      ) / 100,
    reachesBefore1994: years.some(
      (y) => y.year < BACK_PAY_FIRST_MODELLED_YEAR,
    ),
    capBindsEveryYear:
      years.every((y) => isAtTheCap(y.additional, y.portion)) &&
      isAtTheCap(currentYearOnly, ssBenefit),
  };
}

/** One point on the back-pay chart: both treatments at one award length. */
export interface BackPayCurvePoint {
  /** Months of back pay, all attributable to years before the award year. */
  months: number;
  /** The award those months add up to. */
  lumpSum: number;
  /** How many earlier years it spreads across. */
  yearsCovered: number;
  /** Taxable benefits with the whole award taxed in the year of receipt. */
  taxableWithout: number;
  /** Taxable benefits under the election. */
  taxableWith: number;
  /** Federal tax, no election. */
  taxWithout: number;
  /** Federal tax under the election. */
  taxWith: number;
  /** The gap between them. */
  taxSaved: number;
}

export interface BackPayCurveRange {
  /** Right edge of the swept month axis. */
  maxMonths?: number;
  /** Sampling interval, in months. */
  step?: number;
}

/**
 * Both treatments swept over the length of the award.
 *
 * The gap opens fastest over the first two or three years, because each new
 * earlier year hands back a whole unused set of thresholds while the no-
 * election figure is already deep in the 85% tier. Past the point where every
 * earlier year is itself in the 85% tier the two lines climb at the same 85
 * cents on the dollar and the gap stops widening — the election locks in what
 * it saved rather than saving more.
 */
export function backPayCurve(
  scenario: Scenario = {},
  plan: Omit<BackPayPlan, 'months'>,
  { maxMonths = 60, step = 1 }: BackPayCurveRange = {},
): BackPayCurvePoint[] {
  const points: BackPayCurvePoint[] = [];
  for (let months = 0; months <= maxMonths; months += step) {
    const award = splitBackPay({ ...plan, months });
    const result = lumpSumElection(scenario, award);
    points.push({
      months,
      lumpSum: result.lumpSum,
      yearsCovered: award.years.length,
      taxableWithout: result.taxableWithout,
      taxableWith: result.taxableElected,
      taxWithout: result.taxWithout,
      taxWith: result.taxWith,
      taxSaved: result.taxSaved,
    });
  }
  return points;
}

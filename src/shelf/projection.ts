import {
  FilingStatus,
  FilingYearParams,
  ProjectedYear,
  QCD_MIN_AGE,
  SENIOR_DEDUCTION_LAST_YEAR,
  Scenario,
  TaxYear,
  agiFor,
  deductionFor,
  filingParams,
  hasPublishedParams,
  publishedAnchorYear,
  qcdAnnualLimit,
  resolveScenario,
  seniorDeductionFor,
  taxableSocialSecurity,
  totalTax,
} from '../utils/tax';

/* ------------------------------------------------------------------ */
/*  Indexing published figures forward                                */
/* ------------------------------------------------------------------ */

/**
 * IRC 1(f): an indexed increase that is not a multiple of $50 is "rounded to
 * the next lowest multiple of $50" — $25 instead, on the rate tables of a
 * married individual filing separately, but *not* on that filer's standard
 * deduction, which subparagraph (B) exempts by cross-reference to 63(c)(4).
 */
const ROUNDING = 50;
const ROUNDING_MFS_RATE_TABLE = 25;

/**
 * One figure carried forward `factor - 1` worth of inflation.
 *
 * The statute rounds the *increase*, not the result, so this adds a rounded
 * increase to an unrounded base rather than rounding the product — those differ
 * whenever the base is not itself a multiple of the step, which the 2025 single
 * 12% bracket top ($48,475) is not.
 *
 * An approximation in one respect: the real adjustment measures the increase
 * from a fixed statutory base year and rounds once, where this compounds a
 * rounded figure. Over thirty years the drift is tens of dollars on a bracket
 * edge — invisible next to the assumption about inflation itself.
 */
function indexAmount(base: number, factor: number, step: number): number {
  // The top bracket has no ceiling, and Infinity survives every adjustment.
  if (!Number.isFinite(base)) return base;
  return base + Math.floor((base * (factor - 1)) / step) * step;
}

/**
 * A filing status's brackets, standard deduction and capital-gain bands, moved
 * `yearsForward` years at `inflationPercent` a year.
 *
 * Everything here is indexed annually under IRC 1(f) and 63(c)(4). The Social
 * Security provisional-income thresholds are not, which is why they are absent
 * from this function and from `FilingYearParams` alike — see `SS_BASES`.
 */
export function projectFilingParams(
  base: FilingYearParams,
  filingStatus: FilingStatus,
  yearsForward: number,
  inflationPercent: number,
): FilingYearParams {
  if (yearsForward <= 0) return base;
  const factor = (1 + inflationPercent / 100) ** yearsForward;
  const rateStep = filingStatus === 'mfs' ? ROUNDING_MFS_RATE_TABLE : ROUNDING;
  const indexBracket = ({ upTo, rate }: { upTo: number; rate: number }) => ({
    upTo: indexAmount(upTo, factor, rateStep),
    rate,
  });
  return {
    standardDeduction: indexAmount(base.standardDeduction, factor, ROUNDING),
    additionalStdDeduction65: indexAmount(
      base.additionalStdDeduction65,
      factor,
      ROUNDING,
    ),
    brackets: base.brackets.map(indexBracket),
    ltcgBrackets: base.ltcgBrackets.map(indexBracket),
  };
}

/**
 * The whole projected year — calendar year plus its figures.
 *
 * Anchored on the latest year `TAX_YEAR_PARAMS` covers at or below the target,
 * and indexed only past that. So a projection that starts in 2025 reads
 * Rev. Proc. 2025-32 for 2026 rather than guessing at it, and the assumption
 * slider first bites in 2027.
 *
 * The cost is a kink: at an assumed 5% the brackets still widen by the actual
 * 2.7% in the one year that is already law, and the curve bends where the
 * assumption takes over. That is worth saying out loud in the UI — see
 * `Projection.publishedThroughYear` — and it beats reporting a 2026 standard
 * deduction that is not the one on the form.
 */
export function projectYearParams(
  startYear: TaxYear,
  filingStatus: FilingStatus,
  yearsForward: number,
  inflationPercent: number,
): ProjectedYear {
  const year = startYear + yearsForward;
  const anchor = publishedAnchorYear(year);
  return {
    year,
    filing: projectFilingParams(
      filingParams(anchor, filingStatus),
      filingStatus,
      year - anchor,
      inflationPercent,
    ),
  };
}

/**
 * 408(d)(8)(A) rounds its indexed limit "to the nearest multiple of $1,000",
 * which is neither IRC 1(f)'s step nor its direction — that one rounds the
 * increase down to $50. The published figures bear the difference out:
 * $105,000 for 2024, $108,000 for 2025, $111,000 for 2026.
 */
const QCD_LIMIT_ROUNDING = 1_000;

/**
 * The most a return may exclude in a projected year.
 *
 * Anchored on published figures and indexed only past them, exactly like the
 * brackets — which matters more here than it looks. The gift itself grows at
 * inflation, so a limit held flat would start clipping a real-constant gift
 * partway through the horizon for no reason in the statute; section 307 of
 * SECURE 2.0 indexed this limit precisely so that it would not.
 *
 * Per individual rather than per return, so a joint return gets it twice — see
 * `qcdLimitFor`, which makes the same assumption for the same reason.
 */
export function projectQcdLimit(
  startYear: TaxYear,
  filingStatus: FilingStatus,
  yearsForward: number,
  inflationPercent: number,
): number {
  const year = startYear + yearsForward;
  const anchor = publishedAnchorYear(year);
  const factor = (1 + inflationPercent / 100) ** (year - anchor);
  const perPerson =
    Math.round((qcdAnnualLimit(anchor) * factor) / QCD_LIMIT_ROUNDING) *
    QCD_LIMIT_ROUNDING;
  return perPerson * (filingStatus === 'mfj' ? 2 : 1);
}

/**
 * The first whole age at which a birth *year* settles the 70 1/2 question.
 *
 * 408(d)(8)(B)(ii) measures the age to the day and these projections know only
 * the year: someone born in January reaches 70 1/2 during the year they turn
 * 70, someone born in December not until the year they turn 71. So 71 is the
 * first age at which every filer born in a given year has certainly got there,
 * and starting the gift then errs a year late rather than letting half of them
 * give a year early.
 */
export const QCD_FIRST_CERTAIN_AGE = Math.ceil(QCD_MIN_AGE);

/**
 * The gift that actually leaves the IRA in one projected year: what was asked
 * for, grown to that year, and capped by the statutory limit, by the balance
 * there is to give from, and by the age at which giving becomes possible.
 *
 * Shared with `sequencing.ts` for the same reason `seniorsAtAge` is: the two
 * sections run the same calendar over the same retirement, and a gift that
 * started in different years in each would make them disagree about it.
 */
export function qcdInYear(
  annualQcd: number,
  age: number,
  openingBalance: number,
  startYear: TaxYear,
  filingStatus: FilingStatus,
  yearsForward: number,
  inflationPercent: number,
): number {
  if (annualQcd <= 0 || age < QCD_FIRST_CERTAIN_AGE) return 0;
  const asked = annualQcd * (1 + inflationPercent / 100) ** yearsForward;
  return Math.max(
    0,
    Math.min(
      asked,
      projectQcdLimit(startYear, filingStatus, yearsForward, inflationPercent),
      openingBalance,
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  Required minimum distributions                                    */
/* ------------------------------------------------------------------ */

/**
 * The Uniform Lifetime Table, Treas. Reg. 1.401(a)(9)-9(c) Table 2, as
 * rewritten by T.D. 9930 for distribution years from 2022 on. The account
 * balance at the end of the previous year divided by the divisor for the age
 * reached during this one is the required minimum distribution.
 *
 * This is the table for the ordinary case. A retiree whose sole beneficiary is
 * a spouse more than ten years younger uses the Joint and Last Survivor Table
 * instead, which gives a longer period and so a smaller distribution.
 */
export const UNIFORM_LIFETIME_DIVISORS: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
  86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
  93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
  100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3,
  107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
  114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

/** The first and last ages the Uniform Lifetime Table prints. */
export const UNIFORM_LIFETIME_FIRST_AGE = 72;
export const UNIFORM_LIFETIME_LAST_AGE = 120;

/** The divisor for an age, or `null` below the table's first row. */
export function rmdDivisor(age: number): number | null {
  const whole = Math.floor(age);
  if (whole < UNIFORM_LIFETIME_FIRST_AGE) return null;
  // The last row is printed "120+", so it covers everyone past it.
  return UNIFORM_LIFETIME_DIVISORS[Math.min(whole, UNIFORM_LIFETIME_LAST_AGE)];
}

/**
 * The age at which distributions become required, from the year of birth.
 *
 * SECURE 2.0 section 107 rewrote IRC 401(a)(9)(C)(v) as two overlapping
 * sentences: age 73 for someone who "attains age 72 after December 31, 2022,
 * and age 73 before January 1, 2033", and age 75 for someone who "attains age
 * 74 after December 31, 2032". Anyone born in 1959 satisfies both — they turn
 * 73 in 2032 and 74 in 2033 — so the statute literally assigns them two
 * applicable ages.
 *
 * The final regulations declined to pick one: 1.401(a)(9)-2(b)(2) runs
 * (iv) "born in 1951 through 1958 … age 73", (v) [Reserved], (vi) "born after
 * 1959 … age 75". The reserved paragraph is 1959, and the proposed regulations
 * issued alongside them (REG-103529-23, 89 FR 58886) would fill it with age 73.
 * That is not final, so a 1959 birth year is the one answer here that could
 * still change; this follows the proposal.
 *
 * Below 1951 the answer is 72, or 70 1/2 for anyone born before 1 July 1949 —
 * a distinction a birth *year* cannot make, and one that changes nothing for
 * this app, since either way those distributions began years before the first
 * year it can project.
 */
export function rmdApplicableAge(birthYear: number): number {
  if (birthYear < 1951) return RMD_AGE_BEFORE_SECURE_2;
  if (birthYear <= 1959) return 73;
  return 75;
}

/** The birth years whose applicable age the regulations have not settled. */
export const RMD_RESERVED_BIRTH_YEAR = 1959;

/**
 * The applicable age as SECURE 1.0 left it, which section 107 of SECURE 2.0
 * then raised to 73 and 75. Anyone born before 1951 was already there.
 */
export const RMD_AGE_BEFORE_SECURE_2 = 72;

/* ------------------------------------------------------------------ */
/*  The projection                                                    */
/* ------------------------------------------------------------------ */

export interface ProjectionAssumptions {
  /** First year of the projection. Defaults to the scenario's tax year. */
  startYear?: TaxYear;
  /** How many years to run, counting the first. */
  years?: number;
  /** Annual Social Security COLA, in percent. */
  colaPercent?: number;
  /**
   * Annual indexing of brackets, deductions and the filer's other income, in
   * percent. Defaults to the COLA, which holds real income flat and leaves the
   * frozen thresholds as the only thing moving.
   */
  inflationPercent?: number;
  /** Calendar year of birth, which fixes the RMD applicable age. */
  birthYear?: number;
  /** Traditional IRA and 401(k) balance on 31 December before the first year. */
  traditionalBalance?: number;
  /** Annual growth on that balance, in percent. */
  balanceGrowthPercent?: number;
  /**
   * A qualified charitable distribution repeated every year, in first-year
   * dollars, growing with inflation like every other real figure here.
   *
   * It comes out of the IRA balance rather than out of the other-income slider,
   * which is where the single-year section on the Strategies tab takes it from.
   * The two are not in conflict: that section has no balance to give from and
   * so reads the whole of other income as IRA money, while this one is built
   * around a balance and already treats other income as separate from it.
   */
  annualQcd?: number;
}

export interface ProjectionYearRow {
  year: number;
  /** Age reached during the year — what the RMD table is read at. */
  age: number;
  /** Gross benefit after `year - startYear` COLAs. */
  ssBenefit: number;
  /** Ordinary income other than the required distribution. */
  otherIncome: number;
  /** The required minimum distribution, or 0 before the applicable age. */
  rmd: number;
  /**
   * Paid straight from the IRA to the charity: the annual gift, capped by the
   * statutory limit and by the balance, and zero before the filer has certainly
   * reached 70 1/2. See `qcdInYear`.
   */
  qcd: number;
  /**
   * The part of the required distribution still in the tax base. A QCD counts
   * toward the required amount, so a gift at least as large as the requirement
   * leaves nothing of it to report — which is the one move that satisfies the
   * RMD and skips the torpedo at the same time.
   */
  taxableRmd: number;
  /**
   * The balance the year opened with — 31 December of the year before, which is
   * the figure the Uniform Lifetime Table divides. Not `balance` of the
   * previous row minus anything: that one has already been grown.
   */
  openingBalance: number;
  /** otherIncome + taxableRmd: ordinary income as the return reports it. */
  ordinaryIncome: number;
  muniInterest: number;
  /**
   * Traditional balance at the end of the year, after the gift, the rest of the
   * distribution, and growth.
   */
  balance: number;
  provisionalIncome: number;
  taxableSS: number;
  /** The taxable share of the benefit, 0 to 85. */
  taxableSharePercent: number;
  /** Standard deduction, the age-65 addition, and the senior deduction. */
  deduction: number;
  /** The OBBBA senior deduction alone — zero once it expires after 2028. */
  seniorDeduction: number;
  /**
   * Benefit + other income + the reportable distribution + tax-exempt interest.
   *
   * The gift is absent, and by statute rather than by choice: 408(d)(8) keeps a
   * QCD out of gross income entirely, and the filer never had it to receive.
   */
  grossIncome: number;
  totalTax: number;
  /** totalTax over grossIncome, in percent. */
  effectiveRatePercent: number;
  /** totalTax deflated to first-year dollars. */
  realTotalTax: number;
  /**
   * Whether this year's brackets, standard deduction and gain bands are
   * published figures rather than the inflation slider's work. The benefit is
   * grown by the slider either way — see `projectYears`.
   */
  figuresPublished: boolean;
}

export interface Projection {
  rows: ProjectionYearRow[];
  first: ProjectionYearRow;
  last: ProjectionYearRow;
  startYear: number;
  endYear: number;
  /**
   * The last year of an unbroken run from `startYear` whose figures are
   * published rather than assumed. Equal to `startYear` whenever the horizon
   * starts on the newest year on file, which is the ordinary case — so the UI
   * has something to test before it promises the reader anything.
   */
  publishedThroughYear: number;
  birthYear: number;
  applicableAge: number;
  /** First year a distribution is required, when the horizon reaches it. */
  firstRmdYear: number | null;
  /**
   * First year the gift actually leaves the IRA, or null when none ever does —
   * because none was asked for, because the horizon ends before the filer is
   * certainly 70 1/2, or because there is no balance to give from.
   */
  firstQcdYear: number | null;
  /** Every year's gift added up, in nominal dollars. */
  totalQcd: number;
  /**
   * The same, each year deflated to first-year dollars — the figure to divide
   * `lifetimeRealTax` savings by, since both sides then carry the same dollars.
   */
  totalRealQcd: number;
  /** First year any of the benefit is taxable. */
  firstTaxedYear: number | null;
  /** First year the 85% cap binds — the ratchet's ceiling. */
  fullyTaxedYear: number | null;
  /**
   * The year the OBBBA senior deduction expires by statute, when the horizon
   * spans that transition and there was a deduction to lose.
   *
   * The expiry, specifically — not the income phaseout, which also ends at
   * zero but gets there 6 cents to the dollar, continuously, and so is already
   * priced into the curve rather than being a step in it.
   */
  seniorDeductionEndsYear: number | null;
  /**
   * Every year's federal tax, each deflated to first-year dollars and added up.
   *
   * The figure to difference against another run of the same scenario: it is
   * what a recurring gift, or a different COLA, is worth over the whole horizon
   * rather than in whichever year the reader is hovering over.
   */
  lifetimeRealTax: number;
  /** Last year's real tax over the first year's, or `null` if that was zero. */
  realTaxMultiple: number | null;
  /**
   * Last year's tax in first-year dollars, less the first year's. Always
   * renderable, unlike the multiple — a filer who owes nothing in year one has
   * no ratio, but the ratchet still costs them a number of real dollars.
   */
  realTaxIncrease: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * How many people on the return have reached 65 in a projected year.
 *
 * The filer's own age is known, so it is used rather than the app's toggle. A
 * second qualifying spouse is carried over from the scenario, which means the
 * projection treats a couple who both qualify today as staying that way — it
 * cannot know a younger spouse's birthday, and a couple where only one has
 * turned 65 is modelled as one qualifier throughout.
 *
 * Exported for `sequencing.ts`, which runs the same calendar over the same
 * scenario and must age the filer identically or the two sections disagree.
 */
export function seniorsAtAge(
  age: number,
  filingStatus: FilingStatus,
  scenarioSeniors: number,
): number {
  if (age < 65) return 0;
  return filingStatus === 'mfj' && scenarioSeniors === 2 ? 2 : 1;
}

/**
 * The same scenario, taxed year after year while the thresholds stand still.
 *
 * Every indexed figure moves together: brackets, the standard deduction and the
 * capital-gain bands index at `inflationPercent`, the benefit rises with
 * `colaPercent`, and other income and tax-exempt interest keep pace with
 * inflation so the filer's *real* income never changes. Leave the two rates
 * equal — the default — and literally the only thing that moves in real terms
 * is IRC 86(c)'s $25,000/$32,000 and $34,000/$44,000, unindexed since 1983 and
 * 1993. The rising taxable share is that and nothing else.
 *
 * With one exception, and it is the honest one: any year `TAX_YEAR_PARAMS`
 * already covers uses its published brackets, standard deduction and gain
 * bands rather than the inflation slider's guess at them. Those figures are
 * law. `publishedThroughYear` says how far that reaches.
 *
 * The benefit is not anchored the same way, even though the COLA for a
 * published year is equally announced. `colaPercent` is the reader's own
 * assumption and the axis the whole section teaches — override year one of it
 * and "hold your income flat in real terms" stops being true of the chart,
 * since the filer's other income has no published figure to be anchored to.
 * Anchoring the brackets costs nothing there: at a flat 0% the taxable share
 * still sits perfectly still, because provisional income has not moved.
 *
 * Two things then break the smoothness: required distributions switching on at
 * the applicable age, and the OBBBA senior deduction expiring after 2028.
 *
 * A recurring `annualQcd` bends it a third way, and the only way any of this
 * can be bent downward: the gift satisfies the required distribution without
 * entering the tax base, and it shrinks the balance that every later
 * requirement is measured against — so its effect compounds over a horizon in
 * the same way the torpedo does, in the opposite direction.
 *
 * Deliberately outside the model: capital gains, which are realised once rather
 * than every year for thirty; IRMAA, whose thresholds *are* indexed, so it
 * would blur the point rather than sharpen it; and state tax, which nine states
 * charge on nine different rules — see `stateTax.ts`.
 */
export function projectYears(
  scenario: Scenario = {},
  assumptions: ProjectionAssumptions = {},
): Projection {
  const base = resolveScenario(scenario);
  const startYear = assumptions.startYear ?? base.year;
  const years = Math.max(1, Math.round(assumptions.years ?? 20));
  const colaPercent = assumptions.colaPercent ?? 2.5;
  const inflationPercent = assumptions.inflationPercent ?? colaPercent;
  const birthYear = assumptions.birthYear ?? startYear - 70;
  const applicableAge = rmdApplicableAge(birthYear);
  const growth = 1 + (assumptions.balanceGrowthPercent ?? 5) / 100;
  const annualQcd = Math.max(0, assumptions.annualQcd ?? 0);
  const cola = 1 + colaPercent / 100;
  const inflation = 1 + inflationPercent / 100;

  // The balance the first year's distribution would be measured against: the
  // 31 December figure for the year before the projection starts.
  let balance = Math.max(0, assumptions.traditionalBalance ?? 0);

  const rows: ProjectionYearRow[] = [];
  for (let n = 0; n < years; n += 1) {
    const year = startYear + n;
    const age = year - birthYear;

    const priorYearEndBalance = balance;
    const divisor = age >= applicableAge ? rmdDivisor(age) : null;
    const rmd = divisor === null ? 0 : priorYearEndBalance / divisor;

    // The gift leaves the IRA whether or not anything is required to, and
    // counts toward the requirement when something is. So what the account
    // gives up is the larger of the two, and what reaches the return is only
    // whatever is left of the requirement once the gift has covered its share.
    const qcd = qcdInYear(
      annualQcd,
      age,
      priorYearEndBalance,
      startYear,
      base.filingStatus,
      n,
      inflationPercent,
    );
    const taxableRmd = Math.max(0, rmd - qcd);
    balance = Math.max(0, priorYearEndBalance - Math.max(rmd, qcd)) * growth;

    const ssBenefit = base.ssBenefit * cola ** n;
    const otherIncome = base.ordinaryIncome * inflation ** n;
    const muniInterest = base.muniInterest * inflation ** n;
    const ordinaryIncome = otherIncome + taxableRmd;

    // `ordinaryIncome` is already net of the gift, and the scenario's own `qcd`
    // field is deliberately left alone: it re-applies `qcdLimitFor`, which reads
    // the *start* year's published limit, and would clip a gift that the
    // projected year's indexed limit allows. The cap has been applied once, at
    // the right year, in `qcdInYear`.
    const yearScenario: Scenario = {
      ordinaryIncome,
      ssBenefit,
      muniInterest,
      ltcg: 0,
      filingStatus: base.filingStatus,
      seniors: seniorsAtAge(age, base.filingStatus, base.seniors),
      year: startYear,
      projected: projectYearParams(startYear, base.filingStatus, n, inflationPercent),
    };

    const taxableSS = taxableSocialSecurity(yearScenario);
    const tax = totalTax(yearScenario);
    const grossIncome = ordinaryIncome + muniInterest + ssBenefit;
    // The same AGI `totalTax` phased the senior deduction out against, taken
    // from the same helper so the reported deduction cannot drift from the
    // taxed one. Tax-exempt interest is deliberately absent: it is added back
    // for IRMAA's MAGI, not for 151(d)(5)(B)'s.
    const magi = agiFor(yearScenario);
    const deduction = deductionFor(yearScenario, magi);
    const seniorDeduction = seniorDeductionFor(yearScenario, magi);

    rows.push({
      year,
      age,
      ssBenefit: Math.round(ssBenefit),
      otherIncome: Math.round(otherIncome),
      rmd: Math.round(rmd),
      qcd: Math.round(qcd),
      taxableRmd: Math.round(taxableRmd),
      openingBalance: Math.round(priorYearEndBalance),
      ordinaryIncome: Math.round(ordinaryIncome),
      muniInterest: Math.round(muniInterest),
      balance: Math.round(balance),
      provisionalIncome: Math.round(ordinaryIncome + muniInterest + 0.5 * ssBenefit),
      taxableSS: Math.round(taxableSS),
      taxableSharePercent: ssBenefit > 0 ? round2((taxableSS / ssBenefit) * 100) : 0,
      deduction: Math.round(deduction),
      seniorDeduction: Math.round(seniorDeduction),
      grossIncome: Math.round(grossIncome),
      totalTax: Math.round(tax),
      effectiveRatePercent: grossIncome > 0 ? round2((tax / grossIncome) * 100) : 0,
      realTotalTax: Math.round(tax / inflation ** n),
      figuresPublished: hasPublishedParams(year),
    });
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const yearOf = (
    predicate: (row: ProjectionYearRow, index: number) => boolean,
  ): number | null => rows.find(predicate)?.year ?? null;

  return {
    rows,
    first,
    last,
    startYear,
    endYear: last.year,
    // Extended one year at a time rather than read off the last published row,
    // so a gap in `TAX_YEARS` stops the run instead of being jumped over.
    publishedThroughYear: rows.reduce(
      (through, row) =>
        row.year === through + 1 && row.figuresPublished ? row.year : through,
      startYear as number,
    ),
    birthYear,
    applicableAge,
    firstRmdYear: yearOf((row) => row.rmd > 0),
    firstQcdYear: yearOf((row) => row.qcd > 0),
    totalQcd: Math.round(rows.reduce((sum, row) => sum + row.qcd, 0)),
    totalRealQcd: Math.round(
      rows.reduce((sum, row, i) => sum + row.qcd / inflation ** i, 0),
    ),
    firstTaxedYear: yearOf((row) => row.taxableSS > 0),
    // Rounded to the cent before comparing, so a share that lands on 85% only
    // after floating-point noise still counts as the cap binding.
    fullyTaxedYear: yearOf((row) => row.taxableSharePercent >= 85),
    seniorDeductionEndsYear: yearOf(
      (row, i) =>
        i > 0 &&
        row.year === SENIOR_DEDUCTION_LAST_YEAR + 1 &&
        rows[i - 1].seniorDeduction > 0,
    ),
    lifetimeRealTax: Math.round(rows.reduce((sum, row) => sum + row.realTotalTax, 0)),
    realTaxMultiple:
      first.totalTax > 0 ? round2(last.realTotalTax / first.totalTax) : null,
    realTaxIncrease: last.realTotalTax - first.totalTax,
  };
}

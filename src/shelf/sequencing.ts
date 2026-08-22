import {
  Scenario,
  TaxYear,
  resolveScenario,
  taxableSocialSecurity,
  totalTax,
} from '../utils/tax';
import {
  ConversionCeiling,
  ConversionCeilingId,
  conversionCeilings,
  maxConversionUnder,
} from './conversion';
import {
  projectYearParams,
  rmdApplicableAge,
  rmdDivisor,
  seniorsAtAge,
} from './projection';

/* ------------------------------------------------------------------ */
/*  The three orders                                                  */
/* ------------------------------------------------------------------ */

export type SequencingStrategyId = 'taxable-first' | 'proportional' | 'bracket-fill';

export interface SequencingStrategy {
  id: SequencingStrategyId;
  label: string;
  /** The order itself, in six words, for a legend or a table header. */
  order: string;
  /** What the order is trying to achieve, and what it costs. */
  summary: string;
  /** A Recharts `dataKey`, which cannot carry the hyphens the ids use. */
  chartKey: 'taxableFirst' | 'proportional' | 'bracketFill';
}

export const SEQUENCING_STRATEGIES: SequencingStrategy[] = [
  {
    id: 'taxable-first',
    label: 'Conventional',
    order: 'Taxable, then traditional, then Roth',
    summary:
      'The order every rule of thumb gives: spend the brokerage account first, the IRA next, the Roth last. It defers ordinary income as long as possible, which is exactly how the IRA compounds into a required distribution large enough to drag the whole benefit into the tax base at once.',
    chartKey: 'taxableFirst',
  },
  {
    id: 'proportional',
    label: 'Proportional',
    order: 'A slice of all three every year',
    summary:
      'Draw from the three accounts in proportion to their balances each year, after any required distribution. Nothing is optimised and nothing is deferred; taxable income comes out roughly level, which on a curve this bumpy is worth more than it sounds.',
    chartKey: 'proportional',
  },
  {
    id: 'bracket-fill',
    label: 'Bracket filling',
    order: 'Traditional up to a ceiling, then taxable, then Roth',
    summary:
      'Take from the IRA up to a ceiling you pick — at least the required distribution — and fall back to the brokerage account and the Roth for whatever is still needed. Dollars pulled out above the spending need land in the taxable account, so the balance that would have grown into a bigger required distribution shrinks instead.',
    chartKey: 'bracketFill',
  },
];

export function sequencingStrategy(id: SequencingStrategyId): SequencingStrategy {
  return SEQUENCING_STRATEGIES.find((s) => s.id === id) ?? SEQUENCING_STRATEGIES[0];
}

/**
 * The ceilings bracket filling can be aimed at.
 *
 * The Roth-conversion section offers one more — the first IRMAA tier — and this
 * deliberately does not. Medicare's thresholds *are* indexed, and this
 * projection cannot index them: it carries a single published year's IRMAA
 * table forward unchanged, so an IRMAA ceiling would tighten by a few percent
 * every projected year for no reason in the statute. Every ceiling on this list
 * either indexes with the brackets or is frozen on purpose.
 */
export const SEQUENCING_FILL_CEILING_IDS: ConversionCeilingId[] = [
  'bracket12',
  'bracket22',
  'ss50',
  'ss85',
  'ltcg0',
];

/* ------------------------------------------------------------------ */
/*  Inputs                                                            */
/* ------------------------------------------------------------------ */

export interface SequencingAssumptions {
  /** First year of the comparison. Defaults to the scenario's tax year. */
  startYear?: TaxYear;
  /** How many years to run, counting the first. */
  years?: number;
  /** Annual Social Security COLA, in percent. */
  colaPercent?: number;
  /**
   * Annual indexing of brackets, deductions, other income and the spending
   * need, in percent. Defaults to the COLA, which holds every real figure flat
   * and leaves the frozen thresholds as the only thing moving.
   */
  inflationPercent?: number;
  /** Calendar year of birth, which fixes the RMD applicable age. */
  birthYear?: number;
  /**
   * After-tax cash the household spends in the first year, growing with
   * inflation after that. Federal tax is paid on top of this, not out of it —
   * which is what makes the withdrawal need circular, and what the fixed point
   * in `runYear` exists to solve.
   */
  spending?: number;
  /** Brokerage account, at market value, on 31 December before the first year. */
  taxableBalance?: number;
  /**
   * Share of that market value which is cost basis, 0 to 1. A withdrawal
   * recovers basis proportionally, so a lower fraction means more of every
   * dollar sold is a realised gain — and realised gains raise provisional
   * income, so the "tax-efficient" account is not free either.
   */
  taxableBasisFraction?: number;
  /** Traditional IRA and 401(k), same date. */
  traditionalBalance?: number;
  /** Roth IRA, same date. Qualified distributions are tax-free and have no RMD. */
  rothBalance?: number;
  /** Nominal annual growth on every balance, in percent. */
  growthPercent?: number;
  /** Which ceiling the bracket-filling strategy aims at. */
  fillCeilingId?: ConversionCeilingId;
}

export interface SequencingYearRow {
  year: number;
  /** Age reached during the year — what the RMD table is read at. */
  age: number;
  ssBenefit: number;
  /** Pension, wages, interest: income that arrives whatever is withdrawn. */
  otherIncome: number;
  muniInterest: number;
  /** After-tax cash the household needs this year. */
  spending: number;
  /** The required minimum distribution, or 0 before the applicable age. */
  rmd: number;
  withdrawnTaxable: number;
  withdrawnTraditional: number;
  withdrawnRoth: number;
  /** Long-term gain realised by the taxable-account withdrawal. */
  realizedGain: number;
  /** Cash left after spending and tax, reinvested in the taxable account. */
  surplus: number;
  /** Spending the accounts could not fund. Non-zero means the money ran out. */
  shortfall: number;
  /** otherIncome + the traditional withdrawal. */
  ordinaryIncome: number;
  taxableSS: number;
  totalTax: number;
  /** Federal tax deflated to first-year dollars. */
  realTotalTax: number;
  /** Every year's tax to date, in first-year dollars. */
  cumulativeRealTax: number;
  openingTaxable: number;
  openingTraditional: number;
  openingRoth: number;
  /** Balances at the end of the year, after withdrawals and growth. */
  taxable: number;
  taxableBasis: number;
  traditional: number;
  roth: number;
  totalBalance: number;
}

export interface StrategyProjection {
  strategy: SequencingStrategy;
  rows: SequencingYearRow[];
  first: SequencingYearRow;
  last: SequencingYearRow;
  /** Every year's federal tax, added up in nominal dollars. */
  lifetimeTax: number;
  /** The same, each year deflated to first-year dollars. This is the score. */
  lifetimeRealTax: number;
  endingTaxable: number;
  endingTaxableBasis: number;
  endingTraditional: number;
  endingRoth: number;
  endingTotal: number;
  /**
   * Federal tax still owed on the traditional balance nobody touched, priced by
   * running the whole of it through the last year's return as ordinary income.
   *
   * It has to be priced somehow, or the scoring rewards pure deferral: any
   * strategy can post the lowest lifetime tax by simply not withdrawing. A
   * *marginal* rate is the obvious haircut and the wrong one — a filer who
   * finishes the horizon with no ordinary income has a marginal rate of zero,
   * which would value a seven-figure IRA at a hundred cents on the dollar.
   * Liquidating it instead is exact within the model and errs the other way:
   * an heir spreading the balance over the ten years IRC 401(a)(9)(H) allows
   * would pay less than this.
   */
  deferredTraditionalTax: number;
  /**
   * The same for unrealised gain in the brokerage account, stacked on top of
   * that liquidation rather than priced beside it — which is how the Qualified
   * Dividends and Capital Gain Tax Worksheet stacks gains anyway, and it keeps
   * the two figures additive instead of double-counting the bands they share.
   */
  deferredGainTax: number;
  /** Every balance, net of both deferred bills. */
  endingAfterTax: number;
  /** endingAfterTax in first-year dollars. */
  endingAfterTaxReal: number;
  /** Average rate the two deferred bills work out at, in percent. */
  deferredTraditionalRate: number;
  deferredGainRate: number;
  /** First year a distribution is required, when the horizon reaches it. */
  firstRmdYear: number | null;
  /**
   * Everything withdrawn by choice over the horizon: the whole of the taxable
   * and Roth withdrawals, plus whatever came out of the traditional account
   * above the required distribution.
   *
   * Zero means the orders never had a decision to make — the benefit and the
   * other income covered the spending and the tax by themselves, so all three
   * withdrew the same required distribution and nothing else. The scores then
   * tie for a reason that has nothing to do with sequencing, and the prose has
   * to say which reason it is.
   */
  voluntaryWithdrawal: number;
  /** Years in which the accounts could not fund the spending. */
  shortfallYears: number;
  totalShortfall: number;
  /**
   * The first of those years, or null when the accounts funded every one.
   *
   * Worth naming rather than counting: once an order runs dry it stays dry —
   * the balances are zero and the only money arriving is the benefit and the
   * other income — so this is the year the order stopped being a plan.
   */
  firstShortfallYear: number | null;
}

export interface SequencingComparison {
  strategies: StrategyProjection[];
  startYear: number;
  endYear: number;
  birthYear: number;
  applicableAge: number;
  /** The ceiling bracket filling aimed at, as of the first year. */
  fillCeiling: ConversionCeiling;
  /** Lowest lifetime federal tax, in first-year dollars. */
  lowestTax: StrategyProjection;
  /** Most left over once both deferred tax bills are subtracted. */
  mostAfterTax: StrategyProjection;
  /**
   * The two scores name different winners — which is the interesting case, and
   * always means the cheapest-looking order got there by deferring rather than
   * by avoiding.
   */
  scoresDisagree: boolean;
  /** Highest lifetime real tax less the lowest. */
  taxSpread: number;
  /** Most ending after-tax value less the least. */
  afterTaxSpread: number;
  /** True when any strategy ran out of money before the horizon did. */
  anyShortfall: boolean;
  /**
   * True when *every* strategy ran out. The three then finish at the same zero
   * having spent the same pool, so the comparison is measuring which one got
   * there fastest rather than which one is cheaper.
   */
  allShortfall: boolean;
  /**
   * The orders that ran dry, listed in the order the strategies are.
   *
   * Some but not all is the case that needs saying out loud, and it is
   * reachable: the orders spend the same pool but not the same amount of it,
   * because they do not pay the same tax along the way. Bracket filling in
   * particular buys IRA dollars early at today's rate, and that tax is cash
   * leaving the household — so at the margin it can empty the accounts a year
   * before the conventional order does.
   */
  shortfallStrategies: StrategyProjection[];
  /**
   * Cheapest order that funded every year, or null when none did.
   *
   * `lowestTax` is the cheapest order full stop, and an order that ran out of
   * money is cheap for the worst possible reason: a household with nothing
   * left has nothing left to tax, so the years after the money runs out cost
   * it nothing. Scoring on lifetime tax alone would hand it the win. This is
   * the figure to compare against instead.
   */
  lowestTaxSolvent: StrategyProjection | null;
}

/* ------------------------------------------------------------------ */
/*  The simulation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Federal tax is paid out of the same cash the withdrawal produces, so the
 * withdrawal needed to fund a year depends on the tax, which depends on the
 * withdrawal. Iterating from a guess converges geometrically at the marginal
 * rate — under 40 cents on the dollar everywhere on this curve, so a dollar of
 * error becomes a cent in about five passes. The cap is a backstop for the one
 * case that can oscillate rather than converge: a bracket-filling ceiling whose
 * headroom flips between two values as realised gains move across it.
 */
const TAX_TOLERANCE = 0.01;
const MAX_TAX_ITERATIONS = 40;

/** Amounts below this are rounding noise, not money. */
const EPSILON = 1e-6;

const round2 = (value: number): number => Math.round(value * 100) / 100;

interface YearPlan {
  fromTaxable: number;
  fromTraditional: number;
  fromRoth: number;
  realizedGain: number;
  shortfall: number;
}

interface YearContext {
  openingTaxable: number;
  openingTraditional: number;
  openingRoth: number;
  /** Share of a taxable-account dollar that is gain rather than recovered basis. */
  gainFraction: number;
  rmd: number;
  /** Largest voluntary traditional withdrawal that stays under the ceiling. */
  fillRoom: (estimatedGain: number) => number;
}

/**
 * Spreads `need` across the accounts a strategy is willing to use, in that
 * strategy's order, and reports what it could not fund.
 *
 * `need` is gross: the cash the household must raise, tax included. A dollar
 * out of any of the three accounts is a dollar of cash, so the arithmetic is
 * the same everywhere — the accounts differ only in what that dollar does to
 * the return, which is the caller's problem.
 */
function planWithdrawals(
  strategyId: SequencingStrategyId,
  need: number,
  ctx: YearContext,
  estimatedGain: number,
): YearPlan {
  const { openingTaxable, openingTraditional, openingRoth, gainFraction, rmd } = ctx;

  let fromTaxable = 0;
  // The required distribution comes out whether it is wanted or not, in every
  // strategy. It is cash toward the need, not an addition to it.
  let fromTraditional = Math.min(openingTraditional, rmd);
  let fromRoth = 0;
  let remaining = Math.max(0, need - fromTraditional);

  if (strategyId === 'proportional') {
    const availTaxable = openingTaxable;
    const availTraditional = openingTraditional - fromTraditional;
    const availRoth = openingRoth;
    const pool = availTaxable + availTraditional + availRoth;
    if (remaining >= pool) {
      // Nothing left to apportion: take everything and report the gap. The
      // proportional split can never be capped short of this, since each share
      // is `remaining / pool` of a balance and that ratio is at most 1.
      fromTaxable = availTaxable;
      fromTraditional += availTraditional;
      fromRoth = availRoth;
      remaining -= pool;
    } else if (pool > 0) {
      const share = remaining / pool;
      fromTaxable = availTaxable * share;
      fromTraditional += availTraditional * share;
      fromRoth = availRoth * share;
      remaining = 0;
    }
  } else {
    if (strategyId === 'bracket-fill') {
      // Fill first, and past the spending need if the ceiling allows it: the
      // point of the order is to buy IRA dollars at today's rate rather than
      // the rate a larger required distribution will attract later.
      const room = Math.max(0, ctx.fillRoom(estimatedGain));
      const filled = Math.min(openingTraditional - fromTraditional, room);
      fromTraditional += filled;
      remaining = Math.max(0, need - fromTraditional);
    }

    fromTaxable = Math.min(openingTaxable, remaining);
    remaining -= fromTaxable;

    const extraTraditional = Math.min(openingTraditional - fromTraditional, remaining);
    fromTraditional += extraTraditional;
    remaining -= extraTraditional;

    fromRoth = Math.min(openingRoth, remaining);
    remaining -= fromRoth;
  }

  return {
    fromTaxable,
    fromTraditional,
    fromRoth,
    realizedGain: fromTaxable * gainFraction,
    shortfall: Math.max(0, remaining),
  };
}

/**
 * One retirement, funded one way, year by year.
 *
 * What moves and what does not: the benefit grows at the COLA; other income,
 * tax-exempt interest and the spending need grow at inflation; brackets, the
 * standard deduction and the capital-gain bands index
 * at inflation too — and IRC 86(c)'s provisional-income thresholds do not move
 * at all, which is why the order that defers the most ordinary income is not
 * automatically the one that pays the least.
 *
 * Deliberately outside the model: dividends and interest thrown off by the
 * brokerage account (it is treated as pure appreciation, so it produces income
 * only when sold); state tax; IRMAA, which is a premium rather than a tax and
 * whose two-year lag would need its own timeline; and the possibility of
 * converting rather than merely withdrawing — surplus dollars pulled out under
 * bracket filling land in the taxable account, where their growth is taxed. A
 * Roth conversion of the same dollars costs the same tax today and shelters
 * that growth, so every figure here is the floor of what the strategy is worth.
 */
export function simulateSequencing(
  strategyId: SequencingStrategyId,
  scenario: Scenario = {},
  assumptions: SequencingAssumptions = {},
): StrategyProjection {
  const base = resolveScenario(scenario);
  const startYear = assumptions.startYear ?? base.year;
  const years = Math.max(1, Math.round(assumptions.years ?? 20));
  const colaPercent = assumptions.colaPercent ?? 2.5;
  const inflationPercent = assumptions.inflationPercent ?? colaPercent;
  const birthYear = assumptions.birthYear ?? startYear - 70;
  const applicableAge = rmdApplicableAge(birthYear);
  const growth = 1 + (assumptions.growthPercent ?? 5) / 100;
  const cola = 1 + colaPercent / 100;
  const inflation = 1 + inflationPercent / 100;
  const spending = Math.max(0, assumptions.spending ?? 0);
  const fillCeilingId = assumptions.fillCeilingId ?? 'bracket12';

  let taxable = Math.max(0, assumptions.taxableBalance ?? 0);
  const basisFraction = Math.min(1, Math.max(0, assumptions.taxableBasisFraction ?? 0.6));
  let taxableBasis = taxable * basisFraction;
  let traditional = Math.max(0, assumptions.traditionalBalance ?? 0);
  let roth = Math.max(0, assumptions.rothBalance ?? 0);

  const rows: SequencingYearRow[] = [];
  let cumulativeRealTax = 0;
  // Warm start: last year's tax is a far better first guess than zero, so most
  // years converge in two or three passes instead of a dozen.
  let taxGuess = 0;
  let lastScenario: Scenario = {};

  for (let n = 0; n < years; n += 1) {
    const year = startYear + n;
    const age = year - birthYear;
    const projected = projectYearParams(startYear, base.filingStatus, n, inflationPercent);
    const seniors = seniorsAtAge(age, base.filingStatus, base.seniors);

    const ssBenefit = base.ssBenefit * cola ** n;
    const otherIncome = base.ordinaryIncome * inflation ** n;
    const muniInterest = base.muniInterest * inflation ** n;
    const spend = spending * inflation ** n;

    const openingTaxable = taxable;
    const openingBasis = taxableBasis;
    const openingTraditional = traditional;
    const openingRoth = roth;
    // Proportional basis recovery: a sale returns basis in the same ratio the
    // account holds it, so the gain fraction is a property of the account
    // rather than of the lot sold.
    const gainFraction =
      openingTaxable > EPSILON ? Math.max(0, 1 - openingBasis / openingTaxable) : 0;

    const divisor = age >= applicableAge ? rmdDivisor(age) : null;
    const required = divisor === null ? 0 : openingTraditional / divisor;

    const rmd = Math.min(openingTraditional, required);

    const scenarioFor = (plan: YearPlan): Scenario => ({
      ordinaryIncome: otherIncome + plan.fromTraditional,
      ssBenefit,
      ltcg: plan.realizedGain,
      muniInterest,
      filingStatus: base.filingStatus,
      seniors,
      year: startYear,
      projected,
    });

    const ceiling =
      conversionCeilings({ filingStatus: base.filingStatus, year: startYear, projected }).find(
        (c) => c.id === fillCeilingId,
      ) ?? conversionCeilings({ filingStatus: base.filingStatus, year: startYear, projected })[0];

    const ctx: YearContext = {
      openingTaxable,
      openingTraditional,
      openingRoth,
      gainFraction,
      rmd,
      // A voluntary traditional withdrawal is ordinary income in exactly the
      // way a Roth conversion is, so the conversion sizer answers this without
      // modification: how many more ordinary dollars fit under the ceiling.
      fillRoom: (estimatedGain: number) =>
        maxConversionUnder(
          ceiling,
          {
            ordinaryIncome: otherIncome + rmd,
            ssBenefit,
            ltcg: estimatedGain,
            muniInterest,
            filingStatus: base.filingStatus,
            seniors,
            year: startYear,
            projected,
          },
          Math.floor(Math.max(0, openingTraditional - rmd)),
        ),
    };

    let tax = taxGuess;
    let plan = planWithdrawals(strategyId, Math.max(0, spend + tax - ssBenefit - otherIncome - muniInterest), ctx, 0);
    for (let i = 0; i < MAX_TAX_ITERATIONS; i += 1) {
      const nextTax = totalTax(scenarioFor(plan));
      const converged = Math.abs(nextTax - tax) < TAX_TOLERANCE;
      tax = nextTax;
      plan = planWithdrawals(
        strategyId,
        Math.max(0, spend + tax - ssBenefit - otherIncome - muniInterest),
        ctx,
        plan.realizedGain,
      );
      if (converged) break;
    }
    // Report the tax on the income actually reported, so the row is internally
    // consistent even in the oscillating case the iteration cap exists for.
    const yearScenario = scenarioFor(plan);
    tax = totalTax(yearScenario);
    taxGuess = tax;
    lastScenario = yearScenario;

    const cash =
      ssBenefit + otherIncome + muniInterest + plan.fromTaxable + plan.fromTraditional + plan.fromRoth;
    const surplus = Math.max(0, cash - spend - tax);
    const shortfall = Math.max(0, spend + tax - cash);

    const remainingTaxable = openingTaxable - plan.fromTaxable;
    const basisAfterSale =
      openingTaxable > EPSILON ? openingBasis * (remainingTaxable / openingTaxable) : 0;
    // Surplus is money that has already been taxed, so it is all basis. It is
    // added after growth: it did not exist until the year closed.
    taxable = remainingTaxable * growth + surplus;
    taxableBasis = basisAfterSale + surplus;
    traditional = Math.max(0, openingTraditional - plan.fromTraditional) * growth;
    roth = Math.max(0, openingRoth - plan.fromRoth) * growth;

    const realTax = tax / inflation ** n;
    cumulativeRealTax += realTax;

    rows.push({
      year,
      age,
      ssBenefit: Math.round(ssBenefit),
      otherIncome: Math.round(otherIncome),
      muniInterest: Math.round(muniInterest),
      spending: Math.round(spend),
      rmd: Math.round(rmd),
      withdrawnTaxable: Math.round(plan.fromTaxable),
      withdrawnTraditional: Math.round(plan.fromTraditional),
      withdrawnRoth: Math.round(plan.fromRoth),
      realizedGain: Math.round(plan.realizedGain),
      surplus: Math.round(surplus),
      shortfall: Math.round(shortfall),
      ordinaryIncome: Math.round(otherIncome + plan.fromTraditional),
      taxableSS: Math.round(taxableSocialSecurity(yearScenario)),
      totalTax: Math.round(tax),
      realTotalTax: Math.round(realTax),
      cumulativeRealTax: Math.round(cumulativeRealTax),
      openingTaxable: Math.round(openingTaxable),
      openingTraditional: Math.round(openingTraditional),
      openingRoth: Math.round(openingRoth),
      taxable: Math.round(taxable),
      taxableBasis: Math.round(taxableBasis),
      traditional: Math.round(traditional),
      roth: Math.round(roth),
      totalBalance: Math.round(taxable + traditional + roth),
    });
  }

  const lifetimeTax = rows.reduce((sum, row) => sum + row.totalTax, 0);
  const lifetimeRealTax = rows[rows.length - 1].cumulativeRealTax;

  // Both deferred bills are priced by adding the balance to the final year's
  // return, ordinary income first and gains stacked on top of it, so the two
  // add up to the tax on liquidating everything at once and neither is charged
  // for a bracket the other already used.
  const embeddedGain = Math.max(0, taxable - taxableBasis);
  const taxAtLast = totalTax(lastScenario);
  const liquidatedTraditional: Scenario = {
    ...lastScenario,
    ordinaryIncome: (lastScenario.ordinaryIncome ?? 0) + traditional,
  };
  const deferredTraditionalTax = totalTax(liquidatedTraditional) - taxAtLast;
  const deferredGainTax =
    totalTax({ ...liquidatedTraditional, ltcg: (liquidatedTraditional.ltcg ?? 0) + embeddedGain }) -
    totalTax(liquidatedTraditional);
  const endingAfterTax = taxable + traditional + roth - deferredTraditionalTax - deferredGainTax;
  const deflator = inflation ** (years - 1);

  return {
    strategy: sequencingStrategy(strategyId),
    rows,
    first: rows[0],
    last: rows[rows.length - 1],
    lifetimeTax: Math.round(lifetimeTax),
    lifetimeRealTax: Math.round(lifetimeRealTax),
    endingTaxable: Math.round(taxable),
    endingTaxableBasis: Math.round(taxableBasis),
    endingTraditional: Math.round(traditional),
    endingRoth: Math.round(roth),
    endingTotal: Math.round(taxable + traditional + roth),
    deferredTraditionalTax: Math.round(deferredTraditionalTax),
    deferredGainTax: Math.round(deferredGainTax),
    endingAfterTax: Math.round(endingAfterTax),
    endingAfterTaxReal: Math.round(endingAfterTax / deflator),
    deferredTraditionalRate:
      traditional > EPSILON ? round2((deferredTraditionalTax / traditional) * 100) : 0,
    deferredGainRate:
      embeddedGain > EPSILON ? round2((deferredGainTax / embeddedGain) * 100) : 0,
    firstRmdYear: rows.find((row) => row.rmd > 0)?.year ?? null,
    voluntaryWithdrawal: Math.round(
      rows.reduce(
        (sum, row) =>
          sum +
          Math.max(0, row.withdrawnTraditional - row.rmd) +
          row.withdrawnTaxable +
          row.withdrawnRoth,
        0,
      ),
    ),
    shortfallYears: rows.filter((row) => row.shortfall > 0).length,
    totalShortfall: Math.round(rows.reduce((sum, row) => sum + row.shortfall, 0)),
    firstShortfallYear: rows.find((row) => row.shortfall > 0)?.year ?? null,
  };
}

/**
 * All three orders over the same retirement, scored two ways.
 *
 * Lifetime federal tax is the headline, because it is the number the question
 * is usually asked in. It is also the number a strategy can game by simply not
 * withdrawing, so the ending after-tax value sits beside it with the deferred
 * bill already subtracted. When the two disagree, that gap is the answer.
 */
export function compareSequencing(
  scenario: Scenario = {},
  assumptions: SequencingAssumptions = {},
): SequencingComparison {
  const strategies = SEQUENCING_STRATEGIES.map((s) =>
    simulateSequencing(s.id, scenario, assumptions),
  );

  const base = resolveScenario(scenario);
  const startYear = assumptions.startYear ?? base.year;
  const birthYear = assumptions.birthYear ?? startYear - 70;
  const fillCeilingId = assumptions.fillCeilingId ?? 'bracket12';
  const ceilings = conversionCeilings({ filingStatus: base.filingStatus, year: startYear });

  const byLowestTax = [...strategies].sort((a, b) => a.lifetimeRealTax - b.lifetimeRealTax);
  const byAfterTax = [...strategies].sort((a, b) => b.endingAfterTaxReal - a.endingAfterTaxReal);

  return {
    strategies,
    startYear,
    endYear: strategies[0].last.year,
    birthYear,
    applicableAge: rmdApplicableAge(birthYear),
    fillCeiling: ceilings.find((c) => c.id === fillCeilingId) ?? ceilings[0],
    lowestTax: byLowestTax[0],
    mostAfterTax: byAfterTax[0],
    // Compared on value, not on identity: three strategies that all run the
    // accounts dry finish at the same zero, and picking the first of a tie is
    // not a disagreement about anything.
    scoresDisagree: byAfterTax[0].endingAfterTaxReal > byLowestTax[0].endingAfterTaxReal,
    taxSpread:
      byLowestTax[byLowestTax.length - 1].lifetimeRealTax - byLowestTax[0].lifetimeRealTax,
    afterTaxSpread:
      byAfterTax[0].endingAfterTaxReal - byAfterTax[byAfterTax.length - 1].endingAfterTaxReal,
    anyShortfall: strategies.some((s) => s.shortfallYears > 0),
    allShortfall: strategies.every((s) => s.shortfallYears > 0),
    shortfallStrategies: strategies.filter((s) => s.shortfallYears > 0),
    lowestTaxSolvent: byLowestTax.find((s) => s.shortfallYears === 0) ?? null,
  };
}

export interface SequencingChartRow {
  year: number;
  taxableFirst: number;
  proportional: number;
  bracketFill: number;
}

/**
 * Cumulative federal tax by year, in first-year dollars, one series per order.
 *
 * Cumulative rather than annual because the question is lifetime tax: the
 * annual lines cross each other constantly — bracket filling pays more early
 * and less late by construction — and the crossing point of the *running
 * totals* is the year the strategy stops costing money and starts saving it.
 */
export function sequencingChartRows(comparison: SequencingComparison): SequencingChartRow[] {
  const [first] = comparison.strategies;
  return first.rows.map((row, i) => {
    const at = (chartKey: SequencingStrategy['chartKey']): number =>
      comparison.strategies.find((s) => s.strategy.chartKey === chartKey)?.rows[i]
        .cumulativeRealTax ?? 0;
    return {
      year: row.year,
      taxableFirst: at('taxableFirst'),
      proportional: at('proportional'),
      bracketFill: at('bracketFill'),
    };
  });
}

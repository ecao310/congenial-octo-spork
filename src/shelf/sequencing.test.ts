import { describe, expect, it } from 'vitest';
import {
  SEQUENCING_FILL_CEILING_IDS,
  SEQUENCING_STRATEGIES,
  SequencingStrategyId,
  compareSequencing,
  sequencingChartRows,
  sequencingStrategy,
  simulateSequencing,
} from './sequencing';
import {
  conversionCeilings,
  conversionMeasureValue,
  filingParams,
  taxableSocialSecurity,
} from '../utils/tax';
import { UNIFORM_LIFETIME_DIVISORS } from './projection';

const ALL_IDS: SequencingStrategyId[] = SEQUENCING_STRATEGIES.map((s) => s.id);

/** A retiree with all three account types and a real spending need. */
const SCENARIO = {
  ordinaryIncome: 12_000,
  ssBenefit: 30_000,
  filingStatus: 'single' as const,
  seniors: 1,
  year: 2025 as const,
};

const ASSUMPTIONS = {
  startYear: 2025 as const,
  years: 20,
  colaPercent: 2.5,
  birthYear: 1955,
  spending: 60_000,
  taxableBalance: 300_000,
  taxableBasisFraction: 0.6,
  traditionalBalance: 800_000,
  rothBalance: 150_000,
  growthPercent: 5,
};

describe('withdrawal sequencing', () => {
  describe('the cash has to add up', () => {
    it.each(ALL_IDS)('%s funds spending and tax out of income and withdrawals', (id) => {
      const run = simulateSequencing(id, SCENARIO, ASSUMPTIONS);
      for (const row of run.rows) {
        const cash =
          row.ssBenefit +
          row.otherIncome +
          row.muniInterest +
          row.withdrawnTaxable +
          row.withdrawnTraditional +
          row.withdrawnRoth;
        // Six figures, each rounded to a whole dollar, so the identity can be
        // off by three of them. The fixed point itself converges to a cent.
        expect(
          Math.abs(cash + row.shortfall - (row.spending + row.totalTax + row.surplus)),
        ).toBeLessThanOrEqual(3);
        // One of the two is always zero: you cannot be short and over at once.
        expect(Math.min(row.surplus, row.shortfall)).toBe(0);
      }
    });

    it.each(ALL_IDS)('%s never withdraws more than an account holds', (id) => {
      const run = simulateSequencing(id, SCENARIO, ASSUMPTIONS);
      for (const row of run.rows) {
        expect(row.withdrawnTaxable).toBeLessThanOrEqual(row.openingTaxable + 1);
        expect(row.withdrawnTraditional).toBeLessThanOrEqual(row.openingTraditional + 1);
        expect(row.withdrawnRoth).toBeLessThanOrEqual(row.openingRoth + 1);
        expect(row.taxable).toBeGreaterThanOrEqual(0);
        expect(row.traditional).toBeGreaterThanOrEqual(0);
        expect(row.roth).toBeGreaterThanOrEqual(0);
      }
    });

    it.each(ALL_IDS)('%s rolls each balance forward at the growth rate', (id) => {
      const run = simulateSequencing(id, SCENARIO, { ...ASSUMPTIONS, years: 6 });
      for (const row of run.rows) {
        expect(row.traditional).toBeCloseTo(
          (row.openingTraditional - row.withdrawnTraditional) * 1.05,
          -0.5,
        );
        expect(row.roth).toBeCloseTo((row.openingRoth - row.withdrawnRoth) * 1.05, -0.5);
        // Surplus is added after growth, because it did not exist until the
        // year closed.
        expect(row.taxable).toBeCloseTo(
          (row.openingTaxable - row.withdrawnTaxable) * 1.05 + row.surplus,
          -0.5,
        );
      }
      // The next year opens on the previous year's close.
      for (let i = 1; i < run.rows.length; i += 1) {
        expect(run.rows[i].openingTraditional).toBe(run.rows[i - 1].traditional);
        expect(run.rows[i].openingTaxable).toBe(run.rows[i - 1].taxable);
        expect(run.rows[i].openingRoth).toBe(run.rows[i - 1].roth);
      }
    });
  });

  describe('required distributions', () => {
    it.each(ALL_IDS)('%s takes the RMD even with nothing to spend', (id) => {
      const run = simulateSequencing(
        id,
        { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 0 },
        { ...ASSUMPTIONS, spending: 0, birthYear: 1950, years: 3, growthPercent: 0 },
      );
      // Age 75 in 2025, so the distribution is already required.
      expect(run.rows[0].rmd).toBe(Math.round(800_000 / UNIFORM_LIFETIME_DIVISORS[75]));
      expect(run.rows[0].withdrawnTraditional).toBeGreaterThanOrEqual(run.rows[0].rmd);
      // Nothing is spent, so the whole distribution net of tax is reinvested.
      expect(run.rows[0].surplus).toBeCloseTo(
        run.rows[0].withdrawnTraditional - run.rows[0].totalTax,
        -0.5,
      );
      expect(run.firstRmdYear).toBe(2025);
    });

    it('leaves the traditional account alone before the applicable age', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 5,
      });
      expect(run.firstRmdYear).toBeNull();
      expect(run.rows.every((r) => r.withdrawnTraditional === 0)).toBe(true);
    });
  });

  describe('the orders differ in the way their names say', () => {
    it('conventional spends the brokerage account before touching the IRA', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 4,
      });
      for (const row of run.rows) {
        expect(row.withdrawnTaxable).toBeGreaterThan(0);
        expect(row.withdrawnTraditional).toBe(0);
        expect(row.withdrawnRoth).toBe(0);
      }
    });

    it('proportional splits the need in the ratio of the balances', () => {
      const run = simulateSequencing('proportional', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 1,
      });
      const row = run.rows[0];
      const drawn = row.withdrawnTaxable + row.withdrawnTraditional + row.withdrawnRoth;
      const pool = 300_000 + 800_000 + 150_000;
      expect(row.withdrawnTaxable / drawn).toBeCloseTo(300_000 / pool, 4);
      expect(row.withdrawnTraditional / drawn).toBeCloseTo(800_000 / pool, 4);
      expect(row.withdrawnRoth / drawn).toBeCloseTo(150_000 / pool, 4);
    });

    it('bracket filling stops at the ceiling and banks the difference', () => {
      // Age 70 in 2025: over 65, so the senior deductions apply, and short of
      // the applicable age, so nothing is forced out.
      const run = simulateSequencing(
        'bracket-fill',
        SCENARIO,
        { ...ASSUMPTIONS, birthYear: 1955, years: 1, spending: 30_000 },
      );
      const row = run.rows[0];
      // More came out of the IRA than the year needed: that is the point.
      expect(row.surplus).toBeGreaterThan(0);
      expect(row.withdrawnTaxable).toBe(0);
      const top = filingParams(2025, 'single').brackets.find((b) => b.rate === 0.12)!.upTo;
      const taxableIncome = conversionMeasureValue('ordinaryTaxableIncome', {
        ordinaryIncome: row.ordinaryIncome,
        ssBenefit: row.ssBenefit,
        ltcg: row.realizedGain,
        filingStatus: 'single',
        seniors: 1,
        year: 2025,
      });
      expect(taxableIncome).toBeLessThanOrEqual(top + 1);
      // And it really is filling it, not stopping short.
      expect(taxableIncome).toBeGreaterThan(top - 2);
    });

    it('honours the ceiling it is given', () => {
      // No other income, so provisional income starts at half the benefit and
      // there is real room under the 50% base to fill.
      const run = simulateSequencing('bracket-fill', { ...SCENARIO, ordinaryIncome: 0 }, {
        ...ASSUMPTIONS,
        birthYear: 1955,
        years: 1,
        spending: 20_000,
        fillCeilingId: 'ss50',
      });
      const row = run.rows[0];
      // Filled only to the 50% base, so none of the benefit is taxable yet.
      expect(row.taxableSS).toBe(0);
      expect(
        taxableSocialSecurity({
          ordinaryIncome: row.ordinaryIncome + 100,
          ssBenefit: row.ssBenefit,
          filingStatus: 'single',
        }),
      ).toBeGreaterThan(0);
    });

    it('falls through to the other accounts when the ceiling is already breached', () => {
      const run = simulateSequencing(
        'bracket-fill',
        { ...SCENARIO, ordinaryIncome: 90_000 },
        { ...ASSUMPTIONS, birthYear: 1955, years: 1, spending: 130_000 },
      );
      const row = run.rows[0];
      // $90k of pension is already past the top of the 12% bracket, so there is
      // no room to fill and the need comes from the brokerage account instead.
      expect(row.withdrawnTraditional).toBe(0);
      expect(row.withdrawnTaxable).toBeGreaterThan(0);
    });

    it('offers no IRMAA ceiling, because the projection cannot index one', () => {
      expect(SEQUENCING_FILL_CEILING_IDS).not.toContain('irmaa1');
      const ids = conversionCeilings({ filingStatus: 'single', year: 2025 }).map((c) => c.id);
      for (const id of SEQUENCING_FILL_CEILING_IDS) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('the brokerage account', () => {
    it('realises no gain when the whole balance is basis and nothing grows', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 3,
        taxableBasisFraction: 1,
        growthPercent: 0,
      });
      expect(run.rows.every((r) => r.realizedGain === 0)).toBe(true);
    });

    it('grows a gain out of an all-basis account, because growth is untaxed', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 3,
        taxableBasisFraction: 1,
        growthPercent: 5,
      });
      expect(run.rows[0].realizedGain).toBe(0);
      expect(run.rows[1].realizedGain).toBeGreaterThan(0);
    });

    it('realises the whole withdrawal when none of it is', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 1,
        taxableBasisFraction: 0,
      });
      expect(run.rows[0].realizedGain).toBe(run.rows[0].withdrawnTaxable);
    });

    it('recovers basis in proportion, so the gain share rises as it is spent', () => {
      const run = simulateSequencing('taxable-first', SCENARIO, {
        ...ASSUMPTIONS,
        birthYear: 1970,
        years: 4,
        taxableBasisFraction: 0.6,
        growthPercent: 5,
      });
      const shares = run.rows.map((r) =>
        r.withdrawnTaxable > 0 ? r.realizedGain / r.withdrawnTaxable : 0,
      );
      expect(shares[0]).toBeCloseTo(0.4, 4);
      for (let i = 1; i < shares.length; i += 1) {
        expect(shares[i]).toBeGreaterThan(shares[i - 1]);
      }
    });
  });

  describe('scoring', () => {
    it('prices the leftover IRA by liquidating it, not at a marginal rate', () => {
      // This filer finishes the horizon with no ordinary income at all, so the
      // marginal rate on the next dollar is 0% — which would value a
      // seven-figure IRA at its full face amount.
      const run = simulateSequencing(
        'taxable-first',
        { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 0 },
        {
          ...ASSUMPTIONS,
          birthYear: 1970,
          years: 10,
          spending: 40_000,
          taxableBalance: 600_000,
        },
      );
      expect(run.last.ordinaryIncome).toBe(0);
      expect(run.endingTraditional).toBeGreaterThan(1_000_000);
      expect(run.deferredTraditionalTax).toBeGreaterThan(0);
      expect(run.deferredTraditionalRate).toBeGreaterThan(20);
      expect(run.endingAfterTax).toBeLessThan(run.endingTotal);
    });

    it('adds the two deferred bills up to one liquidation', () => {
      const run = simulateSequencing('proportional', SCENARIO, ASSUMPTIONS);
      expect(run.endingAfterTax).toBe(
        run.endingTotal - run.deferredTraditionalTax - run.deferredGainTax,
      );
      expect(run.deferredGainTax).toBeGreaterThan(0);
    });

    it('sums lifetime tax in nominal and in first-year dollars', () => {
      const run = simulateSequencing('proportional', SCENARIO, ASSUMPTIONS);
      expect(run.lifetimeTax).toBe(run.rows.reduce((s, r) => s + r.totalTax, 0));
      // Inflation is positive, so the deflated total is the smaller one.
      expect(run.lifetimeRealTax).toBeLessThan(run.lifetimeTax);
      expect(run.rows[0].cumulativeRealTax).toBe(run.rows[0].realTotalTax);
    });

    it.each(ALL_IDS)('%s counts only what it withdrew by choice', (id) => {
      const p = simulateSequencing(id, SCENARIO, ASSUMPTIONS);
      // The required distribution is not a choice, so it is the one withdrawal
      // that does not count. Everything else does, whichever account it came
      // from.
      const byHand = p.rows.reduce(
        (sum, row) =>
          sum +
          Math.max(0, row.withdrawnTraditional - row.rmd) +
          row.withdrawnTaxable +
          row.withdrawnRoth,
        0,
      );
      expect(p.voluntaryWithdrawal).toBe(Math.round(byHand));
      expect(p.voluntaryWithdrawal).toBeGreaterThan(0);
    });

    it.each(ALL_IDS)('%s withdraws nothing by choice when the income covers it', (id) => {
      // $200,000 of other income funds $40,000 of spending and its tax outright,
      // so the only money that moves is the distribution the table forces out.
      const p = simulateSequencing(
        id,
        { ...SCENARIO, ordinaryIncome: 200_000 },
        { ...ASSUMPTIONS, spending: 40_000 },
      );
      expect(p.voluntaryWithdrawal).toBe(0);
      expect(p.rows.every((row) => row.withdrawnTaxable === 0)).toBe(true);
      expect(p.rows.every((row) => row.withdrawnRoth === 0)).toBe(true);
      expect(p.rows.some((row) => row.rmd > 0)).toBe(true);
    });

    it('reports the shortfall rather than borrowing to cover it', () => {
      const run = simulateSequencing(
        'taxable-first',
        { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 24_000 },
        {
          ...ASSUMPTIONS,
          spending: 90_000,
          taxableBalance: 100_000,
          traditionalBalance: 200_000,
          rothBalance: 50_000,
          growthPercent: 3,
        },
      );
      expect(run.shortfallYears).toBeGreaterThan(0);
      expect(run.totalShortfall).toBeGreaterThan(0);
      expect(run.endingTotal).toBe(0);
      expect(run.last.withdrawnTaxable).toBe(0);
    });
  });

  describe('the comparison', () => {
    it('runs every strategy over the same retirement', () => {
      const c = compareSequencing(SCENARIO, ASSUMPTIONS);
      expect(c.strategies.map((s) => s.strategy.id)).toEqual(ALL_IDS);
      expect(c.startYear).toBe(2025);
      expect(c.endYear).toBe(2044);
      expect(c.applicableAge).toBe(73);
      expect(c.fillCeiling.id).toBe('bracket12');
      expect(c.taxSpread).toBeGreaterThanOrEqual(0);
      expect(c.afterTaxSpread).toBeGreaterThanOrEqual(0);
      expect(c.anyShortfall).toBe(false);
    });

    it('calls out the case where deferring wins on tax and loses on wealth', () => {
      // Ten years, no required distribution in any of them: the conventional
      // order pays nothing at all and finishes with the largest untaxed IRA.
      const c = compareSequencing(
        { ...SCENARIO, ordinaryIncome: 0 },
        { ...ASSUMPTIONS, birthYear: 1970, years: 10 },
      );
      expect(c.lowestTax.strategy.id).toBe('taxable-first');
      expect(c.lowestTax.lifetimeRealTax).toBe(0);
      expect(c.mostAfterTax.strategy.id).toBe('bracket-fill');
      expect(c.scoresDisagree).toBe(true);
    });

    it('does not call a tie a disagreement', () => {
      // Every order runs the accounts dry, so every order ends at zero.
      const c = compareSequencing(
        { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 24_000 },
        {
          ...ASSUMPTIONS,
          spending: 90_000,
          taxableBalance: 100_000,
          traditionalBalance: 200_000,
          rothBalance: 50_000,
          growthPercent: 3,
        },
      );
      expect(c.anyShortfall).toBe(true);
      expect(c.allShortfall).toBe(true);
      expect(c.shortfallStrategies).toHaveLength(3);
      // Nothing lasted, so there is no order to compare the others against.
      expect(c.lowestTaxSolvent).toBeNull();
      expect(c.strategies.every((s) => s.endingAfterTaxReal === 0)).toBe(true);
      expect(c.scoresDisagree).toBe(false);
    });

    /**
     * Some orders running dry while others do not is reachable, and it is the
     * case the prose used to get wrong: `anyShortfall` drove a sentence that
     * read as universal.
     *
     * The mechanism is that the three do not spend the same pool at the same
     * rate. They draw on identical balances, but the tax each pays along the
     * way is cash leaving the household too — and bracket filling pays some of
     * it years early, by design. At the margin that is the difference between
     * funding the horizon and not.
     */
    it('reports which orders ran dry when only some of them did', () => {
      const c = compareSequencing(SCENARIO, {
        ...ASSUMPTIONS,
        spending: 55_000,
        taxableBalance: 50_000,
        traditionalBalance: 200_000,
        rothBalance: 0,
      });
      expect(c.anyShortfall).toBe(true);
      expect(c.allShortfall).toBe(false);
      expect(c.shortfallStrategies.map((s) => s.strategy.id)).toEqual(['bracket-fill']);
      expect(c.shortfallStrategies[0].firstShortfallYear).toBe(2044);
      expect(
        c.strategies
          .filter((s) => s.shortfallYears === 0)
          .every((s) => s.endingAfterTaxReal > 0),
      ).toBe(true);
    });

    /**
     * And why it matters: the order that ran out posts the *lowest* lifetime
     * tax, because a household with nothing left has nothing left to tax. Score
     * on tax alone and the failure wins.
     */
    it('does not let an order that ran out of money hold the cheapest score', () => {
      const c = compareSequencing(SCENARIO, {
        ...ASSUMPTIONS,
        spending: 55_000,
        taxableBalance: 50_000,
        traditionalBalance: 200_000,
        rothBalance: 0,
      });
      expect(c.lowestTax.strategy.id).toBe('bracket-fill');
      expect(c.lowestTax.shortfallYears).toBeGreaterThan(0);
      expect(c.lowestTaxSolvent?.strategy.id).toBe('proportional');
      expect(c.lowestTaxSolvent!.lifetimeRealTax).toBeGreaterThan(c.lowestTax.lifetimeRealTax);
      // The order that lasted is behind on tax and ahead on what is left, which
      // is the only reading that survives the shortfall.
      expect(c.lowestTaxSolvent!.endingAfterTaxReal).toBeGreaterThan(
        c.lowestTax.endingAfterTaxReal,
      );
      expect(c.mostAfterTax.strategy.id).toBe('proportional');
    });

    it('dates the shortfall to the first year the money did not stretch', () => {
      const run = simulateSequencing('taxable-first', { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 24_000 }, {
        ...ASSUMPTIONS,
        spending: 90_000,
        taxableBalance: 100_000,
        traditionalBalance: 200_000,
        rothBalance: 50_000,
        growthPercent: 3,
      });
      expect(run.firstShortfallYear).toBe(run.rows.find((row) => row.shortfall > 0)!.year);
      // Once dry, dry for good: every later year is short too.
      const from = run.rows.findIndex((row) => row.shortfall > 0);
      expect(run.rows.slice(from).every((row) => row.shortfall > 0)).toBe(true);
      expect(run.shortfallYears).toBe(run.rows.length - from);
    });

    it('leaves the shortfall year null when the accounts funded every year', () => {
      const c = compareSequencing(SCENARIO, ASSUMPTIONS);
      expect(c.anyShortfall).toBe(false);
      expect(c.allShortfall).toBe(false);
      expect(c.shortfallStrategies).toEqual([]);
      expect(c.strategies.every((s) => s.firstShortfallYear === null)).toBe(true);
      expect(c.lowestTaxSolvent).toBe(c.lowestTax);
    });

    it('finds bracket filling ahead over a long horizon with a large IRA', () => {
      const c = compareSequencing(
        { ...SCENARIO, ordinaryIncome: 0, ssBenefit: 40_000 },
        {
          ...ASSUMPTIONS,
          years: 30,
          spending: 45_000,
          traditionalBalance: 1_500_000,
          birthYear: 1955,
        },
      );
      expect(c.lowestTax.strategy.id).toBe('bracket-fill');
      expect(c.mostAfterTax.strategy.id).toBe('bracket-fill');
      expect(c.scoresDisagree).toBe(false);
    });
  });

  describe('holding everything still', () => {
    const STILL = {
      years: 4,
      colaPercent: 0,
      birthYear: 1970,
      spending: 0,
      taxableBalance: 0,
      traditionalBalance: 0,
      rothBalance: 0,
      growthPercent: 0,
    };
    const STILL_SCENARIO = { ...SCENARIO, ordinaryIncome: 40_000, ssBenefit: 24_000 };

    it('taxes the same amount every year when nothing moves', () => {
      // Started on the newest year on file, so no published Rev. Proc. lands
      // inside the horizon and the 0% assumption is the only thing indexing.
      const run = simulateSequencing('taxable-first', { ...STILL_SCENARIO, year: 2026 }, {
        ...STILL,
        startYear: 2026,
      });
      const taxes = run.rows.map((r) => r.totalTax);
      expect(new Set(taxes).size).toBe(1);
      expect(taxes[0]).toBeGreaterThan(0);
    });

    it('still reads the published figures for a year already priced', () => {
      // 2025 -> 2028 at a 0% assumption: 2026 is published, so its wider
      // brackets and larger standard deduction apply however still the sliders
      // are held, and 2027 and 2028 index from there at 0%.
      const run = simulateSequencing('taxable-first', STILL_SCENARIO, {
        ...STILL,
        startYear: 2025,
      });
      const taxes = run.rows.map((r) => r.totalTax);
      expect(taxes[0]).toBeGreaterThan(taxes[1]);
      expect(new Set(taxes.slice(1)).size).toBe(1);
    });

    it('has no ratchet left to show a separate return', () => {
      const run = simulateSequencing(
        'proportional',
        { ...SCENARIO, filingStatus: 'mfs' },
        { ...ASSUMPTIONS, years: 5 },
      );
      // Both bases are $0, so 85% of the benefit is taxable from year one.
      expect(run.first.taxableSS).toBe(Math.round(0.85 * run.first.ssBenefit));
    });
  });

  describe('chart rows', () => {
    it('carries one cumulative series per strategy', () => {
      const c = compareSequencing(SCENARIO, ASSUMPTIONS);
      const rows = sequencingChartRows(c);
      expect(rows).toHaveLength(20);
      expect(rows[0].year).toBe(2025);
      expect(rows[rows.length - 1].year).toBe(2044);
      for (const key of ['taxableFirst', 'proportional', 'bracketFill'] as const) {
        for (let i = 1; i < rows.length; i += 1) {
          expect(rows[i][key]).toBeGreaterThanOrEqual(rows[i - 1][key]);
        }
      }
      expect(rows[rows.length - 1].bracketFill).toBe(
        c.strategies.find((s) => s.strategy.id === 'bracket-fill')!.lifetimeRealTax,
      );
    });
  });

  it('names every strategy, and falls back rather than throwing', () => {
    expect(SEQUENCING_STRATEGIES).toHaveLength(3);
    expect(sequencingStrategy('bracket-fill').chartKey).toBe('bracketFill');
    expect(sequencingStrategy('nonsense' as SequencingStrategyId).id).toBe('taxable-first');
  });
});

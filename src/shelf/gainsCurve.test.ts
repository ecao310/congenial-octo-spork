import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ltcgRateCurve } from './gainsCurve';
import {
  TaxYear,
  splitOtherIncome,
  taxableSocialSecurity,
  totalFederalTax,
  totalTax,
} from '../utils/tax';

/**
 * The tests that came off the shelf with `ltcgRateCurve`.
 *
 * Every dollar figure is a 2025 one, and scenarios that do not name a year
 * inherit `defaultTaxYear()` — which follows the calendar, so the clock is
 * pinned here rather than letting January re-point these assertions at a
 * different Rev. Proc. The same pin `tax.test.ts` uses, for the same reason.
 */
const PINNED_YEAR: TaxYear = 2025;

beforeEach(() => {
  // Date only: faking setTimeout as well would deadlock anything async.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${PINNED_YEAR}-07-01T00:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ltcgRateCurve', () => {
  it('samples from zero to maxLTCG inclusive', () => {
    const data = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0 },
      { maxLTCG: 10000, step: 250 },
    );
    expect(data).toHaveLength(41);
    expect(data[0].ltcg).toBe(0);
    expect(data[40].ltcg).toBe(10000);
  });

  it('shows 0% marginal rate on LTCG when all income is below the threshold', () => {
    // Single: no SS, no ordinary income, LTCG starts at $0.
    const data = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 0 },
      { maxLTCG: 50000, step: 250 },
    );
    const at = (ltcg: number) => data.find((d) => d.ltcg === ltcg)!.marginalRate;
    expect(at(0)).toBe(0);
    expect(at(10000)).toBe(0);
  });

  it('shows elevated marginal rates from SS torpedo stacking', () => {
    // Single: $30k ordinary, $30k SS. LTCG raises provisional income,
    // dragging SS into taxability at ordinary rates while LTCG itself
    // is taxed at capital-gains rates. The combined effect produces
    // marginal rates well above the bare 15% LTCG rate.
    const data = ltcgRateCurve(
      { ssBenefit: 30000, ordinaryIncome: 30000 },
      { maxLTCG: 100000, step: 250 },
    );
    const maxRate = Math.max(...data.map((d) => d.marginalRate));
    // The stacking pushes the effective marginal rate above 25%
    // (15% LTCG + torpedo-amplified ordinary tax on dragged-in SS).
    expect(maxRate).toBeGreaterThan(25);
  });

  it('reports total tax as non-decreasing', () => {
    const data = ltcgRateCurve(
      { ssBenefit: 24000, ordinaryIncome: 30000 },
      { maxLTCG: 100000, step: 250 },
    );
    for (let i = 1; i < data.length; i++) {
      expect(data[i].totalTax).toBeGreaterThanOrEqual(data[i - 1].totalTax);
    }
  });

  it('uses MFJ thresholds so LTCG stays at 0% longer', () => {
    // MFJ 0% threshold is $96,700 vs single $48,350.
    const dataSingle = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 60000 },
      { maxLTCG: 100000, step: 250 },
    );
    const dataMfj = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 60000, filingStatus: 'mfj' },
      { maxLTCG: 100000, step: 250 },
    );
    // Single: ordinaryTaxable = 60k - 15750 = 44250. 0% zone = $4100 of LTCG.
    // MFJ: ordinaryTaxable = 60k - 31500 = 28500. 0% zone = $68200 of LTCG.
    const singleFirstNonZero = dataSingle.find((d) => d.marginalRate > 0)!.ltcg;
    const mfjFirstNonZero = dataMfj.find((d) => d.marginalRate > 0)!.ltcg;
    expect(mfjFirstNonZero).toBeGreaterThan(singleFirstNonZero);
  });

  /**
   * The second rate on every point: what the gain has cost as a share of
   * itself, against the same return with that gain never realized. It is what
   * step 3 draws, where `marginalRate` is what its tooltip quotes.
   */
  describe('effectiveRate', () => {
    it('is zero where there is no gain to rate', () => {
      const data = ltcgRateCurve(
        { ssBenefit: 24000, ordinaryIncome: 30000 },
        { maxLTCG: 10000, step: 250 },
      );
      expect(data[0].ltcg).toBe(0);
      expect(data[0].effectiveRate).toBe(0);
    });

    it('holds at nothing under the 0% ceiling, then climbs past it', () => {
      // Single, $20,000 of ordinary income, gain stacked on top. Taxable
      // income clears the 0% ceiling somewhere in the middle of this sweep;
      // everything left of that is a gain charged nothing at all.
      const data = ltcgRateCurve(
        { ssBenefit: 0, ordinaryIncome: 20_000 },
        { maxLTCG: 150_000, step: 1_000 },
      );
      const at = (ltcg: number) => data.find((d) => d.ltcg === ltcg)!;
      expect(at(20_000).effectiveRate).toBe(0);
      expect(at(40_000).effectiveRate).toBe(0);

      const firstCharged = data.find((d) => d.effectiveRate > 0)!;
      expect(firstCharged.ltcg).toBeGreaterThan(40_000);
      // Past that point it only ever climbs — an average being dragged up by
      // 15% dollars, so it approaches the statutory rate without reaching it.
      const charged = data.filter((d) => d.ltcg >= firstCharged.ltcg);
      for (let i = 1; i < charged.length; i++) {
        expect(charged[i].effectiveRate).toBeGreaterThan(charged[i - 1].effectiveRate);
      }
      expect(charged[charged.length - 1].effectiveRate).toBeLessThan(15);
    });

    it('is the gain\u2019s own share of the bill, not the whole return\u2019s', () => {
      const scenario = { ssBenefit: 0, ordinaryIncome: 20_000 };
      const data = ltcgRateCurve(scenario, { maxLTCG: 100_000, step: 1_000 });
      const point = data.find((d) => d.ltcg === 100_000)!;
      const withGain = totalFederalTax({ ...scenario, ltcg: 100_000 });
      const without = totalFederalTax({ ...scenario, ltcg: 0 });
      expect(point.effectiveRate).toBeCloseTo(
        Math.round(((withGain - without) / 100_000) * 10_000) / 100,
        6,
      );
      // Not the same figure as the whole return's effective rate, which spreads
      // the same bill over the total income. Here it comes out *lower* than the
      // gain's own: the deduction shelters nearly all of the $20,000 of ordinary
      // income, so the gain is carrying the bill and the ordinary half is
      // diluting the rate rather than adding to it.
      expect(without).toBeLessThan(500);
      expect(withGain / 120_000).toBeLessThan(point.effectiveRate / 100);
    });

    it('can run past 15% where the gain drags a benefit in with it', () => {
      // The torpedo again, read off the average rather than the next dollar:
      // the gain is charged its own preferential rate and pulls benefit into
      // the base at ordinary rates, and both land on the same gain.
      const data = ltcgRateCurve(
        { ssBenefit: 30_000, ordinaryIncome: 30_000 },
        { maxLTCG: 100_000, step: 1_000 },
      );
      expect(Math.max(...data.map((d) => d.effectiveRate))).toBeGreaterThan(15);
    });

    it('measures the same counterfactual on a within-income sweep', () => {
      // The axis step 3 draws: the gain comes out of the income already there,
      // so "without the gain" is the smaller, all-ordinary return.
      const scenario = { ssBenefit: 24_000, ordinaryIncome: 60_000 };
      const data = ltcgRateCurve(scenario, {
        maxLTCG: 60_000,
        step: 1_000,
        gainsWithinIncome: true,
      });
      const point = data.find((d) => d.ltcg === 40_000)!;
      const split = { ...scenario, ordinaryIncome: 20_000, ltcg: 40_000 };
      const gained =
        totalFederalTax(split) - totalFederalTax({ ...split, ltcg: 0 });
      expect(point.effectiveRate).toBeCloseTo(
        Math.round((gained / 40_000) * 10_000) / 100,
        6,
      );
    });
  });
});

/**
 * The app asks for one income figure and then asks how much of it is a
 * long-term gain, so a gain is a share of the income a filer has rather than
 * something stacked on top of it. The statute takes the additive reading —
 * ordinary income and gains are separate line items — which is why the sweeps
 * keep it as their default and `gainsWithinIncome` is what opts out.
 */
describe('ltcgRateCurve with gainsWithinIncome', () => {
  const scenario = { ssBenefit: 24_000, ordinaryIncome: 60_000 };

  it('holds total income still and moves only the split', () => {
    const curve = ltcgRateCurve(scenario, {
      maxLTCG: 60_000,
      step: 1_000,
      gainsWithinIncome: true,
    });
    const at = (gain: number): number =>
      curve.find((d) => d.ltcg === gain)!.totalTax;
    expect(at(0)).toBe(Math.round(totalTax(scenario)));
    expect(at(20_000)).toBe(
      Math.round(totalTax({ ...scenario, ordinaryIncome: 40_000, ltcg: 20_000 })),
    );
    expect(at(60_000)).toBe(
      Math.round(totalTax({ ...scenario, ordinaryIncome: 0, ltcg: 60_000 })),
    );
  });

  /**
   * A dollar of gain and a dollar of ordinary income raise provisional
   * income identically, so the taxable share of the benefit is the same at
   * every point on this axis. That is what makes the curve readable: the
   * torpedo is held fixed and only the rate schedule each dollar is charged
   * under is moving.
   */
  it('leaves the taxable benefit untouched across the whole axis', () => {
    const taxable = (gain: number): number =>
      taxableSocialSecurity({ ...scenario, ...splitOtherIncome(60_000, gain) });
    expect(taxable(20_000)).toBeCloseTo(taxable(0), 6);
    expect(taxable(60_000)).toBeCloseTo(taxable(0), 6);
  });

  /**
   * The preferential rate is below the ordinary one at every position in the
   * stack, so re-labelling a dollar of the same income as a gain can never
   * cost more.
   */
  it('never charges more for the same income as the gain share grows', () => {
    const curve = ltcgRateCurve(scenario, {
      maxLTCG: 60_000,
      step: 500,
      gainsWithinIncome: true,
    });
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].totalTax).toBeLessThanOrEqual(curve[i - 1].totalTax);
    }
    expect(curve[curve.length - 1].totalTax).toBeLessThan(curve[0].totalTax);
  });

  it('still stacks on top when the flag is left off', () => {
    const stacked = ltcgRateCurve(scenario, {
      maxLTCG: 60_000,
      step: 1_000,
    });
    expect(stacked.find((d) => d.ltcg === 20_000)!.totalTax).toBe(
      Math.round(totalTax({ ...scenario, ltcg: 20_000 })),
    );
  });
});

/**
 * The surtax, seen from the gains axis rather than the ordinary-income one.
 *
 * `tax.test.ts` keeps the half of this that is about live code — the ordinary
 * curve's third hump and the axis feature that makes room for it. This is the
 * half that moved with the curve it sweeps.
 */
describe('the 1411 surtax on the gains curve', () => {
  const YEAR = { year: PINNED_YEAR };

  /**
   * From the other side: a gain dollar past the threshold is both net
   * investment income and MAGI, so it enters the base from both ends and
   * pays 3.8 on top of its own 15%.
   */
  it('raises the gains curve by 3.8 points on top of the capital-gain rate', () => {
    const curve = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 260_000, filingStatus: 'single', ...YEAR },
      { maxLTCG: 40_000, step: 5_000, gainsWithinIncome: true },
    );
    // MAGI is $260,000 all the way across — the sweep only moves the split —
    // so every gain dollar on this axis is inside the surtax base.
    for (const point of curve) {
      expect(point.marginalRate).toBeCloseTo(18.8, 6);
    }
    // Under the threshold there is no surtax to add, and the same sweep is
    // the bare 15%.
    const below = ltcgRateCurve(
      { ssBenefit: 0, ordinaryIncome: 150_000, filingStatus: 'single', ...YEAR },
      { maxLTCG: 40_000, step: 5_000, gainsWithinIncome: true },
    );
    for (const point of below) {
      expect(point.marginalRate).toBeCloseTo(15, 6);
    }
  });
});

import type { FilingStatus } from './types';
import { FILING_STATUSES, TAX_YEARS } from './params';
import { avgAnnualSSBenefit, taxableSocialSecurity } from './socialSecurity';
import { agiFor } from './income';
import { otherIncomeAtTaxableSSCap, otherIncomeAtAgi, incomeAxisFeatures, MIN_INCOME_AXIS, incomeAxisMax } from './axis';
import { pinTaxYear, PINNED_YEAR, AVG_ANNUAL_SS_BENEFIT, MAX_ANNUAL_SS_BENEFIT } from '../../test/taxFixtures';

pinTaxYear();

/**
 * The chart's right edge used to be a constant, and a constant cannot be right
 * for every return: $150,000 shows an unmarried filer the whole torpedo and
 * three IRMAA cliffs, but stops halfway through the senior deduction's
 * phaseout, which does not finish until $175,000 of MAGI unmarried and
 * $250,000 joint. So the axis is now derived from the scenario — it ends a
 * little past the last thing that happens on the curve, and never narrows
 * below the figure it used to be fixed at.
 */
describe('sizing the income axis to the return', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712

  describe('otherIncomeAtTaxableSSCap', () => {
    /**
     * 86(a)(2)(B): the inclusion stops at 85% of the benefit. For a single
     * filer that needs provisional income of $34,000 + ($20,155.20 - $4,500) /
     * 0.85 = $52,417.88, and provisional income already holds half the benefit,
     * so $40,561.88 of other income gets there.
     */
    it('finds where the taxable share of the benefit stops rising', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const };
      const cap = otherIncomeAtTaxableSSCap(scenario);
      expect(cap).toBeCloseTo(40_561.88, 1);
      // At that income the cap binds to the cent, and a hundred dollars short
      // of it the next dollar of income is still dragging benefits in.
      expect(
        taxableSocialSecurity({ ...scenario, ordinaryIncome: cap }),
      ).toBeCloseTo(0.85 * SS, 1);
      expect(
        taxableSocialSecurity({ ...scenario, ordinaryIncome: cap - 100 }),
      ).toBeLessThan(0.85 * SS - 1);
    });

    it('gives each filing status its own end of the torpedo', () => {
      const at = (filingStatus: FilingStatus): number =>
        otherIncomeAtTaxableSSCap({ ssBenefit: SS, filingStatus });
      // Joint bases are $8,000 and $10,000 higher, so the hump ends later.
      expect(at('mfj')).toBeCloseTo(48_797.18, 1);
      expect(at('mfj')).toBeGreaterThan(at('single'));
    });

    it('has nothing to find when there is no benefit', () => {
      expect(otherIncomeAtTaxableSSCap({ ssBenefit: 0 })).toBe(0);
      // Nor when the cap already binds at no other income at all: enough
      // tax-exempt interest is provisional income enough on its own.
      expect(
        otherIncomeAtTaxableSSCap({
          ssBenefit: SS,
          muniInterest: 60_000,
        }),
      ).toBe(0);
    });

    it('moves with everything else in provisional income', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const };
      const plain = otherIncomeAtTaxableSSCap(base);
      // Tax-exempt interest is provisional income, so it does the dragging
      // that other income would have done: the hump ends that much earlier.
      expect(otherIncomeAtTaxableSSCap({ ...base, muniInterest: 5_000 })).toBeCloseTo(
        plain - 5_000,
        1,
      );
    });
  });

  describe('otherIncomeAtAgi', () => {
    it('inverts AGI onto the chart’s own axis', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const };
      const income = otherIncomeAtAgi(175_000, scenario);
      expect(agiFor({ ...scenario, ordinaryIncome: income })).toBeCloseTo(175_000, 1);
      // Less other income than the AGI figure names, because $20,155.20 of
      // benefit is in AGI by then and got there first.
      expect(income).toBeCloseTo(175_000 - 0.85 * SS, 1);
    });

    it('returns nothing to travel when AGI starts past the target', () => {
      // It solves on the chart's axis, so whatever `ordinaryIncome` the
      // scenario carries is swept away — what can put AGI past a small target
      // with no other income at all is tax-exempt interest, which drags
      // benefits into AGI without ever landing there itself.
      expect(
        otherIncomeAtAgi(10_000, { ssBenefit: SS, muniInterest: 40_000 }),
      ).toBe(0);
      expect(otherIncomeAtAgi(1_000, { ssBenefit: SS, ordinaryIncome: 90_000 })).toBe(
        1_000,
      );
    });
  });

  describe('incomeAxisFeatures', () => {
    it('reports the second hump only when there is one to phase out', () => {
      const base = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      // Under 65: nothing to phase out, so nothing to make room for.
      expect(incomeAxisFeatures(base).seniorPhaseoutEnd).toBeNull();
      expect(incomeAxisFeatures({ ...base, seniors: 1 }).seniorPhaseoutEnd).toBeCloseTo(
        154_844.8,
        1,
      );
      // And there is nothing to make room for in a year the deduction does
      // not exist in, whatever the age says.
      expect(
        incomeAxisFeatures({ ...base, seniors: 1, year: 2026 })
          .seniorPhaseoutEnd,
      ).not.toBeNull();
    });

    it('puts a joint return’s phaseout $75,000 further out', () => {
      const features = incomeAxisFeatures({
        ssBenefit: SS,
        filingStatus: 'mfj',
        seniors: 2,
        year: PINNED_YEAR,
      });
      expect(features.torpedoEnd).toBeCloseTo(48_797.18, 1);
      expect(features.seniorPhaseoutEnd).toBeCloseTo(229_844.8, 1);
    });

    it('counts one qualifying spouse the same as two', () => {
      const base = { ssBenefit: SS, filingStatus: 'mfj' as const, year: PINNED_YEAR };
      // Each person's own $6,000 phases out at 6% of the same excess, so the
      // couple's $12,000 runs out exactly where one spouse's $6,000 would.
      expect(incomeAxisFeatures({ ...base, seniors: 1 }).seniorPhaseoutEnd).toBeCloseTo(
        incomeAxisFeatures({ ...base, seniors: 2 }).seniorPhaseoutEnd ?? 0,
        6,
      );
    });
  });

  describe('incomeAxisMax', () => {
    it('leaves the axis where it was for a filer under 65', () => {
      for (const filingStatus of FILING_STATUSES) {
        expect(
          incomeAxisMax({ ssBenefit: SS, filingStatus, year: PINNED_YEAR }),
        ).toBe(MIN_INCOME_AXIS);
      }
    });

    it('widens it to fit the senior deduction phaseout', () => {
      // $154,844.8 of other income plus 5% of tail, rounded up to a figure the
      // tick labels can live with.
      expect(
        incomeAxisMax({ ssBenefit: SS, filingStatus: 'single', seniors: 1, year: PINNED_YEAR }),
      ).toBe(175_000);
      expect(
        incomeAxisMax({ ssBenefit: SS, filingStatus: 'mfj', seniors: 2, year: PINNED_YEAR }),
      ).toBe(250_000);
    });

    /**
     * The whole point of deriving the axis: whatever the return, if there is a
     * phaseout on the curve then its far side is on the chart. This is what a
     * constant could not do.
     */
    it('always contains the phaseout it is drawn for', () => {
      for (const year of TAX_YEARS) {
        for (const filingStatus of FILING_STATUSES) {
          for (const seniors of [1, 2]) {
            for (const muniInterest of [0, 20_000]) {
              const scenario = {
                ssBenefit: avgAnnualSSBenefit(year),
                filingStatus,
                seniors,
                muniInterest,
                year,
              };
              const { seniorPhaseoutEnd } = incomeAxisFeatures(scenario);
              if (seniorPhaseoutEnd === null) continue;
              expect(incomeAxisMax(scenario)).toBeGreaterThan(seniorPhaseoutEnd);
            }
          }
        }
      }
    });

    it('never narrows below the constant it replaced, and lands on a round figure', () => {
      for (const seniors of [0, 1, 2]) {
        for (const muniInterest of [0, 40_000]) {
          const max = incomeAxisMax({
            ssBenefit: MAX_ANNUAL_SS_BENEFIT,
            filingStatus: 'mfj',
            seniors,
            muniInterest,
            year: PINNED_YEAR,
          });
          expect(max).toBeGreaterThanOrEqual(MIN_INCOME_AXIS);
          expect(max % 25_000).toBe(0);
        }
      }
    });

    it('takes a floor from the caller, for the point the reader is standing on', () => {
      const scenario = { ssBenefit: SS, filingStatus: 'single' as const, year: PINNED_YEAR };
      // Rounded up like everything else, so a reader parked at $160,000 gets a
      // $175,000 axis rather than one that ends under their own marker.
      expect(incomeAxisMax(scenario, { minimum: 160_000 })).toBe(175_000);
      // The floor is a default, not a law: a caller that wants the frame drawn
      // tight around the curve can ask for one, and gets the torpedo's own
      // $40,561.88 plus a tail, rounded up.
      expect(incomeAxisMax(scenario, { minimum: 0 })).toBe(50_000);
    });
  });
});

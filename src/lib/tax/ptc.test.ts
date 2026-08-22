import type { TaxYear } from './types';
import { TAX_YEAR_PARAMS, TAX_YEARS } from './params';
import { resolveScenario, defaultHouseholdSize } from './scenario';
import { taxableSocialSecurity } from './socialSecurity';
import { agiFor, totalIncomeFor } from './income';
import { IRMAA_LOOKBACK_YEARS, irmaaMagi, irmaaCliffs } from './irmaa';
import { PTC_CLIFF_PERCENT, FPL_GUIDELINE_LOOKBACK_YEARS, FPL_YEAR_PARAMS, fplGuidelineYear, povertyLine, povertyLineFor, acaMagi, fplMultipleOf, ptcCliffMagi, otherIncomeAtAcaMagi, ptcCliff, ptcFor } from './ptc';
import { pinTaxYear, PINNED_YEAR, MAX_ANNUAL_SS_BENEFIT } from '../../test/taxFixtures';

pinTaxYear();

/**
 * The second true cliff on this page, and the one that bites before 65.
 *
 * Every figure here is a 2026 one, because 2026 is the first year since 2020
 * that has a cliff at all — ARPA section 9661, extended through 2025 by the
 * Inflation Reduction Act, took the 400% ceiling out of 36B(c)(1)(A) and let
 * the credit taper past it instead. `PINNED_YEAR` is 2025, so any assertion
 * below that omits a year is asserting on the *absence* of the cliff, which is
 * a case worth having tests for rather than an oversight.
 */
describe('the premium tax credit’s 400% cliff (IRC 36B)', () => {
  const CLIFF_YEAR: TaxYear = 2026;
  const Y26 = { year: CLIFF_YEAR };
  /** The 2026 average benefit, $24,852 — not `AVG_ANNUAL_SS_BENEFIT`, which is 2025's. */
  const SS = TAX_YEAR_PARAMS[CLIFF_YEAR].avgAnnualSSBenefit;
  /** 400% of the one-person line: 4 × $15,650. */
  const CLIFF = 62_600;

  describe('the poverty line it is measured against', () => {
    /**
     * 26 CFR 1.36B-1(h) fixes the guidelines at the ones in effect when the
     * regular enrolment period opened, which is the previous 1 November — so
     * the figure is a year old before the coverage year starts.
     */
    it('prices a coverage year off the guidelines published the January before', () => {
      expect(FPL_GUIDELINE_LOOKBACK_YEARS).toBe(1);
      expect(fplGuidelineYear(2026)).toBe(2025);
      expect(fplGuidelineYear(2025)).toBe(2024);
      expect(FPL_YEAR_PARAMS[2026].guidelineYear).toBe(2025);
      // Medicare looks back two, and for the same reason at twice the distance.
      expect(FPL_GUIDELINE_LOOKBACK_YEARS).toBeLessThan(IRMAA_LOOKBACK_YEARS);
      expect(fplGuidelineYear()).toBe(PINNED_YEAR - 1);
    });

    it('is the HHS table for the contiguous states: a first person plus an increment', () => {
      // 2025 guidelines, 90 Fed. Reg. 5917, which price 2026 coverage.
      expect(povertyLine(1, 2026)).toBe(15_650);
      expect(povertyLine(2, 2026)).toBe(21_150);
      expect(povertyLine(4, 2026)).toBe(32_150);
      expect(povertyLine(8, 2026)).toBe(54_150);
      // 2024 guidelines, which priced 2025 coverage.
      expect(povertyLine(1, 2025)).toBe(15_060);
      expect(povertyLine(2, 2025)).toBe(20_440);
      expect(povertyLine(4, 2025)).toBe(31_200);
      // The published table is linear past the first person, so the increment
      // is not an approximation of it — it is the rest of it.
      for (const year of TAX_YEARS) {
        const { perAdditionalPerson } = FPL_YEAR_PARAMS[year];
        expect(povertyLine(5, year) - povertyLine(4, year)).toBe(perAdditionalPerson);
      }
    });

    it('never sizes a household below one person', () => {
      expect(povertyLine(0, CLIFF_YEAR)).toBe(povertyLine(1, CLIFF_YEAR));
      expect(povertyLine(-3, CLIFF_YEAR)).toBe(povertyLine(1, CLIFF_YEAR));
    });

    /**
     * The tax code sizes its own figures by filing status; 36B sizes its line
     * by head count. This is the one place on the page where a fifth person
     * moves a line, which is why `householdSize` exists at all.
     */
    it('sizes the household from the filing status until the reader says otherwise', () => {
      expect(defaultHouseholdSize('single')).toBe(1);
      expect(defaultHouseholdSize('mfj')).toBe(2);
      expect(resolveScenario({}).householdSize).toBe(1);
      expect(resolveScenario({ filingStatus: 'mfj' }).householdSize).toBe(2);
      expect(resolveScenario({ householdSize: 4 }).householdSize).toBe(4);
      expect(povertyLineFor({ householdSize: 4, ...Y26 })).toBe(32_150);
    });
  });

  describe('household income under 36B(d)(2)(B)', () => {
    /** The clause that undoes this page's own subject. */
    it('adds the untaxed part of the benefit back, so the whole benefit counts', () => {
      const scenario = { ordinaryIncome: 20_000, ssBenefit: SS, ...Y26 };
      const taxable = taxableSocialSecurity(scenario);
      // A point on the hump, not past it: part of the benefit is still out.
      expect(taxable).toBeGreaterThan(0);
      expect(taxable).toBeLessThan(0.85 * SS);
      expect(acaMagi(scenario)).toBeCloseTo(20_000 + SS, 6);
      expect(acaMagi(scenario) - agiFor(scenario)).toBeCloseTo(SS - taxable, 6);
    });

    it('is Medicare’s MAGI plus that untaxed part, on the same return', () => {
      const scenario = {
        ordinaryIncome: 20_000,
        ssBenefit: SS,
        muniInterest: 8_000,
        ...Y26,
      };
      const untaxed = SS - taxableSocialSecurity(scenario);
      expect(untaxed).toBeGreaterThan(0);
      expect(acaMagi(scenario) - irmaaMagi(scenario)).toBeCloseTo(untaxed, 6);
      // Three MAGIs, widest first: 36B, Medicare's, then 1411's plain AGI.
      expect(irmaaMagi(scenario) - agiFor(scenario)).toBeCloseTo(8_000, 6);
    });

    /**
     * The consequence the page's prose is built on: because the whole benefit
     * is already in, no dollar of other income can drag any more of it in.
     */
    it('rises a flat dollar per dollar of other income, where Medicare’s rises up to $1.85', () => {
      const at = (income: number) => ({ ordinaryIncome: income, ssBenefit: SS, ...Y26 });
      const slopes = [];
      for (let income = 0; income <= 60_000; income += 1_000) {
        slopes.push({
          aca: acaMagi(at(income + 1)) - acaMagi(at(income)),
          irmaa: irmaaMagi(at(income + 1)) - irmaaMagi(at(income)),
        });
      }
      for (const { aca } of slopes) expect(aca).toBeCloseTo(1, 6);
      expect(Math.max(...slopes.map((s) => s.irmaa))).toBeCloseTo(1.85, 6);
      expect(Math.min(...slopes.map((s) => s.irmaa))).toBeCloseTo(1, 6);
    });

    /**
     * Not a coincidence worth hiding: 36B household income and the "total
     * income" the close already quotes are the same arithmetic, because both
     * mean everything the return took in. A reader who has read one figure has
     * read the other — which is worth pinning, because a drift in either would
     * be a page quoting a cliff against an income it does not measure.
     */
    it('is the total income this page already states, on every scenario it can build', () => {
      const scenarios = [
        { ordinaryIncome: 0, ssBenefit: SS },
        { ordinaryIncome: 40_000, ssBenefit: SS, muniInterest: 9_000 },
        { ordinaryIncome: 90_000, ssBenefit: SS, ltcg: 30_000 },
        { ordinaryIncome: 120_000, ssBenefit: 0, filingStatus: 'mfj' as const },
      ];
      for (const scenario of scenarios) {
        const full = { ...scenario, ...Y26 };
        expect(acaMagi(full)).toBeCloseTo(totalIncomeFor(full), 6);
      }
    });
  });

  describe('the cliff itself', () => {
    it('is 400% of the line, and the dollar past it is the one that costs', () => {
      expect(PTC_CLIFF_PERCENT).toBe(4);
      expect(ptcCliffMagi(Y26)).toBe(CLIFF);
      expect(ptcCliffMagi({ filingStatus: 'mfj', ...Y26 })).toBe(84_600);
      // 36B(c)(1)(A) reads "not more than 400 percent", so the line itself is
      // still inside the table.
      expect(ptcFor(CLIFF, Y26).overCliff).toBe(false);
      expect(ptcFor(CLIFF, Y26).headroom).toBe(0);
      expect(ptcFor(CLIFF + 1, Y26).overCliff).toBe(true);
      expect(ptcFor(CLIFF + 1, Y26).headroom).toBe(0);
      expect(ptcFor(50_000, Y26).headroom).toBe(12_600);
      expect(ptcFor(CLIFF, Y26).fplMultiple).toBeCloseTo(4, 6);
      expect(fplMultipleOf(31_300, Y26)).toBeCloseTo(2, 6);
    });

    /**
     * The reason `FPL_YEAR_PARAMS` carries a flag rather than assuming a
     * cliff: on a 2025 return this line does not exist.
     */
    it('did not exist from 2021 through 2025, and returns in 2026', () => {
      expect(FPL_YEAR_PARAMS[2025].cliff).toBe(false);
      expect(FPL_YEAR_PARAMS[2026].cliff).toBe(true);
      expect(ptcCliffMagi({ year: 2025 })).toBeNull();
      expect(ptcCliff({ year: 2025 })).toBeNull();

      const flat = ptcFor(400_000, { year: 2025 });
      expect(flat.cliffApplies).toBe(false);
      expect(flat.cliffMagi).toBeNull();
      expect(flat.overCliff).toBe(false);
      expect(flat.headroom).toBeNull();
      // The poverty line still exists in a year with no cliff drawn on it, so
      // the multiple is still reported.
      expect(flat.povertyLine).toBe(15_060);
      expect(flat.fplMultiple).toBeCloseTo(400_000 / 15_060, 6);
    });

    it('quotes what the household pays under the line, not what it loses over it', () => {
      const cliff = ptcCliff(Y26)!;
      // Rev. Proc. 2025-25 section 3.01, last row: 300% to 400% pays 9.96%.
      expect(cliff.topApplicablePercentage).toBe(0.0996);
      expect(cliff.cappedContribution).toBeCloseTo(0.0996 * CLIFF, 2);
      expect(cliff.cappedContribution).toBe(6_234.96);
      expect(cliff.povertyLine).toBe(15_650);
      expect(cliff.magi).toBe(CLIFF);
    });

    it('sizes the line for the household, not for the filing status', () => {
      expect(ptcCliff(Y26)!.householdSize).toBe(1);
      expect(ptcCliff({ filingStatus: 'mfj', ...Y26 })!.householdSize).toBe(2);

      const family = ptcCliff({ filingStatus: 'mfj', householdSize: 4, ...Y26 })!;
      expect(family.povertyLine).toBe(32_150);
      expect(family.magi).toBe(4 * 32_150);
      // Two dependents move the line by 400% of two increments, which is the
      // whole reason the field exists.
      expect(family.magi - ptcCliff({ filingStatus: 'mfj', ...Y26 })!.magi).toBe(
        PTC_CLIFF_PERCENT * 2 * FPL_YEAR_PARAMS[CLIFF_YEAR].perAdditionalPerson,
      );
    });
  });

  describe('where it lands on the other-income axis', () => {
    const base = { ssBenefit: SS, ...Y26 };

    it('inverts household income exactly, because household income is a straight line', () => {
      const cliff = ptcCliff(base)!;
      expect(cliff.otherIncome).toBeCloseTo(CLIFF - SS, 4);
      expect(cliff.otherIncome).toBeCloseTo(37_748, 4);
      expect(acaMagi({ ...base, ordinaryIncome: cliff.otherIncome })).toBeCloseTo(
        CLIFF,
        4,
      );
      for (const target of [30_000, CLIFF, 120_000]) {
        const income = otherIncomeAtAcaMagi(target, base);
        expect(acaMagi({ ...base, ordinaryIncome: income })).toBeCloseTo(target, 4);
      }
    });

    it('clamps to nothing when the benefit alone is already over the line', () => {
      const big = { ssBenefit: MAX_ANNUAL_SS_BENEFIT, muniInterest: 40_000, ...Y26 };
      expect(acaMagi(big)).toBeGreaterThan(CLIFF);
      expect(ptcCliff(big)!.otherIncome).toBe(0);
      expect(otherIncomeAtAcaMagi(CLIFF, big)).toBe(0);
    });

    it('is pushed left by the tax-exempt interest, dollar for dollar', () => {
      const plain = ptcCliff(base)!.otherIncome;
      expect(plain - ptcCliff({ ...base, muniInterest: 5_000 })!.otherIncome).toBeCloseTo(
        5_000,
        4,
      );
    });

    /**
     * What the explainer beside the chart claims, checked: the two cliffs
     * travel at different speeds, so neither can be read off the other.
     */
    it('moves left a full dollar per dollar of benefit, where Medicare’s move 85 cents', () => {
      const step = 1_000;
      const richer = { ...base, ssBenefit: SS + step };
      expect(ptcCliff(base)!.otherIncome - ptcCliff(richer)!.otherIncome).toBeCloseTo(
        step,
        4,
      );
      // 85 cents is all of an extra benefit dollar 86(a) can ever put in the
      // tax base, so 85 cents is all Medicare's MAGI can gain from it.
      const irmaaShift =
        irmaaCliffs(base)[0].otherIncome - irmaaCliffs(richer)[0].otherIncome;
      expect(irmaaShift).toBeCloseTo(0.85 * step, 4);
      expect(irmaaShift).toBeLessThan(step);
    });
  });
});

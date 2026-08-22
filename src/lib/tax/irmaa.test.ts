import { TAX_YEARS } from './params';
import { totalTax } from './income';
import { irmaaMagiYear, partBStandardPremium, irmaaTiersFor, irmaaMagi, irmaaTierFor, irmaaFor, otherIncomeAtIrmaaMagi, irmaaCliffs } from './irmaa';
import { pinTaxYear, PINNED_YEAR, AVG_ANNUAL_SS_BENEFIT, MAX_ANNUAL_SS_BENEFIT } from '../../test/taxFixtures';

pinTaxYear();

describe('IRMAA (Medicare income-related monthly adjustment amount)', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  /** 85% of the average benefit — the cap the torpedo tops out at. */
  const SS_CAP = 0.85 * AVG_ANNUAL_SS_BENEFIT; // $20,155.20

  it('reads MAGI from the return filed two years before the premium year', () => {
    // The premium year is the tax year selected on the page, not a constant:
    // pick 2026 and the table has to say it is priced off 2024 income.
    expect(irmaaMagiYear(2025)).toBe(2023);
    expect(irmaaMagiYear(2026)).toBe(2024);
    // Un-yeared, it follows the same pinned clock as everything else here.
    expect(irmaaMagiYear()).toBe(PINNED_YEAR - 2);
    for (const year of TAX_YEARS) {
      expect(irmaaMagiYear(year)).toBe(year - 2);
    }
  });

  it('matches the 2025 CMS premium schedule', () => {
    // Federal Register 89 FR 89843 (Nov 14 2024) / CMS 2025 fact sheet.
    expect(partBStandardPremium(2025)).toBe(185);
    expect(irmaaTiersFor({ year: 2025 }).map((t) => t.partBMonthly)).toEqual([
      185, 259, 370, 480.9, 591.9, 628.9,
    ]);
    expect(irmaaTiersFor({ year: 2025 }).map((t) => t.partDSurchargeMonthly)).toEqual([
      0, 13.7, 35.3, 57, 78.6, 85.8,
    ]);
    expect(irmaaTiersFor({ year: 2025 }).map((t) => t.partBSurchargeMonthly)).toEqual([
      0, 74, 185, 295.9, 406.9, 443.9,
    ]);
    expect(irmaaTiersFor({ year: 2025 }).slice(1).map((t) => t.magiOver.single)).toEqual([
      106_000, 133_000, 167_000, 200_000, 500_000,
    ]);
  });

  it('matches the 2026 CMS premium schedule', () => {
    // 90 FR 52065 (Nov 19 2025), the rule CMS's fact sheet reproduces. The
    // point of carrying IRMAA per year at all: ask for 2026 and this section
    // re-prices rather than sitting a year stale next to 2026 brackets.
    expect(partBStandardPremium(2026)).toBe(202.9);
    expect(irmaaTiersFor({ year: 2026 }).map((t) => t.partBMonthly)).toEqual([
      202.9, 284.1, 405.8, 527.5, 649.2, 689.9,
    ]);
    expect(irmaaTiersFor({ year: 2026 }).map((t) => t.partDSurchargeMonthly)).toEqual([
      0, 14.5, 37.5, 60.4, 83.3, 91,
    ]);
    expect(irmaaTiersFor({ year: 2026 }).map((t) => t.partBSurchargeMonthly)).toEqual([
      0, 81.2, 202.9, 324.6, 446.3, 487,
    ]);
    expect(irmaaTiersFor({ year: 2026 }).slice(1).map((t) => t.magiOver.single)).toEqual([
      109_000, 137_000, 171_000, 205_000, 500_000,
    ]);
  });

  it('keeps every year’s Part B surcharge equal to its premium over standard', () => {
    // The surcharge column is transcribed from CMS rather than derived, so
    // that a year's figures can be checked against the fact sheet line by
    // line. This is the check that the two columns did not drift apart.
    for (const year of TAX_YEARS) {
      const standard = partBStandardPremium(year);
      for (const tier of irmaaTiersFor({ year })) {
        expect(tier.partBMonthly - standard).toBeCloseTo(
          tier.partBSurchargeMonthly,
          6,
        );
      }
      expect(irmaaTiersFor({ year }).map((t) => t.tier)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(irmaaTiersFor({ year })[0].partBMonthly).toBe(standard);
    }
  });

  it('doubles the joint thresholds except at the statutory top tier', () => {
    for (const year of TAX_YEARS) {
      const tiers = irmaaTiersFor({ year });
      for (const tier of tiers.slice(1, 5)) {
        expect(tier.magiOver.mfj).toBe(2 * tier.magiOver.single);
      }
      // $500,000/$750,000 came from the Bipartisan Budget Act of 2018 and is
      // not indexed until years beginning after 2027, so it never doubled and
      // is the one threshold that does not move between 2025 and 2026.
      expect(tiers[5].magiOver.single).toBe(500_000);
      expect(tiers[5].magiOver.mfj).toBe(750_000);
    }
  });

  it('adds tax-exempt interest back into MAGI but never into the tax base', () => {
    // AGI at $50,000 of other income: the 85% cap already binds.
    expect(irmaaMagi({ ordinaryIncome: 50_000, ssBenefit: SS })).toBeCloseTo(50_000 + SS_CAP, 6);
    // The interest lands in MAGI twice over: once directly, and once through
    // the benefits it drags in — except here the cap has already bound, so
    // only the direct dollar counts.
    expect(irmaaMagi(
      { ordinaryIncome: 50_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', muniInterest: 10_000 },
    )).toBeCloseTo(
      60_000 + SS_CAP,
      6,
    );
    // Capital gains are ordinary AGI for this purpose, preferential rate or not.
    expect(irmaaMagi({ ordinaryIncome: 50_000, ssBenefit: SS, ltcg: 20_000 })).toBeCloseTo(70_000 + SS_CAP, 6);
  });

  it('treats the thresholds as exclusive cliffs, except the top one', () => {
    expect(irmaaTierFor(106_000).tier).toBe(0);
    expect(irmaaTierFor(106_000.01).tier).toBe(1);
    expect(irmaaTierFor(133_000).tier).toBe(1);
    expect(irmaaTierFor(133_000.01).tier).toBe(2);
    expect(irmaaTierFor(1e9).tier).toBe(5);
    // The last row of the statutory rate table at 42 U.S.C.
    // 1395r(i)(3)(C)(i)(III) reads "At least $500,000" where every row above
    // it reads "More than", and CMS reproduces that verbatim: "Greater than
    // $205,000 and less than $500,000", then "Greater than or equal to
    // $500,000". So $500,000 on the nose is already the top tier.
    expect(irmaaTierFor(500_000).tier).toBe(5);
    expect(irmaaTierFor(499_999.99).tier).toBe(4);
    // A joint return at the same MAGI sits two tiers lower.
    expect(irmaaTierFor(220_000, { filingStatus: 'mfj' }).tier).toBe(1);
    expect(irmaaTierFor(220_000, { filingStatus: 'single' }).tier).toBe(4);
  });

  it('re-tiers the same MAGI when the premium year changes', () => {
    // $107,000 is over 2025's first threshold and under 2026's — the same
    // income, a $1,052.40 surcharge one year and nothing the next.
    expect(irmaaTierFor(107_000, { year: 2025 }).tier).toBe(1);
    expect(irmaaTierFor(107_000, { year: 2026 }).tier).toBe(0);
    expect(irmaaFor(107_000, { year: 2025 }).annualSurcharge).toBeCloseTo(1_052.4, 6);
    expect(irmaaFor(107_000, { year: 2026 }).annualSurcharge).toBe(0);
    // Tier 0 still bills the standard premium, and it went up either way.
    expect(irmaaFor(107_000, { year: 2026 }).annualPartB).toBeCloseTo(2_434.8, 6);
    // (81.20 Part B + 14.50 Part D) x 12, 2026's first step.
    expect(irmaaFor(109_001, { year: 2026 }).annualSurcharge).toBeCloseTo(1_148.4, 6);
    // And the cliffs the chart draws move with it.
    expect(irmaaCliffs({ ssBenefit: 0, year: 2026 }).map((c) => c.magi)).toEqual([
      109_000, 137_000, 171_000, 205_000, 500_000,
    ]);
  });

  it('annualizes the Part B and Part D surcharges per beneficiary', () => {
    const standard = irmaaFor(50_000);
    expect(standard.tier).toBe(0);
    expect(standard.annualSurcharge).toBe(0);
    expect(standard.annualPartB).toBe(2_220); // 185 x 12
    expect(standard.nextThreshold).toBe(106_000);

    const tier1 = irmaaFor(106_001);
    expect(tier1.tier).toBe(1);
    // (74.00 Part B + 13.70 Part D) x 12
    expect(tier1.annualSurcharge).toBe(1_052.4);
    expect(tier1.annualPartB).toBe(3_108); // 259 x 12

    const top = irmaaFor(600_000);
    expect(top.tier).toBe(5);
    expect(top.annualSurcharge).toBe(6_356.4);
    expect(top.nextThreshold).toBeNull();
  });

  it('charges a couple twice off one MAGI figure', () => {
    const couple = irmaaFor(213_000, { filingStatus: 'mfj', beneficiaries: 2 });
    expect(couple.tier).toBe(1);
    expect(couple.beneficiaries).toBe(2);
    expect(couple.annualSurcharge).toBe(2 * 1_052.4);
    // Per-beneficiary figures stay per-beneficiary.
    expect(couple.partBMonthly).toBe(259);
    expect(couple.partBSurchargeMonthly).toBe(74);
  });

  it('inverts MAGI onto the chart’s other-income axis', () => {
    // Past the 85% cap the benefit is a fixed $20,155.20 of AGI, so the cliff
    // arrives that much earlier than its MAGI figure reads.
    expect(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS })).toBeCloseTo(106_000 - SS_CAP, 4);
    expect(irmaaMagi(
      { ordinaryIncome: otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS }), ssBenefit: SS },
    )).toBeCloseTo(
      106_000,
      4,
    );
    // With no benefit at all there is nothing to drag in, so it is 1:1.
    expect(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: 0 })).toBeCloseTo(106_000, 4);
    // Already over the threshold with no other income: clamp at zero.
    expect(otherIncomeAtIrmaaMagi(
      106_000,
      { ssBenefit: 0, filingStatus: 'single', muniInterest: 200_000 },
    )).toBe(0);
  });

  it('moves the cliff more than a dollar per dollar inside the torpedo', () => {
    // At the maximum benefit the 85% cap has not bound by $106,000 of MAGI, so
    // MAGI climbs at $1.85 per dollar earned and the first cliff arrives at
    // $56,405 of other income rather than $85,845.
    const x = otherIncomeAtIrmaaMagi(106_000, { ssBenefit: MAX_ANNUAL_SS_BENEFIT });
    expect(x).toBeCloseTo(56_404.97, 2);
    expect(irmaaMagi({ ordinaryIncome: x, ssBenefit: MAX_ANNUAL_SS_BENEFIT })).toBeCloseTo(106_000, 4);
    expect(x).toBeLessThan(otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS }));
  });

  it('shifts every cliff left by each dollar of tax-exempt interest', () => {
    const plain = irmaaCliffs({ ssBenefit: SS });
    const withMuni = irmaaCliffs(
      { ssBenefit: SS, filingStatus: 'single', muniInterest: 10_000 },
    );
    for (let i = 0; i < plain.length; i += 1) {
      expect(plain[i].otherIncome - withMuni[i].otherIncome).toBeCloseTo(10_000, 4);
    }
  });

  it('places the five cliffs with their annual cost', () => {
    const cliffs = irmaaCliffs({ ssBenefit: SS });
    expect(cliffs.map((c) => c.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(cliffs.map((c) => c.magi)).toEqual([
      106_000, 133_000, 167_000, 200_000, 500_000,
    ]);
    expect(cliffs[0].otherIncome).toBeCloseTo(85_844.8, 4);
    expect(cliffs[1].otherIncome).toBeCloseTo(112_844.8, 4);
    expect(cliffs[2].otherIncome).toBeCloseTo(146_844.8, 4);
    expect(cliffs.map((c) => c.annualSurcharge)).toEqual([
      1_052.4, 2_643.6, 4_234.8, 5_826, 6_356.4,
    ]);
    // The three middle cliffs cost exactly the same to cross.
    expect(cliffs.map((c) => c.step)).toEqual([
      1_052.4, 1_591.2, 1_591.2, 1_591.2, 530.4,
    ]);
    // A couple both on Medicare pays each step twice.
    expect(irmaaCliffs(
      { ssBenefit: SS, filingStatus: 'mfj', muniInterest: 0, beneficiaries: 2 },
    ).map((c) => c.step)).toEqual([
      2_104.8, 3_182.4, 3_182.4, 3_182.4, 1_060.8,
    ]);
  });

  it('dwarfs the income tax on the dollar that crosses it', () => {
    // One dollar over the tier-1 threshold costs $1,052.40 of Medicare premium
    // on top of whatever the income tax takes — a marginal rate of six figures
    // on that dollar, and the reason the cliff is worth drawing at all.
    const x = otherIncomeAtIrmaaMagi(106_000, { ssBenefit: SS });
    const incomeTaxOnTheDollar = totalTax({ ordinaryIncome: x + 1, ssBenefit: SS }) - totalTax(
      { ordinaryIncome: x, ssBenefit: SS },
    );
    expect(incomeTaxOnTheDollar).toBeLessThan(1);
    expect(irmaaFor(irmaaMagi({ ordinaryIncome: x + 1, ssBenefit: SS })).annualSurcharge).toBe(1_052.4);
    expect(irmaaFor(irmaaMagi({ ordinaryIncome: x - 1, ssBenefit: SS })).annualSurcharge).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSION_MEASURE_LABELS,
  ConversionCeiling,
  ConversionCeilingId,
  conversionCeilings,
  conversionMeasureValue,
  maxConversionUnder,
  sizeConversion,
} from './conversion';
import {
  FilingStatus,
  SS_BASES,
  TAX_YEAR_PARAMS,
  TaxYear,
  acaMagi,
  filingParams,
  irmaaFirstCliffMagi,
  niitFor,
  totalFederalTax,
  totalTax,
} from '../utils/tax';

/**
 * The tests that came off the shelf with the conversion ceilings.
 *
 * Every dollar figure is a 2025 one unless the describe says otherwise, and
 * scenarios that do not name a year inherit `defaultTaxYear()` — which follows
 * the calendar, so the clock is pinned here rather than letting January
 * re-point these assertions at a different Rev. Proc.
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

/** Shorthand for the pinned year's figures, which most assertions read. */
const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].avgAnnualSSBenefit;

describe('Roth conversion sizing', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  const ceiling = (id: ConversionCeilingId, filingStatus: FilingStatus = 'single'): ConversionCeiling => {
    const found = conversionCeilings({ filingStatus }).find((c) => c.id === id);
    if (!found) throw new Error(`no ceiling ${id}`);
    return found;
  };

  it('takes its ceiling amounts from the same tables the charts use', () => {
    const single = conversionCeilings({ filingStatus: 'single' });
    expect(single.map((c) => c.id)).toEqual([
      'bracket12',
      'bracket22',
      'ss50',
      'ss85',
      'ltcg0',
      'irmaa1',
    ]);
    expect(ceiling('bracket12').amount).toBe(48_475);
    expect(ceiling('bracket22').amount).toBe(103_350);
    expect(ceiling('ss50').amount).toBe(SS_BASES.single.ssBase50);
    expect(ceiling('ss85').amount).toBe(SS_BASES.single.ssBase85);
    expect(ceiling('ltcg0').amount).toBe(filingParams(PINNED_YEAR, 'single').ltcgBrackets[0].upTo);
    expect(ceiling('irmaa1').amount).toBe(irmaaFirstCliffMagi({ filingStatus: 'single' }));

    expect(ceiling('bracket12', 'mfj').amount).toBe(96_950);
    expect(ceiling('ss85', 'mfj').amount).toBe(44_000);
    expect(ceiling('irmaa1', 'mfj').amount).toBe(212_000);
  });

  it('sizes a conversion to the top of the 12% bracket, net of the SS drag', () => {
    // Single, $30,000 ordinary income, average benefit. Taxable SS starts at
    // $11,177.60, so taxable income starts at 30,000 + 11,177.60 - 15,750 =
    // $25,427.60 and the raw headroom under $48,475 is $23,047.40. Only
    // $14,069 of it is usable: the first $10,561 of conversion also drags in
    // 85 cents of benefits per dollar, until the 85% cap ($20,155.20) binds.
    expect(maxConversionUnder(
      ceiling('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    )).toBe(14_069);
    expect(
      conversionMeasureValue(
        'ordinaryTaxableIncome',
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0 },
        14_069,
      ),
    ).toBeCloseTo(48_474.2, 2);
    expect(
      conversionMeasureValue(
        'ordinaryTaxableIncome',
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0 },
        14_070,
      ),
    ).toBeGreaterThan(48_475);
  });

  it('sizes a conversion straight up to a provisional-income ceiling', () => {
    // No other income, so provisional income is half the benefit ($11,856) and
    // every converted dollar adds exactly one dollar of provisional income.
    expect(maxConversionUnder(ceiling('ss50'), { ordinaryIncome: 0, ssBenefit: SS })).toBe(25_000 - 11_856);
    expect(maxConversionUnder(ceiling('ss85'), { ordinaryIncome: 0, ssBenefit: SS })).toBe(34_000 - 11_856);
    expect(maxConversionUnder(
      ceiling('ss50', 'mfj'),
      { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'mfj' },
    )).toBe(32_000 - 11_856);
  });

  it('counts planned capital gains against the 0% capital-gains ceiling', () => {
    // $20,000 ordinary + $30,000 of gains, no benefits: total taxable income is
    // 50,000 - 15,750 = $34,250, leaving $14,100 under the $48,350 top of the
    // 0% bracket.
    expect(maxConversionUnder(
      ceiling('ltcg0'),
      { ordinaryIncome: 20_000, ssBenefit: 0, ltcg: 30_000 },
    )).toBe(14_100);
    // Without the gains the same ceiling leaves far more room.
    expect(maxConversionUnder(
      ceiling('ltcg0'),
      { ordinaryIncome: 20_000, ssBenefit: 0, ltcg: 0 },
    )).toBe(44_100);
  });

  it('measures the IRMAA ceiling against MAGI, which includes taxable benefits', () => {
    // $50,000 ordinary + $40,000 of benefits: the 85% cap ($34,000) already
    // binds, so MAGI is 84,000 + conversion and $22,000 fits under $106,000.
    expect(maxConversionUnder(
      ceiling('irmaa1'),
      { ordinaryIncome: 50_000, ssBenefit: 40_000 },
    )).toBe(22_000);
    expect(conversionMeasureValue(
      'magi',
      { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0 },
      22_000,
    )).toBe(106_000);
  });

  it('returns zero when the scenario is already over the ceiling', () => {
    const sizing = sizeConversion(
      ceiling('ss50'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    );
    expect(sizing.conversion).toBe(0);
    expect(sizing.alreadyOver).toBe(true);
    expect(sizing.headroom).toBeCloseTo(-16_856, 6);
    expect(sizing.taxCost).toBe(0);
    expect(sizing.costPerDollar).toBe(0);
  });

  it('flags a ceiling the search bound never reaches', () => {
    const sizing = sizeConversion(
      ceiling('bracket22'),
      { ordinaryIncome: 0, ssBenefit: 0, ltcg: 0, filingStatus: 'single', seniors: 0 },
      1_000,
    );
    expect(sizing.conversion).toBe(1_000);
    expect(sizing.unbounded).toBe(true);
    expect(sizeConversion(ceiling('bracket22'), { ordinaryIncome: 0, ssBenefit: 0 }).unbounded).toBe(false);
  });

  it('prices the conversion and the rate on the far side of the ceiling', () => {
    const sizing = sizeConversion(
      ceiling('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS },
    );
    expect(sizing.conversion).toBe(14_069);
    expect(sizing.taxBefore).toBe(2_813);
    expect(sizing.taxAfter).toBe(5_578);
    expect(sizing.taxCost).toBe(2_765);
    expect(sizing.taxAfter - sizing.taxBefore).toBe(sizing.taxCost);
    // 19.65 cents per dollar converted while nominally "in the 12% bracket" —
    // the torpedo is dragging benefits in alongside the conversion.
    expect(sizing.costPerDollar).toBeCloseTo(19.65, 2);
    // Past the top of the 12% bracket the benefits are capped, so the rate is
    // the plain 22% statutory bracket rather than 1.85x it.
    expect(sizing.rateAboveCeiling).toBe(22);
  });

  it('lands exactly on every ceiling, for both filing statuses', () => {
    const scenarios = [
      { ordinary: 0, ss: 0, ltcg: 0 },
      { ordinary: 30_000, ss: SS, ltcg: 0 },
      { ordinary: 12_000, ss: 61_296, ltcg: 40_000 },
      { ordinary: 60_000, ss: 30_000, ltcg: 10_000 },
    ];
    const failures: string[] = [];
    for (const filingStatus of ['single', 'mfj'] as FilingStatus[]) {
      for (const c of conversionCeilings({ filingStatus })) {
        for (const { ordinary, ss, ltcg } of scenarios) {
          const sizing = sizeConversion(
            c,
            { ordinaryIncome: ordinary, ssBenefit: ss, ltcg, filingStatus },
          );
          const at = (conversion: number) =>
            conversionMeasureValue(
              c.measure,
              { ordinaryIncome: ordinary, ssBenefit: ss, ltcg, filingStatus },
              conversion,
            );
          const where = `${filingStatus}/${c.id}/ordinary=${ordinary}`;

          if (sizing.alreadyOver) {
            if (sizing.conversion !== 0 || at(0) <= c.amount) {
              failures.push(`${where}: flagged already-over but ${at(0)} <= ${c.amount}`);
            }
            continue;
          }
          if (sizing.unbounded) {
            failures.push(`${where}: unexpectedly unbounded`);
            continue;
          }
          // The answer fits, and one more dollar does not.
          if (at(sizing.conversion) > c.amount + 1e-6) {
            failures.push(`${where}: ${sizing.conversion} overshoots (${at(sizing.conversion)} > ${c.amount})`);
          }
          if (at(sizing.conversion + 1) <= c.amount) {
            failures.push(`${where}: ${sizing.conversion} undershoots (one more dollar still fits)`);
          }
          // Converting can never reduce the tax bill.
          if (sizing.taxCost < 0) {
            failures.push(`${where}: negative tax cost ${sizing.taxCost}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/**
 * Sizing a conversion against a return that already holds a gain.
 *
 * A conversion is ordinary income and so is never itself net investment
 * income — which is exactly why sizing one has to price the surtax: the
 * conversion pushes MAGI up and drags somebody's old gain in behind it. The
 * 1411 chapter itself stayed in `tax.ts`, because `totalFederalTax` is a
 * figure the page prints; what moved here is the conversion's use of it.
 */
describe('sizing a conversion against the 1411 surtax', () => {
  const YEAR = { year: PINNED_YEAR };

  /**
   * A conversion is ordinary income and so is never itself net investment
   * income — which is exactly why sizing one has to price the surtax: the
   * conversion pushes MAGI up and drags somebody's old gain in behind it.
   */
  describe('sizing a conversion against it', () => {
    const scenario = {
      ordinaryIncome: 150_000,
      ltcg: 60_000,
      ssBenefit: 0,
      filingStatus: 'single' as const,
      ...YEAR,
    };

    it('prices the surtax into the bill a conversion starts from', () => {
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'irmaa1')!;
      const sizing = sizeConversion(ceiling, scenario);
      expect(sizing.taxBefore).toBe(Math.round(totalFederalTax(scenario)));
      expect(sizing.taxBefore - Math.round(totalTax(scenario))).toBe(380);
      // MAGI is $210,000, so $10,000 of the $60,000 gain is already surtaxed.
      expect(niitFor(scenario).base).toBe(10_000);
    });

    it('reports the 3.8 points in the rate just past the ceiling', () => {
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'bracket22')!;
      expect(sizeConversion(ceiling, scenario).rateAboveCeiling).toBeCloseTo(27.8, 6);
    });
  });
});

/**
 * Sizing a conversion against the 400% poverty line.
 *
 * Every figure here is a 2026 one, because 2026 is the first year since 2020
 * that has a cliff at all — ARPA section 9661, extended through 2025 by the
 * Inflation Reduction Act, took the 400% ceiling out of 36B(c)(1)(A) and let
 * the credit taper past it instead. So `fpl400` is the one ceiling that can be
 * absent from the list, and the assertions below that omit a year are
 * asserting on that absence.
 */
describe('sizing a conversion against the 400% poverty line', () => {
  const CLIFF_YEAR: TaxYear = 2026;
  const Y26 = { year: CLIFF_YEAR };
  /** The 2026 average benefit, $24,852 — not `AVG_ANNUAL_SS_BENEFIT`, which is 2025's. */
  const SS = TAX_YEAR_PARAMS[CLIFF_YEAR].avgAnnualSSBenefit;
  /** 400% of the one-person line: 4 × $15,650. */
  const CLIFF = 62_600;

  describe('as a line a conversion can be sized against', () => {
    it('joins the ceilings in a year with a cliff and is absent from one without', () => {
      const ids = (year: TaxYear): ConversionCeilingId[] =>
        conversionCeilings({ year }).map((c) => c.id);
      expect(ids(2026)).toContain('fpl400');
      expect(ids(2025)).not.toContain('fpl400');
      // Every other ceiling is offered in both years, so this is the only id a
      // reader's pick can be retired by switching year.
      expect(ids(2025)).toEqual(ids(2026).filter((id) => id !== 'fpl400'));

      const ceiling = conversionCeilings(Y26).find((c) => c.id === 'fpl400')!;
      expect(ceiling.measure).toBe('acaMagi');
      expect(ceiling.amount).toBe(CLIFF);
      expect(CONVERSION_MEASURE_LABELS.acaMagi).toBe('household income (36B MAGI)');
    });

    it('measures the conversion against household income, benefit and all', () => {
      const scenario = { ordinaryIncome: 30_000, ssBenefit: SS, ...Y26 };
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'fpl400')!;
      // $62,600 less the $24,852 benefit less the $30,000 already there. The
      // headroom is exact rather than searched-for, because nothing about this
      // measure bends.
      expect(maxConversionUnder(ceiling, scenario)).toBe(7_748);
      expect(conversionMeasureValue('acaMagi', scenario, 7_748)).toBeCloseTo(CLIFF, 6);

      const sizing = sizeConversion(ceiling, scenario);
      expect(sizing.conversion).toBe(7_748);
      expect(sizing.alreadyOver).toBe(false);
      expect(sizing.unbounded).toBe(false);
      // What the dollar past the line costs in income tax is a bracket rate.
      // What it actually costs is a year of premium tax credit, which depends
      // on ages and county and so is nowhere in these figures.
      expect(sizing.rateAboveCeiling).toBeGreaterThan(0);
      expect(sizing.taxCost).toBeGreaterThan(0);
    });

    it('reports nothing fits once household income is already over the line', () => {
      const scenario = { ordinaryIncome: 80_000, ssBenefit: SS, ...Y26 };
      const ceiling = conversionCeilings(scenario).find((c) => c.id === 'fpl400')!;
      expect(acaMagi(scenario)).toBeGreaterThan(CLIFF);
      expect(maxConversionUnder(ceiling, scenario)).toBe(0);
      expect(sizeConversion(ceiling, scenario).alreadyOver).toBe(true);
    });
  });
});

/**
 * The extra deduction moves some ceilings and not others, which is the whole
 * reason a ceiling carries its `measure` rather than just an amount.
 */
describe('against the age 65+ additional standard deduction', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('leaves provisional-income ceilings alone but widens taxable-income ones', () => {
    const ceilingFor = (id: ConversionCeilingId, fs: FilingStatus = 'single') =>
      conversionCeilings({ filingStatus: fs }).find((c) => c.id === id) as ConversionCeiling;
    // Provisional income is measured before any deduction, so the addition
    // buys no extra room at all against the SS bases.
    expect(maxConversionUnder(
      ceilingFor('ss50'),
      { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    )).toBe(
      maxConversionUnder(
        ceilingFor('ss50'),
        { ordinaryIncome: 0, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
      ),
    );
    // The top of the 12% bracket is measured against taxable income, and the
    // 85% cap already binds by then, so the room grows dollar for dollar with
    // the $8,000 of extra deduction.
    expect(maxConversionUnder(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
    )).toBe(14_069);
    expect(maxConversionUnder(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    )).toBe(22_069);
  });

  it('prices a conversion more cheaply for a filer over 65', () => {
    const ceilingFor = (id: ConversionCeilingId) =>
      conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === id) as ConversionCeiling;
    const sizing = sizeConversion(
      ceilingFor('bracket12'),
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    );
    expect(sizing.conversion).toBe(22_069);
    expect(sizing.taxBefore).toBe(1_853);
    // Both scenarios end at the top of the 12% bracket, so the tax after is the
    // same $5,578 — the over-65 filer simply gets $8,000 more converted for it.
    expect(sizing.taxAfter).toBe(5_578);
    expect(sizing.taxCost).toBe(3_725);
    expect(sizing.costPerDollar).toBeCloseTo(16.88, 2);
    // The conversion stops short of the $75,000 MAGI phaseout threshold, so the
    // dollar past the ceiling is taxed at the plain bracket rate.
    expect(sizing.rateAboveCeiling).toBe(22);
  });
});

/**
 * The one ceiling whose room is not linear in the deduction behind it: every
 * converted dollar past $75,000 of MAGI burns 6 cents of the deduction that
 * was making room for it.
 */
describe('against the OBBBA senior deduction phaseout', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT;

  it('prices the phaseout into a conversion ceiling and the rate past it', () => {
    const ceiling = conversionCeilings({ filingStatus: 'single' }).find(
      (c) => c.id === 'bracket22',
    ) as ConversionCeiling;
    const plain = sizeConversion(
      ceiling,
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0 },
    );
    const senior = sizeConversion(
      ceiling,
      { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 1 },
    );
    expect(plain.conversion).toBe(68_944);
    expect(plain.rateAboveCeiling).toBe(24);
    // $8,000 more deduction would buy $76,944 of room, but every converted
    // dollar above $75,000 of MAGI burns 6 cents of that deduction, so the
    // ceiling arrives $2,949 early - and the next dollar costs 25.44%.
    expect(senior.conversion).toBe(73_995);
    expect(senior.rateAboveCeiling).toBe(25.44);
  });
});

/**
 * Tax-exempt interest is the input that moves three of the five measures and
 * leaves the other two alone, so it is the sharpest test of which definition
 * each ceiling is written against.
 */
describe('against tax-exempt interest', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712
  const ceiling = (id: ConversionCeilingId): ConversionCeiling => {
    const found = conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === id);
    if (!found) throw new Error(`no ceiling ${id}`);
    return found;
  };

  it('is added back for the IRMAA MAGI ceiling but not for AGI', () => {
    // $50,000 ordinary + $22,000 converted + $40,000 of benefits: the 85% cap
    // binds, so AGI is $106,000. Medicare adds tax-exempt interest back.
    expect(conversionMeasureValue(
      'magi',
      { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0 },
      22_000,
    )).toBe(106_000);
    expect(
      conversionMeasureValue(
        'magi',
        { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 10_000 },
        22_000,
      ),
    ).toBe(116_000);
    // So $10,000 of muni interest costs exactly $10,000 of conversion room.
    expect(maxConversionUnder(
      ceiling('irmaa1'),
      { ordinaryIncome: 50_000, ssBenefit: 40_000 },
    )).toBe(22_000);
    expect(
      maxConversionUnder(
        ceiling('irmaa1'),
        { ordinaryIncome: 50_000, ssBenefit: 40_000, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 10_000 },
        1_000_000,
      ),
    ).toBe(12_000);
  });

  it('eats provisional-income headroom dollar for dollar', () => {
    // Provisional income is 5,000 + conversion + 11,856, so $8,144 fits under
    // the $25,000 base amount - $2,000 less with $2,000 of muni interest.
    expect(maxConversionUnder(ceiling('ss50'), { ordinaryIncome: 5_000, ssBenefit: SS })).toBe(8_144);
    expect(
      maxConversionUnder(
        ceiling('ss50'),
        { ordinaryIncome: 5_000, ssBenefit: SS, ltcg: 0, filingStatus: 'single', seniors: 0, muniInterest: 2_000 },
        1_000_000,
      ),
    ).toBe(6_144);
  });
});

/** A separate return that lived with the spouse: $0 bases, and tier 4 first. */
describe('on a separate return', () => {
  const SS = AVG_ANNUAL_SS_BENEFIT; // $23,712

  it('names the right IRMAA ceiling and collapses the two SS ceilings', () => {
    const ceilings = conversionCeilings({ filingStatus: 'mfs' });
    const irmaa = ceilings.find((c) => c.id === 'irmaa1')!;
    expect(irmaa.label).toBe('IRMAA tier 4 (Medicare surcharge)');
    expect(irmaa.amount).toBe(106_000);
    expect(conversionCeilings({ filingStatus: 'single' }).find((c) => c.id === 'irmaa1')!.label).toBe(
      'IRMAA tier 1 (Medicare surcharge)',
    );
    // Both Social Security ceilings are $0, so neither can be sized against.
    for (const id of ['ss50', 'ss85'] as ConversionCeilingId[]) {
      const ceiling = ceilings.find((c) => c.id === id)!;
      expect(ceiling.amount).toBe(0);
      expect(ceiling.note).toContain('separate return');
      const sized = sizeConversion(
        ceiling,
        { ordinaryIncome: 30_000, ssBenefit: SS, ltcg: 0, filingStatus: 'mfs' },
      );
      expect(sized.alreadyOver).toBe(true);
      expect(sized.conversion).toBe(0);
      // Provisional income is already other income plus half the benefit.
      expect(sized.headroom).toBeCloseTo(-(30_000 + SS / 2), 6);
    }
  });
});

describe('on a head-of-household return', () => {
  it('prices the conversion ceilings off its own figures', () => {
    const amounts = Object.fromEntries(
      conversionCeilings({ filingStatus: 'hoh', year: 2025 }).map((c) => [c.id, c.amount]),
    );
    expect(amounts).toEqual({
      bracket12: 64_850,
      bracket22: 103_350,
      ss50: 25_000,
      ss85: 34_000,
      ltcg0: 64_750,
      irmaa1: 106_000,
    });
  });
});

/**
 * Every ceiling is read out of `tax.ts` at the scenario's year, so the list is
 * one year's thresholds rather than a snapshot of 2025. The two Social
 * Security bases are the exception that proves it: 86(c) indexes nothing, so
 * they are the only amounts here that hold still.
 */
describe('across the two tax years', () => {
  const amount = (year: TaxYear, id: ConversionCeilingId): number =>
    conversionCeilings({ year }).find((c) => c.id === id)!.amount;

  it('holds the Social Security ceilings still while the others move', () => {
    expect(amount(2026, 'ss50')).toBe(amount(2025, 'ss50'));
    expect(amount(2026, 'ss85')).toBe(amount(2025, 'ss85'));
    expect(amount(2025, 'bracket12')).toBe(48_475);
    expect(amount(2026, 'bracket12')).toBe(50_400);
    expect(amount(2025, 'ltcg0')).toBe(48_350);
    expect(amount(2026, 'ltcg0')).toBe(49_450);
  });

  it('follows the selected year to Medicare’s first cliff, not 2025’s', () => {
    expect(amount(2025, 'irmaa1')).toBe(106_000);
    expect(amount(2026, 'irmaa1')).toBe(109_000);
  });
});

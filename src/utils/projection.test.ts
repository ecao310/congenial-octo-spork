import {
  QCD_FIRST_CERTAIN_AGE,
  RMD_AGE_BEFORE_SECURE_2,
  RMD_RESERVED_BIRTH_YEAR,
  UNIFORM_LIFETIME_DIVISORS,
  projectFilingParams,
  projectQcdLimit,
  projectYearParams,
  projectYears,
  qcdInYear,
  rmdApplicableAge,
  rmdDivisor,
} from './projection';
import {
  QCD_MIN_AGE,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_LAST_YEAR,
  SS_BASES,
  TAX_YEARS,
  avgAnnualSSBenefit,
  filingParams,
  hasPublishedParams,
  publishedAnchorYear,
  qcdAnnualLimit,
  taxableSocialSecurity,
  totalTax,
} from './tax';

describe('rmdApplicableAge', () => {
  it('is 73 for 1951 through 1958 and 75 from 1960 on', () => {
    // 1.401(a)(9)-2(b)(2)(iv) and (vi).
    expect(rmdApplicableAge(1951)).toBe(73);
    expect(rmdApplicableAge(1958)).toBe(73);
    expect(rmdApplicableAge(1960)).toBe(75);
    expect(rmdApplicableAge(1975)).toBe(75);
  });

  it('follows the proposed regulations for the reserved 1959 birth year', () => {
    // The statute gives someone born in 1959 both ages: they attain 72 after
    // 2022 and 73 before 2033 (so 73), and attain 74 after 2032 (so 75). The
    // final regulations reserved the paragraph; REG-103529-23 proposes 73.
    expect(RMD_RESERVED_BIRTH_YEAR).toBe(1959);
    expect(rmdApplicableAge(RMD_RESERVED_BIRTH_YEAR)).toBe(73);
    // Which is to say it groups with the year below it, not the year above.
    expect(rmdApplicableAge(1959)).toBe(rmdApplicableAge(1958));
    expect(rmdApplicableAge(1959)).not.toBe(rmdApplicableAge(1960));
  });

  it('is 72 for anyone born before 1951', () => {
    // SECURE 2.0 section 107 raised the age; these birth years predate it.
    expect(RMD_AGE_BEFORE_SECURE_2).toBe(72);
    expect(rmdApplicableAge(1950)).toBe(RMD_AGE_BEFORE_SECURE_2);
    expect(rmdApplicableAge(1940)).toBe(RMD_AGE_BEFORE_SECURE_2);
  });
});

describe('the Uniform Lifetime Table', () => {
  it('matches Table 2 to 1.401(a)(9)-9(c) at its published rows', () => {
    expect(UNIFORM_LIFETIME_DIVISORS[72]).toBe(27.4);
    expect(UNIFORM_LIFETIME_DIVISORS[73]).toBe(26.5);
    expect(UNIFORM_LIFETIME_DIVISORS[75]).toBe(24.6);
    expect(UNIFORM_LIFETIME_DIVISORS[80]).toBe(20.2);
    expect(UNIFORM_LIFETIME_DIVISORS[90]).toBe(12.2);
    expect(UNIFORM_LIFETIME_DIVISORS[100]).toBe(6.4);
    expect(UNIFORM_LIFETIME_DIVISORS[120]).toBe(2.0);
  });

  it('runs 72 to 120 with no gaps and never rises with age', () => {
    for (let age = 72; age <= 120; age += 1) {
      expect(UNIFORM_LIFETIME_DIVISORS[age]).toBeGreaterThan(0);
      if (age > 72) {
        expect(UNIFORM_LIFETIME_DIVISORS[age]).toBeLessThan(
          UNIFORM_LIFETIME_DIVISORS[age - 1],
        );
      }
    }
    expect(Object.keys(UNIFORM_LIFETIME_DIVISORS)).toHaveLength(49);
  });

  it('has no divisor below 72 and holds the last row past 120', () => {
    expect(rmdDivisor(71)).toBeNull();
    expect(rmdDivisor(72)).toBe(27.4);
    // The table's last row is printed "120+".
    expect(rmdDivisor(130)).toBe(2.0);
  });
});

describe('projectFilingParams', () => {
  const base2026 = filingParams(2026, 'single');

  it('returns the published figures untouched in the first year', () => {
    expect(projectFilingParams(base2026, 'single', 0, 2.5)).toBe(base2026);
  });

  it('rounds each increase down to the next lowest multiple of $50', () => {
    // IRC 1(f): the *increase* is rounded, not the result. $16,100 x 2.5% is
    // $402.50, which rounds down to $400.
    const next = projectFilingParams(base2026, 'single', 1, 2.5);
    expect(next.standardDeduction).toBe(16_500);
    // $12,400 x 2.5% = $310 -> $300.
    expect(next.brackets[0].upTo).toBe(12_700);
    // $2,050 x 2.5% = $51.25 -> $50.
    expect(next.additionalStdDeduction65).toBe(2_100);
  });

  it('rounds a separate return’s rate tables to $25 but not its deduction', () => {
    // 1(f)(7)(B) substitutes $25 for the rate tables of a separate filer, and
    // excludes 63(c)(4) — the standard deduction — from that substitution.
    const mfs = projectFilingParams(filingParams(2026, 'mfs'), 'mfs', 1, 2.5);
    // $12,400 x 2.5% = $310 -> $300 at a $25 step too, so reach for a band
    // where the two steps disagree: $105,700 x 2.5% = $2,642.50, which is
    // $2,625 at a $25 step and $2,600 at a $50 one.
    expect(mfs.brackets[2].upTo).toBe(108_325);
    expect(projectFilingParams(base2026, 'single', 1, 2.5).brackets[2].upTo).toBe(
      108_300,
    );
    // $16,100 x 2.5% = $402.50 -> $400 either way it is rounded, so the
    // deduction lands on the same figure as a single filer's.
    expect(mfs.standardDeduction).toBe(16_500);
  });

  it('leaves the open-ended top bracket open-ended', () => {
    const next = projectFilingParams(base2026, 'single', 30, 3);
    expect(next.brackets[next.brackets.length - 1].upTo).toBe(Infinity);
    expect(next.ltcgBrackets[next.ltcgBrackets.length - 1].upTo).toBe(Infinity);
  });

  it('leaves everything alone at zero inflation', () => {
    expect(projectFilingParams(base2026, 'single', 20, 0)).toEqual(base2026);
  });

  it('dates the projected year off the start year', () => {
    expect(projectYearParams(2026, 'single', 0, 2.5).year).toBe(2026);
    expect(projectYearParams(2026, 'single', 12, 2.5).year).toBe(2038);
  });
});

describe('anchoring on published figures', () => {
  it('reads a published year instead of indexing into it', () => {
    // 2025 + 1 is 2026, which Rev. Proc. 2025-32 has already priced. The
    // assumption is deliberately absurd to prove it is not consulted.
    for (const assumed of [0, 2.5, 40]) {
      expect(projectYearParams(2025, 'single', 1, assumed).filing).toBe(
        filingParams(2026, 'single'),
      );
    }
  });

  it('indexes only the years past the last published one', () => {
    // 2027 is one year past 2026, so it is 2026's $16,100 indexed once, not
    // 2025's $15,750 indexed twice. At 5% those are $450 apart; at 2.5% they
    // happen to land on the same figure, which is why the rate here is 5%.
    const from2025 = projectYearParams(2025, 'single', 2, 5).filing;
    expect(from2025).toEqual(projectYearParams(2026, 'single', 1, 5).filing);
    expect(from2025.standardDeduction).toBe(16_900);
    expect(
      projectFilingParams(filingParams(2025, 'single'), 'single', 2, 5)
        .standardDeduction,
    ).toBe(17_350);
  });

  it('publishes every year on file and nothing after', () => {
    expect(hasPublishedParams(2024)).toBe(false);
    expect(TAX_YEARS.every(hasPublishedParams)).toBe(true);
    expect(hasPublishedParams(TAX_YEARS[TAX_YEARS.length - 1] + 1)).toBe(false);
  });

  it('reports how far the published run reaches, and flags those rows', () => {
    const from2025 = projectYears({ ssBenefit: 20_000, year: 2025 }, {
      startYear: 2025,
      years: 5,
      colaPercent: 2.5,
    });
    expect(from2025.publishedThroughYear).toBe(2026);
    expect(from2025.rows.map((r) => r.figuresPublished)).toEqual([
      true, true, false, false, false,
    ]);

    // Started on the newest year on file, so the run is the first year alone
    // and the sliders own everything after it.
    const from2026 = projectYears({ ssBenefit: 20_000, year: 2026 }, {
      startYear: 2026,
      years: 5,
      colaPercent: 2.5,
    });
    expect(from2026.publishedThroughYear).toBe(2026);
    expect(from2026.startYear).toBe(2026);
  });

  it('leaves the taxable share perfectly still at a zero assumption', () => {
    // The reason the benefit is not anchored the same way the brackets are:
    // anchoring the brackets moves the tax but not provisional income, so the
    // section's control case survives it.
    const p = projectYears(
      { ordinaryIncome: 30_000, ssBenefit: 24_000, year: 2025 },
      { startYear: 2025, years: 5, colaPercent: 0, birthYear: 1970 },
    );
    expect(new Set(p.rows.map((r) => r.taxableSharePercent)).size).toBe(1);
    // The published 2026 deduction is the larger one, so the bill falls once.
    expect(p.rows[1].totalTax).toBeLessThan(p.rows[0].totalTax);
    expect(p.rows[2].totalTax).toBe(p.rows[1].totalTax);
  });

  it('anchors on the latest year at or below the target', () => {
    expect(publishedAnchorYear(2025)).toBe(2025);
    expect(publishedAnchorYear(2026)).toBe(2026);
    expect(publishedAnchorYear(2055)).toBe(TAX_YEARS[TAX_YEARS.length - 1]);
    // Below everything on file there is nothing to anchor on but the first.
    expect(publishedAnchorYear(1990)).toBe(TAX_YEARS[0]);
  });
});

describe('projectYears', () => {
  const scenario = {
    ordinaryIncome: 20_000,
    ssBenefit: avgAnnualSSBenefit(2026),
    filingStatus: 'single' as const,
    year: 2026 as const,
  };
  const flat = { startYear: 2026 as const, years: 30, colaPercent: 2.5, birthYear: 1955 };

  it('runs one row per year, starting at the start year', () => {
    const p = projectYears(scenario, { ...flat, years: 10 });
    expect(p.rows).toHaveLength(10);
    expect(p.rows.map((r) => r.year)).toEqual([
      2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
    ]);
    expect(p.startYear).toBe(2026);
    expect(p.endYear).toBe(2035);
    expect(p.first).toBe(p.rows[0]);
    expect(p.last).toBe(p.rows[9]);
  });

  it('prices the first year exactly as the rest of the app does', () => {
    const p = projectYears(scenario, flat);
    // With one difference: the scenario's age-65 toggle is ignored, because a
    // projection that knows the filer is 71 in 2026 has no use for it.
    const asOfNow = { ...scenario, seniors: 1 };
    expect(p.first.totalTax).toBe(Math.round(totalTax(asOfNow)));
    expect(p.first.taxableSS).toBe(Math.round(taxableSocialSecurity(asOfNow)));
    expect(p.first.rmd).toBe(0);
  });

  it('taxes a larger and larger share of the same real income', () => {
    const p = projectYears(scenario, flat);
    // Income, benefit, brackets and deduction all move together, so nothing
    // real changes for the filer. The only figure standing still is IRC 86(c).
    const shares = p.rows.map((r) => r.taxableSharePercent);
    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    }
    expect(shares[0]).toBeLessThan(20);
    expect(shares[shares.length - 1]).toBeGreaterThan(60);
    // And the tax rises in real terms, not just nominal.
    expect(p.last.realTotalTax).toBeGreaterThan(p.first.totalTax);
    expect(p.realTaxIncrease).toBe(p.last.realTotalTax - p.first.totalTax);
  });

  it('holds the share flat when the thresholds are the only frozen thing removed', () => {
    // A zero COLA and zero inflation freezes everything, thresholds included,
    // so the ratchet has nothing left to bite on.
    const p = projectYears(scenario, { ...flat, colaPercent: 0 });
    expect(new Set(p.rows.map((r) => r.taxableSharePercent)).size).toBe(1);
    // The tax still steps exactly once, and only where the law says it does:
    // the senior deduction expires after 2028 whatever inflation does.
    expect(new Set(p.rows.map((r) => r.totalTax)).size).toBe(2);
    expect(p.seniorDeductionEndsYear).toBe(2029);
    const before = p.rows.filter((r) => r.year <= 2028).map((r) => r.totalTax);
    const after = p.rows.filter((r) => r.year >= 2029).map((r) => r.totalTax);
    expect(new Set(before).size).toBe(1);
    expect(new Set(after).size).toBe(1);
  });

  it('reports no first-year multiple when the first year owed nothing', () => {
    const p = projectYears({ ...scenario, ordinaryIncome: 0 }, flat);
    expect(p.first.totalTax).toBe(0);
    expect(p.realTaxMultiple).toBeNull();
    expect(p.realTaxIncrease).toBe(p.last.realTotalTax);
  });

  it('switches required distributions on at the applicable age', () => {
    const p = projectYears(scenario, {
      ...flat,
      birthYear: 1955,
      traditionalBalance: 500_000,
      balanceGrowthPercent: 0,
    });
    expect(p.applicableAge).toBe(73);
    expect(p.firstRmdYear).toBe(2028);
    const before = p.rows.find((r) => r.year === 2027)!;
    const first = p.rows.find((r) => r.year === 2028)!;
    expect(before.rmd).toBe(0);
    expect(before.age).toBe(72);
    expect(first.age).toBe(73);
    // The first distribution is the prior year-end balance over the divisor for
    // the age reached that year: $500,000 / 26.5.
    expect(first.rmd).toBe(Math.round(500_000 / 26.5));
    expect(first.balance).toBe(Math.round(500_000 - 500_000 / 26.5));
    // And it lands in ordinary income on top of everything else. Every figure
    // is rounded from the unrounded one it was taxed on, so the parts can miss
    // the whole by a dollar.
    expect(first.ordinaryIncome).toBeGreaterThanOrEqual(first.otherIncome + first.rmd - 1);
    expect(first.ordinaryIncome).toBeLessThanOrEqual(first.otherIncome + first.rmd + 1);
  });

  it('pushes the same balance out four years later for a 1960 birth year', () => {
    const assumptions = { ...flat, traditionalBalance: 500_000, balanceGrowthPercent: 0 };
    const older = projectYears(scenario, { ...assumptions, birthYear: 1959 });
    const younger = projectYears(scenario, { ...assumptions, birthYear: 1960 });
    expect(older.applicableAge).toBe(73);
    expect(younger.applicableAge).toBe(75);
    expect(older.firstRmdYear).toBe(2032);
    expect(younger.firstRmdYear).toBe(2035);
    // Four more years of compounding, one year older on the table: the first
    // forced distribution is larger, and there is less time to head it off.
    expect(younger.rows.find((r) => r.year === 2035)!.rmd).toBe(
      Math.round(500_000 / 24.6),
    );
  });

  it('leaves the RMD out entirely when there is no balance to distribute', () => {
    const p = projectYears(scenario, { ...flat, traditionalBalance: 0 });
    expect(p.firstRmdYear).toBeNull();
    expect(p.rows.every((r) => r.rmd === 0)).toBe(true);
  });

  it('never distributes past the horizon for someone who never reaches the age', () => {
    // Born in 1975, still 60 at the end of a 2026 + 10 projection.
    const p = projectYears(scenario, {
      ...flat,
      years: 10,
      birthYear: 1975,
      traditionalBalance: 500_000,
    });
    expect(p.applicableAge).toBe(75);
    expect(p.firstRmdYear).toBeNull();
  });

  it('lets the senior deduction expire after 2028', () => {
    const p = projectYears({ ...scenario, seniors: 1 }, flat);
    // The age toggle is irrelevant: the projection knows the filer's age.
    expect(p.rows.find((r) => r.year === 2028)!.seniorDeduction).toBe(
      SENIOR_DEDUCTION,
    );
    expect(p.rows.find((r) => r.year === 2029)!.seniorDeduction).toBe(0);
    expect(p.seniorDeductionEndsYear).toBe(SENIOR_DEDUCTION_LAST_YEAR + 1);
    // Which shows up as a jump in tax that no amount of inflation explains.
    const y2028 = p.rows.find((r) => r.year === 2028)!;
    const y2029 = p.rows.find((r) => r.year === 2029)!;
    expect(y2029.deduction).toBeLessThan(y2028.deduction);
    expect(y2029.realTotalTax - y2028.realTotalTax).toBeGreaterThan(500);
  });

  it('starts the age-65 additions from the projected age, not the toggle', () => {
    // Born in 1965, so 61 in 2026 and 65 in 2030.
    const p = projectYears({ ...scenario, seniors: 0 }, { ...flat, birthYear: 1965 });
    const base = filingParams(2026, 'single').standardDeduction;
    expect(p.rows.find((r) => r.year === 2029)!.age).toBe(64);
    expect(p.rows.find((r) => r.year === 2029)!.deduction).toBeGreaterThanOrEqual(base);
    const before = p.rows.find((r) => r.year === 2029)!;
    const after = p.rows.find((r) => r.year === 2030)!;
    // The age-65 addition arrives; the senior deduction has already expired, so
    // the whole jump is 63(f)(1).
    expect(after.deduction - before.deduction).toBeGreaterThan(1_500);
    expect(after.seniorDeduction).toBe(0);
  });

  it('lets the 85% cap bind and then stops', () => {
    const p = projectYears({ ...scenario, ordinaryIncome: 60_000 }, flat);
    expect(p.fullyTaxedYear).toBe(2026);
    expect(p.rows.every((r) => r.taxableSharePercent === 85)).toBe(true);
    // Past the cap the ratchet is spent: there is no benefit left to drag in,
    // so once the senior deduction has expired the effective rate stops moving
    // altogether — the one flat line this whole section exists to contrast.
    const settled = p.rows
      .filter((r) => r.year >= 2029)
      .map((r) => r.effectiveRatePercent);
    // Flat to a hundredth of a point over twenty-seven years — all that is left
    // is the $50 rounding on each indexed bracket edge.
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.02);
  });

  it('never taxes a separate filer’s benefit at less than 42.5%', () => {
    // Both of the MFS bases are $0, so the torpedo is over before it starts and
    // there is no ratchet left for the frozen thresholds to drive.
    expect(SS_BASES.mfs).toEqual({ ssBase50: 0, ssBase85: 0 });
    const p = projectYears({ ...scenario, filingStatus: 'mfs' }, flat);
    expect(p.first.taxableSharePercent).toBe(85);
    expect(p.fullyTaxedYear).toBe(2026);
  });

  it('grows other income and tax-exempt interest with inflation', () => {
    const p = projectYears(
      { ...scenario, muniInterest: 10_000 },
      { ...flat, years: 11, colaPercent: 2, inflationPercent: 3 },
    );
    const tenth = p.rows[10];
    expect(tenth.otherIncome).toBe(Math.round(20_000 * 1.03 ** 10));
    expect(tenth.muniInterest).toBe(Math.round(10_000 * 1.03 ** 10));
    // The benefit follows the COLA instead, which here is the lower of the two.
    expect(tenth.ssBenefit).toBe(Math.round(avgAnnualSSBenefit(2026) * 1.02 ** 10));
    // Provisional income counts the tax-exempt interest in full.
    expect(tenth.provisionalIncome).toBeCloseTo(
      tenth.otherIncome + tenth.muniInterest + 0.5 * tenth.ssBenefit,
      -0.5,
    );
  });

  it('deflates the tax back to first-year dollars', () => {
    const p = projectYears(scenario, { ...flat, years: 11, colaPercent: 2.5 });
    const tenth = p.rows[10];
    expect(tenth.realTotalTax).toBeCloseTo(tenth.totalTax / 1.025 ** 10, -0.5);
    expect(p.first.realTotalTax).toBe(p.first.totalTax);
  });

  it('leaves capital gains out of a projection of recurring income', () => {
    const withGains = projectYears({ ...scenario, ltcg: 50_000 }, flat);
    const without = projectYears(scenario, flat);
    expect(withGains.rows).toEqual(without.rows);
  });
});

describe('the senior deduction ending', () => {
  const flat = { startYear: 2025 as const, years: 20, colaPercent: 2.5, birthYear: 1955 };

  it('reports the statutory expiry, not the income phaseout', () => {
    // 151(d)(5)'s phaseout thresholds are not indexed, so an income growing
    // with inflation walks off the end of the $75,000-$175,000 range on its
    // own. That takes the deduction to zero too — but 6 cents at a time, so
    // there is no step in the curve to point a reference line at. Only the
    // expiry is a step, and only the expiry gets reported.
    const p = projectYears(
      {
        ordinaryIncome: 147_000,
        ssBenefit: 30_000,
        filingStatus: 'single',
        seniors: 1,
        year: 2025,
      },
      flat,
    );
    expect(p.rows.find((r) => r.year === 2025)!.seniorDeduction).toBeGreaterThan(0);
    expect(p.rows.find((r) => r.year === 2026)!.seniorDeduction).toBe(0);
    expect(p.seniorDeductionEndsYear).toBeNull();
  });

  it('reports nothing when there was never a deduction to lose', () => {
    // Born in 1965, so 60 in 2025 and not 65 until 2030 — two years after the
    // provision it would have qualified for had already expired.
    const p = projectYears(
      { ordinaryIncome: 20_000, ssBenefit: 30_000, filingStatus: 'single', year: 2025 },
      { ...flat, birthYear: 1965 },
    );
    expect(p.rows.every((r) => r.seniorDeduction === 0)).toBe(true);
    expect(p.seniorDeductionEndsYear).toBeNull();
  });

  it('reports nothing when the horizon stops before the expiry', () => {
    const p = projectYears(
      { ordinaryIncome: 20_000, ssBenefit: 30_000, filingStatus: 'single', year: 2025 },
      { ...flat, years: 4 },
    );
    expect(p.endYear).toBe(SENIOR_DEDUCTION_LAST_YEAR);
    expect(p.last.seniorDeduction).toBeGreaterThan(0);
    expect(p.seniorDeductionEndsYear).toBeNull();
  });
});

describe('projectQcdLimit', () => {
  it('reads the published limit for a published year and doubles it for a joint return', () => {
    // 408(d)(8)(A) caps the exclusion per individual, so a joint return where
    // both spouses give from their own IRA gets it twice.
    expect(projectQcdLimit(2026, 'single', 0, 2.5)).toBe(qcdAnnualLimit(2026));
    expect(projectQcdLimit(2026, 'mfj', 0, 2.5)).toBe(2 * qcdAnnualLimit(2026));
    // And a published year past the start year is read, not indexed into.
    expect(projectQcdLimit(2025, 'single', 1, 9)).toBe(qcdAnnualLimit(2026));
  });

  it('rounds the indexed limit to the nearest $1,000, not down to $50', () => {
    // 1.025^5 x $111,000 = $125,586, which 408(d)(8)(A) rounds up to $126,000.
    // IRC 1(f)'s rule would have rounded the *increase* down to $125,550.
    expect(projectQcdLimit(2026, 'single', 5, 2.5)).toBe(126_000);
    expect(projectQcdLimit(2026, 'mfj', 5, 2.5)).toBe(252_000);
  });

  it('holds still at zero inflation', () => {
    expect(projectQcdLimit(2026, 'single', 20, 0)).toBe(qcdAnnualLimit(2026));
  });
});

describe('qcdInYear', () => {
  const at = (age: number, balance: number, asked = 20_000, n = 0) =>
    qcdInYear(asked, age, balance, 2026, 'single', n, 0);

  it('waits for the first age a birth year can settle 70 1/2 at', () => {
    expect(QCD_FIRST_CERTAIN_AGE).toBe(Math.ceil(QCD_MIN_AGE));
    expect(QCD_FIRST_CERTAIN_AGE).toBe(71);
    // Someone born in January reaches 70 1/2 in the year they turn 70 and
    // someone born in December not until the year they turn 71, so this errs a
    // year late rather than letting half of them give a year early.
    expect(at(70, 500_000)).toBe(0);
    expect(at(71, 500_000)).toBe(20_000);
  });

  it('caps at the balance there is to give from', () => {
    expect(at(75, 8_000)).toBe(8_000);
    expect(at(75, 0)).toBe(0);
  });

  it('caps at the statutory limit', () => {
    expect(at(75, 5_000_000, 400_000)).toBe(qcdAnnualLimit(2026));
  });

  it('grows the gift with inflation', () => {
    expect(qcdInYear(20_000, 75, 5_000_000, 2026, 'single', 4, 2.5)).toBeCloseTo(
      20_000 * 1.025 ** 4,
      6,
    );
  });

  it('gives nothing when nothing was asked for', () => {
    expect(at(80, 500_000, 0)).toBe(0);
    expect(at(80, 500_000, -1)).toBe(0);
  });
});

describe('projectYears with a recurring charitable gift', () => {
  const scenario = {
    ordinaryIncome: 20_000,
    ssBenefit: avgAnnualSSBenefit(2026),
    filingStatus: 'single' as const,
    year: 2026 as const,
  };
  // Born 1955, so 71 in 2026 — old enough to give, two years short of the
  // applicable age of 73. Nothing indexed, so every figure is readable.
  const flat = {
    startYear: 2026 as const,
    years: 10,
    colaPercent: 0,
    birthYear: 1955,
    traditionalBalance: 500_000,
    balanceGrowthPercent: 0,
  };

  it('takes the gift out of the balance before anything is required to come out', () => {
    const p = projectYears(scenario, { ...flat, annualQcd: 20_000 });
    expect(p.firstQcdYear).toBe(2026);
    expect(p.firstRmdYear).toBe(2028);
    const first = p.rows[0];
    expect(first.age).toBe(71);
    expect(first.rmd).toBe(0);
    expect(first.qcd).toBe(20_000);
    expect(first.balance).toBe(480_000);
    // And none of it reaches the return: 408(d)(8) excludes it from gross
    // income, so ordinary income is the other income and nothing else.
    expect(first.ordinaryIncome).toBe(20_000);
    expect(first.taxableRmd).toBe(0);
  });

  it('lets the gift satisfy the required distribution without taxing it', () => {
    const p = projectYears(scenario, { ...flat, annualQcd: 20_000 });
    const first = p.rows.find((r) => r.year === 2028)!;
    // Two gifts have already come out, so the requirement is measured against
    // $460,000 rather than $500,000.
    expect(first.age).toBe(73);
    expect(first.rmd).toBe(Math.round(460_000 / 26.5));
    // The gift is larger than the requirement, so nothing of it is reportable
    // and the account gives up the gift rather than the sum of the two.
    expect(first.qcd).toBe(20_000);
    expect(first.taxableRmd).toBe(0);
    expect(first.ordinaryIncome).toBe(20_000);
    expect(first.balance).toBe(440_000);
  });

  it('reports only the part of the requirement the gift did not cover', () => {
    const p = projectYears(scenario, { ...flat, annualQcd: 5_000 });
    const row = p.rows.find((r) => r.year === 2028)!;
    const opening = row.openingBalance;
    expect(row.rmd).toBe(Math.round(opening / 26.5));
    expect(row.qcd).toBe(5_000);
    expect(row.taxableRmd).toBe(row.rmd - 5_000);
    expect(row.ordinaryIncome).toBe(20_000 + row.taxableRmd);
    // The requirement is larger than the gift, so the requirement is what left
    // the account.
    expect(row.balance).toBe(opening - row.rmd);
  });

  it('taxes less every year and less over the horizon than the same plan without it', () => {
    const withGift = projectYears(scenario, { ...flat, annualQcd: 20_000 });
    const without = projectYears(scenario, { ...flat, annualQcd: 0 });
    expect(without.totalQcd).toBe(0);
    expect(without.firstQcdYear).toBeNull();
    expect(withGift.totalQcd).toBe(10 * 20_000);
    // Nothing is indexed here, so the real total is the nominal one.
    expect(withGift.totalRealQcd).toBe(withGift.totalQcd);
    expect(withGift.lifetimeRealTax).toBeLessThan(without.lifetimeRealTax);
    // And the benefit itself is dragged less far into the base.
    expect(withGift.last.taxableSharePercent).toBeLessThan(
      without.last.taxableSharePercent,
    );
    for (const row of withGift.rows) {
      const other = without.rows.find((r) => r.year === row.year)!;
      expect(row.totalTax).toBeLessThanOrEqual(other.totalTax);
    }
  });

  it('sums the lifetime real tax out of the rows it reported', () => {
    const p = projectYears(scenario, { ...flat, colaPercent: 2.5, annualQcd: 0 });
    expect(p.lifetimeRealTax).toBe(
      p.rows.reduce((sum, row) => sum + row.realTotalTax, 0),
    );
  });

  it('deflates the charitable total the same way it deflates the tax', () => {
    const p = projectYears(scenario, { ...flat, colaPercent: 2.5, annualQcd: 10_000 });
    // The gift grows with inflation, so every year of it is the same $10,000 in
    // first-year dollars — and the nominal total is larger than the real one.
    expect(p.totalRealQcd).toBe(10 * 10_000);
    expect(p.totalQcd).toBeGreaterThan(p.totalRealQcd);
  });

  it('gives nothing when there is no IRA to give from', () => {
    const p = projectYears(scenario, {
      ...flat,
      traditionalBalance: 0,
      annualQcd: 20_000,
    });
    expect(p.totalQcd).toBe(0);
    expect(p.firstQcdYear).toBeNull();
    expect(p.rows.every((r) => r.qcd === 0)).toBe(true);
  });

  it('gives nothing before the horizon reaches the age', () => {
    // Born 1970, so 56 in 2026 and 65 at the end of a ten-year run.
    const p = projectYears(scenario, { ...flat, birthYear: 1970, annualQcd: 20_000 });
    expect(p.last.age).toBe(65);
    expect(p.totalQcd).toBe(0);
    expect(p.firstQcdYear).toBeNull();
  });

  it('stops when the balance runs out rather than overdrawing it', () => {
    const p = projectYears(scenario, {
      ...flat,
      traditionalBalance: 45_000,
      annualQcd: 20_000,
    });
    expect(p.rows[0].qcd).toBe(20_000);
    expect(p.rows[1].qcd).toBe(20_000);
    expect(p.rows[2].qcd).toBe(5_000);
    expect(p.rows[3].qcd).toBe(0);
    expect(p.totalQcd).toBe(45_000);
    expect(p.rows.every((r) => r.balance >= 0)).toBe(true);
  });
});

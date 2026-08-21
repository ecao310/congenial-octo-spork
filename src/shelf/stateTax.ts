import type { TaxYear } from '../utils/tax';
import { TAX_YEARS, defaultTaxYear } from '../utils/tax';

/**
 * State treatment of Social Security benefits — a lookup table, not a
 * calculation.
 *
 * Every other number in this app is computed. This one deliberately is not.
 * Nine states taxed benefits in some form for tax year 2025, and no two of them
 * do it the same way: Colorado runs off age bands, Connecticut caps the taxed
 * share at 25% of benefits *received* rather than of the federally taxable
 * amount, Minnesota offers two competing methods, Montana has no rule at all
 * and simply keeps whatever the federal worksheet produced, New Mexico and
 * Rhode Island are cliffs, Utah works through a credit against a flat rate
 * rather than a subtraction from income, and Vermont prorates. Modelling nine
 * of those wrong is worse than printing them and pointing at the source, so
 * this is text.
 *
 * `test` is keyed by year because two of these actually move: Minnesota indexes
 * its thresholds annually, and West Virginia's phase-out finishes in 2026,
 * which is why the count drops from nine states to eight between the two years
 * the app can select.
 */
export interface StateSSRule {
  /** Two-letter postal abbreviation. */
  abbr: string;
  state: string;
  /** How the state reaches the benefit — subtraction, credit, cliff, nothing. */
  mechanism: string;
  /** The rule in a sentence. */
  rule: string;
  /** The income test, per tax year, as display text. */
  test: Record<TaxYear, string>;
  /** Whether the state re-indexes its thresholds every year. */
  indexed: boolean;
  /**
   * First tax year the state stops taxing benefits at any income, or null if it
   * still taxes some of them. Only West Virginia has one.
   */
  exemptFrom: TaxYear | null;
  /** Where these figures came from. */
  source: string;
}

/**
 * The nine states that taxed Social Security benefits for tax year 2025, in
 * alphabetical order. Kansas, Missouri and Nebraska dropped out for 2024; West
 * Virginia drops out for 2026.
 */
export const STATE_SS_RULES: StateSSRule[] = [
  {
    abbr: 'CO',
    state: 'Colorado',
    mechanism: 'Subtraction, by age band',
    rule: 'From 65, the whole federally taxable benefit comes back out with no income test at all. From 55 to 64 it comes out only under the AGI limits; over them, benefits fall back inside the general $20,000 pension-and-annuity cap. Under 55 there is no subtraction.',
    test: {
      2025: '65+: none. 55–64: AGI ≤ $75,000 single, ≤ $95,000 joint',
      2026: '65+: none. 55–64: AGI ≤ $75,000 single, ≤ $95,000 joint',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'Colorado Income Tax Topics: Social Security, Pensions and Annuities; the 55–64 band was added by HB24-1142 for tax years from 2025',
  },
  {
    abbr: 'CT',
    state: 'Connecticut',
    mechanism: 'Deduction, capped at 25% taxed',
    rule: 'Under the AGI threshold the entire federally taxable benefit is deducted. At or above it the deduction shrinks, but never far enough to tax more than 25% of the benefits received — note that is 25% of the gross benefit, not of the 85% the federal worksheet let through.',
    test: {
      2025: 'Full: AGI < $75,000 single/separate, < $100,000 joint/HOH',
      2026: 'Full: AGI < $75,000 single/separate, < $100,000 joint/HOH',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'Conn. Gen. Stat. § 12-701(a)(20)(B)(x)(III)–(IV), as described in Connecticut OLR Report 2025-R-0152',
  },
  {
    abbr: 'MN',
    state: 'Minnesota',
    mechanism: 'Subtraction, phased out',
    rule: 'The simplified method subtracts the whole federally taxable benefit below the AGI threshold, then withdraws it 10% for every $4,000 of AGI above ($2,000 filing separately) — so it is fully gone $40,000 past the line. An older provisional-income method survives alongside it, and you take whichever is larger.',
    test: {
      2025: 'Full: AGI < $108,320 joint, < $84,490 single/HOH, < $54,160 separate',
      2026: 'Full: AGI < $110,780 joint, < $86,410 single/HOH, < $55,390 separate',
    },
    indexed: true,
    exemptFrom: null,
    source:
      'Minn. Stat. § 290.0132 subd. 26; figures from the Department of Revenue’s Tax Year 2026 Inflation-Adjusted Amounts',
  },
  {
    abbr: 'MT',
    state: 'Montana',
    mechanism: 'None — the federal amount flows straight through',
    rule: 'Montana starts from federal taxable income, and its list of adjustments has no line for Social Security. Whatever the federal worksheet taxed, Montana taxes — the torpedo lands here at full size. Its own benefit worksheet, which used to produce a different number, was repealed with the 2021 conformity rewrite effective for 2024.',
    test: {
      2025: 'No income test — the federally taxable amount, whatever it is',
      2026: 'No income test — the federally taxable amount, whatever it is',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'Mont. Code Ann. § 15-30-2120; former § 15-30-2110 repealed by Ch. 503, L. 2021',
  },
  {
    abbr: 'NM',
    state: 'New Mexico',
    mechanism: 'Exemption, cliff',
    rule: 'Below the cap the federally taxable benefit is exempt outright. A dollar over and the entire exemption disappears — no phase-out, no proration. A 2026 bill to replace the cliff with a gradual exemption died in committee.',
    test: {
      2025: 'AGI < $100,000 single, < $150,000 joint/HOH/surviving spouse, < $75,000 separate',
      2026: 'AGI < $100,000 single, < $150,000 joint/HOH/surviving spouse, < $75,000 separate',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'N.M. Stat. § 7-2-5.14; the caps were left in place when 2026 HB 92 was postponed indefinitely',
  },
  /*
   * The joint figure is the one number here that two Rhode Island publications
   * disagree on: the 2025 worksheet says $133,750, while PUB 2026-01 says
   * $133,500 throughout. $133,750 wins — the statute indexes the $80,000 and
   * $100,000 base amounts by one shared factor, so the joint limit is always
   * exactly 1.25x the single one ($107,000 x 1.25 = $133,750, and 2024's
   * $104,200 / $130,250 pair holds to the same ratio).
   */
  {
    abbr: 'RI',
    state: 'Rhode Island',
    mechanism: 'Modification, cliff plus an age test',
    rule: 'Two gates, both of which must open: you must have reached Social Security full retirement age, and federal AGI must be under the limit. Clear both and the whole federally taxable benefit is subtracted; miss either and none of it is. The worksheet says so in as many words — "STOP, you are not eligible".',
    test: {
      2025: 'AGI < $107,000 single/HOH/separate, < $133,750 joint; born on or before 03/01/1959',
      2026: 'Not published yet — Rhode Island indexes this modification a year behind its other tables, so 2025’s limits are the latest on file',
    },
    indexed: true,
    exemptFrom: null,
    source:
      'R.I. Gen. Laws § 44-30-12(c)(8); figures from the Division of Taxation’s 2025 Taxable Social Security Income Worksheet',
  },
  {
    abbr: 'UT',
    state: 'Utah',
    mechanism: 'Nonrefundable credit, phased out',
    rule: 'Utah taxes the benefit and then hands back a credit for the tax on it — the flat state rate times the benefit included in taxable income — so at low incomes it washes out. The credit falls 2.5¢ for every dollar of modified AGI over the threshold. Watch that "modified": Utah adds tax-exempt interest back in, so munis shrink this credit as well as feeding the federal torpedo.',
    test: {
      2025: 'Full credit: MAGI ≤ $54,000 single, ≤ $90,000 joint/HOH, ≤ $45,000 separate',
      2026: 'Full credit: MAGI ≤ $54,000 single, ≤ $90,000 joint/HOH, ≤ $45,000 separate',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'Utah Code § 59-10-1042, as amended by SB 71 (2025), retroactive to tax years from 2025',
  },
  {
    abbr: 'VT',
    state: 'Vermont',
    mechanism: 'Exemption, prorated',
    rule: 'The whole federally taxable benefit is exempt under the threshold, and the exempt share then falls in a straight line to zero across the next $10,000 of AGI — the exemption is (top of the range − AGI) ÷ $10,000, applied to the taxable benefit. No age test.',
    test: {
      2025: 'Full: AGI ≤ $55,000 single/HOH, ≤ $70,000 joint. Gone at $65,000 / $80,000',
      2026: 'Full: AGI ≤ $55,000 single/HOH, ≤ $70,000 joint. Gone at $65,000 / $80,000',
    },
    indexed: false,
    exemptFrom: null,
    source:
      'Vermont Department of Taxes, Social Security Exemption; thresholds raised for tax year 2025',
  },
  {
    abbr: 'WV',
    state: 'West Virginia',
    mechanism: 'Decreasing modification, phasing out',
    rule: 'Under the AGI threshold benefits have been fully exempt for years. Above it, the exempt share was phased in — 35% for 2024, 65% for 2025, 100% for 2026 — so from tax year 2026 West Virginia taxes no part of a benefit at any income, and the count of states that do drops from nine to eight.',
    test: {
      2025: 'AGI ≤ $50,000 single / $100,000 joint: exempt. Above: 65% exempt, so 35% still taxed',
      2026: 'Exempt at every income',
    },
    indexed: false,
    exemptFrom: 2026,
    source:
      'West Virginia Tax Division, Senior Citizen Social Security Modification; phase-out enacted by HB 4880 (2024)',
  },
];

/**
 * Whether one state still reaches some part of a benefit in the given tax
 * year.
 *
 * The condition is one comparison, but it is the condition that decides which
 * of two paragraphs a reader who named their state is shown, so it is worth
 * having in one place rather than spelled out again at the render layer.
 */
export function taxesBenefitsIn(
  rule: StateSSRule,
  year: TaxYear = defaultTaxYear(),
): boolean {
  return rule.exemptFrom === null || year < rule.exemptFrom;
}

/** The states that still tax some part of a benefit in the given tax year. */
export function statesTaxingSocialSecurity(
  year: TaxYear = defaultTaxYear(),
): StateSSRule[] {
  return STATE_SS_RULES.filter((rule) => taxesBenefitsIn(rule, year));
}

/**
 * One other selectable tax year whose income test reads differently from the
 * year on screen.
 */
export interface StateTestDelta {
  /** The year being compared against the one on screen. */
  year: TaxYear;
  /** That year's income test, as display text. */
  test: string;
  /** Whether that year falls before or after the one on screen. */
  direction: 'earlier' | 'later';
}

/**
 * Every selectable tax year whose income test differs from `year`'s, in year
 * order.
 *
 * The table prints one year at a time, which buries the contrast that the year
 * selector exists to show. Most of these state thresholds are as frozen as the
 * federal $25,000 and read identically whichever year is picked — but not all:
 * Minnesota re-indexes annually, Rhode Island indexes a year behind and has not
 * published the next set, and West Virginia's phase-out finishes. Those three
 * differences are invisible unless both years are on screen at once, so this
 * returns the other years' wording for the table to print beneath the
 * selected one.
 *
 * Comparison is on the display string, not on parsed figures. That is the
 * point: a state whose statute changed shape but kept its numbers still reads
 * differently, and a state that reprints the same sentence has not moved
 * regardless of what happened in its legislature.
 */
export function stateTestDeltas(
  rule: StateSSRule,
  year: TaxYear = defaultTaxYear(),
): StateTestDelta[] {
  return TAX_YEARS.filter(
    (other) => other !== year && rule.test[other] !== rule.test[year],
  ).map((other) => ({
    year: other,
    test: rule.test[other],
    direction: other < year ? 'earlier' : 'later',
  }));
}

/**
 * The states on `year`'s list whose income test differs in some other year the
 * app can price — the ones the table has to show twice.
 */
export function statesWithMovingTests(
  year: TaxYear = defaultTaxYear(),
): StateSSRule[] {
  return statesTaxingSocialSecurity(year).filter(
    (rule) => stateTestDeltas(rule, year).length > 0,
  );
}

/** Look one state up by postal abbreviation. Case-insensitive. */
export function stateSSRule(abbr: string): StateSSRule | undefined {
  const wanted = abbr.trim().toUpperCase();
  return STATE_SS_RULES.find((rule) => rule.abbr === wanted);
}

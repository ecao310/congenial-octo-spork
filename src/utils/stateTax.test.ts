import { describe, it, expect } from 'vitest';
import {
  STATE_SS_RULES,
  statesTaxingSocialSecurity,
  statesWithMovingTests,
  stateSSRule,
  stateTestDeltas,
  taxesBenefitsIn,
} from './stateTax';
import { TAX_YEARS } from './tax';

describe('state treatment of Social Security benefits', () => {
  it('lists the nine states that taxed benefits for 2025', () => {
    expect(statesTaxingSocialSecurity(2025).map((r) => r.abbr)).toEqual([
      'CO',
      'CT',
      'MN',
      'MT',
      'NM',
      'RI',
      'UT',
      'VT',
      'WV',
    ]);
  });

  /**
   * The predicate the footnote branches on: a reader who named West Virginia
   * and then moved the year is owed the sentence saying the phase-out
   * finished, so the rule has to stay lookup-able after it stops being on the
   * year's list.
   */
  it('answers per state and per year, and agrees with the list', () => {
    const wv = stateSSRule('WV')!;
    expect(taxesBenefitsIn(wv, 2025)).toBe(true);
    expect(taxesBenefitsIn(wv, 2026)).toBe(false);

    for (const year of TAX_YEARS) {
      const listed = new Set(
        statesTaxingSocialSecurity(year).map((r) => r.abbr),
      );
      for (const rule of STATE_SS_RULES) {
        expect(taxesBenefitsIn(rule, year), `${rule.abbr} ${year}`).toBe(
          listed.has(rule.abbr),
        );
      }
    }
  });

  it('drops West Virginia for 2026, leaving eight', () => {
    const abbrs = statesTaxingSocialSecurity(2026).map((r) => r.abbr);
    expect(abbrs).toHaveLength(8);
    expect(abbrs).not.toContain('WV');
    // Nothing else changes status between the two years.
    expect(abbrs).toEqual(
      statesTaxingSocialSecurity(2025)
        .map((r) => r.abbr)
        .filter((a) => a !== 'WV'),
    );
  });

  it('marks West Virginia as the only state with an end date', () => {
    const withEnd = STATE_SS_RULES.filter((r) => r.exemptFrom !== null);
    expect(withEnd.map((r) => r.abbr)).toEqual(['WV']);
    expect(withEnd[0].exemptFrom).toBe(2026);
  });

  it('carries a test string for every year the app can select', () => {
    for (const rule of STATE_SS_RULES) {
      for (const year of TAX_YEARS) {
        expect(rule.test[year], `${rule.abbr} ${year}`).toBeTruthy();
      }
    }
  });

  it('cites a source and names a mechanism for every state', () => {
    for (const rule of STATE_SS_RULES) {
      expect(rule.source, rule.abbr).toBeTruthy();
      expect(rule.mechanism, rule.abbr).toBeTruthy();
      expect(rule.rule.length, rule.abbr).toBeGreaterThan(40);
      expect(rule.abbr, rule.state).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('is sorted by state name, with unique abbreviations', () => {
    const names = STATE_SS_RULES.map((r) => r.state);
    expect(names).toEqual([...names].sort());
    expect(new Set(STATE_SS_RULES.map((r) => r.abbr)).size).toBe(
      STATE_SS_RULES.length,
    );
  });

  it('only claims annual indexing for Minnesota and Rhode Island', () => {
    expect(STATE_SS_RULES.filter((r) => r.indexed).map((r) => r.abbr)).toEqual([
      'MN',
      'RI',
    ]);
  });

  it('moves the thresholds of exactly the states that index them', () => {
    // A state that re-indexes must show different figures for the two years;
    // one that does not must show the same string, so a stale copy-paste in
    // either direction fails here.
    for (const rule of STATE_SS_RULES) {
      const moved = rule.test[2025] !== rule.test[2026];
      const shouldMove = rule.indexed || rule.exemptFrom !== null;
      expect(moved, `${rule.abbr} thresholds`).toBe(shouldMove);
    }
  });

  it('shows Minnesota’s 2025 and 2026 indexed thresholds', () => {
    const mn = stateSSRule('mn')!;
    expect(mn.test[2025]).toContain('$108,320');
    expect(mn.test[2025]).toContain('$84,490');
    expect(mn.test[2026]).toContain('$110,780');
    expect(mn.test[2026]).toContain('$86,410');
  });

  it('says Rhode Island’s 2026 limits are not published yet', () => {
    const ri = stateSSRule('RI')!;
    expect(ri.test[2025]).toContain('$133,750');
    expect(ri.test[2026]).toMatch(/not published/i);
  });

  it('looks a state up case-insensitively and misses cleanly', () => {
    expect(stateSSRule('ut')?.state).toBe('Utah');
    expect(stateSSRule(' Vt ')?.state).toBe('Vermont');
    expect(stateSSRule('CA')).toBeUndefined();
  });

  it('records Montana as having no state rule of its own', () => {
    const mt = stateSSRule('MT')!;
    expect(mt.mechanism).toMatch(/none/i);
    expect(mt.test[2025]).toMatch(/no income test/i);
  });
});

describe('year-over-year movement in the state tests', () => {
  it('reports no delta for a state whose rule is frozen', () => {
    const vt = stateSSRule('VT')!;
    for (const year of TAX_YEARS) {
      expect(stateTestDeltas(vt, year), `VT ${year}`).toEqual([]);
    }
  });

  it('reports Minnesota’s indexing in whichever direction is being viewed', () => {
    const mn = stateSSRule('MN')!;

    const from2025 = stateTestDeltas(mn, 2025);
    expect(from2025).toHaveLength(1);
    expect(from2025[0].year).toBe(2026);
    expect(from2025[0].direction).toBe('later');
    expect(from2025[0].test).toContain('$110,780');

    const from2026 = stateTestDeltas(mn, 2026);
    expect(from2026).toHaveLength(1);
    expect(from2026[0].year).toBe(2025);
    expect(from2026[0].direction).toBe('earlier');
    expect(from2026[0].test).toContain('$108,320');
  });

  it('surfaces Rhode Island’s unpublished year as the delta, not a blank', () => {
    // The 2026 cell says the figures do not exist yet, so the only place a
    // reader can see a Rhode Island number at all is the 2025 delta beneath it.
    const [delta] = stateTestDeltas(stateSSRule('RI')!, 2026);
    expect(delta.year).toBe(2025);
    expect(delta.test).toContain('$107,000');
    expect(delta.test).toContain('$133,750');
  });

  it('shows West Virginia’s phase-out completing, in the year it still taxes', () => {
    const wv = stateSSRule('WV')!;
    const [delta] = stateTestDeltas(wv, 2025);
    expect(delta.year).toBe(2026);
    expect(delta.test).toMatch(/exempt at every income/i);
  });

  it('never compares a year against itself', () => {
    for (const rule of STATE_SS_RULES) {
      for (const year of TAX_YEARS) {
        for (const delta of stateTestDeltas(rule, year)) {
          expect(delta.year, rule.abbr).not.toBe(year);
          expect(delta.test, rule.abbr).not.toBe(rule.test[year]);
        }
      }
    }
  });

  it('flags three moving states for 2025 and two for 2026', () => {
    // West Virginia moves — it stops taxing — but by 2026 it is off the list
    // entirely, so it can no longer be one of the rows shown twice.
    expect(statesWithMovingTests(2025).map((r) => r.abbr)).toEqual([
      'MN',
      'RI',
      'WV',
    ]);
    expect(statesWithMovingTests(2026).map((r) => r.abbr)).toEqual(['MN', 'RI']);
  });

  it('only ever flags states that tax benefits in the year asked about', () => {
    for (const year of TAX_YEARS) {
      const taxing = new Set(
        statesTaxingSocialSecurity(year).map((r) => r.abbr),
      );
      for (const rule of statesWithMovingTests(year)) {
        expect(taxing.has(rule.abbr), `${rule.abbr} ${year}`).toBe(true);
      }
    }
  });
});

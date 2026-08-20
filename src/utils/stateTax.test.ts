import { describe, it, expect } from 'vitest';
import {
  STATE_SS_RULES,
  statesTaxingSocialSecurity,
  stateSSRule,
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

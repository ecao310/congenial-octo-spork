import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  encodeScenario,
  decodeScenario,
  scenarioUrl,
  defaultScenario,
  DEFAULT_ORDINARY_INCOME,
  MAX_MUNI_INTEREST,
  MAX_OTHER_INCOME,
} from './scenarioUrl';
import type { PageScenario } from './scenarioUrl';
import { avgAnnualSSBenefit, maxAnnualSSBenefit } from './tax';

/**
 * `defaultScenario()` and every "the link left it out" case below run through
 * `defaultTaxYear()`, which follows the wall calendar. Pinning the clock is
 * what lets those cases assert on 2025 figures — the same pin `App.test.tsx`
 * uses, and for the same reason.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2025-07-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const opening = defaultScenario(2025);

const with2025 = (over: Partial<PageScenario> = {}): PageScenario => ({
  ...opening,
  ...over,
});

describe('encodeScenario', () => {
  /**
   * The year is the one default that moves on its own — `defaultTaxYear()`
   * follows the calendar — so a link that left it out would re-price itself
   * the January after it was sent.
   */
  it('always writes the year and nothing else the page opens with', () => {
    expect(encodeScenario(with2025())).toBe('year=2025');
  });

  it('writes only what the reader moved', () => {
    expect(encodeScenario(with2025({ ordinaryIncome: 90_000 }))).toBe(
      'year=2025&income=90000',
    );
    expect(encodeScenario(with2025({ filingStatus: 'mfj' }))).toBe(
      'year=2025&filing=mfj',
    );
    expect(encodeScenario(with2025({ ceilingId: 'irmaa1' }))).toBe(
      'year=2025&ceiling=irmaa1',
    );
    expect(encodeScenario(with2025({ homeState: 'VT' }))).toBe(
      'year=2025&state=VT',
    );
  });

  /**
   * A benefit sitting on the year's average is an opinion nobody expressed, so
   * it is left out and re-read as whatever the decoded year averages. That is
   * the rule `changeYear` already applies inside the page.
   */
  it('leaves the benefit out at the year average and writes it anywhere else', () => {
    expect(encodeScenario(with2025())).not.toContain('ss=');
    expect(encodeScenario(with2025({ ssBenefit: 40_000 }))).toContain('ss=40000');
    expect(
      encodeScenario({ ...defaultScenario(2026), year: 2026 }),
    ).toBe('year=2026');
  });

  it('writes the age toggles as flags, and only when they are on', () => {
    expect(encodeScenario(with2025())).not.toContain('senior');
    expect(encodeScenario(with2025({ isSenior: true }))).toBe('year=2025&senior=1');
    expect(
      encodeScenario(
        with2025({ filingStatus: 'mfj', isSenior: true, spouseIsSenior: true }),
      ),
    ).toBe('year=2025&filing=mfj&senior=1&spouse=1');
  });

  it('round-trips a return that moved every control', () => {
    const moved = with2025({
      year: 2026,
      filingStatus: 'hoh',
      ssBenefit: 31_000,
      ordinaryIncome: 120_000,
      plannedLtcg: 40_000,
      isSenior: true,
      spouseIsSenior: true,
      muniInterest: 12_000,
      qcd: 25_000,
      ceilingId: 'ltcg0',
      homeState: 'MT',
    });
    expect(decodeScenario(encodeScenario(moved)).scenario).toEqual(moved);
    expect(decodeScenario(encodeScenario(moved)).notes).toEqual([]);
  });

  it('round-trips through a leading question mark, the way a location gives it', () => {
    const moved = with2025({ ordinaryIncome: 75_000, muniInterest: 5_000 });
    expect(decodeScenario(`?${encodeScenario(moved)}`).scenario).toEqual(moved);
  });
});

describe('scenarioUrl', () => {
  /**
   * `replaceState` takes a whole URL, so a bare `?query` would drop the
   * fragment — which is where the step lives.
   */
  it('keeps the path and the step fragment around the return', () => {
    expect(
      scenarioUrl(with2025({ ordinaryIncome: 90_000 }), {
        pathname: '/congenial-octo-spork/',
        hash: '#step-conversion',
      }),
    ).toBe('/congenial-octo-spork/?year=2025&income=90000#step-conversion');
  });

  it('writes no fragment when there is none', () => {
    expect(scenarioUrl(with2025(), { pathname: '/', hash: '' })).toBe('/?year=2025');
  });
});

describe('decodeScenario', () => {
  it('gives the page its opening return for an empty address', () => {
    const { scenario, notes } = decodeScenario('');
    expect(notes).toEqual([]);
    expect(scenario).toEqual(defaultScenario());
    expect(scenario.ordinaryIncome).toBe(DEFAULT_ORDINARY_INCOME);
  });

  it('reads a benefit the link left out as that year’s average', () => {
    expect(decodeScenario('year=2026').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(2026),
    );
    expect(decodeScenario('year=2025').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(2025),
    );
  });

  it('ignores a flag that is not set to 1', () => {
    expect(decodeScenario('senior=0').scenario.isSenior).toBe(false);
    expect(decodeScenario('senior=true').scenario.isSenior).toBe(false);
    expect(decodeScenario('senior=1').scenario.isSenior).toBe(true);
  });

  /**
   * The decision the bullet asked for: a year with no published figures loses
   * to the year the page can actually price, out loud. Refusing to render
   * would trade a page priced for the wrong year against no page at all.
   */
  describe('a year this page cannot price', () => {
    it('falls back to the default year and says which one it is showing', () => {
      const { scenario, notes } = decodeScenario('year=2024');
      expect(scenario.year).toBe(defaultScenario().year);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain('priced for 2024');
      expect(notes[0]).toContain('no published figures');
      expect(notes[0]).toContain(String(defaultScenario().year));
    });

    it('re-prices the year-dependent figures against the year it fell back to', () => {
      // $62,172 is the 2026 maximum; the fallback year is 2025, whose maximum
      // is $61,296, so the benefit is cut back and both notes are raised.
      const { scenario, notes } = decodeScenario('year=2027&ss=62172');
      expect(scenario.year).toBe(defaultScenario().year);
      expect(scenario.ssBenefit).toBe(maxAnnualSSBenefit(defaultScenario().year));
      expect(notes).toHaveLength(2);
      expect(notes[1]).toContain('$61,296');
    });

    it('says nothing about a year that is simply absent', () => {
      expect(decodeScenario('income=40000').notes).toEqual([]);
    });
  });

  describe('a figure past the bound the page would have held it inside', () => {
    it('names the year’s maximum benefit', () => {
      const { scenario, notes } = decodeScenario('year=2025&ss=200000');
      expect(scenario.ssBenefit).toBe(61_296);
      expect(notes[0]).toBe(
        'This link asked for $200,000 of a Social Security benefit. The most this return can carry is $61,296 — the most anyone can collect in 2025, so that is what is set.',
      );
    });

    it('holds a gain to the income it is a share of', () => {
      const { scenario, notes } = decodeScenario('year=2025&income=50000&ltcg=80000');
      expect(scenario.plannedLtcg).toBe(50_000);
      expect(notes[0]).toContain('$50,000');
      expect(notes[0]).toContain('a share of the other income');
    });

    it('holds tax-exempt interest to the slider’s right edge', () => {
      const { scenario, notes } = decodeScenario('muni=90000');
      expect(scenario.muniInterest).toBe(MAX_MUNI_INTEREST);
      expect(notes[0]).toContain('$50,000');
    });

    /** The charitable limit is per individual, so it doubles on a joint return. */
    it('holds a gift to this return’s own statutory limit', () => {
      const single = decodeScenario('year=2025&qcd=200000');
      expect(single.scenario.qcd).toBe(108_000);
      expect(single.notes[0]).toContain('$108,000');
      expect(single.notes[0]).toContain('2025 annual limit');

      const joint = decodeScenario('year=2025&filing=mfj&qcd=200000');
      expect(joint.scenario.qcd).toBe(200_000);
      expect(joint.notes).toEqual([]);
    });

    it('holds other income where no line on any chart moves any more', () => {
      const { scenario, notes } = decodeScenario('income=99999999');
      expect(scenario.ordinaryIncome).toBe(MAX_OTHER_INCOME);
      expect(notes[0]).toContain('$1,000,000');
    });

    it('takes a negative figure as nothing and says so', () => {
      const { scenario, notes } = decodeScenario('income=-5000');
      expect(scenario.ordinaryIncome).toBe(0);
      expect(notes[0]).toContain('cannot be less than nothing');
    });

    it('rounds a fractional figure to whole dollars without comment', () => {
      const { scenario, notes } = decodeScenario('income=40000.62');
      expect(scenario.ordinaryIncome).toBe(40_001);
      expect(notes).toEqual([]);
    });
  });

  describe('a value this page does not offer', () => {
    it('falls back to a single filer and quotes what the link said', () => {
      const { scenario, notes } = decodeScenario('filing=widow');
      expect(scenario.filingStatus).toBe('single');
      expect(notes[0]).toContain('“widow”');
      expect(notes[0]).toContain('a single filer');
    });

    it('falls back to the top of the 12% bracket for an unknown ceiling', () => {
      const { scenario, notes } = decodeScenario('ceiling=bracket24');
      expect(scenario.ceilingId).toBe('bracket12');
      expect(notes[0]).toContain('“bracket24”');
      expect(notes[0]).toContain('12% bracket');
    });

    it('takes a figure that is not a number as the page’s own', () => {
      const { scenario, notes } = decodeScenario('income=lots');
      expect(scenario.ordinaryIncome).toBe(DEFAULT_ORDINARY_INCOME);
      expect(notes[0]).toContain('not an amount');
      expect(notes[0]).toContain('$30,000');
    });

    /** An empty value is a key nobody filled in, not a value to complain about. */
    it('says nothing about an empty value', () => {
      const { scenario, notes } = decodeScenario('income=&filing=&ceiling=&year=&state=');
      expect(notes).toEqual([]);
      expect(scenario).toEqual(defaultScenario());
    });
  });

  /**
   * The state is the one value here that prices nothing — it picks step 2's
   * footnote — so what it costs to get wrong is a paragraph, and the rules for
   * reading it back are looser than the rules for a dollar figure.
   */
  describe('the state, which prices nothing', () => {
    it('takes a state the table knows, in any case', () => {
      expect(decodeScenario('state=mt').scenario.homeState).toBe('MT');
      expect(decodeScenario('state=MT').scenario.homeState).toBe('MT');
      expect(decodeScenario('state= wv ').scenario.homeState).toBe('WV');
      expect(decodeScenario('state=MT').notes).toEqual([]);
    });

    /**
     * California is not on the list because California does not tax the
     * benefit, so the honest answer to `state=CA` is the same one the page's
     * own menu gives it: no footnote, and nothing to apologise for.
     */
    it('says nothing about a real state that leaves the benefit alone', () => {
      const { scenario, notes } = decodeScenario('state=CA');
      expect(scenario.homeState).toBe('');
      expect(notes).toEqual([]);
    });

    it('names what it could not read when the link gives something else', () => {
      const { scenario, notes } = decodeScenario('state=Montana');
      expect(scenario.homeState).toBe('');
      expect(notes[0]).toContain('“Montana”');
      expect(notes[0]).toContain('two-letter');
    });
  });
});

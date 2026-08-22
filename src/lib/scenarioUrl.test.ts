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
import { PAGE_TAX_YEAR, avgAnnualSSBenefit } from './tax';

/**
 * Nothing in this file reads the clock any more — `PAGE_TAX_YEAR` is a
 * constant and the year is no longer a key in the query string — but the pin
 * stays so that a future figure derived from `defaultTaxYear()` cannot make
 * these assertions depend on the day they are run.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const opening = defaultScenario();

/**
 * A return the page could actually have produced.
 *
 * Step 1 re-seats the benefit on the new status's own average when the reader
 * changes status while sitting on the old one, so a joint scenario built here
 * carries the couple average unless the caller names a benefit of its own.
 */
const moved = (over: Partial<PageScenario> = {}): PageScenario => ({
  ...opening,
  ssBenefit: avgAnnualSSBenefit(
    PAGE_TAX_YEAR,
    over.filingStatus ?? opening.filingStatus,
  ),
  ...over,
});

describe('encodeScenario', () => {
  /**
   * The year used to be written unconditionally, because its default followed
   * the calendar and a link without it would have re-priced itself in January.
   * `PAGE_TAX_YEAR` is a constant, so the page it opens is the page it was
   * sent from and there is nothing left that has to be pinned in the link.
   */
  it('writes nothing at all for the return the page opens with', () => {
    expect(encodeScenario(moved())).toBe('');
  });

  it('writes only what the reader moved', () => {
    expect(encodeScenario(moved({ ordinaryIncome: 90_000 }))).toBe('income=90000');
    expect(encodeScenario(moved({ filingStatus: 'mfj' }))).toBe('filing=mfj');
    expect(encodeScenario(moved({ muniInterest: 15_000 }))).toBe('muni=15000');
  });

  /**
   * A benefit sitting on the average is an opinion nobody expressed, so it is
   * left out and re-read as whatever the page opens with.
   */
  it('leaves the benefit out at the average and writes it anywhere else', () => {
    expect(encodeScenario(moved())).not.toContain('ss=');
    expect(encodeScenario(moved({ ssBenefit: 40_000 }))).toContain('ss=40000');
  });

  it('writes the age toggles as flags, and only when they are on', () => {
    expect(encodeScenario(moved())).not.toContain('senior');
    expect(encodeScenario(moved({ isSenior: true }))).toBe('senior=1');
    expect(
      encodeScenario(
        moved({ filingStatus: 'mfj', isSenior: true, spouseIsSenior: true }),
      ),
    ).toBe('filing=mfj&senior=1&spouse=1');
  });

  it('round-trips a return that moved every control', () => {
    const everything = moved({
      filingStatus: 'mfj',
      ssBenefit: 31_000,
      ordinaryIncome: 120_000,
      isSenior: true,
      spouseIsSenior: true,
      muniInterest: 12_000,
    });
    expect(decodeScenario(encodeScenario(everything)).scenario).toEqual(everything);
    expect(decodeScenario(encodeScenario(everything)).notes).toEqual([]);
  });

  it('round-trips through a leading question mark, the way a location gives it', () => {
    const some = moved({ ordinaryIncome: 75_000, muniInterest: 5_000 });
    expect(decodeScenario(`?${encodeScenario(some)}`).scenario).toEqual(some);
  });
});

describe('scenarioUrl', () => {
  /**
   * `replaceState` takes a whole URL, so a bare `?query` would drop the
   * fragment — which is where the step lives.
   */
  it('keeps the path and the step fragment around the return', () => {
    expect(
      scenarioUrl(moved({ ordinaryIncome: 90_000 }), {
        pathname: '/congenial-octo-spork/',
        hash: '#step-conversion',
      }),
    ).toBe('/congenial-octo-spork/?income=90000#step-conversion');
  });

  it('writes no fragment when there is none', () => {
    expect(scenarioUrl(moved({ ordinaryIncome: 90_000 }), { pathname: '/', hash: '' }))
      .toBe('/?income=90000');
  });

  /**
   * An untouched page encodes to nothing now that the year has gone, so there
   * is no `?` to write. A bare trailing question mark is a character the
   * reader would have to decide whether to keep when they copy the address.
   */
  it('writes no question mark when the return is the one the page opens with', () => {
    expect(scenarioUrl(moved(), { pathname: '/', hash: '' })).toBe('/');
    expect(scenarioUrl(moved(), { pathname: '/', hash: '#step-torpedo' })).toBe(
      '/#step-torpedo',
    );
  });
});

describe('decodeScenario', () => {
  it('gives the page its opening return for an empty address', () => {
    const { scenario, notes } = decodeScenario('');
    expect(notes).toEqual([]);
    expect(scenario).toEqual(defaultScenario());
    expect(scenario.ordinaryIncome).toBe(DEFAULT_ORDINARY_INCOME);
  });

  it('reads a benefit the link left out as the page’s own average', () => {
    expect(decodeScenario('').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(PAGE_TAX_YEAR),
    );
    expect(decodeScenario('income=90000').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(PAGE_TAX_YEAR),
    );
  });

  /**
   * Which average that is depends on the status the same link carries. Line 6a
   * on a joint return holds two benefits, so a joint link with no `ss` key
   * opens on the couple average rather than on one worker's — which is what
   * makes `?filing=mfj` a complete link to the return the page shows when a
   * reader clicks that radio and touches nothing else.
   */
  it('reads that average as the couple’s when the link files jointly', () => {
    expect(decodeScenario('filing=mfj').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(PAGE_TAX_YEAR, 'mfj'),
    );
    expect(decodeScenario('filing=mfj').scenario.ssBenefit).toBe(38_496);
    expect(decodeScenario('').scenario.ssBenefit).toBe(
      avgAnnualSSBenefit(PAGE_TAX_YEAR),
    );
  });

  /**
   * The two statuses that came off the page are the two an old link is most
   * likely to name, because every link this app wrote while they were on the
   * strip could carry one. They are answered the way `?filing=widow` is
   * answered rather than read past in silence like `?state=VT`: a filing
   * status moves every figure on the page, so a reader who asked for a head
   * of household and got a single filer's return has to be told which return
   * they are looking at.
   */
  it('tells a link naming a status that came off the page what it got', () => {
    for (const status of ['hoh', 'mfs']) {
      const { scenario, notes } = decodeScenario(`filing=${status}`);
      expect(scenario.filingStatus).toBe('single');
      expect(scenario.ssBenefit).toBe(avgAnnualSSBenefit(PAGE_TAX_YEAR));
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain(`“${status}”`);
      expect(notes[0]).toContain('a single filer');
    }
  });

  /**
   * The page stopped letting the spouse's box stand on its own — unchecking
   * "Age 65 or older" clears it — so a link is the only way the pair can still
   * arrive, and every link written before that rule may carry it. Read past in
   * silence, because the deduction already counted nobody: no figure changes,
   * only a checked box that priced nothing.
   */
  it('drops a spouse flag with no filer flag behind it', () => {
    const { scenario, notes } = decodeScenario('filing=mfj&spouse=1');
    expect(scenario.isSenior).toBe(false);
    expect(scenario.spouseIsSenior).toBe(false);
    expect(notes).toEqual([]);

    // With the filer's flag on it stands, on either return: the strip hides
    // that box for a single filer without forgetting the answer.
    expect(decodeScenario('filing=mfj&senior=1&spouse=1').scenario.spouseIsSenior).toBe(
      true,
    );
    expect(decodeScenario('senior=1&spouse=1').scenario.spouseIsSenior).toBe(true);
  });

  it('ignores a flag that is not set to 1', () => {
    expect(decodeScenario('senior=0').scenario.isSenior).toBe(false);
    expect(decodeScenario('senior=true').scenario.isSenior).toBe(false);
    expect(decodeScenario('senior=1').scenario.isSenior).toBe(true);
  });

  /**
   * The year was a key for as long as it was a control, so every link this app
   * produced up to now carries one. It is read past in silence: there is no
   * year to switch to, so there is nothing to tell the reader and nothing to
   * point them at. Same reading as `?state=VT` below.
   */
  describe('a year in the link', () => {
    it('changes nothing and says nothing, whichever year it names', () => {
      for (const search of ['year=2025', 'year=2026', 'year=2024', 'year=lots']) {
        const { scenario, notes } = decodeScenario(search);
        expect(scenario).toEqual(defaultScenario());
        expect(notes).toEqual([]);
      }
    });

    it('leaves the year-dependent bounds priced for the year the page shows', () => {
      // $62,172 is the 2026 maximum and 2026 is what the page prices, so a
      // 2025 link asking for the whole of it is not cut back to $61,296.
      const { scenario, notes } = decodeScenario('year=2025&ss=62172');
      expect(scenario.ssBenefit).toBe(62_172);
      expect(notes).toEqual([]);
    });
  });

  describe('a figure past the bound the page would have held it inside', () => {
    it('names the year’s maximum benefit', () => {
      const { scenario, notes } = decodeScenario('ss=200000');
      expect(scenario.ssBenefit).toBe(62_172);
      expect(notes[0]).toBe(
        'This link asked for $200,000 of a Social Security benefit. The most this return can carry is $62,172 — the most anyone can collect in 2026, so that is what is set.',
      );
    });

    /**
     * And the joint ceiling is the couple's, so the figure that is too much for
     * one return is carried whole by the other. A bound read off the wrong
     * status would silently halve a joint reader's benefit on a link the page
     * itself wrote.
     */
    it('lets a joint link carry twice that, and says so when it cuts one back', () => {
      const carried = decodeScenario('filing=mfj&ss=124344');
      expect(carried.scenario.ssBenefit).toBe(124_344);
      expect(carried.notes).toEqual([]);

      const cut = decodeScenario('filing=mfj&ss=200000');
      expect(cut.scenario.ssBenefit).toBe(124_344);
      expect(cut.notes[0]).toBe(
        'This link asked for $200,000 of a Social Security benefit. The most this return can carry is $124,344 — the most a couple can collect in 2026, so that is what is set.',
      );

      // The same figure on a single return is still cut to one worker's.
      expect(decodeScenario('ss=124344').scenario.ssBenefit).toBe(62_172);
    });

    it('holds tax-exempt interest to the slider’s right edge', () => {
      const { scenario, notes } = decodeScenario('muni=90000');
      expect(scenario.muniInterest).toBe(MAX_MUNI_INTEREST);
      expect(notes[0]).toContain('$50,000');
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

    it('takes a figure that is not a number as the page’s own', () => {
      const { scenario, notes } = decodeScenario('income=lots');
      expect(scenario.ordinaryIncome).toBe(DEFAULT_ORDINARY_INCOME);
      expect(notes[0]).toContain('not an amount');
      expect(notes[0]).toContain('$30,000');
    });

    /** An empty value is a key nobody filled in, not a value to complain about. */
    it('says nothing about an empty value', () => {
      const { scenario, notes } = decodeScenario('income=&filing=&muni=&year=');
      expect(notes).toEqual([]);
      expect(scenario).toEqual(defaultScenario());
    });
  });

  /**
   * A link is older than the page it opens more often than anyone plans for,
   * and the page it opens has fewer inputs than it had. `?state=VT` was
   * written by every link this app produced while step 2 carried a state
   * footnote, and `?ltcg=`, `?ceiling=` and `?qcd=` by every link it produced
   * while the capital-gains, conversion and charity steps stood — so the
   * reading is: a key nothing prices is a key nothing reads, and there is
   * nothing to tell the reader about it.
   *
   * `ltcg` and `qcd` are the two worth pinning twice over. Both priced
   * something once, and a page that honoured either would draw a curve nothing
   * on screen could explain and no control could undo.
   */
  it('ignores a key from a page that had more inputs than this one', () => {
    const { scenario, notes } = decodeScenario('year=2025&income=90000&state=VT');
    expect(scenario).toEqual({ ...defaultScenario(), ordinaryIncome: 90_000 });
    expect(notes).toEqual([]);
  });

  it('prices nothing off a gain, a gift or a ceiling an old link still carries', () => {
    const { scenario, notes } = decodeScenario(
      'income=90000&ltcg=40000&ceiling=irmaa1&qcd=25000',
    );
    expect(scenario).toEqual({ ...defaultScenario(), ordinaryIncome: 90_000 });
    expect(notes).toEqual([]);
    expect(encodeScenario(scenario)).toBe('income=90000');
  });
});

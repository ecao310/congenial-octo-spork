import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { ADDRESS_SETTLE_MS } from './hooks/useScenarioAddress';
import { READING_SETTLE_MS } from './hooks/useSettledReading';
import { PAGE_TAX_YEAR } from './lib/tax';
import { pinPageYear, chooseFilingStatus } from './test/pageFixtures';

/**
 * What the two steps add up to: the close, the link that carries the return,
 * and the reading a screen reader hears when a control moves.
 *
 * The three belong together because all three are the same claim from
 * different sides — that what is on screen, what is in the address bar and
 * what is said aloud are all describing one return.
 */

pinPageYear();

/* ------------------------------------------------------------------ */
/*  What the return actually owes                                      */
/* ------------------------------------------------------------------ */

/**
 * Every rate this page quoted was the price of the *next* dollar. The total
 * bill existed only inside the tooltip, which means a reader who never
 * hovered — and every reader on a touch screen — walked both steps without
 * once being told what the return costs.
 *
 * The effective rate beside it is the average the marginal rate is so often
 * mistaken for.
 */
describe('the total the return owes', () => {
  const readout = (step: string): HTMLElement =>
    document.querySelector(`#step-${step} .slider-readout`) as HTMLElement;
  const set = (name: RegExp, value: number): void => {
    fireEvent.change(screen.getByRole('slider', { name }), {
      target: { value: String(value) },
    });
  };

  it('states the bill and the effective rate under the torpedo slider', () => {
    render(<App />);
    // $30,000 of other income and the $24,852 average benefit.
    expect(readout('torpedo')).toHaveTextContent(
      'owes $2,819 in federal tax on $54,852 of total income — an effective rate of 5.14%',
    );
  });

  /**
   * The two rates are left to stand as figures.
   *
   * The paragraph used to gloss both of them. After the marginal rate came
   * “where the dashed amber line crosses the curve above — that point on the
   * curve, not the curve itself, is what the slider moves”, which described
   * the chart's mechanics to a reader who had just moved the slider and
   * watched it happen. After the effective rate came “that is the average
   * across every dollar of it; the figure before it is the price of the next
   * one”, which drew a distinction the sentence around it already draws by
   * saying “the next dollar” of one and “on $54,852 of total income” of the
   * other.
   *
   * Asserted absent rather than merely untested: this paragraph has grown a
   * gloss back twice, and a passing test on the figures alone would not
   * notice a third.
   */
  it('leaves the two rates as figures rather than glossing them', () => {
    render(<App />);
    expect(readout('torpedo')).toHaveTextContent('taxed at 22.2%');
    expect(readout('torpedo')).not.toHaveTextContent(/what the slider moves/);
    expect(readout('torpedo')).not.toHaveTextContent(/price of the next one/);
  });

  it('moves all three figures when the income does', () => {
    render(<App />);
    set(/other income \(excluding social security\)/i, 90_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $15,617 in federal tax on $114,852 of total income — an effective rate of 13.6%',
    );
  });

  /**
   * The denominator is the total income the axis label under step 2's chart
   * already defines, and for the same reason: tax-exempt interest is money
   * received.
   */
  it('counts tax-exempt interest as income received', () => {
    render(<App />);
    set(/tax-exempt \(municipal\) interest/i, 10_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $3,839 in federal tax on $64,852 of total income',
    );
  });

  it('says nothing at all when nothing comes in', () => {
    render(<App />);
    set(/social security benefit/i, 0);
    set(/other income \(excluding social security\)/i, 0);
    expect(readout('torpedo')).not.toHaveTextContent('of total income');
    expect(readout('torpedo')).not.toHaveTextContent('effective rate');
  });
});

/**
 * The close.
 *
 * Step 1 ends by naming the return step 2 prices; this ends the page by saying
 * what came of it. Six figures a reader leaves with — total income, the tax,
 * the effective rate, the marginal rate, how much of the benefit is taxable,
 * and which Medicare tier the MAGI landed in — all in one block.
 */
describe('the closing answer', () => {
  const answer = (): HTMLElement => document.getElementById('answer') as HTMLElement;

  const intro = (): HTMLElement =>
    answer().querySelector('.answer-intro') as HTMLElement;

  /** One figure of the close, found by the label above it. */
  const figure = (label: string): HTMLElement =>
    within(answer()).getByText(label).closest('.answer-figure') as HTMLElement;

  const setIncome = (value: number): void => {
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(excluding social security\)/i }),
      { target: { value: String(value) } },
    );
  };

  const setBenefit = (value: number): void => {
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: String(value) } },
    );
  };

  it('ends the page, after step 2 and before the disclaimer', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /what this return costs/i, level: 2 }),
    ).toBeInTheDocument();
    expect(answer().previousElementSibling?.id).toBe('step-torpedo');

    // Read in two hops rather than one, because the shell put a column
    // between them: the close is the last thing in the reading column, the
    // reading column is the last thing in the shell, and the disclaimer is
    // what follows the shell. It used to be the close's own next sibling,
    // which stopped being true when the footer started spanning both columns.
    const shell = answer().closest('.shell') as HTMLElement;
    expect(shell.lastElementChild?.lastElementChild).toBe(answer());
    expect(shell.nextElementSibling?.tagName).toBe('FOOTER');
    expect(shell.nextElementSibling).toHaveTextContent(
      /does not constitute tax or financial advice/i,
    );
  });

  it('answers with the six figures the default return produces', () => {
    render(<App />);
    expect(figure('Total income')).toHaveTextContent('$54,852');
    expect(figure('Federal tax')).toHaveTextContent('$2,819');
    expect(figure('Effective rate')).toHaveTextContent('5.14%');
    expect(figure('Marginal rate')).toHaveTextContent('22.2%');
    expect(figure('Taxable social security')).toHaveTextContent(
      '$11,662 of $24,852',
    );
    expect(figure('Taxable social security')).toHaveTextContent('46.93% of it');
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'None \u2014 the standard premium',
    );
    expect(answer().querySelectorAll('.answer-figure')).toHaveLength(6);
  });

  /**
   * A screenshot of an answer with no question in it is worth nothing, so the
   * block restates the return above the figures rather than relying on step
   * 1's recap being in the same frame.
   */
  it('restates the return it prices', () => {
    render(<App />);
    expect(intro()).toHaveTextContent(
      'Priced for 2026: a single filer, under 65, with $24,852 of Social Security and $30,000 of other income.',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(intro()).toHaveTextContent(
      'Priced for 2026: a married couple filing jointly, one spouse 65 or older,',
    );
  });

  /**
   * The tax and the two rates are already on the page once — step 2's readout
   * quotes both. The close is a second rendering of one figure, not a second
   * calculation of it.
   */
  it('quotes the same tax and rates the step above it does', () => {
    render(<App />);
    const torpedoReadout = document.querySelector(
      '#step-torpedo .slider-readout',
    ) as HTMLElement;
    expect(torpedoReadout).toHaveTextContent('owes $2,819 in federal tax');
    expect(torpedoReadout).toHaveTextContent('an effective rate of 5.14%');

    expect(figure('Federal tax')).toHaveTextContent('$2,819');
    expect(figure('Effective rate')).toHaveTextContent('5.14%');
    expect(figure('Marginal rate')).toHaveTextContent('22.2%');
  });

  it('re-prices every figure when step 2 moves the income', () => {
    render(<App />);
    setIncome(90_000);
    expect(figure('Total income')).toHaveTextContent('$114,852');
    expect(figure('Federal tax')).toHaveTextContent('$15,617');
    expect(figure('Effective rate')).toHaveTextContent('13.6%');
    // Past the torpedo: the next dollar is back to its own bracket rate.
    expect(figure('Marginal rate')).toHaveTextContent('22%');
    // And the 85% cap is binding, which is why it is over.
    expect(figure('Taxable social security')).toHaveTextContent(
      '$21,124 of $24,852',
    );
    expect(figure('Taxable social security')).toHaveTextContent('85% of it');
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'Tier 1 of 5 \u2014 $1,148/yr',
    );
  });

  /**
   * Which tier a reader's own income lands them in has only ever been
   * available by hovering the chart, which is nothing at all on a touch
   * screen. The lag is the other half of it: the tier a 2026 return sets is
   * not billed until 2028, and the figure means the wrong year without it.
   */
  it('names the tier the return lands in and the year it is billed for', () => {
    render(<App />);
    const medicare = figure('Medicare surcharge');
    expect(medicare).toHaveTextContent('None \u2014 the standard premium');
    expect(medicare).toHaveTextContent(
      'Billed on a 2-year lag, so this is what 2026 income sets for 2028.',
    );
  });

  it('charges the surcharge to each enrollee on a joint return', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    );
    // $200,000 of other income plus 85% of the couple's $38,496 benefit puts
    // the return's MAGI over the first joint cliff. Two enrollees, so the tier
    // costs twice the $1,148 one filer pays for it above.
    setIncome(200_000);
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'Tier 1 of 5 \u2014 $2,297/yr',
    );
  });

  it('says there is nothing to drag in when step 1 sets no benefit', () => {
    render(<App />);
    setBenefit(0);
    expect(intro()).toHaveTextContent(
      'with no Social Security and $30,000 of other income',
    );
    expect(figure('Taxable social security')).toHaveTextContent('None');
    expect(figure('Taxable social security')).toHaveTextContent(
      'Step 1 sets no benefit, so there is nothing for other income to drag in',
    );
    expect(figure('Total income')).toHaveTextContent('$30,000');
    expect(figure('Effective rate')).toHaveTextContent('4.73%');
  });

  /**
   * The same denominator the effective rate above step 2 uses, and the same
   * one the chart's axis is drawn in: everything that came out, so tax-exempt
   * interest is in it even though no part of it is taxed. Taking it back to
   * $0 has to put both figures back where they started, or the total is
   * carrying a dollar the return no longer has.
   */
  it('counts tax-exempt interest into the total the return takes in', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '10000' } },
    );
    expect(figure('Total income')).toHaveTextContent('$64,852');
    expect(figure('Total income')).toHaveTextContent(
      'plus $10,000 of tax-exempt interest',
    );
    expect(figure('Effective rate')).toHaveTextContent('5.92%');

    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '0' } },
    );
    expect(figure('Total income')).toHaveTextContent('$54,852');
    expect(figure('Total income')).not.toHaveTextContent('tax-exempt interest');
  });

  /** No income is no denominator, and "0.00%" would be a claim about nothing. */
  it('holds the effective rate back when nothing comes in', () => {
    render(<App />);
    setBenefit(0);
    setIncome(0);
    expect(figure('Total income')).toHaveTextContent('$0');
    expect(figure('Effective rate')).toHaveTextContent('\u2014');
    expect(figure('Effective rate')).toHaveTextContent('No tax on no income.');
    expect(figure('Effective rate')).not.toHaveTextContent('%');
  });

  /**
   * The link is the return, said on the page.
   *
   * The query string has carried every control since d5bcf75, and the only
   * place the page mentioned the address bar was the failure case — the note
   * that appears when a link asked for something this page could not show. So
   * a reader who wanted to send this to a spouse or an advisor had to work it
   * out for themselves.
   */
  describe('sending the answer', () => {
    const share = (): HTMLElement =>
      answer().querySelector('.answer-share') as HTMLElement;

    const copyButton = (): HTMLElement =>
      within(share()).getByRole('button', { name: 'Copy link to this return' });

    const status = (): HTMLElement =>
      share().querySelector('.answer-share-status') as HTMLElement;

    /**
     * jsdom implements no clipboard at all, which is exactly the browser the
     * fallback is for — so the button only exists in tests that ask for one.
     */
    const withClipboard = (writeText: (text: string) => Promise<void>): void => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('closes the block, directly under the figures it sends', () => {
      render(<App />);
      // The sentence that used to stand here said the address bar was the
      // return; it and the caveat under it came off the page, so the block is
      // now the last thing in the close and the button is all of it.
      expect(share().previousElementSibling).toHaveClass('answer-figures');
      expect(share().nextElementSibling).toBeNull();
      expect(answer().lastElementChild).toBe(share());
    });

    it('puts the address itself on the clipboard, character for character', async () => {
      const copied: string[] = [];
      withClipboard((text) => {
        copied.push(text);
        return Promise.resolve();
      });
      render(<App />);
      setIncome(90_000);

      fireEvent.click(copyButton());
      await screen.findByText(/Copied\./);

      expect(copied).toEqual([window.location.href]);
      expect(copied[0]).toContain('?income=90000');
      expect(status()).toHaveTextContent('That link opens this page on this return');
    });

    /** The point of the feature: what is copied opens the same return. */
    it('hands over a link that reopens the return it was copied from', async () => {
      let copied = '';
      withClipboard((text) => {
        copied = text;
        return Promise.resolve();
      });
      const first = render(<App />);
      setIncome(120_000);
      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
      fireEvent.click(copyButton());
      await screen.findByText(/Copied\./);
      first.unmount();

      window.history.replaceState(null, '', copied);
      render(<App />);
      expect(
        screen.getByRole('slider', { name: /other income \(excluding social security\)/i }),
      ).toHaveValue('120000');
      expect(
        screen.getByRole('radio', { name: 'Married Filing Jointly' }),
      ).toBeChecked();
      // $120,000 plus the couple average the joint radio moved the benefit to.
      // That average is what a joint link opens on, so it rides in the link as
      // the status rather than as an `ss` key of its own.
      expect(copied).not.toContain('ss=');
      expect(figure('Total income')).toHaveTextContent('$158,496');
    });

    /**
     * "Copied" is a claim about what is on the clipboard, and the moment a
     * slider moves that is a different return from the one on screen.
     */
    it('stops saying Copied once the return has moved on', async () => {
      withClipboard(() => Promise.resolve());
      render(<App />);
      fireEvent.click(copyButton());
      await screen.findByText(/Copied\./);

      setIncome(70_000);
      expect(status()).toBeEmptyDOMElement();
    });

    /**
     * Clipboard access can be refused at the moment of the click even where
     * the API exists. There is no text field to fall back to on purpose — a
     * second copy of the address on the page would go stale against the real
     * one — so the message points at the address bar, which holds the same
     * link the button would have copied.
     */
    it('points at the address bar when the browser refuses the copy', async () => {
      withClipboard(() => Promise.reject(new Error('denied')));
      render(<App />);
      fireEvent.click(copyButton());

      await screen.findByText(/would not take the copy/);
      expect(status()).toHaveTextContent(
        'Select the address bar and copy it — it is the same link.',
      );
    });

    /**
     * Over plain http, and in Safari before 13.1, there is no clipboard to
     * write to. A button that cannot copy is worse than no button, so the
     * block draws nothing but the empty live region — the address bar still
     * holds the return, which is what the button would have copied.
     */
    it('draws no button at all where there is no clipboard', () => {
      render(<App />);
      expect(navigator.clipboard).toBeUndefined();
      expect(
        within(share()).queryByRole('button', { name: /copy link/i }),
      ).not.toBeInTheDocument();
      expect(status()).toBeEmptyDOMElement();
      // The live region is all that is left, and it has to stay on the page
      // even with nothing to announce — see the note on it in App.tsx.
      expect(share().children).toHaveLength(1);
    });

    /**
     * A live region rather than a second `role="status"`: the link note at the
     * top of the page is the page's status, and two of them would make
     * `getByRole('status')` ambiguous for a screen reader and a test alike.
     */
    it('announces the result without becoming a second status region', () => {
      withClipboard(() => Promise.resolve());
      render(<App />);
      expect(status()).toHaveAttribute('aria-live', 'polite');
      expect(status()).toHaveAttribute('aria-atomic', 'true');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});

/**
 * The return in the address bar.
 *
 * Nine `useState` values used to be the whole of it, so a refresh threw the
 * return away and there was nothing to send to anyone. Seven are left, two
 * having gone with the steps that set them. These are the page's
 * half of `scenarioUrl` — that the link is read on mount, written once the
 * control that changed it has settled, and never pushed.
 */
describe('the return in the address bar', () => {
  /**
   * Full fake timers here, where most of the file fakes only the clock: the
   * write is debounced by `ADDRESS_SETTLE_MS`, so every assertion about the
   * address is an assertion about which side of that delay it is on. The
   * system time still has to be set, because the engine's own default year
   * follows the calendar.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${PAGE_TAX_YEAR}-07-01T00:00:00Z`));
  });

  const openAt = (search: string): void => {
    window.history.replaceState(null, '', `/${search}`);
  };

  /** Let whatever was last moved come to rest, and the address catch up. */
  const settle = (): void => {
    act(() => {
      vi.advanceTimersByTime(ADDRESS_SETTLE_MS);
    });
  };

  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(excluding social security\)/i });

  it('opens on the return the link names rather than on its own defaults', () => {
    openAt('?filing=mfj&ss=40000&income=120000&senior=1&spouse=1&muni=8000');
    render(<App />);

    expect(screen.getByRole('radio', { name: 'Married Filing Jointly' })).toBeChecked();
    expect(screen.getByRole('slider', { name: /social security benefit/i })).toHaveValue(
      '40000',
    );
    expect(incomeSlider()).toHaveValue('120000');
    expect(screen.getByRole('checkbox', { name: 'Age 65 or older' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    ).toBeChecked();
    expect(screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i })).toHaveValue(
      '8000',
    );
  });

  /**
   * And prices nothing off the three keys that outlived their controls. A gain
   * or a gift named in an old link would move the curve with nothing on the
   * page to say so or to undo it, which is the one thing worse than dropping
   * it.
   */
  it('reads past a gain, a gift or a ceiling an older link still names', () => {
    openAt('?income=120000&ltcg=25000&ceiling=irmaa1&qcd=15000');
    render(<App />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(incomeSlider()).toHaveValue('120000');
    expect(window.location.search).toBe('?income=120000');
    expect(
      document.querySelector('#step-torpedo .slider-readout'),
    ).toHaveTextContent('At $120,000 of other income');
  });

  /**
   * Both ends of the same rule: a link may not carry the pair the control no
   * longer allows, and one written before the rule does not put it back.
   */
  it('drops the spouse flag when the filer stops being 65', () => {
    openAt('?filing=mfj&senior=1&spouse=1');
    render(<App />);
    const spouse = screen.getByRole('checkbox', {
      name: 'Both spouses are 65 or older',
    });
    expect(spouse).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    settle();
    expect(spouse).not.toBeChecked();
    expect(window.location.search).toBe('?filing=mfj');
  });

  it('opens a link that names the spouse alone on neither box', () => {
    openAt('?filing=mfj&spouse=1');
    render(<App />);

    expect(screen.getByRole('checkbox', { name: 'Age 65 or older' })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    ).not.toBeChecked();
    // Nothing to tell the reader: the deduction never counted that spouse.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?filing=mfj');
  });

  it('writes what the reader moves back into the address', () => {
    render(<App />);
    // Nothing is written unconditionally now that the year has gone, so the
    // opening return leaves the address bare.
    expect(window.location.search).toBe('');

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    settle();
    expect(window.location.search).toBe('?income=90000');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    settle();
    expect(window.location.search).toBe('?filing=mfj&income=90000');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    settle();
    expect(window.location.search).toContain('senior=1');
  });

  /**
   * Why the write waits at all, and the defect it was added for.
   *
   * Browsers cap the history API — Safari at 100 `replaceState` calls per 30
   * seconds, and it throws rather than dropping the 101st. Writing on every
   * notch spent that budget inside one drag of the income slider, the throw
   * landed in an effect with no error boundary above it, and React unmounted
   * the document: the reader moved a slider and the page went black. So a
   * drag has to be one write, and a `replaceState` that fails has to stay
   * inside the page rather than take it down.
   */
  it('spends one write on a whole drag, and survives one that fails', () => {
    const calls: string[] = [];
    const real = window.history.replaceState.bind(window.history);
    const spy = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation((state, unused, url) => {
        calls.push(String(url));
        /* Safari's own message, thrown at Safari's own limit. */
        if (calls.length > 100) {
          throw new DOMException(
            'Attempt to use history.replaceState() more than 100 times per 30 seconds',
            'SecurityError',
          );
        }
        real(state, unused, url);
      });
    try {
      render(<App />);
      // Arrival is the one write that does not wait: it normalises the link.
      expect(calls).toHaveLength(1);

      // A drag: sixty notches of the slider, no pause anywhere in it.
      for (let income = 30_000; income <= 89_500; income += 1000) {
        fireEvent.change(incomeSlider(), { target: { value: String(income) } });
      }
      expect(calls).toHaveLength(1);
      settle();
      expect(calls).toHaveLength(2);
      expect(window.location.search).toBe('?income=89000');

      // And a write the browser refuses is a URL that did not change, not a
      // page that went away.
      calls.length = 200;
      fireEvent.change(incomeSlider(), { target: { value: '95000' } });
      expect(() => settle()).not.toThrow();
      expect(incomeSlider()).toHaveValue('95000');
      expect(
        screen.getByRole('heading', { name: /your social security benefit/i }),
      ).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  /**
   * The reason it is `replaceState`: a slider fires a change per notch, so
   * pushing would spend a history entry on every $500 of a drag and leave the
   * back button scrubbing through it instead of leaving the page.
   */
  it('replaces the address rather than pushing an entry per notch', () => {
    render(<App />);
    const before = window.history.length;
    for (const value of ['40000', '50000', '60000', '70000']) {
      fireEvent.change(incomeSlider(), { target: { value } });
    }
    settle();
    expect(window.location.search).toBe('?income=70000');
    expect(window.history.length).toBe(before);
  });

  /** What a refresh does, which is the other half of what the bullet asked for. */
  it('comes back on the same return after the page is thrown away', () => {
    const first = render(<App />);
    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    chooseFilingStatus('Married Filing Jointly');
    settle();
    const survived = window.location.search;
    first.unmount();

    render(<App />);
    expect(incomeSlider()).toHaveValue('90000');
    expect(screen.getByRole('radio', { name: 'Married Filing Jointly' })).toBeChecked();
    expect(window.location.search).toBe(survived);
  });

  /**
   * The step is a place on the page, not part of the return, so it rides in
   * the fragment the browser already scrolls to — and the rewritten address
   * has to keep it, because `replaceState` takes a whole URL. Every link this
   * page has ever copied off a step carries one, so dropping it on the first
   * slider move would quietly unshare the place while keeping the return.
   */
  it('keeps the fragment through a change to the return', () => {
    openAt('#step-torpedo');
    render(<App />);

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    settle();
    expect(window.location.hash).toBe('#step-torpedo');
    expect(window.location.search).toBe('?income=90000');
  });

  /**
   * The page reads no fragment itself any more — the nav that used to mark
   * the named step current is gone, and scrolling to an `id` is the browser's
   * own job. So a fragment naming a section this page never had, or one it
   * stopped having, has to be inert rather than an error: same page, same
   * return, and the browser leaves the reader at the top.
   */
  it('renders normally under a fragment that names no step', () => {
    for (const fragment of ['#step-medicare', '#step-gains', '#step-conversion']) {
      openAt(fragment);
      const { unmount } = render(<App />);
      expect(
        screen.getByRole('heading', { name: /your social security benefit/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      unmount();
    }
  });

  describe('a link this page could not honour', () => {
    it('says what it could not give and what it gave instead', () => {
      openAt('?income=99999999&filing=widow');
      render(<App />);

      const note = screen.getByRole('status');
      expect(note).toHaveTextContent('This link asked for something this page could not show');
      expect(note).toHaveTextContent('$1,000,000');
      expect(note).toHaveTextContent('“widow”');

      // And the page itself is showing exactly what the note says it is.
      expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
      expect(incomeSlider()).toHaveValue('1000000');
    });

    /**
     * Dismissible because it describes the arrival, not the return: it stops
     * being true of what is on screen the moment a control moves.
     */
    it('goes away when dismissed and never appears for a link it wrote itself', () => {
      openAt('?filing=widow');
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('stays out of the way of a link that came through as sent', () => {
      openAt('?income=90000');
      render(<App />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    /**
     * The year was a key for as long as it was a control. Every link this app
     * produced up to now carries one, and there is no longer anything to say
     * about it: no year to switch to means nothing to tell the reader.
     */
    it('says nothing about the year an older link still names', () => {
      openAt('?year=2024&income=90000');
      render(<App />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(incomeSlider()).toHaveValue('90000');
      // The stale key is dropped rather than echoed back.
      expect(window.location.search).toBe('?income=90000');
    });
  });
});

/**
 * The one thing on this page that is heard rather than read.
 *
 * Every readout here was silent: a range input announces its own new value and
 * nothing else, so the "you are here" sentence, the effective rate under it
 * and the six closing figures all changed under a screen
 * reader without a word. What is asserted below is as much about what the
 * region does *not* say — nothing on arrival, nothing mid-drag, and never two
 * steps' readings for one control — as about what it does.
 */
describe('the live reading under the controls', () => {
  /**
   * Full fake timers here, where the rest of the file fakes only the clock:
   * the settle delay is the subject, so it has to be advanced rather than
   * waited out. The system time still has to be set, because the app opens on
   * whatever year the calendar says.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${PAGE_TAX_YEAR}-07-01T00:00:00Z`));
  });

  const region = (): HTMLElement =>
    document.querySelector('.live-reading') as HTMLElement;

  /** Let whatever was last moved come to rest. */
  const settle = (): void => {
    act(() => {
      vi.advanceTimersByTime(READING_SETTLE_MS);
    });
  };

  /** A notch of a drag: not enough stillness to be read out. */
  const nudge = (): void => {
    act(() => {
      vi.advanceTimersByTime(READING_SETTLE_MS - 100);
    });
  };

  const slider = (name: RegExp): HTMLElement => screen.getByRole('slider', { name });
  const set = (name: RegExp, value: number): void => {
    fireEvent.change(slider(name), { target: { value: String(value) } });
  };
  const income = /other income \(excluding social security\)/i;
  const benefit = /social security benefit/i;

  it('is on the page before it has anything to say', () => {
    render(<App />);
    expect(region()).toBeInTheDocument();
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region().textContent).toBe('');
  });

  /**
   * A page that announces itself on arrival talks over the reader's own walk
   * down it. The close is meant to be read on the way past, not shouted on
   * the way in.
   */
  it('says nothing on arrival', () => {
    render(<App />);
    settle();
    expect(region().textContent).toBe('');
  });

  it('reads step 2 back once the income slider has settled', () => {
    render(<App />);
    set(income, 10_000);
    expect(region().textContent).toBe('');
    settle();
    expect(region()).toHaveTextContent(
      'At $10,000 of other income the next dollar is taxed at 0%',
    );
    expect(region()).toHaveTextContent('an effective rate of');
  });

  /**
   * The reason for the delay: a range input fires a change per notch, and a
   * polite region reads each one out in full before it looks at the next. A
   * drag across the axis has to be one sentence, and it has to be the sentence
   * about where the reader stopped.
   */
  it('reads the end of a drag rather than every notch of it', () => {
    render(<App />);
    set(income, 10_000);
    nudge();
    set(income, 20_000);
    nudge();
    set(income, 30_000);
    expect(region().textContent).toBe('');
    settle();
    expect(region()).toHaveTextContent('At $30,000 of other income');
    expect(region()).not.toHaveTextContent('$10,000 of other income');
    expect(region()).not.toHaveTextContent('$20,000 of other income');
  });

  /**
   * One region, carrying the step whose control moved. Step 1's benefit moves
   * every reading on the page, so a region per step would queue four
   * announcements for one drag — the noise this is built to avoid.
   */
  it('carries the reading of the step whose control moved, and only that one', () => {
    render(<App />);
    set(benefit, 30_000);
    settle();
    expect(region()).toHaveTextContent(
      '2026 brackets, a single filer, under 65, collecting $30,000 of Social Security per year.',
    );
    expect(region()).not.toHaveTextContent('the next dollar is taxed at');

    set(income, 50_000);
    settle();
    expect(region()).toHaveTextContent('At $50,000 of other income');
    expect(region()).not.toHaveTextContent('brackets, a single filer');
  });

  /**
   * The reading and the recap on screen describe the same return, in the same
   * words: the reading used to tack the advanced inputs on as bare labels
   * ("Muni interest $10,000") because the recap only pointed at them.
   */
  it('names the advanced inputs the way the recap on screen does', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Advanced inputs'));
    set(/tax-exempt \(municipal\) interest/i, 10_000);
    settle();
    expect(region()).toHaveTextContent(
      'collecting $24,852 of Social Security per year. Plus $10,000 in ' +
        'municipal interest.',
    );
    expect(region()).not.toHaveTextContent('Muni interest');
  });

});

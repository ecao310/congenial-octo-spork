import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import App, { CustomTooltip, READING_SETTLE_MS } from './App';
import { TAX_YEAR_PARAMS, TAX_YEARS, PAGE_TAX_YEAR } from './utils/tax';

/**
 * The page prices `PAGE_TAX_YEAR` and offers no way to change it, so every
 * figure asserted below is a figure for that year and this constant is the one
 * place to re-point them from when the year moves.
 *
 * The clock is still pinned to it. Nothing on the page reads `Date` any more,
 * but a stopped clock is what keeps a future figure derived from
 * `defaultTaxYear()` — the engine's own default, which does follow the
 * calendar — from making these assertions depend on the day they are run.
 */
const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PAGE_TAX_YEAR].avgAnnualSSBenefit;
const MAX_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PAGE_TAX_YEAR].maxAnnualSSBenefit;

beforeEach(() => {
  // Date only: React Testing Library needs the real setTimeout.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${PAGE_TAX_YEAR}-07-01T00:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The line that closes step 1 by naming the return every later step prices.
 * The year, the status, the ages and the benefit are each in their own
 * element, so these tests read the whole sentence rather than one text node.
 */
const scenarioRecap = (): HTMLElement =>
  screen.getByText(/^One year’s return:/);

/** Set the filing status, which the page keeps in one place: the strip. */
const chooseFilingStatus = (label: string): void => {
  fireEvent.click(screen.getByRole('radio', { name: label }));
};

describe('App', () => {
  /**
   * The benefit slider's own input group.
   *
   * The retroactive-award section quotes the same benefit figure in its
   * worksheet rows — a 12-month back-pay year is one annual benefit — so an
   * unscoped `getByText` on the benefit now matches four elements. Asserting
   * inside the slider's group says what these tests actually mean.
   */
  const benefitGroup = (): HTMLElement =>
    screen
      .getByRole('slider', { name: /social security benefit/i })
      .closest('.input-group') as HTMLElement;

  it('leads with what the page is for rather than with the settings', () => {
    render(<App />);
    const hero = screen.getByRole('heading', {
      name: /how much can you take out this year/i,
      level: 1,
    });
    expect(hero).toBeInTheDocument();

    // The subtitle used to name the filing status and the tax year, which made
    // the first thing on the page a readout of two controls the reader had not
    // reached yet. It now says why the next dollar is not priced at the rate
    // the reader came expecting, which is the whole page in one line.
    const subtitle = hero.nextElementSibling as HTMLElement;
    expect(subtitle).toHaveClass('subtitle');
    expect(subtitle).toHaveTextContent(/how Social Security is taxed/);
    expect(subtitle).toHaveTextContent(/different than what you might expect/);
    expect(subtitle).not.toHaveTextContent(/single filer/i);
    expect(subtitle).not.toHaveTextContent(/2025|2026/);

    // And it stays put when those controls move.
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(subtitle).not.toHaveTextContent(/married|2026/i);
  });

  it('renders the benefit slider defaulting to the 2026 average benefit', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue(String(AVG_ANNUAL_SS_BENEFIT));
    expect(within(benefitGroup()).getByText('$24,852')).toBeInTheDocument();
  });

  it('spans $0 to the 2026 maximum yearly benefit and shows avg/max labels', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(MAX_ANNUAL_SS_BENEFIT));
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    expect(screen.getByText('$62,172 (2026 max)')).toBeInTheDocument();
  });

  /**
   * Line 6a of a joint return holds both spouses' benefits, so both ends of
   * this slider and the marker between them are a couple's rather than one
   * person's. The ceiling doubles exactly — two maximum records — and the
   * average does not, because SSA's couple figure counts the spousal benefits
   * that are half a record rather than one.
   */
  describe('the benefit slider on a joint return', () => {
    const goJoint = (): void => {
      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    };

    it('doubles the ceiling and moves the average marker with it', () => {
      render(<App />);
      goJoint();
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      expect(slider).toHaveAttribute('max', '124344');
      expect(screen.getByText('$38,496 (2026 couple avg)')).toBeInTheDocument();
      expect(screen.getByText('$124,344 (2026 couple max)')).toBeInTheDocument();
      expect(screen.queryByText('$24,852 (2026 avg)')).not.toBeInTheDocument();
      // And the label says whose benefit is being set.
      expect(
        screen.getByLabelText(/Annual Social Security Benefit \(both spouses\)/),
      ).toBe(slider);
    });

    /**
     * A reader sitting on the average has accepted the marker rather than
     * chosen a number, so the marker takes them with it — and switching back
     * puts them exactly where they started.
     */
    it('carries a reader sitting on the average across to the couple average', () => {
      render(<App />);
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      expect(slider).toHaveValue('24852');
      goJoint();
      expect(slider).toHaveValue('38496');
      fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
      expect(slider).toHaveValue('24852');
      expect(slider).toHaveAttribute('max', '62172');
    });

    it('leaves a figure the reader set alone, and re-caps it on the way back', () => {
      render(<App />);
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      fireEvent.change(slider, { target: { value: '40000' } });
      goJoint();
      // Theirs, not the marker's, so it stays put where the average moved.
      expect(slider).toHaveValue('40000');

      fireEvent.change(slider, { target: { value: '100000' } });
      chooseFilingStatus('Single');
      // $100,000 is two benefits' worth and there is only one person on this
      // return now, so it comes back to the ceiling rather than standing past
      // the right edge of its own slider.
      expect(slider).toHaveValue('62172');
      expect(slider).toHaveAttribute('max', '62172');
      expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    });
  });

  it('updates the value, readout, and the axis the chart is drawn in', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    // The axis is total income, so the benefit is the fixed half of every
    // figure on it and the caption is where that half is named in dollars.
    expect(
      screen.getByText('Total income ($) including $24,852 of Social Security'),
    ).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '36000' } });
    expect(slider).toHaveValue('36000');
    expect(within(benefitGroup()).getByText('$36,000')).toBeInTheDocument();
    expect(
      screen.getByText('Total income ($) including $36,000 of Social Security'),
    ).toBeInTheDocument();
  });

  /**
   * The caption names what is inside a figure on the axis, and with no benefit
   * and nothing tax-exempt there is nothing inside it but the income the
   * slider moves. "Including $0 of Social Security" would be a sentence about
   * a zero, so the parts drop out one at a time and the axis keeps its name.
   */
  it('drops the caption’s clause when there is no benefit to name', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    expect(screen.getByText('Total income ($)')).toBeInTheDocument();

    // And the tax-exempt half stands on its own when it is the only part left.
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );
    expect(
      screen.getByText('Total income ($) including $5,000 of tax-exempt interest'),
    ).toBeInTheDocument();
  });

  it('renders a filing status selector defaulting to Single', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: /filing status/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Married Filing Jointly' }),
    ).not.toBeChecked();
    // The close repeats the status prose, so this asks the recap that closes
    // step 1 rather than the page.
    expect(scenarioRecap()).toHaveTextContent('a single filer');
  });

  /**
   * The page asks about two statuses and the strip is the whole question: no
   * menu beside it, and head of household and a separate return are gone from
   * the page rather than moved somewhere else on it. Asserted as an absence
   * across the whole document, because the failure worth catching is a note
   * or an explainer branch that outlived the option that reached it — the
   * strip losing an option would be caught by the list above either way.
   */
  it('offers two statuses and no way to reach the other two', () => {
    render(<App />);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'single',
      'mfj',
    ]);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const gone of [/head of household/i, /filing separately/i, /separate return/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('does not render a separate total federal tax panel', () => {
    render(<App />);
    expect(
      screen.queryByRole('heading', { name: /total federal tax paid/i }),
    ).not.toBeInTheDocument();
  });

  it('explains the tax torpedo with thresholds for the selected filing status and defaults to collapsed', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /what is the tax torpedo/i });
    const details = heading.closest('details') as HTMLElement;
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    /**
     * Scoped to the paragraph that quotes this return's own thresholds. The
     * last paragraph of the same explainer names all four bases as 86(c) wrote
     * them, which is the statute's history and does not follow the filing
     * status — so a page-wide "$25,000 is gone" would be asserting something
     * else, and would fail on prose that is correct.
     */
    const live = (): HTMLElement =>
      details.querySelector('.explainer-content p') as HTMLElement;

    expect(live()).toHaveTextContent(/provisional income passes \$25,000/);
    expect(live()).toHaveTextContent(/past \$34,000/);

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(live()).toHaveTextContent(/provisional income passes \$32,000/);
    expect(live()).toHaveTextContent(/past \$44,000/);
    expect(live()).not.toHaveTextContent('$25,000');
  });

  /**
   * The page used to open with a 2025/2026 picker, and clicking it was the only
   * way to watch the COLA raise the benefit while 86(c)'s bases sat still. That
   * is the app's own subject, so it is stated where a reader meets it rather
   * than left to whoever thinks to click twice and compare.
   */
  it('says the thresholds are frozen where the picker used to show it', () => {
    render(<App />);
    const frozen = screen.getByText(/The thresholds have not moved/).closest('p');
    expect(frozen).toHaveTextContent('IRC 86(c) set $25,000 and $32,000 in 1983');
    expect(frozen).toHaveTextContent('$34,000 and $44,000 in 1993');
    expect(frozen).toHaveTextContent('Neither has ever been indexed');
    expect(frozen).toHaveTextContent(`This page prices ${PAGE_TAX_YEAR}`);
    // It is the same explainer the live thresholds are in, not a fifth block.
    expect(frozen?.closest('details')).toBe(
      screen.getByRole('heading', { name: /what is the tax torpedo/i }).closest('details'),
    );
  });

  it('lists strategies to mitigate the tax torpedo and defaults to collapsed', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /how to mitigate the tax torpedo/i });
    expect(heading).toBeInTheDocument();
    const details = heading.closest('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    expect(screen.getByText('Spend from Roth accounts.')).toBeInTheDocument();
    expect(screen.getByText('Spend from taxable accounts.')).toBeInTheDocument();
    expect(
      screen.getByText("If you can't go under it, go past it."),
    ).toBeInTheDocument();
  });

  it('switches to Married Filing Jointly', () => {
    render(<App />);
    const mfj = screen.getByRole('radio', { name: 'Married Filing Jointly' });
    fireEvent.click(mfj);
    expect(mfj).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Single' })).not.toBeChecked();
    expect(scenarioRecap()).toHaveTextContent('a married couple filing jointly');
  });

  it('renders the tax advice disclaimer footer', () => {
    render(<App />);
    expect(
      screen.getByText(/not constitute tax or financial advice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/consult a qualified tax professional/i),
    ).toBeInTheDocument();
  });

  it('renders the ordinary income slider defaulting to $30,000', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(not social security\)/i,
    });
    expect(slider).toHaveValue('30000');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '150000');
  });

  it('offers an age 65 or older toggle, off by default, that widens the standard deduction', () => {
    render(<App />);
    const senior = screen.getByRole('checkbox', { name: 'Age 65 or older' });
    expect(senior).not.toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $16,100. Turning 65 adds $2,050.',
    );

    fireEvent.click(senior);
    expect(senior).toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $18,150 — $16,100 base plus $2,050 for age 65 or older.',
    );
  });

  it('offers the second spouse toggle only for MFJ, and only once the first is on', () => {
    render(<App />);
    expect(
      screen.queryByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    const spouse = screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' });
    expect(spouse).toBeDisabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $32,200. Turning 65 adds $1,650 per qualifying spouse.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(spouse).toBeEnabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $33,850 — $32,200 base plus $1,650 for age 65 or older.',
    );

    fireEvent.click(spouse);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $35,500 — $32,200 base plus $3,300 for age 65 or older.',
    );
  });

  it('describes the senior deduction and its phaseout beside the age toggle', () => {
    render(<App />);
    expect(screen.getByText(/^Filers 65 or older/)).toHaveTextContent(
      'Filers 65 or older also get the temporary senior deduction — $6,000 each, for tax years 2025–2028 only.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(screen.getByText(/^Senior deduction/)).toHaveTextContent(
      'Senior deduction $6,000 on top of that, shrinking by 6¢ per dollar of MAGI above $75,000 and gone at $175,000. It expires after tax year 2028.',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    // Two spouses lose 6¢ each, so the couple's $12,000 is gone $100,000 past
    // the threshold rather than $200,000 past it.
    expect(screen.getByText(/^Senior deduction/)).toHaveTextContent(
      'Senior deduction $12,000 ($6,000 per spouse) on top of that, shrinking by 12¢ per dollar of MAGI above $150,000 (6¢ for each spouse) and gone at $250,000. It expires after tax year 2028.',
    );
  });

  it('explains the senior deduction phaseout in a collapsed section', () => {
    render(<App />);
    const explainer = () =>
      screen
        .getByRole('heading', { name: /the senior deduction phaseout/i })
        .closest('details');

    expect(explainer()).toBeInTheDocument();
    expect(explainer()).not.toHaveAttribute('open');

    // 22% amplified by the 6% phaseout, and again by the torpedo's 1.85x.
    expect(explainer()).toHaveTextContent('$1.06');
    expect(explainer()).toHaveTextContent('23.32%');
    expect(explainer()).toHaveTextContent('$1.96');
    expect(explainer()).toHaveTextContent('43.14%');
    expect(explainer()).toHaveTextContent('gone at $175,000');
    // At the average benefit, MAGI at the right edge of the chart is $170,155,
    // so the far side of the phaseout is off-chart.
    expect(explainer()).toHaveTextContent('sits past the right edge of the chart');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    expect(explainer()).toHaveTextContent('24.64%');
    expect(explainer()).toHaveTextContent('45.58%');
    expect(explainer()).toHaveTextContent('gone at $250,000');
  });

  it('renders a tax-exempt interest slider defaulting to zero', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /tax-exempt \(municipal\) interest/i,
    });
    expect(slider).toHaveValue('0');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '50000');
    expect(
      screen.getByText(/^Municipal bond interest never enters taxable income/),
    ).toBeInTheDocument();
  });

  it('adds the tax-exempt interest to the chart’s axis caption', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );

    expect(
      screen.getByText(
        'Total income ($) including $24,852 of Social Security and ' +
          '$5,000 of tax-exempt interest',
      ),
    ).toBeInTheDocument();
  });

  it('updates the ordinary income slider readout when moved', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(not social security\)/i,
    });
    fireEvent.change(slider, { target: { value: '50000' } });
    expect(slider).toHaveValue('50000');
  });
});

describe('the step flow', () => {
  /**
   * The whole point of the rewrite: the steps scroll rather than swap, so
   * every one of them is on the page at once. A reader on step 2 can scroll
   * back to the benefit they set in step 1, and Ctrl-F reaches all of it.
   */
  it('renders every step at once', () => {
    render(<App />);
    for (const name of [/your social security benefit/i, /^the tax torpedo$/i]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  /**
   * The two steps that came off the page: capital-gains stacking and the
   * conversion sizer. Their arithmetic is still in `utils/tax.ts` and still
   * under test there — what is gone is every trace of them a reader could
   * reach.
   */
  it('renders nothing of the steps that came off the page', () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: /capital gains stacking/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /sizing the conversion/i })).toBeNull();
    expect(document.getElementById('step-gains')).toBeNull();
    expect(document.getElementById('step-conversion')).toBeNull();
    expect(
      screen.queryByRole('slider', { name: /long-term capital gains/i }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: /bracket/i })).toBeNull();
  });

  /**
   * The nav and the next-step box, both gone.
   *
   * They were the price of length: a sticky strip marking which of four
   * sections you were in, and a box at the foot of each one naming the next.
   * Two sections on one scroll are not a walk anyone can be lost in, so both
   * were furniture — and the box was the worse of the two, because it took a
   * screen's width and four lines of prose to move the reader past a single
   * heading they could see from where they stood.
   *
   * Asserted as a shape rather than by class name: no toolbar anywhere, and
   * no button whose label counts steps. Putting either back under a different
   * name fails here.
   */
  it('offers nothing that navigates between the steps', () => {
    render(<App />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      screen.queryAllByRole('button').filter((b) => /step \d+ of/i.test(b.textContent ?? '')),
    ).toEqual([]);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  /**
   * The steps still number themselves, which is the whole of what the nav was
   * telling anyone: two of them, in this order. A kicker over each heading
   * says it without asking to be clicked.
   */
  it('still numbers both steps where each one starts', () => {
    const { container } = render(<App />);
    expect(
      Array.from(container.querySelectorAll('.step-kicker')).map((el) => el.textContent),
    ).toEqual(['Step 1 of 2', 'Step 2 of 2']);
  });

  /**
   * Both steps price the same return, and the inputs that set it are spread
   * across the page — the benefit in step 1, other income in step 2. Nothing
   * unmounts either, or a figure set in step 1 would be gone by the time the
   * close quoted it.
   */
  it('keeps every input mounted at once', () => {
    render(<App />);
    const income = screen.getByRole('slider', { name: /other income \(not social security\)/i });
    fireEvent.change(income, { target: { value: '90000' } });

    expect(
      screen.getByRole('slider', { name: /social security benefit/i }),
    ).toBeInTheDocument();
    expect(income).toHaveValue('90000');
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
  });
});

/**
 * Every step is laid out the same way, and this is the test of it.
 *
 * chart \u2192 the one control that says where on that chart you are \u2192 the
 * collapsed explainers. Step 1 has no curve of its own, so it starts at the
 * control. A control above its chart reads as an input to the chart, which
 * is exactly what it is not \u2014 the chart already prices every value the
 * control can take.
 */
describe('the shape every step shares', () => {
  /** The step's own landmarks in DOM order, runs of a kind collapsed. */
  const landmarks = (id: string): string[] => {
    const section = document.getElementById(id) as HTMLElement;
    const kinds = Array.from(
      section.querySelectorAll('.chart-container, input[type="range"], details'),
    )
      // A control inside a disclosure is that disclosure's business, not the
      // step's: the shape is about what the reader meets on the way down.
      .filter((el) => el.tagName === 'DETAILS' || el.closest('details') === null)
      .map((el) =>
        el.classList.contains('chart-container')
          ? 'chart'
          : el.tagName === 'DETAILS'
            ? 'details'
            : 'control',
      );
    return kinds.filter((kind, i) => kind !== kinds[i - 1]);
  };

  it('lays the charted step out chart, control, explainers', () => {
    render(<App />);
    expect(landmarks('step-torpedo')).toEqual(['chart', 'control', 'details']);
  });

  /**
   * Step 1 draws nothing, so the return it sets stands where a chart stands.
   * What it still owes the shape is the ordering of the rest: one control on
   * screen, the disclosure after it.
   */
  it('gives the uncharted step the same tail', () => {
    render(<App />);
    expect(landmarks('step-benefit')).toEqual(['control', 'details']);
  });

  it('puts the step’s control on the axis its own chart sweeps', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(not social security\)/i,
    });
    expect(document.getElementById('step-torpedo')?.contains(slider)).toBe(true);
  });

  /**
   * The readout is what makes the slider more than an inert control: it reads
   * the drawn curve back at the value the reader picked, which is the number
   * the chart cannot show them without being pointed at.
   */
  it('reads the torpedo curve back at the reader’s own income', () => {
    render(<App />);
    const readout = (): HTMLElement =>
      document.querySelector('#step-torpedo .slider-readout') as HTMLElement;
    expect(readout()).toHaveTextContent('At $30,000 of other income');

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '90000' } },
    );
    expect(readout()).toHaveTextContent('At $90,000 of other income');
    expect(readout()).toHaveTextContent(/taxed at\s+\d+(\.\d+)?%/);
  });

  /**
   * The readout opens on the figure, not on a label for it.
   *
   * "You are here." led this paragraph for as long as it existed, and it was
   * the third thing on screen saying so: the dashed amber marker crosses the
   * curve at this point, the amber slider sits directly above, and the amber
   * figure beside the slider's label names the same income. Worse, it was
   * bold — the same weight as the rate, the tax and the effective rate — so
   * the phrase the paragraph stressed hardest was the only one with no figure
   * in it.
   *
   * Anchored at the start rather than asserted absent from the document: the
   * 400% explainer opens a paragraph the same way about a MAGI figure, and it
   * is a section lead inside a disclosure rather than a label on the chart.
   */
  it('opens on the reader’s income rather than a label for it', () => {
    render(<App />);
    const readout =
      document.querySelector('#step-torpedo .slider-readout') as HTMLElement;
    expect(readout).toHaveTextContent(/^At \$30,000 of other income/);
    expect(readout.querySelector('strong')).toHaveTextContent('22.2%');
  });
});

/**
 * The chart says what every income costs; this says what the reader's own
 * income costs and which way it is worth moving. The tooltip has carried the
 * same arithmetic all along, but only for whichever point a mouse was over —
 * which is nobody's point in particular, and no point at all on a touchscreen.
 *
 * Figures below are 2026, single, the $24,852 average benefit: the rate rises
 * 0% to $14,750, 15%, 18.5%, then the hump at 22.2% from $22,750 to $40,500,
 * a 12% valley to $44,000, 22% to $98,750, and 24% past that.
 */
describe('the advice under the slider', () => {
  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(not social security\)/i });
  const advice = (): HTMLElement =>
    document.querySelector('#step-torpedo .slider-advice') as HTMLElement;
  const setIncome = (value: number): void => {
    fireEvent.change(incomeSlider(), { target: { value: String(value) } });
  };

  it('sits with the slider it is keyed to, under the readout', () => {
    render(<App />);
    const group = incomeSlider().closest('.input-group') as HTMLElement;
    expect(group.contains(advice())).toBe(true);
    expect(
      advice().compareDocumentPosition(
        group.querySelector('.slider-readout') as HTMLElement,
      ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('names both ways off the hump when the reader is standing on it', () => {
    render(<App />);
    // The default $30,000 opens the page mid-hump, which is the whole point.
    expect(advice()).toHaveTextContent('You are standing on the hump');
    expect(advice()).toHaveTextContent(
      'it holds from $23,000 to $41,000',
    );
    expect(advice()).toHaveTextContent(
      'Coming back under $23,000 — $7,000 less income — takes the next dollar down to 18.5%',
    );
    expect(advice()).toHaveTextContent(
      'clearing $41,250 — $11,250 more — takes it to 12%',
    );
  });

  it('measures the room left when the reader is on the valley floor', () => {
    render(<App />);
    setIncome(10_000);
    expect(advice()).toHaveTextContent('You are on the valley floor');
    expect(advice()).toHaveTextContent(
      'every dollar up to $15,000 — $5,000 of room from here',
    );
    expect(advice()).toHaveTextContent('climbs to 22.2% by $23,000');
  });

  it('measures the distance left when the reader is on the climb', () => {
    render(<App />);
    setIncome(20_000);
    expect(advice()).toHaveTextContent('You are on the climb');
    expect(advice()).toHaveTextContent(
      '$3,000 further on — at $23,000 — the rate reaches 22.2%',
    );
  });

  /**
   * Past the hump the advice is about deferral, and it has to name the
   * *nearest* cheaper ground rather than the cheapest: the cheapest is the run
   * below the standard deduction, which is true and useless. Here that is the
   * 12% valley the reader has just cleared, not the 0% floor at the far left.
   */
  it('prices deferral against the nearest cheaper ground once the hump is behind', () => {
    render(<App />);
    setIncome(60_000);
    expect(advice()).toHaveTextContent('The hump is behind you');
    expect(advice()).toHaveTextContent(
      'against 22.2% back between $23,000 and $41,000',
    );
    expect(advice()).toHaveTextContent(
      'nearest cheaper ground on this chart is 12% between $41,250 and $45,250',
    );
    expect(advice()).toHaveTextContent('costs 12% rather than 22%');
    expect(advice()).not.toHaveTextContent('0% between');
  });

  it('says there is no hump when there is no benefit to drag in', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    setIncome(40_000);
    expect(advice()).toHaveTextContent('This return has no hump');
    expect(advice()).toHaveTextContent(
      'The next dollar costs 12%, and holds there to $66,500',
    );
    expect(advice()).not.toHaveTextContent('hump is behind you');
  });

  it('moves the reader through all four positions on one curve', () => {
    render(<App />);
    const opening = (): string =>
      advice().querySelector('strong')?.textContent ?? '';
    setIncome(0);
    expect(opening()).toBe('You are on the valley floor.');
    setIncome(20_000);
    expect(opening()).toBe('You are on the climb.');
    setIncome(30_000);
    expect(opening()).toBe('You are standing on the hump.');
    setIncome(60_000);
    expect(opening()).toBe('The hump is behind you.');
  });
});

/**
 * What a chart says to a reader who cannot see it.
 *
 * A recharts chart is an SVG of unlabelled paths, so without a name the app's
 * centrepiece says nothing at all to a screen reader. The plot is one image
 * carrying one label: what is being plotted, and how far its axis runs.
 *
 * The band-by-band caption that sat under the figure until now — "0% up to
 * $14,750, 15% to $21,500, …" — is off the page. What states where the hump
 * is now is the advice under the slider, which says it relative to where the
 * reader is standing rather than as a run of every band on the curve.
 *
 * Figures below are 2026, single, the $24,852 average benefit, the same return
 * the advice tests read.
 */
describe('the charts as images', () => {
  const charts = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('.chart-container'));
  const chart = (step: 'torpedo'): HTMLElement =>
    document.querySelector(`#step-${step} .chart-container`) as HTMLElement;

  it('names the plot, and points at no description that is gone', () => {
    render(<App />);
    expect(charts()).toHaveLength(1);
    // The plot is one image with a name, not a tree of unlabelled paths.
    expect(chart('torpedo')).toHaveAttribute('role', 'img');
    expect(chart('torpedo').getAttribute('aria-label')).toMatch(/^Chart: /);
    // An aria-describedby whose target no longer renders is worse than none:
    // it promises a long description and resolves to nothing.
    expect(chart('torpedo')).not.toHaveAttribute('aria-describedby');
    expect(document.querySelector('figcaption')).toBeNull();
  });

  it('names the axis it plots, both halves of it, and where it stops', () => {
    render(<App />);
    // The axis is total income, so the name has to say what a figure on it is
    // made of: a benefit that stays put and other income that the slider
    // moves. Reading "$24,852 to $174,852" alone tells a listener nothing
    // about which of the two they control.
    expect(chart('torpedo').getAttribute('aria-label')).toBe(
      'Chart: the marginal tax rate on the next dollar of other income, ' +
        'plotted against total income from $24,852 to $174,852 — a fixed ' +
        '$24,852 of Social Security plus $0 to $150,000 of other income.',
    );
    // The axis is sized to the return, and the label follows it out — here by
    // the senior deduction's phaseout, which runs to $175,000 of MAGI.
    fireEvent.click(screen.getByRole('checkbox', { name: /65 or older/i }));
    expect(chart('torpedo').getAttribute('aria-label')).toMatch(
      /plus \$0 to \$1(7|8)\d,\d{3} of other income\.$/,
    );
  });
});

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
    set(/other income \(not social security\)/i, 90_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $15,617 in federal tax on $114,852 of total income — an effective rate of 13.6%',
    );
  });

  /**
   * The denominator is the total income the axis label under step 2's chart
   * already defines, and for the same reasons: tax-exempt interest is money
   * received, and a charitable distribution is money that leaves the IRA
   * without ever reaching the filer.
   */
  it('counts tax-exempt interest as income received', () => {
    render(<App />);
    set(/tax-exempt \(municipal\) interest/i, 10_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $3,839 in federal tax on $64,852 of total income',
    );
  });

  it('leaves a charitable distribution out of it', () => {
    render(<App />);
    set(/other income \(not social security\)/i, 90_000);
    set(/qualified charitable distribution/i, 20_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $11,217 in federal tax on $94,852 of total income',
    );
  });

  it('says nothing at all when nothing comes in', () => {
    render(<App />);
    set(/social security benefit/i, 0);
    set(/other income \(not social security\)/i, 0);
    expect(readout('torpedo')).not.toHaveTextContent('of total income');
    expect(readout('torpedo')).not.toHaveTextContent('effective rate');
  });
});

/**
 * The scenario block opens on five inputs and hides two.
 *
 * A closed `<details>` still renders its children into jsdom, so every other
 * test in this file reaches those two sliders exactly as it did before the
 * split — which means nothing here can be inferred from the rest of the suite
 * passing. These tests assert the split itself: which inputs are inside the
 * disclosure, that it starts shut, and that shutting it never hides a value
 * that has been set.
 */
describe('advanced inputs', () => {
  // "Advanced inputs" is also the name two sections use when they point a
  // reader at a slider they cannot see, so pin the summary's own label.
  const advanced = (): HTMLElement =>
    screen
      .getByText('Advanced inputs', { selector: '.advanced-label' })
      .closest('details') as HTMLElement;

  /** The status line beside the label — what the section still says while shut. */
  const advancedState = (): HTMLElement =>
    advanced().querySelector('.advanced-state') as HTMLElement;

  it('starts collapsed', () => {
    render(<App />);
    expect(advanced()).toBeInTheDocument();
    expect(advanced()).not.toHaveAttribute('open');
  });

  /**
   * The line that justifies the whole disclosure: at their defaults both of
   * these change nothing, so there is nothing to see until one is moved.
   */
  it('reports both sitting at their defaults', () => {
    render(<App />);
    expect(advancedState()).toHaveTextContent('Both at $0');
  });

  it('holds the two inputs that belong to no chart axis', () => {
    render(<App />);
    const inside = within(advanced());
    expect(inside.getByLabelText('Tax-Exempt (Municipal) Interest')).toHaveValue(
      '0',
    );
    expect(inside.getByLabelText('Qualified Charitable Distribution')).toHaveValue(
      '0',
    );
    expect(
      inside.queryByLabelText('Long-Term Capital Gains Inside That Income'),
    ).toBeNull();
  });

  /**
   * The complement, and the more important half. Two things earn a slider its
   * place on screen: it moves the opening picture, or it is the point on a
   * chart the reader is standing at.
   */
  it('leaves the inputs that move the opening picture on screen', () => {
    render(<App />);
    for (const label of [
      'Annual Social Security Benefit',
      'Other Income (not Social Security)',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBeNull();
    }
    for (const legend of ['Filing Status', 'Age']) {
      expect(screen.getByRole('group', { name: legend }).closest('details')).toBeNull();
    }
  });

  it('names each input that has been moved off zero', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '5000' } },
    );
    expect(advancedState()).toHaveTextContent('Muni interest $5,000');
    expect(advancedState()).not.toHaveTextContent('Charitable');

    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '3000' },
    });
    expect(advancedState()).toHaveTextContent(
      'Muni interest $5,000 \u00B7 Charitable $3,000',
    );

    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '0' } },
    );
    expect(advancedState()).not.toHaveTextContent('Muni interest');
    expect(advancedState()).toHaveTextContent('Charitable $3,000');
  });

  /**
   * A joint return's charitable limit is twice everyone else's, so leaving it
   * and coming back re-caps the gift. That re-cap happens whether or not the
   * section is open, which is precisely when a summary that goes stale would
   * mislead.
   */
  it('follows a value the app clamps behind its back', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '150000' },
    });
    expect(advancedState()).toHaveTextContent('Charitable $150,000');

    fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
    expect(advancedState()).toHaveTextContent('Charitable $111,000');
  });

  /**
   * The disclosure sits at the foot of step 1 and the step below it prices off
   * what is in there, so a value set once has to survive everything the reader
   * does further down the page — which used to mean stepping through the nav
   * and now means working step 2's own slider.
   */
  it('keeps its values while the reader works the step below', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '9000' } },
    );
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '90000' } },
    );
    expect(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
    ).toHaveValue('9000');
    expect(advancedState()).toHaveTextContent('Muni interest $9,000');
  });
});

describe('Tooltip Recommendations', () => {
  const mockOrdinarySegments = [
    { rate: 0, start: 0, end: 14000, points: [], type: 'valley' as const },
    { rate: 15, start: 16000, end: 22000, points: [], type: 'flat' as const },
    { rate: 22.2, start: 24000, end: 40000, points: [], type: 'hill' as const },
    { rate: 12, start: 42000, end: 44000, points: [], type: 'valley' as const },
  ];

  describe('CustomTooltip', () => {
    it('does not render if not active', () => {
      const { container } = render(
        <CustomTooltip
          active={false}
          ssBenefit={20000}
          segments={mockOrdinarySegments}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders normal information without recommendation on a flat segment', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      // The head names the axis figure and then takes it apart, because the
      // chart's x is total income and neither half is readable off it.
      expect(
        screen.getByText(/Total income \$44,852 · \$24,852 SS \+ \$20,000 other income/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Marginal Rate:/)).toBeInTheDocument();
      expect(screen.queryByText(/Consider avoiding/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Consider filling out/)).not.toBeInTheDocument();
    });

    it('renders tax hill recommendation on a hill segment', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 30000, marginalRate: 22.2, totalTax: 2813 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      expect(
        screen.getByText(
          /Consider avoiding this tax hill by staying under \$24,000 or over \$40,000/,
        ),
      ).toBeInTheDocument();
    });

    it('renders tax valley recommendation on a valley segment', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 42000, marginalRate: 12, totalTax: 5330 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      expect(
        screen.getByText(/Consider filling out this tax valley at \$42,000/),
      ).toBeInTheDocument();
    });

    it('reports no IRMAA surcharge and the room left below the first cliff', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      // Provisional income is $20,000 + half the $24,852 benefit = $32,426,
      // $7,426 over the $25,000 base, so $3,713 of the benefit is taxable and
      // MAGI is $23,713 — against a 2026 first cliff of $109,000.
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(
        screen.getByText(/\$85,287 of MAGI to the next cliff, then \$1,148\/yr more/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/tier .* of 5/)).not.toBeInTheDocument();
    });

    it('annualizes the Part B and Part D surcharge once past a cliff', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      // $90,000 + the capped $21,124.20 of benefits clears $109,000 of MAGI.
      expect(screen.getByText('$1,148/yr')).toBeInTheDocument();
      expect(screen.getByText(/tier 1 of 5/)).toBeInTheDocument();
      expect(
        screen.getByText(/\$25,876 of MAGI to the next cliff, then \$1,736\/yr more/),
      ).toBeInTheDocument();
    });

    /**
     * The 400% line, priced at the hovered point rather than drawn across the
     * axis. This is where the poverty-line cliff went when the lines came off
     * the chart by default: 36B reads a MAGI of its own — the whole benefit,
     * taxed or not — so it is a third assessment of the same point rather than
     * a rescaling of Medicare's, and a reader who never switches the line on
     * still meets it on hover.
     */
    it('measures the hovered point against the 400% poverty line', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
          preMedicare
        />,
      );
      // 36B household income is $20,000 + the whole $24,852 benefit = $44,852,
      // against a one-person cliff of $62,600.
      expect(
        screen.getByText(
          /\$17,748 of household income to the 400% poverty line, then the credit is gone/,
        ),
      ).toBeInTheDocument();
    });

    it('says the credit is gone once the hovered point is past the line', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
          preMedicare
        />,
      );
      expect(
        screen.getByText(/Past the 400% poverty line — no Marketplace premium tax credit/),
      ).toBeInTheDocument();
    });

    it('leaves the line out for a return that is already on Medicare', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
        />,
      );
      // 36B(c)(2)(B): nobody enrolled in Medicare is eligible for the credit,
      // so there is nothing to measure and the row is not drawn.
      expect(screen.queryByText(/poverty line/)).not.toBeInTheDocument();
    });

    it('adds tax-exempt interest back and doubles the surcharge for a couple', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={24852}
          segments={mockOrdinarySegments}
          filingStatus="mfj"
          muniInterest={10000}
          beneficiaries={2}
        />,
      );
      // A joint return is nowhere near $218,000 here, so nothing is owed - but
      // the tax-exempt interest still counts toward the MAGI that decides it.
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(
        screen.getByText(/\$96,876 of MAGI to the next cliff, then \$2,297\/yr more/),
      ).toBeInTheDocument();
    });
  });

  /**
   * The bug this pins: the tooltip and the axis label each spelled out "total
   * income" for themselves, and only one of the two spelled it out right. With
   * $10,000 of tax-exempt interest set, the tooltip said $54,852 where the
   * sentence under the same chart said $64,852 — for the same return, a foot
   * apart on the page. Both now read `totalIncomeFor`.
   */
  describe('what the tooltip calls total income', () => {
    it('counts tax-exempt interest and drops the gift', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 40_000, marginalRate: 22.2, totalTax: 3_000 } }]}
          ssBenefit={24_852}
          segments={mockOrdinarySegments}
          filingStatus="single"
          muniInterest={10_000}
          qcd={5_000}
          year={PAGE_TAX_YEAR}
        />,
      );
      // $40,000 of other income - $5,000 given away + $24,852 of benefit +
      // $10,000 of tax-exempt interest.
      expect(screen.getByText(/Total income \$69,852/)).toBeInTheDocument();
    });

    it('falls back to income plus benefit when nothing else is set', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 30_000, marginalRate: 22.2, totalTax: 2_819 } }]}
          ssBenefit={24_852}
          segments={mockOrdinarySegments}
        />,
      );
      expect(screen.getByText(/Total income \$54,852/)).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  The line that closes step 1                                        */
/* ------------------------------------------------------------------ */

/**
 * The hero says what the page is for; this says what it is currently pricing.
 * The two used to be one sentence, which meant the first thing on the page was
 * a readout of controls the reader had not scrolled to yet.
 */
describe('scenario recap', () => {
  it('closes step 1, on the way into the next one', () => {
    render(<App />);
    const recap = scenarioRecap();
    expect(recap.closest('section')).toHaveAttribute('id', 'step-benefit');
    // The last thing in the step, now that the box that followed it is gone.
    expect(recap.nextElementSibling).toBeNull();
  });

  it('names the return the defaults describe', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a single ' +
        'filer, under 65, collecting $24,852 of Social Security per year.',
    );
  });

  it('follows the status and the benefit', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '48000' } },
    );
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a married ' +
        'couple filing jointly, under 65, collecting $48,000 of Social ' +
        'Security per year.',
    );
  });

  /**
   * One qualifying spouse and two are different returns — one senior deduction
   * against two, and the standard-deduction addition once against twice — so
   * the joint case gets its own wording rather than a bare "65 or older".
   */
  it('distinguishes one senior from two on a joint return', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(scenarioRecap()).toHaveTextContent('one spouse 65 or older');

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    );
    expect(scenarioRecap()).toHaveTextContent('both spouses 65 or older');
  });

  it('says 65 or older once for a return with only one filer', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(scenarioRecap()).toHaveTextContent('a single filer, 65 or older,');
  });

  it('says so when there is no benefit at all', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    expect(scenarioRecap()).toHaveTextContent(
      'collecting no Social Security at all.',
    );
    expect(scenarioRecap()).not.toHaveTextContent('$0 of Social Security');
  });

  /**
   * The recap used to end at the benefit and then point at the disclosure —
   * "Plus whatever is set under Advanced inputs above" — which is a pointer at
   * a section that is shut by default, in the one sentence whose job is to say
   * what is being priced. It names the figures now.
   */
  it('names an advanced input once it is set, and only then', () => {
    render(<App />);
    expect(scenarioRecap()).not.toHaveTextContent('municipal interest');
    expect(scenarioRecap()).not.toHaveTextContent('Advanced inputs');

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '5000' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'collecting $24,852 of Social Security per year. Plus $5,000 in ' +
        'municipal interest.',
    );

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '0' },
    });
    expect(scenarioRecap()).not.toHaveTextContent('municipal interest');
    expect(scenarioRecap()).not.toHaveTextContent('Plus');
  });

  it('names the gift, which the benefit and the interest do not cover', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '26750' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'collecting $24,852 of Social Security per year. Plus $26,750 in ' +
        'qualified charitable distributions.',
    );
  });

  /**
   * Two figures behind one "Plus" take a bare "and", and the bullet that asked
   * for this named both advanced inputs at once — so the whole recap, from the
   * year to the gift, is worth pinning end to end once.
   */
  it('names both advanced inputs in the sentence they share', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '38500' } },
    );
    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '3750' },
    });
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '26750' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a married ' +
        'couple filing jointly, one spouse 65 or older, collecting $38,500 ' +
        'of Social Security per year. Plus $3,750 in municipal interest and ' +
        '$26,750 in qualified charitable distributions.',
    );
  });

  /**
   * The two figures a reader set by hand get a sentence of their own rather
   * than two more clauses hung off the filer: the first sentence describes a
   * filer, and these are neither facts about the filer nor a fifth thing of
   * the same kind. The full stop before "Plus" is the whole difference, so it
   * is pinned rather than left to a substring that would pass either way.
   */
  it('starts a second sentence rather than extending the first', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '26750' },
    });
    expect(scenarioRecap().textContent).toMatch(/per year\. Plus \$26,750/);
    expect(scenarioRecap().textContent).not.toMatch(/per year,/);
  });

  it('keeps the no-benefit reading a sentence when an input is set', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '5000' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'collecting no Social Security at all. Plus $5,000 in municipal ' +
        'interest.',
    );
  });
});

/**
 * The year used to be a two-button segmented control at the top of step 1, and
 * clicking it re-priced the whole page. It is a constant now: the comparison it
 * demonstrated — the COLA raising the benefit while IRC 86(c)'s bases sit still
 * — is the page's subject rather than one of its inputs, and is made in prose
 * under step 2 where a reader meets it without having to think to click twice.
 */
describe('the year the page prices', () => {
  it('offers no way to change it', () => {
    render(<App />);
    expect(screen.queryByRole('group', { name: /tax year/i })).toBeNull();
    for (const year of TAX_YEARS) {
      expect(screen.queryByRole('radio', { name: String(year) })).toBeNull();
    }
  });

  it('names PAGE_TAX_YEAR in the recap and prices the deduction for it', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent(
      `${PAGE_TAX_YEAR} brackets and standard deduction`,
    );
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $16,100. Turning 65 adds $2,050.',
    );
  });

  it('opens the benefit slider on that year’s average, running to its maximum', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue('24852');
    expect(slider).toHaveAttribute('max', '62172');
    expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    expect(screen.getByText('$62,172 (2026 max)')).toBeInTheDocument();
  });

  /**
   * The point of `PAGE_TAX_YEAR` being a constant rather than `defaultTaxYear()`:
   * a page built on the wall calendar would re-price itself the January after a
   * new Rev. Proc. landed, and the link a reader sent in December would mean
   * something else by then. Every other test here pins the clock; this one does
   * not, so a drifting figure would fail it wherever the calendar stands.
   */
  it('does not follow the wall calendar', () => {
    vi.useRealTimers();
    render(<App />);
    expect(TAX_YEARS).toContain(PAGE_TAX_YEAR);
    expect(scenarioRecap()).toHaveTextContent(
      `${PAGE_TAX_YEAR} brackets and standard deduction`,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Qualified charitable distributions                                */
/* ------------------------------------------------------------------ */

describe('qualified charitable distribution', () => {
  const qcdSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /qualified charitable distribution/i });

  /** The note under the slider. "Capped at" appears in other sections too. */
  const qcdNote = (): HTMLElement =>
    qcdSlider().closest('.input-group')!.querySelector('.field-note')!;

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(screen.getByRole('slider', { name }), { target: { value } });
  };

  it('runs from $0 to the 2026 annual limit', () => {
    render(<App />);
    expect(qcdSlider()).toHaveValue('0');
    expect(qcdSlider()).toHaveAttribute('min', '0');
    expect(qcdSlider()).toHaveAttribute('max', '111000');
    expect(qcdNote()).toHaveTextContent('Capped at $111,000 for 2026');
  });

  /**
   * The slider used to stop at `min(limit, axisMax)`, so a joint return's
   * $216,000 was cut off at the chart's $150,000 domain — the chart clipping
   * the statute. Now the statute sets the slider and the chart follows.
   */
  it('doubles the limit on a joint return and runs the slider all the way to it', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    expect(qcdSlider()).toHaveAttribute('max', '222000');
    expect(qcdNote()).toHaveTextContent('Capped at $222,000 for 2026');
    expect(qcdNote()).toHaveTextContent(/caps it per individual/);
  });

  /**
   * And the other half of the same change: a gift the old axis could not hold
   * has to widen the axis, or it is a slider whose whole effect is off the
   * right edge of every chart. The gift comes off the front of the income, so
   * the reader needs to be able to walk past it to see anything happen.
   */
  it('widens the chart and the income slider to make room for the gift', () => {
    render(<App />);
    const incomeSlider = (): HTMLElement =>
      screen.getByRole('slider', { name: /other income \(not social security\)/i });
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    expect(incomeSlider()).toHaveAttribute('max', '150000');

    setSlider(/qualified charitable distribution/i, '216000');
    // The torpedo's right foot moves right dollar for dollar with the gift:
    // $48,797 + $216,000, plus a tail, rounded up to a legible tick.
    expect(incomeSlider()).toHaveAttribute('max', '300000');
    expect(screen.getByText(/far enough right to reach the last/i)).toHaveTextContent(
      '$300,000',
    );
  });

  /**
   * The case the axis could not have found any other way. With no benefit
   * there is no torpedo for the gift to push right, so nothing but the gift
   * itself asks for the width.
   */
  it('makes room for the gift even when there is no torpedo to carry it', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    setSlider(/annual social security benefit/i, '0');
    setSlider(/qualified charitable distribution/i, '216000');
    expect(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
    ).toHaveAttribute('max', '250000');
  });

  it('clamps a gift parked past the limit when the filing status changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    setSlider(/qualified charitable distribution/i, '150000');
    // The limit is per individual, so it halves on the way back to one filer.
    fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
    expect(qcdSlider()).toHaveValue('111000');
  });

  it('takes the gift back out of the axis label', () => {
    render(<App />);
    expect(
      screen.getByText('Total income ($) including $24,852 of Social Security'),
    ).toBeInTheDocument();
    setSlider(/qualified charitable distribution/i, '10000');
    // The gift is the one part that comes *out* of the axis figure, so it gets
    // its own clause after the list of what is in it.
    expect(
      screen.getByText(
        'Total income ($) including $24,852 of Social Security, less ' +
          '$10,000 given straight to charity',
      ),
    ).toBeInTheDocument();
  });

  it('shows the exclusion on the chart tooltip', () => {
    render(
      <CustomTooltip
        active
        payload={[{ payload: { income: 30_000, marginalRate: 22.2, totalTax: 2_813 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
        segments={[]}
        qcd={10_000}
        year={PAGE_TAX_YEAR}
      />,
    );
    expect(
      screen.getByText(/less \$10,000 given straight to charity/i),
    ).toHaveTextContent('$20,000 of it reaches the return');
  });

  it('never quotes more given away than the income at that point on the axis', () => {
    // The x-axis is income before the gift, so at $5,000 of income only
    // $5,000 of a $10,000 gift can have come out of it.
    render(
      <CustomTooltip
        active
        payload={[{ payload: { income: 5_000, marginalRate: 0, totalTax: 0 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
        segments={[]}
        qcd={10_000}
        year={PAGE_TAX_YEAR}
      />,
    );
    expect(
      screen.getByText(/less \$5,000 given straight to charity/i),
    ).toHaveTextContent('$0 of it reaches the return');
  });
});

/**
 * Both of step 2's threshold lines are off until a reader asks for them, and
 * the panel behind the Breakpoints button is where the asking happens. Opening
 * it is the first act of every test below, so it has a helper of its own.
 */
const openBreakpointsPanel = (): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: /^Breakpoints/ }));
  return screen.getByRole('group', { name: /Health insurance breakpoints/ });
};

describe('the Breakpoints panel on the torpedo chart', () => {
  it('draws neither threshold until it is asked to', () => {
    render(<App />);
    // Nothing about either cliff is on the page on arrival — not the lines
    // (App.chart.test.tsx holds those), and not a paragraph of key under the
    // plot explaining a dash that is not there.
    expect(
      screen.queryByRole('group', { name: /Health insurance breakpoints/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Medicare IRMAA cliffs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // And no key at all: the only two this page ever draws are the cliffs'.
    expect(document.querySelector('.chart-key')).toBeNull();
  });

  it('offers both switches, unticked, and counts what it draws', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /^Breakpoints/ });
    // Nothing drawn, so nothing counted: the button is bare until it has a
    // number to report.
    expect(button).toHaveAccessibleName('Breakpoints');

    openBreakpointsPanel();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const irmaa = screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' });
    const subsidy = screen.getByRole('checkbox', { name: '400% poverty-line cliff' });
    expect(irmaa).not.toBeChecked();
    expect(subsidy).not.toBeChecked();

    // Three IRMAA cliffs fit the default axis, and one 400% line: the count is
    // of marks on the chart, not of ticked boxes.
    fireEvent.click(irmaa);
    expect(button).toHaveAccessibleName('Breakpoints (3)');
    fireEvent.click(subsidy);
    expect(button).toHaveAccessibleName('Breakpoints (4)');
    fireEvent.click(irmaa);
    expect(button).toHaveAccessibleName('Breakpoints (1)');
  });

  /**
   * The panel is two switches and their legend. Everything it used to say in
   * prose — what each threshold costs, whether the axis reaches it — is on the
   * chart itself: the tooltip prices the reader's own tier, the disclosures
   * below say what a cliff is, and the count on the button says whether a
   * ticked box drew anything. So the assertion is a shape rather than a
   * sentence: no paragraphs at all inside a box that floats over the plot.
   */
  it('is two switches and nothing to read', () => {
    render(<App />);
    const panel = openBreakpointsPanel();
    expect(panel.querySelectorAll('p')).toHaveLength(0);
    expect(panel.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(panel).not.toHaveTextContent('Neither is income tax');
    expect(panel).not.toHaveTextContent('IRMAA 1 at');
    expect(panel).not.toHaveTextContent('of household income, reached at');
  });

  it('counts nothing when a switch is on and its threshold is off the axis', () => {
    render(<App />);
    openBreakpointsPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint tier-1 threshold is past the right edge, so the switch is on
    // and the chart is unchanged — and with the panel's notes gone the count
    // is the only thing that says so.
    expect(screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' })).toBeChecked();
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveAccessibleName(
      'Breakpoints',
    );
  });

  it('closes on Escape and puts focus back on the button', () => {
    render(<App />);
    openBreakpointsPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('group', { name: /Health insurance breakpoints/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveFocus();
  });

  it('closes on a click outside itself, and not on one inside', () => {
    render(<App />);
    const panel = openBreakpointsPanel();
    fireEvent.mouseDown(panel);
    expect(
      screen.getByRole('group', { name: /Health insurance breakpoints/ }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole('group', { name: /Health insurance breakpoints/ }),
    ).not.toBeInTheDocument();
  });
});

describe('the IRMAA cliff lines on the torpedo chart', () => {
  /**
   * The lines themselves are asserted on in App.chart.test.tsx, which mocks
   * ResponsiveContainer so recharts actually draws, and what each one costs is
   * `irmaaCliffs`', asserted in tax.test.ts. What is left here is the
   * disclosure under the plot: the one place on the page that says what a
   * cliff is, and the one that prices the first one this return can reach.
   */
  const irmaaExplainer = (): HTMLElement => {
    const heading = screen.getByRole('heading', { name: /medicare's irmaa cliffs/i });
    const details = heading.closest('details');
    if (!details) throw new Error('no IRMAA explainer rendered');
    return details;
  };

  it('doubles the price for a joint return with two enrollees', () => {
    render(<App />);
    // A single filer's first cliff is a $1,148.40 step, rounded to $1,148.
    expect(irmaaExplainer()).toHaveTextContent('costs $1,148 a year — on a single dollar');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /age 65 or older/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /both spouses are 65 or older/i }),
    );
    // IRMAA is charged per enrollee off one household MAGI figure, so the step
    // is twice what a single filer pays — and the sentence says whose it is.
    expect(irmaaExplainer()).toHaveTextContent(
      'costs $2,297 a year for the two of you — on a single dollar',
    );
  });

  it('sends the reader to the control that draws the lines, by its name', () => {
    render(<App />);
    // The disclosure is the only prose left that names the panel, now that the
    // panel carries none of its own — so it has to name it correctly.
    expect(irmaaExplainer()).toHaveTextContent(
      'will draw the thresholds as red dashed lines if you ask it to, under Breakpoints in the corner of the plot',
    );
  });

  it('explains what a cliff is, collapsed, without the Medicare tab', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /medicare's irmaa cliffs/i });
    const details = heading.closest('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('income-related monthly adjustment amount');
    expect(details).toHaveTextContent('one dollar over a threshold triggers the whole surcharge');
    // The two-year lag is the caveat that makes the x-axis honest.
    expect(details).toHaveTextContent(
      /the 2026 premiums these lines are priced from are set by 2024 MAGI/,
    );
    expect(details).toHaveTextContent('setting the premium for 2028');
    expect(details).toHaveTextContent('Form SSA-44');
  });

});

/**
 * The reader-facing half of the 400% cliff. The line itself is asserted on in
 * App.chart.test.tsx, which mocks ResponsiveContainer so recharts draws; what
 * is checked here is the key beside it and the explainer under it, which are
 * plain HTML and are the only things that say what a pink dash means.
 *
 * `PAGE_TAX_YEAR` has a cliff: ARPA section 9661 suspended the 400% ceiling
 * from 2021 through 2025 and it came back for tax years beginning after 2025.
 * These tests used to click a year selector to reach it. The engine still
 * prices a year without one — `ptcCliffMagi` returns null — so the guard on
 * the section stays even though the page can no longer land on that branch.
 */
describe('the 400% poverty-line cliff under the torpedo chart', () => {
  const subsidyExplainer = (): HTMLElement => {
    const heading = screen.getByRole('heading', { name: /400% poverty-line cliff/ });
    const details = heading.closest('details');
    if (!details) throw new Error('no subsidy explainer rendered');
    return details;
  };

  it('prices the line for this return, and says what the household pays under it', () => {
    render(<App />);
    // 4 x the $15,650 one-person line. What the household pays under it, and
    // the guideline year the line comes from, are the explainer's: the panel
    // that switches the line on carries no prose of its own.
    expect(subsidyExplainer()).toHaveTextContent('$62,600');
    expect(subsidyExplainer()).toHaveTextContent(
      '$15,650 poverty line for one person',
    );
    // 9.96% of $62,600, per Rev. Proc. 2025-25's last row.
    expect(subsidyExplainer()).toHaveTextContent('$6,235');
    // 26 CFR 1.36B-1(h): the line is a year old before the year opens, where
    // Medicare's MAGI is two.
    expect(subsidyExplainer()).toHaveTextContent(
      'runs 1 year behind, where Medicare',
    );
    expect(subsidyExplainer()).toHaveTextContent(
      'MAGI runs 2: 26 CFR 1.36B-1(h)',
    );
    expect(subsidyExplainer()).toHaveTextContent(
      '2026 coverage is priced off the 2025 guidelines',
    );
  });

  it('quotes the reader their own distance from the line', () => {
    render(<App />);
    // $30,000 of other income plus the whole $24,852 benefit: $54,852, which
    // is 350% of the $15,650 line with $7,748 of it left to go.
    expect(subsidyExplainer()).toHaveTextContent(
      'household income is $54,852, 350% of the poverty line',
    );
    expect(subsidyExplainer()).toHaveTextContent('Another $7,748 of it reaches the line');

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '50000' } },
    );
    expect(subsidyExplainer()).toHaveTextContent('That is past the cliff');
    expect(subsidyExplainer()).toHaveTextContent('takes $12,252 less income');
  });

  it('keeps the switch, and draws nothing, once the line is already behind the reader', () => {
    render(<App />);
    openBreakpointsPanel();
    const subsidy = screen.getByRole('checkbox', { name: '400% poverty-line cliff' });
    fireEvent.click(subsidy);
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveAccessibleName(
      'Breakpoints (1)',
    );

    fireEvent.change(screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }), {
      target: { value: '40000' },
    });
    // $24,852 of benefit and $40,000 of interest is $64,852 before a dollar of
    // other income — over the line already, so there is nothing left to lose
    // and nothing to draw. The switch stays on and the count goes to nothing,
    // which is the only report the panel makes now that its notes are gone.
    expect(screen.getByRole('checkbox', { name: '400% poverty-line cliff' })).toBeChecked();
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveAccessibleName(
      'Breakpoints',
    );
    // The explainer is where the reader is told why, and it is still offered:
    // a household past the line is exactly the one that needs telling.
    expect(subsidyExplainer()).toHaveTextContent('That is past the cliff');
  });

  it('takes the switch and the section away once everyone is on Medicare', () => {
    render(<App />);
    openBreakpointsPanel();
    expect(
      screen.getByRole('checkbox', { name: '400% poverty-line cliff' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(
      screen.queryByRole('checkbox', { name: '400% poverty-line cliff' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /400% poverty-line cliff/ }),
    ).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Retroactive awards and the lump-sum election                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  The chart's right edge                                            */
/* ------------------------------------------------------------------ */

/**
 * The torpedo chart's x-axis used to stop at a fixed $150,000, which cut the
 * senior deduction's phaseout in half: it does not finish until $175,000 of
 * MAGI on an unmarried return and $250,000 on a joint one, so the second hump
 * the explainer describes had no right-hand side on the chart. The axis is now
 * derived from the return, and the slider under it shares the edge.
 */
describe('the torpedo chart’s right edge', () => {
  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(not social security\)/i });

  const stepIntro = (): HTMLElement =>
    screen
      .getByRole('heading', { name: 'The tax torpedo' })
      .closest('section')!
      .querySelector('.step-intro') as HTMLElement;

  it('stays where it was for a filer with only one hump to show', () => {
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('max', '150000');
    expect(stepIntro()).toHaveTextContent('$0 to $150,000 of other income');
  });

  it('widens to fit the senior deduction phaseout when it is claimed', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // $175,000 of MAGI, less the $20,155.20 of benefit already in AGI, is
    // $154,845 of other income — past the old fixed edge, and now inside.
    expect(incomeSlider()).toHaveAttribute('max', '175000');
    expect(stepIntro()).toHaveTextContent('$0 to $175,000 of other income');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint phaseout starts $75,000 higher and ends $250,000 of MAGI, so
    // the axis has to reach $229,845 of other income.
    expect(incomeSlider()).toHaveAttribute('max', '250000');
    expect(stepIntro()).toHaveTextContent('$0 to $250,000 of other income');
  });

  /**
   * The phaseout is worth axis space only when there is a deduction to phase
   * out, so an under-65 filer keeps the narrow chart — and the explainer's own
   * sentence about the far side of the phaseout has to follow the same edge.
   */
  it('flips the explainer’s off-chart caveat when the edge moves', () => {
    render(<App />);
    const explainer = (): HTMLElement =>
      screen
        .getByRole('heading', { name: /the senior deduction phaseout/i })
        .closest('details') as HTMLElement;
    expect(explainer()).toHaveTextContent('sits past the right edge of the chart');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(explainer()).toHaveTextContent('is inside the chart');
  });

  /**
   * The axis takes the reader's own income as a floor, so it can only ever
   * grow out from under the slider — never in behind it. Without that, taking
   * the age toggle back off would leave a marker standing past the edge.
   */
  it('never pulls in behind where the reader is standing', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.change(incomeSlider(), { target: { value: '175000' } });
    expect(incomeSlider()).toHaveValue('175000');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // The second hump is gone, but the reader is still out at $175,000.
    expect(incomeSlider()).toHaveAttribute('max', '175000');
    expect(incomeSlider()).toHaveValue('175000');
  });

  /**
   * The slider steps in whatever the curve beneath it samples, so the widest
   * chart costs no more points than the narrowest and the reader's marker
   * still lands on a sampled point. The third rung exists because a maxed
   * charitable gift can take a joint return past $300,000.
   */
  it('coarsens its step as the axis widens', () => {
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('step', '500');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(incomeSlider()).toHaveAttribute('max', '250000');
    expect(incomeSlider()).toHaveAttribute('step', '500');

    fireEvent.change(
      screen.getByRole('slider', { name: /qualified charitable distribution/i }),
      { target: { value: '216000' } },
    );
    // The gift never enters AGI, so the phaseout ends $216,000 further out:
    // $229,845 + $216,000 of other income, plus a tail, rounded up.
    expect(incomeSlider()).toHaveAttribute('max', '475000');
    expect(incomeSlider()).toHaveAttribute('step', '1000');
  });
});

/* ------------------------------------------------------------------ */
/*  The axis, taken apart                                             */
/* ------------------------------------------------------------------ */

/**
 * `totalIncomeFor` is what "total income" means on this page: other income
 * less what went straight to charity, plus the *whole* benefit, plus
 * tax-exempt interest. Three places take a figure on that axis apart for the
 * reader rather than just quoting it — the tooltip head, step 2's opening
 * line and the plot's accessible name — and each of them hands over an
 * addition the reader can do. So each of them has to name every term the
 * total contains, or the addition visibly fails: the opening line used to
 * name the benefit and stop, and at $3,750 of tax-exempt interest it said the
 * axis began at $28,602 beside arithmetic that reached $24,852.
 *
 * These read the figures back out of the prose and add them up, rather than
 * matching a sentence, so they hold whatever the wording becomes.
 */
describe('the axis, taken apart', () => {
  /** Every dollar figure in a sentence, in the order it says them. */
  const dollars = (text: string): number[] =>
    [...text.matchAll(/\$[\d,]+/g)].map((m) => Number(m[0].replace(/[$,]/g, '')));

  const stepIntro = (): string =>
    (
      screen
        .getByRole('heading', { name: 'The tax torpedo' })
        .closest('section')!
        .querySelector('.step-intro') as HTMLElement
    ).textContent!;

  const chartLabel = (): string =>
    screen
      .getByRole('img', { name: /^Chart: the marginal tax rate/ })
      .getAttribute('aria-label')!;

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(screen.getByRole('slider', { name }), { target: { value } });
  };

  it('adds up on the return the page opens with', () => {
    render(<App />);
    // from, to, the benefit, the $0 the other-income range starts at, the edge
    const [from, to, benefit, , edge] = dollars(stepIntro());
    expect(benefit).toBe(AVG_ANNUAL_SS_BENEFIT);
    expect(from).toBe(benefit);
    expect(to).toBe(benefit + edge);
  });

  it('counts tax-exempt interest in both ends of the span it names', () => {
    render(<App />);
    setSlider(/tax-exempt \(municipal\) interest/i, '3750');
    const [from, to, benefit, interest, , edge] = dollars(stepIntro());
    expect(interest).toBe(3_750);
    // Muni interest never moves: it is in the left edge and in the right one.
    expect(from).toBe(benefit + interest);
    expect(to).toBe(benefit + interest + edge);
  });

  it('takes the gift off the front of the income, not off the left edge', () => {
    render(<App />);
    setSlider(/qualified charitable distribution/i, '10000');
    const [from, to, benefit, , edge, gift] = dollars(stepIntro());
    expect(gift).toBe(10_000);
    // "The first $10,000 of it": at $0 of other income none of the gift has
    // happened yet, so the left edge is the benefit alone and only the right
    // edge is $10,000 short. A flat "less $10,000" would be wrong here by
    // exactly the gift.
    expect(from).toBe(benefit);
    expect(to).toBe(benefit + edge - gift);
  });

  it('adds up with both advanced inputs set at once', () => {
    render(<App />);
    setSlider(/tax-exempt \(municipal\) interest/i, '3750');
    setSlider(/qualified charitable distribution/i, '26750');
    const [from, to, benefit, interest, , edge, gift] = dollars(stepIntro());
    expect([interest, gift]).toEqual([3_750, 26_750]);
    expect(from).toBe(benefit + interest);
    expect(to).toBe(benefit + interest + edge - gift);
  });

  /**
   * The accessible name is the same sentence for a listener, and it was wrong
   * in the same way, so it is pinned the same way.
   */
  it('names both fixed halves to a screen reader, and still adds up', () => {
    render(<App />);
    setSlider(/tax-exempt \(municipal\) interest/i, '3750');
    setSlider(/qualified charitable distribution/i, '26750');
    expect(chartLabel()).toContain(
      'a fixed $24,852 of Social Security and $3,750 of tax-exempt interest',
    );
    expect(chartLabel()).toContain('given straight to charity');
    const [from, to, benefit, interest, , edge, gift] = dollars(chartLabel());
    expect(from).toBe(benefit + interest);
    expect(to).toBe(benefit + interest + edge - gift);
  });

  /**
   * And the third place, which quotes the total for a hovered point and then
   * decomposes it. The gift keeps its own line below the head — the x-axis is
   * income before the gift, so the head's addition is the total before it
   * comes off — but tax-exempt interest is inside the figure the head quotes.
   */
  it('names the tax-exempt interest inside the total the tooltip quotes', () => {
    render(
      <CustomTooltip
        active
        payload={[{ payload: { income: 20_000, marginalRate: 15, totalTax: 768 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
        segments={[]}
        muniInterest={10_000}
        year={PAGE_TAX_YEAR}
      />,
    );
    const head = document.querySelector('.chart-tooltip-head') as HTMLElement;
    expect(head).toHaveTextContent(
      'Total income $54,852 · $24,852 SS + $10,000 tax-exempt + $20,000 other income',
    );
    const [total, ...parts] = dollars(head.textContent!);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('leaves the head as it was when there is no tax-exempt interest', () => {
    render(
      <CustomTooltip
        active
        payload={[{ payload: { income: 20_000, marginalRate: 15, totalTax: 768 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
        segments={[]}
        year={PAGE_TAX_YEAR}
      />,
    );
    expect(document.querySelector('.chart-tooltip-head')).toHaveTextContent(
      'Total income $44,852 · $24,852 SS + $20,000 other income',
    );
  });
});


/**
 * The close.
 *
 * Step 1 ends by naming the return step 2 prices; this ends the page by saying
 * what came of it. Six figures a reader leaves with — total income, the tax,
 * the average rate, the rate on the next dollar, how much of the benefit ended
 * up in the tax base, and which Medicare tier the MAGI landed in — all in one
 * block.
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
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
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
    expect(figure('The next dollar')).toHaveTextContent('22.2%');
    expect(figure('Benefit in the tax base')).toHaveTextContent(
      '$11,662 of $24,852',
    );
    expect(figure('Benefit in the tax base')).toHaveTextContent('46.93% of it');
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
    expect(figure('The next dollar')).toHaveTextContent('22.2%');
  });

  it('re-prices every figure when step 2 moves the income', () => {
    render(<App />);
    setIncome(90_000);
    expect(figure('Total income')).toHaveTextContent('$114,852');
    expect(figure('Federal tax')).toHaveTextContent('$15,617');
    expect(figure('Effective rate')).toHaveTextContent('13.6%');
    // Past the torpedo: the next dollar is back to its own bracket rate.
    expect(figure('The next dollar')).toHaveTextContent('22%');
    // And the 85% cap is binding, which is why it is over.
    expect(figure('Benefit in the tax base')).toHaveTextContent(
      '$21,124 of $24,852',
    );
    expect(figure('Benefit in the tax base')).toHaveTextContent('85% of it');
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'Tier 1 of 5 \u2014 $1,148/yr',
    );
  });

  /**
   * Which tier a reader's own MAGI lands in has only ever been available by
   * hovering the chart, which is nothing at all on a touch screen.
   */
  it('names the tier the MAGI lands in and what the next cliff costs', () => {
    render(<App />);
    const medicare = figure('Medicare surcharge');
    expect(medicare).toHaveTextContent('On $41,662 of MAGI');
    expect(medicare).toHaveTextContent(
      'Another $67,338 of it crosses the next cliff, which costs $1,148 a year on the strength of one dollar.',
    );
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
    setIncome(140_000);
    // $140,000 of other income plus 85% of the couple's $38,496 benefit.
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'On $172,722 of MAGI, charged to each of you.',
    );
    // Two enrollees, so the cliff below costs twice what one filer pays.
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'costs $2,297 a year',
    );
  });

  it('says there is nothing to drag in when step 1 sets no benefit', () => {
    render(<App />);
    setBenefit(0);
    expect(intro()).toHaveTextContent(
      'with no Social Security and $30,000 of other income',
    );
    expect(figure('Benefit in the tax base')).toHaveTextContent('None');
    expect(figure('Benefit in the tax base')).toHaveTextContent(
      'Step 1 sets no benefit, so there is nothing for other income to drag in',
    );
    expect(figure('Total income')).toHaveTextContent('$30,000');
    expect(figure('Effective rate')).toHaveTextContent('4.73%');
  });

  /**
   * The same denominator the effective rate above step 2 uses: money received,
   * so tax-exempt interest is in it, and a gift that never reaches the filer
   * is not.
   */
  it('counts tax-exempt interest into the total and a charitable gift out', () => {
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
    fireEvent.change(
      screen.getByRole('slider', { name: /qualified charitable distribution/i }),
      { target: { value: '20000' } },
    );
    expect(figure('Total income')).toHaveTextContent('$34,852');
    expect(figure('Total income')).toHaveTextContent(
      'less the $20,000 that went straight to charity',
    );
    // The gift takes provisional income under the 50% base, so none of the
    // benefit is taxable and the return owes nothing.
    expect(figure('Federal tax')).toHaveTextContent('$0');
    expect(figure('Benefit in the tax base')).toHaveTextContent('$0 of $24,852');
  });

  /** No income is no denominator, and "0.00%" would be a claim about nothing. */
  it('holds the effective rate back when nothing comes in', () => {
    render(<App />);
    setBenefit(0);
    setIncome(0);
    expect(figure('Total income')).toHaveTextContent('$0');
    expect(figure('Effective rate')).toHaveTextContent('\u2014');
    expect(figure('Effective rate')).toHaveTextContent(
      'there is no income to average a bill over',
    );
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

    it('says the address bar is the return, between the figures and the caveat', () => {
      render(<App />);
      expect(share()).toHaveTextContent('The address bar is this return.');
      expect(share()).toHaveTextContent(
        'Every control on this page rides in the link',
      );
      expect(share().previousElementSibling).toHaveClass('answer-figures');
      expect(share().nextElementSibling).toHaveClass('answer-note');
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
        screen.getByRole('slider', { name: /other income \(not social security\)/i }),
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
     * write to. A button that cannot copy is worse than no button, and the
     * sentence beside it already tells the reader what to send.
     */
    it('draws no button at all where there is no clipboard', () => {
      render(<App />);
      expect(navigator.clipboard).toBeUndefined();
      expect(
        within(share()).queryByRole('button', { name: /copy link/i }),
      ).not.toBeInTheDocument();
      expect(share()).toHaveTextContent('The address bar is this return.');
      expect(status()).toBeEmptyDOMElement();
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
 * half of `scenarioUrl` — that the link is read on mount, written on every
 * change, and never pushed.
 */
describe('the return in the address bar', () => {
  const openAt = (search: string): void => {
    window.history.replaceState(null, '', `/${search}`);
  };

  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(not social security\)/i });

  it('opens on the return the link names rather than on its own defaults', () => {
    openAt(
      '?filing=mfj&ss=40000&income=120000&senior=1&spouse=1&muni=8000&qcd=15000',
    );
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
    expect(
      screen.getByRole('slider', { name: /qualified charitable distribution/i }),
    ).toHaveValue('15000');
  });

  /**
   * And prices nothing off the two keys that outlived their controls. A gain
   * named in an old link would move the curve with nothing on the page to say
   * so or to undo it, which is the one thing worse than dropping it.
   */
  it('reads past a gain or a ceiling an older link still names', () => {
    openAt('?income=120000&ltcg=25000&ceiling=irmaa1');
    render(<App />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(incomeSlider()).toHaveValue('120000');
    expect(window.location.search).toBe('?income=120000');
    expect(
      document.querySelector('#step-torpedo .slider-readout'),
    ).toHaveTextContent('At $120,000 of other income');
  });

  it('writes what the reader moves back into the address', () => {
    render(<App />);
    // Nothing is written unconditionally now that the year has gone, so the
    // opening return leaves the address bare.
    expect(window.location.search).toBe('');

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    expect(window.location.search).toBe('?income=90000');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(window.location.search).toBe('?filing=mfj&income=90000');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(window.location.search).toContain('senior=1');
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
    expect(window.location.search).toBe('?income=70000');
    expect(window.history.length).toBe(before);
  });

  /** What a refresh does, which is the other half of what the bullet asked for. */
  it('comes back on the same return after the page is thrown away', () => {
    const first = render(<App />);
    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    chooseFilingStatus('Married Filing Jointly');
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
 * nothing else, so the "you are here" sentence, the advice under it, the
 * effective rate and the six closing figures all changed under a screen
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
  const income = /other income \(not social security\)/i;
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
    expect(region()).toHaveTextContent('You are on the valley floor.');
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

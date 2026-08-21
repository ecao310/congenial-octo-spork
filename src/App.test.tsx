import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import App, { CustomTooltip, LTCGTooltip } from './App';
import { TAX_YEAR_PARAMS, TAX_YEARS, defaultTaxYear } from './utils/tax';
import type { TaxYear } from './utils/tax';

/**
 * The app opens on `defaultTaxYear()`, which follows the wall calendar, and
 * nearly every figure asserted below is a 2025 one. Pinning the clock keeps
 * those assertions meaningful instead of having them re-point at whatever
 * Rev. Proc. the calendar happens to be on. The `tax year selector` describe
 * clicks its way to 2026 rather than relying on the default.
 */
const PINNED_YEAR: TaxYear = 2025;
const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].avgAnnualSSBenefit;
const MAX_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PINNED_YEAR].maxAnnualSSBenefit;

beforeEach(() => {
  // Date only: React Testing Library needs the real setTimeout.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${PINNED_YEAR}-07-01T00:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Every step is mounted at once — the flow scrolls where the tab strip it
 * replaced swapped panels — so a test that asserts on a section no longer has
 * to open anything first. What the nav changes is which step is marked current
 * and where focus lands, and that is what the `step flow` describe covers.
 */
const stepNames = [
  'Your benefit',
  'The tax torpedo',
  'Capital gains',
  'Roth conversion',
] as const;

const stepNav = (): HTMLElement => screen.getByRole('toolbar', { name: 'Steps' });

const navItem = (name: (typeof stepNames)[number]): HTMLElement =>
  within(stepNav()).getByRole('button', { name });

/**
 * The line that closes step 1 by naming the return every later step prices.
 * The year, the status, the ages and the benefit are each in their own
 * element, so these tests read the whole sentence rather than one text node.
 */
const scenarioRecap = (): HTMLElement =>
  screen.getByText(/Everything from here on prices one return/);

/** The nav button carrying `aria-current="step"`, by its visible label. */
const currentStep = (): string | undefined =>
  within(stepNav())
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-current') === 'step')
    ?.textContent?.replace(/^\d/, '');

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
    // reached yet. It now says what the next dollar costs and why.
    const subtitle = hero.nextElementSibling as HTMLElement;
    expect(subtitle).toHaveClass('subtitle');
    expect(subtitle).toHaveTextContent(/a withdrawal, a Roth conversion, a realized gain/);
    expect(subtitle).toHaveTextContent(/nothing like your bracket/);
    expect(subtitle).not.toHaveTextContent(/single filer/i);
    expect(subtitle).not.toHaveTextContent(/2025|2026/);

    // And it stays put when those controls move.
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(subtitle).not.toHaveTextContent(/married|2026/i);
  });

  it('renders the benefit slider defaulting to the 2025 average benefit', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue(String(AVG_ANNUAL_SS_BENEFIT));
    expect(within(benefitGroup()).getByText('$23,712')).toBeInTheDocument();
  });

  it('spans $0 to the 2025 maximum yearly benefit and shows avg/max labels', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(MAX_ANNUAL_SS_BENEFIT));
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('$23,712 (2025 avg)')).toBeInTheDocument();
    expect(screen.getByText('$61,296 (2025 max)')).toBeInTheDocument();
  });

  it('updates the value, readout, and total income formula when moved', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(
      screen.getByText(/total income = other income \+ \$23,712 ss/i),
    ).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '36000' } });
    expect(slider).toHaveValue('36000');
    expect(within(benefitGroup()).getByText('$36,000')).toBeInTheDocument();
    expect(
      screen.getByText(/total income = other income \+ \$36,000 ss/i),
    ).toBeInTheDocument();
  });

  it('renders a filing status selector defaulting to Single', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: /filing status/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Married Filing Jointly' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    ).not.toBeChecked();
    // The close repeats the status prose, so this asks the recap that closes
    // step 1 rather than the page.
    expect(scenarioRecap()).toHaveTextContent('a single filer');
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
    expect(heading).toBeInTheDocument();
    const details = heading.closest('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    expect(screen.getByText(/provisional income passes \$25,000/)).toBeInTheDocument();
    expect(screen.getByText(/past \$34,000/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(screen.getByText(/provisional income passes \$32,000/)).toBeInTheDocument();
    expect(screen.getByText(/past \$44,000/)).toBeInTheDocument();
    expect(screen.queryByText(/\$25,000/)).not.toBeInTheDocument();
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

  /* ───── Married filing separately (lived with spouse) ───── */

  /**
   * The note the filing-status fieldset is currently showing, or null.
   *
   * Scoped to the fieldset rather than the page: `role="note"` is no longer
   * unique now that the retroactive-award section carries a standing one, and
   * these tests were only ever asking what the status picker had to say.
   */
  const filingStatusNote = (): HTMLElement | null =>
    within(
      screen.getByRole('group', { name: /filing status/i }),
    ).queryByRole('note');

  /** Selects the separate-return status and returns its warning banner. */
  const selectMfs = (): HTMLElement => {
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
    return filingStatusNote() as HTMLElement;
  };

  it('warns loudly when Married Filing Separately is selected', () => {
    render(<App />);
    // Nothing shouts until the status is picked.
    expect(filingStatusNote()).not.toBeInTheDocument();

    const warning = selectMfs();
    expect(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    ).toBeChecked();
    expect(warning).toHaveTextContent('Filing separately zeroes out both thresholds');
    // 42.5% of the $23,712 average benefit, taxable at $0 of other income,
    // and the 85% cap reached at half the benefit.
    expect(warning).toHaveTextContent('$10,078');
    expect(warning).toHaveTextContent('$11,856');
    // And the escape hatch for the other kind of separate filer.
    expect(warning).toHaveTextContent(/lived apart from your spouse for the entire year/i);
    expect(warning).toHaveTextContent('$375,800');
    expect(scenarioRecap()).toHaveTextContent(
      'filing separately who lived with their spouse',
    );
  });

  it('moves the warning figures with the benefit and the muni slider', () => {
    render(<App />);
    selectMfs();
    fireEvent.change(screen.getByRole('slider', { name: /social security benefit/i }), {
      target: { value: '40000' },
    });
    // 42.5% of $40,000, capped at half of it.
    expect(filingStatusNote()).toHaveTextContent('$17,000');
    expect(filingStatusNote()).toHaveTextContent('$20,000');

    // Tax-exempt interest is in provisional income, so it brings the cap
    // forward dollar for dollar and pulls more benefits in at zero income.
    fireEvent.change(screen.getByRole('slider', { name: /tax-exempt/i }), {
      target: { value: '5000' },
    });
    expect(filingStatusNote()).toHaveTextContent('$15,000');
    expect(filingStatusNote()).toHaveTextContent('$21,250');
  });

  it('tells the torpedo explainer there are no thresholds to pass', () => {
    render(<App />);
    selectMfs();
    const details = screen
      .getByRole('heading', { name: /what is the tax torpedo/i })
      .closest('details');
    expect(details).toHaveTextContent('both thresholds are $0');
    expect(details).not.toHaveTextContent(/provisional income passes/);
  });

  it('reports the senior deduction as unavailable rather than phased out', () => {
    render(<App />);
    selectMfs();
    expect(screen.getByText(/^No senior deduction on a separate return/)).toHaveTextContent(
      '151(d)(5)(C)(v)',
    );
    // The spouse toggle stays hidden: only a joint return claims it twice.
    expect(
      screen.queryByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    ).not.toBeInTheDocument();

    const explainer = screen
      .getByRole('heading', { name: /the senior deduction phaseout/i })
      .closest('details');
    expect(explainer).toHaveTextContent('Not on this return');
    expect(explainer).not.toHaveTextContent('gone at $175,000');
  });

  it('adds a filing-jointly line to the mitigation strategies', () => {
    render(<App />);
    expect(screen.queryByText('Price out filing jointly.')).not.toBeInTheDocument();
    selectMfs();
    expect(screen.getByText('Price out filing jointly.')).toBeInTheDocument();
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

  it('renders the Capital Gains Stacking section heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /capital gains stacking/i }),
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
      'Standard deduction $15,750. Turning 65 adds $2,000.',
    );

    fireEvent.click(senior);
    expect(senior).toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $17,750 — $15,750 base plus $2,000 for age 65 or older.',
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
      'Standard deduction $31,500. Turning 65 adds $1,600 per qualifying spouse.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(spouse).toBeEnabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $33,100 — $31,500 base plus $1,600 for age 65 or older.',
    );

    fireEvent.click(spouse);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $34,700 — $31,500 base plus $3,200 for age 65 or older.',
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

  it('adds the tax-exempt interest to the chart\u2019s total-income formula', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );

    expect(
      screen.getByText(
        /total income = other income \+ \$23,712 SS \+ \$5,000 tax-exempt interest/i,
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
  it('numbers all four steps in the nav, in reading order', () => {
    render(<App />);
    expect(
      within(stepNav())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      '1Your benefit',
      '2The tax torpedo',
      '3Capital gains',
      '4Roth conversion',
    ]);
  });

  /**
   * The whole point of the rewrite: the steps scroll rather than swap, so
   * every one of them is on the page at once. A reader on step 3 can scroll
   * back to the benefit they set in step 1, and Ctrl-F reaches all of it.
   */
  it('renders every step at once', () => {
    render(<App />);
    for (const name of [
      /your social security benefit/i,
      /^the tax torpedo$/i,
      /capital gains stacking/i,
      /^sizing the conversion$/i,
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('opens with the first step marked current', () => {
    render(<App />);
    expect(currentStep()).toBe('Your benefit');
    expect(navItem('Roth conversion')).not.toHaveAttribute('aria-current');
  });

  /**
   * Focus follows the scroll. Landing a keyboard reader at the top of the
   * page after they asked for step 3 would make the nav unusable — the next
   * Tab press has to continue inside the step they picked.
   */
  it('marks a step current and moves focus into it when the nav is clicked', () => {
    render(<App />);
    fireEvent.click(navItem('Capital gains'));
    expect(currentStep()).toBe('Capital gains');
    expect(document.activeElement).toBe(document.getElementById('step-gains'));
  });

  it('wires each nav button to the section it moves to', () => {
    render(<App />);
    for (const [name, id] of [
      ['Your benefit', 'step-benefit'],
      ['The tax torpedo', 'step-torpedo'],
      ['Capital gains', 'step-gains'],
      ['Roth conversion', 'step-conversion'],
    ] as const) {
      const section = document.getElementById(id) as HTMLElement;
      expect(navItem(name)).toHaveAttribute('aria-controls', id);
      expect(
        document.getElementById(section.getAttribute('aria-labelledby') ?? ''),
      ).toHaveTextContent(/\S/);
    }
  });

  /**
   * The box at the foot of each step is the path through the flow for a reader
   * who never looks at the nav, so it has to do everything the nav does.
   */
  it('walks forward through the next-step boxes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Step 2 of 4/ }));
    expect(currentStep()).toBe('The tax torpedo');
    expect(document.activeElement).toBe(document.getElementById('step-torpedo'));

    fireEvent.click(screen.getByRole('button', { name: /Step 3 of 4/ }));
    expect(currentStep()).toBe('Capital gains');
    expect(document.activeElement).toBe(document.getElementById('step-gains'));

    fireEvent.click(screen.getByRole('button', { name: /Step 4 of 4/ }));
    expect(currentStep()).toBe('Roth conversion');
    expect(document.activeElement).toBe(
      document.getElementById('step-conversion'),
    );
  });

  it('names where each box goes, and stops at the last step', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /Step 2 of 4/ }),
    ).toHaveTextContent('The tax torpedo');
    expect(
      screen.getByRole('button', { name: /Step 3 of 4/ }),
    ).toHaveTextContent('Capital Gains Stacking');
    expect(
      screen.getByRole('button', { name: /Step 4 of 4/ }),
    ).toHaveTextContent('Sizing the conversion');
    expect(screen.queryByRole('button', { name: /Step 5 of 4/ })).toBeNull();
  });

  it('moves between steps with the arrow keys and wraps at both ends', () => {
    render(<App />);

    fireEvent.keyDown(stepNav(), { key: 'ArrowRight' });
    expect(currentStep()).toBe('The tax torpedo');

    fireEvent.keyDown(stepNav(), { key: 'ArrowLeft' });
    fireEvent.keyDown(stepNav(), { key: 'ArrowLeft' });
    expect(currentStep()).toBe('Roth conversion');

    fireEvent.keyDown(stepNav(), { key: 'ArrowRight' });
    expect(currentStep()).toBe('Your benefit');
  });

  /**
   * Arrowing keeps focus on the nav where clicking moves it into the section:
   * a second arrow press has to reach the same handler as the first.
   */
  it('keeps focus on the nav while arrowing', () => {
    render(<App />);
    fireEvent.keyDown(stepNav(), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(navItem('The tax torpedo'));
  });

  /**
   * Roving tabindex: arrowing through the nav must not leave a trail of tab
   * stops behind it, or a keyboard user pays a press per step to leave the nav
   * on the way to the sliders.
   */
  it('keeps only the current step in the tab order', () => {
    render(<App />);
    fireEvent.click(navItem('Roth conversion'));
    for (const name of stepNames) {
      expect(navItem(name)).toHaveAttribute(
        'tabindex',
        name === 'Roth conversion' ? '0' : '-1',
      );
    }
  });

  it('ignores keys that are not arrows', () => {
    render(<App />);
    fireEvent.keyDown(stepNav(), { key: 'a' });
    expect(currentStep()).toBe('Your benefit');
  });

  /**
   * Every step prices the same return, and the inputs that set it are spread
   * across the flow — the benefit in step 1, other income in step 2. Stepping
   * around must never unmount one, or a figure set in step 1 would be gone by
   * the time step 3 quoted it.
   */
  it('keeps every input mounted as the reader steps through', () => {
    render(<App />);
    const income = screen.getByRole('slider', { name: /other income \(not social security\)/i });
    fireEvent.change(income, { target: { value: '90000' } });

    for (const name of stepNames) {
      fireEvent.click(navItem(name));
      expect(
        screen.getByRole('slider', { name: /social security benefit/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      ).toHaveValue('90000');
      expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    }
  });
});

/**
 * Every step is laid out the same way, and this is the test of it.
 *
 * chart \u2192 the one control that says where on that chart you are \u2192 the
 * collapsed explainers \u2192 the box to the next step. Step 1 has no curve of
 * its own, so it starts at the control; step 4 is last, so it ends at the
 * explainer. A control above its chart reads as an input to the chart, which
 * is exactly what it is not \u2014 the chart already prices every value the
 * control can take.
 *
 * "Control" rather than "slider" because step 4's is a radio group: the lines
 * a conversion is sized against are six named places rather than a continuum.
 * It does the same job in the same slot.
 */
describe('the shape every step shares', () => {
  /** The step's own landmarks in DOM order, runs of a kind collapsed. */
  const landmarks = (id: string): string[] => {
    const section = document.getElementById(id) as HTMLElement;
    const kinds = Array.from(
      section.querySelectorAll(
        '.chart-container, input[type="range"], .ceiling-picker, details, .next-step',
      ),
    )
      // A control inside a disclosure is that disclosure's business, not the
      // step's: the shape is about what the reader meets on the way down.
      .filter((el) => el.tagName === 'DETAILS' || el.closest('details') === null)
      .map((el) =>
        el.classList.contains('chart-container')
          ? 'chart'
          : el.classList.contains('next-step')
            ? 'next'
            : el.tagName === 'DETAILS'
              ? 'details'
              : 'control',
      );
    return kinds.filter((kind, i) => kind !== kinds[i - 1]);
  };

  it('lays the charted steps out chart, control, explainers, next', () => {
    render(<App />);
    expect(landmarks('step-torpedo')).toEqual([
      'chart',
      'control',
      'details',
      'next',
    ]);
    expect(landmarks('step-gains')).toEqual([
      'chart',
      'control',
      'details',
      'next',
    ]);
    expect(landmarks('step-conversion')).toEqual([
      'chart',
      'control',
      'details',
    ]);
  });

  /**
   * Step 1 draws nothing, so the return it sets stands where a chart stands.
   * What it still owes the shape is the ordering of the rest: one control on
   * screen, the disclosure after it, the next-step box last.
   */
  it('gives the uncharted step the same tail', () => {
    render(<App />);
    expect(landmarks('step-benefit')).toEqual(['control', 'details', 'next']);
  });

  it('puts each step\u2019s control on the axis its own chart sweeps', () => {
    render(<App />);
    for (const [id, name] of [
      ['step-torpedo', /other income \(not social security\)/i],
      ['step-gains', /long-term capital gains inside that income/i],
    ] as const) {
      const slider = screen.getByRole('slider', { name });
      expect(document.getElementById(id)?.contains(slider)).toBe(true);
    }
    // Step 4's is a radio group, and its own chart is the only one on the page
    // whose axis runs far enough right to hold the conversion it sizes.
    expect(
      document
        .getElementById('step-conversion')
        ?.querySelectorAll('input[name="conversion-ceiling"]'),
    ).toHaveLength(6);
  });

  /**
   * The readout is what makes the slider more than an inert control: it reads
   * the drawn curve back at the value the reader picked, which is the number
   * the chart cannot show them without being pointed at.
   */
  it('reads the torpedo curve back at the reader\u2019s own income', () => {
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

  it('reads the gains curve back at the reader\u2019s own share of it', () => {
    render(<App />);
    const readout = (): HTMLElement =>
      document.querySelector('#step-gains .slider-readout') as HTMLElement;
    expect(readout()).toHaveTextContent(
      'With $0 of your $30,000 coming from long-term gains',
    );

    fireEvent.change(
      screen.getByRole('slider', {
        name: /long-term capital gains inside that income/i,
      }),
      { target: { value: '20000' } },
    );
    expect(readout()).toHaveTextContent(
      'With $20,000 of your $30,000 coming from long-term gains',
    );
    expect(readout()).toHaveTextContent(/taxed at\s+\d+(\.\d+)?%/);
  });
});

/**
 * The chart says what every income costs; this says what the reader's own
 * income costs and which way it is worth moving. The tooltip has carried the
 * same arithmetic all along, but only for whichever point a mouse was over —
 * which is nobody's point in particular, and no point at all on a touchscreen.
 *
 * Figures below are 2025, single, the $23,712 average benefit: the rate rises
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
      'it holds from $22,750 to $40,500',
    );
    expect(advice()).toHaveTextContent(
      'Coming back under $22,750 — $7,250 less income — takes the next dollar down to 18.5%',
    );
    expect(advice()).toHaveTextContent(
      'clearing $40,750 — $10,750 more — takes it to 12%',
    );
  });

  it('measures the room left when the reader is on the valley floor', () => {
    render(<App />);
    setIncome(10_000);
    expect(advice()).toHaveTextContent('You are on the valley floor');
    expect(advice()).toHaveTextContent(
      'every dollar up to $15,000 — $5,000 of room from here',
    );
    expect(advice()).toHaveTextContent('climbs to 22.2% by $22,750');
  });

  it('measures the distance left when the reader is on the climb', () => {
    render(<App />);
    setIncome(20_000);
    expect(advice()).toHaveTextContent('You are on the climb');
    expect(advice()).toHaveTextContent(
      '$2,750 further on — at $22,750 — the rate reaches 22.2%',
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
      'against 22.2% back between $22,750 and $40,500',
    );
    expect(advice()).toHaveTextContent(
      'nearest cheaper ground on this chart is 12% between $40,750 and $44,000',
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
      'The next dollar costs 12%, and holds there to $64,250',
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
 * The text alternative to the charts.
 *
 * A recharts chart is an SVG of unlabelled paths, so until this the app's
 * centrepiece said nothing at all to a screen reader, and every word the page
 * spent on the curve was relative to wherever the reader's own slider happened
 * to be. The caption is the curve itself, in order, for everybody — and it is
 * the only place the hump's location is stated without the reader first having
 * to put a slider inside it.
 *
 * Figures below are 2025, single, the $23,712 average benefit, the same return
 * the advice tests read.
 */
describe('the curve in words', () => {
  const captions = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('figcaption.chart-caption'));
  const caption = (step: 'torpedo' | 'gains' | 'conversion'): HTMLElement =>
    document.querySelector(
      `#step-${step} figcaption.chart-caption`,
    ) as HTMLElement;
  const chart = (step: 'torpedo' | 'gains' | 'conversion'): HTMLElement =>
    document.querySelector(`#step-${step} .chart-container`) as HTMLElement;
  const setIncome = (value: number): void => {
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: String(value) } },
    );
  };

  it('makes every chart a figure whose caption is its description', () => {
    render(<App />);
    expect(captions()).toHaveLength(3);
    for (const step of ['torpedo', 'gains', 'conversion'] as const) {
      // The plot is one image with a name, not a tree of unlabelled paths.
      expect(chart(step)).toHaveAttribute('role', 'img');
      expect(chart(step).getAttribute('aria-label')).toMatch(/^Chart: /);
      // And the caption below it is that image's long description.
      expect(chart(step)).toHaveAttribute(
        'aria-describedby',
        caption(step).id,
      );
      expect(chart(step).closest('figure')).toBe(caption(step).closest('figure'));
    }
  });

  it('names every band of step 2’s curve, left to right', () => {
    render(<App />);
    expect(caption('torpedo')).toHaveTextContent(
      'Left to right, the rate on the next dollar of other income is 0% up to $14,750, 15% to $22,000, 18.5% to $22,500, 22.2% to $40,500, 12% to $44,000, 22% to $98,750, then 24% out to $150,000.',
    );
  });

  it('states where the hump starts and stops without being asked', () => {
    render(<App />);
    expect(caption('torpedo')).toHaveTextContent(
      'The hump is the 22.2% stretch between $22,750 and $40,500',
    );
    expect(caption('torpedo')).toHaveTextContent('the ground just past it is cheaper');
  });

  it('does not move when the slider does — the caption is the curve, not the point', () => {
    render(<App />);
    const before = caption('torpedo').textContent;
    setIncome(120_000);
    expect(caption('torpedo').textContent).toBe(before);
  });

  it('redraws when the return does', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    // No benefit to drag into the tax base, so the curve is the bracket
    // schedule and nothing else: it climbs and never comes back down.
    expect(caption('torpedo')).toHaveTextContent(
      '0% up to $15,500, 10% to $27,500, 12% to $64,000, 22% to $119,000, then 24% out to $150,000.',
    );
    expect(caption('torpedo')).toHaveTextContent(
      'No stretch of it is a hump: none costs more than the ground on both sides of it.',
    );
  });

  it('counts the humps when a return has more than one', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    );
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '47424' } },
    );
    // The inclusion phase, then the senior deduction's phaseout: the second
    // hump is the one no reader would guess was there.
    expect(caption('torpedo')).toHaveTextContent(
      'It humps twice: 22.2% between $44,500 and $60,500, and 26.88% between $202,500 and $209,500 — the ground just past each one is cheaper than the ground on it.',
    );
  });

  it('words step 3’s caption about the split rather than the size', () => {
    render(<App />);
    expect(caption('gains')).toHaveTextContent(
      'Left to right, the rate on the next dollar taken as gain rather than as ordinary income is 10.2% up to $13,500, 8.5% to $25,250, then 0% out to $30,000.',
    );
    expect(caption('gains')).toHaveTextContent(
      'The hump is the 10.2% stretch between $0 and $13,500',
    );
  });

  it('says so plainly when a curve never changes rate', () => {
    render(<App />);
    // Past the torpedo the benefit is fully in the tax base at every split,
    // so moving income between the two schedules costs one rate throughout.
    setIncome(90_000);
    expect(caption('gains')).toHaveTextContent(
      'is a flat 15% the whole way, from $0 to $90,000.',
    );
    // One band has already said it has no hump; the note would repeat it.
    expect(caption('gains')).not.toHaveTextContent('hump');
  });

  it('drops step 3’s figure entirely when there is no axis to draw', () => {
    render(<App />);
    setIncome(0);
    expect(captions()).toHaveLength(2);
    expect(caption('gains')).toBeNull();
  });

  it('says step 4 is redrawing step 2’s curve, and how far out', () => {
    render(<App />);
    expect(caption('conversion')).toHaveTextContent(
      "Step 2's own curve, redrawn out to $150,000:",
    );
    expect(caption('conversion')).toHaveTextContent(
      '22.2% to $40,500, 12% to $44,000',
    );
  });

  it('names the shaded conversion in step 4’s label, and its absence', () => {
    render(<App />);
    expect(chart('conversion').getAttribute('aria-label')).toContain(
      'with the sized conversion shaded from $30,000 to $44,069',
    );
    // Nothing fits under the top of the 12% bracket from $90,000 of income.
    setIncome(90_000);
    expect(chart('conversion').getAttribute('aria-label')).toContain(
      'Nothing fits under the line picked, so no conversion is shaded',
    );
  });

  it('gives each chart’s label its own axis and right edge', () => {
    render(<App />);
    expect(chart('torpedo').getAttribute('aria-label')).toBe(
      'Chart: the marginal tax rate on the next dollar of other income, plotted from $0 to $150,000.',
    );
    expect(chart('gains').getAttribute('aria-label')).toBe(
      'Chart: the marginal tax rate as more of $30,000 of other income is taken as long-term capital gain, plotted from $0 to $30,000.',
    );
  });
});

/**
 * The step-3 rewrite: a long-term gain is a share of the income entered in
 * step 2, never a second figure stacked on top of it. So the reader's total
 * income is one number set once, step 3 moves only its composition, and both
 * charts price the same return.
 */
describe('a gain is a share of the income, not an addition to it', () => {
  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(not social security\)/i });
  const gainSlider = (): HTMLElement =>
    screen.getByRole('slider', {
      name: /long-term capital gains inside that income/i,
    });
  const readout = (step: string): HTMLElement =>
    document.querySelector(`#step-${step} .slider-readout`) as HTMLElement;

  it('ends the gains axis where the reader\u2019s own income ends', () => {
    render(<App />);
    expect(gainSlider()).toHaveAttribute('max', '30000');

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    expect(gainSlider()).toHaveAttribute('max', '90000');
  });

  it('drags the gain down when the income it came out of falls under it', () => {
    render(<App />);
    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    fireEvent.change(gainSlider(), { target: { value: '60000' } });
    expect(gainSlider()).toHaveValue('60000');

    fireEvent.change(incomeSlider(), { target: { value: '40000' } });
    expect(gainSlider()).toHaveValue('40000');
  });

  /**
   * The centrepiece chart honours the split too, and this is the proof: the
   * same $30,000 of income, with $20,000 of it charged under the capital-gain
   * schedule instead of the ordinary one, makes the next dollar cheaper. Under
   * the old additive reading the gain reached no chart at all and this figure
   * never moved.
   */
  it('re-prices the torpedo curve when the split changes', () => {
    render(<App />);
    expect(readout('torpedo')).toHaveTextContent('taxed at 22.2%');

    fireEvent.change(gainSlider(), { target: { value: '20000' } });
    expect(readout('torpedo')).toHaveTextContent('taxed at 18.5%');
    expect(readout('torpedo')).toHaveTextContent(
      '$20,000 of this coming from long-term gains',
    );
  });

  /**
   * The figure the non-additive framing exists to produce, and the one neither
   * chart shows on its own: what taking part of the same income as a gain is
   * worth against taking all of it as ordinary income.
   */
  it('prices the split against the all-ordinary version of the same income', () => {
    render(<App />);
    expect(readout('gains')).not.toHaveTextContent('saves');

    fireEvent.change(gainSlider(), { target: { value: '20000' } });
    expect(readout('gains')).toHaveTextContent(
      'rather than taking all of it as ordinary income saves $2,270',
    );
  });

  it('says there is nothing to split when the income is $0', () => {
    render(<App />);
    fireEvent.change(incomeSlider(), { target: { value: '0' } });
    expect(screen.getByText(/Nothing to split yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', {
        name: /long-term capital gains inside that income/i,
      }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  What the return actually owes                                      */
/* ------------------------------------------------------------------ */

/**
 * Every rate this page quoted was the price of the *next* dollar. The total
 * bill existed only inside the two tooltips, which means a reader who never
 * hovered — and every reader on a touch screen — walked all four steps
 * without once being told what the return costs.
 *
 * It is one figure, not two: the two charts sweep the same return two ways and
 * the reader stands at the same place on each, so step 2 and step 3 quote the
 * same total, and step 4's "this year's bill" is the third copy of it. The
 * effective rate beside it is the average the marginal rate is so often
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
    // $30,000 of other income and the $23,712 average benefit.
    expect(readout('torpedo')).toHaveTextContent(
      'owes $2,813 in federal tax on $53,712 of total income — an effective rate of 5.24%',
    );
  });

  /** The distinction the whole pairing exists to draw. */
  it('names the effective rate as the average and the marginal as the next dollar', () => {
    render(<App />);
    expect(readout('torpedo')).toHaveTextContent('taxed at 22.2%');
    expect(readout('torpedo')).toHaveTextContent(
      'the average across every dollar of it; the figure before it is the price of the next one',
    );
  });

  it('quotes the same total under the gains slider, on an income it does not move', () => {
    render(<App />);
    expect(readout('gains')).toHaveTextContent(
      'owes $2,813 in federal tax on the $53,712 of total income this slider never moves — an effective rate of 5.24%',
    );
  });

  it('quotes the same total again as step 4\u2019s bill before the conversion', () => {
    render(<App />);
    expect(
      document.querySelector('#step-conversion .slider-readout'),
    ).toHaveTextContent("taking this year's bill from $2,813 to $5,578");
  });

  /**
   * Step 3 moves the composition of an income it never changes the size of, so
   * the bill and the rate move and the denominator does not.
   */
  it('re-prices the bill when the split changes, leaving the income alone', () => {
    render(<App />);
    set(/long-term capital gains inside that income/i, 20_000);
    expect(readout('gains')).toHaveTextContent(
      'owes $543 in federal tax on the $53,712 of total income this slider never moves — an effective rate of 1.01%',
    );
    expect(readout('torpedo')).toHaveTextContent(
      'owes $543 in federal tax on $53,712 of total income — an effective rate of 1.01%',
    );
  });

  it('moves all three figures when the income does', () => {
    render(<App />);
    set(/other income \(not social security\)/i, 90_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $15,683 in federal tax on $113,712 of total income — an effective rate of 13.79%',
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
      'owes $3,833 in federal tax on $63,712 of total income',
    );
  });

  it('leaves a charitable distribution out of it', () => {
    render(<App />);
    set(/other income \(not social security\)/i, 90_000);
    set(/qualified charitable distribution/i, 20_000);
    expect(readout('torpedo')).toHaveTextContent(
      'owes $11,283 in federal tax on $93,712 of total income',
    );
  });

  /**
   * And only the part of the gift that can actually be excluded: 408(d)(8) has
   * only the ordinary half of the income to come out of, so a gain that
   * crowds it out puts the rest of the gift back in the denominator.
   */
  it('counts back the part of a gift a gain has crowded out', () => {
    render(<App />);
    set(/other income \(not social security\)/i, 90_000);
    set(/qualified charitable distribution/i, 20_000);
    set(/long-term capital gains inside that income/i, 80_000);
    // Only $10,000 of ordinary income is left for the gift to come out of.
    expect(readout('torpedo')).toHaveTextContent(
      'owes $5,849 in federal tax on $103,712 of total income',
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
   * chart the reader is standing at. The planned gain is the second kind — it
   * is $0 at load and changes nothing there, but step 3's x-axis is gains, so
   * it lives under that chart rather than in here.
   */
  it('leaves the inputs that move the opening picture on screen', () => {
    render(<App />);
    for (const label of [
      'Annual Social Security Benefit',
      'Other Income (not Social Security)',
      'Long-Term Capital Gains Inside That Income',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBeNull();
    }
    for (const legend of ['Tax Year', 'Filing Status', 'Age']) {
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
    expect(advancedState()).toHaveTextContent('Charitable $108,000');
  });

  /**
   * The disclosure sits at the foot of step 1, and both of the steps below it
   * price off what is in there, so a value set once has to survive the whole
   * walk down the page.
   */
  it('keeps its values across every step', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '9000' } },
    );
    for (const name of stepNames) {
      fireEvent.click(navItem(name));
      expect(
        screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      ).toHaveValue('9000');
      expect(advancedState()).toHaveTextContent('Muni interest $9,000');
    }
  });
});

describe('Tooltip Recommendations', () => {
  const mockOrdinarySegments = [
    { rate: 0, start: 0, end: 14000, points: [], type: 'valley' as const },
    { rate: 15, start: 16000, end: 22000, points: [], type: 'flat' as const },
    { rate: 22.2, start: 24000, end: 40000, points: [], type: 'hill' as const },
    { rate: 12, start: 42000, end: 44000, points: [], type: 'valley' as const },
  ];

  const mockLtcgSegments = [
    { rate: 10.2, start: 0, end: 10000, points: [], type: 'hill' as const },
    { rate: 0, start: 12000, end: 12000, points: [], type: 'valley' as const },
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
          ssBenefit={23712}
          segments={mockOrdinarySegments}
        />,
      );
      expect(screen.getByText(/Other income \$20,000/)).toBeInTheDocument();
      expect(screen.getByText(/Marginal Rate:/)).toBeInTheDocument();
      expect(screen.queryByText(/Consider avoiding/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Consider filling out/)).not.toBeInTheDocument();
    });

    it('renders tax hill recommendation on a hill segment', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 30000, marginalRate: 22.2, totalTax: 2813 } }]}
          ssBenefit={23712}
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
          ssBenefit={23712}
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
          ssBenefit={23712}
          segments={mockOrdinarySegments}
        />,
      );
      // MAGI is $20,000 + $3,428 of taxable benefits = $23,428.
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(
        screen.getByText(/\$82,572 of MAGI to the next cliff, then \$1,052\/yr more/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/tier .* of 5/)).not.toBeInTheDocument();
    });

    it('annualizes the Part B and Part D surcharge once past a cliff', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={23712}
          segments={mockOrdinarySegments}
        />,
      );
      // $90,000 + the capped $20,155.20 of benefits clears $106,000 of MAGI.
      expect(screen.getByText('$1,052/yr')).toBeInTheDocument();
      expect(screen.getByText(/tier 1 of 5/)).toBeInTheDocument();
      expect(
        screen.getByText(/\$22,845 of MAGI to the next cliff, then \$1,591\/yr more/),
      ).toBeInTheDocument();
    });

    it('adds tax-exempt interest back and doubles the surcharge for a couple', () => {
      render(
        <CustomTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={23712}
          segments={mockOrdinarySegments}
          filingStatus="mfj"
          muniInterest={10000}
          beneficiaries={2}
        />,
      );
      // A joint return is nowhere near $212,000 here, so nothing is owed - but
      // the tax-exempt interest still counts toward the MAGI that decides it.
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(
        screen.getByText(/\$91,845 of MAGI to the next cliff, then \$2,105\/yr more/),
      ).toBeInTheDocument();
    });
  });

  describe('LTCGTooltip', () => {
    it('renders tax hill recommendation on a hill segment', () => {
      render(
        <LTCGTooltip
          active={true}
          payload={[{ payload: { ltcg: 4000, marginalRate: 10.2, totalTax: 3221 } }]}
          ordinaryIncome={30000}
          ssBenefit={23712}
          segments={mockLtcgSegments}
        />,
      );
      expect(
        screen.getByText(
          /Consider avoiding this tax hill by staying under \$0 or over \$10,000/,
        ),
      ).toBeInTheDocument();
    });

    it('renders tax valley recommendation on a valley segment', () => {
      render(
        <LTCGTooltip
          active={true}
          payload={[{ payload: { ltcg: 12000, marginalRate: 0, totalTax: 3890 } }]}
          ordinaryIncome={30000}
          ssBenefit={23712}
          segments={mockLtcgSegments}
        />,
      );
      expect(
        screen.getByText(/Consider filling out this tax valley at \$12,000/),
      ).toBeInTheDocument();
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
    // Last thing before the box that hands the reader on.
    expect(recap.nextElementSibling).toHaveClass('next-step');
  });

  it('names the return the defaults describe', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent(
      'Everything from here on prices one return: 2025 brackets and standard ' +
        'deduction, a single filer, under 65, collecting $23,712 of Social ' +
        'Security a year.',
    );
  });

  it('follows the year, the status and the benefit', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '48000' } },
    );
    expect(scenarioRecap()).toHaveTextContent(
      'Everything from here on prices one return: 2026 brackets and standard ' +
        'deduction, a married couple filing jointly, under 65, collecting ' +
        '$48,000 of Social Security a year.',
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
   * The recap names the three headline settings; the advanced disclosure keeps
   * its own summary of the two it hides. What the recap owes the reader is not
   * to imply the list is complete when it is not.
   */
  it('points at the advanced inputs only once one has been set', () => {
    render(<App />);
    expect(scenarioRecap()).not.toHaveTextContent('Advanced inputs');

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '5000' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'Plus whatever is set under Advanced inputs above.',
    );

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '0' },
    });
    expect(scenarioRecap()).not.toHaveTextContent('Advanced inputs');
  });
});

describe('tax year selector', () => {
  const yearRadio = (year: number): HTMLElement =>
    screen.getByRole('radio', { name: String(year) });

  it('offers every year on file and opens on the calendar year', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: /tax year/i })).toBeInTheDocument();
    expect(yearRadio(2025)).toBeChecked();
    expect(yearRadio(2026)).not.toBeChecked();
    expect(scenarioRecap()).toHaveTextContent('2025 brackets and standard deduction');
  });

  it('re-prices the standard deduction for 2026', () => {
    render(<App />);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $15,750. Turning 65 adds $2,000.',
    );

    fireEvent.click(yearRadio(2026));
    expect(yearRadio(2026)).toBeChecked();
    expect(yearRadio(2025)).not.toBeChecked();

    expect(scenarioRecap()).toHaveTextContent('2026 brackets and standard deduction');
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $16,100. Turning 65 adds $2,050.',
    );
  });

  it('moves an untouched benefit slider onto the new year’s average and max', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue('23712');
    expect(slider).toHaveAttribute('max', '61296');

    fireEvent.click(yearRadio(2026));
    // Nobody moved the slider, so it follows the COLA — which is the whole
    // comparison the selector exists to make.
    expect(slider).toHaveValue('24852');
    expect(slider).toHaveAttribute('max', '62172');
    expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    expect(screen.getByText('$62,172 (2026 max)')).toBeInTheDocument();
  });

  it('keeps a benefit the user chose, clamped to the new year’s maximum', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });

    fireEvent.change(slider, { target: { value: '40000' } });
    fireEvent.click(yearRadio(2026));
    expect(slider).toHaveValue('40000');

    // The 2026 maximum is past the 2025 one, so going back has to clamp or the
    // slider would sit beyond its own right edge.
    fireEvent.change(slider, { target: { value: '62172' } });
    fireEvent.click(yearRadio(2025));
    expect(slider).toHaveValue('61296');
  });

  it('opens on a year it actually has figures for, under the real clock', () => {
    // Every other test here pins the clock to 2025. This one does not: it is
    // the check that whatever `defaultTaxYear()` returns today is a year the
    // selector can render, so shipping past the last year on file cannot leave
    // the app opening on a blank schedule.
    vi.useRealTimers();
    render(<App />);
    const opening = defaultTaxYear();
    expect(TAX_YEARS).toContain(opening);
    expect(yearRadio(opening)).toBeChecked();
    expect(scenarioRecap()).toHaveTextContent(
      `${opening} brackets and standard deduction`,
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

  it('runs from $0 to the 2025 annual limit', () => {
    render(<App />);
    expect(qcdSlider()).toHaveValue('0');
    expect(qcdSlider()).toHaveAttribute('min', '0');
    expect(qcdSlider()).toHaveAttribute('max', '108000');
    expect(qcdNote()).toHaveTextContent('Capped at $108,000 for 2025');
  });

  /**
   * The slider used to stop at `min(limit, axisMax)`, so a joint return's
   * $216,000 was cut off at the chart's $150,000 domain — the chart clipping
   * the statute. Now the statute sets the slider and the chart follows.
   */
  it('doubles the limit on a joint return and runs the slider all the way to it', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    expect(qcdSlider()).toHaveAttribute('max', '216000');
    expect(qcdNote()).toHaveTextContent('Capped at $216,000 for 2025');
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

  it('re-prices the limit when the tax year changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(qcdSlider()).toHaveAttribute('max', '111000');
    expect(qcdNote()).toHaveTextContent('Capped at $111,000 for 2026');
  });

  it('clamps a gift parked past the limit when the year or status changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    setSlider(/qualified charitable distribution/i, '111000');
    expect(qcdSlider()).toHaveValue('111000');
    // 2025's limit is $3,000 lower, and the slider must not sit past its edge.
    fireEvent.click(screen.getByRole('radio', { name: '2025' }));
    expect(qcdSlider()).toHaveValue('108000');

    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    setSlider(/qualified charitable distribution/i, '150000');
    // The limit is per individual, so it halves on the way back to one filer.
    fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
    expect(qcdSlider()).toHaveValue('108000');
  });

  it('takes the gift back out of the axis label', () => {
    render(<App />);
    expect(
      screen.getByText(/total income = other income \+ \$23,712 ss$/i),
    ).toBeInTheDocument();
    setSlider(/qualified charitable distribution/i, '10000');
    expect(
      screen.getByText(
        /total income = other income \+ \$23,712 ss \u2212 \$10,000 given straight to charity/i,
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
        year={PINNED_YEAR}
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
        year={PINNED_YEAR}
      />,
    );
    expect(
      screen.getByText(/less \$5,000 given straight to charity/i),
    ).toHaveTextContent('$0 of it reaches the return');
  });
});

describe('head of household', () => {
  /** The filing-status fieldset, so the note can be read in context. */
  const filingSection = (): HTMLElement =>
    screen.getByRole('group', { name: /filing status/i });

  const selectHoh = (): void => {
    fireEvent.click(screen.getByRole('radio', { name: 'Head of Household' }));
  };

  it('offers Head of Household alongside the other three statuses', () => {
    render(<App />);
    const hoh = screen.getByRole('radio', { name: 'Head of Household' });
    expect(hoh).not.toBeChecked();
    selectHoh();
    expect(hoh).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Single' })).not.toBeChecked();
    // Once in the recap that closes step 1, once in the close that ends the
    // page, once opening the status note.
    expect(screen.getAllByText(/a head of household/i)).toHaveLength(3);
  });

  it('explains that the thresholds are a single filer\'s and the rest is not', () => {
    render(<App />);
    selectHoh();
    const note = filingSection();
    expect(note).toHaveTextContent(
      /IRC 86\(c\) names only two special base amounts — \$32,000 on a joint return and \$0 on a separate one/,
    );
    expect(note).toHaveTextContent(
      /takes the default, \$25,000 and \$34,000, which is exactly what Single uses/,
    );
    expect(note).toHaveTextContent(
      /a \$23,625 standard deduction against \$15,750, and a 12% band running to \$64,850 instead of \$48,475/,
    );
  });

  it('re-dates the comparison when the tax year changes', () => {
    render(<App />);
    selectHoh();
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(filingSection()).toHaveTextContent(
      /a \$24,150 standard deduction against \$16,100, and a 12% band running to \$67,450 instead of \$50,400/,
    );
  });

  it('warns that qualifying is the hard part, and that a widow is not here yet', () => {
    render(<App />);
    selectHoh();
    const note = filingSection();
    expect(note).toHaveTextContent(/unmarried at year end/);
    expect(note).toHaveTextContent(/more than half the cost of keeping up your home/);
    expect(note).toHaveTextContent(/a dependent parent being the one exception/);
    expect(note).toHaveTextContent(/two years after it are Qualifying Surviving Spouse/);
  });

  it('shows the note only for this status, and not the separate-return warning', () => {
    render(<App />);
    expect(filingSection()).not.toHaveTextContent(/keeps a single filer's thresholds/);
    selectHoh();
    expect(filingSection()).toHaveTextContent(/keeps a single filer's thresholds/);
    expect(filingSection()).not.toHaveTextContent(/zeroes out both thresholds/);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(filingSection()).not.toHaveTextContent(/keeps a single filer's thresholds/);
  });

  it('takes the unmarried age-65 addition with no per-spouse wording', () => {
    render(<App />);
    selectHoh();
    expect(screen.getByText(/Turning 65 adds \$2,000\./)).toBeInTheDocument();
    expect(screen.queryByText(/per qualifying spouse/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /both spouses are 65 or older/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the single filer\'s torpedo thresholds in the explainer', () => {
    render(<App />);
    selectHoh();
    expect(screen.getByText(/provisional income passes \$25,000/)).toBeInTheDocument();
    expect(screen.getByText(/past \$34,000/)).toBeInTheDocument();
  });
});

describe('the IRMAA cliff lines on the torpedo chart', () => {
  /**
   * The lines themselves are asserted on in App.chart.test.tsx, which mocks
   * ResponsiveContainer so recharts actually draws. What is checked here is the
   * key underneath: plain HTML, always rendered, and the only thing on the page
   * that says what a red dash means now that the Medicare tab is gone.
   */
  const chartKey = (container: HTMLElement): HTMLElement => {
    const key = container.querySelector<HTMLElement>('.chart-key');
    if (!key) throw new Error('no chart key rendered');
    return key;
  };

  it('names the lines and prices every one it draws', () => {
    const { container } = render(<App />);
    const key = chartKey(container);
    expect(key).toHaveTextContent("Medicare's IRMAA cliffs.");
    expect(key).toHaveTextContent('a cliff, not a phase-in');
    // Tier 1 is a $1,052.40 step; tiers 2 and 3 are $1,591 each. Rounded to
    // whole dollars, in the order the lines are drawn.
    expect(key).toHaveTextContent(
      'IRMAA 1 at $85,845 costs $1,052/yr; IRMAA 2 at $112,845 another $1,591/yr; IRMAA 3 at $146,845 another $1,591/yr.',
    );
    // The surcharge is a premium, not tax, so it is in none of the tax figures.
    expect(key).toHaveTextContent('None of that is tax');
  });

  it('re-prices the key when tax-exempt interest moves the lines left', () => {
    const { container } = render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '10000' } },
    );
    // Medicare's MAGI adds muni interest straight back, so every cliff arrives
    // $10,000 of other income earlier.
    expect(chartKey(container)).toHaveTextContent(
      'IRMAA 1 at $75,845 costs $1,052/yr; IRMAA 2 at $102,845 another $1,591/yr; IRMAA 3 at $136,845 another $1,591/yr.',
    );
  });

  it('quotes the separate return its own first tier rather than tier 1', () => {
    const { container } = render(<App />);
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
    const key = chartKey(container);
    expect(key).toHaveTextContent('IRMAA 4 at $85,845 costs $5,826/yr.');
    expect(key).not.toHaveTextContent('IRMAA 1');
  });

  it('says where the nearest cliff is when none fits on the axis', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    const key = chartKey(container);
    expect(key).toHaveTextContent('No Medicare IRMAA cliff falls on this chart.');
    // $212,000 of MAGI, less the benefits already in AGI, is past the $150,000
    // right edge — so the reader gets the figure instead of a blank margin.
    expect(key).toHaveTextContent(
      '$212,000 of MAGI — $191,845 of other income, past the right edge of the axis',
    );
    expect(key).toHaveTextContent('$1,052/yr in Medicare premiums');
  });

  it('doubles the price for a joint return with two enrollees', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /age 65 or older/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /both spouses are 65 or older/i }),
    );
    // Both cliffs are drawn here where the same return without the age toggle
    // gets neither: claiming the senior deduction stretches the axis to
    // $250,000 to fit its phaseout, and the joint cliffs come along with it.
    // IRMAA is charged per enrollee off one household MAGI figure, so both
    // steps are twice what a single filer pays.
    expect(chartKey(container)).toHaveTextContent(
      'IRMAA 1 at $191,845 costs $2,105/yr; IRMAA 2 at $245,845 another $3,182/yr, for the two of you.',
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
      /the 2025 premiums these lines are priced from are set by 2023 MAGI/,
    );
    expect(details).toHaveTextContent('setting the premium for 2027');
    expect(details).toHaveTextContent('Form SSA-44');
  });

  it('tells a separate filer its schedule skips tiers 1 through 3', () => {
    render(<App />);
    const details = () =>
      screen.getByRole('heading', { name: /medicare's irmaa cliffs/i }).closest('details');
    expect(details()).not.toHaveTextContent('tiers 1 through 3');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
    expect(details()).toHaveTextContent(
      'A separate return has no access to tiers 1 through 3',
    );
    expect(details()).toHaveTextContent('its first cliff is tier 4');
  });
});

describe('separate-return divergence figure', () => {
  it('re-dates with the tax year instead of quoting a 2025 constant', () => {
    // The separate and single rate schedules part company where the separate
    // 35% band ends, which is indexed like everything else: $375,800 in 2025,
    // $384,350 in 2026. It used to be written into the sentence.
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Separately' }));
    const fieldset = screen.getByRole('group', { name: /filing status/i });
    expect(fieldset).toHaveTextContent(
      /identical up to \$375,800 of taxable income; head of household is better than either/,
    );
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(fieldset).toHaveTextContent(/identical up to \$384,350 of taxable income/);
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
    expect(stepIntro()).toHaveTextContent('every income from $0 to $150,000');
  });

  it('widens to fit the senior deduction phaseout when it is claimed', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // $175,000 of MAGI, less the $20,155.20 of benefit already in AGI, is
    // $154,845 of other income — past the old fixed edge, and now inside.
    expect(incomeSlider()).toHaveAttribute('max', '175000');
    expect(stepIntro()).toHaveTextContent('every income from $0 to $175,000');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint phaseout starts $75,000 higher and ends $250,000 of MAGI, so
    // the axis has to reach $229,845 of other income.
    expect(incomeSlider()).toHaveAttribute('max', '250000');
    expect(stepIntro()).toHaveTextContent('every income from $0 to $250,000');
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


/**
 * Step 4 is the one that answers the h1 with a number.
 *
 * Figures below are 2025, single, the $23,712 average benefit, $30,000 of
 * other income and no gain — the page's own defaults. Under the top of the 12%
 * bracket ($48,475 of taxable income) $14,069 fits, costing $2,765 and taking
 * the year's tax from $2,813 to $5,578: 19.65% averaged over the block against
 * 22% on the first dollar past the line. The headroom is $23,047, and the
 * conversion is smaller than it because every dollar inside the torpedo raises
 * taxable income by more than a dollar.
 */
describe('sizing the conversion', () => {
  const section = (): HTMLElement =>
    document.getElementById('step-conversion') as HTMLElement;

  const readout = (): HTMLElement =>
    section().querySelector('.slider-readout') as HTMLElement;

  const pick = (label: RegExp): void => {
    fireEvent.click(screen.getByRole('radio', { name: label }));
  };

  it('answers the heading with a dollar figure, priced', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /sizing the conversion/i, level: 2 }),
    ).toBeInTheDocument();

    expect(readout()).toHaveTextContent('$14,069 fits.');
    expect(readout()).toHaveTextContent(
      'On top of your $30,000 of other income',
    );
    expect(readout()).toHaveTextContent(
      'Top of the 12% bracket, $48,475 of taxable income',
    );
    expect(readout()).toHaveTextContent('costs $2,765 in federal tax');
    expect(readout()).toHaveTextContent(
      "taking this year's bill from $2,813 to $5,578",
    );
    expect(readout()).toHaveTextContent('an average of 19.65% on every dollar');
    expect(readout()).toHaveTextContent(
      'against 22% on the first dollar past the line',
    );
  });

  /**
   * The picker is step 4's slider. Six lines, each captioned with the income
   * definition it caps — four different definitions across the six, which is
   * the trap the caption exists to keep the reader out of.
   */
  it('offers all six ceilings, each captioned with what it caps', () => {
    render(<App />);
    const radios = within(section()).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([
      'bracket12',
      'bracket22',
      'ss50',
      'ss85',
      'ltcg0',
      'irmaa1',
    ]);
    expect(radios[0]).toBeChecked();
    for (const [label, caption] of [
      [/^Top of the 12% bracket/, '$48,475 of taxable income'],
      [/^Top of the 22% bracket/, '$103,350 of taxable income'],
      [/^Social Security 50% base/, '$25,000 of provisional income'],
      [/^Social Security 85% base/, '$34,000 of provisional income'],
      [
        /^Top of the 0% capital-gains bracket/,
        '$48,350 of total taxable income (ordinary + gains)',
      ],
      [/^IRMAA tier 1/, '$106,000 of MAGI'],
    ] as const) {
      expect(
        screen
          .getByRole('radio', { name: label })
          .closest('.segmented-option'),
      ).toHaveTextContent(caption);
    }
  });

  it('re-sizes the conversion when a different line is picked', () => {
    render(<App />);
    pick(/^Top of the 22% bracket/);
    expect(readout()).toHaveTextContent('$68,944 fits.');
    expect(readout()).toHaveTextContent('costs $14,838 in federal tax');
    expect(readout()).toHaveTextContent('an average of 21.52%');
    expect(readout()).toHaveTextContent('against 24% on the first dollar');

    pick(/^IRMAA tier 1/);
    expect(readout()).toHaveTextContent('$55,844 fits.');
  });

  /**
   * The 50% base is $25,000 of provisional income, and the default return is
   * $41,856 of it before converting anything. Saying "$0 fits" would be true
   * and useless; what a reader needs is how far past the line they already are.
   */
  it('says how far past the line a return already is', () => {
    render(<App />);
    pick(/^Social Security 50% base/);
    expect(readout()).toHaveTextContent('Nothing fits.');
    expect(readout()).toHaveTextContent(
      'already $16,856 past the line you picked',
    );
    expect(readout()).toHaveTextContent(
      'Social Security 50% base, $25,000 of provisional income',
    );
    expect(section().querySelector('.chart-key')).toHaveTextContent(
      'No band is drawn.',
    );
  });

  /** Every step prices the same return, and step 4 is the proof of it. */
  it('re-prices when step 2 moves the income the conversion sits on', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '0' } },
    );
    expect(readout()).toHaveTextContent('On top of your $0 of other income');
    // More room under the same line, so a larger conversion fits under it.
    const fits = (readout().textContent ?? '').match(/\$([\d,]+) fits/);
    expect(fits).not.toBeNull();
    expect(Number((fits as RegExpMatchArray)[1].replace(/,/g, ''))).toBeGreaterThan(
      14_069,
    );
  });

  it('carries the ceiling’s own note as the advice past the line', () => {
    render(<App />);
    const advice = (): HTMLElement =>
      section().querySelector('.conversion-advice') as HTMLElement;
    expect(advice()).toHaveTextContent(
      'The next dollar of ordinary income is taxed at 22% instead of 12%.',
    );

    pick(/^IRMAA tier 1/);
    expect(advice()).toHaveTextContent('A true cliff, not a phase-in');
  });

  it('lists every line in the explainer, with this return’s figures', () => {
    render(<App />);
    const list = section().querySelector(
      '#conversion-ceilings-heading',
    )?.closest('details')?.querySelector('ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(list).toHaveTextContent(
      'Top of the 0% capital-gains bracket — $48,350 of total taxable income',
    );
    expect(list).toHaveTextContent('IRMAA tier 1 (Medicare surcharge) — $106,000 of MAGI');
  });

  /**
   * Step 4 draws step 2's sweep, so it never narrows below step 2's right
   * edge — but a joint return converting to the top of the 22% bracket runs to
   * $218,044 of other income, well past the $150,000 the torpedo chart draws.
   * The axis follows the conversion out; step 2's does not move.
   */
  it('widens its own axis when the conversion runs past the torpedo chart', () => {
    render(<App />);
    const label = (): HTMLElement =>
      section().querySelector('.chart-axis-label') as HTMLElement;
    expect(label()).toHaveTextContent('drawn out to $150,000');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    pick(/^Top of the 22% bracket/);
    expect(readout()).toHaveTextContent('$188,044 fits.');
    expect(label()).toHaveTextContent('drawn out to $225,000');

    // Step 2's own axis is untouched: its slider still stops where it did.
    expect(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
    ).toHaveAttribute('max', '150000');
  });

  /**
   * A ceiling is quoted in taxable income, provisional income or MAGI, and the
   * chart's axis is none of those. What ties them together is the conversion:
   * measured in other income from where the reader stands, it is the distance
   * to the line, so drawing it is what puts the line on the chart.
   */
  it('names the far edge of the band in other-income terms', () => {
    render(<App />);
    expect(section().querySelector('.chart-key')).toHaveTextContent(
      'runs from your own $30,000 out to $44,069 of other income',
    );
  });
});

/**
 * The close.
 *
 * Step 1 ends by naming the return every later step prices; this ends the page
 * by saying what came of it. Six figures a reader leaves with — total income,
 * the tax, the average rate, the rate on the next dollar, how much of the
 * benefit ended up in the tax base, and which Medicare tier the MAGI landed in
 * — plus what step 4 sized, all in one block for the first time.
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

  it('ends the page, after step 4 and before the disclaimer', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /what this return costs/i, level: 2 }),
    ).toBeInTheDocument();
    expect(answer().previousElementSibling?.id).toBe('step-conversion');
    expect(answer().nextElementSibling?.tagName).toBe('FOOTER');
    expect(answer().nextElementSibling).toHaveTextContent(
      /does not constitute tax or financial advice/i,
    );
  });

  it('answers with the six figures the default return produces', () => {
    render(<App />);
    expect(figure('Total income')).toHaveTextContent('$53,712');
    expect(figure('Federal income tax')).toHaveTextContent('$2,813');
    expect(figure('Effective rate')).toHaveTextContent('5.24%');
    expect(figure('The next dollar')).toHaveTextContent('22.2%');
    expect(figure('Benefit in the tax base')).toHaveTextContent(
      '$11,178 of $23,712',
    );
    expect(figure('Benefit in the tax base')).toHaveTextContent('47.14% of it');
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'None \u2014 the standard premium',
    );
    expect(figure('Room to convert')).toHaveTextContent('$14,069 fits');
  });

  /**
   * A screenshot of an answer with no question in it is worth nothing, so the
   * block restates the return above the figures rather than relying on step
   * 1's recap being in the same frame.
   */
  it('restates the return it prices', () => {
    render(<App />);
    expect(intro()).toHaveTextContent(
      'Priced for 2025: a single filer, under 65, with $23,712 of Social Security and $30,000 of other income.',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(intro()).toHaveTextContent(
      'Priced for 2025: a married couple filing jointly, one spouse 65 or older,',
    );
  });

  /**
   * The tax and the two rates are already on the page twice — step 2's readout
   * quotes both, step 4 calls the same tax "this year's bill". The close is a
   * third rendering of one figure, not a second calculation of it.
   */
  it('quotes the same tax and rates the steps above it do', () => {
    render(<App />);
    const torpedoReadout = document.querySelector(
      '#step-torpedo .slider-readout',
    ) as HTMLElement;
    expect(torpedoReadout).toHaveTextContent('owes $2,813 in federal tax');
    expect(torpedoReadout).toHaveTextContent('an effective rate of 5.24%');
    expect(
      document.querySelector('#step-conversion .slider-readout'),
    ).toHaveTextContent("taking this year's bill from $2,813");

    expect(figure('Federal income tax')).toHaveTextContent('$2,813');
    expect(figure('Effective rate')).toHaveTextContent('5.24%');
    expect(figure('The next dollar')).toHaveTextContent('22.2%');
  });

  it('re-prices every figure when step 2 moves the income', () => {
    render(<App />);
    setIncome(90_000);
    expect(figure('Total income')).toHaveTextContent('$113,712');
    expect(figure('Federal income tax')).toHaveTextContent('$15,683');
    expect(figure('Effective rate')).toHaveTextContent('13.79%');
    // Past the torpedo: the next dollar is back to its own bracket rate.
    expect(figure('The next dollar')).toHaveTextContent('22%');
    // And the 85% cap is binding, which is why it is over.
    expect(figure('Benefit in the tax base')).toHaveTextContent(
      '$20,155 of $23,712',
    );
    expect(figure('Benefit in the tax base')).toHaveTextContent('85% of it');
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'Tier 1 of 5 \u2014 $1,052/yr',
    );
    expect(figure('Room to convert')).toHaveTextContent('Nothing fits');
    expect(figure('Room to convert')).toHaveTextContent(
      'already $45,930 past Top of the 12% bracket, $48,475 of taxable income',
    );
  });

  /**
   * Which tier a reader's own MAGI lands in has only ever been available by
   * hovering the chart, which is nothing at all on a touch screen.
   */
  it('names the tier the MAGI lands in and what the next cliff costs', () => {
    render(<App />);
    const medicare = figure('Medicare surcharge');
    expect(medicare).toHaveTextContent('On $41,178 of MAGI');
    expect(medicare).toHaveTextContent(
      'Another $64,822 of it crosses the next cliff, which costs $1,052 a year on the strength of one dollar.',
    );
    expect(medicare).toHaveTextContent(
      'Billed on a 2-year lag, so this is what 2025 income sets for 2027.',
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
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'On $160,155 of MAGI, charged to each of you.',
    );
    // Two enrollees, so the cliff below costs twice what one filer pays.
    expect(figure('Medicare surcharge')).toHaveTextContent(
      'costs $2,105 a year',
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
    expect(figure('Effective rate')).toHaveTextContent('4.91%');
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
    expect(figure('Total income')).toHaveTextContent('$63,712');
    expect(figure('Total income')).toHaveTextContent(
      'plus $10,000 of tax-exempt interest',
    );
    expect(figure('Effective rate')).toHaveTextContent('6.02%');

    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '0' } },
    );
    fireEvent.change(
      screen.getByRole('slider', { name: /qualified charitable distribution/i }),
      { target: { value: '20000' } },
    );
    expect(figure('Total income')).toHaveTextContent('$33,712');
    expect(figure('Total income')).toHaveTextContent(
      'less the $20,000 that went straight to charity',
    );
    // The gift takes provisional income under the 50% base, so none of the
    // benefit is taxable and the return owes nothing.
    expect(figure('Federal income tax')).toHaveTextContent('$0');
    expect(figure('Benefit in the tax base')).toHaveTextContent('$0 of $23,712');
  });

  it('carries whatever line step 4 is sized against', () => {
    render(<App />);
    expect(figure('Room to convert')).toHaveTextContent(
      'Sized against Top of the 12% bracket, $48,475 of taxable income. It costs $2,765, taking the bill to $5,578 \u2014 an average of 19.65% on every dollar converted.',
    );

    fireEvent.click(
      screen.getByRole('radio', { name: /^Social Security 50% base/ }),
    );
    expect(figure('Room to convert')).toHaveTextContent('Nothing fits');
    expect(figure('Room to convert')).toHaveTextContent(
      'already $16,856 past Social Security 50% base, $25,000 of provisional income',
    );
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
});

/**
 * The return in the address bar.
 *
 * Ten `useState` values used to be the whole of it, so a refresh threw the
 * return away and there was nothing to send to anyone. These are the page's
 * half of `scenarioUrl` — that the link is read on mount, written on every
 * change, and never pushed.
 */
/**
 * The one control on the page that moves no figure. State treatment of a
 * benefit is nine rules that share no shape, so the app prints and cites them
 * rather than modelling them wrong — which makes the whole feature a menu in
 * step 1 and a paragraph under step 2's chart.
 */
describe('the state footnote under the torpedo chart', () => {
  const stateMenu = (): HTMLElement => screen.getByRole('combobox', { name: 'State' });

  const footnote = (): HTMLElement =>
    screen.getByText(/taxes part of this benefit as well|stopped taxing benefits in|Every figure on this page is a federal one/)
      .closest('p') as HTMLElement;

  it('opens with no state named and says so in federal terms', () => {
    render(<App />);
    expect(stateMenu()).toHaveValue('');

    const note = footnote();
    expect(note).toHaveTextContent('Every figure on this page is a federal one');
    // Nine states for 2025, named rather than counted at.
    expect(note).toHaveTextContent(/9 states still reach a Social Security benefit in 2025/);
    expect(note).toHaveTextContent(
      'Colorado, Connecticut, Minnesota, Montana, New Mexico, Rhode Island, Utah, Vermont and West Virginia',
    );
    expect(note).toHaveTextContent('Name your state in step 1');
  });

  /** The year selector reaches this footnote too, which is the point of it. */
  it('names the states whose rule reads differently in the other year', () => {
    render(<App />);
    expect(footnote()).toHaveTextContent(
      /Minnesota, Rhode Island and West Virginia read differently in the other year/,
    );
  });

  it('quotes the rule, the year’s test and the source once a state is named', () => {
    render(<App />);
    fireEvent.change(stateMenu(), { target: { value: 'MT' } });

    const note = footnote();
    expect(note).toHaveTextContent(
      'Montana taxes part of this benefit as well, and the curve above does not',
    );
    expect(note).toHaveTextContent('None — the federal amount flows straight through');
    expect(note).toHaveTextContent('the torpedo lands here at full size');
    expect(note).toHaveTextContent(
      'The 2025 test is No income test — the federally taxable amount, whatever it is',
    );
    expect(note).toHaveTextContent('Mont. Code Ann. § 15-30-2120');
  });

  it('shows the other year’s test for a state whose threshold moves', () => {
    render(<App />);
    fireEvent.change(stateMenu(), { target: { value: 'MN' } });

    const note = footnote();
    expect(note).toHaveTextContent('Full: AGI < $108,320 joint');
    expect(note).toHaveTextContent(
      /It reads differently in 2026: Full: AGI < \$110,780 joint/,
    );
  });

  /**
   * West Virginia is the reason the selection survives a year change instead
   * of being cleared: a reader who named it and then moved to 2026 is owed the
   * sentence saying the phase-out finished.
   */
  it('keeps West Virginia selected into 2026 and says the phase-out finished', () => {
    render(<App />);
    fireEvent.change(stateMenu(), { target: { value: 'WV' } });
    expect(footnote()).toHaveTextContent('West Virginia taxes part of this benefit');

    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(stateMenu()).toHaveValue('WV');

    const note = footnote();
    expect(note).toHaveTextContent('West Virginia stopped taxing benefits in 2026');
    expect(note).toHaveTextContent(
      'on a 2026 return the curve above is the whole of what this benefit costs',
    );
  });

  it('counts the menu against the year in the caption under it', () => {
    render(<App />);
    expect(screen.getByText('9 of these 9 still tax a benefit in 2025')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(screen.getByText('8 of these 9 still tax a benefit in 2026')).toBeInTheDocument();
  });

  it('rides in the link like everything else the reader set', () => {
    render(<App />);
    fireEvent.change(stateMenu(), { target: { value: 'VT' } });
    expect(window.location.search).toBe('?year=2025&state=VT');
  });

  it('opens on the state the link names', () => {
    window.history.replaceState(null, '', '/?year=2025&state=UT');
    render(<App />);
    expect(stateMenu()).toHaveValue('UT');
    expect(footnote()).toHaveTextContent('Utah taxes part of this benefit as well');
  });
});

describe('the return in the address bar', () => {
  const openAt = (search: string): void => {
    window.history.replaceState(null, '', `/${search}`);
  };

  const incomeSlider = (): HTMLElement =>
    screen.getByRole('slider', { name: /other income \(not social security\)/i });

  it('opens on the return the link names rather than on its own defaults', () => {
    openAt(
      '?year=2026&filing=mfj&ss=40000&income=120000&ltcg=25000&senior=1&spouse=1&muni=8000&qcd=15000&ceiling=irmaa1',
    );
    render(<App />);

    expect(screen.getByRole('radio', { name: '2026' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Married Filing Jointly' })).toBeChecked();
    expect(screen.getByRole('slider', { name: /social security benefit/i })).toHaveValue(
      '40000',
    );
    expect(incomeSlider()).toHaveValue('120000');
    expect(
      screen.getByRole('slider', { name: /long-term capital gains inside that income/i }),
    ).toHaveValue('25000');
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
    expect(screen.getByRole('radio', { name: /^IRMAA tier 1/ })).toBeChecked();
  });

  it('writes what the reader moves back into the address', () => {
    render(<App />);
    // The opening return is the one default that is always written down.
    expect(window.location.search).toBe('?year=2025');

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    expect(window.location.search).toBe('?year=2025&income=90000');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(window.location.search).toBe('?year=2025&filing=mfj&income=90000');

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
    expect(window.location.search).toBe('?year=2025&income=70000');
    expect(window.history.length).toBe(before);
  });

  /** What a refresh does, which is the other half of what the bullet asked for. */
  it('comes back on the same return after the page is thrown away', () => {
    const first = render(<App />);
    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Head of Household' }));
    const survived = window.location.search;
    first.unmount();

    render(<App />);
    expect(incomeSlider()).toHaveValue('90000');
    expect(screen.getByRole('radio', { name: 'Head of Household' })).toBeChecked();
    expect(window.location.search).toBe(survived);
  });

  /**
   * The step is a place on the page, not part of the return, so it rides in
   * the fragment the browser already scrolls to — and the rewritten address
   * has to keep it, because `replaceState` takes a whole URL.
   */
  it('marks the step the fragment names and keeps the fragment through a change', () => {
    openAt('#step-conversion');
    render(<App />);
    expect(currentStep()).toBe('Roth conversion');

    fireEvent.change(incomeSlider(), { target: { value: '90000' } });
    expect(window.location.hash).toBe('#step-conversion');
    expect(window.location.search).toBe('?year=2025&income=90000');
  });

  it('ignores a fragment that names no step', () => {
    openAt('#step-medicare');
    render(<App />);
    expect(currentStep()).toBe('Your benefit');
  });

  describe('a link this page could not honour', () => {
    it('says what it could not give and what it gave instead', () => {
      openAt('?year=2024&income=99999999&filing=widow');
      render(<App />);

      const note = screen.getByRole('status');
      expect(note).toHaveTextContent('This link asked for something this page could not show');
      expect(note).toHaveTextContent('priced for 2024');
      expect(note).toHaveTextContent('$1,000,000');
      expect(note).toHaveTextContent('“widow”');

      // And the page itself is showing exactly what the note says it is.
      expect(screen.getByRole('radio', { name: '2025' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
      expect(incomeSlider()).toHaveValue('1000000');
    });

    /**
     * Dismissible because it describes the arrival, not the return: it stops
     * being true of what is on screen the moment a control moves.
     */
    it('goes away when dismissed and never appears for a link it wrote itself', () => {
      openAt('?year=2024');
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('stays out of the way of a link that came through as sent', () => {
      openAt('?year=2025&income=90000');
      render(<App />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});

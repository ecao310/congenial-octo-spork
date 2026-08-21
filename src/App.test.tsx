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
const stepNames = ['Your benefit', 'The tax torpedo', 'Capital gains'] as const;

const stepNav = (): HTMLElement => screen.getByRole('toolbar', { name: 'Steps' });

const navItem = (name: (typeof stepNames)[number]): HTMLElement =>
  within(stepNav()).getByRole('button', { name });

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

  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /marginal tax rate/i })).toBeInTheDocument();
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
    expect(screen.getByText(/a single filer/i)).toBeInTheDocument();
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
    expect(
      screen.getByText(/a married couple filing jointly/i),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(/filing separately who lived with their spouse/i),
    ).toBeInTheDocument();
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
      name: /other ordinary income/i,
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
      name: /other ordinary income/i,
    });
    fireEvent.change(slider, { target: { value: '50000' } });
    expect(slider).toHaveValue('50000');
  });
});

describe('the step flow', () => {
  it('numbers all three steps in the nav, in reading order', () => {
    render(<App />);
    expect(
      within(stepNav())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['1Your benefit', '2The tax torpedo', '3Capital gains']);
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
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('opens with the first step marked current', () => {
    render(<App />);
    expect(currentStep()).toBe('Your benefit');
    expect(navItem('Capital gains')).not.toHaveAttribute('aria-current');
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
    fireEvent.click(screen.getByRole('button', { name: /Step 2 of 3/ }));
    expect(currentStep()).toBe('The tax torpedo');
    expect(document.activeElement).toBe(document.getElementById('step-torpedo'));

    fireEvent.click(screen.getByRole('button', { name: /Step 3 of 3/ }));
    expect(currentStep()).toBe('Capital gains');
    expect(document.activeElement).toBe(document.getElementById('step-gains'));
  });

  it('names where each box goes, and stops at the last step', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /Step 2 of 3/ }),
    ).toHaveTextContent('The tax torpedo');
    expect(
      screen.getByRole('button', { name: /Step 3 of 3/ }),
    ).toHaveTextContent('Capital Gains Stacking');
    expect(screen.queryByRole('button', { name: /Step 4 of 3/ })).toBeNull();
  });

  it('moves between steps with the arrow keys and wraps at both ends', () => {
    render(<App />);

    fireEvent.keyDown(stepNav(), { key: 'ArrowRight' });
    expect(currentStep()).toBe('The tax torpedo');

    fireEvent.keyDown(stepNav(), { key: 'ArrowLeft' });
    fireEvent.keyDown(stepNav(), { key: 'ArrowLeft' });
    expect(currentStep()).toBe('Capital gains');

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
    fireEvent.click(navItem('Capital gains'));
    for (const name of stepNames) {
      expect(navItem(name)).toHaveAttribute(
        'tabindex',
        name === 'Capital gains' ? '0' : '-1',
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
    const income = screen.getByRole('slider', { name: /other ordinary income/i });
    fireEvent.change(income, { target: { value: '90000' } });

    for (const name of stepNames) {
      fireEvent.click(navItem(name));
      expect(
        screen.getByRole('slider', { name: /social security benefit/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('slider', { name: /other ordinary income/i }),
      ).toHaveValue('90000');
      expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    }
  });
});

/**
 * Every step is laid out the same way, and this is the test of it.
 *
 * chart \u2192 the one slider that says where on that chart you are \u2192 the
 * collapsed explainers \u2192 the box to the next step. Step 1 has no curve of
 * its own, so it starts at the slider; step 3 is last, so it ends at the
 * explainer. A slider above its chart reads as an input to the chart, which is
 * exactly what it is not \u2014 the chart already prices every value the slider
 * can take.
 */
describe('the shape every step shares', () => {
  /** The step's own landmarks in DOM order, runs of a kind collapsed. */
  const landmarks = (id: string): string[] => {
    const section = document.getElementById(id) as HTMLElement;
    const kinds = Array.from(
      section.querySelectorAll(
        '.chart-container, input[type="range"], details, .next-step',
      ),
    )
      // A slider inside a disclosure is that disclosure's business, not the
      // step's: the shape is about what the reader meets on the way down.
      .filter((el) => el.tagName === 'DETAILS' || el.closest('details') === null)
      .map((el) =>
        el.classList.contains('chart-container')
          ? 'chart'
          : el.classList.contains('next-step')
            ? 'next'
            : el.tagName === 'DETAILS'
              ? 'details'
              : 'slider',
      );
    return kinds.filter((kind, i) => kind !== kinds[i - 1]);
  };

  it('lays the two charted steps out chart, slider, explainers, next', () => {
    render(<App />);
    expect(landmarks('step-torpedo')).toEqual([
      'chart',
      'slider',
      'details',
      'next',
    ]);
    expect(landmarks('step-gains')).toEqual(['chart', 'slider', 'details']);
  });

  /**
   * Step 1 draws nothing, so the return it sets stands where a chart stands.
   * What it still owes the shape is the ordering of the rest: one slider on
   * screen, the disclosure after it, the next-step box last.
   */
  it('gives the uncharted step the same tail', () => {
    render(<App />);
    expect(landmarks('step-benefit')).toEqual(['slider', 'details', 'next']);
  });

  it('puts each step\u2019s slider on the axis its own chart sweeps', () => {
    render(<App />);
    for (const [id, name] of [
      ['step-torpedo', /other ordinary income/i],
      ['step-gains', /long-term capital gains you plan to realize/i],
    ] as const) {
      const slider = screen.getByRole('slider', { name });
      expect(document.getElementById(id)?.contains(slider)).toBe(true);
    }
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
      screen.getByRole('slider', { name: /other ordinary income/i }),
      { target: { value: '90000' } },
    );
    expect(readout()).toHaveTextContent('At $90,000 of other income');
    expect(readout()).toHaveTextContent(/taxed at\s+\d+(\.\d+)?%/);
  });

  it('reads the gains curve back at the reader\u2019s own gain', () => {
    render(<App />);
    const readout = (): HTMLElement =>
      document.querySelector('#step-gains .slider-readout') as HTMLElement;
    expect(readout()).toHaveTextContent('At $0 of realized gains');

    fireEvent.change(
      screen.getByRole('slider', {
        name: /long-term capital gains you plan to realize/i,
      }),
      { target: { value: '40000' } },
    );
    expect(readout()).toHaveTextContent('At $40,000 of realized gains');
    expect(readout()).toHaveTextContent(/taxed at\s+\d+(\.\d+)?%/);
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
      inside.queryByLabelText('Long-Term Capital Gains You Plan to Realize'),
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
      'Other Ordinary Income (non-LTCG, non-SS)',
      'Long-Term Capital Gains You Plan to Realize',
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

describe('tax year selector', () => {
  const yearRadio = (year: number): HTMLElement =>
    screen.getByRole('radio', { name: String(year) });

  it('offers every year on file and opens on the calendar year', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: /tax year/i })).toBeInTheDocument();
    expect(yearRadio(2025)).toBeChecked();
    expect(yearRadio(2026)).not.toBeChecked();
    expect(screen.getByText(/2025 brackets, standard deduction/)).toBeInTheDocument();
  });

  it('re-prices the standard deduction for 2026', () => {
    render(<App />);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $15,750. Turning 65 adds $2,000.',
    );

    fireEvent.click(yearRadio(2026));
    expect(yearRadio(2026)).toBeChecked();
    expect(yearRadio(2025)).not.toBeChecked();

    expect(screen.getByText(/2026 brackets, standard deduction/)).toBeInTheDocument();
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
    expect(
      screen.getByText(new RegExp(`${opening} brackets, standard deduction`)),
    ).toBeInTheDocument();
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

  it('doubles the limit on a joint return but keeps the slider on the chart', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /married filing jointly/i }));
    // $216,000 is the statutory figure; the slider stops at the chart's axis.
    expect(qcdSlider()).toHaveAttribute('max', '150000');
    expect(qcdNote()).toHaveTextContent('Capped at $216,000 for 2025');
    expect(qcdNote()).toHaveTextContent(/caps it per individual/);
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
    // Once in the subtitle above the chart, once opening the status note.
    expect(screen.getAllByText(/a head of household/i)).toHaveLength(2);
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
    // IRMAA is charged per enrollee off one household MAGI figure.
    expect(chartKey(container)).toHaveTextContent(
      '$2,105/yr in Medicare premiums for the two of you',
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

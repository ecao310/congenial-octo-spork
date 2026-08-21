import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import App, {
  BackPayTooltip,
  CustomTooltip,
  LTCGTooltip,
  SequencingTooltip,
} from './App';
import type { BackPayCurvePoint } from './utils/lumpSum';
import { TAX_YEAR_PARAMS, TAX_YEARS, defaultTaxYear } from './utils/tax';
import type { TaxYear } from './utils/tax';
import { compareSequencing } from './utils/sequencing';

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
 * The page is tabbed and only the selected panel is mounted, so a test that
 * asserts on a section has to open that section's tab first. The shared
 * scenario inputs — tax year, filing status, age, and the five sliders — sit
 * above the strip and are on every tab, which is why the tests that only touch
 * those still render the app directly.
 */
type TabName =
  | 'Tax Torpedo'
  | 'Capital Gains'
  | 'Medicare'
  | 'Strategies'
  | 'Over Time'
  | 'State Taxes';

const renderTab = (name: TabName): ReturnType<typeof render> => {
  const utils = render(<App />);
  fireEvent.click(screen.getByRole('tab', { name }));
  return utils;
};

/** Every tab, in strip order — both the strip's own tests and the shared
 * scenario's "survives every tab" tests walk this list. */
const tabNames: TabName[] = [
  'Tax Torpedo',
  'Capital Gains',
  'Medicare',
  'Strategies',
  'Over Time',
  'State Taxes',
];

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

  it('shows the separate-return IRMAA column and its single four-tier cliff', () => {
    renderTab('Medicare');
    const section = screen
      .getByRole('heading', { name: /medicare's irmaa cliffs/i })
      .closest('section') as HTMLElement;
    expect(section).toHaveTextContent('MAGI (separate)');
    // A single filer climbs the tiers $1,052.40 at a time.
    expect(section).toHaveTextContent('$1,052 a year');

    selectMfs();
    // A separate return has no tiers 1-3, so its first cliff is the fourth and
    // costs the whole surcharge in one step.
    expect(section).toHaveTextContent('$5,826 a year');
    expect(section).toHaveTextContent('no access to tiers 1 through 3');
    // Its top threshold is the one the statute writes as "equal to or greater
    // than", so the table says From rather than Over.
    expect(section).toHaveTextContent('From $394,000');
  });

  it('sizes conversions against IRMAA tier 4 rather than tier 1', () => {
    renderTab('Strategies');
    selectMfs();
    expect(
      screen.getByRole('option', { name: /IRMAA tier 4 \(Medicare surcharge\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /IRMAA tier 1/ }),
    ).not.toBeInTheDocument();
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
    renderTab('Capital Gains');
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

  it('renders the Roth conversion sizing section and sizes the default scenario', () => {
    renderTab('Strategies');
    expect(
      screen.getByRole('heading', { name: /roth conversion sizing/i }),
    ).toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: /convert up to/i });
    expect(select).toHaveValue('bracket12');

    // Single, $30,000 ordinary income, average benefit, no gains: $14,069 fits
    // under the $48,475 top of the 12% bracket and costs $2,765.
    expect(screen.getByText('Largest conversion')).toBeInTheDocument();
    expect(screen.getAllByText('$14,069').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$2,765').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('was $2,813')).toBeInTheDocument();
    expect(screen.getByText('19.65%')).toBeInTheDocument();
    expect(screen.getByText('22%')).toBeInTheDocument();
  });

  it('resizes the conversion when a different ceiling is picked', () => {
    renderTab('Strategies');
    const select = screen.getByRole('combobox', { name: /convert up to/i });

    fireEvent.change(select, { target: { value: 'irmaa1' } });
    expect(select).toHaveValue('irmaa1');
    expect(screen.getAllByText('$55,844').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/two years earlier/i)).toBeInTheDocument();

    // The $25,000 provisional-income base is already behind this filer.
    fireEvent.change(select, { target: { value: 'ss50' } });
    expect(
      screen.getByText(/already \$16,856 above this ceiling/i),
    ).toBeInTheDocument();
  });

  it('counts planned capital gains against the conversion ceiling', () => {
    renderTab('Strategies');
    const gains = screen.getByRole('slider', { name: /capital gains you plan to realize/i });
    expect(gains).toHaveValue('0');

    fireEvent.change(
      screen.getByRole('combobox', { name: /convert up to/i }),
      { target: { value: 'ltcg0' } },
    );
    expect(screen.getAllByText('$13,944').length).toBeGreaterThanOrEqual(1);

    // Gains sit inside the same taxable-income ceiling, so they crowd out the
    // conversion dollar for dollar once the 85% SS cap has bound.
    fireEvent.change(gains, { target: { value: '5000' } });
    expect(gains).toHaveValue('5000');
    expect(screen.queryByText('$13,944')).not.toBeInTheDocument();
    expect(screen.getAllByText('$8,944').length).toBeGreaterThanOrEqual(1);
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

  it('feeds the age 65 deductions into the conversion sizing', () => {
    renderTab('Strategies');
    expect(screen.getAllByText('$14,069').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // $2,000 of age-65 addition plus the $6,000 senior deduction is $8,000 more
    // room under the top of the 12% bracket, and the tax before the conversion
    // drops by 12% of it.
    expect(screen.queryByText('$14,069')).not.toBeInTheDocument();
    expect(screen.getAllByText('$22,069').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('was $1,853')).toBeInTheDocument();
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

  it('feeds the muni interest into the conversion sizing', () => {
    renderTab('Strategies');
    expect(screen.getByText('was $2,813')).toBeInTheDocument();
    expect(screen.getByText('19.65%')).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );
    // The interest has already dragged the benefits in, so the conversion
    // itself has less left to drag and looks cheaper per dollar - the tax it
    // saved was simply charged before the conversion started.
    expect(screen.getByText('was $3,323')).toBeInTheDocument();
    expect(screen.getByText('16.03%')).toBeInTheDocument();
  });

  it('updates the ordinary income slider readout when moved', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other ordinary income/i,
    });
    fireEvent.change(slider, { target: { value: '50000' } });
    expect(slider).toHaveValue('50000');
  });

  describe('IRMAA cliffs', () => {
    /** The IRMAA section, so figures can be asserted in context. */
    const irmaaSection = (): HTMLElement | null =>
      screen
        .getByRole('heading', { name: /medicare.s irmaa cliffs/i })
        .closest('section');

    it('prices the default scenario against the first cliff', () => {
      renderTab('Medicare');
      const section = irmaaSection();
      // $30,000 of other income drags $11,177.60 of benefits into AGI, and
      // there is no tax-exempt interest, so Medicare's MAGI is $41,178.
      expect(section).toHaveTextContent('$41,178');
      expect(section).toHaveTextContent('None');
      // $106,000 - $41,177.60 of room, then the whole first surcharge at once.
      expect(section).toHaveTextContent('$64,822');
      expect(section).toHaveTextContent('$1,052/yr');
    });

    it('places the on-chart cliffs at less other income than their MAGI', () => {
      renderTab('Medicare');
      const section = irmaaSection();
      // The 85% cap has already bound at these incomes, so every cliff sits
      // exactly $20,155.20 of taxable benefits below its MAGI threshold. Only
      // the first three fit inside the chart's $150,000 axis.
      expect(section).toHaveTextContent('cliffs 1, 2, 3');
      expect(section).toHaveTextContent('$85,845, $112,845, $146,845');
    });

    it('shifts the cliffs left by each dollar of tax-exempt interest', () => {
      renderTab('Medicare');
      fireEvent.change(
        screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
        { target: { value: '10000' } },
      );
      const section = irmaaSection();
      expect(section).toHaveTextContent('$75,845, $102,845, $136,845');
      // Muni interest is outside taxable income but inside Medicare's MAGI,
      // and it lands there twice over: $10,000 directly, plus the extra
      // $8,500 of benefits it drags into AGI at 85c on the dollar. MAGI goes
      // $41,178 -> $59,678, not $51,178.
      expect(section).toHaveTextContent('AGI + $10,000 tax-exempt interest');
      expect(section).toHaveTextContent('$59,678');
    });

    it('says so when no cliff lands inside the chart', () => {
      renderTab('Medicare');
      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
      const section = irmaaSection();
      expect(section).toHaveTextContent('No cliff falls inside the Tax Torpedo chart');
      expect(section).toHaveTextContent('$212,000 of MAGI');
    });

    it('charges a couple both on Medicare twice off one MAGI', () => {
      renderTab('Medicare');
      expect(irmaaSection()).toHaveTextContent('$1,052/yr');

      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
      fireEvent.click(screen.getByRole('checkbox', { name: /age 65 or older/i }));
      fireEvent.click(
        screen.getByRole('checkbox', { name: /both spouses are 65 or older/i }),
      );
      const section = irmaaSection();
      expect(section).toHaveTextContent('$2,105/yr');
      expect(section).toHaveTextContent('for the two of you');
      expect(section).toHaveTextContent('for two people on Medicare');
    });

    it('lists the 2025 premium schedule and marks the current tier', () => {
      renderTab('Medicare');
      const section = irmaaSection();
      expect(section).toHaveTextContent('Up to $106,000');
      // "From", not "Over": the top row of CMS's table — and of the statutory
      // rate table it comes from — is the one inclusive threshold.
      expect(section).toHaveTextContent('From $500,000');
      expect(section).toHaveTextContent('$185.00');
      expect(section).toHaveTextContent('$628.90');
      expect(section).toHaveTextContent('+$85.80');
      // The standard-premium row is the one in force at the default income.
      const current = section?.querySelector('.tier-row-current th');
      expect(current).toHaveTextContent('Up to $106,000');
    });

    it('states the two-year lag as an explicit x-axis caveat', () => {
      renderTab('Medicare');
      const section = irmaaSection();
      expect(section).toHaveTextContent('The x-axis caveat.');
      expect(section).toHaveTextContent(
        'the 2025 premiums in the table are set by 2023 MAGI',
      );
      expect(section).toHaveTextContent('setting the premium for 2027');
      expect(section).toHaveTextContent('Form SSA-44');
    });
  });
});

describe('tabs', () => {
  it('opens on the tax torpedo, with every other panel unmounted', () => {
    render(<App />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(tabNames);
    expect(screen.getByRole('tab', { name: 'Tax Torpedo' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: /what is the tax torpedo/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /capital gains stacking/i }),
    ).not.toBeInTheDocument();
  });

  it('swaps the panel when another tab is picked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Capital Gains' }));
    expect(
      screen.getByRole('heading', { name: /capital gains stacking/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /what is the tax torpedo/i }),
    ).not.toBeInTheDocument();
  });

  /**
   * Every section prices off the same scenario, so the inputs live above the
   * strip rather than inside a panel. A slider that vanished with its tab
   * would make the whole split unusable — set an income on one tab and it has
   * to still be set on the next.
   */
  it('keeps the shared scenario inputs mounted on every tab', () => {
    render(<App />);
    const income = screen.getByRole('slider', { name: /other ordinary income/i });
    fireEvent.change(income, { target: { value: '90000' } });

    for (const name of tabNames) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(
        screen.getByRole('slider', { name: /social security benefit/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('slider', { name: /other ordinary income/i }),
      ).toHaveValue('90000');
      expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    }
  });

  it('wires each tab to the panel it controls', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Medicare' }));
    const tab = screen.getByRole('tab', { name: 'Medicare' });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('moves between tabs with the arrow keys and wraps at both ends', () => {
    render(<App />);
    const tablist = screen.getByRole('tablist');
    const selected = (): string | null =>
      screen.getByRole('tab', { selected: true }).textContent;

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(selected()).toBe('Capital Gains');

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(selected()).toBe('State Taxes');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(selected()).toBe('Tax Torpedo');
  });

  /**
   * Roving tabindex: arrowing through the strip must not leave a trail of
   * tab stops behind it, or a keyboard user pays six presses to leave the
   * strip on the way to the sliders.
   */
  it('keeps only the selected tab in the tab order', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    for (const name of tabNames) {
      expect(screen.getByRole('tab', { name })).toHaveAttribute(
        'tabindex',
        name === 'Over Time' ? '0' : '-1',
      );
    }
  });

  it('ignores keys that are not arrows', () => {
    render(<App />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Tax Torpedo',
    );
  });
});

/**
 * The scenario block opens on five inputs and hides three.
 *
 * A closed `<details>` still renders its children into jsdom, so every other
 * test in this file reaches those three sliders exactly as it did before the
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
   * The line that justifies the whole disclosure: at their defaults these
   * three change nothing, so there is nothing to see until one is moved.
   */
  it('reports all three sitting at their defaults', () => {
    render(<App />);
    expect(advancedState()).toHaveTextContent('All three at $0');
  });

  it('holds the three inputs that default to zero', () => {
    render(<App />);
    const inside = within(advanced());
    expect(
      inside.getByLabelText('Long-Term Capital Gains You Plan to Realize'),
    ).toHaveValue('0');
    expect(inside.getByLabelText('Tax-Exempt (Municipal) Interest')).toHaveValue(
      '0',
    );
    expect(inside.getByLabelText('Qualified Charitable Distribution')).toHaveValue(
      '0',
    );
  });

  /**
   * The complement, and the more important half: an input that changes the
   * charts at page load has no business being behind a disclosure.
   */
  it('leaves the inputs that move the opening picture on screen', () => {
    render(<App />);
    for (const label of [
      'Annual Social Security Benefit',
      'Other Ordinary Income (non-LTCG, non-SS)',
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
    expect(advancedState()).not.toHaveTextContent('Capital gains');

    fireEvent.change(
      screen.getByLabelText('Long-Term Capital Gains You Plan to Realize'),
      { target: { value: '20000' } },
    );
    expect(advancedState()).toHaveTextContent(
      'Capital gains $20,000 \u00B7 Muni interest $5,000',
    );

    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '3000' },
    });
    expect(advancedState()).toHaveTextContent(
      'Capital gains $20,000 \u00B7 Muni interest $5,000 \u00B7 Charitable $3,000',
    );

    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '0' } },
    );
    expect(advancedState()).not.toHaveTextContent('Muni interest');
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
   * The disclosure sits above the tab strip with the rest of the scenario, so
   * a value set on one tab has to survive every other one.
   */
  it('keeps its values across tabs', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '9000' } },
    );
    for (const name of tabNames) {
      fireEvent.click(screen.getByRole('tab', { name }));
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

  /** The IRMAA section, so its figures can be asserted in context. */
  const irmaaSection = (): HTMLElement | null =>
    screen
      .getByRole('heading', { name: /medicare.s irmaa cliffs/i })
      .closest('section');

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

  it('keeps the IRMAA lag pointed two years past the selected year', () => {
    renderTab('Medicare');
    expect(
      screen.getByText(/the 2025 income on this chart is really setting the premium for 2027/),
    ).toBeInTheDocument();

    fireEvent.click(yearRadio(2026));
    expect(
      screen.getByText(/the 2026 income on this chart is really setting the premium for 2028/),
    ).toBeInTheDocument();
  });

  it('re-prices the whole IRMAA schedule for 2026, not just its caption', () => {
    renderTab('Medicare');
    expect(irmaaSection()).toHaveTextContent('2025 premiums, set by 2023 MAGI');
    expect(irmaaSection()).toHaveTextContent('Up to $106,000');
    expect(irmaaSection()).toHaveTextContent('$185.00');

    fireEvent.click(yearRadio(2026));
    const section = irmaaSection();
    expect(section).toHaveTextContent('2026 premiums, set by 2024 MAGI');
    // Every column of the table moves: thresholds, Part B, Part D.
    expect(section).toHaveTextContent('Up to $109,000');
    expect(section).toHaveTextContent('Over $137,000');
    expect(section).toHaveTextContent('$202.90');
    expect(section).toHaveTextContent('$689.90');
    expect(section).toHaveTextContent('+$91.00');
    // The separate-return top rung fell while the single one stayed put.
    expect(section).toHaveTextContent('From $391,000');
    expect(section).toHaveTextContent('From $500,000');
    expect(section).not.toHaveTextContent('$106,000');
    expect(section).not.toHaveTextContent('$185.00');
  });
});

describe('state treatment', () => {
  const stateSection = (): HTMLElement | null =>
    screen
      .getByRole('heading', { name: /does your state tax it too\?/i })
      .closest('section');

  const stateRows = (): string[] =>
    Array.from(stateSection()!.querySelectorAll('tbody tr th')).map(
      (cell) => cell.textContent ?? '',
    );

  /**
   * One state's income-test cell, split into the selected year's wording and
   * the other years' printed beneath it. Kept apart deliberately: several of
   * these assertions turn on which of the two a figure appears in, and reading
   * the cell's whole `textContent` cannot tell them apart.
   */
  const stateTest = (state: string): { current: string; deltas: string[] } => {
    const row = Array.from(
      stateSection()!.querySelectorAll('tbody tr'),
    ).find((tr) => tr.querySelector('th')?.textContent === state);
    if (!row) throw new Error(`no row for ${state}`);
    return {
      current: row.querySelector('.state-test-current')?.textContent ?? '',
      deltas: Array.from(row.querySelectorAll('.state-test-delta')).map(
        (delta) => delta.textContent ?? '',
      ),
    };
  };

  const movingRows = (): string[] =>
    Array.from(stateSection()!.querySelectorAll('tbody tr'))
      .filter((tr) => tr.querySelector('.state-test-delta'))
      .map((tr) => tr.querySelector('th')?.textContent ?? '');

  it('names the nine states that taxed benefits in 2025, and no others', () => {
    renderTab('State Taxes');
    expect(stateRows()).toEqual([
      'Colorado',
      'Connecticut',
      'Minnesota',
      'Montana',
      'New Mexico',
      'Rhode Island',
      'Utah',
      'Vermont',
      'West Virginia',
    ]);
    // The other 41 plus DC are accounted for in prose, so the arithmetic is
    // visible rather than left to the reader.
    expect(stateSection()).toHaveTextContent(
      '41 of them, plus the District of Columbia',
    );
    expect(stateSection()).toHaveTextContent(
      'West Virginia is the next to go, from 2026 on',
    );
  });

  it('gives every listed state a mechanism and that year’s income test', () => {
    renderTab('State Taxes');
    const section = stateSection();
    expect(section).toHaveTextContent('Income test (2025)');
    expect(section).toHaveTextContent('None — the federal amount flows straight through');
    expect(section).toHaveTextContent(
      'AGI < $107,000 single/HOH/separate, < $133,750 joint',
    );
    expect(section).toHaveTextContent(
      'AGI ≤ $50,000 single / $100,000 joint: exempt',
    );
    // Nine states, three columns of prose, no empty cells. The comparison
    // years live inside the income-test cell rather than in a fourth column,
    // which is why this is still 18 and not 27.
    const cells = Array.from(section!.querySelectorAll('tbody td'));
    expect(cells).toHaveLength(18);
    for (const cell of cells) expect(cell.textContent).not.toBe('');
    for (const cell of Array.from(
      section!.querySelectorAll('.state-test-current'),
    )) {
      expect(cell.textContent).not.toBe('');
    }
  });

  it('drops West Virginia and re-prices the indexed states for 2026', () => {
    renderTab('State Taxes');
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    const section = stateSection();

    expect(stateRows()).not.toContain('West Virginia');
    expect(stateRows()).toHaveLength(8);
    expect(section).toHaveTextContent('42 of them, plus the District of Columbia');
    expect(section).toHaveTextContent('West Virginia finished phasing its tax out');
    expect(section).toHaveTextContent('Income test (2026)');

    // Minnesota indexes annually, so the selected year's cell must carry the
    // 2026 figures and 2025's must appear only as the comparison beneath it —
    // never the other way round, which is how a stale copy-paste would read.
    expect(stateTest('Minnesota').current).toContain('< $110,780 joint');
    expect(stateTest('Minnesota').current).not.toContain('$108,320');
    expect(stateTest('Minnesota').deltas).toEqual([
      expect.stringContaining('$108,320'),
    ]);
    // Vermont does not index, so it gets one line and no comparison at all.
    expect(stateTest('Vermont').current).toContain(
      '≤ $55,000 single/HOH, ≤ $70,000 joint',
    );
    expect(stateTest('Vermont').deltas).toEqual([]);
    // Rhode Island has not published 2026 figures, and says so rather than
    // reprinting 2025's under a 2026 heading — but 2025's are still reachable,
    // labelled with the year they belong to.
    expect(stateTest('Rhode Island').current).toMatch(/Not published yet/);
    expect(stateTest('Rhode Island').current).not.toContain('$133,750');
    expect(stateTest('Rhode Island').deltas).toEqual([
      expect.stringContaining('$133,750'),
    ]);
  });

  it('prints both years only for the states whose test actually moves', () => {
    renderTab('State Taxes');
    // 2025: Minnesota re-indexes, Rhode Island's next set is unpublished, and
    // West Virginia's exemption completes. The other six read identically.
    expect(movingRows()).toEqual([
      'Minnesota',
      'Rhode Island',
      'West Virginia',
    ]);
    expect(stateSection()).toHaveTextContent(
      '6 of the 9 rules below read word for word the same in 2025 as in 2026',
    );
    expect(stateSection()).toHaveTextContent(
      'Minnesota, Rhode Island and West Virginia',
    );

    // Each comparison line opens with the year it belongs to, so a reader never
    // has to infer which figure is which. The space after the year is asserted
    // because JSX drops whitespace-only lines between elements — without an
    // explicit one the year runs into the wording it labels, which looks fine
    // under the CSS margin and reads as "2026Full" to a screen reader.
    expect(stateTest('Minnesota').deltas).toHaveLength(1);
    expect(stateTest('Minnesota').deltas[0]).toMatch(/^2026 Full: /);
    expect(stateTest('Minnesota').deltas[0]).toContain('$110,780');
    expect(stateTest('Minnesota').current).toContain('$108,320');
    // West Virginia's own comparison is the phase-out finishing, which is the
    // same fact the prose above states — shown here against its 2025 rule.
    expect(stateTest('West Virginia').deltas[0]).toBe(
      '2026 Exempt at every income',
    );
    expect(stateTest('Montana').deltas).toEqual([]);
  });

  it('drops the vanished state from the comparison count for 2026', () => {
    renderTab('State Taxes');
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    // West Virginia is off the table entirely by 2026, so it can no longer be
    // one of the rows shown twice — two move, not three.
    expect(movingRows()).toEqual(['Minnesota', 'Rhode Island']);
    expect(stateSection()).toHaveTextContent(
      '6 of the 8 rules below read word for word the same',
    );
    expect(stateSection()).toHaveTextContent('The 2 that move are');
    expect(stateSection()).toHaveTextContent('Minnesota and Rhode Island');
    expect(stateSection()).not.toHaveTextContent(
      'Minnesota, Rhode Island and West Virginia',
    );
  });

  it('keeps the full rules collapsed but cites a source for each', () => {
    renderTab('State Taxes');
    const details = stateSection()!.querySelector('details');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details).toHaveTextContent('Each rule in full, and where it comes from');
    expect(details).toHaveTextContent('Mont. Code Ann. § 15-30-2120');
    expect(details).toHaveTextContent('N.M. Stat. § 7-2-5.14');
    // Only the two states that re-index yearly carry the tag.
    expect(details!.querySelectorAll('.state-tag')).toHaveLength(2);
  });

  it('says outright that it computes nothing', () => {
    renderTab('State Taxes');
    expect(stateSection()).toHaveTextContent(
      'Nothing on this page computes a state tax.',
    );
  });
});

describe('multi-year projection', () => {
  const projectionSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /the thresholds never move/i })
      .closest('section')!;

  /**
   * The tab-level input block. Both sections on the Over Time tab read the
   * same horizon, COLA, birth year and balances, so the sliders and the notes
   * hanging off them live above both rather than inside either — which is why
   * these assertions target this block and not `projectionSection()`.
   */
  const inputsSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /your accounts and your horizon/i })
      .closest('section')!;

  const slider = (name: RegExp): HTMLElement =>
    screen.getByRole('slider', { name });

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(slider(name), { target: { value } });
  };

  it('opens on a 20-year horizon at a 2.5% COLA', () => {
    renderTab('Over Time');
    expect(slider(/years to project/i)).toHaveValue('20');
    expect(slider(/years to project/i)).toHaveAttribute('min', '10');
    expect(slider(/years to project/i)).toHaveAttribute('max', '30');
    expect(slider(/annual cola and inflation/i)).toHaveValue('2.5');
    expect(slider(/year you were born/i)).toHaveValue('1955');
    expect(slider(/traditional ira and 401\(k\) balance/i)).toHaveValue('100000');
    expect(slider(/annual growth on those balances/i)).toHaveValue('5');
    // 2025 + 20 years, less the first, is 2044.
    expect(projectionSection()).toHaveTextContent('in 2044');
  });

  it('says nothing about a gift that was never asked for', () => {
    renderTab('Over Time');
    expect(projectionSection()).not.toHaveTextContent('goes to charity');
    expect(projectionSection()).not.toHaveTextContent('does not appear here');
  });

  it('prices a recurring gift over the whole horizon', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    const section = projectionSection();
    // Born 1955, so 70 in 2025 and not certainly 70 1/2 until 2026 — a birth
    // year cannot resolve the half, so the gift starts the year after.
    expect(section).toHaveTextContent(/goes to charity between 2026 and 2044/);
    expect(section).toHaveTextContent(/of federal tax in 2025 dollars/);
    expect(section).toHaveTextContent(/per dollar given/);
  });

  it('says why the gift is missing when there is no IRA to give from', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    expect(projectionSection()).toHaveTextContent(
      'The $10,000 charitable gift does not appear here.',
    );
    expect(projectionSection()).toHaveTextContent('the balance is set to $0');
  });

  it('says why the gift is missing when the filer is too young for it', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    // Born 1975, so 50 in 2025 and not certainly 70 1/2 until 2046 — past the
    // end of even a 30-year horizon that starts in 2025.
    setSlider(/year you were born/i, '1975');
    expect(projectionSection()).toHaveTextContent('not certainly there until 2046');
  });

  it('names both frozen thresholds and the years they were frozen in', () => {
    renderTab('Over Time');
    expect(projectionSection()).toHaveTextContent(
      'first provisional-income threshold at $25,000 in 1983 and your second at $34,000 in 1993',
    );
  });

  it('climbs the taxable share to the 85% ceiling and names the year', () => {
    renderTab('Over Time');
    const section = projectionSection();
    // $30,000 of other income and the 2025 average benefit: just under half the
    // benefit is taxable in 2025, all 85% of it by 2035, on unchanged real
    // income. Nothing but IRC 86(c) moved.
    expect(section).toHaveTextContent('47.14% → 85%');
    expect(section).toHaveTextContent('$11,178 of $23,712 in 2025');
    expect(section).toHaveTextContent('to the 85% ceiling in 2035, and stops there');
  });

  it('says which years the assumption does not reach, and drops it when none', () => {
    // Pinned to 2025, so 2026 sits inside the horizon and is already published.
    renderTab('Over Time');
    expect(inputsSection()).toHaveTextContent(
      'The slider does not reach 2026: those brackets, standard deductions and ' +
        'capital-gain bands are already published',
    );
    expect(inputsSection()).toHaveTextContent('Expect a bend at 2027');
    expect(projectionSection()).toHaveTextContent(
      'against published figures through 2026',
    );

    // Move the whole scenario to the newest year on file and the run is the
    // first year alone, so there is nothing to warn about.
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(inputsSection()).not.toHaveTextContent('The slider does not reach');
    expect(projectionSection()).not.toHaveTextContent('against published figures');
  });

  it('reads the published 2026 figures rather than indexing 2025 into them', () => {
    // At a 0% assumption nothing indexes, so a second-year tax that differs
    // from the first can only have come from Rev. Proc. 2025-32. It falls,
    // because the 2026 standard deduction is the larger one.
    renderTab('Over Time');
    setSlider(/annual cola and inflation/i, '0');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    expect(projectionSection()).toHaveTextContent('Federal tax in 2025 dollars');
    // 47.14% of the benefit is taxable in every year — provisional income has
    // not moved — so the bill falling is the deduction and only the deduction.
    expect(projectionSection()).toHaveTextContent('47.14% → 47.14%');
    expect(inputsSection()).toHaveTextContent('The slider does not reach 2026');
  });

  it('quotes the last year’s tax in first-year dollars, not nominal ones', () => {
    renderTab('Over Time');
    expect(projectionSection()).toHaveTextContent('Federal tax in 2025 dollars');
    expect(projectionSection()).toHaveTextContent('$1,853 → $4,278');
    expect(projectionSection()).toHaveTextContent("2.31x the first year's");
  });

  it('starts required distributions at 73 and shows the divisor it used', () => {
    renderTab('Over Time');
    const section = projectionSection();
    // Born 1955, so 73 in 2028; $100,000 grown at 5% for three years, over the
    // Uniform Lifetime Table divisor for 73.
    expect(inputsSection()).toHaveTextContent('Distributions become required at 73');
    expect(section).toHaveTextContent('2028 · $4,368');
    expect(section).toHaveTextContent('At 73, off a $115,763 balance divided by 26.5');
    expect(section).toHaveTextContent('The step at 2028 is the first required');
    expect(section).toHaveTextContent('SECURE 2.0 pushed that age from 72 to 73');
  });

  it('pushes the first distribution to 75 for a 1965 birth year', () => {
    renderTab('Over Time');
    setSlider(/year you were born/i, '1965');
    const section = projectionSection();
    expect(inputsSection()).toHaveTextContent(
      'Age 60 in 2025. Distributions become required at 75',
    );
    expect(section).toHaveTextContent('The step at 2040 is the first required');
    expect(section).toHaveTextContent('SECURE 2.0 pushed that age from 72 to 75');
    expect(section).toHaveTextContent('3 more years of compounding');
  });

  it('flags 1959 as the birth year the regulations left reserved', () => {
    renderTab('Over Time');
    setSlider(/year you were born/i, '1959');
    expect(inputsSection()).toHaveTextContent(
      'the one birth year the regulations have not settled',
    );
    expect(inputsSection()).toHaveTextContent('both 73 and 75');
  });

  it('says there is no step when the filer is already past the applicable age', () => {
    renderTab('Over Time');
    setSlider(/year you were born/i, '1945');
    const section = projectionSection();
    // Age 80 in 2025, applicable age 72 — the distribution is already running,
    // so the divisor quoted is 80's, not 72's, and there is no step to point at.
    expect(section).toHaveTextContent('2025 · $4,950');
    expect(section).toHaveTextContent('At 80, off a $100,000 balance divided by 20.2');
    expect(section).toHaveTextContent('the applicable age of 72 passed before 2025');
    expect(section).toHaveTextContent('This filer is already past the applicable age');
    expect(section).not.toHaveTextContent('SECURE 2.0 pushed that age');
  });

  it('drops the distribution entirely when there is no balance', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    const section = projectionSection();
    expect(section).toHaveTextContent('No balance');
    expect(section).not.toHaveTextContent('required minimum distribution');
  });

  it('calls the senior-deduction expiry a step without claiming it is the second', () => {
    renderTab('Over Time');
    // The two steps are independent: the deduction expires in 2029 whatever
    // the birth year, and the first distribution can land either side of it.
    expect(projectionSection()).toHaveTextContent(
      'The other step, at 2029, is the OBBBA senior deduction expiring',
    );
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    expect(projectionSection()).toHaveTextContent(
      'The step at 2029 is the OBBBA senior deduction expiring',
    );
  });

  it('does not claim a climb when the COLA is zero and nothing else moves', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    setSlider(/annual cola and inflation/i, '0');
    const section = projectionSection();
    expect(section).toHaveTextContent('47.14% → 47.14%');
    expect(section).toHaveTextContent('At a 0% COLA nothing moves');
    expect(section).toHaveTextContent('It is everything else moving past them');
    expect(section).not.toHaveTextContent('The taxable share climbs from');
  });

  it('blames the distribution, not inflation, for a climb at a zero COLA', () => {
    renderTab('Over Time');
    setSlider(/annual cola and inflation/i, '0');
    const section = projectionSection();
    // The $100,000 balance still grows at 5% while the income it is measured
    // against stands still, so the distribution rises in real terms. That is
    // the one thing left that can move the share with the COLA switched off,
    // and the prose has to say so rather than crediting inflation.
    expect(section).toHaveTextContent('47.14% → 76.8%');
    expect(section).toHaveTextContent('to 76.8% by 2044 without reaching the 85% ceiling');
    expect(section).toHaveTextContent('none of that climb is them');
    expect(section).toHaveTextContent('growing at 5% a year against an income standing still');
    expect(section).not.toHaveTextContent('Every year of that is inflation');
  });

  it('credits both inflation and the distribution when both are running', () => {
    renderTab('Over Time');
    // $10,000 of other income keeps the share short of the ceiling for the
    // whole horizon, so the branch that attributes the climb is the one on
    // screen. It starts at zero: this filer owes nothing on the benefit in
    // 2025 and a third of it is taxable by 2044, on unchanged real income.
    setSlider(/other ordinary income/i, '10000');
    const withRmd = projectionSection();
    expect(withRmd).toHaveTextContent('0% → 32.53%');
    expect(withRmd).toHaveTextContent('climbs from 0% in 2025 to 32.53% by 2044');
    expect(withRmd).toHaveTextContent('threshold last touched in 1993');
    expect(withRmd).toHaveTextContent(
      'with the required distribution pushing in the same direction',
    );

    // Take the balance away and inflation is the whole story again.
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    const section = projectionSection();
    expect(section).toHaveTextContent('0% → 13.98%');
    expect(section).toHaveTextContent('threshold last touched in 1993.');
    expect(section).not.toHaveTextContent('pushing in the same direction');
  });

  it('has nothing to project for a separate return that lived with its spouse', () => {
    renderTab('Over Time');
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Separately' }));
    const section = projectionSection();
    expect(section).toHaveTextContent('85% of the benefit is taxable from the first dollar');
    expect(section).toHaveTextContent('there is no ratchet left to project');
    expect(section).toHaveTextContent('already at the 85% ceiling in 2025');
  });

  it('re-dates the whole projection when the tax year changes', () => {
    renderTab('Over Time');
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    const section = projectionSection();
    expect(inputsSection()).toHaveTextContent('Age 71 in 2026');
    expect(section).toHaveTextContent('Federal tax in 2026 dollars');
    expect(section).toHaveTextContent('in 2045');
  });
});

/**
 * Every conditional sentence in the sequencing section, walked branch by
 * branch.
 *
 * The arithmetic has its own suite in `sequencing.test.ts`; what this covers is
 * the prose, which is where a section this conditional goes wrong. Four of the
 * branches below exist because the first draft asserted a cause it had not
 * checked — that the cheapest order deferred an IRA, or that the ceiling was
 * already breached — in states where neither was true.
 */
describe('withdrawal sequencing', () => {
  const seqSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /which account you spend first/i })
      .closest('section')!;

  /** The tab-level input block this section shares with the projection. */
  const inputsSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /your accounts and your horizon/i })
      .closest('section')!;

  const slider = (name: RegExp): HTMLElement => screen.getByRole('slider', { name });

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(slider(name), { target: { value } });
  };

  it('opens on three orders scored over the tab\u2019s shared accounts', () => {
    renderTab('Over Time');
    expect(slider(/after-tax spending each year/i)).toHaveValue('60000');
    expect(slider(/taxable brokerage account/i)).toHaveValue('300000');
    expect(slider(/of that, cost basis/i)).toHaveValue('60');
    expect(slider(/roth ira/i)).toHaveValue('150000');
    const section = seqSection();
    expect(section).toHaveTextContent('Taxable, then traditional, then Roth');
    expect(section).toHaveTextContent('A slice of all three every year');
    expect(section).toHaveTextContent('Traditional up to a ceiling, then taxable, then Roth');
    // The horizon, birth year, IRA and growth rate are the projection's, not a
    // second set: two sections disagreeing about the applicable age would be
    // worse than either being wrong alone.
    expect(section).toHaveTextContent('over 20 years to 2044');
  });

  it('says nothing about a gift that was never asked for', () => {
    renderTab('Over Time');
    expect(seqSection()).not.toHaveTextContent('straight to the charity');
    expect(seqSection()).not.toHaveTextContent('not a fourth order');
  });

  it('gives the same gift in all three orders rather than scoring it as one', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '5000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    // A big enough IRA that no order runs it below the gift. At the default
    // $100,000 balance even $5,000 a year outlasts bracket filling, which is
    // the branch the next test covers.
    setSlider(/traditional ira and 401\(k\) balance/i, '1500000');
    const section = seqSection();
    expect(section).toHaveTextContent('All three also send $5,000 a year');
    expect(section).toHaveTextContent('from 2026 on');
    expect(section).toHaveTextContent('It is not a fourth order');
    expect(section).toHaveTextContent('Each gives $122,720 over the 20 years');
    expect(section).not.toHaveTextContent('Not constant here');
  });

  it('says when an order ran the IRA down too far to keep giving', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Qualified Charitable Distribution'), {
      target: { value: '5000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Over Time' }));
    // Bracket filling exists to empty the IRA early and a recurring gift needs
    // it to still be there, so at the default $100,000 balance the two are in
    // direct conflict — and the order that empties it fastest gives the least.
    const section = seqSection();
    expect(section).toHaveTextContent('Not constant here, though.');
    expect(section).toHaveTextContent(
      'bracket filling runs the balance down too far to keep funding it',
    );
    expect(section).toHaveTextContent('from $15,762 to $122,720 over the 20 years');
    expect(section).toHaveTextContent('Bracket filling is the one to watch');
  });

  it('prices the basis slider in cents of realised gain per dollar sold', () => {
    renderTab('Over Time');
    setSlider(/of that, cost basis/i, '25');
    expect(inputsSection()).toHaveTextContent('at 25% basis, 75¢ of every dollar sold');
  });

  it('offers no IRMAA ceiling, because the projection cannot index one', () => {
    renderTab('Over Time');
    const select = screen.getByLabelText(/fill the ira up to/i);
    expect(select).toHaveValue('bracket12');
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels.some((l) => /12% bracket/i.test(l ?? ''))).toBe(true);
    expect(labels.some((l) => /irmaa/i.test(l ?? ''))).toBe(false);
  });

  it('declares one winner when both scores name the same order', () => {
    renderTab('Over Time');
    const section = seqSection();
    expect(section).toHaveTextContent('Conventional wins both ways');
    expect(section).toHaveTextContent('$77,775 of lifetime federal tax');
    expect(section).toHaveTextContent('Bracket filling works by paying tax earlier');
    expect(section).toHaveTextContent('leaves the IRA at $1 in 2044 rather than $103,372');
  });

  it('gives bracket filling the win over a long horizon with a large IRA', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '2000000');
    setSlider(/years to project/i, '30');
    const section = seqSection();
    expect(section).toHaveTextContent('Bracket filling wins both ways');
    expect(section).toHaveTextContent('leaves the IRA at $1,002,286 in 2054 rather than $1,036,173');
  });

  it('blames the deferred IRA when there is a deferred IRA to blame', () => {
    renderTab('Over Time');
    // Born 1975 over ten years reaches no applicable age, so nothing is forced
    // out and the conventional order can defer the whole balance.
    setSlider(/year you were born/i, '1975');
    setSlider(/years to project/i, '10');
    setSlider(/other ordinary income/i, '0');
    const section = seqSection();
    expect(section).toHaveTextContent('Proportional pays the least federal tax over these 10 years');
    expect(section).toHaveTextContent('finishes with less money than Bracket filling');
    expect(section).toHaveTextContent('$66,231 in the IRA with $13,441 of tax still attached');
  });

  it('names the gain and the Roth instead when there is no IRA to blame', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    const section = seqSection();
    // The scores still disagree — the cheaper order spent Roth dollars — but
    // the IRA had nothing to do with it. Naming it here would print "$0 in the
    // IRA with $0 of tax attached", which explains nothing.
    expect(section).toHaveTextContent('Proportional pays the least federal tax');
    expect(section).toHaveTextContent(
      '$406,818 of unrealised gain in the brokerage account, carrying $58,460 of tax',
    );
    expect(section).toHaveTextContent('$262,848 left in the Roth against $397,995');
    expect(section).not.toHaveTextContent('$0 in the IRA');
  });

  it('says there is no IRA to fill rather than blaming the ceiling', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    const section = seqSection();
    expect(section).toHaveTextContent('There is no IRA here to fill');
    expect(section).not.toHaveTextContent('already past');
  });

  it('blames the ceiling only when the income really has breached it', () => {
    renderTab('Over Time');
    setSlider(/other ordinary income/i, '150000');
    const section = seqSection();
    expect(section).toHaveTextContent(
      'already past top of the 12% bracket on the income they cannot turn off',
    );
    expect(section).toHaveTextContent('the bracket you were hoping to fill is already full');
  });

  it('says nothing is being sequenced when the income covers the spending', () => {
    renderTab('Over Time');
    setSlider(/other ordinary income/i, '150000');
    const section = seqSection();
    // $150,000 plus the benefit funds $60,000 of spending and its tax outright,
    // so the only money leaving an account is the required distribution and the
    // three orders are the same order. That is a tie for a reason that has
    // nothing to do with sequencing, and it is not "the difference is small".
    expect(section).toHaveTextContent('Nothing here is being sequenced');
    expect(section).toHaveTextContent('all three post the same $606,630');
    expect(section).not.toHaveTextContent('land within');
  });

  it('says there is only one account when only one is funded', () => {
    renderTab('Over Time');
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    setSlider(/roth ira/i, '0');
    const section = seqSection();
    expect(section).toHaveTextContent('There is only one account to spend');
    expect(section).toHaveTextContent('all three land on the same $67,345');
    expect(section).not.toHaveTextContent('Nothing here is being sequenced');
  });

  it('calls a genuinely close race close', () => {
    renderTab('Over Time');
    setSlider(/other ordinary income/i, '30000');
    setSlider(/after-tax spending each year/i, '50000');
    setSlider(/traditional ira and 401\(k\) balance/i, '25000');
    const section = seqSection();
    expect(section).toHaveTextContent('All three orders land within $268 of each other');
    expect(section).not.toHaveTextContent('Nothing here is being sequenced');
    expect(section).not.toHaveTextContent('There is only one account');
  });

  it('refuses to score a retirement the accounts could not fund', () => {
    renderTab('Over Time');
    setSlider(/after-tax spending each year/i, '150000');
    const section = seqSection();
    expect(section).toHaveTextContent('These accounts do not last 20 years');
    expect(section).toHaveTextContent('measuring how fast each one got there');
    // Nothing survives to the ceiling either, and the reason is the spending
    // rather than the bracket.
    expect(section).toHaveTextContent('Every order empties the IRA before 2044 anyway');
    expect(section).not.toHaveTextContent('already past');
  });

  /**
   * Not every shortfall is every order's shortfall. The three draw on the same
   * accounts but pay different tax along the way, and tax is cash leaving the
   * household, so one order can empty them while the others fund the horizon —
   * which is a different sentence from "these accounts do not last 20 years".
   */
  it('names the order that ran dry when the others did not', () => {
    renderTab('Over Time');
    setSlider(/taxable brokerage account/i, '25000');
    setSlider(/traditional ira and 401\(k\) balance/i, '150000');
    setSlider(/roth ira/i, '0');
    const section = seqSection();
    expect(section).toHaveTextContent('Bracket filling ran out of money in 2044');
    expect(section).toHaveTextContent('The other two orders funded every year to 2044');
    expect(section).toHaveTextContent('left $6,536 of spending unfunded');
    expect(section).not.toHaveTextContent('These accounts do not last');
  });

  /**
   * And the trap in that case: the order that failed posts the lowest lifetime
   * tax, because from the year it runs dry it has nothing left to withdraw.
   * Scoring on the tax column alone would recommend the failure.
   */
  it('refuses to score running out of money as a saving', () => {
    renderTab('Over Time');
    setSlider(/taxable brokerage account/i, '25000');
    setSlider(/traditional ira and 401\(k\) balance/i, '150000');
    setSlider(/roth ira/i, '0');
    const section = seqSection();
    expect(section).toHaveTextContent(
      'bracket filling shows the lowest lifetime tax of the three',
    );
    expect(section).toHaveTextContent('That is not a saving');
    expect(section).toHaveTextContent(
      'The cheapest order that funded the whole horizon is Conventional at $91,458',
    );
    // $89,677 is the lowest figure in the table and it is not highlighted: the
    // cheapest *solvent* order is.
    const best = Array.from(section.querySelectorAll('td.seq-best')).map((c) => c.textContent);
    expect(best).toContain('$91,458');
    expect(best).not.toContain('$89,677');
    // Said on the row too, so the table stands up on its own.
    expect(section.querySelector('.seq-dry')).toHaveTextContent('Ran out in 2044');
  });

  it('still flags the order that ran dry when it is not the cheapest', () => {
    renderTab('Over Time');
    setSlider(/after-tax spending each year/i, '88000');
    setSlider(/traditional ira and 401\(k\) balance/i, '200000');
    const section = seqSection();
    expect(section).toHaveTextContent('Bracket filling ran out of money in 2044');
    // Its $123,681 is the most expensive of the three, so there is no flattered
    // winner to warn about — only a figure that is not like for like.
    expect(section).toHaveTextContent('understated against the orders that funded');
    expect(section).not.toHaveTextContent('That is not a saving');
  });

  it('highlights nothing when no order lasted the horizon', () => {
    renderTab('Over Time');
    setSlider(/after-tax spending each year/i, '150000');
    const section = seqSection();
    expect(section).toHaveTextContent('These accounts do not last 20 years');
    // All three ended at $0 having run dry in the same year. Awarding one of
    // them a best cell would contradict the paragraph directly above.
    expect(section.querySelectorAll('td.seq-best')).toHaveLength(0);
    expect(section.querySelectorAll('.seq-dry')).toHaveLength(3);
  });

  it('re-dates the comparison when the tax year changes', () => {
    renderTab('Over Time');
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    const section = seqSection();
    expect(section).toHaveTextContent('Both figures are in 2026 dollars');
    expect(section).toHaveTextContent('over 20 years to 2045');
  });
});

describe('SequencingTooltip', () => {
  const comparison = compareSequencing(
    { ordinaryIncome: 0, ssBenefit: 23_712, filingStatus: 'single', year: 2025 },
    {
      startYear: 2025,
      years: 20,
      birthYear: 1955,
      spending: 60_000,
      taxableBalance: 300_000,
      taxableBasisFraction: 0.6,
      traditionalBalance: 1_000_000,
      rothBalance: 150_000,
      growthPercent: 5,
      fillCeilingId: 'bracket12',
    },
  );

  it('renders nothing when inactive or off the data', () => {
    const { container } = render(<SequencingTooltip comparison={comparison} />);
    expect(container).toBeEmptyDOMElement();
    const off = render(
      <SequencingTooltip
        active
        payload={[{ payload: { year: 2099, taxableFirst: 0, proportional: 0, bracketFill: 0 } }]}
        comparison={comparison}
      />,
    );
    expect(off.container).toBeEmptyDOMElement();
  });

  it("quotes each order its own required distribution, not the first order's", () => {
    // By 2044 the conventional order has compounded a balance a third larger
    // than bracket filling's, so it is required to take a third more out. One
    // figure in the header would have been the wrong one for two of the three
    // lines.
    render(
      <SequencingTooltip
        active
        payload={[{ payload: { year: 2044, taxableFirst: 0, proportional: 0, bracketFill: 0 } }]}
        comparison={comparison}
      />,
    );
    const rmds = comparison.strategies.map((s) => s.rows[19].rmd);
    expect(new Set(rmds).size).toBe(3);
    for (const [i, s] of comparison.strategies.entries()) {
      expect(screen.getByText(new RegExp(`^${s.strategy.label}:`))).toHaveTextContent(
        `$${rmds[i].toLocaleString('en-US')} required`,
      );
    }
    expect(screen.getByText(/2044 · age 89/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Qualified charitable distributions                                */
/* ------------------------------------------------------------------ */

describe('qualified charitable distribution', () => {
  /** The section, so the same dollar figure elsewhere cannot satisfy a match. */
  const qcdSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /giving straight from the ira/i })
      .closest('section')!;

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

  it('re-prices both limits when the tax year changes', () => {
    renderTab('Strategies');
    expect(qcdSection()).toHaveTextContent('$54,000 to a split-interest entity');
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(qcdSlider()).toHaveAttribute('max', '111000');
    expect(qcdNote()).toHaveTextContent('Capped at $111,000 for 2026');
    expect(qcdSection()).toHaveTextContent('$55,000 to a split-interest entity');
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

  it('prices the benefits it takes back out of the tax base', () => {
    renderTab('Strategies');
    setSlider(/qualified charitable distribution/i, '10000');
    const section = qcdSection();
    // $30,000 of other income and the average benefit: provisional income
    // starts at $41,856, so all $10,000 comes off inside the 85% tier.
    expect(section).toHaveTextContent('$7,750');
    expect(section).toHaveTextContent('$3,428 taxable, down from $11,178');
    expect(section).toHaveTextContent('$2,045');
    expect(section).toHaveTextContent('$768 total, down from $2,813');
    expect(section).toHaveTextContent('20.45%');
    expect(section).toHaveTextContent(
      /keeps AGI at \$23,428 instead of \$41,178, which takes \$7,750 of Social Security back out/,
    );
  });

  it('prompts with the next dollar rather than a row of zeros when unset', () => {
    renderTab('Strategies');
    expect(qcdSection()).toHaveTextContent(
      /the next dollar given from the IRA rather than the checking account is worth 22\.2% in federal tax/,
    );
  });

  it('says so when the 85% cap still binds and only the bracket rate is saved', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '100000');
    setSlider(/qualified charitable distribution/i, '8000');
    expect(qcdSection()).toHaveTextContent(
      /No benefits move: the 85% cap still binds after the gift, so the same \$20,155 — the most of a benefit that can ever be taxed — is taxable either way/,
    );
    expect(qcdSection()).toHaveTextContent('22.26%');
  });

  it('names the first tier\u2019s own cap rather than calling every flat line 85%', () => {
    renderTab('Strategies');
    // Half of a $6,000 benefit is $3,000, and $3,000 of inclusion is reached
    // at $31,000 of provisional income — inside the 50% tier, which runs to
    // $34,000. The gift moves provisional income from $33,000 to $31,000, so
    // the taxable share is flat without the 85% tier ever being in play.
    setSlider(/annual social security benefit/i, '6000');
    setSlider(/other ordinary income/i, '30000');
    setSlider(/qualified charitable distribution/i, '2000');
    expect(qcdSection()).toHaveTextContent(
      /No benefits move: the 50% cap still binds after the gift, so the same \$3,000 — half the benefit, which is everything the first tier can reach — is taxable either way/,
    );
    expect(qcdSection()).not.toHaveTextContent(/85% cap/);
  });

  it('blames the missing benefit, not the thresholds, when there is no benefit', () => {
    renderTab('Strategies');
    setSlider(/annual social security benefit/i, '0');
    setSlider(/other ordinary income/i, '100000');
    setSlider(/qualified charitable distribution/i, '10000');
    expect(qcdSection()).toHaveTextContent(
      /No benefits move, because there is no benefit on this scenario to move/,
    );
    // $100,000 of provisional income is not "under $25,000 either way".
    expect(qcdSection()).not.toHaveTextContent(/stays under \$25,000/);
  });

  it('says the benefits were never taxable when provisional income is under the base', () => {
    renderTab('Strategies');
    setSlider(/annual social security benefit/i, '10000');
    setSlider(/other ordinary income/i, '20000');
    setSlider(/qualified charitable distribution/i, '5000');
    expect(qcdSection()).toHaveTextContent(
      /none of them were taxable to begin with — provisional income stays under \$25,000 either way/,
    );
  });

  it('counts the Medicare surcharge the same dollars would have set', () => {
    renderTab('Strategies');
    setSlider(/annual social security benefit/i, '61296');
    setSlider(/other ordinary income/i, '90000');
    setSlider(/qualified charitable distribution/i, '10000');
    const section = qcdSection();
    // $142,102 of MAGI is in tier 2; taking $10,000 out drops it to tier 1.
    expect(section).toHaveTextContent('tier 1, down from tier 2');
    expect(section).toHaveTextContent('$1,591.20');
    // The surcharge is two-thirds as large again as the $2,400 of tax, and it
    // never appears on a return.
    expect(section).toHaveTextContent(
      /\$2,400 of federal tax, 24¢ per dollar given, plus \$1,591\.20 a year of Medicare surcharge/,
    );
    expect(section).toHaveTextContent(/sets the premium for 2027/);
  });

  it('warns when the gift is larger than the distribution it comes from', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '5000');
    setSlider(/qualified charitable distribution/i, '20000');
    expect(qcdSection()).toHaveTextContent(/More gift than distribution/);
    expect(qcdSection()).toHaveTextContent(
      /only \$5,000 of ordinary income on this scenario to exclude/,
    );
  });

  it('says the route made no difference rather than reporting a saving of $0', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '10000');
    setSlider(/qualified charitable distribution/i, '5000');
    expect(qcdSection()).toHaveTextContent(/Here the route makes no difference/);
    expect(qcdSection()).toHaveTextContent(
      /the \$15,750 of deductions covered the whole \$10,000 of AGI/,
    );
    // Not a "more gift than distribution" case: $10,000 covers the $5,000.
    expect(qcdSection()).not.toHaveTextContent(/More gift than distribution/);
  });

  it('credits the 0% gains bracket, not the deduction, when the deduction is smaller', () => {
    renderTab('Strategies');
    // $45,000 of AGI against $15,750 of deductions: the deductions plainly did
    // not cover the return. What zeroes the bill is that everything left is
    // long-term gain, and $29,250 of taxable income is under the $48,350 top
    // of the 0% bracket.
    setSlider(/annual social security benefit/i, '0');
    setSlider(/other ordinary income/i, '5000');
    setSlider(/long-term capital gains/i, '40000');
    setSlider(/qualified charitable distribution/i, '3000');
    expect(qcdSection()).toHaveTextContent(
      /past the \$15,750 of deductions everything left in the base is long-term gain sitting in the 0% bracket/,
    );
    expect(qcdSection()).not.toHaveTextContent(/covered the whole/);
  });

  it('says nothing can be excluded when there is no distribution to exclude', () => {
    renderTab('Strategies');
    setSlider(/annual social security benefit/i, '30000');
    setSlider(/other ordinary income/i, '0');
    setSlider(/long-term capital gains/i, '100000');
    setSlider(/qualified charitable distribution/i, '10000');
    const section = qcdSection();
    expect(section).toHaveTextContent(/None of this gift can be excluded/);
    // $125,500 is the $100,000 of gains plus the $25,500 of benefit the gains
    // dragged in — the whole of AGI, and none of it reachable by a QCD.
    expect(section).toHaveTextContent(
      /\$10,185 of federal tax here is on the \$125,500 of long-term gains and taxable benefit/,
    );
    // Not "the excluded dollars were not carrying any tax": none were excluded.
    expect(section).not.toHaveTextContent(/excluded dollars/);
    expect(section).toHaveTextContent(
      /no ordinary income on this scenario to exclude the gift from/,
    );
  });

  it('prompts for income rather than a rate when there is nothing to give from', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '0');
    expect(qcdSection()).toHaveTextContent(/There is nothing here to give/);
    expect(qcdSection()).not.toHaveTextContent(/is worth 0% in federal tax/);
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

  it('sizes conversions off its own brackets and gain bands', () => {
    renderTab('Strategies');
    selectHoh();
    const menu = screen.getByLabelText(/convert up to/i);
    expect(menu).toHaveTextContent('Top of the 12% bracket — $64,850 of taxable income');
    expect(menu).toHaveTextContent('Top of the 22% bracket — $103,350 of taxable income');
    expect(menu).toHaveTextContent(
      'Top of the 0% capital-gains bracket — $64,750 of total taxable income',
    );
    expect(menu).toHaveTextContent('IRMAA tier 1 (Medicare surcharge) — $106,000 of MAGI');
  });

  it("shares Medicare's individual-return column rather than adding a fourth", () => {
    renderTab('Medicare');
    selectHoh();
    const irmaa = screen
      .getByRole('heading', { name: /medicare's irmaa cliffs/i })
      .closest('section') as HTMLElement;
    expect(irmaa).toHaveTextContent('MAGI (individual)');
    expect(irmaa).not.toHaveTextContent('MAGI (single)');
    expect(irmaa).toHaveTextContent(
      /Medicare publishes three tables, not four: 42 U\.S\.C\. 1395r\(i\)\(3\)\(C\) carves out joint and separate returns and puts everyone else — single and head of household alike — in the first column/,
    );
    // The first cliff sits where a single filer's does.
    expect(irmaa).toHaveTextContent(/The first cliff costs \$1,052 a year/);
    expect(irmaa).toHaveTextContent(/Room to the next cliff/);
  });

  it('counts four statuses in the projection, not two', () => {
    renderTab('Over Time');
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Separately' }));
    expect(
      screen.getByText(/The other three statuses have somewhere to climb from/),
    ).toBeInTheDocument();
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

describe('retroactive awards and the lump-sum election', () => {
  /** The section, so a figure quoted elsewhere on the page cannot satisfy it. */
  const section = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /when years of benefit arrive in one cheque/i })
      .closest('section')!;

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(screen.getByRole('slider', { name }), { target: { value } });
  };

  /** The worksheet table's rows, as `[year, months, benefit, taxable, share]`. */
  const worksheetRows = (): string[][] =>
    Array.from(section().querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent!),
    );

  it('opens on two years of back pay at the benefit slider’s monthly rate', () => {
    renderTab('Strategies');
    expect(screen.getByRole('slider', { name: /months of back pay/i })).toHaveValue(
      '24',
    );
    // $23,712 a year is $1,976 a month, and 24 of those is $47,424.
    expect(section()).toHaveTextContent('24 months · $47,424');
    expect(section()).toHaveTextContent('$1,976 a month');
    expect(section()).toHaveTextContent('24 months across 2 earlier years, 2023–2024');
  });

  it('runs from no back pay to five years of it', () => {
    renderTab('Strategies');
    const slider = screen.getByRole('slider', { name: /months of back pay/i });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '60');
    setSlider(/months of back pay/i, '60');
    expect(section()).toHaveTextContent('60 months · $118,560');
    expect(section()).toHaveTextContent('60 months across 5 earlier years, 2020–2024');
  });

  it('prices the election against taxing the whole award in one year', () => {
    renderTab('Strategies');
    // Default scenario: $30,000 of other income, the average benefit, and two
    // years of back pay. Taxed all at once, provisional income is $53,712 and
    // the 85% tier takes $31,333; refigured, each waiting year sits in the 50%
    // tier on $20,000 of income and contributes $3,428.
    expect(section()).toHaveTextContent('$18,034 taxable, down from $31,333');
    expect(section()).toHaveTextContent('$3,636 total, down from $5,231');
    expect(section()).toHaveTextContent(
      /keeps \$13,299 out of the tax base, 28\.04% of the award itself/,
    );
    expect(section()).toHaveTextContent(
      /\$1,595 of federal tax on a cheque that has already been cashed/,
    );
  });

  it('shows each waiting year its own row, and this year’s beside them', () => {
    renderTab('Strategies');
    expect(worksheetRows()).toEqual([
      ['2023', '12', '$23,712', '$3,428', '14.46%'],
      ['2024', '12', '$23,712', '$3,428', '14.46%'],
      ['2025 (this year)', '12', '$23,712', '$11,178', '47.14%'],
    ]);
    // The caption is where the frozen thresholds get named as the reason.
    expect(section()).toHaveTextContent(
      /Every row is figured on the same \$25,000 and \$34,000 thresholds, because they have not been touched since 1993/,
    );
  });

  it('re-dates the waiting years and the premium year with the tax year', () => {
    renderTab('Strategies');
    expect(section()).toHaveTextContent("set by this year's MAGI for 2027");
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    expect(section()).toHaveTextContent('24 months across 2 earlier years, 2024–2025');
    expect(section()).toHaveTextContent("set by this year's MAGI for 2028");
    const rows = worksheetRows();
    expect(rows[rows.length - 1][0]).toBe('2026 (this year)');
  });

  it('drops the worksheet and says so when there is no back pay', () => {
    renderTab('Strategies');
    setSlider(/months of back pay/i, '0');
    expect(section().querySelector('table')).toBeNull();
    expect(section()).toHaveTextContent(
      /There is no back pay on this scenario, so there is nothing to elect/,
    );
    expect(section()).toHaveTextContent('no back pay on this scenario');
  });

  it('names the Form 1040 checkbox rather than sending you looking for a form', () => {
    renderTab('Strategies');
    expect(section()).toHaveTextContent(
      /There is no form: you check box 6c on the 1040 and keep the worksheets/,
    );
  });

  it('tells you not to elect when the waiting years were the richer ones', () => {
    renderTab('Strategies');
    // Nothing now, $80,000 through each waiting year: this year has a whole
    // unused base and the waiting years have none, so the election is backwards.
    setSlider(/other ordinary income/i, '0');
    setSlider(/other income during each waiting year/i, '80000');
    setSlider(/months of back pay/i, '12');
    expect(section()).toHaveTextContent(/Do not make this election\./);
    expect(section()).toHaveTextContent(
      /would report \$20,155 of taxable benefit where taxing the whole thing in 2025 reports \$0 — none of it is taxable this year at all/,
    );
    // 86(e)(2)(B): revocable only with the Secretary's consent — not, as an
    // earlier draft of this sentence had it, irrevocable.
    expect(section()).toHaveTextContent(
      /86\(e\)\(2\)\(B\) lets you take it back only with the consent of the Secretary/,
    );
    // 86(e) is a ceiling, so declining to elect costs nothing.
    expect(section()).toHaveTextContent('Federal tax saved$0');
  });

  it('separates the benefit it removes from the tax it saves', () => {
    renderTab('Strategies');
    // No income anywhere: the election takes $5,833 out of the base and the
    // standard deduction had already covered it, so the bill does not move.
    setSlider(/other ordinary income/i, '0');
    setSlider(/other income during each waiting year/i, '0');
    expect(section()).toHaveTextContent(
      /takes \$5,833 of benefit out of 2025's tax base and it changes the bill by nothing/,
    );
    expect(section()).toHaveTextContent(
      /The \$15,750 of deductions covered the whole \$5,833 of AGI either way/,
    );
  });

  it('counts the Medicare cliff the award would have crossed', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '150000');
    setSlider(/months of back pay/i, '48');
    expect(section()).toHaveTextContent('tier 3, down from tier 4');
    expect(section()).toHaveTextContent(
      /plus \$1,591\.20 of Medicare surcharge in 2027/,
    );
    // Four waiting years of unused thresholds against one year that has none.
    expect(section()).toHaveTextContent(/70\.54% of the award itself/);
  });

  it('blames the 85% cap when every year involved is actually at it', () => {
    renderTab('Strategies');
    setSlider(/other ordinary income/i, '150000');
    setSlider(/other income during each waiting year/i, '150000');
    expect(section()).toHaveTextContent(/The election changes nothing here\./);
    expect(section()).toHaveTextContent(
      /is already past the \$34,000 adjusted base by more than its own benefit, so the 85% cap binds in all of them/,
    );
  });

  it('does not blame the 85% cap for a knife edge in the 50% tier', () => {
    renderTab('Strategies');
    // $15,000 now and exactly the $25,000 base through the waiting year make
    // the two treatments agree to the dollar with nothing anywhere near 85%:
    // this year alone includes $928, the waiting year adds $1,482, and taxing
    // all $29,640 of benefit in 2025 comes to the same $2,410.
    setSlider(/other ordinary income/i, '15000');
    setSlider(/other income during each waiting year/i, '25000');
    setSlider(/months of back pay/i, '3');
    expect(section()).toHaveTextContent(/The election changes nothing here\./);
    expect(section()).toHaveTextContent(
      /No year here is at the 85% cap, so this is a coincidence rather than a ceiling/,
    );
    expect(section()).not.toHaveTextContent(/85% cap binds/);
    expect(worksheetRows()).toEqual([
      ['2024', '3', '$5,928', '$1,482', '25%'],
      ['2025 (this year)', '12', '$23,712', '$928', '3.91%'],
    ]);
  });

  it('says nothing is taxable rather than blaming a cap when nothing is', () => {
    renderTab('Strategies');
    setSlider(/annual social security benefit/i, '6000');
    setSlider(/other ordinary income/i, '0');
    setSlider(/other income during each waiting year/i, '0');
    expect(section()).toHaveTextContent(
      /provisional income stays under \$25,000 whether the award is counted in one year or spread over 3/,
    );
    expect(section()).not.toHaveTextContent(/85% cap/);
  });

  it('says a separate return has no unused base to go and find', () => {
    renderTab('Strategies');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
    // The intro drops its $34,000 sentence, because there is no adjusted base.
    expect(section()).toHaveTextContent(
      /on this separate return is already the worst case, since both bases are \$0/,
    );
    expect(section()).toHaveTextContent(
      /Every row is figured on the same \$0 thresholds, so every row is 85%/,
    );
    expect(worksheetRows()).toEqual([
      ['2023', '12', '$23,712', '$20,155', '85%'],
      ['2024', '12', '$23,712', '$20,155', '85%'],
      ['2025 (this year)', '12', '$23,712', '$20,155', '85%'],
    ]);

    // At $36,000 the year of receipt is capped too, so the two treatments meet
    // and the reason is the filing status rather than an accident.
    setSlider(/other ordinary income/i, '36000');
    expect(section()).toHaveTextContent(
      /Both bases are \$0 on a separate return that lived with the spouse/,
    );
    expect(section()).toHaveTextContent(/There is no unused threshold anywhere/);
  });

  it('keeps the standing caveats about the earlier years’ returns', () => {
    renderTab('Strategies');
    expect(section()).toHaveTextContent(
      /You need the earlier years' returns to do this\./,
    );
    expect(section()).toHaveTextContent(
      /86\(e\)\(2\)\(B\) makes the election revocable only with the consent of the Secretary/,
    );
    expect(section()).toHaveTextContent(
      /would need Pub 915's Worksheet 3 rather than Worksheet 2, since the 85% tier did not exist until 1994/,
    );
    expect(section()).toHaveTextContent(
      /Nothing here feeds the charts or the projections on the other tabs/,
    );
  });
});

describe('BackPayTooltip', () => {
  const point = (over: Partial<BackPayCurvePoint> = {}): BackPayCurvePoint => ({
    months: 24,
    lumpSum: 47_424,
    yearsCovered: 2,
    taxableWithout: 31_333,
    taxableWith: 18_034,
    taxWithout: 5_231,
    taxWith: 3_636,
    taxSaved: 1_595,
    ...over,
  });

  it('renders nothing when inactive', () => {
    const { container } = render(<BackPayTooltip awardYear={2025} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the years the award reaches back to, and both treatments', () => {
    render(
      <BackPayTooltip active payload={[{ payload: point() }]} awardYear={2025} />,
    );
    expect(screen.getByText(/24 months of back pay/)).toHaveTextContent(
      '24 months of back pay · $47,424 · 2023–2024',
    );
    expect(screen.getByText(/All taxed this year:/)).toHaveTextContent(
      'All taxed this year: $5,231 on $31,333 of benefit',
    );
    expect(screen.getByText(/With the election:/)).toHaveTextContent(
      'With the election: $3,636 on $18,034 of benefit',
    );
    expect(screen.getByText('The election saves $1,595 here')).toBeInTheDocument();
  });

  it('distinguishes no award at all from an award not worth electing on', () => {
    const { unmount } = render(
      <BackPayTooltip
        active
        payload={[{ payload: point({ months: 0, lumpSum: 0, yearsCovered: 0, taxSaved: 0 }) }]}
        awardYear={2025}
      />,
    );
    expect(
      screen.getByText('No back pay, so there is nothing to elect'),
    ).toBeInTheDocument();
    // No year range to name when the award reaches back to nothing.
    expect(screen.getByText(/0 months of back pay/)).not.toHaveTextContent('–');
    unmount();

    render(
      <BackPayTooltip
        active
        payload={[{ payload: point({ taxSaved: 0 }) }]}
        awardYear={2025}
      />,
    );
    expect(
      screen.getByText('The election is worth nothing here — do not make it'),
    ).toBeInTheDocument();
  });
});

/**
 * Where the Over Time tab's inputs live.
 *
 * Both sections on that tab price the same retirement, so both read the same
 * horizon, COLA, birth year, balances and spending. Those used to be split
 * between the two sections — five in the projection, four in the sequencing
 * comparison further down — which meant half of them sat below a chart they
 * moved and the section that did not own them had to say "set above". They are
 * now one block above both. What is genuinely local stays local: the fill-to
 * ceiling only the bracket-filling order reads, and the lump-sum tab's two
 * back-pay sliders.
 */
describe('Over Time tab inputs', () => {
  const inputsSection = (): HTMLElement =>
    screen
      .getByRole('heading', { name: /your accounts and your horizon/i })
      .closest('section')!;

  /** Every slider either section on the tab reads. */
  const sharedSliders = [
    /years to project/i,
    /annual cola and inflation/i,
    /year you were born/i,
    /traditional ira and 401\(k\) balance/i,
    /annual growth on those balances/i,
    /taxable brokerage account/i,
    /of that, cost basis/i,
    /roth ira/i,
    /after-tax spending each year/i,
  ];

  it('holds every slider both sections read', () => {
    renderTab('Over Time');
    const block = inputsSection();
    for (const name of sharedSliders) {
      expect(block).toContainElement(screen.getByRole('slider', { name }));
    }
  });

  it('leaves neither section carrying a slider of its own', () => {
    renderTab('Over Time');
    const projection = screen
      .getByRole('heading', { name: /the thresholds never move/i })
      .closest('section')!;
    const sequencing = screen
      .getByRole('heading', { name: /which account you spend first/i })
      .closest('section')!;
    expect(projection.querySelectorAll('input[type="range"]')).toHaveLength(0);
    expect(sequencing.querySelectorAll('input[type="range"]')).toHaveLength(0);
    // The one input that is genuinely one section's — and one strategy's —
    // stays with it.
    expect(sequencing).toContainElement(screen.getByLabelText(/fill the ira up to/i));
  });

  it('sits above both of the sections it feeds', () => {
    renderTab('Over Time');
    const block = inputsSection();
    for (const heading of [/the thresholds never move/i, /which account you spend first/i]) {
      const section = screen.getByRole('heading', { name: heading }).closest('section')!;
      expect(block.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
    }
  });

  it('groups the nine under two legends rather than one list', () => {
    renderTab('Over Time');
    const legends = Array.from(inputsSection().querySelectorAll('legend')).map(
      (l) => l.textContent,
    );
    expect(legends).toEqual(['The horizon', 'Your accounts']);
  });

  it('keeps the lump-sum election\u2019s own two sliders with it', () => {
    // The counter-case: back-pay months and the income during each waiting year
    // are read by nothing else on the page, so hoisting them would put two
    // sliders above five tabs that never look at them.
    renderTab('Strategies');
    const section = screen
      .getByRole('heading', { name: /when years of benefit arrive in one cheque/i })
      .closest('section')!;
    expect(section).toContainElement(screen.getByRole('slider', { name: /months of back pay/i }));
  });
});

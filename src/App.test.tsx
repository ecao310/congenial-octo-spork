import { render, screen, fireEvent } from '@testing-library/react';
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

describe('App', () => {
  /** The tax-exempt interest section, so figures can be asserted in context. */
  const muniSection = (): HTMLElement | null =>
    screen
      .getByRole('heading', { name: /what the tax-exempt interest costs/i })
      .closest('section');

  it('renders the heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /marginal tax rate/i })).toBeInTheDocument();
  });

  it('renders the benefit slider defaulting to the 2025 average benefit', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue(String(AVG_ANNUAL_SS_BENEFIT));
    expect(screen.getByText('$23,712')).toBeInTheDocument();
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
    expect(screen.getByText('$36,000')).toBeInTheDocument();
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

  /** Selects the separate-return status and returns its warning banner. */
  const selectMfs = (): HTMLElement => {
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
    return screen.getByRole('note');
  };

  it('warns loudly when Married Filing Separately is selected', () => {
    render(<App />);
    // Nothing shouts until the status is picked.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

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
    expect(screen.getByRole('note')).toHaveTextContent('$17,000');
    expect(screen.getByRole('note')).toHaveTextContent('$20,000');

    // Tax-exempt interest is in provisional income, so it brings the cap
    // forward dollar for dollar and pulls more benefits in at zero income.
    fireEvent.change(screen.getByRole('slider', { name: /tax-exempt/i }), {
      target: { value: '5000' },
    });
    expect(screen.getByRole('note')).toHaveTextContent('$15,000');
    expect(screen.getByRole('note')).toHaveTextContent('$21,250');
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
    render(<App />);
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
    render(<App />);
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

  it('renders the Roth conversion sizing section and sizes the default scenario', () => {
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    // Nothing to price yet, so the section prompts rather than reporting zeros.
    expect(muniSection()).toHaveTextContent('Move the slider above to price it');
  });

  it('prices the muni interest against the taxable share of benefits', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );

    // At the default $30,000 of other income the 85% band already applies, so
    // $5,000 of "tax-free" interest drags in $4,250 of benefits, taxed at 12%
    // for $510 - 10.2 cents per dollar of interest, now and on the next dollar.
    expect(muniSection()).toHaveTextContent('$4,250');
    expect(muniSection()).toHaveTextContent('$510');
    expect(muniSection()).toHaveTextContent('$15,428 taxable, up from $11,178');
    expect(muniSection()).toHaveTextContent('$3,323 total, up from $2,813');
    // Both stat tiles plus the sentence beneath them.
    expect(screen.getAllByText('10.2%')).toHaveLength(3);
    expect(muniSection()).toHaveTextContent('10.2¢ per dollar of interest');

    expect(
      screen.getByText(
        /total income = other income \+ \$23,712 SS \+ \$5,000 tax-exempt interest/i,
      ),
    ).toBeInTheDocument();
  });

  it('reports muni interest as free once the 85% cap already binds', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('slider', { name: /other ordinary income/i }), {
      target: { value: '100000' },
    });
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '10000' } },
    );
    expect(muniSection()).toHaveTextContent('really is free');
    expect(muniSection()).toHaveTextContent('no benefits left to drag in');
  });

  it('feeds the muni interest into the conversion sizing', () => {
    render(<App />);
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
      render(<App />);
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
      render(<App />);
      const section = irmaaSection();
      // The 85% cap has already bound at these incomes, so every cliff sits
      // exactly $20,155.20 of taxable benefits below its MAGI threshold. Only
      // the first three fit inside the chart's $150,000 axis.
      expect(section).toHaveTextContent('cliffs 1, 2, 3');
      expect(section).toHaveTextContent('$85,845, $112,845, $146,845');
    });

    it('shifts the cliffs left by each dollar of tax-exempt interest', () => {
      render(<App />);
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
      render(<App />);
      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
      const section = irmaaSection();
      expect(section).toHaveTextContent('No cliff falls inside the chart above');
      expect(section).toHaveTextContent('$212,000 of MAGI');
    });

    it('charges a couple both on Medicare twice off one MAGI', () => {
      render(<App />);
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
      render(<App />);
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
      render(<App />);
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
    expect(screen.getByText(/Rev\. Proc\. 2024-40/)).toBeInTheDocument();
    expect(screen.getByText(/2025 brackets, standard deduction/)).toBeInTheDocument();
  });

  it('re-prices deduction, brackets, gain band and benefit for 2026', () => {
    render(<App />);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $15,750. Turning 65 adds $2,000.',
    );

    fireEvent.click(yearRadio(2026));
    expect(yearRadio(2026)).toBeChecked();
    expect(yearRadio(2025)).not.toBeChecked();

    expect(screen.getByText(/2026 brackets, standard deduction/)).toBeInTheDocument();
    expect(screen.getByText(/Rev\. Proc\. 2025-32/)).toBeInTheDocument();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $16,100. Turning 65 adds $2,050.',
    );
    // 12% bracket top and 0% capital-gain band, both from Rev. Proc. 2025-32.
    expect(screen.getByText(/12% bracket to \$50,400/)).toBeInTheDocument();
    expect(screen.getByText(/0% capital-gain band to \$49,450/)).toBeInTheDocument();
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

  it('shows the frozen thresholds eating into the benefit year by year', () => {
    render(<App />);
    expect(
      screen.getByText(/The Social Security thresholds are not on that list\./),
    ).toBeInTheDocument();
    // $25,000 base less half of each year's average benefit.
    expect(screen.getByText('$13,144 in 2025, $12,574 in 2026')).toBeInTheDocument();
    expect(screen.getByText(/set \$25,000 in 1983 and \$34,000 in 1993/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(screen.getByText('$20,144 in 2025, $19,574 in 2026')).toBeInTheDocument();
    expect(screen.getByText(/set \$32,000 in 1983 and \$44,000 in 1993/)).toBeInTheDocument();
  });

  it('says a separate return has no headroom to erode rather than showing one', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Separately' }));
    expect(
      screen.queryByText(/\$[\d,]+ in 2025, \$[\d,]+ in 2026/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/sets both thresholds to \$0 outright/),
    ).toBeInTheDocument();
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
    render(<App />);
    expect(
      screen.getByText(/the 2025 income on this chart is really setting the premium for 2027/),
    ).toBeInTheDocument();

    fireEvent.click(yearRadio(2026));
    expect(
      screen.getByText(/the 2026 income on this chart is really setting the premium for 2028/),
    ).toBeInTheDocument();
  });

  it('re-prices the whole IRMAA schedule for 2026, not just its caption', () => {
    render(<App />);
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

  it('names the nine states that taxed benefits in 2025, and no others', () => {
    render(<App />);
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
    render(<App />);
    const section = stateSection();
    expect(section).toHaveTextContent('Income test (2025)');
    expect(section).toHaveTextContent('None — the federal amount flows straight through');
    expect(section).toHaveTextContent(
      'AGI < $107,000 single/HOH/separate, < $133,750 joint',
    );
    expect(section).toHaveTextContent(
      'AGI ≤ $50,000 single / $100,000 joint: exempt',
    );
    // Nine states, three columns of prose, no empty cells.
    const cells = Array.from(section!.querySelectorAll('tbody td'));
    expect(cells).toHaveLength(18);
    for (const cell of cells) expect(cell.textContent).not.toBe('');
  });

  it('drops West Virginia and re-prices the indexed states for 2026', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    const section = stateSection();

    expect(stateRows()).not.toContain('West Virginia');
    expect(stateRows()).toHaveLength(8);
    expect(section).toHaveTextContent('42 of them, plus the District of Columbia');
    expect(section).toHaveTextContent('West Virginia finished phasing its tax out');
    expect(section).toHaveTextContent('Income test (2026)');

    // Minnesota indexes annually, so its figures move with the year; Vermont
    // does not, so its must not.
    expect(section).toHaveTextContent('< $110,780 joint');
    expect(section).not.toHaveTextContent('$108,320');
    expect(section).toHaveTextContent('≤ $55,000 single/HOH, ≤ $70,000 joint');
    // Rhode Island has not published 2026 figures, and says so rather than
    // reprinting 2025's under a 2026 heading.
    expect(section).toHaveTextContent('Not published yet');
    expect(section).not.toHaveTextContent('$133,750');
  });

  it('keeps the full rules collapsed but cites a source for each', () => {
    render(<App />);
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
    render(<App />);
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

  const slider = (name: RegExp): HTMLElement =>
    screen.getByRole('slider', { name });

  const setSlider = (name: RegExp, value: string): void => {
    fireEvent.change(slider(name), { target: { value } });
  };

  it('opens on a 20-year horizon at a 2.5% COLA', () => {
    render(<App />);
    expect(slider(/years to project/i)).toHaveValue('20');
    expect(slider(/years to project/i)).toHaveAttribute('min', '10');
    expect(slider(/years to project/i)).toHaveAttribute('max', '30');
    expect(slider(/annual cola and inflation/i)).toHaveValue('2.5');
    expect(slider(/year you were born/i)).toHaveValue('1955');
    expect(slider(/traditional ira and 401\(k\) balance/i)).toHaveValue('100000');
    expect(slider(/annual growth on that balance/i)).toHaveValue('5');
    // 2025 + 20 years, less the first, is 2044.
    expect(projectionSection()).toHaveTextContent('in 2044');
  });

  it('names both frozen thresholds and the years they were frozen in', () => {
    render(<App />);
    expect(projectionSection()).toHaveTextContent(
      'first provisional-income threshold at $25,000 in 1983 and your second at $34,000 in 1993',
    );
  });

  it('climbs the taxable share to the 85% ceiling and names the year', () => {
    render(<App />);
    const section = projectionSection();
    // $30,000 of other income and the 2025 average benefit: just under half the
    // benefit is taxable in 2025, all 85% of it by 2035, on unchanged real
    // income. Nothing but IRC 86(c) moved.
    expect(section).toHaveTextContent('47.14% → 85%');
    expect(section).toHaveTextContent('$11,178 of $23,712 in 2025');
    expect(section).toHaveTextContent('to the 85% ceiling in 2035, and stops there');
  });

  it('quotes the last year’s tax in first-year dollars, not nominal ones', () => {
    render(<App />);
    expect(projectionSection()).toHaveTextContent('Federal tax in 2025 dollars');
    expect(projectionSection()).toHaveTextContent('$1,853 → $4,277');
    expect(projectionSection()).toHaveTextContent("2.31x the first year's");
  });

  it('starts required distributions at 73 and shows the divisor it used', () => {
    render(<App />);
    const section = projectionSection();
    // Born 1955, so 73 in 2028; $100,000 grown at 5% for three years, over the
    // Uniform Lifetime Table divisor for 73.
    expect(section).toHaveTextContent('Distributions become required at 73');
    expect(section).toHaveTextContent('2028 · $4,368');
    expect(section).toHaveTextContent('At 73, off a $115,763 balance divided by 26.5');
    expect(section).toHaveTextContent('The step at 2028 is the first required');
    expect(section).toHaveTextContent('SECURE 2.0 pushed that age from 72 to 73');
  });

  it('pushes the first distribution to 75 for a 1965 birth year', () => {
    render(<App />);
    setSlider(/year you were born/i, '1965');
    const section = projectionSection();
    expect(section).toHaveTextContent('Age 60 in 2025. Distributions become required at 75');
    expect(section).toHaveTextContent('The step at 2040 is the first required');
    expect(section).toHaveTextContent('SECURE 2.0 pushed that age from 72 to 75');
    expect(section).toHaveTextContent('3 more years of compounding');
  });

  it('flags 1959 as the birth year the regulations left reserved', () => {
    render(<App />);
    setSlider(/year you were born/i, '1959');
    expect(projectionSection()).toHaveTextContent(
      'the one birth year the regulations have not settled',
    );
    expect(projectionSection()).toHaveTextContent('both 73 and 75');
  });

  it('says there is no step when the filer is already past the applicable age', () => {
    render(<App />);
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
    render(<App />);
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    const section = projectionSection();
    expect(section).toHaveTextContent('No balance');
    expect(section).not.toHaveTextContent('required minimum distribution');
  });

  it('calls the senior-deduction expiry a step without claiming it is the second', () => {
    render(<App />);
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
    render(<App />);
    setSlider(/traditional ira and 401\(k\) balance/i, '0');
    setSlider(/annual cola and inflation/i, '0');
    const section = projectionSection();
    expect(section).toHaveTextContent('47.14% → 47.14%');
    expect(section).toHaveTextContent('At a 0% COLA nothing moves');
    expect(section).toHaveTextContent('It is everything else moving past them');
    expect(section).not.toHaveTextContent('The taxable share climbs from');
  });

  it('blames the distribution, not inflation, for a climb at a zero COLA', () => {
    render(<App />);
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
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Separately' }));
    const section = projectionSection();
    expect(section).toHaveTextContent('85% of the benefit is taxable from the first dollar');
    expect(section).toHaveTextContent('there is no ratchet left to project');
    expect(section).toHaveTextContent('already at the 85% ceiling in 2025');
  });

  it('re-dates the whole projection when the tax year changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
    const section = projectionSection();
    expect(section).toHaveTextContent('Age 71 in 2026');
    expect(section).toHaveTextContent('Federal tax in 2026 dollars');
    expect(section).toHaveTextContent('in 2045');
  });
});

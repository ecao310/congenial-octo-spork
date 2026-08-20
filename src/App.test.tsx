import { render, screen, fireEvent } from '@testing-library/react';
import App, { CustomTooltip, LTCGTooltip } from './App';
import { MAX_ANNUAL_SS_BENEFIT, AVG_ANNUAL_SS_BENEFIT } from './utils/tax';

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
      expect(section).toHaveTextContent('Over $500,000');
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


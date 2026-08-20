import { render, screen, fireEvent } from '@testing-library/react';
import App, { CustomTooltip, LTCGTooltip } from './App';
import { MAX_ANNUAL_SS_BENEFIT, AVG_ANNUAL_SS_BENEFIT } from './utils/tax';

describe('App', () => {
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

  it('updates the ordinary income slider readout when moved', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other ordinary income/i,
    });
    fireEvent.change(slider, { target: { value: '50000' } });
    expect(slider).toHaveValue('50000');
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


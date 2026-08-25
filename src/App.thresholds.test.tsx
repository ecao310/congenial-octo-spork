import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { ChartTooltip } from './components/ChartTooltip';
import { PAGE_TAX_YEAR } from './lib/tax';
import { pinPageYear, AVG_ANNUAL_SS_BENEFIT } from './test/pageFixtures';

/**
 * The two threshold lines the chart can draw, the panel that switches them on,
 * and the axis they are placed along.
 *
 * None of the three is income tax — IRMAA is a Medicare premium, the 400% line
 * is a Marketplace credit, and the axis is a frame — so all three are held
 * together here rather than among the claims about the steps. What each one
 * costs the reader's own return is asserted in `App.answer.test.tsx`; where
 * the arithmetic puts them is `lib/tax`'s own suites.
 */

pinPageYear();

describe('What a hovered point is worth', () => {
  describe('ChartTooltip', () => {
    it('does not render if not active', () => {
      const { container } = render(
        <ChartTooltip active={false} ssBenefit={20000} />,
      );
      expect(container.firstChild).toBeNull();
    });

    /**
     * Four rows, in order, and nothing after them.
     *
     * This is the assertion that keeps advice off a hover. The tooltip used to
     * close with "stay under $x or over $y" on a hill and "fill this valley"
     * on a valley — a recommendation about wherever the mouse landed, which is
     * nobody's point in particular and no point at all on a touchscreen. It
     * also carried two distances, to the next IRMAA
     * cliff and to the 400% poverty line, which are now quoted in the close at
     * the reader's own income. `children` is pinned rather than the text,
     * because a row added back would pass every assertion written about the
     * four that remain.
     */
    it('draws four figures and no advice', () => {
      const { container } = render(
        <ChartTooltip
          active
          payload={[{ payload: { income: 30000, marginalRate: 22.2, totalTax: 2813 } }]}
          ssBenefit={24852}
        />,
      );
      const tooltip = container.querySelector('.chart-tooltip') as HTMLElement;
      expect(tooltip.children).toHaveLength(4);
      expect([...tooltip.children].map((row) => row.textContent)).toEqual([
        expect.stringContaining('Total income'),
        expect.stringContaining('Marginal Rate:'),
        expect.stringContaining('Total Federal Tax:'),
        expect.stringContaining('Medicare IRMAA:'),
      ]);
      // $30,000 sits inside the hump on this return, which is where the hill
      // advice used to be drawn, and inside the 400% cliff's reach besides.
      expect(tooltip).not.toHaveTextContent(/Consider/);
      expect(tooltip).not.toHaveTextContent(/tax hill|tax valley/);
      expect(tooltip).not.toHaveTextContent(/next cliff/);
      expect(tooltip).not.toHaveTextContent(/poverty line|premium tax credit/);
    });

    it('renders the head and the rate on a point off any threshold', () => {
      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
        />,
      );
      // The head names the axis figure and then takes it apart, because the
      // chart's x is total income and neither half is readable off it.
      expect(
        screen.getByText(/Total income \$44,852 · \$24,852 SS \+ \$20,000 other income/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Marginal Rate:/)).toBeInTheDocument();
    });

    it('reports no IRMAA surcharge below the first cliff', () => {
      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: { income: 20000, marginalRate: 15, totalTax: 768 } }]}
          ssBenefit={24852}
        />,
      );
      // Provisional income is $20,000 + half the $24,852 benefit = $32,426,
      // $7,426 over the $25,000 base, so $3,713 of the benefit is taxable and
      // MAGI is $23,713 — against a 2026 first cliff of $109,000.
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(screen.queryByText(/tier .* of 5/)).not.toBeInTheDocument();
    });

    it('annualizes the Part B and Part D surcharge once past a cliff', () => {
      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: { income: 90000, marginalRate: 22, totalTax: 17000 } }]}
          ssBenefit={24852}
        />,
      );
      // $90,000 + the capped $21,124.20 of benefits clears $109,000 of MAGI.
      expect(screen.getByText('$1,148/yr')).toBeInTheDocument();
      expect(screen.getByText(/tier 1 of 5/)).toBeInTheDocument();
    });

    /**
     * Priced at a point chosen so the interest is the whole difference: this
     * return is $1,876 under the joint cliff on the tax code's reading of it
     * and $8,124 over on Medicare's. The pair of assertions is the test — the
     * first alone would pass on a tooltip that had never heard of muni
     * interest and simply read a MAGI $10,000 too high.
     */
    it('adds tax-exempt interest back to the MAGI the surcharge is read from', () => {
      const point = { income: 195000, marginalRate: 24, totalTax: 34000 };
      const { unmount } = render(
        <ChartTooltip
          active={true}
          payload={[{ payload: point }]}
          ssBenefit={24852}
          filingStatus="mfj"
          muniInterest={10000}
          beneficiaries={2}
        />,
      );
      // $195,000 of other income plus the capped $21,124.20 of benefit is
      // $216,124 of AGI, under the $218,000 first cliff — until the $10,000 of
      // tax-exempt interest is added straight back. Charged to each of them,
      // so the tier-1 step of $1,148.40 is billed twice.
      expect(screen.getByText('$2,297/yr')).toBeInTheDocument();
      expect(screen.getByText(/tier 1 of 5/)).toBeInTheDocument();
      unmount();

      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: point }]}
          ssBenefit={24852}
          filingStatus="mfj"
          beneficiaries={2}
        />,
      );
      expect(screen.getByText('$0/yr')).toBeInTheDocument();
      expect(screen.queryByText(/tier .* of 5/)).not.toBeInTheDocument();
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
    it('counts tax-exempt interest', () => {
      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: { income: 40_000, marginalRate: 22.2, totalTax: 3_000 } }]}
          ssBenefit={24_852}
          filingStatus="single"
          muniInterest={10_000}
          year={PAGE_TAX_YEAR}
        />,
      );
      // $40,000 of other income + $24,852 of benefit + $10,000 of tax-exempt
      // interest, which is the whole of the figure the head quotes.
      expect(screen.getByText(/Total income \$74,852/)).toBeInTheDocument();
      expect(
        screen.getByText(/Total income \$74,852 · \$24,852 SS \+ \$10,000 tax-exempt \+ \$40,000 other income/),
      ).toBeInTheDocument();
    });

    it('falls back to income plus benefit when nothing else is set', () => {
      render(
        <ChartTooltip
          active={true}
          payload={[{ payload: { income: 30_000, marginalRate: 22.2, totalTax: 2_819 } }]}
          ssBenefit={24_852}
        />,
      );
      expect(screen.getByText(/Total income \$54,852/)).toBeInTheDocument();
    });
  });
});

/**
 * The IRMAA cliffs are drawn as the page opens and the 400% line waits to be
 * asked for; the panel behind the Breakpoints button is where either is
 * switched. Opening it is the first act of every test below, so it has a
 * helper of its own.
 */
const openBreakpointsPanel = (): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: /^Breakpoints/ }));
  return screen.getByRole('group', { name: /Health insurance breakpoints/ });
};

describe('the Breakpoints panel on the torpedo chart', () => {
  it('opens with the panel shut and no key on the page', () => {
    render(<App />);
    // The lines are on the plot on arrival (App.chart.test.tsx holds those);
    // the panel is not, and neither is a paragraph of key under the plot.
    expect(
      screen.queryByRole('group', { name: /Health insurance breakpoints/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Medicare IRMAA cliffs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Breakpoints/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // And no key at all. The key is the swatch beside each switch, so with
    // the panel shut there is nothing tying a colour to a cliff but the
    // cliff's own label on the plot.
    expect(document.querySelector('.chart-key-swatch')).toBeNull();
  });

  it('offers both switches, the IRMAA one ticked, and counts what it draws', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /^Breakpoints/ });
    // Three IRMAA cliffs fit the default axis and are drawn on arrival, so
    // the button opens with that number to report.
    expect(button).toHaveAccessibleName('Breakpoints (3)');

    openBreakpointsPanel();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const irmaa = screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' });
    const subsidy = screen.getByRole('checkbox', { name: '400% poverty-line cliff' });
    expect(irmaa).toBeChecked();
    expect(subsidy).not.toBeChecked();

    // One 400% line on top of the three: the count is of marks on the chart,
    // not of ticked boxes — and with the IRMAA switch off it is the one line.
    fireEvent.click(subsidy);
    expect(button).toHaveAccessibleName('Breakpoints (4)');
    fireEvent.click(irmaa);
    expect(button).toHaveAccessibleName('Breakpoints (1)');
    fireEvent.click(subsidy);
    expect(button).toHaveAccessibleName('Breakpoints');
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
      'draws the thresholds as red dashed lines, and Breakpoints in the corner of the plot switches them off',
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
    const income = screen.getByRole('slider', {
      name: /other income \(excluding social security\)/i,
    });
    // $40,000 of other income plus the whole $24,852 benefit: $64,852, which
    // is already $2,252 past the $62,600 line.
    expect(subsidyExplainer()).toHaveTextContent('That is past the cliff');
    expect(subsidyExplainer()).toHaveTextContent('takes $2,252 less income');

    // Back under it: $54,852 is 350% of the $15,650 line with $7,748 of it
    // left to go.
    fireEvent.change(income, { target: { value: '30000' } });
    expect(subsidyExplainer()).toHaveTextContent(
      'household income is $54,852, 350% of the poverty line',
    );
    expect(subsidyExplainer()).toHaveTextContent('Another $7,748 of it reaches the line');
    // And sends the reader here for it rather than to the chart. The hover
    // tooltip used to measure this distance too, at whichever point the mouse
    // was over; it now says only what a hover is good for, so an explainer
    // that still offered "hover the curve to read your own distance from it"
    // would be pointing at a row that is not drawn.
    expect(subsidyExplainer()).toHaveTextContent(
      'your own distance from it is at the foot of this note',
    );
    expect(subsidyExplainer()).not.toHaveTextContent(/hover/i);

    fireEvent.change(income, { target: { value: '50000' } });
    expect(subsidyExplainer()).toHaveTextContent('That is past the cliff');
    expect(subsidyExplainer()).toHaveTextContent('takes $12,252 less income');
  });

  it('keeps the switch, and draws nothing, once the line is already behind the reader', () => {
    render(<App />);
    openBreakpointsPanel();
    // The IRMAA lines off, so the count below is the 400% line's alone.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' }));
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
    screen.getByRole('slider', { name: /other income \(excluding social security\)/i });

  // The span the chart draws used to be prose above it as well. That
  // paragraph came off the page, so the plot's own accessible name is the one
  // place left that names the edge in words, and it is where the edge is read
  // back from here.
  const chartLabel = (): string =>
    screen
      .getByRole('img', { name: /^Chart: the marginal tax rate/ })
      .getAttribute('aria-label')!;

  it('stays where it was for a filer with only one hump to show', () => {
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('max', '150000');
    expect(chartLabel()).toContain('$0 to $150,000 of other income');
  });

  it('widens to fit the senior deduction phaseout when it is claimed', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // $175,000 of MAGI, less the $20,155.20 of benefit already in AGI, is
    // $154,845 of other income — past the old fixed edge, and now inside.
    expect(incomeSlider()).toHaveAttribute('max', '175000');
    expect(chartLabel()).toContain('$0 to $175,000 of other income');

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint phaseout starts $75,000 higher and ends $250,000 of MAGI, so
    // the axis has to reach $229,845 of other income.
    expect(incomeSlider()).toHaveAttribute('max', '250000');
    expect(chartLabel()).toContain('$0 to $250,000 of other income');
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
   * still lands on a sampled point.
   *
   * Nothing a reader can click reaches the third rung any more — the widest
   * chart a control can ask for is the joint phaseout's $250,000 — so the
   * rungs past it are reached the only way that is left, which is the way
   * they were written for: a link naming an income the sliders never had.
   */
  it('coarsens its step as the axis widens', () => {
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('step', '500');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(incomeSlider()).toHaveAttribute('max', '250000');
    expect(incomeSlider()).toHaveAttribute('step', '500');
  });

  it('coarsens it again for an income only a link can name', () => {
    window.history.replaceState(null, '', '/?income=400000');
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('max', '400000');
    expect(incomeSlider()).toHaveAttribute('step', '1000');
  });

  it('coarsens it once more past $600,000', () => {
    window.history.replaceState(null, '', '/?income=700000');
    render(<App />);
    expect(incomeSlider()).toHaveAttribute('max', '700000');
    expect(incomeSlider()).toHaveAttribute('step', '2000');
  });
});

/* ------------------------------------------------------------------ */
/*  The axis, taken apart                                             */
/* ------------------------------------------------------------------ */

/**
 * `totalIncomeFor` is what "total income" means on this page: other income,
 * plus the *whole* benefit, plus tax-exempt interest. Two places take a
 * figure on that axis apart for the reader rather than just quoting it — the
 * tooltip head and the plot's accessible name — and each of them hands over
 * an addition the reader can do. So each of them has to name every term the
 * total contains, or the addition visibly fails: the accessible name used to
 * name the benefit and stop, and at $3,750 of tax-exempt interest it said the
 * axis began at $28,602 beside arithmetic that reached $24,852. Step 2's
 * opening paragraph was the third, and it said the same addition until it
 * came off the page.
 *
 * These read the figures back out of the prose and add them up, rather than
 * matching a sentence, so they hold whatever the wording becomes.
 */
describe('the axis, taken apart', () => {
  /** Every dollar figure in a sentence, in the order it says them. */
  const dollars = (text: string): number[] =>
    [...text.matchAll(/\$[\d,]+/g)].map((m) => Number(m[0].replace(/[$,]/g, '')));

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
    const [from, to, benefit, , edge] = dollars(chartLabel());
    expect(benefit).toBe(AVG_ANNUAL_SS_BENEFIT);
    expect(from).toBe(benefit);
    expect(to).toBe(benefit + edge);
  });

  /**
   * The span stays a plain addition when the axis widens under it. The edge
   * moves for reasons of its own — the senior phaseout is the one a reader
   * can reach — and both ends have to follow it, or the sentence names a
   * right edge the chart no longer has.
   */
  it('stays a plain addition when the axis widens under it', () => {
    render(<App />);
    setSlider(/tax-exempt \(municipal\) interest/i, '3750');
    const [, toBefore, , , , edgeBefore] = dollars(chartLabel());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    const [from, to, benefit, interest, , edge] = dollars(chartLabel());
    expect(from).toBe(benefit + interest);
    expect(to).toBe(benefit + interest + edge);
    expect(edge).toBeGreaterThan(edgeBefore);
    expect(to).toBeGreaterThan(toBefore);
  });

  /**
   * The accessible name is the same sentence for a listener, and it was wrong
   * in the same way, so it is pinned the same way — including that tax-exempt
   * interest, which never moves, sits inside both ends of the span rather
   * than only the left one.
   */
  it('names both fixed halves to a screen reader, and still adds up', () => {
    render(<App />);
    setSlider(/tax-exempt \(municipal\) interest/i, '3750');
    expect(chartLabel()).toContain(
      'a fixed $24,852 of Social Security and $3,750 of municipal interest',
    );
    const [from, to, benefit, interest, , edge] = dollars(chartLabel());
    expect(from).toBe(benefit + interest);
    expect(to).toBe(benefit + interest + edge);
  });

  /**
   * And the third place, which quotes the total for a hovered point and then
   * decomposes it. Tax-exempt interest is inside the figure the head quotes,
   * so the head has to name it among the terms it adds up.
   */
  it('names the tax-exempt interest inside the total the tooltip quotes', () => {
    render(
      <ChartTooltip
        active
        payload={[{ payload: { income: 20_000, marginalRate: 15, totalTax: 768 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
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
      <ChartTooltip
        active
        payload={[{ payload: { income: 20_000, marginalRate: 15, totalTax: 768 } }]}
        ssBenefit={AVG_ANNUAL_SS_BENEFIT}
        year={PAGE_TAX_YEAR}
      />,
    );
    expect(document.querySelector('.chart-tooltip-head')).toHaveTextContent(
      'Total income $44,852 · $24,852 SS + $20,000 other income',
    );
  });
});

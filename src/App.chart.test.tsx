import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * ResponsiveContainer measures its parent, and jsdom reports every element as
 * zero-sized — so recharts renders nothing at all in the main App suite. Giving
 * it a fixed size is the only way to assert on what actually reaches the SVG,
 * which is where the IRMAA cliffs live.
 */
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <actual.ResponsiveContainer width={800} height={400}>
        {children as never}
      </actual.ResponsiveContainer>
    ),
  };
});

import App from './App';
import { CHART } from './palette';
import {
  avgAnnualSSBenefit,
  FPL_YEAR_PARAMS,
  irmaaCliffs,
  PAGE_TAX_YEAR,
} from './utils/tax';

/**
 * The page prices `PAGE_TAX_YEAR` and has no control that changes it, so every
 * dollar figure in the comments below is a figure for that year and this is
 * the one constant to re-point them from when it moves.
 *
 * The clock is pinned to it even so. Nothing the page renders reads `Date` any
 * more, but the engine's own `defaultTaxYear()` still follows the wall
 * calendar, and a stopped clock is what keeps any figure that reaches it from
 * making these assertions depend on the day they are run.
 */
const PINNED_YEAR = PAGE_TAX_YEAR;

beforeEach(() => {
  // Date only: React Testing Library needs the real setTimeout.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${PINNED_YEAR}-07-01T00:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

/** The x-coordinates of a selection of reference lines, left to right. */
const positionsOf = (root: ParentNode, selector: string): number[] =>
  Array.from(root.querySelectorAll(`${selector} .recharts-reference-line-line`))
    .map((line) => Number(line.getAttribute('x1')));

/**
 * The x-coordinates of one kind of reference line on the first chart.
 *
 * Scoped to that chart rather than the whole page: the tabs that drew cliffs
 * of their own are coming back, and an unscoped query would then pick up more
 * than one chart's worth — step 4's ceiling line included. Scoped by class
 * rather than by "everything that is not the marker", because step 2 now draws
 * two kinds of cliff in two colours: five IRMAA thresholds and the one 400%
 * poverty-line cliff, which move along different MAGIs and so never move
 * together.
 */
const linesOn = (container: HTMLElement, className: string): number[] => {
  const ordinaryIncomeChart = container.querySelector('.recharts-wrapper');
  if (!ordinaryIncomeChart) throw new Error('no chart rendered');
  return positionsOf(ordinaryIncomeChart, `.recharts-reference-line.${className}`);
};

/** The IRMAA cliff lines, left to right. */
const cliffPositions = (container: HTMLElement): number[] =>
  linesOn(container, 'irmaa-cliff');

/** The 400% poverty-line cliff, when this return meets one on this axis. */
const subsidyPositions = (container: HTMLElement): number[] =>
  linesOn(container, 'subsidy-cliff');

/** Where the reader's own marker stands on each chart, in page order:
    torpedo, gains, conversion. */
const herePositions = (container: HTMLElement): number[] =>
  positionsOf(container, '.recharts-reference-line.here-line');

/**
 * Ask step 2 for both threshold lines.
 *
 * Neither is drawn until a reader switches it on: they are a Medicare premium
 * and a Marketplace credit, so neither is income tax and neither belongs on a
 * chart of marginal rates by default. Every test below is about where a line
 * lands once it has been asked for, so each one asks first — and the asking
 * is done on a fresh render, before any filing status or age is changed,
 * because the 400% switch is only offered to a return that could still claim
 * the credit.
 *
 * The panel is shut again afterwards. It is not a dialog and nothing traps
 * focus in it, but leaving it open puts two more checkboxes in the same
 * accessible-name space as the age toggles for the rest of the test.
 */
const showBothThresholds = (): void => {
  const open = screen.getByRole('button', { name: /^Lines/ });
  fireEvent.click(open);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Medicare IRMAA cliffs' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '400% poverty-line cliff' }));
  fireEvent.click(open);
};

describe('IRMAA cliffs on the ordinary-income chart', () => {
  it('draws nothing until the reader asks for it', () => {
    const { container } = render(<App />);
    // The default render is the curve and the reader's own marker, and that is
    // all: the same return that draws three IRMAA cliffs and a 400% line in
    // the test below draws none of them here.
    expect(cliffPositions(container)).toHaveLength(0);
    expect(subsidyPositions(container)).toHaveLength(0);
    expect(screen.queryByText(/^IRMAA \d$/)).not.toBeInTheDocument();
    expect(screen.queryByText('400% FPL')).not.toBeInTheDocument();
    expect(herePositions(container).length).toBeGreaterThan(0);
  });

  it('draws one labelled reference line per cliff inside the x-axis', () => {
    const { container } = render(<App />);
    showBothThresholds();
    // Cliffs 4 and 5 need $205,000 and $500,000 of MAGI, past the chart.
    expect(screen.getAllByText(/^IRMAA [123]$/)).toHaveLength(3);
    expect(screen.queryByText('IRMAA 4')).not.toBeInTheDocument();

    const positions = cliffPositions(container);
    expect(positions).toHaveLength(3);
    // Left to right, in tier order, and inside the plotting area.
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[2]).toBeLessThan(800);
  });

  it('slides the lines left as tax-exempt interest is added', () => {
    const { container } = render(<App />);
    showBothThresholds();
    const before = cliffPositions(container);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '10000' } },
    );
    const after = cliffPositions(container);
    // $10,000 of MAGI is a fixed fraction of the $150,000 axis, so all three
    // move left by the same distance.
    expect(after[0]).toBeLessThan(before[0]);
    expect(after[1] - before[1]).toBeCloseTo(after[0] - before[0], 6);
    expect(after[2] - before[2]).toBeCloseTo(after[0] - before[0], 6);
  });

  it('draws a separate return a single line, at its fourth-tier cliff', () => {
    const { container } = render(<App />);
    showBothThresholds();
    // A separate return is not on the strip — it is the second option in the
    // menu beside it.
    fireEvent.change(screen.getByRole('combobox', { name: 'More filing statuses' }), {
      target: { value: 'mfs' },
    });
    // Tiers 1 through 3 do not exist for a separate return, and tier 5 needs
    // $391,000 of MAGI, so exactly one line survives — the fourth.
    expect(screen.getByText('IRMAA 4')).toBeInTheDocument();
    expect(screen.queryByText(/^IRMAA [1235]$/)).not.toBeInTheDocument();
    const positions = cliffPositions(container);
    expect(positions).toHaveLength(1);

    // It sits at $87,876 of other income: $109,000 of MAGI less the $21,124.20
    // of benefits already in AGI. A single filer's *first* cliff shares that
    // $109,000 threshold and — both being far past the 85% cap by then — lands
    // in exactly the same place. What differs is the price of crossing it:
    // $1,148.40 a year for the single filer, $6,355.20 for the separate one.
    fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
    expect(cliffPositions(container)[0]).toBeCloseTo(positions[0], 6);
    expect(screen.getByText('IRMAA 1')).toBeInTheDocument();
  });

  /**
   * The lines are drawn in dollars on an axis whose width in dollars now moves
   * with the return. Nothing about where the cliffs *are* changes when the age
   * toggle goes on, but the plot they are drawn on grows from $150,000 to
   * $175,000 to fit the senior deduction's phaseout, so each one sits a smaller
   * fraction of the way across it.
   */
  it('slides the lines left as the axis widens for the senior deduction', () => {
    const { container } = render(<App />);
    showBothThresholds();
    const before = cliffPositions(container);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    const after = cliffPositions(container);
    expect(after).toHaveLength(3);
    after.forEach((x, i) => expect(x).toBeLessThan(before[i]));
    // The gap between two lines is their gap in dollars over the axis in
    // dollars, so at an unchanged plot width the gaps shrink by exactly the
    // ratio of the two axes — no need to know where the plot starts.
    expect((after[1] - after[0]) / (before[1] - before[0])).toBeCloseTo(150 / 175, 6);
    expect((after[2] - after[1]) / (before[2] - before[1])).toBeCloseTo(150 / 175, 6);
  });

  it('brings a joint return\u2019s first cliff onto the chart when the axis grows', () => {
    const { container } = render(<App />);
    showBothThresholds();
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // A joint tier-1 threshold is past a $150,000 axis, so nothing is drawn.
    expect(cliffPositions(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // Claiming the senior deduction stretches the axis to $250,000 to fit a
    // phaseout that ends at $217,278 of other income, and the first two
    // cliffs, at $185,278 and $241,278, are inside it. The third, at $309,278,
    // is not — the axis is sized by what the curve does, and cliffs ride along
    // or they do not.
    expect(cliffPositions(container)).toHaveLength(2);
    expect(screen.getByText('IRMAA 1')).toBeInTheDocument();
    expect(screen.getByText('IRMAA 2')).toBeInTheDocument();
    expect(screen.queryByText('IRMAA 3')).not.toBeInTheDocument();
  });

  /**
   * The axis is drawn in total income and a cliff knows only the *other*
   * income that reaches it, so every line on the plot is placed through one
   * conversion. Get that wrong and nothing looks broken: the lines still
   * appear, still sit in tier order, still fall inside the plot — they are
   * simply a benefit's worth of pixels to the left of the income they name,
   * which is the one error every other test in this file would pass.
   *
   * So this one measures. The marker is the axis made visible — it stands at
   * the reader's own total income — so two marker readings give the scale of
   * the plot in pixels per dollar, and the cliff has to land where that scale
   * says its own income is.
   */
  it('places the cliffs on the same axis the marker stands on', () => {
    const { container } = render(<App />);
    showBothThresholds();
    const markerAt = (income: number): number => {
      fireEvent.change(
        screen.getByRole('slider', { name: /other income \(not social security\)/i }),
        { target: { value: String(income) } },
      );
      return herePositions(container)[0];
    };
    // Both inside the default $150,000 axis, so neither reading widens it.
    const left = markerAt(0);
    const pxPerDollar = (markerAt(100_000) - left) / 100_000;

    const defaults = {
      ssBenefit: avgAnnualSSBenefit(PINNED_YEAR, 'single'),
      filingStatus: 'single' as const,
      year: PINNED_YEAR,
    };
    const expected = irmaaCliffs(defaults)
      .filter((c) => c.otherIncome > 0 && c.otherIncome <= 150_000)
      .map((c) => left + pxPerDollar * c.otherIncome);

    expect(expected).toHaveLength(3);
    cliffPositions(container).forEach((x, i) => {
      expect(x).toBeCloseTo(expected[i], 1);
    });
  });

  it('drops the lines entirely when no cliff fits on the axis', () => {
    const { container } = render(<App />);
    showBothThresholds();
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint tier-1 threshold is $218,000 of MAGI — off the right edge.
    expect(cliffPositions(container)).toHaveLength(0);
    expect(screen.queryByText(/^IRMAA \d$/)).not.toBeInTheDocument();
  });
});

/**
 * The second cliff on the same chart, and the only reference line here whose
 * existence turns on the tax year rather than on the axis: 400% of the federal
 * poverty line was not a ceiling at all from 2021 through 2025.
 *
 * It travels along a MAGI of its own — 36B counts the whole benefit, where
 * Medicare counts only the share the torpedo dragged in — so it is drawn in
 * its own colour and asserted on through its own selector. The dollar
 * arithmetic behind the placement is in tax.test.ts; what is checked here is
 * that the line is on the chart, and for whom.
 */
describe('the 400% poverty-line cliff on the ordinary-income chart', () => {
  it('draws one line, left of every IRMAA cliff', () => {
    const { container } = render(<App />);
    showBothThresholds();
    // $62,600 of household income, less the $24,852 benefit that is already
    // all of it — so $37,748 of other income, against IRMAA 1 at $87,876.
    const subsidy = subsidyPositions(container);
    expect(subsidy).toHaveLength(1);
    expect(screen.getByText('400% FPL')).toBeInTheDocument();
    expect(subsidy[0]).toBeGreaterThan(0);
    expect(subsidy[0]).toBeLessThan(cliffPositions(container)[0]);
  });

  it('moves left further than the IRMAA lines do as the benefit grows', () => {
    const { container } = render(<App />);
    showBothThresholds();
    const before = { subsidy: subsidyPositions(container)[0], irmaa: cliffPositions(container)[0] };
    fireEvent.change(screen.getByRole('slider', { name: /social security benefit/i }), {
      target: { value: '34852' },
    });
    const after = { subsidy: subsidyPositions(container)[0], irmaa: cliffPositions(container)[0] };
    // The axis is unchanged at $150,000 either side, so pixels are dollars on
    // a fixed scale: 36B takes the whole $10,000, and 86(a) can put at most
    // 85% of it in the tax base Medicare measures.
    expect(after.subsidy).toBeLessThan(before.subsidy);
    expect(before.subsidy - after.subsidy).toBeCloseTo(
      (before.irmaa - after.irmaa) / 0.85,
      4,
    );
  });

  it('drops the line once everyone on the return is on Medicare', () => {
    const { container } = render(<App />);
    showBothThresholds();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // 36B(c)(2)(B): nobody eligible for Medicare is eligible for the credit.
    expect(subsidyPositions(container)).toHaveLength(0);
    expect(screen.queryByText('400% FPL')).not.toBeInTheDocument();
    // The red ones are still there — this is the reader they are about.
    expect(cliffPositions(container).length).toBeGreaterThan(0);
  });

  it('keeps it for a joint return with one spouse still under 65', () => {
    const { container } = render(<App />);
    showBothThresholds();
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // One spouse over, one under: the return stands in front of both kinds of
    // cliff at once, which is the case the per-person rule exists for.
    expect(subsidyPositions(container)).toHaveLength(1);
    expect(cliffPositions(container)).toHaveLength(2);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    expect(subsidyPositions(container)).toHaveLength(0);
  });

  /**
   * This used to click its way to 2025 and back, because 2025 is a year with
   * no cliff in it — ARPA 9661, extended through 2025 by the IRA, capped the
   * household's own share at 8.5% of income at every income level, so there
   * was no line to draw. The page prices one year now and cannot be sent to
   * that one, so what is left to assert here is the premise the other four
   * tests in this describe rest on: the line is drawn because the year the
   * page prices has a cliff, not because the chart always draws one. The
   * year-by-year half is `tax.test.ts`'s, where `ptcCliff({ year: 2025 })` is
   * pinned at null and `fpl400` is pinned out of the ceiling list.
   */
  it('draws it because the year the page prices has a cliff', () => {
    const { container } = render(<App />);
    showBothThresholds();
    expect(FPL_YEAR_PARAMS[PAGE_TAX_YEAR].cliff).toBe(true);
    expect(subsidyPositions(container)).toHaveLength(1);
  });
});

/**
 * The slider under each chart picks a point on a curve that is already drawn —
 * it does not draw the curve. The marker is what says so on the chart itself,
 * where the readout underneath says what the point costs.
 */
describe('the “you are here” marker', () => {
  /**
   * The `<text>` recharts renders for a marker's label, chart by chart.
   *
   * Labels do not live inside the reference line that owns them: recharts
   * lifts every label into a single z-index layer at the root of the SVG so
   * that nothing can draw over one. So they are found by their words, per
   * chart, rather than by their line.
   */
  const hereLabels = (container: HTMLElement): SVGTextElement[] =>
    Array.from(container.querySelectorAll('.recharts-wrapper')).map((chart) => {
      const label = chart.querySelector<SVGTextElement>('text.here-label');
      if (!label) throw new Error('a chart has no “you are here” label');
      return label;
    });

  /**
   * The marker's label is stacked — the words, then each of the two figures
   * the axis position is made of — so it is read as a list of `tspan`s rather
   * than as one string. `textContent` runs them together with nothing between.
   */
  const hereLabelLines = (container: HTMLElement): string[] =>
    Array.from(hereLabels(container)[0].querySelectorAll('tspan')).map(
      (t) => t.textContent ?? '',
    );

  it('puts one labelled marker on the page\u2019s one chart', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.recharts-wrapper')).toHaveLength(1);
    expect(herePositions(container)).toHaveLength(1);
    // The axis is total income, so the marker is where both halves of that
    // figure are named: the benefit the slider cannot move, and the other
    // income it can. $24,852 is the default single benefit for the year.
    expect(hereLabelLines(container)).toEqual([
      'You are here',
      '$24,852 SS',
      '+ $30,000 other',
    ]);
    // The marker wears the colour of the control that drives it — amber, for
    // other income — which is what lets the readout under it point at "the
    // dashed amber line" and be understood.
    expect(
      Array.from(
        container.querySelectorAll('.recharts-reference-line.here-line line'),
      ).map((line) => line.getAttribute('stroke')),
    ).toEqual(['#f59e0b']);
  });

  it('moves with its own slider', () => {
    const { container } = render(<App />);
    const [torpedo] = herePositions(container);

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '90000' } },
    );
    // $30,000 to $90,000 on a $150,000 axis: right, and a long way.
    expect(herePositions(container)[0]).toBeGreaterThan(torpedo);
  });

  it('stands at the reader’s own fraction of the axis', () => {
    const { container } = render(<App />);
    const at = (value: number): number => {
      fireEvent.change(
        screen.getByRole('slider', { name: /other income \(not social security\)/i }),
        { target: { value: String(value) } },
      );
      return herePositions(container)[0];
    };
    const left = at(0);
    const right = at(150_000);
    expect(right).toBeGreaterThan(left);
    // The axis is linear, so half the income is half the distance across it.
    expect(at(75_000)).toBeCloseTo((left + right) / 2, 6);
  });

  it('flips the label to the near side of the line past mid-axis', () => {
    const { container } = render(<App />);
    // Default $30,000 of $150,000: text runs rightwards, away from the axis.
    expect(hereLabels(container)[0]).toHaveAttribute('text-anchor', 'start');

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '120000' } },
    );
    // Near the right edge it runs leftwards instead, or it would be clipped.
    expect(hereLabels(container)[0]).toHaveAttribute('text-anchor', 'end');
  });

  it('names both halves of the axis figure, and moves the one its slider owns', () => {
    const { container } = render(<App />);
    const figures = (): string => hereLabelLines(container).slice(1).join(' ');
    expect(figures()).toBe('$24,852 SS + $30,000 other');

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '60000' } },
    );
    expect(figures()).toBe('$24,852 SS + $60,000 other');

    // And the benefit is the half the *other* slider owns. Raising it carries
    // the whole axis right — both ends of the domain are the benefit plus
    // something — so the marker keeps its place on screen while the figures
    // under it all change. That standstill is exactly why the label has to
    // name both halves: nothing about the picture says a benefit moved.
    const before = herePositions(container)[0];
    // recharts lifts tick labels out of the axis layer, so they are found by
    // their own class rather than under `.recharts-xAxis`.
    const firstTick = (): string | null =>
      container.querySelector('.recharts-cartesian-axis-tick-value')
        ?.textContent ?? null;
    const tickBefore = firstTick();
    fireEvent.change(
      screen.getByRole('slider', { name: /annual social security benefit/i }),
      { target: { value: '36000' } },
    );
    expect(figures()).toBe('$36,000 SS + $60,000 other');
    expect(herePositions(container)[0]).toBe(before);
    expect(firstTick()).not.toBe(tickBefore);
  });
});


/**
 * Every number the plot is drawn with, read back off the SVG.
 *
 * `CHART` in palette.ts is the page's scales written a second time, because
 * an SVG `stroke-width` is an attribute and an attribute cannot hold a
 * `var(--…)`. A second copy of anything drifts, and the way this one drifts is
 * not by someone rewriting it: it is by an `11` or a `2` typed into the chart
 * being edited, which from inside that chart looks like nothing at all. That
 * is how the page arrived here — 11px labels under 15px ticks, a 1px IRMAA
 * cliff beside a 2px marker, and a half-opaque wash whose real alpha was 0.3
 * because recharts had multiplied it by its own default.
 *
 * So the claims below are made about the rendered surface rather than about
 * the source: they read the attributes a browser would paint from, which is
 * the only place the scale is either kept or lost.
 */
const chartSvgs = (container: HTMLElement): SVGElement[] =>
  Array.from(container.querySelectorAll('.recharts-wrapper svg'));

/** Every value of one attribute across the plot, deduplicated. */
const drawnWith = (container: HTMLElement, attribute: string): string[] => [
  ...new Set(
    chartSvgs(container).flatMap((svg) =>
      Array.from(svg.querySelectorAll(`[${attribute}]`)).map(
        (el) => el.getAttribute(attribute) as string,
      ),
    ),
  ),
];

/** The same, for one kind of element. */
const drawnOn = (
  container: HTMLElement,
  selector: string,
  attribute: string,
): string[] => [
  ...new Set(
    chartSvgs(container).flatMap((svg) =>
      Array.from(svg.querySelectorAll(selector)).map(
        (el) => el.getAttribute(attribute) as string,
      ),
    ),
  ),
];

describe('the chart register', () => {
  it('says every word in the plot at one size', () => {
    const { container } = render(<App />);
    expect(chartSvgs(container)).toHaveLength(1);

    const sizes = drawnWith(container, 'font-size');
    // Guards the extractor: a plot that rendered no text would pass vacuously.
    expect(
      container.querySelectorAll('.recharts-cartesian-axis-tick-value').length,
    ).toBeGreaterThan(5);

    expect(sizes).toEqual([String(CHART.label)]);
  });

  it('draws every line at one of three weights', () => {
    const { container } = render(<App />);

    expect(drawnWith(container, 'stroke-width').sort()).toEqual(
      [CHART.hairline, CHART.line, CHART.rule].map(String).sort(),
    );
  });

  it('spends each of the three on the thing it names', () => {
    const { container } = render(<App />);

    expect(drawnOn(container, '.recharts-area-curve', 'stroke-width')).toEqual([
      String(CHART.line),
    ]);
    expect(
      drawnOn(container, '.recharts-reference-line-line', 'stroke-width'),
    ).toEqual([String(CHART.rule)]);
    expect(
      drawnOn(container, '.recharts-cartesian-grid line', 'stroke-width'),
    ).toEqual([String(CHART.hairline)]);
  });

  /**
   * The grid was dashed and drew both ways, so the plot carried a set of
   * vertical dashes that mean nothing — directly across the dashed cliffs and
   * the dashed marker, which are the lines that do. Horizontal only is what
   * leaves a vertical line on this page saying one thing.
   */
  it('rules the plot one way, so a vertical line still means something', () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll('.recharts-cartesian-grid-horizontal')).toHaveLength(1);
    expect(container.querySelectorAll('.recharts-cartesian-grid-vertical')).toHaveLength(0);
    // Only the reader's own marker is dashed on the page as it opens; the
    // cliff lines are behind their own switch, and each is a `4 4`.
    expect(drawnWith(container, 'stroke-dasharray').sort()).toEqual(['6 4']);
  });

  /**
   * The gradient runs from `CHART.fill` down to nothing, so the wash under the
   * curve is the one token rather than a number typed into this chart.
   */
  it('washes every fill at one alpha', () => {
    const { container } = render(<App />);

    expect(drawnWith(container, 'stop-opacity').sort()).toEqual(
      ['0', String(CHART.fill)].sort(),
    );
    // recharts would otherwise multiply the stop above by its own 0.6.
    expect(drawnOn(container, '.recharts-area-area', 'fill-opacity')).toEqual(['1']);
  });
});

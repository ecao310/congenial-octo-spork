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

/**
 * The app opens on `defaultTaxYear()`, which follows the wall calendar. Every
 * dollar figure in the comments below is a 2026 one, and one assertion here
 * turns on the year outright — the 400% poverty-line cliff exists in 2026 and
 * did not exist in 2025 — so the clock is pinned rather than left to drift
 * onto whatever Rev. Proc. the calendar reaches next.
 */
const PINNED_YEAR = 2026;

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

describe('IRMAA cliffs on the ordinary-income chart', () => {
  it('draws one labelled reference line per cliff inside the x-axis', () => {
    const { container } = render(<App />);
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
    fireEvent.click(
      screen.getByRole('radio', { name: 'Married Filing Separately' }),
    );
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
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // A joint tier-1 threshold is past a $150,000 axis, so nothing is drawn.
    expect(cliffPositions(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // Claiming the senior deduction stretches the axis to $250,000 to fit a
    // phaseout that ends at $228,876 of other income, and the first cliff, at
    // $196,876, is inside it. The second, at $252,876, misses by $2,876 — the
    // axis is sized by what the curve does, and cliffs ride along or they do
    // not.
    expect(cliffPositions(container)).toHaveLength(1);
    expect(screen.getByText('IRMAA 1')).toBeInTheDocument();
    expect(screen.queryByText('IRMAA 2')).not.toBeInTheDocument();
  });

  it('drops the lines entirely when no cliff fits on the axis', () => {
    const { container } = render(<App />);
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // 36B(c)(2)(B): nobody eligible for Medicare is eligible for the credit.
    expect(subsidyPositions(container)).toHaveLength(0);
    expect(screen.queryByText('400% FPL')).not.toBeInTheDocument();
    // The red ones are still there — this is the reader they are about.
    expect(cliffPositions(container).length).toBeGreaterThan(0);
  });

  it('keeps it for a joint return with one spouse still under 65', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    // One spouse over, one under: the return stands in front of both cliffs at
    // once, which is the case the per-person rule exists for.
    expect(subsidyPositions(container)).toHaveLength(1);
    expect(cliffPositions(container)).toHaveLength(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    expect(subsidyPositions(container)).toHaveLength(0);
  });

  it('drops the line on a 2025 return, where the law had no cliff', () => {
    const { container } = render(<App />);
    expect(subsidyPositions(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: '2025' }));
    // ARPA 9661, extended through 2025 by the IRA, capped the household's own
    // share at 8.5% of income at every income level — so there was no line.
    expect(subsidyPositions(container)).toHaveLength(0);
    fireEvent.click(screen.getByRole('radio', { name: '2026' }));
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
      const label = Array.from(
        chart.querySelectorAll<SVGTextElement>('text.recharts-label'),
      ).find((t) => t.textContent === 'You are here');
      if (!label) throw new Error('a chart has no “you are here” label');
      return label;
    });

  it('puts one labelled marker on each of the three charts', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.recharts-wrapper')).toHaveLength(3);
    expect(herePositions(container)).toHaveLength(3);
    expect(hereLabels(container).map((t) => t.textContent)).toEqual([
      'You are here',
      'You are here',
      'You are here',
    ]);
    // Each marker wears the colour of the control that drives it — amber for
    // other income, emerald for gains — which is what lets the readout under
    // each one point at "the dashed amber line" and be understood. Step 4's is
    // amber again because it stands on the same axis at the same figure: it is
    // the near edge of the conversion band, not a place of its own.
    expect(
      Array.from(
        container.querySelectorAll('.recharts-reference-line.here-line line'),
      ).map((line) => line.getAttribute('stroke')),
    ).toEqual(['#f59e0b', '#34d399', '#f59e0b']);
  });

  it('moves each marker with its own slider, and only its own', () => {
    const { container } = render(<App />);
    const [torpedo, gains] = herePositions(container);

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '90000' } },
    );
    // $30,000 to $90,000 on a $150,000 axis: right, and a long way.
    expect(herePositions(container)[0]).toBeGreaterThan(torpedo);
    expect(herePositions(container)[1]).toBeCloseTo(gains, 6);

    fireEvent.change(
      screen.getByRole('slider', {
        name: /long-term capital gains inside that income/i,
      }),
      { target: { value: '50000' } },
    );
    expect(herePositions(container)[1]).toBeGreaterThan(gains);
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
});


/**
 * Step 4 draws the conversion on step 2's own curve: a shaded band from the
 * reader's own income out to the ceiling, closed by a dashed line at the far
 * end. That is what puts a ceiling quoted in taxable income, provisional
 * income or MAGI onto an axis that is none of the three — the conversion is
 * the distance between them, measured in other income.
 *
 * The clock is not pinned in this file, so nothing below asserts a dollar
 * figure: the shapes are what matter, and they hold in every year.
 */
describe('the conversion band on step 4’s chart', () => {
  const band = (container: HTMLElement): SVGPathElement | null =>
    container.querySelector(
      '.recharts-reference-area.conversion-band .recharts-reference-area-rect',
    );

  /** The band's left and right pixel edges. */
  const bandEdges = (container: HTMLElement): [number, number] => {
    const rect = band(container);
    if (!rect) throw new Error('no conversion band drawn');
    const left = Number(rect.getAttribute('x'));
    return [left, left + Number(rect.getAttribute('width'))];
  };

  const ceilingPosition = (container: HTMLElement): number[] =>
    positionsOf(container, '.recharts-reference-line.ceiling-line');

  const pickCeiling = (label: RegExp): void => {
    fireEvent.click(screen.getByRole('radio', { name: label }));
  };

  it('runs from the reader’s own marker out to the ceiling line', () => {
    const { container } = render(<App />);
    const [left, right] = bandEdges(container);
    // The near edge is the reader's marker on step 4's chart — the third one,
    // in page order — and the far edge is the line that closes the band.
    expect(left).toBeCloseTo(herePositions(container)[2], 1);
    expect(ceilingPosition(container)).toHaveLength(1);
    expect(ceilingPosition(container)[0]).toBeCloseTo(right, 1);
    expect(right).toBeGreaterThan(left);
  });

  it('labels the line with the conversion it closes', () => {
    const { container } = render(<App />);
    const label = Array.from(
      container.querySelectorAll<SVGTextElement>('text.recharts-label'),
    ).find((t) => /converted$/.test(t.textContent ?? ''));
    expect(label?.textContent).toMatch(/^\$[\d,]+ converted$/);
  });

  it('grows the band when a further-out line is picked', () => {
    const { container } = render(<App />);
    const [, near] = bandEdges(container);
    pickCeiling(/^Top of the 22% bracket/);
    const [, far] = bandEdges(container);
    expect(far).toBeGreaterThan(near);
  });

  /**
   * The default return is already past the 50% base, so there is no room under
   * it and nothing to shade. Drawing a zero-width band and a line on top of
   * the marker would read as a conversion of nothing rather than as no
   * conversion at all.
   */
  it('draws neither band nor line when nothing fits', () => {
    const { container } = render(<App />);
    pickCeiling(/^Social Security 50% base/);
    expect(band(container)).toBeNull();
    expect(ceilingPosition(container)).toHaveLength(0);
    // The marker stays: the reader is still standing somewhere.
    expect(herePositions(container)).toHaveLength(3);
  });

  /**
   * Both edges are on the same axis as step 2's chart, so moving the income
   * that step 2 sets moves the whole band — the near edge because that is
   * where the reader now stands, the far edge because there is less room left
   * under the same line.
   */
  it('slides the near edge with step 2’s income slider', () => {
    const { container } = render(<App />);
    const [left, right] = bandEdges(container);
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(not social security\)/i }),
      { target: { value: '0' } },
    );
    const [movedLeft, movedRight] = bandEdges(container);
    // Standing further left leaves more room under the same line, so the band
    // starts earlier and finishes wider.
    expect(movedLeft).toBeLessThan(left);
    expect(movedRight - movedLeft).toBeGreaterThan(right - left);
  });
});

/**
 * Every number the three plots are drawn with, read back off the SVG.
 *
 * `CHART` in palette.ts is the page's scales written a second time, because
 * an SVG `stroke-width` is an attribute and an attribute cannot hold a
 * `var(--…)`. A second copy of anything drifts, and the way this one drifts is
 * not by someone rewriting it: it is by an `11` or a `2` typed into whichever
 * chart is being edited, which from inside that chart looks like nothing at
 * all. That is how the page arrived here — 11px labels under 15px ticks, a
 * 1px IRMAA cliff beside a 2px marker, and a half-opaque wash whose real
 * alpha was 0.3 because recharts had multiplied it by its own default.
 *
 * So the claims below are made about the rendered surface rather than about
 * the source: they read the attributes a browser would paint from, which is
 * the only place the scale is either kept or lost.
 */
const chartSvgs = (container: HTMLElement): SVGElement[] =>
  Array.from(container.querySelectorAll('.recharts-wrapper svg'));

/** Every value of one attribute across all three plots, deduplicated. */
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
    expect(chartSvgs(container)).toHaveLength(3);

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
   * The grid was dashed and drew both ways, so every plot carried a set of
   * vertical dashes that mean nothing — on step 2, directly across the dashed
   * cliffs and the dashed marker, which are the lines that do. Horizontal
   * only is what leaves a vertical line on this page saying one thing.
   */
  it('rules the plot one way, so a vertical line still means something', () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll('.recharts-cartesian-grid-horizontal')).toHaveLength(3);
    expect(container.querySelectorAll('.recharts-cartesian-grid-vertical')).toHaveLength(0);
    expect(drawnWith(container, 'stroke-dasharray').sort()).toEqual(['4 4', '6 4']);
  });

  /**
   * The gradient runs from `CHART.fill` down to nothing, and step 4's band is
   * flat at the same alpha — so the wash under a curve and the wash behind
   * one are the same weight, which is the whole reason there is one token
   * rather than two numbers.
   */
  it('washes every fill at one alpha', () => {
    const { container } = render(<App />);

    expect(drawnWith(container, 'stop-opacity').sort()).toEqual(
      ['0', String(CHART.fill)].sort(),
    );
    expect(
      drawnOn(container, '.recharts-reference-area-rect', 'fill-opacity'),
    ).toEqual([String(CHART.fill)]);
    // recharts would otherwise multiply the stop above by its own 0.6.
    expect(drawnOn(container, '.recharts-area-area', 'fill-opacity')).toEqual(['1']);
  });
});

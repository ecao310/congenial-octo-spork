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

/** The x-coordinates of a selection of reference lines, left to right. */
const positionsOf = (root: ParentNode, selector: string): number[] =>
  Array.from(root.querySelectorAll(`${selector} .recharts-reference-line-line`))
    .map((line) => Number(line.getAttribute('x1')));

/**
 * The x-coordinates of the IRMAA cliff lines on the first chart.
 *
 * Scoped to that chart rather than the whole page: it is the only one drawing
 * cliffs today, but the tabs that did so too are coming back, and an unscoped
 * query would then pick up more than one chart's worth. Scoped away from the
 * "you are here" marker too, which is a reference line on both charts and
 * would otherwise be counted as a fourth cliff.
 */
const cliffPositions = (container: HTMLElement): number[] => {
  const ordinaryIncomeChart = container.querySelector('.recharts-wrapper');
  if (!ordinaryIncomeChart) throw new Error('no chart rendered');
  return positionsOf(
    ordinaryIncomeChart,
    '.recharts-reference-line:not(.here-line)',
  );
};

/** Where the reader's own marker stands on each chart, torpedo then gains. */
const herePositions = (container: HTMLElement): number[] =>
  positionsOf(container, '.recharts-reference-line.here-line');

describe('IRMAA cliffs on the ordinary-income chart', () => {
  it('draws one labelled reference line per cliff inside the x-axis', () => {
    const { container } = render(<App />);
    // Cliffs 4 and 5 need $200,000 and $500,000 of MAGI, past the chart.
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
    // $394,000 of MAGI, so exactly one line survives — the fourth.
    expect(screen.getByText('IRMAA 4')).toBeInTheDocument();
    expect(screen.queryByText(/^IRMAA [1235]$/)).not.toBeInTheDocument();
    const positions = cliffPositions(container);
    expect(positions).toHaveLength(1);

    // It sits at $85,845 of other income: $106,000 of MAGI less the $20,155.20
    // of benefits already in AGI. A single filer's *first* cliff shares that
    // $106,000 threshold and — both being far past the 85% cap by then — lands
    // in exactly the same place. What differs is the price of crossing it:
    // $1,052.40 a year for the single filer, $5,826 for the separate one.
    fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
    expect(cliffPositions(container)[0]).toBeCloseTo(positions[0], 6);
    expect(screen.getByText('IRMAA 1')).toBeInTheDocument();
  });

  it('drops the lines entirely when no cliff fits on the axis', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The joint tier-1 threshold is $212,000 of MAGI — off the right edge.
    expect(cliffPositions(container)).toHaveLength(0);
    expect(screen.queryByText(/^IRMAA \d$/)).not.toBeInTheDocument();
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

  it('puts one labelled marker on each of the two charts', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.recharts-wrapper')).toHaveLength(2);
    expect(herePositions(container)).toHaveLength(2);
    expect(hereLabels(container).map((t) => t.textContent)).toEqual([
      'You are here',
      'You are here',
    ]);
    // Each marker wears the colour of the slider that drives it — amber for
    // other income, emerald for gains — which is what lets the readout under
    // each slider point at "the dashed amber line" and be understood.
    expect(
      Array.from(
        container.querySelectorAll('.recharts-reference-line.here-line line'),
      ).map((line) => line.getAttribute('stroke')),
    ).toEqual(['#f59e0b', '#34d399']);
  });

  it('moves each marker with its own slider, and only its own', () => {
    const { container } = render(<App />);
    const [torpedo, gains] = herePositions(container);

    fireEvent.change(
      screen.getByRole('slider', { name: /other ordinary income/i }),
      { target: { value: '90000' } },
    );
    // $30,000 to $90,000 on a $150,000 axis: right, and a long way.
    expect(herePositions(container)[0]).toBeGreaterThan(torpedo);
    expect(herePositions(container)[1]).toBeCloseTo(gains, 6);

    fireEvent.change(
      screen.getByRole('slider', {
        name: /long-term capital gains you plan to realize/i,
      }),
      { target: { value: '50000' } },
    );
    expect(herePositions(container)[1]).toBeGreaterThan(gains);
  });

  it('stands at the reader’s own fraction of the axis', () => {
    const { container } = render(<App />);
    const at = (value: number): number => {
      fireEvent.change(
        screen.getByRole('slider', { name: /other ordinary income/i }),
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
      screen.getByRole('slider', { name: /other ordinary income/i }),
      { target: { value: '120000' } },
    );
    // Near the right edge it runs leftwards instead, or it would be clipped.
    expect(hereLabels(container)[0]).toHaveAttribute('text-anchor', 'end');
  });
});

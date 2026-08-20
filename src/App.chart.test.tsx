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

/** The x-coordinates of the reference lines drawn on the first chart. */
const cliffPositions = (container: HTMLElement): number[] =>
  Array.from(container.querySelectorAll('.recharts-reference-line-line')).map(
    (line) => Number(line.getAttribute('x1')),
  );

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

import { afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PAGE_TAX_YEAR, TAX_YEAR_PARAMS } from '../lib/tax';

/**
 * What every test that renders the whole page needs before it can assert
 * anything: the year's two benefit figures, a stopped clock, and the two
 * readings of the rendered markup that more than one file makes.
 *
 * `App.test.tsx` was a single 2,700-line file and carried these at its head.
 * Splitting it into the page, the chart's thresholds and the close left them
 * with three readers, which is what moved them here.
 */

/**
 * The page prices `PAGE_TAX_YEAR` and offers no way to change it, so every
 * figure asserted against these is a figure for that year and this is the one
 * place to re-point them from when the year moves.
 */
export const AVG_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PAGE_TAX_YEAR].avgAnnualSSBenefit;
export const MAX_ANNUAL_SS_BENEFIT = TAX_YEAR_PARAMS[PAGE_TAX_YEAR].maxAnnualSSBenefit;

/**
 * Pins the clock for one test file.
 *
 * Nothing on the page reads `Date` any more, but a stopped clock is what keeps
 * a future figure derived from `defaultTaxYear()` — the engine's own default,
 * which does follow the calendar — from making these assertions depend on the
 * day they are run.
 */
export function pinPageYear(): void {
  beforeEach(() => {
    // Date only: React Testing Library needs the real setTimeout.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${PAGE_TAX_YEAR}-07-01T00:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

/**
 * The line that closes step 1 by naming the return every later step prices.
 * The year, the status, the ages and the benefit are each in their own
 * element, so these tests read the whole sentence rather than one text node.
 */
export const scenarioRecap = (): HTMLElement =>
  screen.getByText(/^One year’s return:/);

/** Set the filing status, which the page keeps in one place: the strip. */
export const chooseFilingStatus = (label: string): void => {
  fireEvent.click(screen.getByRole('radio', { name: label }));
};

/**
 * Every figure this app renders, in the four shapes it renders them in.
 *
 * One module rather than one per caller, because the same figure appears in
 * more than one place and has to read the same way in all of them: a rate in
 * the chart's y-axis and the same rate in the sentence under the slider, a
 * dollar figure in a tooltip and the same figure in the close. `scenarioUrl`
 * is the reason this is not simply local to the page — it has to name the
 * bound it clamped a shared link to, "$62,172" rather than "62172" — and a
 * second `Intl.NumberFormat` configured by hand is a second thing to keep in
 * step with the first.
 */

/** Whole dollars, with the sign: what every figure on the page is quoted in. */
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

/** A rate given as a fraction, rendered the way the chart axis renders it. */
export const formatPercent = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}%`;

/** A rate given as a fraction, rendered as cents lost per dollar earned. */
export const formatCents = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}¢`;

/** Short enough for an axis tick: $150,000 as `150K`. */
export const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

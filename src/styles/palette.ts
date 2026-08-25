/**
 * The colours the charts paint with, as literals, because an SVG attribute is
 * the one place on this page a `var()` cannot reach.
 *
 * Recharts paints with SVG attributes — `stroke`, `fill`, `stopColor` — and
 * while a browser will resolve `var(--accent)` in most of them, jsdom will
 * not: every chart test would then be asserting on the string `var(--accent)`
 * rather than on a colour, which is a test that cannot tell a right colour
 * from a wrong one. So the values are literals here and the two copies are
 * held together by a test instead (`the palette` in guards/styles.test.tsx),
 * which reads `:root` off disk and fails if either side moves without the
 * other.
 *
 * This is therefore a *subset* of the ground `:root` declares, and the rule
 * for what belongs is exact: a colour some chart hands to an SVG attribute.
 * `--violet` and `--emerald` are colours on this page and are not here,
 * because CSS paints both. Anything that has stopped being spent on either
 * side is deleted from both rather than kept against a use that might come
 * back.
 */
export const PALETTE = {
  /** The paper the plot is drawn on, which a marker cuts itself out of. */
  surface: '#f7f3eb',
  /** Hairlines — the grid, and the rule between the tooltip's sections. */
  edge: '#c9c3ba',
  /** The one edge drawn in ink: an axis, which frames the plot. */
  edgeStrong: '#261d16',

  /** Tick labels, and the rule a hover draws down the plot. */
  inkMuted: '#6c6158',

  /** The ordinary-income rate curve, and the hatching under it. */
  accent: '#2769b7',

  /** The "you are here" marker. */
  amber: '#b76100',
  /** What the return owes in total, which is a different quantity from a rate. */
  orange: '#b64700',
  /** A Medicare IRMAA cliff. */
  rose: '#c03a51',
  roseBright: '#9d1135',
  /** The 400% FPL cliff: the same kind of thing, for a reader not yet on Medicare. */
  fuchsia: '#a644a0',
  fuchsiaBright: '#852381',
} as const;

/**
 * The chart's own measures, in the one form an SVG attribute can take.
 *
 * Same argument as `PALETTE` above, made about numbers instead of colours: a
 * `stroke-width` and a `font-size` on an SVG element are attributes, and an
 * attribute holds a number rather than a `var(--…)` the browser resolves. So
 * the page's scales — which everywhere else live in `:root` and are held
 * closed by `the type scale` in guards/styles.test.tsx — have to be written a
 * second time here for the chart to spend them.
 *
 * `the chart register` in App.chart.test.tsx holds it closed, by reading the
 * numbers back off the rendered SVG rather than off this file: a `font-size`
 * or a `stroke-width` that is not one of these fails there.
 */
export const CHART = {
  /**
   * Every word the plot says: a tick label, a cliff's name. 13px is
   * `0.8125rem` on the page's type scale — the caption step — which is what
   * the caption under the plot is already set in, so the chart and its notes
   * read at one size.
   */
  label: 13,

  /** A curve: the one line in the plot that is the data. */
  line: 3,
  /** A reference line: a cliff, the marker. Dashed, and drawn heavier than
      the mesh because each one is a fact about the return. */
  rule: 2,
  /** The grid, the axis, and each stroke of the hatching. */
  hairline: 1,

  /**
   * The hatching under the curve: an engraver's diagonal in the curve's own
   * blue, at this alpha. A hatch rather than a wash because a broadsheet's
   * plot is drawn in lines, and because a wash over warm paper reads as a
   * second area rather than a tint of the first.
   */
  fill: 0.3,

  /**
   * The gutter the y-axis takes out of the plot's left edge, which
   * `--chart-axis` sets a second time so the caption and the slider under
   * the plot can start where the plot area does. The widest label this axis
   * draws is `100%`.
   */
  axis: 44,
} as const;

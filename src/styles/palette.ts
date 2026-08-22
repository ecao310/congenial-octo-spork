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
 * back — `--indigo`, `--indigo-bright` and `--lime` were kept that way, for
 * two steps that came off the page, and were three entries a reader could not
 * account for on either side of the split.
 */
export const PALETTE = {
  /** The ground the plot is drawn on, which a marker cuts itself out of. */
  surface: '#1a1a1b',
  /** Hairlines — the grid, the tooltip's border, the rule between its sections. */
  edge: '#343940',
  /** The one edge drawn heavier than the mesh: an axis, which frames the plot. */
  edgeStrong: '#4a5059',

  /** Tick labels, and the rule a hover draws down the plot. */
  inkMuted: '#9799ae',

  /** The ordinary-income rate curve, and the fill under it. */
  accent: '#409dff',

  /** The "you are here" marker. */
  amber: '#f59e0b',
  /** What the return owes in total, which is a different quantity from a rate. */
  orange: '#f97316',
  /** A Medicare IRMAA cliff. */
  rose: '#f43f5e',
  roseBright: '#fb7185',
  /** The 400% FPL cliff: the same kind of thing, for a reader not yet on Medicare. */
  fuchsia: '#e879f9',
  fuchsiaBright: '#f0abfc',
} as const;

/**
 * The chart's own measures, in the one form an SVG attribute can take.
 *
 * Same argument as `PALETTE` above, made about numbers instead of colours: a
 * `stroke-width` and a `font-size` on an SVG element are attributes, and an
 * attribute holds a number rather than a `var(--…)` the browser resolves. So
 * the page's scales — which everywhere else live in `:root` and are held
 * closed by `the type scale` and `the corners` in guards/styles.test.tsx —
 * have to be written a second time here for the chart to spend them.
 *
 * The register is FI Calc's: 13px labels, 3px curves, and a grid that is a
 * hairline mesh rather than a set of dashes competing with the dashed lines
 * that actually mean something on this page. Before this, every one of these
 * numbers was typed into whichever chart was being edited — 11px labels
 * against 15px ticks, 2px curves, 1px cliffs beside a 2px marker, and a
 * half-opaque wash under every curve.
 *
 * `the chart register` in App.chart.test.tsx holds it closed, by reading the
 * numbers back off the rendered SVG rather than off this file: a `font-size`
 * or a `stroke-width` that is not one of these fails there.
 */
export const CHART = {
  /**
   * Every word the plot says: a tick label, a cliff's name, the marker's.
   * 13px is `0.8125rem` on the page's type scale — the caption step — which
   * is what the axis label and the key under the plot are already set in, so
   * the chart and its notes read at one size.
   */
  label: 13,

  /** A curve: the one line in the plot that is the data. */
  line: 3,
  /** A reference line: a cliff, the marker, the ceiling. Dashed, and drawn
      heavier than the mesh because each one is a fact about the return. */
  rule: 2,
  /** The grid and the axis. */
  hairline: 1,

  /**
   * The wash under a curve, and the conversion band behind one. It was 0.5,
   * which over a near-black ground is a second area rather than a tint of the
   * first — the fill read as loud as the 2px line drawing it.
   *
   * Each `<Area>` sets `fillOpacity={1}` beside its gradient so that this is
   * the alpha rather than a factor of it: recharts defaults an area's fill to
   * 0.6 opaque and multiplies the stop by it, so 0.5 was really 0.3 and the
   * number in the source was one nobody could read off the screen.
   */
  fill: 0.2,

  /**
   * The gutter the y-axis takes out of the plot's left edge, which
   * `--chart-axis` sets a second time so the axis label, the key and the
   * caption underneath can start where the plot area does. It was 70px, sized
   * for 15px ticks; the widest label this axis draws is `100%`.
   */
  axis: 44,
} as const;

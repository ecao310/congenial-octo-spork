/**
 * The same palette `:root` declares in `index.css`, in the one form a chart
 * can read.
 *
 * Recharts paints with SVG attributes — `stroke`, `fill`, `stopColor` — and
 * while a browser will resolve `var(--accent)` in most of them, jsdom will
 * not: every chart test would then be asserting on the string `var(--accent)`
 * rather than on a colour, which is a test that cannot tell a right colour
 * from a wrong one. So the values are literals here and the two copies are
 * held together by a test instead (`the palette` in styles.test.tsx), which
 * reads `:root` off disk and fails if either side moves without the other.
 *
 * Only the names the charts and tooltips actually use are here. A token that
 * is only ever a CSS colour stays in CSS.
 */
export const PALETTE = {
  /** The tooltip's own surface: it floats over the plot rather than sits in it. */
  surfaceRaised: '#202124',
  /** Hairlines — the tooltip's border and the rule between its sections. */
  edge: '#343940',

  /** A tooltip's heading. */
  inkBright: '#f1f1fd',
  /** Axis lines, tick labels, and a tooltip's own prose. */
  inkMuted: '#9799ae',

  /** The ordinary-income rate curve, and the fill under it. */
  accent: '#409dff',

  /** The "you are here" marker, and step 3's own curve. */
  amber: '#f59e0b',
  /** What the return owes in total, which is a different quantity from a rate. */
  orange: '#f97316',
  /** A Medicare IRMAA cliff. */
  rose: '#f43f5e',
  roseBright: '#fb7185',
  /** The 400% FPL cliff: the same kind of thing, for a reader not yet on Medicare. */
  fuchsia: '#e879f9',
  fuchsiaBright: '#f0abfc',
  /** Step 4's conversion band and the ceiling that closes it. */
  indigo: '#818cf8',
  indigoBright: '#a5b4fc',
  /** The taxable share of the benefit. */
  violet: '#a78bfa',
  /** Where the reader stands on the gains axis. */
  emerald: '#34d399',
  /** The 0% long-term gain band. */
  lime: '#a3e635',
} as const;

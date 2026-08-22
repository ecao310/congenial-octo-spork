/**
 * Rounds to whole cents, so premium arithmetic does not leak float dust.
 *
 * Shared by Medicare's premiums and by 36B's capped contribution, which are the
 * two figures in this directory quoted to the cent rather than to the dollar:
 * both are money somebody is actually billed, where a tax figure is rounded to
 * whole dollars on the return itself.
 *
 * Deliberately not applied to anything the rate curve reads. `marginalRateCurve`
 * takes a marginal rate off a one-dollar difference in `totalTax`, so half a
 * cent of rounding inside that figure would be half a percentage point on the
 * chart.
 */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

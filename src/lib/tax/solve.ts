/**
 * The one solver every income axis on this page is placed with.
 *
 * Bisects a monotonically non-decreasing function of other income for the
 * first point at which it reaches `target`.
 *
 * Every income definition on this page — provisional income, AGI, Medicare's
 * MAGI, 36B's household income — rises with other income at a slope of 1, 1.5
 * or 1.85 depending on which part of the torpedo the dollar lands in, and never
 * falls. That is enough for bisection to invert them exactly; a closed form
 * would need one case per segment of one function, and this app has four of
 * them.
 *
 * `high` has to be an income the target is certainly reached by, and every
 * caller has one to hand: three of the four solve against a MAGI that is never
 * below other income, so the target itself overshoots.
 *
 * It lives on its own, importing nothing, because the four callers sit in three
 * different modules and each of them would otherwise carry a copy — which is
 * how the Medicare one came to have its own inline loop, identical to this to
 * the iteration count.
 */
export function otherIncomeAt(
  target: number,
  high: number,
  valueAt: (income: number) => number,
): number {
  if (valueAt(0) >= target) return 0;
  let low = 0;
  let top = Math.max(0, high);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + top) / 2;
    if (valueAt(mid) < target) low = mid;
    else top = mid;
  }
  return (low + top) / 2;
}

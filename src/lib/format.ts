/**
 * Dollar formatting, shared by the page and by anything that has to describe a
 * figure from outside it.
 *
 * It lives here rather than beside the page's other formatters because
 * `scenarioUrl` has to name the bound it clamped a shared link to — "$62,172",
 * not "62172" — and a second `Intl.NumberFormat` configured by hand is a second
 * thing to keep in step with this one.
 */
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

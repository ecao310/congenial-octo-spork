/**
 * Where to read on, in the one place the footer and the test that reads the
 * footer back can both look.
 *
 * Three pieces, no more: one that covers everything the chart prices in one
 * sitting, one that derives the hump, and the publication the engine is
 * checked against. A longer list is a longer list; these are the three a
 * reader who has just walked both steps would want next, in the order they
 * would want them. Each is a title and its publisher, nothing more: a
 * publisher refreshes an article and a date or a summary on the page would go
 * stale while the link did not.
 */
export interface Reading {
  href: string;
  title: string;
  /** Who published it, as a reader would name them. */
  source: string;
}

export const FURTHER_READING: readonly Reading[] = [
  {
    href: 'https://www.fidelity.com/learning-center/personal-finance/social-security-tax-torpedo-and-hidden-taxes',
    title: 'Social Security tax torpedo and 3 other hidden taxes',
    source: 'Fidelity',
  },
  {
    href: 'https://www.kitces.com/blog/the-taxation-of-social-security-benefits-as-a-marginal-tax-rate-increase/',
    title: 'The Taxation of Social Security Benefits as a Marginal Tax Rate Increase',
    source: 'Kitces',
  },
  {
    href: 'https://www.irs.gov/publications/p915',
    title: 'Publication 915: Social Security and Equivalent Railroad Retirement Benefits',
    source: 'IRS',
  },
];

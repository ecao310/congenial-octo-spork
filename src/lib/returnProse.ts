import type { FilingStatus } from './tax';
import { formatCurrency } from './format';

/**
 * How a return is described in words, in the one place every description of it
 * can read.
 *
 * Each of these is said in at least two places — on the page and in the live
 * region that reads the same thing aloud, or in step 1's recap and again in
 * the close — and two hand-written copies are two chances to describe two
 * different returns.
 */

/**
 * How each status is labelled on the strip that asks for it.
 *
 * The labels are here and the values are `FILING_STATUSES`, which is also what
 * a link is read against — one list, so the strip and the address bar cannot
 * disagree about what is on offer.
 */
export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
};

/** How each status reads inside a sentence. */
export const FILING_STATUS_PROSE: Record<FilingStatus, string> = {
  single: 'a single filer',
  mfj: 'a married couple filing jointly',
};

/**
 * How the age toggles read inside a sentence. A joint return has three answers
 * rather than two, because one qualifying spouse and two are different returns
 * — one senior deduction against two, and the standard-deduction addition once
 * against twice.
 */
export const ageProse = (
  seniors: number,
  filingStatus: FilingStatus,
): string =>
  seniors === 0
    ? 'under 65'
    : filingStatus !== 'mfj'
      ? '65 or older'
      : seniors === 2
        ? 'both spouses 65 or older'
        : 'one spouse 65 or older';

/** One advanced input that has been moved off $0, named both ways it is named. */
export interface AdvancedInput {
  /** The short name the summary strip has room for. */
  label: string;
  /** The one a return is described with, in a sentence with no control beside it. */
  noun: string;
  value: number;
}

/**
 * The inputs that are not opened with, and are not at $0.
 *
 * Each starts at $0, and at $0 each is a no-op: the chart prices the identical
 * scenario whether the section holding them is open or shut. That is the whole
 * test for what belongs behind that disclosure — year, filing status, age,
 * benefit and other income all change the picture on load, so they stay out.
 * What it costs is that a slider you cannot see is a slider you forget, which
 * is why anything moved off $0 is named twice over — in the strip beside the
 * section's own summary, and in the recap that closes the step — and stays
 * named while the section is closed.
 */
export const advancedInputs = (muniInterest: number): AdvancedInput[] =>
  [
    {
      label: 'Muni interest',
      noun: 'municipal interest',
      value: muniInterest,
    },
  ].filter(({ value }) => value > 0);

/** That set as a sentence, for the live region: "$3,750 in municipal interest". */
export const advancedProse = (inputs: AdvancedInput[]): string =>
  joinProse(inputs.map(({ noun, value }) => `${formatCurrency(value)} in ${noun}`));

/**
 * The separator that goes before item `i` of an `n`-item English list: nothing,
 * then ", ", then " and " or ", and " in front of the last one.
 *
 * The recap that closes step 1 is a list whose length is however many of a
 * return's facts are non-zero, and it is written twice — once as marks on the
 * page with the figures bolded, once flat for the live region to read out. Two
 * hand-rolled joins would be two chances for the two to disagree about a comma,
 * so both of them ask this.
 */
export const listSeparator = (i: number, n: number): string =>
  i === 0 ? '' : i < n - 1 ? ', ' : n > 2 ? ', and ' : ' and ';

/** The list as flat text, for anything read aloud rather than looked at. */
export function joinProse(parts: string[]): string {
  return parts.map((part, i) => listSeparator(i, parts.length) + part).join('');
}

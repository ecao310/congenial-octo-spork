/**
 * The return, written into the address bar and read back out of it.
 *
 * Every figure on the page is derived from ten values, and until now all ten
 * lived only in React state: a refresh threw the return away and there was
 * nothing to send to a spouse or an advisor. Putting them in the query string
 * fixes both at once, because the address bar is already the share surface
 * every reader knows how to use. Every value it carries prices something: a
 * link is the return, and nothing that changes no figure belongs in it.
 *
 * Three decisions are worth writing down, since the encoding itself is
 * trivial and these are not.
 *
 * **The step is not in the link.** It is where the reader is looking, not what
 * the return holds, and the page already names places a better way: every
 * step is mounted and every section carries an `id`, so `#step-conversion` is
 * a fragment the browser scrolls to on its own. The query string says what the
 * return *is*; the fragment says where on the page to stand. Putting the step
 * in the query string would also make the one control that changes nothing
 * about the return the one control that rewrites the address.
 *
 * **A year this page cannot price loses.** `TAX_YEARS` is what there are
 * published figures for, and a link naming anything else — a 2024 link opened
 * after 2024 fell off the list, a typo, a hand-edited URL — gets
 * `defaultTaxYear()` and a note saying so. The alternative, refusing to render,
 * would trade a page priced for the wrong year against no page at all.
 *
 * **Writing is `replaceState`, never `pushState`.** A slider fires a change per
 * notch, so pushing would bury the back button under one entry per $500 of
 * income and make leaving the page a matter of holding it down. Replacing
 * keeps the address shareable at every instant and keeps Back meaning "the
 * page I came from".
 *
 * Everything a link carries is clamped on the way in against the same bound
 * the page's own slider would have held it inside, and every clamp says what
 * it did — see `decodeScenario`. A link is the one input this app has that it
 * did not produce itself.
 */
import {
  SS_BASES,
  defaultTaxYear,
  hasPublishedParams,
  avgAnnualSSBenefit,
  maxAnnualSSBenefit,
  qcdLimitFor,
  conversionCeilings,
} from './tax';
import type { FilingStatus, TaxYear, ConversionCeilingId } from './tax';
import { formatCurrency } from './format';

/** The whole return the page prices, and the whole of what a link carries. */
export interface PageScenario {
  year: TaxYear;
  filingStatus: FilingStatus;
  ssBenefit: number;
  ordinaryIncome: number;
  plannedLtcg: number;
  isSenior: boolean;
  spouseIsSenior: boolean;
  muniInterest: number;
  qcd: number;
  ceilingId: ConversionCeilingId;
}

/** The other income the page opens with, before the reader touches anything. */
export const DEFAULT_ORDINARY_INCOME = 30_000;

/** Roughly a $1.4M muni ladder at 2025 yields — well past any realistic retiree. */
export const MAX_MUNI_INTEREST = 50_000;

/**
 * The most other income a link may name.
 *
 * The income slider has no fixed right edge — the axis is sized to the return
 * and the slider follows it — so this bound exists only because a link can say
 * anything, and `marginalRateCurve` samples the whole axis. An unbounded
 * figure is an unbounded sweep, which is a hung tab rather than a wrong chart.
 *
 * A million clears the highest line this page draws by a comfortable margin:
 * the top IRMAA threshold is $500,000 single and $750,000 joint, and no
 * feature of any curve moves above it. See `curveStepFor` for what the sweep
 * costs out there.
 */
export const MAX_OTHER_INCOME = 1_000_000;

/**
 * The four statuses, taken from the table that has to list all of them
 * anyway. IRC 86(c) gives every filing status a provisional-income base, so
 * `SS_BASES` is the one record in the app that cannot fall out of step with
 * `FilingStatus` without failing to compile.
 */
const FILING_STATUSES = Object.keys(SS_BASES) as FilingStatus[];

/** How each status is named back to a reader whose link asked for it. */
const FILING_STATUS_SHORT: Record<FilingStatus, string> = {
  single: 'a single filer',
  mfj: 'married filing jointly',
  mfs: 'married filing separately',
  hoh: 'head of household',
};

/**
 * The six ceilings step 4 offers. Read off `conversionCeilings` rather than
 * written down again: the ids are fixed but the list is not, and a seventh
 * ceiling should not need remembering here to be linkable.
 */
const CEILING_IDS = conversionCeilings().map((c) => c.id);

/** The page as it opens, for a given tax year. */
export function defaultScenario(year: TaxYear = defaultTaxYear()): PageScenario {
  return {
    year,
    filingStatus: 'single',
    ssBenefit: avgAnnualSSBenefit(year),
    ordinaryIncome: DEFAULT_ORDINARY_INCOME,
    plannedLtcg: 0,
    isSenior: false,
    spouseIsSenior: false,
    muniInterest: 0,
    qcd: 0,
    ceilingId: 'bracket12',
  };
}

/**
 * The return as a query string, without its leading `?`.
 *
 * The year is always written and everything else only when it differs from
 * what that year opens with, so an untouched page reads `?year=2025` rather
 * than a wall of zeroes. The year is the exception because it is the one
 * default that moves on its own: `defaultTaxYear()` follows the wall calendar,
 * so a link that left it out would quietly re-price itself the January after
 * it was sent — which is the opposite of what a saved link is for.
 *
 * Leaving the benefit out when it sits at the year's average is deliberate on
 * the same reasoning turned the other way: a reader who never moved that
 * slider has expressed no opinion about the figure, so a link that changes
 * years should hand them the new year's average. It is the rule `changeYear`
 * already applies inside the page.
 */
export function encodeScenario(scenario: PageScenario): string {
  const opening = defaultScenario(scenario.year);
  const params = new URLSearchParams();
  params.set('year', String(scenario.year));
  if (scenario.filingStatus !== opening.filingStatus) {
    params.set('filing', scenario.filingStatus);
  }
  if (scenario.ssBenefit !== opening.ssBenefit) {
    params.set('ss', String(scenario.ssBenefit));
  }
  if (scenario.ordinaryIncome !== opening.ordinaryIncome) {
    params.set('income', String(scenario.ordinaryIncome));
  }
  if (scenario.plannedLtcg !== opening.plannedLtcg) {
    params.set('ltcg', String(scenario.plannedLtcg));
  }
  if (scenario.muniInterest !== opening.muniInterest) {
    params.set('muni', String(scenario.muniInterest));
  }
  if (scenario.qcd !== opening.qcd) {
    params.set('qcd', String(scenario.qcd));
  }
  if (scenario.isSenior) params.set('senior', '1');
  if (scenario.spouseIsSenior) params.set('spouse', '1');
  if (scenario.ceilingId !== opening.ceilingId) {
    params.set('ceiling', scenario.ceilingId);
  }
  return params.toString();
}

/**
 * The address to replace the current one with: the path, this return, and
 * whichever step the fragment is standing on.
 *
 * The hash is carried through rather than dropped, because `replaceState`
 * takes a whole URL and a bare `?query` would silently throw away the
 * `#step-…` the reader clicked to get here.
 */
export function scenarioUrl(
  scenario: PageScenario,
  location: { pathname: string; hash: string },
): string {
  return `${location.pathname}?${encodeScenario(scenario)}${location.hash}`;
}

export interface DecodedScenario {
  scenario: PageScenario;
  /**
   * What the link asked for that this page would not give it, in the same
   * plain words the page uses for everything else. Empty for a link this page
   * wrote itself, which is the only kind most readers will ever open.
   */
  notes: string[];
}

/**
 * Read a return out of a query string, holding every figure inside the bounds
 * the page's own controls would have held it inside.
 *
 * Nothing here throws and nothing here refuses: an unreadable value falls back
 * to what the page opens with, and every fallback and every clamp leaves a
 * note naming the bound it hit. The bound is the useful half — a reader whose
 * link was cut back to $62,172 can see that the figure was the year's maximum
 * benefit, where "we changed your link" tells them nothing.
 */
export function decodeScenario(search: string): DecodedScenario {
  const params = new URLSearchParams(search);
  const notes: string[] = [];

  /**
   * A dollar figure from the link, rounded to whole dollars and held between
   * $0 and the bound this return sets. `reason` says why the bound is where it
   * is, for the figures whose ceiling is not self-evident.
   */
  const dollars = (
    key: string,
    { fallback, max, what, reason }: {
      fallback: number;
      max: number;
      what: string;
      reason?: string;
    },
  ): number => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      notes.push(
        `This link gave ${what} as “${raw}”, which is not an amount, so it is set to ${formatCurrency(fallback)}.`,
      );
      return fallback;
    }
    const asked = Math.round(value);
    if (asked > max) {
      notes.push(
        `This link asked for ${formatCurrency(asked)} of ${what}. The most this return can carry is ${formatCurrency(max)}${reason ? ` — ${reason}` : ''}, so that is what is set.`,
      );
      return max;
    }
    if (asked < 0) {
      notes.push(
        `This link asked for ${formatCurrency(asked)} of ${what}, which cannot be less than nothing, so it is set to $0.`,
      );
      return 0;
    }
    return asked;
  };

  const flag = (key: string): boolean => params.get(key) === '1';

  const fallbackYear = defaultTaxYear();
  const rawYear = params.get('year');
  let year = fallbackYear;
  if (rawYear !== null && rawYear.trim() !== '') {
    const asked = Number(rawYear);
    if (hasPublishedParams(asked)) {
      year = asked;
    } else {
      notes.push(
        `This link is priced for ${rawYear}, which this page has no published figures for. Showing ${fallbackYear} instead — every figure below is a ${fallbackYear} one.`,
      );
    }
  }

  const rawFiling = params.get('filing');
  let filingStatus: FilingStatus = 'single';
  if (rawFiling !== null && rawFiling.trim() !== '') {
    if ((FILING_STATUSES as string[]).includes(rawFiling)) {
      filingStatus = rawFiling as FilingStatus;
    } else {
      notes.push(
        `This link names a filing status this page does not offer (“${rawFiling}”), so it is showing ${FILING_STATUS_SHORT.single}.`,
      );
    }
  }

  const ssBenefit = dollars('ss', {
    fallback: avgAnnualSSBenefit(year),
    max: maxAnnualSSBenefit(year),
    what: 'a Social Security benefit',
    reason: `the most anyone can collect in ${year}`,
  });

  const ordinaryIncome = dollars('income', {
    fallback: DEFAULT_ORDINARY_INCOME,
    max: MAX_OTHER_INCOME,
    what: 'other income',
    reason: 'past that no line on any of these charts moves',
  });

  const plannedLtcg = dollars('ltcg', {
    fallback: 0,
    max: ordinaryIncome,
    what: 'long-term capital gain',
    reason: 'a gain is a share of the other income rather than something on top of it',
  });

  const muniInterest = dollars('muni', {
    fallback: 0,
    max: MAX_MUNI_INTEREST,
    what: 'tax-exempt interest',
    reason: 'the right edge of the slider that sets it',
  });

  const qcd = dollars('qcd', {
    fallback: 0,
    max: qcdLimitFor({ filingStatus, year }),
    what: 'a charitable distribution',
    reason: `the ${year} annual limit for this return`,
  });

  const rawCeiling = params.get('ceiling');
  let ceilingId: ConversionCeilingId = 'bracket12';
  if (rawCeiling !== null && rawCeiling.trim() !== '') {
    if ((CEILING_IDS as string[]).includes(rawCeiling)) {
      ceilingId = rawCeiling as ConversionCeilingId;
    } else {
      notes.push(
        `This link sizes the conversion against a ceiling this page does not offer (“${rawCeiling}”), so step 4 is using the top of the 12% bracket.`,
      );
    }
  }

  return {
    scenario: {
      year,
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      plannedLtcg,
      isSenior: flag('senior'),
      spouseIsSenior: flag('spouse'),
      muniInterest,
      qcd,
      ceilingId,
    },
    notes,
  };
}

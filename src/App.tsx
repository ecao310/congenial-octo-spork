import { Fragment, useState, useMemo, useRef, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import {
  marginalRateCurve,
  maxAnnualSSBenefit,
  avgAnnualSSBenefit,
  SS_BASES,
  SS_BASE50_ENACTED,
  SS_BASE85_ENACTED,
  PAGE_TAX_YEAR,
  defaultTaxYear,
  filingParams,
  FilingStatus,
  incomeAxisMax,
  incomeAxisFeatures,
  MIN_INCOME_AXIS,
  standardDeductionFor,
  taxableSocialSecurity,
  totalIncomeFor,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  seniorDeductionPhaseoutEnd,
  irmaaMagi,
  irmaaFor,
  irmaaCliffs,
  irmaaMagiYear,
  IRMAA_LOOKBACK_YEARS,
  ptcCliff,
  ptcFor,
  totalFederalTax,
  acaMagi,
  fplGuidelineYear,
  FPL_GUIDELINE_LOOKBACK_YEARS,
  PTC_CLIFF_PERCENT,
} from './utils/tax';
import {
  decodeScenario,
  scenarioUrl,
  PAGE_FILING_STATUSES,
  MAX_MUNI_INTEREST,
} from './utils/scenarioUrl';
import type { PageFilingStatus, PageScenario } from './utils/scenarioUrl';
import { formatCurrency } from './utils/format';
import { CHART, PALETTE } from './palette';
import type {
  TaxYear,
  IrmaaCliff,
  PtcCliff,
} from './utils/tax';

/**
 * One worked example in two steps, in the order a reader builds it: the
 * benefit they will collect, and what the rest of their income does to it.
 * Both steps price the same return, so a figure set in step 1 is still set in
 * step 2.
 *
 * The steps stay mounted and the page scrolls, where the tab strip this
 * replaced swapped one panel for another. Three reasons to scroll: a step you
 * have to click into existence reads as optional, and these are not; step 2
 * quotes figures the reader set in step 1, which only works if scrolling back
 * to them is possible; and printing or Ctrl-F now reaches the whole page
 * rather than the open panel. What it costs is length, which a step nav and a
 * next-step box used to pay for. Both came off with the four sections that
 * made the walk long enough to need them: two steps on one scroll are not a
 * flow a reader can be lost in, and a nav offering to carry them past one
 * heading is furniture charging rent.
 *
 * Six more sections have stood here and are coming back. Four were tabs —
 * Medicare, Strategies, Over Time and State Taxes — and two were steps 3 and
 * 4, Capital Gains Stacking and Sizing the Conversion, which came off the page
 * when it narrowed to the torpedo alone. What they rendered has gone, but
 * everything they rendered *from* stays: `irmaaFor` and `niitFor` are still in
 * `utils/tax.ts`, and `ltcgRateCurve`, `conversionCeilings`, `sizeConversion`,
 * `projectYears`, `compareSequencing`, `lumpSumElection` and the state table
 * are on the shelf — every one of them still under test, every one of them
 * still exported.
 *
 * Both steps have the same shape: the chart, then the one control that says
 * where on that chart the reader is standing, then the collapsed explainers.
 * Step 1 is the exception that sets the rule —
 * it has no curve of its own, so the return itself (filing status, age)
 * stands where the chart stands on the step below it, and the benefit slider
 * follows it in the control's place.
 *
 * So the inputs are split across the steps that move them: filing status, age
 * and the benefit are step 1, and other ordinary income is step 2, being a
 * point on the axis its chart sweeps. Tax-exempt interest belongs to no axis
 * and sits in a collapsed `advanced-inputs` block at the end of step 1,
 * because it starts at $0 and at $0 leaves the chart on the page identical.
 *
 * Nothing renders off the list itself any more. It carried a nav label, a
 * heading and a blurb per step until the nav and the next-step box went, and
 * each of the three had exactly one reader; the headings the page still shows
 * are written where they are shown. What is left is the pair of facts nothing
 * else can supply — `StepId`, which the live region is keyed to, and the count
 * the step kickers number themselves out of.
 */
const STEPS = ['benefit', 'torpedo'] as const;

type StepId = (typeof STEPS)[number];

/**
 * The strip, and the two statuses that used to sit beside it.
 *
 * The page asked all four for a long time — a strip of four, then a strip of
 * two with head of household and a separate return in a menu next to it — and
 * the cost was never the row. It was everything downstream: a note under the
 * control for each, a separate return's alternate opening for the torpedo
 * explainer, its alternate IRMAA schedule sentence, its "not on this return"
 * senior deduction, and a mitigation bullet nobody else saw. Six branches of
 * prose, priced and tested to the dollar, for two returns almost nobody who
 * opens this page files.
 *
 * So the page asks the question it can answer plainly and `tax.ts` keeps all
 * four, because the tax code has four and the engine is not the page. The
 * labels are here and the values are `PAGE_FILING_STATUSES`, which is also
 * what a link is read against — one list, so the strip and the address bar
 * cannot disagree about what this page offers.
 */
const FILING_STATUS_LABELS: Record<PageFilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
};

/** How each status reads inside a sentence. */
const FILING_STATUS_PROSE: Record<PageFilingStatus, string> = {
  single: 'a single filer',
  mfj: 'a married couple filing jointly',
};

/** A rate given as a fraction, rendered the way the chart axis renders it. */
const formatPercent = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}%`;

/** A rate given as a fraction, rendered as cents lost per dollar earned. */
const formatCents = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}\u00A2`;

const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

/**
 * The point on a swept curve at the reader's own value.
 *
 * The chart prices a whole axis, so it does not move when the slider beneath
 * it moves: the reader's number is a *place* on a curve that is already drawn,
 * not an input to it. Reading the curve back at that place is what turns the
 * slider from an inert control into a position. The sweep ascends, so the last
 * sampled point at or below the value is the one — and every slider steps in a
 * multiple of what the curve beneath it samples, so in practice it is an exact
 * hit. See `curveStep`.
 */
function pointAt<P>(
  curve: P[],
  axis: (point: P) => number,
  value: number,
): P | undefined {
  let found: P | undefined;
  for (const point of curve) {
    if (axis(point) > value) break;
    found = point;
  }
  return found;
}

/**
 * The separator that goes before item `i` of an `n`-item English list:
 * nothing, then ", ", then " and " or ", and " in front of the last one.
 *
 * The recap that closes step 1 is a list whose length is however many of this
 * return's facts are non-zero, and it is written twice — once as JSX with the
 * figures bolded, once flat for the live region to read out. Two hand-rolled
 * joins would be two chances for the page and the reading to disagree about a
 * comma, so both of them ask this.
 */
const listSeparator = (i: number, n: number): string =>
  i === 0 ? '' : i < n - 1 ? ', ' : n > 2 ? ', and ' : ' and ';

/** That list as flat text, for anything being read aloud rather than looked at. */
const joinProse = (parts: string[]): string =>
  parts.map((part, i) => listSeparator(i, parts.length) + part).join('');

/** And as marks on the page, for the clauses that carry a bolded figure. */
const ProseList: React.FC<{
  items: { key: string; node: React.ReactNode }[];
}> = ({ items }) => (
  <>
    {items.map(({ key, node }, i) => (
      <Fragment key={key}>
        {listSeparator(i, items.length)}
        {node}
      </Fragment>
    ))}
  </>
);

/**
 * The dashed vertical marking the reader's own place on the chart.
 *
 * The slider under the chart is a *position* on a curve that is already
 * drawn, not an input to it, and nothing on screen said so: an "Other Income"
 * slider sitting under a chart reads as the control that draws the curve. The
 * line is what says otherwise. It takes the colour of the slider that drives
 * it — amber — so the pairing is legible without reading a word, and a heavier
 * dash than the IRMAA cliffs it shares the chart with.
 *
 * It carries no label. It used to say "You are here" and then name both halves
 * of the axis figure in three stacked lines inside the plot, which is a strip
 * of curve about 250px wide spent on words the page says twice underneath
 * anyway: the caption under the axis names the benefit that does not move, the
 * slider beside it names the income that does, and the readout below says
 * which point on the curve this is and what it costs. The line only has to
 * point at it.
 *
 * A plain function, not a component: recharts identifies its children by
 * element type, and a wrapper component would render as an unknown child.
 */
const hereLine = (value: number, colour: string) => (
  <ReferenceLine
    className="here-line"
    x={value}
    stroke={colour}
    strokeDasharray="6 4"
    strokeWidth={CHART.rule}
  />
);

/**
 * How the axis on the page's one chart is drawn, in one object rather than
 * two copies.
 *
 * Three tiers, each spending a token the page already declares: the frame is
 * `--edge-strong`, the mesh behind it is `--edge`, and the words are
 * `--ink-muted`. recharts defaults a tick label's `fill` to the axis's own
 * `stroke`, which is what made the axis line and its labels the same colour
 * before — an axis line as bright as its numbers, in a register whose whole
 * point is that chrome is quieter than content.
 *
 * `tickLine` is off because the grid already says where a tick is, and
 * `fontSize` is set on the axis rather than only on `tick` because recharts
 * measures label widths with it when it decides how many ticks fit.
 */
/**
 * What a hover draws: the rule that follows the pointer down the plot, and
 * the dot it puts on the curve.
 *
 * The one part of that chart no test here can read back, because recharts
 * decides a hover from `getBoundingClientRect` and jsdom reports every box as
 * zero — so this is the one place the register is held by having been looked
 * at rather than by an assertion. Both were recharts' own
 * defaults until now, which is to say `#ccc` and `#fff`: two colours this
 * page does not declare, and the brightest things on a plot whose whole point
 * is that chrome is quieter than content.
 *
 * The dot's ring is the page's own ground rather than a colour, so it reads
 * as the curve being cut away from under the dot rather than as a second
 * mark on top of it.
 */
const HOVER_CURSOR = {
  stroke: PALETTE.inkMuted,
  strokeWidth: CHART.hairline,
} as const;

const HOVER_DOT = {
  stroke: PALETTE.surface,
  strokeWidth: CHART.rule,
} as const;

const AXIS_PROPS = {
  stroke: PALETTE.edgeStrong,
  strokeWidth: CHART.hairline,
  fontSize: CHART.label,
  tickLine: false,
  tick: { fill: PALETTE.inkMuted },
} as const;

interface TooltipPayloadPoint {
  income: number;
  marginalRate: number;
  totalTax: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipPayloadPoint }>;
  ssBenefit: number;
  filingStatus?: FilingStatus;
  muniInterest?: number;
  /** How many people on the return are enrolled in Medicare. */
  beneficiaries?: number;
  /** Which year's premium schedule prices the IRMAA line. */
  year?: TaxYear;
}

/**
 * What one point on the curve is worth: the income that makes it, the rate on
 * the next dollar there, the year's federal tax, and the Medicare surcharge.
 *
 * Four figures and no advice. It used to close with "stay under $x or over
 * $y" on a hill and "fill this valley" here on a valley, but that is a
 * recommendation about wherever a mouse happened to land — nobody's point in
 * particular, and no point at all on a touchscreen. Nothing on this page
 * recommends a move any more; the readout under the slider says where the
 * reader is standing and stops.
 *
 * The two cliff figures went the same way. "$x of MAGI to the next cliff" and
 * "$y of household income to the 400% poverty line" are distances, and a
 * distance is only worth reading from where you are standing: both are in the
 * close, keyed to the slider, in `Medicare surcharge` and in the poverty-line
 * explainer's "You are here". What stays here is what a hover is actually
 * good for — the surcharge and tier *at this point*, which no other reading of
 * the return can give you.
 */
export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  ssBenefit,
  filingStatus = 'single',
  muniInterest = 0,
  beneficiaries = 1,
  year = defaultTaxYear(),
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  // The hovered point, as a whole return, so that every figure below is priced
  // off one object rather than off a different subset of the props each time.
  const scenario = {
    ordinaryIncome: point.income,
    ssBenefit,
    filingStatus,
    muniInterest,
    year,
  };
  // Medicare reads a wider MAGI than the tax chain does — tax-exempt interest
  // is added back — so it has to be recomputed here rather than read off the
  // curve, which only carries taxable figures.
  const irmaa = irmaaFor(irmaaMagi(scenario), {
    filingStatus,
    beneficiaries,
    year,
  });
  // Not `point.income + ssBenefit`: tax-exempt interest is spent like any
  // other dollar, so it belongs in what this return takes in too. See
  // `totalIncomeFor`. Which is why the head below has to name the interest as
  // well: it quotes the total and then takes it apart, and a decomposition
  // that leaves out a term the total contains is an addition the reader can
  // watch fail.
  const totalIncome = totalIncomeFor(scenario);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-head">
        Total income {formatCurrency(totalIncome)} · {formatCurrency(ssBenefit)}{' '}
        SS
        {muniInterest > 0
          ? ` + ${formatCurrency(muniInterest)} tax-exempt`
          : ''}{' '}
        + {formatCurrency(point.income)} other income
      </div>
      <div>
        Marginal Rate: <strong style={{ color: PALETTE.accent }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: PALETTE.orange }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      <div>
        Medicare IRMAA:{' '}
        <strong style={{ color: PALETTE.roseBright }}>
          {formatCurrency(irmaa.annualSurcharge)}/yr
        </strong>
        {irmaa.tier > 0 ? ` (tier ${irmaa.tier} of 5)` : ''}
      </div>
    </div>
  );
};

/**
 * Sampling interval for a swept curve, and the step of any slider walking it.
 *
 * The interval doubles each time the axis does, so the widest chart this app
 * can draw samples no more points than the narrowest one always did — at most
 * 600 either way.
 *
 * The last rungs exist for links rather than for sliders. Nothing a reader can
 * click takes the axis past $300,000, but a link can name any income up to
 * `MAX_OTHER_INCOME`, and without them a $1,000,000 return would sweep a
 * thousand points where the chart otherwise sweeps at most six hundred.
 */
const curveStepFor = (axisMax: number): number =>
  axisMax > 600_000 ? 2000 : axisMax > 300_000 ? 1000 : axisMax > 150_000 ? 500 : 250;

/**
 * How long a control has to sit still before the live region takes its new
 * reading, in milliseconds.
 *
 * Long enough that a drag across the whole axis is one announcement rather
 * than sixty — a range input fires a change per notch, and every one of them
 * would otherwise queue a sentence a polite region reads out in full before
 * it looks at the next. Short enough that a reader who moves one notch and
 * stops is not left wondering whether anything happened.
 */
export const READING_SETTLE_MS = 700;

/**
 * A reading that lags its input: it takes a new value only once that value
 * has held still for `delay`, and the visible page never waits on it.
 *
 * This is the whole of the debounce the live region needs. It is not a
 * throttle — a throttle would read out the middle of a drag, which is a
 * figure the reader was passing through rather than one they chose — and it
 * deliberately drops everything before the last value rather than queueing
 * it.
 *
 * Mounting takes the reading as it stands rather than scheduling it: content
 * already inside a live region when the page loads is not announced, so there
 * is nothing to wait for and nothing to interrupt the reader's own walk down
 * the page with.
 */
const useSettledReading = (
  reading: string,
  delay: number = READING_SETTLE_MS,
): string => {
  const [settled, setSettled] = useState(reading);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(reading), delay);
    return () => window.clearTimeout(timer);
  }, [reading, delay]);
  return settled;
};

/**
 * How long a control has to sit still before the address bar is rewritten, in
 * milliseconds.
 *
 * This one is not a matter of taste. Browsers rate-limit the history API:
 * Safari throws a `SecurityError` on the 101st `replaceState` in 30 seconds,
 * and Chrome and Firefox silently drop the call and log. A range input fires a
 * change per notch, so one unhurried drag of the income slider spends the
 * whole budget — measured at 101 calls in a single sweep of the track and
 * back — and on Safari the throw lands inside an effect, where React has no
 * boundary to catch it and unmounts the page: the reader moves a slider and
 * the screen goes black.
 *
 * A trailing debounce is the fix rather than a cap, because the address is not
 * a log of the drag. It is where the drag *stopped*, which is the one return
 * worth carrying, and a debounce writes exactly that and nothing else — a
 * whole drag is one call. The delay is what bounds the worst case: a reader who
 * stutters, pausing just long enough each time to fire another write, still
 * cannot get past 30_000 / `ADDRESS_SETTLE_MS` calls in the window Safari
 * counts over, and at 400ms that is 75 against a budget of 100.
 *
 * Short enough that it is not a wait. Nobody reads the address bar mid-drag,
 * and the one control that depends on it — Copy link — flushes this itself
 * rather than trusting the timer. See `writeAddress`.
 */
export const ADDRESS_SETTLE_MS = 400;

/**
 * Put a return in the address bar, and never take the page down over it.
 *
 * `replaceState`, not `pushState`: a slider fires a change per notch, so
 * pushing would spend a history entry on every $500 of income and turn Back
 * into a scrub through the drag that got here. Replacing keeps the address
 * shareable and Back still leaves the page.
 *
 * The whole URL is rebuilt each time rather than the search alone, because
 * `replaceState` takes a URL: passing a bare `?query` would drop the `#step-…`
 * fragment the reader may have arrived on.
 *
 * The `catch` is the seatbelt under `ADDRESS_SETTLE_MS`, not a substitute for
 * it. A browser that refuses to rewrite the address has denied the reader a
 * convenience; it has not made anything on the page untrue, and the failure it
 * throws must not be allowed to reach React, which would unmount the whole
 * document over a URL. There is nothing to tell the reader either — the page
 * they are looking at is the page they asked for — so it is swallowed rather
 * than reported.
 */
const writeAddress = (scenario: PageScenario): void => {
  try {
    window.history.replaceState(
      window.history.state,
      '',
      scenarioUrl(scenario, window.location),
    );
  } catch {
    /* See above: the address bar is a convenience, and the page outranks it. */
  }
};

const App: React.FC = () => {
  /**
   * The return this page opened with, read out of the address bar once.
   *
   * Lazily initialised rather than computed at module load, because the
   * address is a fact about this mount: the tests render `<App />` many times
   * under many different links, and a module-level read would hand every one
   * of them whichever link happened to be first.
   */
  const [openedWith] = useState(() => decodeScenario(window.location.search));
  const opening = openedWith.scenario;

  /**
   * What the link asked for and could not have, if anything. Dismissible
   * because it describes the arrival rather than the return: it stops being
   * true of what is on screen the moment the reader moves a control, and there
   * is no honest way to keep it current.
   */
  const [linkNotes, setLinkNotes] = useState<string[]>(() => openedWith.notes);

  /**
   * The year every figure below is priced for.
   *
   * A constant rather than state: the page used to open with a 2025/2026
   * picker, and it was the only control on it that re-priced everything at
   * once without telling the reader anything they came for. What the picker
   * demonstrated — that the COLA raises the benefit while 86(c)'s thresholds
   * sit still — is the page's own subject and is said in prose under step 2,
   * where it does not depend on the reader thinking to click twice and compare.
   * See `PAGE_TAX_YEAR` for why it is not `defaultTaxYear()`.
   */
  const year = PAGE_TAX_YEAR;
  const [ssBenefit, setSsBenefit] = useState<number>(opening.ssBenefit);
  const [filingStatus, setFilingStatus] = useState<PageFilingStatus>(opening.filingStatus);
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(opening.ordinaryIncome);
  const [isSenior, setIsSenior] = useState<boolean>(opening.isSenior);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(opening.spouseIsSenior);
  const [muniInterest, setMuniInterest] = useState<number>(opening.muniInterest);

  /**
   * Which of step 2's two threshold lines are drawn, and whether the panel
   * that switches them is open.
   *
   * Both lines start off. Neither is income tax — IRMAA is a Medicare premium
   * and the 400% line is a Marketplace credit — so both were furniture on a
   * chart of marginal rates for every reader they do not apply to, and each
   * came with a paragraph of key underneath explaining a dash. What each one
   * costs *this* return is in the close, priced at the reader's own income;
   * the lines are the other question — where the thresholds sit across the
   * whole axis — and that is worth a control rather than an assumption.
   *
   * Off by default rather than on, because the page has one subject and these
   * are two more. A reader who came for the torpedo gets the torpedo; a reader
   * who wants to know where the cliffs fall says so, once, and the panel
   * remembers for as long as the page is open.
   *
   * Not in the query string. Every key there describes the return, and a link
   * carries a scenario rather than a view of it — see `scenarioUrl`.
   */
  const [showIrmaaLines, setShowIrmaaLines] = useState(false);
  const [showSubsidyLine, setShowSubsidyLine] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);

  /**
   * The two ways out of an open panel that is not a dialog: Escape, and a
   * click on anything else.
   *
   * The ref wraps the button *and* the panel, so pressing the button while it
   * is open is a click inside — otherwise the outside-click listener would
   * shut the panel a moment before the button's own handler reopened it, and
   * the control would never close. Escape puts focus back on the button,
   * because a reader who dismisses a panel with the keyboard has nowhere else
   * to be. Nothing traps focus: this is a group of checkboxes, not a dialog,
   * and Tab out of it is a legitimate way to leave it.
   */
  const linesRef = useRef<HTMLDivElement>(null);
  const linesButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!linesOpen) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (!linesRef.current?.contains(e.target as Node)) setLinesOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setLinesOpen(false);
      linesButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [linesOpen]);

  /**
   * Whose reading the live region is carrying, or null before the reader has
   * moved anything.
   *
   * Every readout on this page is silent to a screen reader: moving a slider
   * announces the slider's own value and nothing else, so the "you are here"
   * sentence and the effective rate under it both change unheard.
   * A live region fixes that, and the whole difficulty is how much to put in
   * one — the closing figures read out on every notch of a drag would be
   * worse than the silence they replaced. So the region carries exactly one
   * step's reading: the step whose control was last touched.
   *
   * Keyed to the control the reader last touched rather than to whichever
   * step is on screen, because every step is mounted at once and a reader can
   * be working step 2's slider with step 1 still in view. And one rather than
   * two regions,
   * because step 1's benefit moves both readings — two regions would queue
   * two announcements for one drag, which is the noise this is trying to
   * avoid.
   *
   * Null at mount is what keeps the page quiet on arrival: a region with
   * nothing in it announces nothing, and the close is meant to be read on the
   * way down rather than shouted on the way in.
   */
  const [announceFrom, announce] = useState<StepId | null>(null);

  /**
   * Whether this browser will hand a page the clipboard.
   *
   * `navigator.clipboard` is undefined over plain http and in Safari before
   * 13.1 — the DOM types declare it non-optional, which is why the check is
   * written against `typeof` rather than a truthiness test the compiler would
   * consider dead. Read once at mount because the answer cannot change
   * mid-session, and because the tests mount many pages under many browsers.
   *
   * When it is false the button is not drawn at all. A copy button that cannot
   * copy is worse than no button, and the sentence beside it — the address bar
   * *is* the link — is the whole feature; the button only saves a reader the
   * trip to the top of the window.
   */
  const [canCopyLink] = useState(
    () => typeof navigator.clipboard?.writeText === 'function',
  );

  /**
   * What to say about the last copy, or nothing.
   *
   * Deliberately not a fallback text field. A second copy of the address on
   * the page is a second thing to keep in step with the return, and it would
   * be stale the moment a slider moved — where the address bar catches up on
   * its own, within `ADDRESS_SETTLE_MS` and at once when this button is
   * pressed. So the failure case points at the address bar, which is the same
   * link the button would have put on the clipboard, character for character.
   * That is only true because the button copies `location.href` verbatim
   * rather than building its own URL.
   */
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyLink = (): void => {
    /* Flush the address before reading it. The write below is debounced by
       `ADDRESS_SETTLE_MS`, and a reader who moves a slider and reaches
       straight for this button would otherwise be handed the return they just
       left — silently, since the two links differ only in a query string
       nobody proofreads. Writing it here is what keeps "the button copies
       what is in the address bar" true at every instant rather than merely
       400ms after the last one. */
    writeAddress({
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      isSenior,
      spouseIsSenior,
      muniInterest,
    });
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  /**
   * The address bar, kept in step with the return — once the control moving it
   * has settled.
   *
   * The debounce is not cosmetic: writing on every notch of a drag runs the
   * page into the browser's own limit on the history API, which on Safari is a
   * throw and, uncaught inside an effect, a black screen. `ADDRESS_SETTLE_MS`
   * has the measurements and `writeAddress` has the seatbelt.
   *
   * Only the write waits. `setCopyState` is left on the render that changed
   * the return, because "Copied" stops being true of the clipboard the instant
   * a control moves rather than 400ms later.
   *
   * And only a *change* waits. Arrival writes at once, because nothing is
   * being dragged on mount — there is no burst to spread out — and because
   * this is the write that normalises the link the reader came in on, dropping
   * the keys this page no longer honours. A link that still names a gain or a
   * tax year is answered by the address bar the moment it is opened rather
   * than four tenths of a second later. See `decodeScenario`.
   */
  const addressWritten = useRef(false);
  useEffect(() => {
    const scenario = {
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      isSenior,
      spouseIsSenior,
      muniInterest,
    };
    let timer: number | undefined;
    if (addressWritten.current) {
      timer = window.setTimeout(() => writeAddress(scenario), ADDRESS_SETTLE_MS);
    } else {
      addressWritten.current = true;
      writeAddress(scenario);
    }
    /* The return just changed, so whatever is on the clipboard is a different
       return from the one on screen and "Copied" has stopped being true of
       it. Same reasoning as the link note's Dismiss: a message about an
       arrival cannot be kept current, so it goes when the return moves. */
    setCopyState('idle');
    return () => window.clearTimeout(timer);
  }, [
    filingStatus,
    ssBenefit,
    ordinaryIncome,
    isSenior,
    spouseIsSenior,
    muniInterest,
  ]);

  const yearFiling = filingParams(year, filingStatus);

  const changeOrdinaryIncome = (next: number): void => {
    setOrdinaryIncome(next);
    announce('torpedo');
  };

  /**
   * Line 6a on a joint return holds two benefits, so both ends of that slider
   * are the couple's: coming back from `mfj` can leave a figure standing past
   * a right edge that has nearly halved, and it is re-capped rather than left
   * parked out there.
   *
   * The extra rule is the average. A reader sitting exactly on one status's
   * average has not chosen that number, they have accepted the marker under
   * the slider — so when the marker moves, they move with it, and switching
   * back puts them where they started. Anywhere else on the slider is a figure
   * they set, and it stays set.
   */
  const changeFilingStatus = (next: PageFilingStatus): void => {
    setSsBenefit((current) =>
      current === avgAnnualSSBenefit(year, filingStatus)
        ? avgAnnualSSBenefit(year, next)
        : Math.min(current, maxAnnualSSBenefit(year, next)),
    );
    setFilingStatus(next);
    announce('benefit');
  };

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;

  /**
   * Both ends of the benefit slider, and the marker between them.
   *
   * A joint return is the only one that reports two benefits on line 6a, so it
   * is the only one whose slider is a household's rather than a person's. Note
   * that this does not follow the senior checkboxes: whether both spouses are
   * 65 changes the deduction, not who is collecting, and a couple can very
   * easily be one retiree on a benefit and one spouse who is not 65 yet.
   */
  const jointBenefit = filingStatus === 'mfj';
  const benefitSliderMax = maxAnnualSSBenefit(year, filingStatus);
  const benefitAverage = avgAnnualSSBenefit(year, filingStatus);

  /**
   * The right edge of step 2's chart, and of the slider under it.
   *
   * Sized to this return rather than fixed, because what there is to see moves
   * with it: the torpedo is over by about $41,000 of other income, but a
   * return claiming the senior deduction has a second hump that does not
   * finish until $154,000 — $230,000 on a joint return — and the old fixed
   * $150,000 cut it in half. It never narrows below that figure, only widens
   * past it. See `incomeAxisMax`.
   *
   * The reader's own income is passed as the floor so the axis always contains
   * where they are standing. Without it, turning the age toggle back off would
   * pull the right edge in behind a slider left out at $170,000.
   */
  const axisMax = useMemo(
    () =>
      incomeAxisMax(
        { ssBenefit, filingStatus, seniors, muniInterest, year },
        { minimum: Math.max(MIN_INCOME_AXIS, ordinaryIncome) },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, year, ordinaryIncome],
  );

  /**
   * The slider steps in whatever the curve samples, never finer than the $500
   * it has always used. `pointAt` reads the reader's position back off the
   * nearest sample at or below it, so a slider that stepped finer than the
   * sweep would quietly report the marginal rate from somewhere else.
   */
  const curveStep = curveStepFor(axisMax);
  const incomeSliderStep = Math.max(500, curveStep);

  /**
   * The inputs the page does not open with.
   *
   * Each starts at $0, and at $0 each is a no-op: every chart on the page
   * prices the identical scenario whether this section is open or shut. That
   * is the whole test for what belongs in here — year, filing status, age,
   * benefit and other income all change the picture the moment the page loads,
   * so they stay out. What it costs is that a slider you cannot see is a
   * slider you forget, which is why anything moved off $0 is named twice over
   * — in the strip beside this section's own summary, and in the recap that
   * closes the step — and stays named while the section is closed.
   *
   * Each carries two names: the short one the strip has room for, and the one
   * a return is described with. The strip sits beside a slider whose own label
   * says which slider it is, so "Muni interest $3,750" is enough there; the
   * recap stands on its own at the foot of the column and has to say what the
   * figure is without a control beside it to lean on.
   */
  const advancedSet = [
    {
      label: 'Muni interest',
      noun: 'municipal interest',
      value: muniInterest,
    },
  ].filter(({ value }) => value > 0);

  /**
   * How the age toggles read inside the recap that closes step 1. A joint
   * return has three answers rather than two, because one qualifying spouse
   * and two are different returns — one senior deduction against two, and the
   * standard-deduction addition once against twice.
   */
  const ageProse =
    seniors === 0
      ? 'under 65'
      : filingStatus !== 'mfj'
        ? '65 or older'
        : seniors === 2
          ? 'both spouses 65 or older'
          : 'one spouse 65 or older';

  /**
   * The second sentence of the recap, which exists only when an advanced
   * slider has been moved off $0.
   *
   * A sentence of its own rather than more clauses on the end of the first
   * one. The first sentence describes a filer — a year, a status, an age, a
   * benefit — and this is neither a fact about the filer nor a fifth thing of
   * the same kind; it is a figure a reader went and set by hand, and the point
   * of naming it here is that the section holding it is shut. Ending the filer
   * sentence and starting "Plus" is what says so.
   */
  const advancedClauses = advancedSet.map(({ label, noun, value }) => ({
    key: label,
    node: (
      <>
        <strong>{formatCurrency(value)}</strong> in {noun}
      </>
    ),
  }));

  const baseDeduction = yearFiling.standardDeduction;
  const standardDeduction = standardDeductionFor({ filingStatus, seniors, year });
  const seniorAddition = standardDeduction - baseDeduction;

  // The OBBBA senior deduction, before its phaseout eats into it, and the band
  // it shrinks across. 151(d)(5)(C)(v) denies the deduction to exactly one
  // status — a married taxpayer filing separately — and that is not a status
  // this page offers, so on every return it can show there is a deduction and
  // there are both ends of a band. The tax code keeps the exclusion and the
  // types keep saying which status it is; the strip is what keeps it off this
  // page. See `FILING_STATUS_LABELS`.
  const seniorDeductionMax = seniors * SENIOR_DEDUCTION;
  const phaseoutStart = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  // With the age toggle off there is nothing to phase out, but the explainer
  // still needs a rate to talk about, so describe one qualifying person.
  const phaseoutRate = SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(1, seniors);
  const taxableIncomePerDollar = 1 + phaseoutRate;
  /**
   * Where the far side of the phaseout lands on the chart's own axis, and
   * whether it fits. It is inside by construction whenever the deduction is
   * actually claimed — that is what sizes the axis — so this is really about
   * the reader who has not ticked the age box, and is reading the explainer to
   * find out what they would be looking at if they had.
   */
  const phaseoutEndOnAxis = incomeAxisFeatures({
    ssBenefit,
    filingStatus,
    seniors: Math.max(1, seniors),
    muniInterest,
    year,
  }).seniorPhaseoutEnd;
  const phaseoutEndsOnChart =
    phaseoutEndOnAxis !== null && phaseoutEndOnAxis <= axisMax;

  /**
   * Step 2's curve, and the only one the page draws: every dollar that is not
   * Social Security, from nothing to the right edge, priced for what the next
   * one after it costs.
   *
   * Every dollar on this axis is ordinary income. A long-term gain reaches
   * provisional income identically but is charged under its own schedule, and
   * pricing that split is what the capital-gains step did — `ltcg` is still a
   * field on `Scenario` and `shelf/gainsCurve.ts` still sweeps it, but nothing
   * on this page sets one, so nothing here passes one.
   */
  const curve = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest, year },
        { maxIncome: axisMax, step: curveStep },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, year, axisMax, curveStep],
  );

  /**
   * The chart's x-axis, in the income the return actually takes in.
   *
   * The sweep is still every dollar of *other* income from nothing to the
   * right edge — that is the one figure the reader sets, and the slider, the
   * segments and every threshold on the page are still measured in it. What
   * changed is what the axis is drawn in: a reader looking at the hump wants
   * to know what income puts them on it, and "$41,000" was only ever half an
   * answer, because the benefit sitting underneath it is income too.
   *
   * Read off the curve's own ends rather than recomputed, so the axis cannot
   * span anything the plot does not.
   */
  const axisDomain: [number, number] = [
    curve[0].totalIncome,
    curve[curve.length - 1].totalIncome,
  ];

  // Never read off the tax year: IRC 86(c) has never been indexed. See SS_BASES.
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];

  /**
   * Where the reader is standing on the chart: the slider is a point on the
   * sweep, so it reads the curve back rather than changing it.
   */
  const herePoint = useMemo(
    () => pointAt(curve, (p) => p.income, ordinaryIncome),
    [curve, ordinaryIncome],
  );

  /**
   * The reader's own return, in the shape the tax chain reads it: one object
   * that everything below prices off, rather than a different subset of the
   * state at each call site.
   */
  const hereScenario = useMemo(
    () => ({
      ordinaryIncome,
      ssBenefit,
      filingStatus,
      seniors,
      muniInterest,
      year,
    }),
    [ordinaryIncome, ssBenefit, filingStatus, seniors, muniInterest, year],
  );

  /**
   * Everything this return takes in, which is the denominator an effective
   * rate needs and the reader's own answer at the foot of the page quotes.
   *
   * `totalIncomeFor` is the one definition — both axis labels and both
   * tooltips now read it rather than each restating it — and its own comment
   * says why the whole benefit counts.
   */
  const totalIncome = totalIncomeFor(hereScenario);

  /**
   * The same question asked about a point that is not the reader's own: what
   * this return takes in when its other income is `income`.
   *
   * Every mark the chart places by other income goes through here, because the
   * axis those marks land on is drawn in total income. Rounded to match the
   * curve's own `totalIncome`, so a threshold at the sample the reader is
   * standing on shares its x with them rather than missing it by cents.
   */
  const totalIncomeAt = (income: number): number =>
    Math.round(totalIncomeFor({ ...hereScenario, ordinaryIncome: income }));

  /**
   * The caption under the plot: what a figure on the axis has inside it.
   *
   * The axis is total income, and a point on it does not explain itself. Part
   * of it is a benefit the income slider cannot move, and any municipal
   * interest the reader holds is in it too even though nothing is charged on
   * that — so a reader who reads one figure off the axis cannot say which part
   * of it the slider beneath is for. This sentence is where that is answered
   * now: the marker inside the plot used to answer it in three stacked lines
   * over the curve, and one line under the axis says the same thing without
   * spending a quarter of a narrow plot on it.
   *
   * Each part appears only when it is non-zero, so a return with no benefit
   * and no municipal interest gets the bare axis name rather than a sentence
   * about two zeroes.
   */
  const axisIncludes: string[] = [
    ssBenefit > 0 ? `${formatCurrency(ssBenefit)} of Social Security` : '',
    muniInterest > 0
      ? `${formatCurrency(muniInterest)} of municipal interest`
      : '',
  ].filter(Boolean);

  const axisCaption =
    'Total income ($)' +
    (axisIncludes.length > 0 ? `, including ${axisIncludes.join(' and ')}.` : '');

  /**
   * The same list again, as the fixed part of a span rather than the contents
   * of a point.
   *
   * Two sentences on this page describe the axis end to end instead of
   * describing a figure on it: step 2's opening line and the plot's accessible
   * name. Both offered the reader an addition — a benefit that does not move,
   * plus $0 to the right edge of other income — and both named the benefit and
   * stopped there, so both stopped adding up the moment the muni slider moved.
   * At $3,750 of municipal interest the opening line said the axis began at
   * $28,602 while the arithmetic beside it reached $24,852. They read this
   * now, and `totalIncomeFor` is the definition all three of them share.
   *
   * Both are a plain addition: the two ends of the span are the fixed part and
   * the fixed part plus every dollar the slider can reach, and nothing in
   * between needs explaining away.
   */
  const axisFixedProse =
    axisIncludes.length > 0
      ? axisIncludes.join(' and ')
      : `${formatCurrency(ssBenefit)} of Social Security`;

  /**
   * The average rate, for reading next to the marginal one.
   *
   * Every rate the page quotes today is the price of the *next* dollar. What
   * it never said is what the return as a whole costs — and the gap between
   * the two is the single most reliable misreading of a marginal rate, so the
   * two figures belong in the same sentence rather than in two places.
   *
   * Taken as a fraction so `formatPercent` renders it the way the chart axis
   * renders every other rate on the page.
   */
  const effectiveRateOn = (tax: number): number =>
    totalIncome > 0 ? tax / totalIncome : 0;

  // Medicare is per enrollee, so a joint return with both spouses over 65 pays
  // every surcharge twice off one MAGI figure. Below 65 nobody is enrolled yet,
  // but the two-year lookback means this year's income still sets the first
  // premium they will see — so price one enrollee rather than none.
  const beneficiaries = filingStatus === 'mfj' && seniors === 2 ? 2 : 1;

  const cliffs = useMemo(
    () =>
      irmaaCliffs({
        ssBenefit,
        filingStatus,
        muniInterest,
        beneficiaries,
        year,
      }),
    [ssBenefit, filingStatus, muniInterest, beneficiaries, year],
  );

  /** The cliffs that actually land inside the chart's x-axis. */
  const cliffsOnChart: IrmaaCliff[] = cliffs.filter(
    (c) => c.otherIncome > 0 && c.otherIncome <= axisMax,
  );

  /**
   * Whether anyone on this return still has to buy their own health coverage.
   *
   * The 400% cliff and the IRMAA cliffs are mutually exclusive *per person*:
   * 36B(c)(2)(B) makes anyone eligible for Medicare ineligible for the premium
   * tax credit, so the line below is drawn for exactly the readers the red
   * ones are least about — and a joint return with one spouse over 65 and one
   * under it meets both, which is why this counts people rather than asking
   * whether the filer is a senior.
   *
   * What it cannot know is where that coverage comes from. An employer plan, a
   * retiree plan or a spouse's plan all leave the cliff irrelevant, and the
   * page has no field for it. So the line is drawn on the age this return
   * already states and the prose beside it carries the condition, rather than
   * a checkbox nobody would tick being the thing that decides whether the
   * biggest cliff on the chart is mentioned at all.
   */
  const preMedicare = seniors < (filingStatus === 'mfj' ? 2 : 1);

  /**
   * The 400% line for this household, or null in a tax year that has no cliff.
   *
   * The same scenario the IRMAA cliffs are placed from, and it moves with the
   * same inputs — but along a different MAGI, so it does not move by the same
   * amounts. `householdSize` is deliberately left unset: the page has no field
   * for dependents, so the scenario's own default sizes the poverty line from
   * the filing status. See `defaultHouseholdSize`.
   */
  const subsidyCliff = useMemo(
    () =>
      ptcCliff({
        ssBenefit,
        filingStatus,
        muniInterest,
        year,
      }),
    [ssBenefit, filingStatus, muniInterest, year],
  );

  /** The 400% line when it is this return's to meet and the axis can show it. */
  const subsidyCliffOnChart: PtcCliff | null =
    preMedicare &&
      subsidyCliff &&
      subsidyCliff.otherIncome > 0 &&
      subsidyCliff.otherIncome <= axisMax
      ? subsidyCliff
      : null;

  /**
   * How many lines the plot is actually drawing, for the button that opens the
   * panel — a count of marks on the chart, not of ticked boxes. The two part
   * company whenever a switch is on and its threshold falls off the axis, and
   * the count is the only thing that says so now that the panel is two
   * checkboxes and nothing else: a ticked box with no number beside the
   * button's name is a threshold this axis does not reach.
   */
  const linesShown =
    (showIrmaaLines ? cliffsOnChart.length : 0) +
    (showSubsidyLine && subsidyCliffOnChart ? 1 : 0);

  /**
   * What the live region will read out, once whatever changed it has settled.
   *
   * One step's reading each, written to be listened to rather than looked at:
   * plain sentences with no markup to flatten, no em dashes, and the figures
   * in the order the eye takes them off the page. It says what that step's own
   * readout says and stops there: the closing figures stay on the page, for a
   * reader who goes and reads them.
   *
   * Not memoised: it is two string concatenations on a component that has
   * already swept a curve, and holding it as a plain value is what lets the
   * settle hook below compare readings by their text rather than by identity.
   */
  const reading = ((): string => {
    switch (announceFrom) {
      case 'benefit': {
        /* The recap on screen, flattened: same words, same separators, so a
           listener and a reader are never told about two different returns. It
           used to tack the advanced inputs on as bare labels — "Muni interest
           $10,000" — because the recap only pointed at them and a pointer is no
           use to someone who has just moved one. The recap names them now, so
           this names them the same way, in the same second sentence. */
        const collecting =
          ssBenefit > 0
            ? `collecting ${formatCurrency(ssBenefit)} of Social Security per year`
            : 'collecting no Social Security at all';
        const plus = advancedSet.length
          ? ` Plus ${joinProse(
            advancedSet.map(({ noun, value }) => `${formatCurrency(value)} in ${noun}`),
          )}.`
          : '';
        return `${year} brackets, ${FILING_STATUS_PROSE[filingStatus]}, ${ageProse}, ${collecting}.${plus}`;
      }
      case 'torpedo':
        return herePoint
          ? `At ${formatCurrency(ordinaryIncome)} of other income the next dollar is taxed at ${herePoint.marginalRate
          }%. Federal tax ${formatCurrency(herePoint.totalTax)} on ${formatCurrency(
            totalIncome,
          )} of total income, an effective rate of ${formatPercent(
            effectiveRateOn(herePoint.totalTax),
          )}.`
          : '';
      default:
        return '';
    }
  })();

  /**
   * The same reading, held back until the control that changed it has stopped
   * moving. What the page shows never waits on this; only what it says does.
   */
  const announcement = useSettledReading(reading);

  /* ───── The close: what the two steps add up to ───── */

  /**
   * How much of the benefit 86(a) actually taxes, at the reader's own point.
   *
   * The page has drawn the taxable share as a slope since the first chart —
   * it is what makes the torpedo a torpedo — and has never once stated it as
   * a figure for the return in front of the reader. Same call every point on
   * every curve makes; this one asks it about one point.
   */
  const taxableSS = taxableSocialSecurity(hereScenario);

  /**
   * Medicare's own reading of this return, which is neither of the income
   * definitions the tax figures use: AGI with tax-exempt interest added back.
   * The tooltip has assessed it per hovered point since the cliffs went on
   * the chart, so a reader who never hovers has never seen which tier their
   * own MAGI lands in.
   */
  const hereMagi = irmaaMagi(hereScenario);
  const hereIrmaa = irmaaFor(hereMagi, { filingStatus, beneficiaries, year });

  /**
   * And 36B's reading of it, which is wider than either: the whole benefit,
   * whatever share of it the torpedo has dragged into the tax base. The gap
   * between this figure and Medicare's is the untaxed part of the benefit, and
   * it is why the two cliffs on step 2's chart do not travel together.
   */
  const hereSubsidy = ptcFor(acaMagi(hereScenario), hereScenario);

  /**
   * The year's federal tax at the reader's point.
   *
   * Read off the curve rather than recomputed, so the close quotes the figure
   * step 2's readout already quotes rather than a second rounding of it.
   * `totalFederalTax` stands in for a slider parked below the curve's first
   * sample, which would mean below $0, and is the same call the sweep makes at
   * every point it plots.
   */
  const hereTax = herePoint?.totalTax ?? Math.round(totalFederalTax(hereScenario));

  return (
    <div className="card">
      {/* The way past step 1.

          Step 1 is ten controls deep before the chart begins, and a reader who
          has already set the return — or who arrived on a link that set it for
          them — has to tab through every one of them to reach the thing the
          page is about. So the first focusable element on the page is the way
          out of that.

          It lands on `#step-torpedo` rather than on `#answer` because the
          fragment is already how this page names a place: `scenarioUrl` keeps
          whatever fragment the reader arrived on precisely so a link can point
          at a step, and the chart is what the steps lead to. The close sits
          after it in reading order and one heading jump away, so landing on the
          chart reaches both and landing on the close reaches only one.

          No handler: the target carries `tabIndex={-1}`, which is what makes a
          browser move focus into it rather than only scrolling to it. */}
      <a className="skip-link" href="#step-torpedo">
        Skip to the chart
      </a>

      {/* The banner: what the page is, and what the link that opened it did.

          The note is in here rather than loose above the steps because it is
          about the arrival rather than about the return — the same thing the
          title and the subtitle are — and because content outside every
          landmark is content a reader jumping by landmark never lands on. */}
      <header>
        <h1>Social Security and Marginal Tax Rates</h1>
        <p className="subtitle">
          Because of how Social Security is taxed, your marginal tax rate is often very different than what you might expect. Use this tool to calculate marginal tax rates based on your social security income.
        </p>

        {linkNotes.length > 0 && (
          <div className="link-note" role="status">
            <p>
              <strong>This link asked for something this page could not show.</strong>{' '}
              Everything else in it came through as sent.
            </p>
            <ul>
              {linkNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setLinkNotes([])}>
              Dismiss
            </button>
          </div>
        )}
      </header>

      {/* What a screen reader hears when a control moves, and the only thing
          on this page that is heard rather than read. Rendered always and
          empty until there is something to say, because a live region has to
          be on the page before the message lands in it to be read out
          reliably — the same reason the copy-link status is. `aria-atomic`
          because each reading is one sentence that replaces the last rather
          than an addition to it.

          Where it sits changes nothing about when it is read, so it sits
          above the steps rather than below them: the close is the last thing
          on this page before the disclaimer, and that adjacency is part of
          the shape. Empty and a pixel wide, it interrupts nothing here. */}
      <p className="live-reading" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {/* The main landmark, and the whole of the page that is not the title
          or the disclaimer: both steps and the close.

          `.shell` is already the box that holds exactly that, so it becomes
          the landmark rather than gaining a wrapper — a second box here would
          be a grid parent with one grid child, which is a layout bug waiting
          to be written. The footer stays outside it on purpose: a `<footer>`
          inside `<main>` is not `contentinfo`, so folding it in would have
          traded the one landmark this page already had for the one it was
          missing. */}
      <main className="shell">
        {/* ───── Step 1: the return every later step prices ───── */}
        <section
          className="step step-config"
          id="step-benefit"
          tabIndex={-1}
          aria-labelledby="step-benefit-heading"
        >
          <p className="step-kicker">Step 1 of {STEPS.length}</p>
          <h2 className="step-heading" id="step-benefit-heading">
            Your Social Security benefit
          </h2>

          <fieldset className="input-group filing-status">
            <legend>Filing Status</legend>
            <div className="segmented">
              {PAGE_FILING_STATUSES.map((value) => (
                <label key={value} className="segmented-option">
                  <input
                    type="radio"
                    name="filing-status"
                    value={value}
                    checked={filingStatus === value}
                    onChange={() => changeFilingStatus(value)}
                  />
                  <span>{FILING_STATUS_LABELS[value]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="input-group filing-status">
            <legend>Age</legend>
            <div className="checkbox-group hint-anchor">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={isSenior}
                  aria-describedby="senior-deduction-hint"
                  onChange={(e) => {
                    setIsSenior(e.target.checked);
                    // The spouse's box answers "and the other one too?", so it
                    // cannot outlive the question. Leaving it set left a
                    // checked box greyed out under `disabled`, put a `spouse=1`
                    // in the link that priced nothing, and made re-checking
                    // this box hand back a second $1,650 nobody asked for
                    // again. `seniors` below already ignored it; this is the
                    // control agreeing with the arithmetic.
                    if (!e.target.checked) setSpouseIsSenior(false);
                    announce('benefit');
                  }}
                />
                <span>Age 65 or older</span>
              </label>
              {filingStatus === 'mfj' && (
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={spouseIsSenior}
                    disabled={!isSenior}
                    aria-describedby="senior-deduction-hint"
                    onChange={(e) => {
                      setSpouseIsSenior(e.target.checked);
                      announce('benefit');
                    }}
                  />
                  <span>Both spouses are 65 or older</span>
                </label>
              )}
              {/* One bubble for the whole group: both checkboxes describe the same
                  two deductions, and a copy per checkbox would just duplicate it. */}
              <div className="hint-bubble" id="senior-deduction-hint" role="tooltip">
                <p className="field-note">
                  Standard deduction{' '}
                  <strong>{formatCurrency(standardDeduction)}</strong>
                  {seniorAddition > 0
                    ? ` — ${formatCurrency(baseDeduction)} base plus ${formatCurrency(seniorAddition)} for age 65 or older.`
                    : `. Turning 65 adds ${formatCurrency(yearFiling.additionalStdDeduction65)}${filingStatus === 'mfj' ? ' per qualifying spouse' : ''
                    }.`}{' '}
                  The addition widens the 0%-rate valley to the left of the
                  torpedo: taxable income stays at zero for that much longer, so
                  the whole curve shifts right.
                </p>
                <p className="field-note">
                  {seniors > 0 ? (
                    <>
                      Senior deduction{' '}
                      <strong>{formatCurrency(seniorDeductionMax)}</strong>
                      {seniors > 1
                        ? ` (${formatCurrency(SENIOR_DEDUCTION)} per spouse)`
                        : ''}{' '}
                      on top of that, shrinking by {formatCents(phaseoutRate)} per
                      dollar of MAGI above {formatCurrency(phaseoutStart)}
                      {seniors > 1
                        ? ` (${formatCents(SENIOR_DEDUCTION_PHASEOUT_RATE)} for each spouse)`
                        : ''}{' '}
                      and gone at {formatCurrency(phaseoutEnd)}. It expires after
                      tax year {SENIOR_DEDUCTION_LAST_YEAR}.
                    </>
                  ) : (
                    <>
                      Filers 65 or older also get the temporary senior deduction
                      — {formatCurrency(SENIOR_DEDUCTION)} each, for tax years{' '}
                      {SENIOR_DEDUCTION_FIRST_YEAR}&ndash;
                      {SENIOR_DEDUCTION_LAST_YEAR} only.
                    </>
                  )}
                </p>
              </div>
            </div>
          </fieldset>

          <div className="input-group">
            <div className="slider-header">
              <label htmlFor="ss-benefit">
                Annual Social Security Benefit
                {jointBenefit ? ' (both spouses)' : ''}
              </label>
              <span className="slider-value">{formatCurrency(ssBenefit)}</span>
            </div>
            <input
              id="ss-benefit"
              type="range"
              min={0}
              max={benefitSliderMax}
              step={12}
              value={ssBenefit}
              onChange={(e) => {
                setSsBenefit(Number(e.target.value));
                announce('benefit');
              }}
            />
            <div className="slider-range-labels">
              <span>$0</span>
              <span>
                {formatCurrency(benefitAverage)} ({year}{' '}
                {jointBenefit ? 'couple avg' : 'avg'})
              </span>
              <span>
                {formatCurrency(benefitSliderMax)} ({year}{' '}
                {jointBenefit ? 'couple max' : 'max'})
              </span>
            </div>
          </div>

          <details className="advanced-inputs">
            <summary>
              <span className="advanced-label">Advanced inputs</span>
              {advancedSet.length > 0 ? (
                <span className="advanced-state advanced-state-set">
                  {advancedSet
                    .map(({ label, value }) => `${label} ${formatCurrency(value)}`)
                    .join(' \u00B7 ')}
                </span>
              ) : (
                <span className="advanced-state">At $0</span>
              )}
            </summary>
            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="muni-interest">Tax-Exempt (Municipal) Interest</label>
                <span className="slider-value violet">{formatCurrency(muniInterest)}</span>
              </div>
              <input
                id="muni-interest"
                type="range"
                min={0}
                max={MAX_MUNI_INTEREST}
                step={250}
                value={muniInterest}
                onChange={(e) => {
                  setMuniInterest(Number(e.target.value));
                  announce('benefit');
                }}
                className="slider-violet"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_MUNI_INTEREST)}</span>
              </div>
              <p className="field-note">
                Municipal bond interest never enters taxable income, but it counts
                toward provisional income dollar for dollar — so it drags benefits
                into the tax base exactly as fast as a paycheck would, and shifts the
                whole curve to the left.
              </p>
            </div>

          </details>

          {/* What this step settled, in one line. The hero used to name the
              filing status and the year; it now says what the page is for, so
              the return being priced is named here instead — at the foot of the
              column that sets it, on the way into the step that spends it.

              "One year's return" rather than the "Everything from here on
              prices one return" it opened with: what a reader wants from a
              recap is the return, and a lead-in that describes where the
              sentence sits on the page is a fact about the page rather than
              about the return. */}
          <p className="scenario-recap">
            One year’s return: <strong>{year}</strong> brackets and standard
            deduction, <strong>{FILING_STATUS_PROSE[filingStatus]}</strong>,{' '}
            {ageProse}, collecting{' '}
            {ssBenefit > 0 ? (
              <>
                <strong>{formatCurrency(ssBenefit)}</strong> of Social Security
                per year
              </>
            ) : (
              <>
                <strong>no Social Security</strong> at all
              </>
            )}
            .
            {advancedClauses.length > 0 && (
              <>
                {' '}
                Plus <ProseList items={advancedClauses} />.
              </>
            )}
          </p>
        </section>

        <div className="flow">
          {/* ───── Step 2: what other income does to that benefit ───── */}
          <section
            className="step"
            id="step-torpedo"
            tabIndex={-1}
            aria-labelledby="step-torpedo-heading"
          >
            <p className="step-kicker">Step 2 of {STEPS.length}</p>
            <h2 className="step-heading" id="step-torpedo-heading">
              The tax torpedo
            </h2>

            <figure className="chart-figure">
              {/* The chart's own settings, and the only control on the page
                  that changes what is drawn rather than what is priced. It
                  rides in the figure's top-right corner rather than on a row
                  above it: a row of its own cost this chart the better part of
                  an inch of screen to hold one small button. Not down among
                  the sliders, because those all move the return and this one
                  does not touch it. */}
              <div className="chart-lines" ref={linesRef}>
                <button
                  type="button"
                  ref={linesButtonRef}
                  className="chart-lines-button"
                  aria-expanded={linesOpen}
                  aria-controls="torpedo-lines"
                  onClick={() => setLinesOpen((open) => !open)}
                >
                  Breakpoints
                  {linesShown > 0 ? ` (${linesShown})` : ''}
                </button>
                {linesOpen && (
                  <div className="chart-lines-panel" id="torpedo-lines">
                    <fieldset className="chart-lines-group">
                      {/* Two switches and their legend, and nothing else.
                          What each threshold costs this return is in the
                          close, what a cliff is is in the disclosure below,
                          and both were being said a third time in a panel that
                          floats over the chart the reader opened it to look
                          at. */}
                      <legend>Health insurance breakpoints</legend>
                      <label className="checkbox-option chart-lines-option">
                        <input
                          type="checkbox"
                          checked={showIrmaaLines}
                          onChange={(e) => setShowIrmaaLines(e.target.checked)}
                        />
                        <span
                          className="chart-key-swatch chart-lines-swatch"
                          aria-hidden="true"
                        />
                        <span>Medicare IRMAA cliffs</span>
                      </label>
                      {/* The same pair of conditions the explainer below
                          carries: nobody on Medicare can claim the credit, and
                          a year without a 400% ceiling has no line to draw. */}
                      {preMedicare && subsidyCliff && (
                        <label className="checkbox-option chart-lines-option">
                          <input
                            type="checkbox"
                            checked={showSubsidyLine}
                            onChange={(e) =>
                              setShowSubsidyLine(e.target.checked)
                            }
                          />
                          <span
                            className="chart-key-swatch chart-lines-swatch chart-key-swatch-subsidy"
                            aria-hidden="true"
                          />
                          <span>
                            {PTC_CLIFF_PERCENT * 100}% poverty-line cliff
                          </span>
                        </label>
                      )}
                    </fieldset>
                  </div>
                )}
              </div>
              <div
                className="chart-container"
                role="img"
                aria-label={`Chart: the marginal tax rate on the next dollar of other income, plotted against total income from ${formatCurrency(
                  axisDomain[0],
                )} to ${formatCurrency(
                  axisDomain[1],
                )} — a fixed ${axisFixedProse} plus $0 to ${formatCurrency(
                  axisMax,
                )} of other income.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={curve}
                    margin={{ top: 22, right: 28, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PALETTE.accent} stopOpacity={CHART.fill} />
                        <stop offset="95%" stopColor={PALETTE.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={PALETTE.edge}
                      strokeWidth={CHART.hairline}
                      vertical={false}
                    />
                    <XAxis
                      {...AXIS_PROPS}
                      dataKey="totalIncome"
                      type="number"
                      domain={axisDomain}
                      tickFormatter={formatCompact}
                    />
                    <YAxis
                      {...AXIS_PROPS}
                      tickFormatter={(value) => `${value}%`}
                      width={CHART.axis}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      cursor={HOVER_CURSOR}
                      content={
                        <CustomTooltip
                          ssBenefit={ssBenefit}
                          filingStatus={filingStatus}
                          muniInterest={muniInterest}
                          beneficiaries={beneficiaries}
                          year={year}
                        />
                      }
                    />
                    {showIrmaaLines &&
                      cliffsOnChart.map((cliff) => (
                        <ReferenceLine
                          className="irmaa-cliff"
                          key={cliff.tier}
                          x={totalIncomeAt(cliff.otherIncome)}
                          stroke={PALETTE.rose}
                          strokeDasharray="4 4"
                          strokeWidth={CHART.rule}
                          label={{
                            value: `IRMAA ${cliff.tier}`,
                            position: 'top',
                            fill: PALETTE.roseBright,
                            fontSize: CHART.label,
                          }}
                        />
                      ))}
                    {/* Pink rather than a second red: it is a cliff like the IRMAA
                        ones, but it belongs to a different reader — the one still
                        buying their own coverage — and the panel that switches
                        them on tells them apart by colour before it tells them
                        apart in words. Fuchsia is what was left: the sky curve,
                        the rose cliffs, the amber marker and every slider on the
                        page already own a colour, muni interest's violet
                        included. */}
                    {showSubsidyLine && subsidyCliffOnChart && (
                      <ReferenceLine
                        className="subsidy-cliff"
                        x={totalIncomeAt(subsidyCliffOnChart.otherIncome)}
                        stroke={PALETTE.fuchsia}
                        strokeDasharray="4 4"
                        strokeWidth={CHART.rule}
                        label={{
                          value: `${PTC_CLIFF_PERCENT * 100}% FPL`,
                          position: 'top',
                          fill: PALETTE.fuchsiaBright,
                          fontSize: CHART.label,
                        }}
                      />
                    )}
                    {hereLine(totalIncome, PALETTE.amber)}
                    <Area
                      type="stepAfter"
                      dataKey="marginalRate"
                      stroke={PALETTE.accent}
                      strokeWidth={CHART.line}
                      fill="url(#rateGradient)"
                      fillOpacity={1}
                      activeDot={HOVER_DOT}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-axis-label">{axisCaption}</p>
            </figure>

            <div className="input-group chart-slider">
              <div className="slider-header">
                <label htmlFor="ordinary-income">Other Income (not Social Security)</label>
                <span className="slider-value amber">{formatCurrency(ordinaryIncome)}</span>
              </div>
              <input
                id="ordinary-income"
                type="range"
                min={0}
                max={axisMax}
                step={incomeSliderStep}
                value={ordinaryIncome}
                onChange={(e) => changeOrdinaryIncome(Number(e.target.value))}
                className="slider-amber"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(axisMax)}</span>
              </div>

              {/* No "You are here." lead. Three things already say that this
                  sentence is about the reader's own point and not the chart's:
                  the dashed amber marker, the amber slider directly above, and
                  the amber figure beside its label — and the sentence names
                  the income the reader set in its first five words. The label
                  was a fourth telling, and it was set in the same bold as the
                  three figures below it, so the one phrase the paragraph
                  stressed hardest was the one carrying no figure at all. */}
              <p className="slider-readout">
                At {formatCurrency(ordinaryIncome)} of other income the next
                dollar is taxed at{' '}
                <strong>{herePoint ? `${herePoint.marginalRate}%` : '\u2014'}</strong>.
                {herePoint && totalIncome > 0 ? (
                  <>
                    {' '}
                    The return itself owes{' '}
                    <strong>{formatCurrency(herePoint.totalTax)}</strong> in federal
                    tax on {formatCurrency(totalIncome)} of total income &mdash; an
                    effective rate of{' '}
                    <strong>{formatPercent(effectiveRateOn(herePoint.totalTax))}</strong>
                    .
                  </>
                ) : null}
              </p>
            </div>

            <details className="explainer">
              <summary>
                <h3 id="tax-torpedo-heading">What is the tax torpedo?</h3>
              </summary>
              <div className="explainer-content">
                <p>
                  Social Security benefits are not taxed dollar-for-dollar. The taxable
                  share depends on <strong>provisional income</strong> — other income
                  plus half of your benefits. Once provisional income passes{' '}
                  {formatCurrency(ssBase50)}, each extra dollar of other income also
                  drags up to 50&cent; of benefits into taxable income; past{' '}
                  {formatCurrency(ssBase85)}, it drags in up to 85&cent;.
                </p>
                <p>
                  So one more dollar earned can raise taxable income by as much as
                  $1.85, and the marginal rate jumps to up to 1.85&times; the statutory
                  bracket: income in the 12% bracket is effectively taxed at{' '}
                  <strong>22.2%</strong>, and income in the 22% bracket at{' '}
                  <strong>40.7%</strong>. That spike above the ordinary bracket rates is
                  the <strong>tax torpedo</strong>.
                </p>
                <p>
                  The torpedo ends as abruptly as it begins. At most 85% of benefits
                  can ever be taxable, and once that cap is reached, additional income
                  stops pulling in benefits — the marginal rate falls straight back to
                  the ordinary bracket, creating the cliff on the right side of the
                  spike. Larger benefits stretch the torpedo across a wider income
                  range (try the slider above), and because the thresholds are fixed in
                  law rather than indexed for inflation, more retirees sail into it
                  every year.
                </p>
                <p>
                  {/* What the two-button year selector used to demonstrate, said
                      once instead of shown to whoever thought to click twice and
                      compare. It is the reason this page exists, so it does not
                      belong behind a control. */}
                  <strong>The thresholds have not moved since they were
                    written.</strong> IRC 86(c) set{' '}
                  {formatCurrency(SS_BASES.single.ssBase50)} and{' '}
                  {formatCurrency(SS_BASES.mfj.ssBase50)} in {SS_BASE50_ENACTED},
                  and {formatCurrency(SS_BASES.single.ssBase85)} and{' '}
                  {formatCurrency(SS_BASES.mfj.ssBase85)} in {SS_BASE85_ENACTED}.
                  Neither has ever been indexed. Everything around them is: the
                  brackets, the standard deduction, the capital-gain bands, and the
                  benefit itself, which takes a cost-of-living raise every January.
                  So a retirement that has not changed at all in real terms sits
                  further past the same line every year. The figures here are{' '}
                  {year}’s; the same return priced a decade from now has more
                  of its benefit in the tax base for no other reason than that.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h3 id="torpedo-strategies-heading">How to mitigate the tax torpedo</h3>
              </summary>
              <div className="explainer-content">
                <ul>
                  <li>
                    <strong>Spend from Roth accounts.</strong> Qualified withdrawals
                    from a Roth IRA or Roth 401(k) are excluded from provisional income
                    entirely.
                  </li>
                  <li>
                    <strong>Spend from taxable accounts.</strong> Selling from a
                    taxable brokerage account adds only the gain to provisional income;
                    the return of your own cost basis is tax-free.
                  </li>
                  <li>
                    <strong>If you can&apos;t stay under it, blast past it.</strong> Once
                    the 85% cap is reached, extra income is taxed at plain bracket
                    rates again. Bunching income — say, one large Roth conversion —
                    into a single year can cost less than sitting in the middle of the
                    spike year after year.
                  </li>
                </ul>
                <p>
                  The right mix depends on account balances, Medicare premium
                  surcharges, and more. The goal itself is concrete: keep
                  provisional income out of the spike, or jump clean over it.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h3 id="irmaa-cliffs-heading">
                  Medicare&apos;s IRMAA cliffs
                </h3>
              </summary>
              <div className="explainer-content">
                <p>
                  Above a MAGI threshold, Medicare adds an{' '}
                  <strong>income-related monthly adjustment amount</strong> to the
                  Part B and Part D premiums of everyone on the return who is
                  enrolled. Unlike the torpedo, it is not a phase-in: one dollar over
                  a threshold triggers the whole surcharge for twelve months. The
                  chart above prices your own tier on hover and will draw the
                  thresholds as red dashed lines if you ask it to, under{' '}
                  <strong>Breakpoints</strong> in the corner of the plot. The
                  first cliff this return
                  can reach costs{' '}
                  <strong>{formatCurrency(cliffs[0].step)}</strong> a year
                  {beneficiaries > 1 ? ' for the two of you' : ''} &mdash; on a single
                  dollar of income.
                </p>
                <p>
                  The lines sit at less other income than their MAGI figures suggest,
                  because the benefits the torpedo drags into AGI get there first
                  {muniInterest > 0
                    ? `, and because Medicare's MAGI is wider than the tax code's — the ${formatCurrency(muniInterest)} of tax-exempt interest set above is added straight back in, moving every line ${formatCurrency(muniInterest)} further left`
                    : '. Medicare\u2019s MAGI is also wider than the tax code\u2019s: tax-exempt interest is added straight back in, so muni bonds move these lines as well as the torpedo'}
                  .
                </p>
                <p>
                  <strong>The x-axis caveat.</strong> Medicare bills on a{' '}
                  {IRMAA_LOOKBACK_YEARS}-year lag: the {year} premiums these lines are
                  priced from are set by {irmaaMagiYear(year)} MAGI, so the {year}{' '}
                  income on this chart is really setting the premium for{' '}
                  {year + IRMAA_LOOKBACK_YEARS}, under a schedule CMS has not
                  published yet. Treat the lines as where the cliffs would fall at{' '}
                  {year} thresholds, not as a bill. The lag cuts both ways: a Roth
                  conversion made now surfaces as a premium two years later, and a
                  one-off spike &mdash; a home sale, an inherited IRA &mdash; keeps
                  costing after the income is gone. Retiring or losing that income is
                  a life-changing event you can appeal on Form SSA-44 rather than
                  simply wait out.
                </p>
                <p>
                  The surcharge never appears on a tax return, which is exactly why it
                  is worth planning around: nothing about filing reveals that one
                  dollar of income cost {formatCurrency(cliffs[0].step)}. It is not
                  included in any of the tax figures here either &mdash; the curve
                  above is federal income tax only.
                </p>
              </div>
            </details>

            {/* Both halves of the condition, the same pair step 2's chart key
                uses. `preMedicare` is the reader: nobody enrolled in Medicare
                can claim the credit. `subsidyCliff` is the statute: the 400%
                ceiling was suspended from 2021 through 2025 and there is no
                cliff to explain in a year without one. `PAGE_TAX_YEAR` has
                one — but the engine still prices both, so the guard stays. */}
            {preMedicare && subsidyCliff ? (
              <details className="explainer">
                <summary>
                  <h3 id="subsidy-cliff-heading">
                    The {PTC_CLIFF_PERCENT * 100}% poverty-line cliff
                  </h3>
                </summary>
                <div className="explainer-content">
                  <p>
                    Health coverage bought on the Marketplace comes with a{' '}
                    <strong>premium tax credit</strong> that pays whatever the
                    benchmark silver plan costs above a set share of household
                    income. IRC 36B(c)(1)(A) allows it to a household whose
                    income is &ldquo;at least 100 percent but not more than 400
                    percent&rdquo; of the federal poverty line. There is no row
                    in the table past 400%, so past 400% the credit is not
                    smaller &mdash; it is nothing. For this household that line
                    is {formatCurrency(subsidyCliff.magi)}:{' '}
                    {PTC_CLIFF_PERCENT * 100}% of the{' '}
                    {formatCurrency(subsidyCliff.povertyLine)} poverty line for{' '}
                    {subsidyCliff.householdSize === 1
                      ? 'one person'
                      : `${subsidyCliff.householdSize} people`}
                    . Switch it on as a pink dashed line under{' '}
                    <strong>Breakpoints</strong> in the corner of the chart;
                    your own distance from it is at the foot of this note.
                  </p>
                  <p>
                    <strong>What it costs is not a fixed figure.</strong> Just
                    under the line the household pays at most{' '}
                    {(subsidyCliff.topApplicablePercentage * 100).toFixed(2)}% of
                    its income &mdash;{' '}
                    {formatCurrency(subsidyCliff.cappedContribution)} &mdash; for
                    the benchmark plan, and the credit covers the rest. One
                    dollar over, it pays the full premium, which depends on ages
                    and county: for a couple in their early sixties it is
                    routinely five figures.
                  </p>
                  <p>
                    <strong>It is not Medicare&apos;s line, or the tax
                      code&apos;s.</strong> 36B(d)(2)(B) counts AGI plus
                    tax-exempt interest plus{' '}
                    <em>the untaxed part of the Social Security benefit</em>.
                    That last term undoes the torpedo: whatever share of the{' '}
                    {formatCurrency(ssBenefit)} benefit stays out of the tax
                    base, this adds straight back, so the whole benefit counts
                    at every income level. The practical difference shows in
                    where the lines sit: raise the benefit by a dollar and the
                    pink line moves a full dollar left, while the red ones move
                    at most 85 cents, because 85 cents is all of that dollar
                    that can ever reach the tax base. Two cliffs, two MAGIs, and
                    no reading one off the other.
                  </p>
                  <p>
                    <strong>You are here.</strong> This return&apos;s household
                    income is {formatCurrency(Math.round(hereSubsidy.magi))},{' '}
                    {(hereSubsidy.fplMultiple * 100).toFixed(0)}% of the poverty
                    line.{' '}
                    {hereSubsidy.overCliff
                      ? 'That is past the cliff: there is no premium tax credit for this year, and coming back under it takes ' +
                      formatCurrency(
                        Math.round(hereSubsidy.magi - (hereSubsidy.cliffMagi ?? 0)),
                      ) +
                      ' less income.'
                      : `Another ${formatCurrency(
                        Math.round(hereSubsidy.headroom ?? 0),
                      )} of it reaches the line, and the dollar after that is the one that costs.`}
                  </p>
                  <p>
                    <strong>The cliff is back, and it was gone.</strong> From
                    2021 through 2025 there was no 400% ceiling at all: ARPA
                    section 9661, extended by the Inflation Reduction Act,
                    replaced the table with one that ran past 400% and capped
                    the household&apos;s own share at 8.5% of income however
                    high income went. That expired for tax years beginning after
                    2025. The poverty line itself runs{' '}
                    {FPL_GUIDELINE_LOOKBACK_YEARS} year behind, where
                    Medicare&apos;s MAGI runs {IRMAA_LOOKBACK_YEARS}: 26 CFR
                    1.36B-1(h) fixes it at the guidelines in effect when open
                    enrolment began, which is the previous 1 November, so {year}{' '}
                    coverage is priced off the {fplGuidelineYear(year)}{' '}
                    guidelines &mdash; already a year old when the year starts.
                  </p>
                  <p>
                    <strong>Who this is not for.</strong> Nobody enrolled in
                    Medicare is eligible for the credit, which is why the line
                    disappears from this chart once everyone on the return has
                    turned 65 &mdash; and why a couple with one spouse on either
                    side of 65 is standing in front of both cliffs at once.
                    Coverage from an employer, a retiree plan or a spouse&apos;s
                    plan takes the credit away too, so a reader with any of
                    those can read this line as decoration. The poverty line
                    used here is the one for the lower 48 and DC; Alaska and
                    Hawaii have their own, higher, so the line falls further
                    right there than it is drawn.{' '}
                    {subsidyCliff.householdSize === 1
                      ? 'The household here is one person; a dependent would move the line right by about $5,500 of income.'
                      : 'The household here is the two people this filing status implies; a dependent past them would move the line right by about $5,500 of income.'}
                  </p>
                </div>
              </details>
            ) : null}

            <details className="explainer">
              <summary>
                <h3 id="senior-deduction-heading">
                  The senior deduction phaseout ({SENIOR_DEDUCTION_FIRST_YEAR}&ndash;
                  {SENIOR_DEDUCTION_LAST_YEAR})
                </h3>
              </summary>
              <div className="explainer-content">
                <p>
                  For tax years {SENIOR_DEDUCTION_FIRST_YEAR} through{' '}
                  {SENIOR_DEDUCTION_LAST_YEAR} only, anyone who reaches age 65 gets an
                  extra <strong>{formatCurrency(SENIOR_DEDUCTION)}</strong> deduction —
                  on top of the standard deduction, on top of the age-65 addition to
                  it, and whether or not they itemize. A couple filing jointly with
                  both spouses over 65 gets {formatCurrency(2 * SENIOR_DEDUCTION)}.
                </p>
                <p>
                  The catch is the phaseout. Each qualifying person&apos;s{' '}
                  {formatCurrency(SENIOR_DEDUCTION)} shrinks by{' '}
                  {formatCents(SENIOR_DEDUCTION_PHASEOUT_RATE)} for every dollar of
                  MAGI above {formatCurrency(phaseoutStart)}, so it is gone at{' '}
                  {formatCurrency(phaseoutEnd)} — exactly $100,000 later, for every
                  status that has one, because a couple where both spouses qualify has
                  twice as much deduction to lose and loses it twice as fast.
                </p>
                <p>
                  Inside that range every extra dollar of income does double duty: it
                  is taxed, and it destroys {formatCents(phaseoutRate)} of deduction.
                  Taxable income therefore rises by{' '}
                  <strong>${taxableIncomePerDollar.toFixed(2)}</strong> per dollar
                  earned, and the 22% bracket bites at{' '}
                  <strong>{formatPercent(0.22 * taxableIncomePerDollar)}</strong>. That
                  is a surtax that appears nowhere on the rate schedule.
                </p>
                <p>
                  Worse, the two humps multiply. MAGI is AGI, which already includes
                  whatever share of your benefits the torpedo has dragged into taxable
                  income — so where the torpedo and the phaseout overlap, one extra
                  dollar raises taxable income by 1.85 &times;{' '}
                  {taxableIncomePerDollar.toFixed(2)} ={' '}
                  <strong>${(1.85 * taxableIncomePerDollar).toFixed(2)}</strong>, and
                  22% becomes{' '}
                  <strong>
                    {formatPercent(0.22 * 1.85 * taxableIncomePerDollar)}
                  </strong>
                  .
                </p>
                <p>
                  On the chart above, the second hump starts where MAGI clears{' '}
                  {formatCurrency(phaseoutStart)} — at less of your own income than
                  that, since the taxable part of your benefits counts toward MAGI too.
                  The rate falls back once the deduction is fully gone at{' '}
                  {formatCurrency(phaseoutEnd)} of MAGI, which{' '}
                  {phaseoutEndsOnChart
                    ? 'is inside the chart at the benefit selected above'
                    : 'sits past the right edge of the chart at the benefit selected above'}
                  . Note that tax-exempt interest is <em>not</em> added back for this
                  phaseout, unlike the MAGI Medicare uses for IRMAA.
                </p>
              </div>
            </details>
          </section>

          {/* ───── The close: the reader's own answer, in one place ─────

              The mirror of the recap that closes step 1. That one names what was
              set; this one says what came of it — and it is the first place on
              the page where the six figures a reader actually leaves with sit
              together rather than one per step.

              Outside step 2 rather than at the foot of it, because it summarises
              both steps and belongs to neither, and last before the
              disclaimer because it is the thing a reader would screenshot. That
              is also why it restates the return above the figures: a screenshot
              of an answer with no question in it is worth nothing. */}
          <section className="answer" id="answer" aria-labelledby="answer-heading">
            <p className="answer-kicker">The answer</p>
            <h2 className="answer-heading" id="answer-heading">
              What this return costs
            </h2>
            <p className="answer-intro">
              Priced for {year}: {FILING_STATUS_PROSE[filingStatus]}, {ageProse},
              with{' '}
              {ssBenefit > 0
                ? `${formatCurrency(ssBenefit)} of Social Security`
                : 'no Social Security'}{' '}
              and {formatCurrency(ordinaryIncome)} of other income
              {muniInterest > 0
                ? `, plus ${formatCurrency(muniInterest)} of tax-exempt interest`
                : ''}
              .
            </p>

            <dl className="answer-figures">
              <div className="answer-figure">
                <dt>Total income</dt>
                <dd>
                  <strong>{formatCurrency(totalIncome)}</strong>
                  <span className="answer-gloss">
                    Social security plus other income
                    {muniInterest > 0
                      ? `, plus ${formatCurrency(muniInterest)} of tax-exempt interest`
                      : ''}
                    . The untaxed part of the benefit is counted here because it
                    is the part the torpedo reaches for; against taxable income it
                    would vanish.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Federal tax</dt>
                <dd>
                  <strong>{formatCurrency(hereTax)}</strong>
                  <span className="answer-gloss">
                    What the {year} return owes. Federal only &mdash; no Medicare
                    premium, which is charged rather than taxed and gets its own
                    line below.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Effective rate</dt>
                <dd>
                  <strong>
                    {totalIncome > 0
                      ? formatPercent(effectiveRateOn(hereTax))
                      : '\u2014'}
                  </strong>
                  <span className="answer-gloss">
                    {totalIncome > 0
                      ? 'That tax over that income: the average across every dollar of it, and the figure to hold against the years the same money would otherwise come out in.'
                      : 'Nothing comes in, so there is no income to average a bill over.'}
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Marginal rate</dt>
                <dd>
                  <strong>
                    {herePoint ? `${herePoint.marginalRate}%` : '\u2014'}
                  </strong>
                  <span className="answer-gloss">
                    What one more dollar of ordinary income costs.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Taxable social security</dt>
                <dd>
                  <strong>
                    {ssBenefit > 0
                      ? `${formatCurrency(taxableSS)} of ${formatCurrency(ssBenefit)}`
                      : 'None'}
                  </strong>
                  <span className="answer-gloss">
                    {ssBenefit > 0
                      ? `${formatPercent(taxableSS / ssBenefit)} of it. 86(a) can never make more than 85% taxable.`
                      : 'Step 1 sets no benefit, so there is nothing for other income to drag in \u2014 the rate follows the ordinary brackets and nothing else.'}
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Medicare surcharge</dt>
                <dd>
                  <strong>
                    {hereIrmaa.tier > 0
                      ? `Tier ${hereIrmaa.tier} of 5 \u2014 ${formatCurrency(hereIrmaa.annualSurcharge)}/yr`
                      : 'None \u2014 the standard premium'}
                  </strong>
                  <span className="answer-gloss">
                    On {formatCurrency(hereMagi)} of MAGI
                    {beneficiaries > 1 ? ', charged to each of you' : ''}.{' '}
                    {hereIrmaa.headroom !== null
                      ? `Another ${formatCurrency(hereIrmaa.headroom)} of it crosses the next cliff, which costs ${formatCurrency(hereIrmaa.nextStep)} per year.`
                      : 'This is the top tier; there is no cliff above it.'}{' '}
                    Billed on a {IRMAA_LOOKBACK_YEARS}-year lag, so this is what{' '}
                    {year} income sets for {year + IRMAA_LOOKBACK_YEARS}.
                  </span>
                </dd>
              </div>
            </dl>

            {/* ───── The link is the return ─────

                The address bar has carried the whole return since the query
                string went in, and the only other place the page names it is the
                failure case: the note that appears when a link asked for
                something this page could not show.

                It belongs here rather than in the header, because what is worth
                sending is the answer, and this is the one place the answer sits
                together. The button is the whole of it — the sentence that used
                to say so in prose came off in the text pass — so a browser with
                no clipboard (`canCopyLink`) is left with nothing here at all. */}
            <div className="answer-share">
              {canCopyLink && (
                <button
                  type="button"
                  className="answer-share-button"
                  onClick={copyLink}
                >
                  Copy link to this return
                </button>
              )}
              {/* `aria-live` rather than `role="status"`: the same announcement,
                  without becoming the second status region on a page whose first
                  one is the link note. Rendered empty rather than conditionally,
                  because a live region has to be on the page before the message
                  lands in it to be read out reliably; CSS hides it while it is. */}
              <p className="answer-share-status" aria-live="polite" aria-atomic="true">
                {copyState === 'copied'
                  ? 'Copied. That link opens this page on this return.'
                  : copyState === 'failed'
                    ? 'This browser would not take the copy. Select the address bar and copy it — it is the same link.'
                    : ''}
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer>
        <p>
          This tool is for educational purposes only and does not constitute tax
          or financial advice. Please consult a qualified tax professional
          regarding your specific situation.
        </p>
      </footer>
    </div>
  );
};

export default App;

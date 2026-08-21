import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {
  marginalRateCurve,
  ltcgMarginalRateCurve,
  maxAnnualSSBenefit,
  avgAnnualSSBenefit,
  SS_BASES,
  TAX_YEARS,
  defaultTaxYear,
  filingParams,
  FilingStatus,
  segmentCurve,
  standingOn,
  splitOtherIncome,
  incomeAxisMax,
  incomeAxisFeatures,
  MIN_INCOME_AXIS,
  standardDeductionFor,
  taxableSocialSecurity,
  qcdLimitFor,
  qcdFor,
  totalIncomeFor,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  seniorDeductionPhaseoutEnd,
  seniorDeductionAllowed,
  irmaaMagi,
  irmaaFor,
  irmaaCliffs,
  irmaaMagiYear,
  IRMAA_LOOKBACK_YEARS,
  ptcCliff,
  ptcFor,
  acaMagi,
  fplGuidelineYear,
  FPL_GUIDELINE_LOOKBACK_YEARS,
  PTC_CLIFF_PERCENT,
  conversionCeilings,
  sizeConversion,
  CONVERSION_MEASURE_LABELS,
  niitFor,
  niitThreshold,
  NIIT_ENACTED,
  NIIT_RATE,
  NIIT_THRESHOLDS,
} from './utils/tax';
import {
  decodeScenario,
  scenarioUrl,
  MAX_MUNI_INTEREST,
} from './utils/scenarioUrl';
import {
  STATE_SS_RULES,
  stateSSRule,
  stateTestDeltas,
  statesTaxingSocialSecurity,
  statesWithMovingTests,
  taxesBenefitsIn,
} from './utils/stateTax';
import { formatCurrency } from './utils/format';
import { PALETTE } from './palette';
import type {
  TaxYear,
  LTCGMarginalRatePoint,
  MarginalRatePoint,
  CurveSegment,
  CurveStanding,
  IrmaaCliff,
  PtcCliff,
  ConversionCeilingId,
} from './utils/tax';

/**
 * One worked example in four steps, in the order a reader builds it: the
 * benefit they will collect, what the rest of their income does to it, how
 * much of that rest is a long-term capital gain, and how many more dollars
 * they can take out before the next one costs more. Every step prices the same
 * return, so a figure set in step 1 is still set in step 4.
 *
 * A gain is a *share* of the income entered in step 2, never something added
 * on top of it — see `splitOtherIncome`. So the reader's total income is one
 * number they set once, and step 3 moves only its composition. That is what
 * lets the two charts price the same return: step 2 sweeps the total holding
 * the split, step 3 sweeps the split holding the total.
 *
 * The steps stay mounted and the page scrolls, where the tab strip this
 * replaced swapped one panel for another. Three reasons to scroll: a step you
 * have to click into existence reads as optional, and these are not; steps 2
 * and 3 both quote figures the reader set in step 1, which only works if
 * scrolling back to them is possible; and printing or Ctrl-F now reaches the
 * whole page rather than the open panel. What it costs is length, which is
 * what the step nav and the next-step boxes are for.
 *
 * Four more sections stood here as tabs — Medicare, Strategies, Over Time and
 * State Taxes — and are coming back. What they rendered has gone, but
 * everything they rendered *from* stays: `irmaaFor`, `projectYears`,
 * `compareSequencing`, `lumpSumElection` and the state table are all still in
 * `utils/`, still under test, and still exported.
 *
 * Every step has the same shape: the chart, then the one control that says
 * where on that chart the reader is standing, then the collapsed explainers,
 * then the box to the next step. Step 1 is the exception that sets the rule —
 * it has no curve of its own, so the return itself (year, filing status, age)
 * stands where the chart stands on the steps below it, and the benefit slider
 * follows it in the control's place. Step 4's control is a radio group rather
 * than a slider, because the lines a conversion is sized against are six named
 * places rather than a continuum — but it does the same job, moving a marker
 * along a curve that is already drawn.
 *
 * Step 4 is the one that answers the question in the h1. Steps 2 and 3 price
 * the next dollar; step 4 prices a block of them, by asking which line the
 * reader would rather not cross and reading back the largest conversion that
 * stays under it. It re-draws step 2's curve rather than a new one, because
 * the conversion is measured on step 2's own axis: a Roth conversion is
 * ordinary income, so it walks the reader rightwards along the same sweep.
 *
 * So the inputs are split across the steps that move them: year, filing
 * status, age and the benefit are step 1, other ordinary income is step 2 and
 * the planned capital gain is step 3 — each of the last two being a point on
 * the axis its chart sweeps. Tax-exempt interest and the charitable
 * distribution belong to no axis and sit in a collapsed `advanced-inputs`
 * block at the end of step 1, because each starts at $0 and at $0 leaves every
 * chart on the page identical.
 */
const STEPS = [
  {
    id: 'benefit',
    navLabel: 'Your benefit',
    heading: 'Your Social Security benefit',
    blurb:
      'Set the return the whole page prices \u2014 the year, who files it, and how much Social Security it collects.',
  },
  {
    id: 'torpedo',
    navLabel: 'The tax torpedo',
    heading: 'The tax torpedo',
    blurb:
      'Add everything that is not Social Security, and see what the next dollar of it really costs.',
  },
  {
    id: 'gains',
    navLabel: 'Capital gains',
    heading: 'Capital Gains Stacking',
    blurb:
      'Say how much of that income is a long-term gain, and watch the two effects stack.',
  },
  {
    id: 'conversion',
    navLabel: 'Roth conversion',
    heading: 'Sizing the conversion',
    blurb:
      'Pick the line you would rather not cross, and read off the largest conversion that fits under it.',
  },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const FILING_STATUS_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of Household' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
];

/** How each status reads inside a sentence. */
const FILING_STATUS_PROSE: Record<FilingStatus, string> = {
  single: 'a single filer',
  mfj: 'a married couple filing jointly',
  mfs: 'a married filer filing separately who lived with their spouse',
  hoh: 'a head of household',
};

/** A rate given as a fraction, rendered the way the chart axis renders it. */
const formatPercent = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}%`;

/** A rate given as a fraction, rendered as cents lost per dollar earned. */
const formatCents = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}\u00A2`;

/** "Colorado, Connecticut and Vermont" — no Oxford comma, as elsewhere here. */
const sentenceList = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

/**
 * The point on a swept curve at the reader's own value.
 *
 * Both charts price a whole axis, so neither one moves when the slider beneath
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
 * The dashed vertical marking the reader's own place on a chart.
 *
 * The slider under each chart is a *position* on a curve that is already
 * drawn, not an input to it, and nothing on screen said so: an "Other Income"
 * slider sitting under a chart whose x-axis is other income reads as the
 * control that draws the curve. The line is what says otherwise.
 * It takes the colour of the slider that drives it — amber on step 2, emerald
 * on step 3 — so the pairing is legible without reading either label, and a
 * heavier dash than the IRMAA cliffs it shares step 2 with.
 *
 * The label goes *inside* the plot because the strip above the axis top is
 * already the cliff labels' (`position: 'top'`), and it flips to the far side
 * of the line past the middle of the axis so the text never runs off the right
 * edge. `insideTopLeft`/`insideTopRight` are named for a rectangle; on a line,
 * which is a rectangle of zero width, they mean "text to the right of it" and
 * "text to the left of it".
 *
 * A plain function, not a component: recharts identifies its children by
 * element type, and a wrapper component would render as an unknown child.
 */
const hereLine = (value: number, axisMax: number, colour: string) => (
  <ReferenceLine
    className="here-line"
    x={value}
    stroke={colour}
    strokeDasharray="6 4"
    strokeWidth={2}
    label={{
      value: 'You are here',
      position: value > axisMax * 0.6 ? 'insideTopRight' : 'insideTopLeft',
      fill: colour,
      fontSize: 11,
      fontWeight: 600,
    }}
  />
);

/**
 * The curve as a sentence: every stretch of constant marginal rate, named in
 * order, left to right.
 *
 * `segmentCurve` has carried this shape since the first tooltip — it is what
 * says "stay under $x or over $y" over a hill, and what `standingOn`
 * classifies into advice — but every word the page has ever spent on it has
 * been relative to wherever the reader happens to be standing. The picture
 * itself went undescribed: a recharts chart is an SVG of unlabelled paths, so
 * a reader who cannot see it got nothing at all from the centrepiece of the
 * page, and a reader who can still had to read the band edges off a compact
 * axis.
 *
 * Each band is named by its own last sampled point, so consecutive bands
 * quote figures one sampling step apart rather than a shared edge. That is the
 * approximation the advice under every slider already makes when it quotes
 * `hump.start` and `hump.end`, and the step is $250 on the narrowest chart.
 */
const bandRun = <T,>(segments: CurveSegment<T>[]): string | null => {
  if (segments.length === 0) return null;
  if (segments.length === 1) {
    const [only] = segments;
    return `a flat ${only.rate}% the whole way, from ${formatCurrency(only.start)} to ${formatCurrency(only.end)}`;
  }
  const last = segments.length - 1;
  return segments
    .map((seg, i) => {
      if (i === 0) return `${seg.rate}% up to ${formatCurrency(seg.end)}`;
      if (i === last) return `then ${seg.rate}% out to ${formatCurrency(seg.end)}`;
      return `${seg.rate}% to ${formatCurrency(seg.end)}`;
    })
    .join(', ');
};

/**
 * How many times a curve humps, as prose. Only two and up ever reach it: none
 * and one are sentences of their own below, because "it humps once" says less
 * than naming the one hump does.
 */
const HUMP_COUNTS: Record<number, string> = {
  2: 'twice',
  3: 'three times',
  4: 'four times',
};

/**
 * Where the humps are, in one sentence.
 *
 * A hump is `segmentCurve`'s `hill`: a stretch dearer than the ground on both
 * sides of it, which on this page is either the Social Security inclusion
 * phase or the senior deduction's phaseout, and often both. Deliberately
 * unnamed, for the same reason `StandingNote` leaves it unnamed — the shape is
 * what matters and two different mechanisms draw it, so the explainers below
 * the chart are where the mechanism belongs.
 *
 * The claim made about every hump is the one its classification actually
 * guarantees: the ground just past it is cheaper. "Costs more than the ground
 * on both sides" is only true of a hump with ground on both sides, and the
 * gains curve routinely humps against its own left edge.
 */
const humpNote = <T,>(segments: CurveSegment<T>[]): string => {
  const hills = segments.filter((seg) => seg.type === 'hill');
  const span = (hill: CurveSegment<T>): string =>
    `${hill.rate}% between ${formatCurrency(hill.start)} and ${formatCurrency(hill.end)}`;

  if (hills.length === 0) {
    return 'No stretch of it is a hump: none costs more than the ground on both sides of it.';
  }
  if (hills.length === 1) {
    return `The hump is the ${hills[0].rate}% stretch between ${formatCurrency(hills[0].start)} and ${formatCurrency(hills[0].end)}; the ground just past it is cheaper, which is what makes it worth stepping over rather than into.`;
  }
  return `It humps ${HUMP_COUNTS[hills.length] ?? `${hills.length} times`}: ${hills.map(span).join(', and ')} — the ground just past each one is cheaper than the ground on it.`;
};

interface CurveCaptionProps<T> {
  /** Referenced by the chart's `aria-describedby`, so it needs a stable id. */
  id: string;
  segments: CurveSegment<T>[];
  /** How the caption opens, before the bands: what this particular sweep is. */
  lead: React.ReactNode;
}

/**
 * The text alternative to a chart, and the only place on the page that states
 * where the hump starts and stops without the reader first putting a slider
 * inside it.
 *
 * Visible rather than screen-reader-only on purpose: the band edges are the
 * chart's whole content, and reading them off a compact axis is guesswork for
 * everybody.
 */
function CurveCaption<T>({ id, segments, lead }: CurveCaptionProps<T>) {
  const bands = bandRun(segments);
  if (!bands) return null;
  return (
    <figcaption className="chart-caption" id={id}>
      <strong>The curve in words.</strong> {lead} {bands}.
      {/* A curve of one band has already said it has no hump by being one
          band, so the hump note would only repeat it back. */}
      {segments.length > 1 ? ` ${humpNote(segments)}` : ''}
    </figcaption>
  );
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: PALETTE.surfaceRaised,
  border: `1px solid ${PALETTE.edge}`,
  borderRadius: '8px',
  color: PALETTE.inkBright,
  padding: '0.75rem',
};

interface TooltipPayloadPoint {
  income: number;
  marginalRate: number;
  totalTax: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipPayloadPoint }>;
  ssBenefit: number;
  segments: CurveSegment<MarginalRatePoint>[];
  filingStatus?: FilingStatus;
  muniInterest?: number;
  /** Charitable distribution excluded from the x-axis income, if any. */
  qcd?: number;
  /** How much of the x-axis income is a long-term gain rather than ordinary. */
  ltcg?: number;
  /** How many people on the return are enrolled in Medicare. */
  beneficiaries?: number;
  /** Which year's premium schedule prices the IRMAA line. */
  year?: TaxYear;
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  ssBenefit,
  segments,
  filingStatus = 'single',
  muniInterest = 0,
  qcd = 0,
  ltcg = 0,
  beneficiaries = 1,
  year = defaultTaxYear(),
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const segment = segments.find(
    (seg) => point.income >= seg.start && point.income <= seg.end,
  );
  // The axis is every dollar that is not Social Security, gains included, so
  // the hovered income has to be split before anything is priced off it.
  const split = splitOtherIncome(point.income, ltcg);
  // The hovered point, as a whole return, so that every figure below is priced
  // off one object rather than off a different subset of the props each time.
  const scenario = { ...split, ssBenefit, filingStatus, muniInterest, qcd, year };
  // Medicare reads a wider MAGI than the tax chain does — tax-exempt interest
  // is added back — so it has to be recomputed here rather than read off the
  // curve, which only carries taxable figures.
  const irmaa = irmaaFor(irmaaMagi(scenario), {
    filingStatus,
    beneficiaries,
    year,
  });
  // The x-axis is income before the gift, so the charitable exclusion has to
  // come back out of the total the header quotes. A gift can only be excluded
  // from the ordinary half — the gain is a sale, not a distribution.
  const given = qcdFor(scenario);
  // Not `point.income + ssBenefit`: tax-exempt interest is spent like any
  // other dollar and the gift never reaches the filer, so both belong in what
  // this return takes in. See `totalIncomeFor`.
  const totalIncome = totalIncomeFor(scenario);
  // Chapter 2A is inside `point.totalTax` — the curve plots `totalFederalTax`
  // now — so the only thing left to say is how much of it, and on what.
  const niit = niitFor(scenario);
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        Other income {formatCurrency(point.income)} · Total income {formatCurrency(totalIncome)}
      </div>
      {split.ltcg > 0 && (
        <div style={{ fontSize: '0.8125rem', color: PALETTE.emerald }}>
          Of which {formatCurrency(split.ltcg)} is a long-term gain —{' '}
          {formatCurrency(split.ordinaryIncome)} is ordinary
        </div>
      )}
      {given > 0 && (
        <div style={{ fontSize: '0.8125rem', color: PALETTE.lime }}>
          Less {formatCurrency(given)} given straight to charity —{' '}
          {formatCurrency(point.income - given)} of it reaches the return
        </div>
      )}
      <div>
        Marginal Rate: <strong style={{ color: PALETTE.accent }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: PALETTE.orange }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      {niit.tax > 0 && (
        <div style={{ fontSize: '0.8125rem', color: PALETTE.violet }}>
          Including {formatCurrency(niit.tax)} of net investment income tax —
          3.8% of {formatCurrency(niit.base)}
        </div>
      )}
      <div>
        Medicare IRMAA:{' '}
        <strong style={{ color: PALETTE.roseBright }}>
          {formatCurrency(irmaa.annualSurcharge)}/yr
        </strong>
        {irmaa.tier > 0 ? ` (tier ${irmaa.tier} of 5)` : ''}
      </div>
      {irmaa.headroom !== null && (
        <div style={{ fontSize: '0.8125rem', color: PALETTE.inkMuted }}>
          {formatCurrency(irmaa.headroom)} of MAGI to the next cliff, then{' '}
          {formatCurrency(irmaa.nextStep)}/yr more
        </div>
      )}
      {segment && segment.type === 'hill' && (
        <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${PALETTE.edge}`, paddingTop: '0.5rem', fontSize: '0.875rem', color: PALETTE.inkMuted }}>
          Consider avoiding this tax hill by staying under {formatCurrency(segment.start)} or over {formatCurrency(segment.end)}
        </div>
      )}
      {segment && segment.type === 'valley' && (
        <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${PALETTE.edge}`, paddingTop: '0.5rem', fontSize: '0.875rem', color: PALETTE.inkMuted }}>
          Consider filling out this tax valley at {formatCurrency(point.income)}
        </div>
      )}
    </div>
  );
};

interface LTCGTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LTCGMarginalRatePoint }>;
  /**
   * The whole other-income figure the swept gain is carved *out of*, not a
   * figure the gain sits on top of. It is the same at every point on the axis;
   * only how much of it is gain moves.
   */
  ordinaryIncome: number;
  ssBenefit: number;
  segments: CurveSegment<LTCGMarginalRatePoint>[];
  /** Tax-exempt interest, which the return takes in without reporting it. */
  muniInterest?: number;
  /** Charitable distribution asked for, before the ordinary-income cap. */
  qcd?: number;
  /** Needed only to price the gift against the right annual limit. */
  filingStatus?: FilingStatus;
  /** Needed only to price the gift against the right annual limit. */
  year?: TaxYear;
}

export const LTCGTooltip: React.FC<LTCGTooltipProps> = ({
  active,
  payload,
  ordinaryIncome,
  ssBenefit,
  segments,
  muniInterest = 0,
  qcd = 0,
  filingStatus = 'single',
  year = defaultTaxYear(),
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const segment = segments.find(
    (seg) => point.ltcg >= seg.start && point.ltcg <= seg.end,
  );
  // Same total as the torpedo tooltip quotes, from the same definition — the
  // two used to say different numbers about the same return, because this one
  // left out tax-exempt interest and the charitable gift. See `totalIncomeFor`.
  //
  // It is not quite fixed across this axis, despite what the sweep holds
  // still: a gift can only come out of the ordinary half, so once the gain
  // grows past what is left beside it, less of the gift is excludable and more
  // of the same income reaches the return.
  const scenario = {
    ...splitOtherIncome(ordinaryIncome, point.ltcg),
    ssBenefit,
    muniInterest,
    qcd,
    filingStatus,
    year,
  };
  const totalIncome = totalIncomeFor(scenario);
  // Chapter 2A is inside `point.totalTax` — the curve plots `totalFederalTax`
  // now — so the only thing left to say is how much of it, and on what.
  const niit = niitFor(scenario);
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        {formatCurrency(point.ltcg)} of {formatCurrency(ordinaryIncome)} is gain · Total income {formatCurrency(totalIncome)}
      </div>
      <div>
        Marginal Rate: <strong style={{ color: PALETTE.amber }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: PALETTE.orange }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      {niit.tax > 0 && (
        <div style={{ fontSize: '0.8125rem', color: PALETTE.violet }}>
          Including {formatCurrency(niit.tax)} of net investment income tax —
          3.8% of {formatCurrency(niit.base)}
        </div>
      )}
      {segment && segment.type === 'hill' && (
        <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${PALETTE.edge}`, paddingTop: '0.5rem', fontSize: '0.875rem', color: PALETTE.inkMuted }}>
          Consider avoiding this tax hill by staying under {formatCurrency(segment.start)} or over {formatCurrency(segment.end)}
        </div>
      )}
      {segment && segment.type === 'valley' && (
        <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${PALETTE.edge}`, paddingTop: '0.5rem', fontSize: '0.875rem', color: PALETTE.inkMuted }}>
          Consider filling out this tax valley at {formatCurrency(point.ltcg)}
        </div>
      )}
    </div>
  );
};

/**
 * Which of the five things `StandingNote` is about to say at length, in the
 * one sentence that opens it.
 *
 * Lifted out because the live region reads it too — the advice paragraph is
 * five sentences of arithmetic, which is the right length to read and the
 * wrong length to have read aloud on every notch of a drag, so the region
 * takes this line and leaves the rest on the page. Sharing it is what keeps
 * the two from drifting: the branches below select on the same conditions in
 * the same order, and there is nowhere for a sixth position to be added to
 * one and not the other.
 */
const standingHeadline = (
  standing: CurveStanding<MarginalRatePoint> | null,
): string => {
  if (!standing) return '';
  const { kind, next, hump } = standing;
  if (kind === 'peak' && hump) return 'You are standing on the hump.';
  if (kind === 'climbing' && hump) return 'You are on the climb.';
  if (kind === 'valley' && next) return 'You are on the valley floor.';
  if (kind === 'past' && hump) return 'The hump is behind you.';
  return 'This return has no hump.';
};

interface StandingNoteProps {
  /** Where the reader is standing on step 2's curve. Null before it is drawn. */
  standing: CurveStanding<MarginalRatePoint> | null;
  /** The reader's own place on the axis — the figure the slider holds. */
  at: number;
}

/**
 * Why this particular reader should move their income up, down, or not at all.
 *
 * The tooltip has always carried this arithmetic — "stay under $x or over $y"
 * for a hill, "fill this valley" for a valley — but only for whichever point
 * the mouse happened to be over, which is nobody's point in particular and no
 * point at all on a touchscreen. The reader's own place is the one place worth
 * saying it about, so here it is said out loud, keyed to the slider and shown
 * without being asked for.
 *
 * Every branch names dollar figures the reader can act on rather than the
 * mechanism behind them: the hump is "the dearest stretch on this chart", not
 * the 85% inclusion cap, because the same shape is also drawn by the senior
 * deduction's phaseout, and the explainers below the chart are where the
 * mechanism belongs.
 */
export const StandingNote: React.FC<StandingNoteProps> = ({ standing, at }) => {
  if (!standing) return null;
  const { kind, here, prev, next, hump, cheaperBehind } = standing;
  const rate = `${here.rate}%`;

  if (kind === 'peak' && hump) {
    const drop = at - hump.start;
    const clear = next ? (
      <>
        clearing {formatCurrency(next.start)} &mdash;{' '}
        {formatCurrency(next.start - at)} more &mdash; takes it to {next.rate}%
      </>
    ) : null;
    return (
      <p className="slider-advice">
        <strong>{standingHeadline(standing)}</strong> The next dollar costs{' '}
        {rate} &mdash; the highest rate this chart reaches, and it holds from{' '}
        {formatCurrency(hump.start)} to {formatCurrency(hump.end)}.{' '}
        {prev ? (
          <>
            Coming back under {formatCurrency(hump.start)}
            {drop > 0 ? (
              <> &mdash; {formatCurrency(drop)} less income &mdash;</>
            ) : null}{' '}
            takes the next dollar down to {prev.rate}%
            {clear ? <>; {clear}</> : null}.{' '}
          </>
        ) : (
          <>
            It starts at the first dollar of other income, so there is no way
            off it to the left
            {clear ? <>: {clear}</> : null}.{' '}
          </>
        )}
        Every dollar in between is charged the hump rate, so the move that pays
        is around this stretch rather than into it: stop short of the near edge,
        or take enough at once to land past the far one.
      </p>
    );
  }

  if (kind === 'climbing' && hump) {
    return (
      <p className="slider-advice">
        <strong>{standingHeadline(standing)}</strong> The next dollar costs {rate}, and{' '}
        {formatCurrency(hump.start - at)} further on &mdash; at{' '}
        {formatCurrency(hump.start)} &mdash; the rate reaches {hump.rate}% and
        holds to {formatCurrency(hump.end)}, the dearest stretch on this chart.
        Income that stays short of {formatCurrency(hump.start)} is charged at{' '}
        {rate}; income that cannot is cheaper taken all at once, in one year
        that clears the hump, than a slice at a time inside it.
      </p>
    );
  }

  if (kind === 'valley' && next) {
    return (
      <p className="slider-advice">
        <strong>{standingHeadline(standing)}</strong> The next dollar costs{' '}
        {rate}, and so does every dollar up to {formatCurrency(next.start)}{' '}
        &mdash; {formatCurrency(next.start - at)} of room from here &mdash;
        after which the rate steps to {next.rate}%
        {hump ? (
          <>
            {' '}
            and climbs to {hump.rate}% by {formatCurrency(hump.start)}
          </>
        ) : null}
        . That room is what a Roth conversion or a larger withdrawal is for: the
        same dollar costs {rate} taken here
        {hump
          ? ` and ${hump.rate}% taken in a year that has already climbed to ${formatCurrency(hump.start)}`
          : ''}
        .
      </p>
    );
  }

  if (kind === 'past' && hump) {
    return (
      <p className="slider-advice">
        <strong>{standingHeadline(standing)}</strong> The next dollar costs {rate},
        against {hump.rate}% back between {formatCurrency(hump.start)} and{' '}
        {formatCurrency(hump.end)}
        {next
          ? `, and it holds at ${rate} until ${formatCurrency(next.start)}, where it steps to ${next.rate}%`
          : ''}
        . Whatever that stretch was dragging into the tax base has all been
        dragged in, so each further dollar is charged at its own bracket rate
        again.{' '}
        {cheaperBehind ? (
          <>
            Deferral is worth what the receiving year is lower by: the nearest
            cheaper ground on this chart is {cheaperBehind.rate}% between{' '}
            {formatCurrency(cheaperBehind.start)} and{' '}
            {formatCurrency(cheaperBehind.end)}, so a dollar deferred into a
            year that starts there costs {cheaperBehind.rate}% rather than {rate}.
          </>
        ) : (
          <>
            Nothing behind you on this chart is cheaper than {rate}, so
            deferring a dollar out of this year buys nothing on its own &mdash;
            it has to land in a year with less other income in it, not merely a
            later one.
          </>
        )}
      </p>
    );
  }

  return (
    <p className="slider-advice">
      <strong>{standingHeadline(standing)}</strong> The next dollar costs {rate}
      {next
        ? `, and holds there to ${formatCurrency(next.start)}, where it steps to ${next.rate}%`
        : ''}
      . No dollar on this chart costs more than the bracket it lands in &mdash;
      there is no stretch where an extra dollar drags something else into the
      tax base with it &mdash; so the ordinary rule is the whole rule here: take
      income in the years your bracket is lowest.
    </p>
  );
};

/**
 * Sampling interval for a swept curve, and the step of any slider walking it.
 *
 * The interval doubles each time the axis does, so the widest chart this app
 * can draw samples no more points than the narrowest one always did — at most
 * 600 either way. The widest is not step 2's: a conversion sized against the
 * top of the 22% bracket can carry a joint return past $250,000 of other
 * income, and a maxed charitable gift on top of that further still.
 *
 * The last rung exists for links rather than for sliders. Nothing a reader can
 * click takes the axis past $300,000, but a link can name any income up to
 * `MAX_OTHER_INCOME`, and without the rung a $1,000,000 return would sweep a
 * thousand points where every other chart on the page sweeps at most six
 * hundred.
 */
const curveStepFor = (axisMax: number): number =>
  axisMax > 600_000 ? 2000 : axisMax > 300_000 ? 1000 : axisMax > 150_000 ? 500 : 250;

/**
 * The step the fragment names, for a reader who followed `#step-conversion`
 * rather than the nav.
 *
 * The query string carries the return and the fragment carries the place — see
 * `scenarioUrl`. The browser does the scrolling on its own; all this does is
 * mark the right nav button current, which it otherwise would not, leaving a
 * reader looking at step 4 under a nav insisting they are on step 1.
 */
const stepFromHash = (hash: string): StepId | null => {
  const id = hash.replace(/^#step-/, '');
  return STEPS.some((s) => s.id === id) ? (id as StepId) : null;
};

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

  const [step, setStep] = useState<StepId>(
    () => stepFromHash(window.location.hash) ?? 'benefit',
  );
  const [year, setYear] = useState<TaxYear>(opening.year);
  const [ssBenefit, setSsBenefit] = useState<number>(opening.ssBenefit);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(opening.filingStatus);
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(opening.ordinaryIncome);
  const [plannedLtcg, setPlannedLtcg] = useState<number>(opening.plannedLtcg);
  const [isSenior, setIsSenior] = useState<boolean>(opening.isSenior);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(opening.spouseIsSenior);
  const [muniInterest, setMuniInterest] = useState<number>(opening.muniInterest);
  const [qcd, setQcd] = useState<number>(opening.qcd);
  /**
   * Which line step 4 sizes the conversion against. The top of the 12% bracket
   * is the default because it is the one a reader arrives already thinking
   * about — the others are lines they have to be told exist, which is what the
   * picker's own captions are for.
   */
  const [ceilingId, setCeilingId] = useState<ConversionCeilingId>(opening.ceilingId);
  /**
   * Where the reader lives, as a postal abbreviation, or `''` for a reader who
   * has not said.
   *
   * The only input on this page that moves no figure. State treatment of a
   * benefit is nine different rules and no two of them share a shape, so the
   * app prints them and cites them rather than modelling them wrong — which
   * means this selects a paragraph under step 2's chart and nothing else.
   */
  const [homeState, setHomeState] = useState<string>(opening.homeState);

  /**
   * Whose reading the live region is carrying, or null before the reader has
   * moved anything.
   *
   * Every readout on this page is silent to a screen reader: moving a slider
   * announces the slider's own value and nothing else, so the "you are here"
   * sentence, the advice under it and the effective rate all change unheard.
   * A live region fixes that, and the whole difficulty is how much to put in
   * one — the seven closing figures read out on every notch of a drag would be
   * worse than the silence they replaced. So the region carries exactly one
   * step's reading: the step whose control was last touched.
   *
   * Keyed to the control rather than to the step the nav marks current,
   * because every step is mounted at once and a reader can be working step 3's
   * slider with the nav still on step 1. And one region rather than four,
   * because step 1's benefit moves all four readings — four regions would
   * queue four announcements for one drag, which is the noise this is trying
   * to avoid.
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
   * be stale the moment a slider moved — where the address bar never is. So
   * the failure case points at the address bar, which is the same link the
   * button would have put on the clipboard, character for character. That is
   * only true because the button copies `location.href` verbatim rather than
   * building its own URL.
   */
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyLink = (): void => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  /**
   * The address bar, kept in step with the return.
   *
   * `replaceState`, not `pushState`: a slider fires a change per notch, so
   * pushing would spend a history entry on every $500 of income and turn Back
   * into a scrub through the drag that got here. Replacing means the address
   * is shareable at every instant and Back still leaves the page.
   *
   * The whole URL is rebuilt each time rather than the search alone, because
   * `replaceState` takes a URL: passing a bare `?query` would drop the
   * `#step-…` fragment the reader may have arrived on.
   */
  useEffect(() => {
    const scenario = {
      year,
      filingStatus,
      ssBenefit,
      ordinaryIncome,
      plannedLtcg,
      isSenior,
      spouseIsSenior,
      muniInterest,
      qcd,
      ceilingId,
      homeState,
    };
    window.history.replaceState(
      window.history.state,
      '',
      scenarioUrl(scenario, window.location),
    );
    /* The address just changed, so whatever is on the clipboard is a different
       return from the one on screen and "Copied" has stopped being true of
       it. Same reasoning as the link note's Dismiss: a message about an
       arrival cannot be kept current, so it goes when the return moves. */
    setCopyState('idle');
  }, [
    year,
    filingStatus,
    ssBenefit,
    ordinaryIncome,
    plannedLtcg,
    isSenior,
    spouseIsSenior,
    muniInterest,
    qcd,
    ceilingId,
    homeState,
  ]);

  const yearFiling = filingParams(year, filingStatus);
  /**
   * The single filer's figures, kept alongside the selected status's so the
   * two notes that compare against them — head of household's wider bands, a
   * separate return's identical ones — can name real numbers for the year on
   * screen rather than a figure written down when the note was.
   */
  const singleFiling = filingParams(year, 'single');
  /**
   * Where a separate return's rate schedule stops matching a single filer's.
   *
   * IRC 1(j)(2)(D) halves the joint brackets to make the separate ones, which
   * leaves them identical to the single schedule right up until the separate
   * 35% band ends and jumps to 37% while a single filer still has room. That
   * is the second-to-last threshold, and it moves every year: $375,800 in
   * 2025, $384,350 in 2026.
   */
  const mfsBrackets = filingParams(year, 'mfs').brackets;
  const mfsSingleDivergence = mfsBrackets[mfsBrackets.length - 2].upTo;

  /**
   * The state footnote's whole input, which is a lookup and not a sum.
   *
   * `homeStateRule` stays set when the selected state drops off the year's
   * list — West Virginia does exactly that between 2025 and 2026 — because a
   * reader who said "West Virginia" and then changed the year is owed the
   * sentence explaining that the phase-out finished, not a silently cleared
   * selector.
   */
  const homeStateRule = homeState ? stateSSRule(homeState) : undefined;
  const homeStateTaxes = homeStateRule
    ? taxesBenefitsIn(homeStateRule, year)
    : false;
  const homeStateDeltas = homeStateRule
    ? stateTestDeltas(homeStateRule, year)
    : [];
  const statesTaxing = statesTaxingSocialSecurity(year);
  const movingStates = statesWithMovingTests(year);

  /**
   * Switching years re-prices the benefit as well as the brackets. Someone who
   * has not moved the slider gets the new year's average, because watching the
   * COLA raise the benefit while the thresholds sit still is the entire point
   * of the comparison. Someone who picked a figure keeps it, clamped to the new
   * year's maximum so the slider can never sit past its own right edge.
   */
  const changeYear = (next: TaxYear): void => {
    setSsBenefit((current) =>
      current === avgAnnualSSBenefit(year)
        ? avgAnnualSSBenefit(next)
        : Math.min(current, maxAnnualSSBenefit(next)),
    );
    // The charitable limit is indexed too, and it can fall when the year does.
    setQcd((current) =>
      Math.min(current, qcdLimitFor({ filingStatus, year: next })),
    );
    setYear(next);
    announce('benefit');
  };

  /**
   * The gain is a share of the other income, so it can never be more than
   * there is. Pulling the income slider down under a gain already set drags
   * the gain down with it rather than leaving it standing past its own
   * ceiling — the same re-cap the charitable gift gets when the limit falls.
   */
  const changeOrdinaryIncome = (next: number): void => {
    setPlannedLtcg((current) => Math.min(current, next));
    setOrdinaryIncome(next);
    announce('torpedo');
  };

  /**
   * The charitable limit is per individual, so it halves on the way from a
   * joint return to any other one. Re-cap the gift rather than leaving the
   * slider parked past its own right edge.
   */
  const changeFilingStatus = (next: FilingStatus): void => {
    setQcd((current) => Math.min(current, qcdLimitFor({ filingStatus: next, year })));
    setFilingStatus(next);
    announce('benefit');
  };

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;

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
   *
   * A charitable gift widens it too, and it is the one input that can widen it
   * a lot: the gift comes off the front of the income, so a joint return giving
   * its full $216,000 is asking for a chart whose first $216,000 is a flat run
   * at nothing. That run is what the gift buys, so it is worth the width.
   */
  const axisMax = useMemo(
    () =>
      incomeAxisMax(
        { ssBenefit, filingStatus, seniors, muniInterest, qcd, year, ltcg: plannedLtcg },
        { minimum: Math.max(MIN_INCOME_AXIS, ordinaryIncome) },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, qcd, year, plannedLtcg, ordinaryIncome],
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
   * The statutory annual QCD limit for this return, and the right edge of the
   * slider under it.
   *
   * The slider used to stop at `min(limit, axisMax)`, which meant a joint
   * return — whose limit 408(d)(8)(A) doubles, to $216,000 for 2025 — was cut
   * off at the chart's $150,000 domain. That is the chart clipping the statute,
   * which is backwards: the gift is a fact about the return, and the axis is
   * drawn to show the return. So the slider runs to the limit and the axis
   * follows it out, because `incomeAxisFeatures` counts the gift's own far
   * side as a feature to make room for.
   */
  const qcdLimit = qcdLimitFor({ filingStatus, year });

  /**
   * The two inputs the page does not open with.
   *
   * Both start at $0, and at $0 both are a no-op: every chart on the page
   * prices the identical scenario whether this section is open or shut. That
   * is the whole test for what belongs in here — year, filing status, age,
   * benefit and other income all change the picture the moment the page loads,
   * so they stay out, and so does the planned capital gain, which is step 3's
   * own position marker and belongs under the chart it marks. What it costs is
   * that a slider you cannot see is a slider you forget, which is why anything
   * moved off $0 is named in the summary line and stays named while the
   * section is closed.
   */
  const advancedSet = [
    { label: 'Muni interest', value: muniInterest },
    { label: 'Charitable', value: qcd },
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

  const baseDeduction = yearFiling.standardDeduction;
  const standardDeduction = standardDeductionFor({ filingStatus, seniors, year });
  const seniorAddition = standardDeduction - baseDeduction;

  // The OBBBA senior deduction, before its phaseout eats into it. A separate
  // return cannot claim it at all, so every figure derived from it is null.
  const seniorDeductionOk = seniorDeductionAllowed(filingStatus);
  const seniorDeductionMax = seniorDeductionOk ? seniors * SENIOR_DEDUCTION : 0;
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
    qcd,
    year,
    ltcg: plannedLtcg,
  }).seniorPhaseoutEnd;
  const phaseoutEndsOnChart =
    phaseoutEndOnAxis !== null && phaseoutEndOnAxis <= axisMax;

  /**
   * Step 2's curve. The axis is every dollar that is not Social Security, and
   * `gainsWithinIncome` says the planned gain is part of it rather than piled
   * on top — so the reader who says $12,000 of their income is a gain gets a
   * curve where, at every income from $12,000 up, $12,000 of it is charged
   * under the capital-gain schedule and the rest under the ordinary one.
   *
   * That changes the chart's shape, not just its labels: the next dollar of
   * ordinary income can shove the gain stack across the 0%/15% line, which is
   * the stacking effect step 3 is named for, showing up on step 2's chart.
   */
  const curve = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest, qcd, year, ltcg: plannedLtcg },
        { maxIncome: axisMax, step: curveStep, gainsWithinIncome: true },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, qcd, year, plannedLtcg, axisMax, curveStep],
  );

  const segments = useMemo(
    () => segmentCurve(curve, (p) => p.income),
    [curve],
  );

  // Never read off the tax year: IRC 86(c) has never been indexed. See SS_BASES.
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];

  // With both bases at $0 the 85% cap binds as soon as provisional income
  // reaches the benefit itself — other income + muni + half the benefit >=
  // the benefit — so the whole torpedo is over by half the benefit, less
  // whatever tax-exempt interest has already been counted.
  const capBindsAt = Math.max(0, 0.5 * ssBenefit - muniInterest);
  const taxableSSAtZeroIncome = taxableSocialSecurity({
    ssBenefit,
    ordinaryIncome: 0,
    filingStatus,
    muniInterest,
    year,
  });

  /**
   * Step 3's axis: how much of the other income already entered is a gain, from
   * none of it to all of it. It ends where that income ends, because a gain
   * bigger than the income it came out of is not a scenario.
   */
  const gainsAxisMax = ordinaryIncome;

  /**
   * The mirror of `curve`: the same return, swept the other way. Total income
   * is held still at every point and only the split moves, which means
   * provisional income — and so the taxable share of the benefit — is fixed
   * across the whole axis. What is left varying is which rate schedule each
   * dollar is charged under, and where the gain stack sits against the
   * 0%/15%/20% bands.
   *
   * One exception, which the axis label under the chart names: a charitable
   * distribution can only come out of the ordinary half, so a gain big enough
   * to crowd that half below the gift shrinks what `qcdFor` allows and does
   * move the income after all.
   */
  const ltcgCurve = useMemo(
    () =>
      ltcgMarginalRateCurve(
        { ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, qcd, year },
        { maxLTCG: gainsAxisMax, step: 250, gainsWithinIncome: true },
      ),
    [ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, qcd, year, gainsAxisMax],
  );

  const ltcgSegments = useMemo(
    () => segmentCurve(ltcgCurve, (p) => p.ltcg),
    [ltcgCurve],
  );

  /**
   * Where the reader is standing on each chart. Step 2's slider is a point on
   * the ordinary-income sweep and step 3's is a point on the gains sweep, so
   * each one reads its own curve back rather than changing it.
   */
  const herePoint = useMemo(
    () => pointAt(curve, (p) => p.income, ordinaryIncome),
    [curve, ordinaryIncome],
  );
  const hereGainPoint = useMemo(
    () => pointAt(ltcgCurve, (p) => p.ltcg, plannedLtcg),
    [ltcgCurve, plannedLtcg],
  );

  /**
   * And what that place is worth knowing about: which side of the hump the
   * reader is on, and so which way their income is worth moving. Same
   * segments the tooltip reads, asked about one point rather than whichever
   * point a mouse is over.
   */
  const standing = useMemo(
    () => standingOn(segments, ordinaryIncome),
    [segments, ordinaryIncome],
  );

  /**
   * What the reader's split is worth against the all-ordinary version of the
   * same income — the figure the non-additive framing exists to produce, and
   * the one no chart on the page shows on its own. Both ends are points on the
   * gains curve, so it costs no extra arithmetic: the left edge is every
   * dollar taken as ordinary income, and the reader stands wherever they stand.
   *
   * Null until a gain is set, because at $0 the comparison is between the
   * scenario and itself.
   */
  const mixSaving =
    plannedLtcg > 0 && hereGainPoint && ltcgCurve.length > 0
      ? ltcgCurve[0].totalTax - hereGainPoint.totalTax
      : null;

  /**
   * The reader's own return, in the shape the tax chain reads it.
   *
   * Steps 2 and 3 treat the gain as a *share* of one other-income figure; the
   * tax chain treats the two as separate line items. `splitOtherIncome` is the
   * translation. It matters to both things built on it below: the charitable
   * exclusion has only the ordinary half to come out of, and a conversion is
   * ordinary income, so it has to land on the ordinary half rather than on a
   * total that is part gain.
   */
  const hereScenario = useMemo(
    () => ({
      ...splitOtherIncome(ordinaryIncome, plannedLtcg),
      ssBenefit,
      filingStatus,
      seniors,
      muniInterest,
      qcd,
      year,
    }),
    [ordinaryIncome, plannedLtcg, ssBenefit, filingStatus, seniors, muniInterest, qcd, year],
  );

  /**
   * How much of a charitable gift 408(d)(8) can actually exclude, which is the
   * gift capped by the ordinary income there is to take it out of. Named
   * rather than inlined because the close below quotes the figure as well as
   * subtracting it.
   */
  const given = qcdFor(hereScenario);

  /**
   * Everything this return takes in, which is the denominator an effective
   * rate needs and the reader's own answer at the foot of the page quotes.
   *
   * `totalIncomeFor` is the one definition — both axis labels and both
   * tooltips now read it rather than each restating it — and its own comment
   * says why the whole benefit counts and the charitable gift does not.
   */
  const totalIncome = totalIncomeFor(hereScenario);

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
        qcd,
        beneficiaries,
        year,
        ltcg: plannedLtcg,
      }),
    [ssBenefit, filingStatus, muniInterest, qcd, beneficiaries, year, plannedLtcg],
  );

  /** The cliffs that actually land inside the chart's x-axis. */
  const cliffsOnChart: IrmaaCliff[] = cliffs.filter(
    (c) => c.otherIncome > 0 && c.otherIncome <= axisMax,
  );

  /**
   * The first cliff off the right edge, for the joint returns where none fit:
   * "no line is drawn" is only useful next to where the nearest one would be.
   */
  const firstCliffPastAxis: IrmaaCliff | undefined = cliffs.find(
    (c) => c.otherIncome > axisMax,
  );

  /**
   * What each drawn line costs to cross, in the order they are drawn. The chart
   * label can only carry a tier number without the three of them colliding, so
   * the price goes in the key underneath instead.
   */
  const cliffPriceList = cliffsOnChart
    .map(
      (c, i) =>
        `IRMAA ${c.tier} at ${formatCurrency(Math.round(c.otherIncome))} ` +
        `${i === 0 ? 'costs' : 'another'} ${formatCurrency(c.step)}/yr`,
    )
    .join('; ');

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
        qcd,
        year,
        ltcg: plannedLtcg,
      }),
    [ssBenefit, filingStatus, muniInterest, qcd, year, plannedLtcg],
  );

  /** The 400% line when it is this return's to meet and the axis can show it. */
  const subsidyCliffOnChart: PtcCliff | null =
    preMedicare &&
    subsidyCliff &&
    subsidyCliff.otherIncome > 0 &&
    subsidyCliff.otherIncome <= axisMax
      ? subsidyCliff
      : null;

  /* ───── Step 4: how many dollars fit before the next one costs more ───── */

  /**
   * The lines a conversion can be sized against, for this return.
   *
   * Only the year and the filing status move them — a ceiling is a fixed line,
   * not a position relative to one — so the list is rebuilt when either
   * changes. Every status offers the same ids, but not every year does: 400%
   * of the poverty line was not a ceiling at all in 2025, when the credit
   * tapered past it rather than stopping. So `?? ceilings[0]` is what a reader
   * who picked that line and then switched to 2025 lands on, and `ceilingId`
   * is deliberately left alone so switching back restores their pick.
   */
  const ceilings = useMemo(
    () => conversionCeilings({ filingStatus, year }),
    [filingStatus, year],
  );
  const ceiling = ceilings.find((c) => c.id === ceilingId) ?? ceilings[0];

  /**
   * The answer the h1 asks for: the largest conversion that stays under the
   * chosen line, what it costs, and what the dollar past the line costs.
   *
   * `hereScenario` is the return it converts *from* — the same one the
   * effective rate above is measured on, which is why `sizing.taxBefore` and
   * the total step 2 quotes are the same figure rather than two roundings of
   * it.
   */
  const sizing = useMemo(
    () => sizeConversion(ceiling, hereScenario),
    [ceiling, hereScenario],
  );

  /**
   * Where the ceiling falls on step 2's own axis.
   *
   * A ceiling is quoted in taxable income, provisional income or MAGI, none of
   * which is the axis either chart is drawn on — but the conversion that just
   * fits under it is, because a conversion is ordinary income measured from
   * where the reader already stands. So the line the reader must not cross is
   * drawn at their income plus the conversion, and the band between the two is
   * the conversion itself.
   *
   * `unbounded` means the search hit its own bound without reaching the
   * ceiling, which none of these six can do on a real return; drawing a
   * million-dollar band on the strength of it would be worse than drawing
   * nothing, so it draws nothing.
   */
  const conversionFits = !sizing.unbounded && sizing.conversion > 0;
  const conversionTarget = conversionFits
    ? ordinaryIncome + sizing.conversion
    : ordinaryIncome;

  /**
   * Step 4's own right edge. Never inside step 2's — the two charts are the
   * same sweep and a reader comparing them should not have to re-read the axis
   * — but wider whenever the conversion runs past it, which the top of the 22%
   * bracket does on most joint returns.
   */
  const conversionAxisMax = useMemo(
    () =>
      incomeAxisMax(
        { ssBenefit, filingStatus, seniors, muniInterest, qcd, year, ltcg: plannedLtcg },
        { minimum: Math.max(axisMax, conversionTarget) },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, qcd, year, plannedLtcg, axisMax, conversionTarget],
  );

  /**
   * Step 2's curve, re-swept when step 4 needs more of it than step 2 drew.
   * Identical axes are the common case — the conversion usually lands inside
   * the torpedo chart — and then this is step 2's array, not a copy of it.
   */
  const conversionCurve = useMemo(
    () =>
      conversionAxisMax === axisMax
        ? curve
        : marginalRateCurve(
            { ssBenefit, filingStatus, seniors, muniInterest, qcd, year, ltcg: plannedLtcg },
            {
              maxIncome: conversionAxisMax,
              step: curveStepFor(conversionAxisMax),
              gainsWithinIncome: true,
            },
          ),
    [conversionAxisMax, axisMax, curve, ssBenefit, filingStatus, seniors, muniInterest, qcd, year, plannedLtcg],
  );

  /**
   * The hills and valleys of step 4's own sweep. Identical to step 2's
   * whenever the axes are, and a superset of it when the conversion has pushed
   * the axis out — which is exactly when reusing step 2's would leave the
   * tooltip silent over the stretch the conversion actually crosses.
   */
  const conversionSegments = useMemo(
    () => segmentCurve(conversionCurve, (p) => p.income),
    [conversionCurve],
  );

  /** What the ceiling caps, spelled out for the sentence that quotes it. */
  const ceilingMeasure = CONVERSION_MEASURE_LABELS[ceiling.measure];

  /**
   * What the live region will read out, once whatever changed it has settled.
   *
   * One step's reading each, written to be listened to rather than looked at:
   * plain sentences with no markup to flatten, no em dashes, and the figures
   * in the order the eye takes them off the page. It says what that step's own
   * readout says and stops there: the rest of the advice paragraph stays on
   * the page, and so do all seven of the closing figures, for a reader who
   * goes and reads them.
   *
   * Not memoised: it is four string concatenations on a component that has
   * already swept a curve, and holding it as a plain value is what lets the
   * settle hook below compare readings by their text rather than by identity.
   */
  const reading = ((): string => {
    switch (announceFrom) {
      case 'benefit': {
        const collecting =
          ssBenefit > 0
            ? `collecting ${formatCurrency(ssBenefit)} of Social Security a year`
            : 'collecting no Social Security';
        /* The recap on screen says "plus whatever is set under Advanced
           inputs", which is a pointer, and a pointer is no use to someone who
           has just moved one of them. So the reading names them. */
        const extras = advancedSet
          .map(({ label, value }) => `${label} ${formatCurrency(value)}`)
          .join(', ');
        return `${year} brackets, ${FILING_STATUS_PROSE[filingStatus]}, ${ageProse}, ${collecting}.${
          extras ? ` ${extras}.` : ''
        }`;
      }
      case 'torpedo':
        return herePoint
          ? `At ${formatCurrency(ordinaryIncome)} of other income the next dollar is taxed at ${
              herePoint.marginalRate
            }%. Federal tax ${formatCurrency(herePoint.totalTax)} on ${formatCurrency(
              totalIncome,
            )} of total income, an effective rate of ${formatPercent(
              effectiveRateOn(herePoint.totalTax),
            )}. ${standingHeadline(standing)}`
          : '';
      case 'gains':
        return hereGainPoint
          ? `With ${formatCurrency(plannedLtcg)} of your ${formatCurrency(
              ordinaryIncome,
            )} coming from long-term gains, the next dollar of gain is taxed at ${
              hereGainPoint.marginalRate
            }%. Federal tax ${formatCurrency(
              hereGainPoint.totalTax,
            )} on the same ${formatCurrency(
              totalIncome,
            )} of total income, an effective rate of ${formatPercent(
              effectiveRateOn(hereGainPoint.totalTax),
            )}.`
          : '';
      case 'conversion': {
        const line = `${ceiling.label}, ${formatCurrency(ceiling.amount)} of ${ceilingMeasure}`;
        if (conversionFits)
          return `${formatCurrency(
            sizing.conversion,
          )} fits under ${line}. It costs ${formatCurrency(
            sizing.taxCost,
          )} in federal tax, an average of ${sizing.costPerDollar}% on every dollar converted.`;
        return sizing.alreadyOver
          ? `Nothing fits under ${line}. This return is already ${formatCurrency(
              Math.round(-sizing.headroom),
            )} past it.`
          : `Nothing fits under ${line}. This return sits within a dollar of it.`;
      }
      default:
        return '';
    }
  })();

  /**
   * The same reading, held back until the control that changed it has stopped
   * moving. What the page shows never waits on this; only what it says does.
   */
  const announcement = useSettledReading(reading);

  /* ───── The close: what the four steps add up to ───── */

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
   * `sizing.taxBefore` — what step 4 calls this year's bill — is the same tax
   * taken straight from `hereScenario`, so all three agree; it stands in here
   * for a slider parked below the curve's first sample, which would mean
   * below $0.
   */
  const hereTax = herePoint?.totalTax ?? sizing.taxBefore;

  /**
   * What IRC 1411 takes out of that, and how far this return is from the
   * threshold that starts it.
   *
   * Chapter 2A is not income tax and does not go on the income-tax line of a
   * 1040, so the close names it separately even though `hereTax` — which both
   * rate curves and step 4's sizing now carry — already contains it.
   *
   * The income-tax half is taken by subtraction rather than by a second call
   * to `totalTax`, so that the two figures the close prints always add up to
   * the one above them. Each is then within a dollar of its own exact value,
   * which is the same tolerance every other whole-dollar figure on this page
   * is quoted to.
   */
  const hereNiit = niitFor(hereScenario);
  const hereSurtax = Math.round(hereNiit.tax);
  const hereIncomeTax = hereTax - hereSurtax;

  /**
   * Where the step nav and the next-step boxes both land.
   *
   * Focus moves into the section, not just the scroll position: a reader who
   * pressed the next-step box with the keyboard has to arrive inside the step
   * they asked for, or the next Tab press takes them back to the top of the
   * page. That is what the section's `tabIndex={-1}` is for. `scrollIntoView`
   * is optional-called because jsdom does not implement it.
   */
  const goToStep = (id: StepId): void => {
    setStep(id);
    const section = document.getElementById(`step-${id}`);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Roving tabindex: only the current step's nav button is in the tab order,
   * and the arrow keys move between them — the same handling the tab strip
   * had, under the ARIA toolbar pattern rather than the tabs one, because
   * every step is now mounted and a nav button no longer controls whether its
   * section exists. Focus stays on the nav here where the click path moves it
   * into the section: arrowing is how a reader browses the nav, and losing the
   * nav after one press would make the second press impossible.
   */
  const stepNavRef = useRef<HTMLDivElement>(null);
  const onStepKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const current = STEPS.findIndex((s) => s.id === step);
    const next = STEPS[(current + delta + STEPS.length) % STEPS.length];
    setStep(next.id);
    stepNavRef.current
      ?.querySelector<HTMLButtonElement>(`#step-nav-${next.id}`)
      ?.focus();
    document
      .getElementById(`step-${next.id}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  /**
   * The box that ends every step but the last. It is the only way through the
   * flow that does not require finding the nav again, so it names where it
   * goes rather than saying "next".
   */
  const nextStepBox = (fromIndex: number): React.ReactElement | null => {
    const next = STEPS[fromIndex + 1];
    if (!next) return null;
    return (
      <button
        type="button"
        className="next-step"
        onClick={() => goToStep(next.id)}
      >
        <span className="next-step-kicker">
          Next &middot; Step {fromIndex + 2} of {STEPS.length}
        </span>
        <span className="next-step-title">{next.heading}</span>
        <span className="next-step-blurb">{next.blurb}</span>
        <span className="next-step-arrow" aria-hidden="true">
          &rarr;
        </span>
      </button>
    );
  };

  return (
    <div className="card">
      <h1>How Much Can You Take Out This Year?</h1>
      <p className="subtitle">
        One more dollar out of an IRA — a withdrawal, a Roth conversion, a
        realized gain — can drag Social Security into the tax base with it and
        shove a long-term gain out of the 0% band, so what the next dollar
        actually costs is often nothing like your bracket. This draws that cost
        across every income level for your own return, and marks the stretches
        worth filling and the ones worth stepping around.
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

      <div className="shell">
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
          <p className="step-intro">
            Everything below is priced off one return. Set it here and it stays
            set for the rest of the page.
          </p>

          <fieldset className="input-group filing-status">
            <legend>Tax Year</legend>
            <div className="segmented">
              {TAX_YEARS.map((value) => (
                <label key={value} className="segmented-option">
                  <input
                    type="radio"
                    name="tax-year"
                    value={value}
                    checked={year === value}
                    onChange={() => changeYear(value)}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="input-group filing-status">
            <legend>Filing Status</legend>
            <div className="segmented">
              {FILING_STATUS_OPTIONS.map(({ value, label }) => (
                <label key={value} className="segmented-option">
                  <input
                    type="radio"
                    name="filing-status"
                    value={value}
                    checked={filingStatus === value}
                    onChange={() => changeFilingStatus(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {filingStatus === 'mfs' && (
              <p className="warning-note" role="note">
                <strong>Filing separately zeroes out both thresholds.</strong> IRC
                86(c) sets the base <em>and</em> the adjusted base amount to{' '}
                <strong>$0</strong> for a married taxpayer who files separately and
                lived with their spouse at any point in the year. There is no 50%
                tier at all:{' '}
                <strong>{formatCurrency(taxableSSAtZeroIncome)}</strong> of the{' '}
                {formatCurrency(ssBenefit)} benefit is taxable before any other
                income arrives, and the 85% cap binds at{' '}
                <strong>{formatCurrency(capBindsAt)}</strong> of other income. The
                torpedo is not removed, it is compressed — the whole of it is
                crammed into the left edge of the chart instead of spread across the
                band a single filer sees.{' '}
                <em>
                  If you lived apart from your spouse for the entire year, 86(c)
                  treats you as unmarried — use Single instead, or Head of
                  Household if a qualifying person lives with you. The separate and
                  single brackets and standard deduction are identical up to{' '}
                  {formatCurrency(mfsSingleDivergence)} of taxable income; head of
                  household is better than either from the first dollar.
                </em>
              </p>
            )}
            {filingStatus === 'hoh' && (
              <p className="field-note" role="note">
                <strong>
                  Head of household keeps a single filer&apos;s thresholds and
                  improves everything else.
                </strong>{' '}
                IRC 86(c) names only two special base amounts —{' '}
                {formatCurrency(SS_BASES.mfj.ssBase50)} on a joint return and{' '}
                {formatCurrency(SS_BASES.mfs.ssBase50)} on a separate one that lived
                together — so a head of household takes the default,{' '}
                {formatCurrency(ssBase50)} and {formatCurrency(ssBase85)}, which is
                exactly what Single uses. What changes is downstream: a{' '}
                {formatCurrency(yearFiling.standardDeduction)} standard deduction
                against {formatCurrency(singleFiling.standardDeduction)}, and a 12%
                band running to {formatCurrency(yearFiling.brackets[1].upTo)} instead
                of {formatCurrency(singleFiling.brackets[1].upTo)}. The torpedo
                starts at the same provisional income and costs less the whole way
                through.{' '}
                <em>
                  Qualifying is the hard part in retirement: unmarried at year end,
                  paying more than half the cost of keeping up your home, and a
                  qualifying person living with you more than half the year — a
                  dependent parent being the one exception, who need not live with
                  you. A recent widow or widower is not here automatically. The year
                  of death is still a joint return, and the two years after it are
                  Qualifying Surviving Spouse, which pairs joint brackets with these
                  same {formatCurrency(ssBase50)} thresholds and is not on this menu.
                </em>
              </p>
            )}
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
                    : `. Turning 65 adds ${formatCurrency(yearFiling.additionalStdDeduction65)}${
                        filingStatus === 'mfj' ? ' per qualifying spouse' : ''
                      }.`}{' '}
                  The addition widens the 0%-rate valley to the left of the
                  torpedo: taxable income stays at zero for that much longer, so
                  the whole curve shifts right.
                </p>
                <p className="field-note">
                  {phaseoutStart === null || phaseoutEnd === null ? (
                    <>
                      No senior deduction on a separate return: section
                      151(d)(5)(C)(v) allows the temporary{' '}
                      {formatCurrency(SENIOR_DEDUCTION)} only if a married
                      taxpayer files jointly. There is no halved amount and no
                      halved threshold — separate filers get nothing.
                    </>
                  ) : seniors > 0 ? (
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
              <label htmlFor="ss-benefit">Annual Social Security Benefit</label>
              <span className="slider-value">{formatCurrency(ssBenefit)}</span>
            </div>
            <input
              id="ss-benefit"
              type="range"
              min={0}
              max={maxAnnualSSBenefit(year)}
              step={12}
              value={ssBenefit}
              onChange={(e) => {
                setSsBenefit(Number(e.target.value));
                announce('benefit');
              }}
            />
            <div className="slider-range-labels">
              <span>$0</span>
              <span>{formatCurrency(avgAnnualSSBenefit(year))} ({year} avg)</span>
              <span>{formatCurrency(maxAnnualSSBenefit(year))} ({year} max)</span>
            </div>
          </div>

          {/* The one control on this page that moves no figure. It belongs in
              step 1 because it is a fact about the reader rather than about the
              chart, and it is answered under step 2's chart because that is the
              curve it qualifies. */}
          <div className="input-group">
            <div className="slider-header">
              <label htmlFor="home-state">State</label>
              <span className="slider-value">
                {homeStateRule ? homeStateRule.abbr : 'Not said'}
              </span>
            </div>
            <select
              id="home-state"
              className="state-select"
              value={homeState}
              /* The one control here that does not feed the live region. It
                 moves no figure — it selects the footnote under step 2's chart —
                 and a select announces its own new option, so the only thing
                 left to read out would be the whole footnote. See
                 `announceFrom`. */
              onChange={(e) => setHomeState(e.target.value)}
            >
              <option value="">Somewhere else — or rather not say</option>
              {STATE_SS_RULES.map((rule) => (
                <option key={rule.abbr} value={rule.abbr}>
                  {rule.state}
                </option>
              ))}
            </select>
            <div className="slider-range-labels">
              <span>
                {statesTaxing.length} of these {STATE_SS_RULES.length} still tax a
                benefit in {year}
              </span>
            </div>
            <p className="field-note">
              The menu is the {STATE_SS_RULES.length} states that taxed a Social
              Security benefit in either year this page prices, and{' '}
              {statesTaxing.length} of them still do in {year}. Everywhere else
              leaves the benefit alone — with or without an income tax of its
              own — so &ldquo;somewhere else&rdquo; is the right answer for
              most readers. Nothing below is priced from this: no two of these{' '}
              {STATE_SS_RULES.length} rules share a shape, so the page quotes them
              and cites them rather than modelling them wrong. What it changes is
              one footnote under step 2&rsquo;s chart.
            </p>
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
                <span className="advanced-state">Both at $0</span>
              )}
            </summary>
            <p className="field-note">
              Tax-exempt interest, and money given to charity straight out of an
              IRA. Both sit at $0 until you move them, and at $0 neither one
              changes a single figure on either chart below — so the page opens on
              the plain picture, benefit plus other income, and you add the rest
              only if it is yours. Whatever you set here stays set for both of the
              steps that follow and is named on the line above even when this
              section is shut.
            </p>
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

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="qcd">Qualified Charitable Distribution</label>
                <span className="slider-value lime">{formatCurrency(qcd)}</span>
              </div>
              <input
                id="qcd"
                type="range"
                min={0}
                max={qcdLimit}
                step={250}
                value={qcd}
                onChange={(e) => {
                  setQcd(Number(e.target.value));
                  announce('benefit');
                }}
                className="slider-lime"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(qcdLimit)}</span>
              </div>
              <p className="field-note">
                IRA money paid straight to the charity. It comes <em>out of</em> the
                other income set in step 2 rather than on top of it, because the
                gift is a distribution that would otherwise have been reported — so it
                moves the whole curve to the right, exactly as far as tax-exempt
                interest moves it to the left. Out of the ordinary half of that
                income, at that: a long-term gain is a sale rather than a
                distribution, so whatever step 3 marks as gain is income this gift
                cannot be excluded from. Capped at{' '}
                <strong>{formatCurrency(qcdLimit)}</strong> for {year}
                {filingStatus === 'mfj'
                  ? ' \u2014 408(d)(8)(A) caps it per individual, so a joint return where both spouses have reached 70\u00BD and each gives from their own IRA gets it twice.'
                  : ' by 408(d)(8)(A), which the IRS indexes every year. Anything past it is an ordinary distribution, deductible only on an itemized return and only within the AGI limits of section 170(b).'}{' '}
                A gift anywhere near that figure is more income than step 2’s
                chart used to draw, so the slider runs to the statutory limit and
                that chart’s right edge moves out to hold it.
              </p>
            </div>
          </details>

          {/* What this step settled, in one line. The hero used to name the
              filing status and the year; it now says what the page is for, so
              the return being priced is named here instead — at the foot of the
              step that sets it, on the way into the step that spends it. */}
          <p className="scenario-recap">
            Everything from here on prices one return: <strong>{year}</strong>{' '}
            brackets and standard deduction,{' '}
            <strong>{FILING_STATUS_PROSE[filingStatus]}</strong>, {ageProse},
            collecting{' '}
            {ssBenefit > 0 ? (
              <>
                <strong>{formatCurrency(ssBenefit)}</strong> of Social Security a
                year.
              </>
            ) : (
              <>
                <strong>no Social Security</strong> at all.
              </>
            )}
            {advancedSet.length > 0
              ? ' Plus whatever is set under Advanced inputs above.'
              : ''}
          </p>

          {nextStepBox(0)}
        </section>

        <div className="flow">
          <div
            className="step-nav"
            role="toolbar"
            aria-label="Steps"
            ref={stepNavRef}
            onKeyDown={onStepKeyDown}
          >
            {STEPS.map(({ id, navLabel }, i) => (
              <button
                key={id}
                type="button"
                id={`step-nav-${id}`}
                className={
                  step === id ? 'step-nav-item step-nav-current' : 'step-nav-item'
                }
                aria-current={step === id ? 'step' : undefined}
                aria-controls={`step-${id}`}
                tabIndex={step === id ? 0 : -1}
                onClick={() => goToStep(id)}
              >
                <span className="step-nav-number" aria-hidden="true">
                  {i + 1}
                </span>
                {navLabel}
              </button>
            ))}
          </div>

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
            <p className="step-intro">
              The chart prices every income from $0 to{' '}
              {formatCurrency(axisMax)} &mdash; far enough right to reach the last
              thing that happens to this return; the slider says which point along
              it is yours.
            </p>

            <figure className="chart-figure">
              <div
                className="chart-container"
                role="img"
                aria-label={`Chart: the marginal tax rate on the next dollar of other income, plotted from $0 to ${formatCurrency(axisMax)}.`}
                aria-describedby="torpedo-chart-caption"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={curve}
                    margin={{ top: 22, right: 28, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PALETTE.accent} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={PALETTE.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.edge} />
                    <XAxis
                      dataKey="income"
                      type="number"
                      domain={[0, axisMax]}
                      tickFormatter={formatCompact}
                      stroke={PALETTE.inkMuted}
                    />
                    <YAxis
                      stroke={PALETTE.inkMuted}
                      tickFormatter={(value) => `${value}%`}
                      width={70}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip
                          ssBenefit={ssBenefit}
                          segments={segments}
                          filingStatus={filingStatus}
                          muniInterest={muniInterest}
                          qcd={qcd}
                          ltcg={plannedLtcg}
                          beneficiaries={beneficiaries}
                          year={year}
                        />
                      }
                    />
                    {cliffsOnChart.map((cliff) => (
                      <ReferenceLine
                        className="irmaa-cliff"
                        key={cliff.tier}
                        x={cliff.otherIncome}
                        stroke={PALETTE.rose}
                        strokeDasharray="4 4"
                        label={{
                          value: `IRMAA ${cliff.tier}`,
                          position: 'top',
                          fill: PALETTE.roseBright,
                          fontSize: 11,
                        }}
                      />
                    ))}
                    {/* Pink rather than a second red: it is a cliff like the IRMAA
                        ones, but it belongs to a different reader — the one still
                        buying their own coverage — and the key underneath tells
                        them apart by colour before it tells them apart in words.
                        Fuchsia is what was left: the sky curve, the rose cliffs,
                        the amber marker and every slider on the page already own a
                        colour, muni interest's violet included. */}
                    {subsidyCliffOnChart && (
                      <ReferenceLine
                        className="subsidy-cliff"
                        x={subsidyCliffOnChart.otherIncome}
                        stroke={PALETTE.fuchsia}
                        strokeDasharray="4 4"
                        label={{
                          value: `${PTC_CLIFF_PERCENT * 100}% FPL`,
                          position: 'top',
                          fill: PALETTE.fuchsiaBright,
                          fontSize: 11,
                        }}
                      />
                    )}
                    {hereLine(ordinaryIncome, axisMax, PALETTE.amber)}
                    <Area
                      type="stepAfter"
                      dataKey="marginalRate"
                      stroke={PALETTE.accent}
                      strokeWidth={2}
                      fill="url(#rateGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-axis-label">
                Other Income ($) &middot; Total income = Other income + {formatCurrency(ssBenefit)} SS
                {plannedLtcg > 0
                  ? `, of which ${formatCurrency(plannedLtcg)} is long-term gain`
                  : ''}
                {muniInterest > 0
                  ? ` + ${formatCurrency(muniInterest)} tax-exempt interest`
                  : ''}
                {qcd > 0
                  ? ` \u2212 ${formatCurrency(qcd)} given straight to charity`
                  : ''}
              </p>

              {/* The lines have to carry their own key: what a cliff is gets
                  explained in a disclosure further down the step, and a bare red
                  dash on a tax chart explains nothing on its own. */}
              {cliffsOnChart.length > 0 ? (
                <p className="chart-key">
                  <span className="chart-key-swatch" aria-hidden="true" />
                  <span>
                    <strong>Medicare&apos;s IRMAA cliffs.</strong> Crossing one raises
                    the Part B and Part D premiums of everyone on this return who is
                    enrolled, for a full year &mdash; and it is a cliff, not a phase-in, so
                    a single dollar over the line buys the whole step.{' '}
                    {cliffPriceList}
                    {beneficiaries > 1 ? ', for the two of you' : ''}. None of that is
                    tax, so none of it is in the curve above.
                  </span>
                </p>
              ) : firstCliffPastAxis ? (
                <p className="chart-key">
                  <span>
                    <strong>No Medicare IRMAA cliff falls on this chart.</strong> The
                    first one this return could reach needs{' '}
                    {formatCurrency(firstCliffPastAxis.magi)} of MAGI &mdash;{' '}
                    {formatCurrency(Math.round(firstCliffPastAxis.otherIncome))} of
                    other income, past the right edge of the axis &mdash; and would cost{' '}
                    {formatCurrency(firstCliffPastAxis.step)}/yr in Medicare premiums
                    {beneficiaries > 1 ? ' for the two of you' : ''}.
                  </span>
                </p>
              ) : null}

              {/* The second key, for the second cliff. It renders whenever this
                  return is one the credit could reach — under 65, in a year that
                  has a cliff — and says where the line is even when the line is
                  not drawn, because "no line" and "off the right edge" are
                  different answers. */}
              {preMedicare && subsidyCliff ? (
                <p className="chart-key chart-key-subsidy">
                  <span
                    className="chart-key-swatch chart-key-swatch-subsidy"
                    aria-hidden="true"
                  />
                  <span>
                    {subsidyCliffOnChart ? (
                      <>
                        <strong>
                          The {PTC_CLIFF_PERCENT * 100}% poverty-line cliff.
                        </strong>{' '}
                        Household income over{' '}
                        {formatCurrency(subsidyCliff.magi)} &mdash;{' '}
                        {PTC_CLIFF_PERCENT * 100}% of the{' '}
                        {formatCurrency(subsidyCliff.povertyLine)} poverty line for a
                        household of {subsidyCliff.householdSize}, reached at{' '}
                        {formatCurrency(Math.round(subsidyCliff.otherIncome))} of
                        other income &mdash; ends the Marketplace premium tax credit
                        for the whole year. Under the line this household pays at most{' '}
                        {formatCurrency(subsidyCliff.cappedContribution)} for the
                        benchmark plan; over it, the whole premium.
                      </>
                    ) : subsidyCliff.otherIncome <= 0 ? (
                      <>
                        <strong>
                          Already past the {PTC_CLIFF_PERCENT * 100}% poverty-line
                          cliff.
                        </strong>{' '}
                        The benefit and tax-exempt interest set above come to more
                        than {formatCurrency(subsidyCliff.magi)} on their own, so
                        there is no Marketplace premium tax credit to lose at any
                        point on this chart.
                      </>
                    ) : (
                      <>
                        <strong>
                          The {PTC_CLIFF_PERCENT * 100}% poverty-line cliff is off
                          the right edge.
                        </strong>{' '}
                        It needs {formatCurrency(subsidyCliff.magi)} of household
                        income &mdash;{' '}
                        {formatCurrency(Math.round(subsidyCliff.otherIncome))} of
                        other income &mdash; and past it there is no Marketplace
                        premium tax credit for the year.
                      </>
                    )}{' '}
                    Only for coverage bought on the Marketplace, and only until
                    Medicare starts.
                  </span>
                </p>
              ) : null}

              <CurveCaption
                id="torpedo-chart-caption"
                segments={segments}
                lead="Left to right, the rate on the next dollar of other income is"
              />
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

              <p className="slider-readout">
                <strong>You are here.</strong> At {formatCurrency(ordinaryIncome)} of
                other income the next dollar is taxed at{' '}
                <strong>{herePoint ? `${herePoint.marginalRate}%` : '\u2014'}</strong>,
                where the dashed amber line crosses the curve above &mdash; that
                point on the curve, not the curve itself, is what the slider moves.
                {herePoint && totalIncome > 0 ? (
                  <>
                    {' '}
                    The return itself owes{' '}
                    <strong>{formatCurrency(herePoint.totalTax)}</strong> in federal
                    tax on {formatCurrency(totalIncome)} of total income &mdash; an
                    effective rate of{' '}
                    <strong>{formatPercent(effectiveRateOn(herePoint.totalTax))}</strong>
                    . That is the average across every dollar of it; the figure
                    before it is the price of the next one.
                  </>
                ) : null}
                {plannedLtcg > 0
                  ? ` Step 3 has ${formatCurrency(plannedLtcg)} of this coming from long-term gains, which is priced into the curve rather than added to it.`
                  : ''}
              </p>

              <StandingNote standing={standing} at={ordinaryIncome} />
            </div>

            {/* State tax as a footnote rather than a step of its own: the data is
                text, so what it needs is a paragraph and a citation, not a chart.
                The rule stays quotable even when the state has dropped off the
                year's list — West Virginia does exactly that between 2025 and
                2026 — which is the second branch here. */}
            <p className="state-footnote" role="note">
              {homeStateRule ? (
                homeStateTaxes ? (
                  <>
                    <strong>
                      {homeStateRule.state} taxes part of this benefit as well, and
                      the curve above does not.
                    </strong>{' '}
                    {homeStateRule.mechanism}. {homeStateRule.rule} The {year} test
                    is <em>{homeStateRule.test[year]}</em>.
                    {homeStateDeltas.map((delta) => (
                      <React.Fragment key={delta.year}>
                        {' '}
                        It reads differently in {delta.year}: <em>{delta.test}</em>.
                      </React.Fragment>
                    ))}{' '}
                    <span className="state-source">
                      {homeStateRule.source}.
                    </span>
                  </>
                ) : (
                  <>
                    <strong>
                      {homeStateRule.state} stopped taxing benefits in{' '}
                      {homeStateRule.exemptFrom}.
                    </strong>{' '}
                    {homeStateRule.rule} So on a {year} return the curve above is
                    the whole of what this benefit costs: {homeStateRule.state}{' '}
                    still taxes other income, but no part of the benefit.{' '}
                    <span className="state-source">
                      {homeStateRule.source}.
                    </span>
                  </>
                )
              ) : (
                <>
                  <strong>Every figure on this page is a federal one.</strong>{' '}
                  {statesTaxing.length} states still reach a Social Security benefit
                  in {year} —{' '}
                  {sentenceList(statesTaxing.map((rule) => rule.state))} — and a
                  reader in one of them is looking at a curve that understates their
                  own bill.{' '}
                  {movingStates.length > 0 ? (
                    <>
                      {sentenceList(movingStates.map((rule) => rule.state))}{' '}
                      {movingStates.length > 1 ? 'read' : 'reads'} differently in
                      the other year this page prices, so the tax year set in step 1
                      moves {movingStates.length > 1 ? 'them' : 'it'} too.{' '}
                    </>
                  ) : null}
                  Name your state in step 1 and this footnote says what it does.
                </>
              )}
            </p>

            <details className="explainer">
              <summary>
                <h2 id="tax-torpedo-heading">What is the tax torpedo?</h2>
              </summary>
              <div className="explainer-content">
                <p>
                  Social Security benefits are not taxed dollar-for-dollar. The taxable
                  share depends on <strong>provisional income</strong> — other income
                  plus half of your benefits.{' '}
                  {ssBase85 > 0 ? (
                    <>
                      Once provisional income passes {formatCurrency(ssBase50)}, each
                      extra dollar of other income also drags up to 50&cent; of
                      benefits into taxable income; past {formatCurrency(ssBase85)}, it
                      drags in up to 85&cent;. (The thresholds shown are for the filing
                      status selected above.)
                    </>
                  ) : (
                    <>
                      On the separate return selected above both thresholds are $0, so
                      there is nothing to pass: every dollar of provisional income
                      brings 85&cent; of benefits with it from the very first one,
                      until the 85% cap stops it.
                    </>
                  )}
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
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h2 id="torpedo-strategies-heading">How to mitigate the tax torpedo</h2>
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
                    <strong>If you can&apos;t go under it, go past it.</strong> Once
                    the 85% cap is reached, extra income is taxed at plain bracket
                    rates again. Bunching income — say, one large Roth conversion —
                    into a single year can cost less than sitting in the middle of the
                    spike year after year.
                  </li>
                  {filingStatus === 'mfs' && (
                    <li>
                      <strong>Price out filing jointly.</strong> A separate return
                      that lived with the spouse gives up the{' '}
                      {formatCurrency(SS_BASES.mfj.ssBase50)} and{' '}
                      {formatCurrency(SS_BASES.mfj.ssBase85)} thresholds, the{' '}
                      {formatCurrency(SENIOR_DEDUCTION)} senior deduction, and the
                      lower IRMAA tiers all at once. Separate filing is usually driven
                      by something else — income-driven student-loan repayment, a
                      spouse&apos;s liability, an ongoing separation — so compare the
                      two returns before assuming it still pays.
                    </li>
                  )}
                </ul>
                <p>
                  The right mix depends on account balances, state taxes, Medicare
                  premium surcharges, and more. The chart above makes the goal concrete:
                  keep provisional income out of the spike, or jump clean over it.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h2 id="irmaa-cliffs-heading">
                  Medicare&apos;s IRMAA cliffs &mdash; the red dashed lines
                </h2>
              </summary>
              <div className="explainer-content">
                <p>
                  Above a MAGI threshold, Medicare adds an{' '}
                  <strong>income-related monthly adjustment amount</strong> to the
                  Part B and Part D premiums of everyone on the return who is
                  enrolled. Unlike the torpedo, it is not a phase-in: one dollar over
                  a threshold triggers the whole surcharge for twelve months. The
                  first cliff this return can reach costs{' '}
                  <strong>{formatCurrency(cliffs[0].step)}</strong> a year
                  {beneficiaries > 1 ? ' for the two of you' : ''} &mdash; on a single
                  dollar of income.
                  {cliffs[0].tier > 1
                    ? ` A separate return has no access to tiers 1 through 3: 42 U.S.C. 1395r(i)(3)(C) gives it a two-step schedule of its own, so its first cliff is tier ${cliffs[0].tier} and the whole surcharge lands at once.`
                    : ''}
                </p>
                <p>
                  The lines sit at less other income than their MAGI figures suggest,
                  because the benefits the torpedo drags into AGI get there first
                  {muniInterest > 0
                    ? `, and because Medicare's MAGI is wider than the tax code's — the ${formatCurrency(muniInterest)} of tax-exempt interest set above is added straight back in, moving every line ${formatCurrency(muniInterest)} further left`
                    : '. Medicare\u2019s MAGI is also wider than the tax code\u2019s: tax-exempt interest is added straight back in, so muni bonds move these lines as well as the torpedo'}
                  . A charitable distribution moves them the other way, because it
                  never reaches AGI at all.
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
                  included in any of the tax figures on this page either &mdash; the
                  curve above is federal income tax only.
                </p>
              </div>
            </details>

            {preMedicare ? (
              <details className="explainer">
                <summary>
                  {/* The line is only drawn in a year that has one, so the
                      heading only points at it in a year that has one. */}
                  <h2 id="subsidy-cliff-heading">
                    The {PTC_CLIFF_PERCENT * 100}% poverty-line cliff
                    {subsidyCliff ? <> &mdash; the pink dashed line</> : null}
                  </h2>
                </summary>
                <div className="explainer-content">
                  {subsidyCliff ? (
                    <>
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
                        .
                      </p>
                      <p>
                        <strong>What it costs is not on this page.</strong> Just
                        under the line the household pays at most{' '}
                        {(subsidyCliff.topApplicablePercentage * 100).toFixed(2)}% of
                        its income &mdash;{' '}
                        {formatCurrency(subsidyCliff.cappedContribution)} &mdash; for
                        the benchmark plan, and the credit covers the rest. One
                        dollar over, it pays the full premium, which depends on ages
                        and county and which this page has no way to know. So the
                        line is drawn where it falls and the loss is left blank: for
                        a couple in their early sixties it is routinely five figures.
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
                        used here is the one for the 48 contiguous states and DC;
                        Alaska and Hawaii have their own, higher, so the line falls
                        further right there than it is drawn.{' '}
                        {subsidyCliff.householdSize === 1
                          ? 'A dependent would move it right by about $5,500 of income, and this page has no field for one.'
                          : 'A dependent past the two people this filing status implies would move it right by about $5,500 of income, and this page has no field for one.'}
                      </p>
                    </>
                  ) : (
                    <p>
                      On a {year} return there is no cliff to draw. ARPA section
                      9661, extended through 2025 by the Inflation Reduction Act,
                      took the 400% ceiling out of IRC 36B(c)(1)(A) and capped a
                      household&apos;s own share of the benchmark premium at 8.5% of
                      income at every income level, so the Marketplace credit tapers
                      away instead of stopping. It returns for tax years beginning
                      after 2025: switch the year above to see where it falls.
                    </p>
                  )}
                </div>
              </details>
            ) : null}

            <details className="explainer">
              <summary>
                <h2 id="senior-deduction-heading">
                  The senior deduction phaseout ({SENIOR_DEDUCTION_FIRST_YEAR}&ndash;
                  {SENIOR_DEDUCTION_LAST_YEAR})
                </h2>
              </summary>
              <div className="explainer-content">
                {phaseoutStart === null || phaseoutEnd === null ? (
                <p>
                  Not on this return. Section 151(d)(5)(C)(v) makes the temporary{' '}
                  {formatCurrency(SENIOR_DEDUCTION)} deduction conditional on a married
                  taxpayer filing jointly, so a separate filer gets none of it — no
                  halved amount, no halved {formatCurrency(75_000)} threshold, nothing.
                  Between that and the $0 Social Security bases, filing separately
                  while living together costs a retired couple the deduction and the
                  thresholds at once. Switch to Married Filing Jointly above to see
                  what the phaseout looks like when it applies.
                </p>
                ) : (
                <>
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
                </>
                )}
              </div>
            </details>

            {nextStepBox(1)}
          </section>

          {/* ───── Step 3: what kind of income the step-2 figure is ───── */}
          <section
            className="step"
            id="step-gains"
            tabIndex={-1}
            aria-labelledby="step-gains-heading"
          >
            <p className="step-kicker">Step 3 of {STEPS.length}</p>
            <h2 className="step-heading" id="step-gains-heading">
              Capital Gains Stacking
            </h2>

            <p className="step-intro">
              Step 2 asked how much income you have. This step asks what kind it
              is: how much of that {formatCurrency(ordinaryIncome)} is a long-term
              capital gain? A gain is part of that figure, not another figure on
              top of it &mdash; so the chart holds your total income still and moves
              only the split.
            </p>

            {/* A gain is a share of the income entered in step 2, so with that
                income at $0 there is nothing to take a share of: the axis has no
                width, the slider has no travel and the curve has one point. Say so
                rather than draw it. */}
            {gainsAxisMax === 0 ? (
              <p className="step-prose">
                <strong>Nothing to split yet.</strong> Step 2 has your other income
                at $0. A long-term gain is a share of the income you have rather
                than an addition to it, so there is no axis to draw until something
                is set there — move the other-income slider on step 2 and this
                step comes back.
              </p>
            ) : (
              <>
              <figure className="chart-figure">
                <div
                  className="chart-container"
                  role="img"
                  aria-label={`Chart: the marginal tax rate as more of ${formatCurrency(ordinaryIncome)} of other income is taken as long-term capital gain, plotted from $0 to ${formatCurrency(gainsAxisMax)}.`}
                  aria-describedby="gains-chart-caption"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={ltcgCurve}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ltcgGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={PALETTE.amber} stopOpacity={0.5} />
                          <stop offset="95%" stopColor={PALETTE.amber} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.edge} />
                      <XAxis
                        dataKey="ltcg"
                        type="number"
                        domain={[0, gainsAxisMax]}
                        tickFormatter={formatCompact}
                        stroke={PALETTE.inkMuted}
                      />
                      <YAxis
                        stroke={PALETTE.inkMuted}
                        tickFormatter={(value) => `${value}%`}
                        width={70}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        content={
                          <LTCGTooltip
                            ordinaryIncome={ordinaryIncome}
                            ssBenefit={ssBenefit}
                            segments={ltcgSegments}
                            muniInterest={muniInterest}
                            qcd={qcd}
                            filingStatus={filingStatus}
                            year={year}
                          />
                        }
                      />
                      {hereLine(plannedLtcg, gainsAxisMax, PALETTE.emerald)}
                      <Area
                        type="stepAfter"
                        dataKey="marginalRate"
                        stroke={PALETTE.amber}
                        strokeWidth={2}
                        fill="url(#ltcgGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* The same total the tooltip above quotes, from the same
                    definition — this line used to leave out tax-exempt interest
                    and the charitable gift, so it disagreed with the sentence
                    under step 2's chart about the very same return. And the sweep
                    holds it still only when nothing is being given away: a gift
                    comes out of the ordinary half alone, so past a point the gain
                    crowds it out. */}
                <p className="chart-axis-label">
                  Long-Term Capital Gains, out of {formatCurrency(ordinaryIncome)} of
                  other income ($) &middot; Total income{' '}
                  {formatCurrency(totalIncome)}
                  {given > 0
                    ? ' where you stand \u2014 the further right you go, the less of the gift has ordinary income to come out of, so the more of this income reaches the return'
                    : ' at every point on this axis'}
                </p>

                <CurveCaption
                  id="gains-chart-caption"
                  segments={ltcgSegments}
                  lead="Left to right, the rate on the next dollar taken as gain rather than as ordinary income is"
                />
              </figure>

              <div className="input-group chart-slider">
                <div className="slider-header">
                  <label htmlFor="planned-ltcg">
                    Long-Term Capital Gains Inside That Income
                  </label>
                  <span className="slider-value emerald">{formatCurrency(plannedLtcg)}</span>
                </div>
                <input
                  id="planned-ltcg"
                  type="range"
                  min={0}
                  max={gainsAxisMax}
                  step={500}
                  value={plannedLtcg}
                  onChange={(e) => {
                    setPlannedLtcg(Number(e.target.value));
                    announce('gains');
                  }}
                  className="slider-emerald"
                />
                <div className="slider-range-labels">
                  <span>None of it</span>
                  <span>All {formatCurrency(gainsAxisMax)} of it</span>
                </div>

                <p className="slider-readout">
                  <strong>You are here.</strong> With {formatCurrency(plannedLtcg)} of
                  your {formatCurrency(ordinaryIncome)} coming from long-term gains,
                  the next dollar of gain is taxed at{' '}
                  <strong>
                    {hereGainPoint ? `${hereGainPoint.marginalRate}%` : '\u2014'}
                  </strong>
                  , where the dashed emerald line crosses the curve above
                  {hereGainPoint && hereGainPoint.marginalRate > 20
                    ? ' \u2014 past the 20% ceiling a gain can be charged on its own, so the rest of it is benefit being dragged into the tax base alongside the gain.'
                    : '.'}
                  {mixSaving === null ? null : mixSaving > 0 ? (
                    <>
                      {' '}
                      Splitting the same {formatCurrency(ordinaryIncome)} this way
                      rather than taking all of it as ordinary income saves{' '}
                      <strong>{formatCurrency(mixSaving)}</strong> in federal tax.
                    </>
                  ) : (
                    <>
                      {' '}
                      Splitting the same {formatCurrency(ordinaryIncome)} this way
                      rather than taking all of it as ordinary income changes the
                      federal tax by nothing at all &mdash; at this income the
                      ordinary schedule and the capital-gain one charge the same.
                    </>
                  )}
                  {hereGainPoint && totalIncome > 0 ? (
                    <>
                      {' '}
                      All told the return owes{' '}
                      <strong>{formatCurrency(hereGainPoint.totalTax)}</strong> in
                      federal tax on the {formatCurrency(totalIncome)} of total
                      income behind this chart
                      {given > 0 ? '' : ', which this slider never moves'} &mdash;
                      an effective rate of{' '}
                      <strong>
                        {formatPercent(effectiveRateOn(hereGainPoint.totalTax))}
                      </strong>
                      .{' '}
                      {given > 0
                        ? 'Mostly the same dollars, taxed differently: the slider moves the bill, and it moves the income only where the gain has crowded the gift out of the ordinary half.'
                        : 'The same dollars, taxed differently: what the slider moves is the bill, not the income.'}
                    </>
                  ) : null}
                  {hereSurtax > 0 ? (
                    <>
                      {' '}
                      <strong>{formatCurrency(hereSurtax)}</strong> of that is the
                      3.8% surtax of section 1411, charged on{' '}
                      {formatCurrency(hereNiit.base)} of the gain because{' '}
                      {formatCurrency(hereNiit.magi)} of MAGI clears the{' '}
                      {formatCurrency(hereNiit.threshold)} threshold.
                    </>
                  ) : null}
                </p>
              </div>
              </>
            )}

            <details className="explainer">
              <summary>
                <h2 id="ltcg-stacking-heading">Why the two effects stack</h2>
              </summary>
              <div className="explainer-content">
                <p>
                  Long-term capital gains (LTCG) count fully toward{' '}
                  <strong>provisional income</strong> for Social Security taxability,
                  yet they are taxed in their own preferential bracket (0%/15%/20%).
                  When ordinary income pushes Social Security benefits into the
                  taxable base, LTCG can simultaneously shove gains out of the
                  0% bracket into 15%&nbsp;— stacking two effects at once.
                </p>
                <p>
                  The axis above is the <strong>split</strong>, not the size. Every
                  point on it prices the same{' '}
                  {formatCurrency(ordinaryIncome + ssBenefit)} of total income and
                  differs only in how much of it is gain. That holds provisional
                  income still — a dollar of gain and a dollar of ordinary income
                  raise it identically — so the taxable share of your benefit is the
                  same all the way across, and what moves is which rate schedule
                  each dollar is charged under and how much of the gain fits below
                  the 0% ceiling.
                </p>
                <p>
                  The <em>height</em> of the curve answers the other question: what
                  the next dollar of gain would cost on top of everything. That is
                  where the two effects compound — the dollar is charged its own
                  preferential rate <em>and</em> drags up to 85&cent; of benefit
                  into the tax base at ordinary rates, so the combined figure can
                  run well past the statutory 15%. The same compounding shows up on
                  step 2&apos;s chart from the other side: with a gain set, the next
                  dollar of ordinary income lifts the whole gain stack with it, and
                  can shove part of it out of the 0% band into 15%.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h2 id="niit-heading">The third effect: the 3.8% surtax</h2>
              </summary>
              <div className="explainer-content">
                <p>
                  Above {formatCurrency(niitThreshold(filingStatus))} of modified
                  AGI, section 1411 charges a further{' '}
                  {(NIIT_RATE * 100).toFixed(1)}% &mdash; the net investment income
                  tax, reported on Form 8960. It is not income tax and it is not
                  part of any bracket; it sits on top of whatever the ordinary and
                  capital-gain schedules have already charged.
                </p>
                <p>
                  What makes it a third effect rather than a fourth bracket is the
                  word <em>lesser</em>. The surtax applies to the lesser of your
                  net investment income and the amount by which MAGI clears the
                  threshold &mdash; so between those two figures, a dollar that
                  1411 does not tax at all still drags a dollar that it does into
                  the base. An IRA withdrawal is expressly excluded by
                  1411(c)(5). A pension is not investment income. Neither is a
                  Social Security benefit. Every one of them is in MAGI, and every
                  one of them can therefore cost you 3.8&cent; on a gain you
                  realized before you took it.
                </p>
                <p>
                  That is the same shape as the torpedo one step up: an income
                  definition wider than the income being taxed. And the thresholds
                  are the same story too &mdash;{' '}
                  {formatCurrency(NIIT_THRESHOLDS.single)} unmarried,{' '}
                  {formatCurrency(NIIT_THRESHOLDS.mfj)} joint,{' '}
                  {formatCurrency(NIIT_THRESHOLDS.mfs)} on a separate return,
                  fixed in {NIIT_ENACTED} and never indexed since. Tax-exempt
                  interest is the one input on this page that stays clear of it
                  entirely: section 103 keeps it out of gross income, so it is
                  neither investment income here nor part of this MAGI &mdash;
                  even while it is raising provisional income in step 2 and
                  Medicare&apos;s MAGI in the line below.
                </p>
              </div>
            </details>

            {nextStepBox(2)}
          </section>

          {/* ───── Step 4: how many of those dollars fit before the next one costs more ───── */}
          <section
            className="step"
            id="step-conversion"
            tabIndex={-1}
            aria-labelledby="step-conversion-heading"
          >
            <p className="step-kicker">Step 4 of {STEPS.length}</p>
            <h2 className="step-heading" id="step-conversion-heading">
              Sizing the conversion
            </h2>

            <p className="step-intro">
              Steps 2 and 3 price the next dollar. This one prices a block of them.
              Pick the line you would rather not cross and the chart draws the
              largest Roth conversion that stays under it, running from where you
              are standing out to that line &mdash; on the same curve as step 2,
              because a conversion is ordinary income and walks you rightwards
              along exactly that axis.
            </p>

            <figure className="chart-figure">
              <div
                className="chart-container"
                role="img"
                aria-label={
                  conversionFits
                    ? `Chart: step 2's marginal-rate curve redrawn from $0 to ${formatCurrency(conversionAxisMax)}, with the sized conversion shaded from ${formatCurrency(ordinaryIncome)} to ${formatCurrency(conversionTarget)}.`
                    : `Chart: step 2's marginal-rate curve redrawn from $0 to ${formatCurrency(conversionAxisMax)}. Nothing fits under the line picked, so no conversion is shaded.`
                }
                aria-describedby="conversion-chart-caption"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={conversionCurve}
                    margin={{ top: 22, right: 28, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="conversionGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PALETTE.accent} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={PALETTE.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.edge} />
                    <XAxis
                      dataKey="income"
                      type="number"
                      domain={[0, conversionAxisMax]}
                      tickFormatter={formatCompact}
                      stroke={PALETTE.inkMuted}
                    />
                    <YAxis
                      stroke={PALETTE.inkMuted}
                      tickFormatter={(value) => `${value}%`}
                      width={70}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip
                          ssBenefit={ssBenefit}
                          segments={conversionSegments}
                          filingStatus={filingStatus}
                          muniInterest={muniInterest}
                          qcd={qcd}
                          ltcg={plannedLtcg}
                          beneficiaries={beneficiaries}
                          year={year}
                        />
                      }
                    />
                    {conversionFits && (
                      <ReferenceArea
                        className="conversion-band"
                        x1={ordinaryIncome}
                        x2={conversionTarget}
                        fill={PALETTE.indigo}
                        fillOpacity={0.2}
                        stroke="none"
                      />
                    )}
                    {conversionFits && (
                      <ReferenceLine
                        className="ceiling-line"
                        x={conversionTarget}
                        stroke={PALETTE.indigo}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        /* The amount goes on the line rather than inside the
                           band: "You are here" already runs rightwards from the
                           band's near edge, and a narrow band would put the two
                           on top of each other. Above the axis is free — this
                           chart draws no IRMAA cliffs, which is what that strip
                           carries on step 2. */
                        label={{
                          value: `${formatCurrency(sizing.conversion)} converted`,
                          position: 'top',
                          fill: PALETTE.indigoBright,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    )}
                    {hereLine(ordinaryIncome, conversionAxisMax, PALETTE.amber)}
                    <Area
                      type="stepAfter"
                      dataKey="marginalRate"
                      stroke={PALETTE.accent}
                      strokeWidth={2}
                      fill="url(#conversionGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* Deliberately not step 2's label. The two charts sweep the same
                  axis, so repeating its total-income formula here would say nothing
                  new; what is worth saying is which stretch of it this one draws. */}
              <p className="chart-axis-label">
                Other Income ($), the conversion included &mdash; step 2&apos;s own
                axis, drawn out to {formatCurrency(conversionAxisMax)}
              </p>

              <p className="chart-key chart-key-conversion">
                <span
                  className="chart-key-swatch chart-key-swatch-conversion"
                  aria-hidden="true"
                />
                {conversionFits ? (
                  <span>
                    <strong>The conversion, and the line it stops at.</strong> The
                    shaded band runs from your own {formatCurrency(ordinaryIncome)}{' '}
                    out to {formatCurrency(conversionTarget)} of other income &mdash;
                    the point at which the line you picked is reached, once the
                    benefit that the extra income drags into the tax base is counted.
                    That is why the band is shorter than the headroom the line
                    appears to offer. Every dollar inside it is charged at the rates
                    the curve draws above it.
                  </span>
                ) : (
                  <span>
                    <strong>No band is drawn.</strong> Nothing fits under the line
                    you picked, so there is no conversion to shade. The amber marker
                    is still where you are standing.
                  </span>
                )}
              </p>

              <CurveCaption
                id="conversion-chart-caption"
                segments={conversionSegments}
                lead={`Step 2's own curve, redrawn out to ${formatCurrency(conversionAxisMax)}: left to right, the rate on the next dollar of other income is`}
              />
            </figure>

            <fieldset className="input-group chart-slider ceiling-picker">
              <legend>The line you would rather not cross</legend>
              <div className="segmented segmented-stacked">
                {ceilings.map(({ id, label, amount, measure }) => (
                  <label key={id} className="segmented-option">
                    <input
                      type="radio"
                      name="conversion-ceiling"
                      value={id}
                      checked={ceiling.id === id}
                      onChange={() => {
                        setCeilingId(id);
                        announce('conversion');
                      }}
                    />
                    <span>
                      {label}
                      <small className="segmented-caption">
                        {formatCurrency(amount)} of {CONVERSION_MEASURE_LABELS[measure]}
                      </small>
                    </span>
                  </label>
                ))}
              </div>

              <p className="slider-readout">
                {conversionFits ? (
                  <>
                    <strong>{formatCurrency(sizing.conversion)} fits.</strong> On
                    top of your {formatCurrency(ordinaryIncome)} of other income,
                    that conversion lands on the line you picked &mdash;{' '}
                    {ceiling.label}, {formatCurrency(ceiling.amount)} of{' '}
                    {ceilingMeasure}. It costs{' '}
                    <strong>{formatCurrency(sizing.taxCost)}</strong> in federal
                    tax, taking this year&apos;s bill from{' '}
                    {formatCurrency(sizing.taxBefore)} to{' '}
                    {formatCurrency(sizing.taxAfter)} &mdash; an average of{' '}
                    <strong>{sizing.costPerDollar}%</strong> on every dollar
                    converted, against <strong>{sizing.rateAboveCeiling}%</strong>{' '}
                    on the first dollar past the line.
                  </>
                ) : sizing.alreadyOver ? (
                  <>
                    <strong>Nothing fits.</strong> This return is already{' '}
                    {formatCurrency(Math.round(-sizing.headroom))} past the line
                    you picked &mdash; {ceiling.label},{' '}
                    {formatCurrency(ceiling.amount)} of {ceilingMeasure} &mdash;
                    before a dollar is converted, so there is no room under it to
                    convert into. Take the other-income slider on step 2 down, or
                    pick a line further out.
                  </>
                ) : (
                  <>
                    <strong>Nothing fits.</strong> This return sits within a dollar
                    of the line you picked &mdash; {ceiling.label},{' '}
                    {formatCurrency(ceiling.amount)} of {ceilingMeasure} &mdash; so
                    the largest conversion that stays under it rounds to nothing.
                    Pick a line further out to see what a conversion would cost.
                  </>
                )}
              </p>

              <p className="slider-advice conversion-advice">
                <strong>Past the line.</strong> {ceiling.note}
              </p>
            </fieldset>

            <details className="explainer">
              <summary>
                <h2 id="conversion-what-heading">
                  What a Roth conversion is, and why it is sized rather than chosen
                </h2>
              </summary>
              <div className="explainer-content">
                <p>
                  A conversion moves money from a traditional IRA to a Roth IRA. The
                  whole amount is ordinary income in the year you do it &mdash; the
                  same as a withdrawal, and it lands on the same axis as everything
                  on step 2 &mdash; and after that it is never taxed again, is not a
                  required distribution at any age, and never counts toward
                  provisional income, so it never drags a benefit into the tax base
                  in a later year.
                </p>
                <p>
                  That is why the amount is worth solving for rather than picking. A
                  conversion is the one piece of income a retiree controls to the
                  dollar, and every line on this page has a cheap side and a dear
                  one. Converting up to a line is the cheap side taken in full;
                  converting a dollar past it buys the whole of the dear side, and
                  in the case of an IRMAA cliff, buys it for a whole year on the
                  strength of that single dollar.
                </p>
                <p>
                  Since 2018 a conversion cannot be undone: the Tax Cuts and Jobs
                  Act repealed recharacterisation for conversions, so the tax is
                  settled by 31 December of the year you convert. That is the other
                  half of the case for sizing it &mdash; there is no re-cutting it
                  in April when the return is prepared.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h2 id="conversion-average-rate-heading">
                  Why the average rate is the number to compare
                </h2>
              </summary>
              <div className="explainer-content">
                <p>
                  The curve above prices the <em>next</em> dollar. A conversion is
                  not one dollar, it is a block of them that walks across the chart
                  from your own marker to the ceiling, picking up every rate in
                  between &mdash; so what it actually costs is the area under that
                  stretch, not the height of the curve at either end.
                </p>
                <p>
                  {conversionFits ? (
                    <>
                      Here that is {formatCurrency(sizing.taxCost)} on{' '}
                      {formatCurrency(sizing.conversion)}, or{' '}
                      <strong>{sizing.costPerDollar}%</strong> averaged over the
                      block. That is the figure to hold against the rate you expect
                      in the years the money would otherwise come out: a conversion
                      pays when it is cheaper than the future, and the future
                      includes the years a surviving spouse files single on the same
                      income, and the ten-year window an adult child has to empty an
                      inherited IRA.
                    </>
                  ) : (
                    <>
                      With nothing fitting under the line you picked there is no
                      block to average, but the comparison is unchanged: the average
                      cost of a conversion is the figure to hold against the rate
                      you expect in the years the money would otherwise come out
                      &mdash; including the years a surviving spouse files single on
                      the same income, and the ten-year window an adult child has to
                      empty an inherited IRA.
                    </>
                  )}
                </p>
                <p>
                  The average is always lower than the rate at the far end and
                  always higher than the rate at the near one, which is the whole
                  reason a conversion sized to a line beats a conversion sized to a
                  bracket rate. It is also why a conversion that runs <em>through</em>{' '}
                  the torpedo can still pay: the hump is priced into the average
                  once, rather than paid year after year by a reader who sits inside
                  it.
                </p>
                <p>
                  Two costs are outside these figures. The Medicare surcharge is not
                  tax and appears in none of them &mdash; if the line you picked is
                  an IRMAA tier, crossing it costs the surcharge on top of whatever
                  the curve says. And state income tax is not here at all; this page
                  is federal only.
                </p>
              </div>
            </details>

            <details className="explainer">
              <summary>
                <h2 id="conversion-ceilings-heading">
                  The six lines, and what each one is
                </h2>
              </summary>
              <div className="explainer-content">
                <p>
                  Each line is a different kind of edge, and they are not in the
                  same order on every return &mdash; a large benefit can put the
                  85% base to the left of the 12% bracket top, and a separate return
                  collapses both bases onto $0. The figures below are this
                  return&apos;s, for {year}.
                </p>
                <ul>
                  {ceilings.map((c) => (
                    <li key={c.id}>
                      <strong>{c.label}</strong> &mdash;{' '}
                      {formatCurrency(c.amount)} of{' '}
                      {CONVERSION_MEASURE_LABELS[c.measure]}. {c.note}
                    </li>
                  ))}
                </ul>
                <p>
                  Four different income definitions are in that list, which is the
                  trap it exists to spring. Taxable income is after the standard
                  deduction; provisional income is before it and counts tax-exempt
                  interest and half the benefit; Medicare&apos;s MAGI is adjusted
                  gross income with tax-exempt interest added back. A conversion
                  that clears one line by $5,000 can be $5,000 over another.
                </p>
              </div>
            </details>
          </section>

          {/* ───── The close: the reader's own answer, in one place ─────

              The mirror of the recap that closes step 1. That one names what was
              set; this one says what came of it — and it is the first place on
              the page where the six figures a reader actually leaves with sit
              together rather than one per step.

              Outside step 4 rather than at the foot of it, because it summarises
              all four steps and belongs to none of them, and last before the
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
              {plannedLtcg > 0
                ? `, ${formatCurrency(plannedLtcg)} of it a long-term gain`
                : ''}
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
                    Other income plus the <em>whole</em> benefit
                    {muniInterest > 0
                      ? `, plus ${formatCurrency(muniInterest)} of tax-exempt interest`
                      : ''}
                    {given > 0
                      ? `, less the ${formatCurrency(given)} that went straight to charity`
                      : ''}
                    . The untaxed part of the benefit is counted here on purpose:
                    it is the part the whole page is about, and against taxable
                    income it would vanish.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Federal tax</dt>
                <dd>
                  <strong>{formatCurrency(hereTax)}</strong>
                  <span className="answer-gloss">
                    What the {year} return owes
                    {hereSurtax > 0 ? (
                      <>
                        : {formatCurrency(hereIncomeTax)} of income tax and{' '}
                        {formatCurrency(hereSurtax)} of the surtax on the next line,
                        which is a different chapter of the code on a form of its
                        own
                      </>
                    ) : (
                      ''
                    )}
                    . Federal only &mdash; no state, and no Medicare premium,
                    which is charged rather than taxed and gets its own line below.
                  </span>
                </dd>
              </div>

              {/* Chapter 2A, on Form 8960, carried to Schedule 2 rather than to
                  the tax line — so it gets a line of its own here even when it
                  is $0, because what a reader most needs to know about a surtax
                  they are not paying is how close they are to paying it. */}
              <div className="answer-figure">
                <dt>Net investment income tax</dt>
                <dd>
                  <strong>
                    {hereSurtax > 0
                      ? formatCurrency(hereSurtax)
                      : 'None — under the threshold'}
                  </strong>
                  <span className="answer-gloss">
                    {hereNiit.nii <= 0 ? (
                      <>
                        3.8% of investment income, once MAGI passes{' '}
                        {formatCurrency(hereNiit.threshold)}. This return has no
                        investment income for it to reach: a pension, an IRA
                        withdrawal and Social Security are all outside it, so
                        however high the income goes, there is nothing here for
                        1411 to charge.
                      </>
                    ) : hereSurtax > 0 ? (
                      <>
                        3.8% of {formatCurrency(hereNiit.base)} &mdash; the lesser
                        of the {formatCurrency(hereNiit.nii)} gain and the{' '}
                        {formatCurrency(hereNiit.excess)} by which{' '}
                        {formatCurrency(hereNiit.magi)} of MAGI clears the{' '}
                        {formatCurrency(hereNiit.threshold)} threshold.{' '}
                        {hereNiit.toFullyTaxed && hereNiit.toFullyTaxed > 0
                          ? `Another ${formatCurrency(hereNiit.toFullyTaxed)} of income — of any kind, including an IRA withdrawal 1411 never taxes — pulls the rest of the gain in at 3.8% too.`
                          : 'The whole gain is already in, so the next dollar of ordinary income no longer adds to it.'}
                      </>
                    ) : (
                      <>
                        3.8% on the lesser of investment income and MAGI over{' '}
                        {formatCurrency(hereNiit.threshold)}. This return holds{' '}
                        {formatCurrency(hereNiit.nii)} of gain and{' '}
                        {formatCurrency(hereNiit.magi)} of MAGI, so it is{' '}
                        {formatCurrency(hereNiit.headroom ?? 0)} short &mdash; and
                        the dollars that would close that gap need not be
                        investment income at all.
                      </>
                    )}{' '}
                    That threshold was set in {NIIT_ENACTED} and has never been
                    indexed
                    {SS_BASES[filingStatus].ssBase50 > 0 ? (
                      <>
                        , exactly like the{' '}
                        {formatCurrency(SS_BASES[filingStatus].ssBase50)} and{' '}
                        {formatCurrency(SS_BASES[filingStatus].ssBase85)} bases step
                        2 is built on
                      </>
                    ) : (
                      ' — the same frozen line step 2 is built on, drawn in a different decade'
                    )}
                    .
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
                <dt>The next dollar</dt>
                <dd>
                  <strong>
                    {herePoint ? `${herePoint.marginalRate}%` : '\u2014'}
                  </strong>
                  <span className="answer-gloss">
                    What one more dollar of ordinary income costs, where the amber
                    line crosses step 2&apos;s curve. The gap between this and the
                    average above it is the whole reason that curve is worth
                    drawing.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Benefit in the tax base</dt>
                <dd>
                  <strong>
                    {ssBenefit > 0
                      ? `${formatCurrency(taxableSS)} of ${formatCurrency(ssBenefit)}`
                      : 'None'}
                  </strong>
                  <span className="answer-gloss">
                    {ssBenefit > 0
                      ? `${formatPercent(taxableSS / ssBenefit)} of it. 86(a) can never make more than 85% taxable, and whatever is left never reaches the return at all.`
                      : 'Step 1 sets no benefit, so there is nothing for other income to drag in \u2014 every curve on this page is an ordinary one.'}
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
                      ? `Another ${formatCurrency(hereIrmaa.headroom)} of it crosses the next cliff, which costs ${formatCurrency(hereIrmaa.nextStep)} a year on the strength of one dollar.`
                      : 'This is the top tier; there is no cliff above it.'}{' '}
                    Billed on a {IRMAA_LOOKBACK_YEARS}-year lag, so this is what{' '}
                    {year} income sets for {year + IRMAA_LOOKBACK_YEARS}.
                  </span>
                </dd>
              </div>

              <div className="answer-figure">
                <dt>Room to convert</dt>
                <dd>
                  <strong>
                    {conversionFits
                      ? `${formatCurrency(sizing.conversion)} fits`
                      : 'Nothing fits'}
                  </strong>
                  <span className="answer-gloss">
                    {conversionFits
                      ? `Sized against ${ceiling.label}, ${formatCurrency(ceiling.amount)} of ${ceilingMeasure}. It costs ${formatCurrency(sizing.taxCost)}, taking the bill to ${formatCurrency(sizing.taxAfter)} \u2014 an average of ${sizing.costPerDollar}% on every dollar converted.`
                      : sizing.alreadyOver
                        ? `This return is already ${formatCurrency(Math.round(-sizing.headroom))} past ${ceiling.label}, ${formatCurrency(ceiling.amount)} of ${ceilingMeasure}, so there is no room under it to convert into. Step 4 has five other lines to pick from.`
                        : `This return sits within a dollar of ${ceiling.label}, ${formatCurrency(ceiling.amount)} of ${ceilingMeasure}, so the largest conversion that stays under it rounds to nothing. Step 4 has five other lines to pick from.`}
                  </span>
                </dd>
              </div>
            </dl>

            {/* ───── The link is the return ─────

                The address bar has carried the whole return since the query
                string went in, and until now the only place the page mentioned it
                was the failure case: the note that appears when a link asked for
                something this page could not show. So a reader who wanted to send
                this to a spouse or an advisor had to work out on their own that
                the URL was the thing to send.

                It belongs here rather than in the header, because what is worth
                sending is the answer, and this is the one place the answer sits
                together. The sentence is the feature and the button is the
                convenience — see `canCopyLink`. */}
            <div className="answer-share">
              <p className="answer-share-line">
                <strong>The address bar is this return.</strong> Every control on
                this page rides in the link, so sending it sends the figures above
                exactly as they stand &mdash; and whoever opens it can move the
                sliders themselves without disturbing yours.
              </p>
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

            <p className="answer-note">
              Every figure here moves the moment any slider does, and none of them
              is a filing: this is the standard deduction with nothing itemised,
              no credits, no other household member&apos;s income, no state and no
              withholding. What they are for is the comparison &mdash; this year
              against the years the same money would otherwise come out in.
            </p>
          </section>
        </div>
      </div>

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

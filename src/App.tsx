import React, { useState, useMemo, useRef } from 'react';
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
  ltcgMarginalRateCurve,
  maxAnnualSSBenefit,
  avgAnnualSSBenefit,
  SS_BASES,
  TAX_YEARS,
  defaultTaxYear,
  filingParams,
  FilingStatus,
  segmentCurve,
  standardDeductionFor,
  taxableSocialSecurity,
  qcdLimitFor,
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
} from './utils/tax';
import type {
  TaxYear,
  LTCGMarginalRatePoint,
  MarginalRatePoint,
  CurveSegment,
  IrmaaCliff,
} from './utils/tax';

const MAX_INCOME = 150_000;
const MAX_LTCG = 200_000;
const DEFAULT_ORDINARY_INCOME = 30_000;
/** Roughly a $1.4M muni ladder at 2025 yields — well past any realistic retiree. */
const MAX_MUNI_INTEREST = 50_000;

/**
 * One worked example in three steps, in the order a reader builds it: the
 * benefit they will collect, what their other income does to it, and what a
 * realized capital gain does on top of both. Every step prices the same
 * return, so a figure set in step 1 is still set in step 3.
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
 * Every step has the same shape: the chart, then the one slider that says
 * where on that chart the reader is standing, then the collapsed explainers,
 * then the box to the next step. Step 1 is the exception that sets the rule —
 * it has no curve of its own, so the return itself (year, filing status, age)
 * stands where the chart stands on the two steps below it, and the benefit
 * slider follows it in the slider's place.
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
      'Add the income that is not Social Security, and see what the next dollar of it really costs.',
  },
  {
    id: 'gains',
    navLabel: 'Capital gains',
    heading: 'Capital Gains Stacking',
    blurb:
      'Realize a long-term gain on top of all that, and watch the two effects stack.',
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

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

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
 * Both charts price a whole axis, so neither one moves when the slider beneath
 * it moves: the reader's number is a *place* on a curve that is already drawn,
 * not an input to it. Reading the curve back at that place is what turns the
 * slider from an inert control into a position. The sweep ascends, so the last
 * sampled point at or below the value is the one — the sliders step in $500
 * and the curves sample every $250, so in practice it is an exact hit.
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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  borderRadius: '8px',
  color: '#f8fafc',
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
  beneficiaries = 1,
  year = defaultTaxYear(),
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const segment = segments.find(
    (seg) => point.income >= seg.start && point.income <= seg.end,
  );
  // Medicare reads a wider MAGI than the tax chain does — tax-exempt interest
  // is added back — so it has to be recomputed here rather than read off the
  // curve, which only carries taxable figures.
  const irmaa = irmaaFor(
    irmaaMagi({ ordinaryIncome: point.income, ssBenefit, ltcg: 0, filingStatus, muniInterest, qcd }),
    { filingStatus, beneficiaries, year },
  );
  // The x-axis is income before the gift, so the charitable exclusion has to
  // come back out of the total the header quotes.
  const given = Math.min(qcd, point.income);
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        Other income {formatCurrency(point.income)} · Total income {formatCurrency(point.income + ssBenefit)}
      </div>
      {given > 0 && (
        <div style={{ fontSize: '0.8125rem', color: '#a3e635' }}>
          Less {formatCurrency(given)} given straight to charity —{' '}
          {formatCurrency(point.income - given)} of it reaches the return
        </div>
      )}
      <div>
        Marginal Rate: <strong style={{ color: '#38bdf8' }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: '#ea580c' }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      <div>
        Medicare IRMAA:{' '}
        <strong style={{ color: '#fb7185' }}>
          {formatCurrency(irmaa.annualSurcharge)}/yr
        </strong>
        {irmaa.tier > 0 ? ` (tier ${irmaa.tier} of 5)` : ''}
      </div>
      {irmaa.headroom !== null && (
        <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
          {formatCurrency(irmaa.headroom)} of MAGI to the next cliff, then{' '}
          {formatCurrency(irmaa.nextStep)}/yr more
        </div>
      )}
      {segment && segment.type === 'hill' && (
        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
          Consider avoiding this tax hill by staying under {formatCurrency(segment.start)} or over {formatCurrency(segment.end)}
        </div>
      )}
      {segment && segment.type === 'valley' && (
        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
          Consider filling out this tax valley at {formatCurrency(point.income)}
        </div>
      )}
    </div>
  );
};

interface LTCGTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LTCGMarginalRatePoint }>;
  ordinaryIncome: number;
  ssBenefit: number;
  segments: CurveSegment<LTCGMarginalRatePoint>[];
}

export const LTCGTooltip: React.FC<LTCGTooltipProps> = ({
  active,
  payload,
  ordinaryIncome,
  ssBenefit,
  segments,
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const segment = segments.find(
    (seg) => point.ltcg >= seg.start && point.ltcg <= seg.end,
  );
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        LTCG {formatCurrency(point.ltcg)} · Total income {formatCurrency(point.ltcg + ordinaryIncome + ssBenefit)}
      </div>
      <div>
        Marginal Rate: <strong style={{ color: '#f59e0b' }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: '#ea580c' }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      {segment && segment.type === 'hill' && (
        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
          Consider avoiding this tax hill by staying under {formatCurrency(segment.start)} or over {formatCurrency(segment.end)}
        </div>
      )}
      {segment && segment.type === 'valley' && (
        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
          Consider filling out this tax valley at {formatCurrency(point.ltcg)}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [step, setStep] = useState<StepId>('benefit');
  const [year, setYear] = useState<TaxYear>(() => defaultTaxYear());
  const [ssBenefit, setSsBenefit] = useState<number>(() =>
    avgAnnualSSBenefit(defaultTaxYear()),
  );
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(DEFAULT_ORDINARY_INCOME);
  const [plannedLtcg, setPlannedLtcg] = useState<number>(0);
  const [isSenior, setIsSenior] = useState<boolean>(false);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(false);
  const [muniInterest, setMuniInterest] = useState<number>(0);
  const [qcd, setQcd] = useState<number>(0);

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
  };

  /**
   * The charitable limit is per individual, so it halves on the way from a
   * joint return to any other one. Re-cap the gift rather than leaving the
   * slider parked past its own right edge.
   */
  const changeFilingStatus = (next: FilingStatus): void => {
    setQcd((current) => Math.min(current, qcdLimitFor({ filingStatus: next, year })));
    setFilingStatus(next);
  };

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;
  /**
   * The statutory annual QCD limit for this return, and the right edge of the
   * slider. They differ only on a joint return, whose $216,000 limit is far
   * past the chart's own axis — a slider that long would be unreadable, and the
   * note under it states the statutory figure either way.
   */
  const qcdLimit = qcdLimitFor({ filingStatus, year });
  const qcdSliderMax = Math.min(qcdLimit, MAX_INCOME);

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
  // Whether the far side of the phaseout is inside the chart's x-axis depends on
  // how much of the benefit is taxable, so work it out rather than guess.
  const phaseoutEndsOnChart =
    phaseoutEnd !== null &&
    MAX_INCOME +
      taxableSocialSecurity({
        ssBenefit,
        ordinaryIncome: MAX_INCOME,
        filingStatus,
        muniInterest,
        qcd,
        year,
      }) >
      phaseoutEnd;

  const curve = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest, qcd, year },
        { maxIncome: MAX_INCOME, step: 250 },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, qcd, year],
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

  const ltcgCurve = useMemo(
    () =>
      ltcgMarginalRateCurve(
        { ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, qcd, year },
        { maxLTCG: MAX_LTCG, step: 250 },
      ),
    [ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, qcd, year],
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

  // Medicare is per enrollee, so a joint return with both spouses over 65 pays
  // every surcharge twice off one MAGI figure. Below 65 nobody is enrolled yet,
  // but the two-year lookback means this year's income still sets the first
  // premium they will see — so price one enrollee rather than none.
  const beneficiaries = filingStatus === 'mfj' && seniors === 2 ? 2 : 1;

  const cliffs = useMemo(
    () => irmaaCliffs({ ssBenefit, filingStatus, muniInterest, qcd, beneficiaries, year }),
    [ssBenefit, filingStatus, muniInterest, qcd, beneficiaries, year],
  );

  /** The cliffs that actually land inside the chart's x-axis. */
  const cliffsOnChart: IrmaaCliff[] = cliffs.filter(
    (c) => c.otherIncome > 0 && c.otherIncome <= MAX_INCOME,
  );

  /**
   * The first cliff off the right edge, for the joint returns where none fit:
   * "no line is drawn" is only useful next to where the nearest one would be.
   */
  const firstCliffPastAxis: IrmaaCliff | undefined = cliffs.find(
    (c) => c.otherIncome > MAX_INCOME,
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
      <h1>Marginal Tax Rate</h1>
      <p className="subtitle">
        Federal marginal rate on the next dollar of other income for{' '}
        {FILING_STATUS_PROSE[filingStatus]} ({year} brackets, standard
        deduction),
        with Social Security taxed under the 50%/85% provisional-income rules.
      </p>

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

      {/* ───── Step 1: the return every later step prices ───── */}
      <section
        className="step"
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
                onChange={(e) => setIsSenior(e.target.checked)}
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
                  onChange={(e) => setSpouseIsSenior(e.target.checked)}
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
            onChange={(e) => setSsBenefit(Number(e.target.value))}
          />
          <div className="slider-range-labels">
            <span>$0</span>
            <span>{formatCurrency(avgAnnualSSBenefit(year))} ({year} avg)</span>
            <span>{formatCurrency(maxAnnualSSBenefit(year))} ({year} max)</span>
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
              onChange={(e) => setMuniInterest(Number(e.target.value))}
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
              max={qcdSliderMax}
              step={250}
              value={qcd}
              onChange={(e) => setQcd(Number(e.target.value))}
              className="slider-lime"
            />
            <div className="slider-range-labels">
              <span>$0</span>
              <span>{formatCurrency(qcdSliderMax)}</span>
            </div>
            <p className="field-note">
              IRA money paid straight to the charity. It comes <em>out of</em> the
              other income set in step 2 rather than on top of it, because the
              gift is a distribution that would otherwise have been reported — so it
              moves the whole curve to the right, exactly as far as tax-exempt
              interest moves it to the left. Capped at{' '}
              <strong>{formatCurrency(qcdLimit)}</strong> for {year}
              {filingStatus === 'mfj'
                ? ' \u2014 408(d)(8)(A) caps it per individual, so a joint return where both spouses have reached 70\u00BD and each gives from their own IRA gets it twice. The slider stops at the chart\u2019s own right edge rather than at that figure.'
                : ' by 408(d)(8)(A), which the IRS indexes every year. Anything past it is an ordinary distribution, deductible only on an itemized return and only within the AGI limits of section 170(b).'}
            </p>
          </div>
        </details>

        {nextStepBox(0)}
      </section>

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
          The chart prices every income from $0 to {formatCurrency(MAX_INCOME)};
          the slider says which point along it is yours.
        </p>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={curve}
              margin={{ top: 22, right: 28, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis
                dataKey="income"
                type="number"
                domain={[0, MAX_INCOME]}
                tickFormatter={formatCompact}
                stroke="#94a3b8"
              />
              <YAxis
                stroke="#94a3b8"
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
                    beneficiaries={beneficiaries}
                    year={year}
                  />
                }
              />
              {cliffsOnChart.map((cliff) => (
                <ReferenceLine
                  key={cliff.tier}
                  x={cliff.otherIncome}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{
                    value: `IRMAA ${cliff.tier}`,
                    position: 'top',
                    fill: '#fb7185',
                    fontSize: 11,
                  }}
                />
              ))}
              <Area
                type="stepAfter"
                dataKey="marginalRate"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="url(#rateGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-axis-label">
          Other Income ($) &middot; Total income = Other income + {formatCurrency(ssBenefit)} SS
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

        <div className="input-group chart-slider">
          <div className="slider-header">
            <label htmlFor="ordinary-income">Other Ordinary Income (non-LTCG, non-SS)</label>
            <span className="slider-value amber">{formatCurrency(ordinaryIncome)}</span>
          </div>
          <input
            id="ordinary-income"
            type="range"
            min={0}
            max={MAX_INCOME}
            step={500}
            value={ordinaryIncome}
            onChange={(e) => setOrdinaryIncome(Number(e.target.value))}
            className="slider-amber"
          />
          <div className="slider-range-labels">
            <span>$0</span>
            <span>{formatCurrency(MAX_INCOME)}</span>
          </div>

          <p className="slider-readout">
            <strong>You are here.</strong> At {formatCurrency(ordinaryIncome)} of
            other income the next dollar is taxed at{' '}
            <strong>{herePoint ? `${herePoint.marginalRate}%` : '\u2014'}</strong>{' '}
            &mdash; that point on the curve above, not the curve itself, is what
            the slider moves.
          </p>
        </div>

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

      {/* ───── Step 3: a realized gain on top of both ───── */}
      <section
        className="step"
        id="step-gains"
        tabIndex={-1}
        aria-labelledby="step-gains-heading"
      >
        <p className="step-kicker">Step 3 of {STEPS.length}</p>
        <h2
          className="step-heading section-heading-amber"
          id="step-gains-heading"
        >
          Capital Gains Stacking
        </h2>

        <p className="step-intro">
          The chart prices every realized gain from $0 to{' '}
          {formatCurrency(MAX_LTCG)} on top of the return you have already set;
          the slider says which one is yours.
        </p>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={ltcgCurve}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="ltcgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis
                dataKey="ltcg"
                type="number"
                domain={[0, MAX_LTCG]}
                tickFormatter={formatCompact}
                stroke="#94a3b8"
              />
              <YAxis
                stroke="#94a3b8"
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
                  />
                }
              />
              <Area
                type="stepAfter"
                dataKey="marginalRate"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#ltcgGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-axis-label">
          Long-Term Capital Gains ($) &middot; Ordinary income {formatCurrency(ordinaryIncome)} + {formatCurrency(ssBenefit)} SS
        </p>

        <div className="input-group chart-slider">
          <div className="slider-header">
            <label htmlFor="planned-ltcg">
              Long-Term Capital Gains You Plan to Realize
            </label>
            <span className="slider-value emerald">{formatCurrency(plannedLtcg)}</span>
          </div>
          <input
            id="planned-ltcg"
            type="range"
            min={0}
            max={MAX_LTCG}
            step={500}
            value={plannedLtcg}
            onChange={(e) => setPlannedLtcg(Number(e.target.value))}
            className="slider-emerald"
          />
          <div className="slider-range-labels">
            <span>$0</span>
            <span>{formatCurrency(MAX_LTCG)}</span>
          </div>

          <p className="slider-readout">
            <strong>You are here.</strong> At {formatCurrency(plannedLtcg)} of
            realized gains the next dollar of gain is taxed at{' '}
            <strong>
              {hereGainPoint ? `${hereGainPoint.marginalRate}%` : '\u2014'}
            </strong>
            {hereGainPoint && hereGainPoint.marginalRate > 20
              ? ' \u2014 past the 20% ceiling a gain can be charged on its own, so the rest of it is benefit being dragged into the tax base alongside the gain.'
              : '.'}
          </p>
        </div>

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
              The chart shows the <strong>effective marginal tax rate</strong> on
              each additional dollar of long-term capital gains, given the
              ordinary income and Social Security benefit set above. Because
              LTCG raises provisional income, it can drag Social Security
              benefits into taxable territory (taxed at ordinary rates) while
              simultaneously pushing the gains themselves from the 0% bracket
              to 15%. In the worst zone, a single dollar of LTCG can trigger
              both effects, producing combined marginal rates that far exceed
              the statutory 15% capital-gains rate.
            </p>
          </div>
        </details>
      </section>

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

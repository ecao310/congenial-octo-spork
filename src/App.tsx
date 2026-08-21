import React, { useState, useMemo, useRef } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  marginalRateCurve,
  ltcgMarginalRateCurve,
  maxAnnualSSBenefit,
  avgAnnualSSBenefit,
  SS_BASES,
  SS_BASE50_ENACTED,
  SS_BASE85_ENACTED,
  TAX_YEARS,
  defaultTaxYear,
  taxYearParams,
  filingParams,
  FilingStatus,
  segmentCurve,
  conversionCeilings,
  sizeConversion,
  CONVERSION_MEASURE_LABELS,
  standardDeductionFor,
  deductionFor,
  taxableSocialSecurity,
  muniInterestEffect,
  qcdEffect,
  qcdLimitFor,
  qcdSplitInterestLimit,
  QCD_MIN_AGE,
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
  allIrmaaTiers,
  irmaaFirstCliffMagi,
  irmaaMagiYear,
  IRMAA_LOOKBACK_YEARS,
  partBStandardPremium,
} from './utils/tax';
import {
  projectYears,
  rmdApplicableAge,
  RMD_AGE_BEFORE_SECURE_2,
  RMD_RESERVED_BIRTH_YEAR,
  UNIFORM_LIFETIME_DIVISORS,
} from './utils/projection';
import type { ProjectionYearRow } from './utils/projection';
import {
  SEQUENCING_FILL_CEILING_IDS,
  SEQUENCING_STRATEGIES,
  compareSequencing,
  sequencingChartRows,
} from './utils/sequencing';
import type {
  SequencingChartRow,
  SequencingComparison,
  SequencingStrategy,
  SequencingStrategyId,
} from './utils/sequencing';
import {
  LUMP_SUM_ELECTION_BOX,
  backPayCurve,
  lumpSumElection,
  splitBackPay,
} from './utils/lumpSum';
import type { BackPayCurvePoint, LumpSumElection } from './utils/lumpSum';
import {
  stateTestDeltas,
  statesTaxingSocialSecurity,
  statesWithMovingTests,
} from './utils/stateTax';
import type {
  TaxYear,
  LTCGMarginalRatePoint,
  MarginalRatePoint,
  CurveSegment,
  ConversionCeilingId,
  IrmaaCliff,
} from './utils/tax';

const MAX_INCOME = 150_000;
const MAX_LTCG = 200_000;
const DEFAULT_ORDINARY_INCOME = 30_000;
const MAX_CONVERSION = 1_000_000;
/** Roughly a $1.4M muni ladder at 2025 yields — well past any realistic retiree. */
const MAX_MUNI_INTEREST = 50_000;

/** The projection's horizon, in years. Ten is a plan; thirty is a lifetime. */
const MIN_HORIZON = 10;
const MAX_HORIZON = 30;
/**
 * Birth years the projection offers. The top of the range is deliberately past
 * the app's audience: someone born in 1975 has not claimed yet, and watching
 * their first required distribution land at 75 rather than 73 is the point.
 */
const MIN_BIRTH_YEAR = 1940;
const MAX_BIRTH_YEAR = 1975;
const MAX_TRADITIONAL_BALANCE = 3_000_000;
const MAX_COLA = 5;
const MAX_BALANCE_GROWTH = 10;

const MAX_SPENDING = 250_000;
const MAX_ACCOUNT_BALANCE = 3_000_000;

/**
 * The longest retroactive award the back-pay chart will draw, in months of
 * benefit attributable to *earlier* years.
 *
 * Not a statutory limit, because there is not one. Section 202(j)(1) pays a
 * retirement claim up to six months back and 223(b) a disability claim up to
 * twelve, but neither caps how long the agency may take to decide: a claim
 * denied, reconsidered, heard by an administrative law judge and then appealed
 * can be four or five years old by the time it is paid, and every month of it
 * arrives in one cheque. Five years is the far end of realistic.
 */
const MAX_BACK_PAY_MONTHS = 60;
/** Two years: a denial, a hearing, and the wait for a decision. */
const DEFAULT_BACK_PAY_MONTHS = 24;
/**
 * Other income during the wait. Lower than the app's other default on purpose —
 * the years spent waiting on a disability award are the lean ones, and that is
 * exactly what leaves each of them a set of thresholds nobody used.
 */
const DEFAULT_BACK_PAY_INCOME = 20_000;

/** Slate for the default treatment, fuchsia for the election that undoes it. */
const BACK_PAY_COLORS = { without: '#94a3b8', with: '#e879f9' } as const;

/**
 * One colour per withdrawal order, keyed by the same `chartKey` the data uses.
 *
 * Slate for the conventional order on purpose: it is the default everyone
 * arrives with, and the other two are the departures from it.
 */
const SEQUENCING_COLORS: Record<SequencingStrategy['chartKey'], string> = {
  taxableFirst: '#94a3b8',
  proportional: '#a78bfa',
  bracketFill: '#fbbf24',
};

/**
 * The page outgrew a single scroll. Every section still reads off one shared
 * scenario — the sliders above the tab strip — so the split is by subject, not
 * by input: pick a tab and the same taxpayer is re-priced from that angle.
 *
 * Those shared inputs are themselves split. Year, filing status, age, benefit
 * and other ordinary income are always on screen because all five change the
 * picture at page load. Capital gains, tax-exempt interest and the charitable
 * distribution sit in a collapsed `advanced-inputs` block, because each one
 * starts at $0 and at $0 leaves every chart on every tab identical.
 */
const TABS = [
  { id: 'torpedo', label: 'Tax Torpedo' },
  { id: 'gains', label: 'Capital Gains' },
  { id: 'medicare', label: 'Medicare' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'horizon', label: 'Over Time' },
  { id: 'states', label: 'State Taxes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

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

/**
 * A half-year age, the way the statute writes it: 70.5 is "70½". The tax code
 * measures the QCD age to the day, so the half is not a rounding artefact and
 * dropping it would misstate the rule by six months.
 */
const formatHalfAge = (age: number): string =>
  Number.isInteger(age) ? String(age) : `${Math.floor(age)}\u00BD`;

/** A rate given as a fraction, rendered as cents lost per dollar earned. */
const formatCents = (rate: number): string =>
  `${Math.round(rate * 10_000) / 100}\u00A2`;

/** Premiums are quoted to the cent, unlike every other figure in the app. */
const formatCurrencyCents = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);

/**
 * "Minnesota and Rhode Island", "Minnesota, Rhode Island and West Virginia" —
 * a prose list, not a `join(', ')`, because these appear mid-sentence.
 */
const formatNameList = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

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

interface ProjectionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ProjectionYearRow }>;
  /** The first year, so every figure can also be quoted in its dollars. */
  startYear: number;
}

export const ProjectionTooltip: React.FC<ProjectionTooltipProps> = ({
  active,
  payload,
  startYear,
}) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        {row.year} &middot; age {row.age}
      </div>
      <div>
        Taxable share of benefit:{' '}
        <strong style={{ color: '#2dd4bf' }}>{row.taxableSharePercent}%</strong>{' '}
        ({formatCurrency(row.taxableSS)} of {formatCurrency(row.ssBenefit)})
      </div>
      <div>
        Effective rate:{' '}
        <strong style={{ color: '#818cf8' }}>{row.effectiveRatePercent}%</strong> on{' '}
        {formatCurrency(row.grossIncome)}
      </div>
      <div>
        Federal tax:{' '}
        <strong style={{ color: '#ea580c' }}>{formatCurrency(row.totalTax)}</strong>
        {row.year > startYear
          ? ` — ${formatCurrency(row.realTotalTax)} in ${startYear} dollars`
          : ''}
      </div>
      {row.rmd > 0 && (
        <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
          Includes a {formatCurrency(row.rmd)} required distribution, on top of{' '}
          {formatCurrency(row.otherIncome)} of other income
        </div>
      )}
      {row.muniInterest > 0 && (
        <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
          Plus {formatCurrency(row.muniInterest)} of tax-exempt interest, counted
          in the {formatCurrency(row.provisionalIncome)} of provisional income
        </div>
      )}
    </div>
  );
};

interface SequencingTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SequencingChartRow }>;
  comparison: SequencingComparison;
}

/**
 * Reads the year off the chart row and the detail off the comparison, rather
 * than widening every chart row with three more fields per strategy. The rows
 * exist to be plotted; the strategies already hold everything else.
 */
export const SequencingTooltip: React.FC<SequencingTooltipProps> = ({
  active,
  payload,
  comparison,
}) => {
  if (!active || !payload || !payload.length) return null;
  const { year } = payload[0].payload;
  const index = year - comparison.startYear;
  const first = comparison.strategies[0].rows[index];
  if (!first) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        {year} &middot; age {first.age}
      </div>
      {comparison.strategies.map((s) => {
        const row = s.rows[index];
        return (
          <div key={s.strategy.id}>
            {s.strategy.label}:{' '}
            <strong style={{ color: SEQUENCING_COLORS[s.strategy.chartKey] }}>
              {formatCurrency(row.cumulativeRealTax)}
            </strong>{' '}
            so far &middot; {formatCurrency(row.realTotalTax)} this year
            {/*
              Per order, not in the header: the required distribution is read
              off each order's own balance, and by the end of a long horizon
              bracket filling's can be a third smaller than the conventional
              order's. One figure at the top would be the wrong one twice.
            */}
            {row.rmd > 0 && ` \u00b7 ${formatCurrency(row.rmd)} required`}
            {row.shortfall > 0 && ' \u00b7 out of money'}
          </div>
        );
      })}
      <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.25rem' }}>
        Running federal tax, in {comparison.startYear} dollars
      </div>
    </div>
  );
};

interface BackPayTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BackPayCurvePoint }>;
  /** The year the award lands, so the earlier years can be named. */
  awardYear: number;
}

export const BackPayTooltip: React.FC<BackPayTooltipProps> = ({
  active,
  payload,
  awardYear,
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        {point.months} months of back pay &middot;{' '}
        {formatCurrency(point.lumpSum)}
        {point.yearsCovered > 0 &&
          ` · ${awardYear - point.yearsCovered}–${awardYear - 1}`}
      </div>
      <div>
        All taxed this year:{' '}
        <strong style={{ color: BACK_PAY_COLORS.without }}>
          {formatCurrency(point.taxWithout)}
        </strong>{' '}
        on {formatCurrency(point.taxableWithout)} of benefit
      </div>
      <div>
        With the election:{' '}
        <strong style={{ color: BACK_PAY_COLORS.with }}>
          {formatCurrency(point.taxWith)}
        </strong>{' '}
        on {formatCurrency(point.taxableWith)} of benefit
      </div>
      <div
        style={{
          marginTop: '0.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: '0.5rem',
          fontSize: '0.875rem',
          color: '#94a3b8',
        }}
      >
        {point.taxSaved > 0
          ? `The election saves ${formatCurrency(point.taxSaved)} here`
          : point.months === 0
            ? 'No back pay, so there is nothing to elect'
            : 'The election is worth nothing here — do not make it'}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [tab, setTab] = useState<TabId>('torpedo');
  const [year, setYear] = useState<TaxYear>(() => defaultTaxYear());
  const [ssBenefit, setSsBenefit] = useState<number>(() =>
    avgAnnualSSBenefit(defaultTaxYear()),
  );
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(DEFAULT_ORDINARY_INCOME);
  const [plannedLtcg, setPlannedLtcg] = useState<number>(0);
  const [ceilingId, setCeilingId] = useState<ConversionCeilingId>('bracket12');
  const [isSenior, setIsSenior] = useState<boolean>(false);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(false);
  const [muniInterest, setMuniInterest] = useState<number>(0);
  const [qcd, setQcd] = useState<number>(0);
  const [horizonYears, setHorizonYears] = useState<number>(20);
  const [colaAssumption, setColaAssumption] = useState<number>(2.5);
  const [birthYear, setBirthYear] = useState<number>(1955);
  const [traditionalBalance, setTraditionalBalance] = useState<number>(100_000);
  const [balanceGrowth, setBalanceGrowth] = useState<number>(5);
  const [spendingNeed, setSpendingNeed] = useState<number>(60_000);
  const [taxableBalance, setTaxableBalance] = useState<number>(300_000);
  const [taxableBasisPercent, setTaxableBasisPercent] = useState<number>(60);
  const [rothBalance, setRothBalance] = useState<number>(150_000);
  const [fillCeilingId, setFillCeilingId] = useState<ConversionCeilingId>('bracket12');
  const [backPayMonths, setBackPayMonths] = useState<number>(DEFAULT_BACK_PAY_MONTHS);
  const [backPayIncome, setBackPayIncome] = useState<number>(DEFAULT_BACK_PAY_INCOME);

  const statesTaxing = statesTaxingSocialSecurity(year);
  /**
   * The subset of those whose income test reads differently in the other year
   * the app can price. Three of the nine in 2025 — Minnesota re-indexes, Rhode
   * Island has not published the next set, West Virginia finishes phasing out —
   * and two of the eight in 2026, since West Virginia has left the table by
   * then. The table prints both years for these and the selected year alone for
   * the rest, so the count carries the point: most of them are frozen too.
   */
  const statesMoving = statesWithMovingTests(year);
  const statesFrozen = statesTaxing.length - statesMoving.length;
  const yearParams = taxYearParams(year);
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
   * The three inputs the page does not open with.
   *
   * Each starts at $0, and at $0 each one is a no-op: every chart on every tab
   * prices the identical scenario whether this section is open or shut. That
   * is the whole test for what belongs in here — year, filing status, age,
   * benefit and other income all change the picture the moment the page loads,
   * so they stay out. What it costs is that a slider you cannot see is a
   * slider you forget, which is why anything moved off $0 is named in the
   * summary line and stays named while the section is closed.
   */
  const advancedSet = [
    { label: 'Capital gains', value: plannedLtcg },
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

  const bracket12Top = yearFiling.brackets.find((b) => b.rate === 0.12)?.upTo ?? 0;
  const ltcg0Top = yearFiling.ltcgBrackets[0].upTo;

  /**
   * How much other income each year's *average* retired-worker benefit leaves
   * before any of that benefit becomes taxable: the 50% base, less the half of
   * the benefit that provisional income already counts. The base has not moved
   * since {@link SS_BASE50_ENACTED} and the benefit rises with every COLA, so
   * this shrinks year over year without anyone changing the law. Meaningless at
   * the $0 bases of a separate return, where it is never rendered.
   */
  const frozenBaseHeadroom = TAX_YEARS.map(
    (y) => `${formatCurrency(ssBase50 - 0.5 * avgAnnualSSBenefit(y))} in ${y}`,
  ).join(', ');

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

  // Two of the six ceilings are bracket tops and a third is the 0% capital-gain
  // band, so the whole list moves with the tax year.
  const ceilings = useMemo(
    () => conversionCeilings({ filingStatus, year }),
    [filingStatus, year],
  );

  const sizing = useMemo(() => {
    const ceiling = ceilings.find((c) => c.id === ceilingId) ?? ceilings[0];
    return sizeConversion(
      ceiling,
      {
        ordinaryIncome,
        ssBenefit,
        ltcg: plannedLtcg,
        filingStatus,
        seniors,
        muniInterest,
        qcd,
        year,
      },
      MAX_CONVERSION,
    );
  }, [
    ceilings,
    ceilingId,
    ordinaryIncome,
    ssBenefit,
    plannedLtcg,
    filingStatus,
    seniors,
    muniInterest,
    qcd,
    year,
  ]);

  const muniEffect = useMemo(
    () =>
      muniInterestEffect({
        muniInterest,
        ordinaryIncome,
        ssBenefit,
        ltcg: plannedLtcg,
        filingStatus,
        seniors,
        qcd,
        year,
      }),
    [muniInterest, ordinaryIncome, ssBenefit, plannedLtcg, filingStatus, seniors, qcd, year],
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

  const scenarioMagi = irmaaMagi({
    ordinaryIncome,
    ssBenefit,
    ltcg: plannedLtcg,
    filingStatus,
    muniInterest,
    qcd,
  });
  const irmaa = irmaaFor(scenarioMagi, { filingStatus, beneficiaries, year });

  /**
   * What the charitable route is worth against the same gift taken as an
   * ordinary distribution — priced on the same scenario every other section
   * above the projection reads.
   */
  const qcdSwing = useMemo(
    () =>
      qcdEffect({
        qcd,
        ordinaryIncome,
        ssBenefit,
        ltcg: plannedLtcg,
        filingStatus,
        seniors,
        beneficiaries,
        muniInterest,
        year,
      }),
    [
      qcd,
      ordinaryIncome,
      ssBenefit,
      plannedLtcg,
      filingStatus,
      seniors,
      beneficiaries,
      muniInterest,
      year,
    ],
  );

  /**
   * Everything coming off AGI at this income — the standard deduction, its
   * age-65 addition and whatever survives of the senior deduction's phaseout —
   * measured without the gift, which is the case that has to be covered for the
   * charitable route to make no difference.
   */
  const deductionTotal = deductionFor(
    { filingStatus, seniors, year },
    qcdSwing.agiWithout,
  );

  /**
   * Which of section 86's two ceilings is holding taxable benefits flat across
   * the gift, on the branch where they do not move at all.
   *
   * Both tiers have one — half the benefit in the first, 85% of it in the
   * second — and only the second is what anyone means by "the 85% cap". They
   * are told apart by where the flat line sits, because flat is the only
   * symptom either one shows. The first tier's cap binds whenever the benefit
   * is small enough that half of it fits under the tier's own width: $9,000 on
   * a single or head-of-household return, $12,000 on a joint one.
   */
  const ssCapPercent =
    qcdSwing.taxableSSWith >= Math.round(0.85 * ssBenefit) ? 85 : 50;

  /**
   * The year of receipt, exactly as the rest of the page has it. The benefit
   * here is the *ongoing* annual one — the months attributable to this year —
   * and the award is stacked on top of it inside `lumpSumElection`.
   */
  const awardScenario = useMemo(
    () => ({
      ordinaryIncome,
      ssBenefit,
      ltcg: plannedLtcg,
      filingStatus,
      seniors,
      muniInterest,
      qcd,
      year,
    }),
    [ordinaryIncome, ssBenefit, plannedLtcg, filingStatus, seniors, muniInterest, qcd, year],
  );

  /**
   * The earlier years, as they were. The monthly rate is this year's benefit
   * divided by twelve — see `splitBackPay` on why a flat rate rather than one
   * COLA per year — and the filing status and tax-exempt interest are carried
   * back unchanged, which is the assumption the note under the chart states.
   */
  const backPayPlan = useMemo(
    () => ({
      awardYear: year,
      monthlyBenefit: ssBenefit / 12,
      otherIncome: backPayIncome,
      muniInterest,
      filingStatus,
    }),
    [year, ssBenefit, backPayIncome, muniInterest, filingStatus],
  );

  const backPay: LumpSumElection = useMemo(
    () =>
      lumpSumElection(
        awardScenario,
        splitBackPay({ ...backPayPlan, months: backPayMonths }),
      ),
    [awardScenario, backPayPlan, backPayMonths],
  );

  const backPayChart = useMemo(
    () =>
      backPayCurve(awardScenario, backPayPlan, {
        maxMonths: MAX_BACK_PAY_MONTHS,
        step: 1,
      }),
    [awardScenario, backPayPlan],
  );

  /**
   * Everything the projection needs, and nothing it does not: the planned
   * capital gains are left out, because a one-off realisation repeated for
   * thirty years is not a projection of anything.
   */
  const projection = useMemo(
    () =>
      projectYears(
        { ordinaryIncome, ssBenefit, muniInterest, filingStatus, seniors, year },
        {
          startYear: year,
          years: horizonYears,
          colaPercent: colaAssumption,
          birthYear,
          traditionalBalance,
          balanceGrowthPercent: balanceGrowth,
        },
      ),
    [
      ordinaryIncome,
      ssBenefit,
      muniInterest,
      filingStatus,
      seniors,
      year,
      horizonYears,
      colaAssumption,
      birthYear,
      traditionalBalance,
      balanceGrowth,
    ],
  );

  /**
   * The same retirement the projection above describes, funded three ways.
   *
   * It shares that section's horizon, COLA, birth year, IRA balance and growth
   * rate deliberately — two sections disagreeing about when the filer turns 73
   * would be worse than either of them being wrong on its own. The planned
   * capital gains stay out for the same reason they stay out of the projection.
   */
  const sequencing = useMemo(
    () =>
      compareSequencing(
        { ordinaryIncome, ssBenefit, muniInterest, filingStatus, seniors, year },
        {
          startYear: year,
          years: horizonYears,
          colaPercent: colaAssumption,
          birthYear,
          spending: spendingNeed,
          taxableBalance,
          taxableBasisFraction: taxableBasisPercent / 100,
          traditionalBalance,
          rothBalance,
          growthPercent: balanceGrowth,
          fillCeilingId,
        },
      ),
    [
      ordinaryIncome,
      ssBenefit,
      muniInterest,
      filingStatus,
      seniors,
      year,
      horizonYears,
      colaAssumption,
      birthYear,
      spendingNeed,
      taxableBalance,
      taxableBasisPercent,
      traditionalBalance,
      rothBalance,
      balanceGrowth,
      fillCeilingId,
    ],
  );

  const sequencingRows = useMemo(() => sequencingChartRows(sequencing), [sequencing]);

  /** Only the ceilings the projection can index honestly — see the module. */
  const fillCeilings = ceilings.filter((c) => SEQUENCING_FILL_CEILING_IDS.includes(c.id));

  /**
   * By id, not by position: the order the table renders in is presentation, and
   * the prose below compares two specific orders rather than two specific rows.
   */
  const seqStrategy = (id: SequencingStrategyId) =>
    sequencing.strategies.find((s) => s.strategy.id === id) ?? sequencing.strategies[0];
  const seqConventional = seqStrategy('taxable-first');
  const seqBracketFill = seqStrategy('bracket-fill');

  /**
   * Zero when no order withdrew anything it was not required to — the benefit
   * and the other income covered every year on their own. The three scores then
   * tie because there was nothing to sequence, which is a different statement
   * from the orders being close, and the prose below has to make it.
   */
  const seqVoluntary = sequencing.strategies.reduce((t, s) => t + s.voluntaryWithdrawal, 0);
  /** Fewer than two and there is no order to choose, only one account to spend. */
  const seqFundedAccounts = [taxableBalance, traditionalBalance, rothBalance].filter(
    (b) => b > 0,
  ).length;

  const applicableAge = rmdApplicableAge(birthYear);
  const firstRmdRow = projection.rows.find((r) => r.rmd > 0) ?? null;
  const ageAtStart = year - birthYear;

  const measureLabel = CONVERSION_MEASURE_LABELS[sizing.ceiling.measure];

  /**
   * Roving tabindex: only the selected tab is in the tab order, and the arrow
   * keys move between them, per the ARIA tabs pattern. Selection follows focus,
   * which is the right call here — every panel is already mounted-on-demand and
   * cheap to swap, so there is nothing to defer with a manual-activation dance.
   */
  const tablistRef = useRef<HTMLDivElement>(null);
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const current = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(current + delta + TABS.length) % TABS.length];
    setTab(next.id);
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)
      ?.focus();
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

      {/* ───── Your scenario (shared by every tab) ───── */}
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
        <p className="field-note">
          {yearParams.source}. Standard deduction{' '}
          <strong>{formatCurrency(yearFiling.standardDeduction)}</strong>, 12%
          bracket to {formatCurrency(bracket12Top)}, 0% capital-gain band to{' '}
          {formatCurrency(ltcg0Top)}, average retired-worker benefit{' '}
          {formatCurrency(avgAnnualSSBenefit(year))} after the{' '}
          {yearParams.colaPercent}% COLA.
        </p>
        <p className="field-note">
          <strong>The Social Security thresholds are not on that list.</strong>{' '}
          Every other figure here — brackets, standard deduction, capital-gain
          bands, the benefit itself — is adjusted for inflation every year. The
          provisional-income thresholds in IRC 86(c) never have been.
        </p>
        {ssBase50 > 0 ? (
          <p className="field-note">
            Congress set {formatCurrency(ssBase50)} in {SS_BASE50_ENACTED} and{' '}
            {formatCurrency(ssBase85)} in {SS_BASE85_ENACTED} and has not
            touched either since. Half the benefit counts toward provisional
            income, so every COLA eats into that {formatCurrency(ssBase50)} base
            from the inside: at each year&apos;s average retired-worker benefit,
            the other income you can have before <em>any</em> benefit is taxable
            comes to <strong>{frozenBaseHeadroom}</strong>. Same real income,
            more tax, every year — and the share of beneficiaries owing tax on
            benefits ratchets up without Congress ever voting on it.
          </p>
        ) : (
          <p className="field-note">
            On a separate return that lived with the spouse, 86(c)(1)(C) sets
            both thresholds to {formatCurrency(0)} outright rather than freezing
            them somewhere. There is no headroom for a COLA to erode: the
            benefit is in the tax base from the first dollar, in every year on
            offer.
          </p>
        )}
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
        <div className="checkbox-group">
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={isSenior}
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
                onChange={(e) => setSpouseIsSenior(e.target.checked)}
              />
              <span>Both spouses are 65 or older</span>
            </label>
          )}
        </div>
        <p className="field-note">
          Standard deduction <strong>{formatCurrency(standardDeduction)}</strong>
          {seniorAddition > 0
            ? ` — ${formatCurrency(baseDeduction)} base plus ${formatCurrency(seniorAddition)} for age 65 or older.`
            : `. Turning 65 adds ${formatCurrency(yearFiling.additionalStdDeduction65)}${
                filingStatus === 'mfj' ? ' per qualifying spouse' : ''
              }.`}{' '}
          The addition widens the 0%-rate valley to the left of the torpedo:
          taxable income stays at zero for that much longer, so the whole curve
          shifts right.
        </p>
        <p className="field-note">
          {phaseoutStart === null || phaseoutEnd === null ? (
            <>
              No senior deduction on a separate return: section 151(d)(5)(C)(v)
              allows the temporary {formatCurrency(SENIOR_DEDUCTION)} only if a
              married taxpayer files jointly. There is no halved amount and no
              halved threshold — separate filers get nothing.
            </>
          ) : seniors > 0 ? (
            <>
              Senior deduction{' '}
              <strong>{formatCurrency(seniorDeductionMax)}</strong>
              {seniors > 1
                ? ` (${formatCurrency(SENIOR_DEDUCTION)} per spouse)`
                : ''}{' '}
              on top of that, shrinking by {formatCents(phaseoutRate)} per dollar
              of MAGI above {formatCurrency(phaseoutStart)}
              {seniors > 1
                ? ` (${formatCents(SENIOR_DEDUCTION_PHASEOUT_RATE)} for each spouse)`
                : ''}{' '}
              and gone at {formatCurrency(phaseoutEnd)}. It expires after tax
              year {SENIOR_DEDUCTION_LAST_YEAR}.
            </>
          ) : (
            <>
              Filers 65 or older also get the temporary senior deduction —{' '}
              {formatCurrency(SENIOR_DEDUCTION)} each, for tax years{' '}
              {SENIOR_DEDUCTION_FIRST_YEAR}&ndash;{SENIOR_DEDUCTION_LAST_YEAR}{' '}
              only.
            </>
          )}
        </p>
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

      <div className="input-group">
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
            <span className="advanced-state">All three at $0</span>
          )}
        </summary>
        <p className="field-note">
          Capital gains you plan to realize, tax-exempt interest, and money
          given to charity straight out of an IRA. All three sit at $0 until you
          move them, and at $0 none of them changes a single figure on any tab —
          so the page opens on the plain picture, benefit plus other income, and
          you add the rest only if it is yours. Whatever you set here stays set
          across every tab and is named on the line above even when this section
          is shut.
        </p>
        <div className="input-group">
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
        </div>

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
            other income set above rather than on top of it, because the
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

      <div
        className="tabs"
        role="tablist"
        aria-label="Sections"
        ref={tablistRef}
        onKeyDown={onTabKeyDown}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            className={tab === id ? 'tab tab-active' : 'tab'}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'torpedo' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-torpedo"
          aria-labelledby="tab-torpedo"
        >
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

          {/* ───── Tax-exempt interest ───── */}
          <section className="explainer" aria-labelledby="muni-interest-heading">
            <h2 id="muni-interest-heading" className="section-heading-violet">
              What the tax-exempt interest costs
            </h2>
            <p>
              Priced at {formatCurrency(ordinaryIncome)} of other ordinary income
              {plannedLtcg > 0
                ? ` and ${formatCurrency(plannedLtcg)} of long-term gains`
                : ''}{' '}
              (the sliders above) plus the{' '}
              {formatCurrency(ssBenefit)} benefit above.
            </p>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Benefits it pulls into taxable income</dt>
                <dd className="stat-value violet">
                  {formatCurrency(muniEffect.taxableSSDelta)}
                </dd>
                <dd className="stat-note">
                  {formatCurrency(muniEffect.taxableSSWith)} taxable, up from{' '}
                  {formatCurrency(muniEffect.taxableSSWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Extra federal tax</dt>
                <dd className="stat-value">{formatCurrency(muniEffect.taxCost)}</dd>
                <dd className="stat-note">
                  {formatCurrency(muniEffect.taxWith)} total, up from{' '}
                  {formatCurrency(muniEffect.taxWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Cost per muni dollar</dt>
                <dd className="stat-value">{muniEffect.costPerDollar}%</dd>
              </div>
              <div className="stat">
                <dt>Tax on the next muni dollar</dt>
                <dd className="stat-value">{muniEffect.ratePerNextDollar}%</dd>
              </div>
            </dl>

            {muniInterest === 0 ? (
              <p>
                Open <strong>Advanced inputs</strong> above and move the
                tax-exempt interest slider to price it. Municipal interest cannot
                land in taxable income itself, so the only line it can move is
                Social Security — which is exactly why the cost is so easy to
                miss.
              </p>
            ) : muniEffect.taxCost === 0 ? (
              <p>
                Here the {formatCurrency(muniInterest)} really is free.{' '}
                {muniEffect.taxableSSDelta === 0
                  ? 'Provisional income stays clear of the thresholds — either below the first one, or far enough past the 85% cap that there are no benefits left to drag in.'
                  : 'It does pull benefits into taxable income, but deductions still absorb them before any bracket applies.'}
              </p>
            ) : (
              <p>
                That {formatCurrency(muniInterest)} of &ldquo;tax-free&rdquo;
                interest drags{' '}
                <strong>{formatCurrency(muniEffect.taxableSSDelta)}</strong> of
                Social Security benefits into taxable income and costs{' '}
                <strong>{formatCurrency(muniEffect.taxCost)}</strong> in federal tax
                — <strong>{muniEffect.costPerDollar}&cent;</strong> per dollar of
                interest, with the next dollar taxed at{' '}
                <strong>{muniEffect.ratePerNextDollar}%</strong>. None of that
                appears next to the bonds on the return; it shows up on line 6b,
                attached to benefits.
              </p>
            )}

            <p>
              Flipping that slider on and off is the cleanest way to see the torpedo
              in isolation: nothing about the ordinary tax base changes, so every
              dollar of tax it adds is the Social Security inclusion rules and
              nothing else. It also cuts the other way — a retiree sitting inside the
              torpedo can be better off in taxable bonds at a higher stated yield,
              and swapping munis for Roth withdrawals or return-of-basis removes the
              provisional income entirely. Note that tax-exempt interest is also
              added back for Medicare&apos;s IRMAA MAGI, but <em>not</em> for the
              senior deduction&apos;s.
            </p>
          </section>

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
        </div>
      )}

      {tab === 'gains' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-gains"
          aria-labelledby="tab-gains"
        >
          {/* ───── Capital Gains Stacking ───── */}
          <section className="explainer" aria-labelledby="ltcg-stacking-heading">
            <h2 id="ltcg-stacking-heading" className="section-heading-amber">
              Capital Gains Stacking
            </h2>
            <p>
              Long-term capital gains (LTCG) count fully toward{' '}
              <strong>provisional income</strong> for Social Security taxability,
              yet they are taxed in their own preferential bracket (0%/15%/20%).
              When ordinary income pushes Social Security benefits into the
              taxable base, LTCG can simultaneously shove gains out of the
              0% bracket into 15%&nbsp;— stacking two effects at once.
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
          </section>
        </div>
      )}

      {tab === 'medicare' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-medicare"
          aria-labelledby="tab-medicare"
        >
          {/* ───── IRMAA cliffs ───── */}
          <section className="explainer" aria-labelledby="irmaa-heading">
            <h2 id="irmaa-heading" className="section-heading-rose">
              Medicare&apos;s IRMAA cliffs
            </h2>
            <p>
              Above a MAGI threshold, Medicare adds an{' '}
              <strong>income-related monthly adjustment amount</strong> to the Part B
              and Part D premiums of everyone on the return who is enrolled. Unlike
              the torpedo, this is not a phase-in: one dollar over a threshold
              triggers the whole surcharge for twelve months. The first cliff costs{' '}
              <strong>{formatCurrency(cliffs[0].step)}</strong> a year
              {beneficiaries > 1 ? ' for the two of you' : ''} — on a single dollar
              of income.
              {cliffs[0].tier > 1
                ? ` A separate return has no access to tiers 1 through 3: 42 U.S.C. 1395r(i)(3)(C) gives it a two-step schedule of its own, so its first cliff is tier ${cliffs[0].tier} and the whole surcharge lands at once.`
                : ''}
            </p>

            <p>
              {cliffsOnChart.length > 0 ? (
                <>
                  The dashed lines on the Tax Torpedo chart mark{' '}
                  {cliffsOnChart.length === 1
                    ? 'cliff '
                    : 'cliffs '}
                  {cliffsOnChart.map((c) => c.tier).join(', ')} at{' '}
                  {cliffsOnChart
                    .map((c) => formatCurrency(Math.round(c.otherIncome)))
                    .join(', ')}{' '}
                  of other income. They sit at less other income than their MAGI
                  figures suggest, because the benefits the torpedo drags into AGI
                  get there first
                  {muniInterest > 0
                    ? `, and the ${formatCurrency(muniInterest)} of tax-exempt interest is added straight back in on top`
                    : ''}
                  .
                </>
              ) : (
                <>
                  No cliff falls inside the Tax Torpedo chart: the first one
              needs{' '}
                  {formatCurrency(cliffs[0].magi)} of MAGI, which is past its right
                  edge at the benefit and filing status selected.
                </>
              )}
            </p>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Medicare MAGI</dt>
                <dd className="stat-value rose">{formatCurrency(scenarioMagi)}</dd>
                <dd className="stat-note">
                  AGI + {formatCurrency(muniInterest)} tax-exempt interest
                </dd>
              </div>
              <div className="stat">
                <dt>Surcharge tier</dt>
                <dd className="stat-value">
                  {irmaa.tier === 0 ? 'None' : `${irmaa.tier} of 5`}
                </dd>
              </div>
              <div className="stat">
                <dt>Surcharge per year</dt>
                <dd className="stat-value">{formatCurrency(irmaa.annualSurcharge)}</dd>
                <dd className="stat-note">
                  {irmaa.tier === 0
                    ? `standard ${formatCurrencyCents(partBStandardPremium(year))} Part B premium only`
                    : `${formatCurrencyCents(irmaa.partBSurchargeMonthly)} Part B + ${formatCurrencyCents(
                        irmaa.partDSurchargeMonthly,
                      )} Part D per month${beneficiaries > 1 ? ', each' : ''}`}
                </dd>
              </div>
              <div className="stat">
                <dt>Room to the next cliff</dt>
                <dd className="stat-value">
                  {irmaa.headroom === null
                    ? 'Top tier'
                    : formatCurrency(irmaa.headroom)}
                </dd>
                <dd className="stat-note">of MAGI</dd>
              </div>
              <div className="stat">
                <dt>Cost of crossing it</dt>
                <dd className="stat-value">
                  {irmaa.nextStep === 0 ? '—' : `${formatCurrency(irmaa.nextStep)}/yr`}
                </dd>
              </div>
            </dl>

            <p>
              Priced at {formatCurrency(ordinaryIncome)} of other ordinary income
              {plannedLtcg > 0
                ? ` and ${formatCurrency(plannedLtcg)} of long-term gains`
                : ''}{' '}
              plus the {formatCurrency(ssBenefit)} benefit above, for{' '}
              {beneficiaries > 1 ? 'two people' : 'one person'} on Medicare.{' '}
              {irmaa.tier === 0
                ? `Nothing is owed at this income, but the last ${formatCurrency(
                    irmaa.nextStep,
                  )} of the surcharge arrives all at once.`
                : `That surcharge is on top of the standard ${formatCurrencyCents(
                    partBStandardPremium(year),
                  )} Part B premium, and it is not included in any of the federal tax figures elsewhere on this page.`}
            </p>

            <table className="tier-table">
              <caption>
                {year} premiums, set by {irmaaMagiYear(year)} MAGI. Per person
                enrolled; the annual column is for{' '}
                {beneficiaries > 1 ? 'both of you' : 'one enrollee'}. Medicare
                publishes three tables, not four: 42 U.S.C. 1395r(i)(3)(C) carves
                out joint and separate returns and puts everyone else — single and
                head of household alike — in the first column.
              </caption>
              <thead>
                <tr>
                  <th scope="col">MAGI (individual)</th>
                  <th scope="col">MAGI (joint)</th>
                  <th scope="col">MAGI (separate)</th>
                  <th scope="col">Part B/mo</th>
                  <th scope="col">Part D/mo</th>
                  <th scope="col">Surcharge/yr</th>
                </tr>
              </thead>
              <tbody>
                {allIrmaaTiers(year).map((tier) => {
                  const annual =
                    (tier.partBSurchargeMonthly + tier.partDSurchargeMonthly) *
                    12 *
                    beneficiaries;
                  const range = (status: FilingStatus): string => {
                    // Tier 0 runs up to whichever tier the status actually reaches
                    // first, which is the fourth one on a separate return.
                    if (tier.tier === 0)
                      return `Up to ${formatCurrency(
                        irmaaFirstCliffMagi({ year, filingStatus: status }),
                      )}`;
                    const floor = tier.magiOver[status];
                    // Infinity marks a tier this status has no access to at all.
                    if (!Number.isFinite(floor)) return '\u2014';
                    // The top tier is the one inclusive threshold in the
                    // statute — "at least", not "more than" — for every status.
                    const preposition = tier.inclusiveFor?.includes(status)
                      ? 'From'
                      : 'Over';
                    return `${preposition} ${formatCurrency(floor)}`;
                  };
                  return (
                    <tr
                      key={tier.tier}
                      className={tier.tier === irmaa.tier ? 'tier-row-current' : undefined}
                    >
                      <th scope="row">{range('single')}</th>
                      <td>{range('mfj')}</td>
                      <td>{range('mfs')}</td>
                      <td>{formatCurrencyCents(tier.partBMonthly)}</td>
                      <td>
                        {tier.partDSurchargeMonthly === 0
                          ? '—'
                          : `+${formatCurrencyCents(tier.partDSurchargeMonthly)}`}
                      </td>
                      <td>{annual === 0 ? '—' : formatCurrency(annual)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p>
              <strong>The x-axis caveat.</strong> Medicare bills on a{' '}
              {IRMAA_LOOKBACK_YEARS}-year lag: the {year} premiums in the table are
              set by {irmaaMagiYear(year)} MAGI, so the {year} income on this chart
              is really setting the premium for {year + IRMAA_LOOKBACK_YEARS}, under
              a schedule CMS has not published yet. Treat the lines as where the
              cliffs would fall at {year} thresholds, not as a bill. The lag cuts both ways: a Roth
              conversion made now surfaces as a premium two years later, and a
              one-off spike — a home sale, an inherited IRA — keeps costing after the
              income is gone. Retiring or losing that income is a life-changing event
              you can appeal on Form SSA-44 rather than simply wait out.
            </p>

            <p>
              Note that Medicare&apos;s MAGI is <em>wider</em> than the tax
              code&apos;s: tax-exempt interest is added straight back in, so muni
              bonds move this line as well as the torpedo. It is also the reason the
              cliffs are worth planning around at all — the surcharge never appears
              on a tax return, so nothing about filing reveals that a dollar of
              income cost {formatCurrency(cliffs[0].step)}.
            </p>
          </section>
        </div>
      )}

      {tab === 'strategies' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-strategies"
          aria-labelledby="tab-strategies"
        >
          {/* ───── Roth Conversion Sizing ───── */}
          <section className="explainer" aria-labelledby="roth-sizing-heading">
            <h2 id="roth-sizing-heading" className="section-heading-emerald">
              Roth conversion sizing
            </h2>
            <p>
              A Roth conversion is ordinary income in the year you make it, so it
              moves every line the torpedo depends on at once. Pick the ceiling you
              want to stay under and this sizes the largest conversion that still
              fits beneath it, using the ordinary income, planned capital gains
              and Social Security benefit set above.
            </p>

            <div className="input-group">
              <label htmlFor="conversion-ceiling">Convert up to</label>
              <select
                id="conversion-ceiling"
                className="ceiling-select"
                value={ceilingId}
                onChange={(e) => setCeilingId(e.target.value as ConversionCeilingId)}
              >
                {ceilings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {formatCurrency(c.amount)} of{' '}
                    {CONVERSION_MEASURE_LABELS[c.measure]}
                  </option>
                ))}
              </select>
            </div>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Largest conversion</dt>
                <dd className="stat-value emerald">{formatCurrency(sizing.conversion)}</dd>
              </div>
              <div className="stat">
                <dt>Federal tax after</dt>
                <dd className="stat-value">{formatCurrency(sizing.taxAfter)}</dd>
                <dd className="stat-note">was {formatCurrency(sizing.taxBefore)}</dd>
              </div>
              <div className="stat">
                <dt>Extra tax</dt>
                <dd className="stat-value">{formatCurrency(sizing.taxCost)}</dd>
              </div>
              <div className="stat">
                <dt>Cost per dollar converted</dt>
                <dd className="stat-value">{sizing.costPerDollar}%</dd>
              </div>
              <div className="stat">
                <dt>Rate past the ceiling</dt>
                <dd className="stat-value">{sizing.rateAboveCeiling}%</dd>
              </div>
            </dl>

            {sizing.alreadyOver ? (
              <p>
                Your {measureLabel} is already{' '}
                {formatCurrency(Math.abs(sizing.headroom))} above this ceiling, so no
                conversion fits under it. Either pick a higher ceiling, or note that
                the next dollar you convert is taxed at{' '}
                <strong>{sizing.rateAboveCeiling}%</strong>.
              </p>
            ) : sizing.unbounded ? (
              <p>
                Nothing up to {formatCurrency(MAX_CONVERSION)} reaches this ceiling
                from where you are, so it is not the binding constraint — pick a
                lower one.
              </p>
            ) : (
              <p>
                You start with <strong>{formatCurrency(sizing.headroom)}</strong> of
                room under this ceiling, but only{' '}
                <strong>{formatCurrency(sizing.conversion)}</strong> of conversion
                fits{sizing.headroom - sizing.conversion > 1
                  ? ' — each converted dollar also drags Social Security benefits into taxable income, so the ceiling arrives before the headroom is spent'
                  : ''}
                . Converting that much costs{' '}
                <strong>{formatCurrency(sizing.taxCost)}</strong> in federal tax, or{' '}
                <strong>{sizing.costPerDollar}&cent;</strong> per dollar converted.
              </p>
            )}

            <p>{sizing.ceiling.note}</p>
          </section>

          {/* ───── Qualified charitable distributions ───── */}
          <section className="explainer" aria-labelledby="qcd-heading">
            <h2 id="qcd-heading" className="section-heading-lime">
              Giving straight from the IRA
            </h2>
            <p>
              A qualified charitable distribution under IRC 408(d)(8) is IRA money
              paid directly to the charity. It is excluded from gross income
              outright, so it never reaches AGI — and because provisional income is
              built out of AGI, it never reaches that either. A charitable{' '}
              <em>deduction</em> for the same gift does neither: deductions come off
              after AGI is fixed, so they cannot untax a single dollar of Social
              Security. For the roughly nine in ten filers who take the standard
              deduction, a cash gift is worth nothing at all on the return.
            </p>
            <p>
              Priced at {formatCurrency(ordinaryIncome)} of other ordinary income
              {plannedLtcg > 0
                ? ` and ${formatCurrency(plannedLtcg)} of long-term gains`
                : ''}{' '}
              (the sliders above) plus the {formatCurrency(ssBenefit)}{' '}
              benefit above, against the same gift taken as an ordinary
              distribution.
            </p>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Benefits it takes back out of the tax base</dt>
                <dd className="stat-value lime">
                  {formatCurrency(qcdSwing.taxableSSRemoved)}
                </dd>
                <dd className="stat-note">
                  {formatCurrency(qcdSwing.taxableSSWith)} taxable, down from{' '}
                  {formatCurrency(qcdSwing.taxableSSWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Federal tax saved</dt>
                <dd className="stat-value">{formatCurrency(qcdSwing.taxSaved)}</dd>
                <dd className="stat-note">
                  {formatCurrency(qcdSwing.taxWith)} total, down from{' '}
                  {formatCurrency(qcdSwing.taxWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Saved per dollar given</dt>
                <dd className="stat-value">{qcdSwing.savedPerDollar}%</dd>
                <dd className="stat-note">
                  next dollar {qcdSwing.ratePerNextDollar}%
                </dd>
              </div>
              <div className="stat">
                <dt>Medicare surcharge saved</dt>
                <dd className="stat-value rose">
                  {formatCurrencyCents(qcdSwing.irmaaSurchargeSaved)}
                </dd>
                <dd className="stat-note">
                  {qcdSwing.irmaaTierWithout === qcdSwing.irmaaTierWith
                    ? qcdSwing.irmaaTierWith === 0
                      ? `no surcharge either way at ${formatCurrency(qcdSwing.irmaaMagiWith)} of MAGI`
                      : `tier ${qcdSwing.irmaaTierWith} either way`
                    : `tier ${qcdSwing.irmaaTierWith}, down from tier ${qcdSwing.irmaaTierWithout}`}
                  , priced on the {year} schedule
                </dd>
              </div>
            </dl>

            {qcd === 0 ? (
              qcdSwing.ordinaryIncomeBefore === 0 ? (
                <p>
                  There is nothing here to give. A QCD is an exclusion of an IRA
                  distribution rather than a deduction, so there has to be a
                  distribution to exclude, and this scenario carries no ordinary
                  income at all. Raise the other-income slider above — the
                  app reads the whole of it as IRA money — and this section will
                  price the gift against taking the same money as a distribution.
                </p>
              ) : (
                <p>
                  Open <strong>Advanced inputs</strong> above and move the
                  charitable slider to price it. At this income the next dollar
                  given from the IRA rather than the checking account is worth{' '}
                  <strong>{qcdSwing.ratePerNextDollar}%</strong> in federal tax —
                  and that is before anything Medicare does with it two years later.
                </p>
              )
            ) : qcdSwing.excluded === 0 ? (
              <p>
                None of this gift can be excluded. A QCD takes an IRA distribution
                out of gross income, so there has to be a distribution to take it
                out of, and this scenario carries{' '}
                {formatCurrency(qcdSwing.ordinaryIncomeBefore)} of ordinary income.
                {qcdSwing.taxWithout > 0
                  ? ` The ${formatCurrency(qcdSwing.taxWithout)} of federal tax here is on the ${formatCurrency(qcdSwing.agiWithout)} of long-term gains and taxable benefit left in the base, and the charitable route reaches neither.`
                  : ''}
              </p>
            ) : qcdSwing.taxSaved === 0 && qcdSwing.irmaaSurchargeSaved === 0 ? (
              <p>
                Here the route makes no difference.{' '}
                {qcdSwing.taxWithout > 0
                  ? 'The excluded dollars were not carrying any federal tax, and Medicare charges the same surcharge either way.'
                  : qcdSwing.agiWithout <= deductionTotal
                    ? `There was no federal tax to save: the ${formatCurrency(deductionTotal)} of deductions covered the whole ${formatCurrency(qcdSwing.agiWithout)} of AGI, with or without the gift.`
                    : `There was no federal tax to save: past the ${formatCurrency(deductionTotal)} of deductions everything left in the base is long-term gain sitting in the 0% bracket, with or without the gift.`}{' '}
                The gift is still worth making from the IRA rather than from cash —
                it counts toward any required distribution and shrinks the balance
                every later one is measured against — but this year the tax bill is
                the same either way.
              </p>
            ) : (
              <p>
                {formatCurrency(qcdSwing.excluded)} sent straight to the charity
                keeps AGI at <strong>{formatCurrency(qcdSwing.agiWith)}</strong>{' '}
                instead of {formatCurrency(qcdSwing.agiWithout)}
                {qcdSwing.taxableSSRemoved > 0 ? (
                  <>
                    , which takes{' '}
                    <strong>{formatCurrency(qcdSwing.taxableSSRemoved)}</strong> of
                    Social Security back out of the tax base along with it
                  </>
                ) : ssBenefit === 0 ? (
                  <>
                    . No benefits move, because there is no benefit on this
                    scenario to move — the exclusion is worth its bracket rate and
                    no more
                  </>
                ) : qcdSwing.taxableSSWithout === 0 ? (
                  <>
                    . No benefits move, because none of them were taxable to begin
                    with — provisional income stays under{' '}
                    {formatCurrency(ssBase50)} either way
                  </>
                ) : (
                  <>
                    . No benefits move: the {ssCapPercent}% cap still binds after
                    the gift, so the same{' '}
                    {formatCurrency(qcdSwing.taxableSSWith)} —{' '}
                    {ssCapPercent === 85
                      ? 'the most of a benefit that can ever be taxed'
                      : 'half the benefit, which is everything the first tier can reach'}{' '}
                    — is taxable either way, and the exclusion is worth its bracket
                    rate and no more
                  </>
                )}
                . That is{' '}
                <strong>{formatCurrency(qcdSwing.taxSaved)}</strong> of federal tax,{' '}
                <strong>{qcdSwing.savedPerDollar}&cent;</strong> per dollar given
                {qcdSwing.irmaaSurchargeSaved > 0 ? (
                  <>
                    , plus{' '}
                    <strong>
                      {formatCurrencyCents(qcdSwing.irmaaSurchargeSaved)}
                    </strong>{' '}
                    a year of Medicare surcharge that never shows up on a tax return
                    at all — this MAGI sets the premium for{' '}
                    {year + IRMAA_LOOKBACK_YEARS}, priced here on the {year}{' '}
                    schedule because CMS has not published that one yet
                  </>
                ) : (
                  ''
                )}
                .
              </p>
            )}

            {qcdSwing.limitedByIncome && (
              <p className="warning-note" role="note">
                <strong>More gift than distribution.</strong>{' '}
                {qcdSwing.excluded > 0
                  ? `There is only ${formatCurrency(qcdSwing.ordinaryIncomeBefore)} of ordinary income on this scenario to exclude, so that is all the chart can take out`
                  : 'There is no ordinary income on this scenario to exclude the gift from, so the chart can take out none of it'}{' '}
                — a QCD is an exclusion of a distribution, not a deduction that can
                run past the income it offsets. The slider models the whole of the
                other-income figure as IRA money, which is the loosest bound
                available: the app cannot tell a distribution from a pension.
              </p>
            )}

            <p className="field-note">
              <strong>
                You must have reached {formatHalfAge(QCD_MIN_AGE)} to do this
              </strong>
              , to the day — not to the tax year, and not the required-beginning
              age. SECURE raised the age for required distributions to 72 and SECURE
              2.0 to 73 and then 75, but 408(d)(8)(B)(ii) still says{' '}
              {formatHalfAge(QCD_MIN_AGE)} and neither act touched it. That gap is
              the cheapest QCD there is: giving from the IRA before anything is
              required to come out of it shrinks the balance every later
              distribution is measured against, with no distribution to displace.
            </p>

            <p>
              Once distributions <em>are</em> required, a QCD counts toward the
              year&apos;s required amount — so the same dollars satisfy the RMD and
              skip the tax base, which is the one move that defuses the torpedo
              rather than dodging it. Two caveats worth knowing: the money has to go
              from the custodian to a qualifying public charity directly, never
              through the account owner, and donor-advised funds and private
              foundations do not qualify. A one-time election can send up to{' '}
              {formatCurrency(qcdSplitInterestLimit(year))} to a split-interest
              entity instead, counted against the same annual limit rather than on
              top of it.
            </p>

            <p className="field-note">
              The multi-year projection and the withdrawal-order comparison under
          Over Time
              both leave the gift out. Their ordinary income is inflation-indexed
              and RMD-driven year by year, and a recurring QCD interacts with the
              balance those sections track; carrying one number through without
              modelling that would make two sections disagree about the same
              retirement.
            </p>
          </section>

          {/* ───── Retroactive awards and the lump-sum election ───── */}
          <section className="explainer" aria-labelledby="lump-sum-heading">
            <h2 id="lump-sum-heading" className="section-heading-fuchsia">
              When years of benefit arrive in one cheque
            </h2>
            <p>
              A claim that took three years to win is paid in a single cheque, and
              IRC 86(a) taxes every dollar of it in the year it was received. It
              knows nothing about the years it was earned in. So one year&apos;s set
              of thresholds has to absorb several years of benefit at once
              {ssBase85 > 0 ? (
                <>
                  , the whole award lands above the{' '}
                  {formatCurrency(ssBase85)} adjusted base, and 85 cents of every
                  dollar of it is taxable — at rates set by the size of the pile,
                  not by the years it accrued over
                </>
              ) : (
                <>
                  {' '}
                  — which on this separate return is already the worst case, since
                  both bases are $0 and 85% of everything is taxable from the first
                  dollar either way
                </>
              )}
              .
            </p>
            <p>
              <strong>IRC 86(e) lets you refuse that.</strong> Elect it and the
              award&apos;s taxable share is refigured year by year, each earlier year
              against <em>its own</em> income and its own set of thresholds, and the
              increases are added up. The earlier years&apos; returns are not
              reopened and nothing is amended — the total is still reported and taxed
              this year, at this year&apos;s rates. Only the amount changes. There is
              no form: you check box {LUMP_SUM_ELECTION_BOX} on the 1040 and keep the
              worksheets.
            </p>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="back-pay-months">Months of Back Pay</label>
                <span className="slider-value fuchsia">
                  {backPayMonths} months &middot;{' '}
                  {formatCurrency(backPay.lumpSum)}
                </span>
              </div>
              <input
                id="back-pay-months"
                type="range"
                min={0}
                max={MAX_BACK_PAY_MONTHS}
                step={1}
                value={backPayMonths}
                onChange={(e) => setBackPayMonths(Number(e.target.value))}
                className="slider-fuchsia"
              />
              <div className="slider-range-labels">
                <span>none</span>
                <span>{MAX_BACK_PAY_MONTHS / 12} years</span>
              </div>
              <p className="field-note">
                Months attributable to years <em>before</em> {year}, at the{' '}
                {formatCurrency(ssBenefit / 12)} a month the benefit slider implies.
                The months of {year} itself are already in the annual benefit, and
                the election has nothing to say about them. Your SSA-1099 breaks the
                award down by year in the &ldquo;Description of Amount in Box
                3&rdquo; panel; that panel is the input this slider stands in for.
              </p>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="back-pay-income">
                  Other Income During Each Waiting Year
                </label>
                <span className="slider-value fuchsia">
                  {formatCurrency(backPayIncome)}
                </span>
              </div>
              <input
                id="back-pay-income"
                type="range"
                min={0}
                max={MAX_INCOME}
                step={500}
                value={backPayIncome}
                onChange={(e) => setBackPayIncome(Number(e.target.value))}
                className="slider-fuchsia"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_INCOME)}</span>
              </div>
              <p className="field-note">
                The whole election turns on this number. Each waiting year is
                refigured against its own income, so a year lived on almost nothing
                has a full {ssBase50 > 0 ? formatCurrency(ssBase50) : 'set of'}{' '}
                {ssBase50 > 0 ? 'base' : 'thresholds'} nobody used — and that is the
                usual shape of a long disability claim. Set it high enough and the
                election stops being worth making.
              </p>
            </div>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Back pay landing in {year}</dt>
                <dd className="stat-value fuchsia">
                  {formatCurrency(backPay.lumpSum)}
                </dd>
                <dd className="stat-note">
                  {backPay.years.length > 0
                    ? `${backPayMonths} months across ${backPay.years.length} earlier ${
                        backPay.years.length === 1
                          ? `year, ${year - 1}`
                          : `years, ${backPay.years[0].year}–${year - 1}`
                      }`
                    : 'no back pay on this scenario'}
                </dd>
              </div>
              <div className="stat">
                <dt>Benefits kept out of the tax base</dt>
                <dd className="stat-value fuchsia">
                  {formatCurrency(backPay.taxableSaved)}
                </dd>
                <dd className="stat-note">
                  {formatCurrency(backPay.taxableElected)} taxable, down from{' '}
                  {formatCurrency(backPay.taxableWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Federal tax saved</dt>
                <dd className="stat-value">{formatCurrency(backPay.taxSaved)}</dd>
                <dd className="stat-note">
                  {formatCurrency(backPay.taxWith)} total, down from{' '}
                  {formatCurrency(backPay.taxWithout)}
                </dd>
              </div>
              <div className="stat">
                <dt>Medicare surcharge saved</dt>
                <dd className="stat-value rose">
                  {formatCurrencyCents(backPay.irmaaSurchargeSaved)}
                </dd>
                <dd className="stat-note">
                  {backPay.irmaaTierWithout === backPay.irmaaTierWith
                    ? backPay.irmaaTierWith === 0
                      ? `no surcharge either way at ${formatCurrency(backPay.irmaaMagiWith)} of MAGI`
                      : `tier ${backPay.irmaaTierWith} either way`
                    : `tier ${backPay.irmaaTierWith}, down from tier ${backPay.irmaaTierWithout}`}
                  , set by this year&apos;s MAGI for {year + IRMAA_LOOKBACK_YEARS}
                </dd>
              </div>
            </dl>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={backPayChart}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis
                    dataKey="months"
                    type="number"
                    domain={[0, MAX_BACK_PAY_MONTHS]}
                    ticks={[0, 12, 24, 36, 48, 60]}
                    allowDecimals={false}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={(value) => `$${formatCompact(value)}`}
                    width={70}
                  />
                  <Tooltip content={<BackPayTooltip awardYear={year} />} />
                  <Legend />
                  {backPayMonths > 0 && (
                    <ReferenceLine
                      x={backPayMonths}
                      stroke="#e879f9"
                      strokeDasharray="4 4"
                      label={{
                        value: 'your award',
                        position: 'top',
                        fill: '#e879f9',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="taxWithout"
                    name="All taxed in the year received"
                    stroke={BACK_PAY_COLORS.without}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="taxWith"
                    name="Lump-sum election"
                    stroke={BACK_PAY_COLORS.with}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-axis-label">
              Federal tax in {year} &middot; the gap between the lines is what
              checking one box is worth
            </p>

            {backPay.years.length > 0 && (
              <table className="tier-table">
                <caption>
                  What the election reports:{' '}
                  <strong>{formatCurrency(backPay.taxableWithElection)}</strong> of
                  taxable benefit against{' '}
                  <strong>{formatCurrency(backPay.taxableWithout)}</strong> with the
                  whole award taxed in {year}.{' '}
                  {ssBase50 > 0 ? (
                    <>
                      Every row is figured on the same {formatCurrency(ssBase50)}{' '}
                      and {formatCurrency(ssBase85)} thresholds, because they have
                      not been touched since {SS_BASE85_ENACTED} — which is the
                      entire reason spreading the award across years is worth
                      anything.
                    </>
                  ) : (
                    <>
                      Every row is figured on the same $0 thresholds, so every row
                      is 85%. A separate return that lived with its spouse has no
                      unused base for an earlier year to hand back, and spreading
                      the award reaches for room that was never there.
                    </>
                  )}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Months</th>
                    <th scope="col">Benefit for it</th>
                    <th scope="col">Taxable</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {backPay.years.map((y) => (
                    <tr key={y.year}>
                      <th scope="row">{y.year}</th>
                      <td>{y.months}</td>
                      <td>{formatCurrency(y.portion)}</td>
                      <td>{formatCurrency(y.additional)}</td>
                      <td>
                        {y.portion > 0
                          ? formatPercent(y.additional / y.portion)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{year} (this year)</th>
                    <td>12</td>
                    <td>{formatCurrency(ssBenefit)}</td>
                    <td>{formatCurrency(backPay.currentYearOnly)}</td>
                    <td>
                      {ssBenefit > 0
                        ? formatPercent(backPay.currentYearOnly / ssBenefit)
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {backPayMonths === 0 ? (
              <p>
                There is no back pay on this scenario, so there is nothing to elect.
                Move the months slider and the two lines above separate: the slate
                one is the whole award taxed in {year}, the fuchsia one is the same
                award refigured year by year.
              </p>
            ) : backPay.taxableWithElection === backPay.taxableWithout ? (
              <p>
                <strong>The election changes nothing here.</strong> Refiguring the
                award year by year reports the same{' '}
                {formatCurrency(backPay.taxableWithout)} of taxable benefit that
                taxing all of it in {year} does.{' '}
                {ssBase85 === 0 ? (
                  <>
                    Both bases are $0 on a separate return that lived with the
                    spouse, so 85% of every benefit dollar is taxable in every year
                    there has ever been. There is no unused threshold anywhere to go
                    and find — which is the same reason this filing status has no
                    torpedo on the chart at the top, only the ceiling.
                  </>
                ) : backPay.taxableWithout === 0 ? (
                  <>
                    None of the benefit is taxable in any of these years: provisional
                    income stays under {formatCurrency(ssBase50)} whether the award
                    is counted in one year or spread over{' '}
                    {backPay.years.length + 1}. There is nothing here for the
                    election to reach.
                  </>
                ) : backPay.capBindsEveryYear ? (
                  <>
                    Every year involved — {year} and each waiting year — is already
                    past the {formatCurrency(ssBase85)} adjusted base by more than
                    its own benefit, so the 85% cap binds in all of them. The award
                    is 85% taxable however it is sliced.
                  </>
                ) : (
                  <>
                    No year here is at the 85% cap, so this is a coincidence rather
                    than a ceiling: at {formatCurrency(backPayIncome)} of income in
                    each waiting year, the benefit those years pull into their own
                    tax base comes to exactly what the award adds to {year}&apos;s.
                    Move either income slider and the two figures separate.
                  </>
                )}
              </p>
            ) : !backPay.worthElecting ? (
              <p>
                <strong>Do not make this election.</strong> Refiguring the award
                against the waiting years would report{' '}
                {formatCurrency(backPay.taxableWithElection)} of taxable benefit
                where taxing the whole thing in {year} reports{' '}
                {formatCurrency(backPay.taxableWithout)}
                {backPay.taxableWithout === 0
                  ? ' — none of it is taxable this year at all'
                  : ''}
                . At {formatCurrency(backPayIncome)} of income in each waiting year,
                the earlier years have less room than {year} does, so spreading the
                award over them costs rather than saves. 86(e) is a ceiling and not a
                substitution, so nothing is lost by asking — but the answer here is
                no, and 86(e)(2)(B) lets you take it back only with the consent of
                the Secretary.
              </p>
            ) : backPay.taxSaved === 0 ? (
              <p>
                The election takes{' '}
                <strong>{formatCurrency(backPay.taxableSaved)}</strong> of benefit
                out of {year}&apos;s tax base and it changes the bill by nothing.{' '}
                {backPay.agiWithout <= deductionTotal
                  ? `The ${formatCurrency(deductionTotal)} of deductions covered the whole ${formatCurrency(backPay.agiWithout)} of AGI either way, so there was no tax on those dollars to save.`
                  : `Past the ${formatCurrency(deductionTotal)} of deductions everything left in the base is long-term gain sitting in the 0% bracket, with or without the election.`}{' '}
                Raise the other-income slider above and this figure starts moving —
                the election is worth its bracket rate, and the bracket rate is zero
                here.
              </p>
            ) : (
              <p>
                Refiguring the award year by year reports{' '}
                <strong>{formatCurrency(backPay.taxableWithElection)}</strong> of
                taxable benefit instead of{' '}
                {formatCurrency(backPay.taxableWithout)} — it keeps{' '}
                <strong>{formatCurrency(backPay.taxableSaved)}</strong> out of the
                tax base, {backPay.taxableSavedPercent}% of the award itself. That is{' '}
                <strong>{formatCurrency(backPay.taxSaved)}</strong> of federal tax on
                a cheque that has already been cashed
                {backPay.irmaaSurchargeSaved > 0 ? (
                  <>
                    , plus{' '}
                    <strong>
                      {formatCurrencyCents(backPay.irmaaSurchargeSaved)}
                    </strong>{' '}
                    of Medicare surcharge in {year + IRMAA_LOOKBACK_YEARS}, because
                    the award was about to spend a whole year of premiums pushing
                    MAGI past a cliff it will be nowhere near by the time the
                    premium is charged
                  </>
                ) : (
                  ''
                )}
                .
              </p>
            )}

            <p className="warning-note" role="note">
              <strong>You need the earlier years&apos; returns to do this.</strong>{' '}
              Each waiting year is refigured against the income actually reported for
              it, so the worksheet asks for that year&apos;s AGI, its tax-exempt
              interest and any benefits it already reported — and 86(e)(2)(B) makes
              the election revocable only with the consent of the Secretary. The
              single slider above stands in for all of that by assuming every waiting
              year looked the same, which is the one thing a real award never quite
              does.
            </p>

            <p className="field-note">
              Three details this section holds fixed. The back pay accrues at a flat
              monthly rate, where a real award is figured at each year&apos;s own
              COLA, so the earliest slices here are a few percent larger than they
              would really be. The filing status and tax-exempt interest selected
              above are carried back to every waiting year unchanged. And a waiting
              year of 1993 or earlier would need Pub 915&apos;s Worksheet 3 rather
              than Worksheet 2, since the 85% tier did not exist until{' '}
              {SS_BASE85_ENACTED + 1} — five years of back pay from {year} does not
              reach anywhere near it.
            </p>

            <p className="field-note">
              Nothing here feeds the charts or the projections on the other tabs. A
              retroactive award is a single event in a single year; the rest of this
              page is about a year that repeats.
            </p>
          </section>
        </div>
      )}

      {tab === 'horizon' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-horizon"
          aria-labelledby="tab-horizon"
        >
          {/* ───── Multi-year projection ───── */}
          <section className="explainer" aria-labelledby="projection-heading">
            <h2 id="projection-heading" className="section-heading-teal">
              The thresholds never move
            </h2>
            <p>
              {filingStatus === 'mfs' ? (
                <>
                  A separate return that lived with its spouse has both thresholds
                  at {formatCurrency(0)} — put there by IRC 86(c) in{' '}
                  {SS_BASE50_ENACTED} and never revisited — so 85% of the benefit is
                  taxable from the first dollar and there is no ratchet left to
                  project. The other three statuses have somewhere to climb from.
                </>
              ) : (
                <>
                  Congress set your first provisional-income threshold at{' '}
                  {formatCurrency(ssBase50)} in {SS_BASE50_ENACTED} and your second
                  at {formatCurrency(ssBase85)} in {SS_BASE85_ENACTED}, and never
                  indexed either one.
                </>
              )}{' '}
              Everything around them is indexed: the brackets, the standard
              deduction, the capital-gain bands, and the benefit itself. Hold your
              income flat in real terms — this projection grows it at the same rate
              it grows the brackets — and the taxable share of your benefit still
              climbs every year, with nothing about your circumstances changing at
              all.
            </p>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="projection-horizon">Years to project</label>
                <span className="slider-value teal">{horizonYears} years</span>
              </div>
              <input
                id="projection-horizon"
                type="range"
                min={MIN_HORIZON}
                max={MAX_HORIZON}
                step={1}
                value={horizonYears}
                onChange={(e) => setHorizonYears(Number(e.target.value))}
                className="slider-teal"
              />
              <div className="slider-range-labels">
                <span>{MIN_HORIZON} years</span>
                <span>{MAX_HORIZON} years</span>
              </div>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="projection-cola">Annual COLA and inflation</label>
                <span className="slider-value teal">{colaAssumption}%</span>
              </div>
              <input
                id="projection-cola"
                type="range"
                min={0}
                max={MAX_COLA}
                step={0.1}
                value={colaAssumption}
                onChange={(e) => setColaAssumption(Number(e.target.value))}
                className="slider-teal"
              />
              <div className="slider-range-labels">
                <span>0%</span>
                <span>{MAX_COLA}%</span>
              </div>
              <p className="field-note">
                One slider drives both, so real income never changes and the frozen
                thresholds are the only thing left moving. In practice the two
                differ: benefits follow CPI-W and the brackets follow chained CPI-U,
                which runs a little lower — so the real ratchet is slightly steeper
                than this shows, not shallower.
              </p>
              {projection.publishedThroughYear > projection.startYear && (
                <p className="field-note">
                  The slider does not reach{' '}
                  {projection.publishedThroughYear === projection.startYear + 1
                    ? projection.publishedThroughYear
                    : `${projection.startYear + 1}–${projection.publishedThroughYear}`}
                  : those brackets, standard deductions and capital-gain bands are
                  already published, so the projection reads them instead of
                  guessing at them. Expect a bend at{' '}
                  {projection.publishedThroughYear + 1}, where the assumption takes
                  over from the law. The benefit does follow the slider throughout —
                  it is your figure, and holding it to the same rate as your other
                  income is what keeps real income flat.
                </p>
              )}
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="projection-birth-year">Year you were born</label>
                <span className="slider-value teal">{birthYear}</span>
              </div>
              <input
                id="projection-birth-year"
                type="range"
                min={MIN_BIRTH_YEAR}
                max={MAX_BIRTH_YEAR}
                step={1}
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
                className="slider-teal"
              />
              <div className="slider-range-labels">
                <span>{MIN_BIRTH_YEAR}</span>
                <span>{MAX_BIRTH_YEAR}</span>
              </div>
              <p className="field-note">
                Age {ageAtStart} in {year}. Distributions become required at{' '}
                <strong>{applicableAge}</strong>
                {birthYear === RMD_RESERVED_BIRTH_YEAR
                  ? ' — the one birth year the regulations have not settled. SECURE 2.0 gives someone born in 1959 both 73 and 75; the final rules left that paragraph reserved and the proposed ones say 73, which is what this uses.'
                  : birthYear < 1951
                    ? ', which for anyone born this early began years ago.'
                    : '.'}
              </p>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="projection-balance">
                  Traditional IRA and 401(k) balance
                </label>
                <span className="slider-value teal">
                  {formatCurrency(traditionalBalance)}
                </span>
              </div>
              <input
                id="projection-balance"
                type="range"
                min={0}
                max={MAX_TRADITIONAL_BALANCE}
                step={25_000}
                value={traditionalBalance}
                onChange={(e) => setTraditionalBalance(Number(e.target.value))}
                className="slider-teal"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_TRADITIONAL_BALANCE)}</span>
              </div>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="projection-growth">Annual growth on that balance</label>
                <span className="slider-value teal">{balanceGrowth}%</span>
              </div>
              <input
                id="projection-growth"
                type="range"
                min={0}
                max={MAX_BALANCE_GROWTH}
                step={0.5}
                value={balanceGrowth}
                onChange={(e) => setBalanceGrowth(Number(e.target.value))}
                className="slider-teal"
              />
              <div className="slider-range-labels">
                <span>0%</span>
                <span>{MAX_BALANCE_GROWTH}%</span>
              </div>
            </div>

            <dl className="stat-grid">
              <div className="stat">
                <dt>Taxable share of benefit</dt>
                <dd className="stat-value teal">
                  {projection.first.taxableSharePercent}% &rarr;{' '}
                  {projection.last.taxableSharePercent}%
                </dd>
                <dd className="stat-note">
                  {formatCurrency(projection.first.taxableSS)} of{' '}
                  {formatCurrency(projection.first.ssBenefit)} in{' '}
                  {projection.startYear};{' '}
                  {formatCurrency(projection.last.taxableSS)} of{' '}
                  {formatCurrency(projection.last.ssBenefit)} in {projection.endYear}
                </dd>
              </div>
              <div className="stat">
                <dt>Effective rate on everything received</dt>
                <dd className="stat-value">
                  {projection.first.effectiveRatePercent}% &rarr;{' '}
                  {projection.last.effectiveRatePercent}%
                </dd>
              </div>
              <div className="stat">
                <dt>Federal tax in {projection.startYear} dollars</dt>
                <dd className="stat-value">
                  {formatCurrency(projection.first.totalTax)} &rarr;{' '}
                  {formatCurrency(projection.last.realTotalTax)}
                </dd>
                <dd className="stat-note">
                  {projection.realTaxMultiple !== null
                    ? `${projection.realTaxMultiple}x the first year's, after inflation`
                    : 'The first year owed nothing, so there is no multiple to quote'}
                </dd>
              </div>
              <div className="stat">
                <dt>First required distribution</dt>
                <dd className="stat-value">
                  {firstRmdRow
                    ? `${firstRmdRow.year} · ${formatCurrency(firstRmdRow.rmd)}`
                    : traditionalBalance === 0
                      ? 'No balance'
                      : `Age ${applicableAge}, past ${projection.endYear}`}
                </dd>
                {firstRmdRow && (
                  <dd className="stat-note">
                    At {firstRmdRow.age}, off a{' '}
                    {formatCurrency(firstRmdRow.openingBalance)} balance divided by{' '}
                    {UNIFORM_LIFETIME_DIVISORS[firstRmdRow.age]}
                    {firstRmdRow.age > applicableAge &&
                      ` — the applicable age of ${applicableAge} passed before ${projection.startYear}`}
                  </dd>
                )}
              </div>
            </dl>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={projection.rows}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis
                    dataKey="year"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    allowDecimals={false}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={(value) => `${value}%`}
                    width={70}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    content={<ProjectionTooltip startYear={projection.startYear} />}
                  />
                  <Legend />
                  <ReferenceLine
                    y={85}
                    stroke="#2dd4bf"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: '85% cap',
                      position: 'insideTopRight',
                      fill: '#2dd4bf',
                      fontSize: 11,
                    }}
                  />
                  {projection.firstRmdYear !== null && (
                    <ReferenceLine
                      x={projection.firstRmdYear}
                      stroke="#fbbf24"
                      strokeDasharray="4 4"
                      label={{
                        value: 'RMDs begin',
                        position: 'top',
                        fill: '#fbbf24',
                        fontSize: 11,
                      }}
                    />
                  )}
                  {projection.seniorDeductionEndsYear !== null && (
                    <ReferenceLine
                      x={projection.seniorDeductionEndsYear}
                      stroke="#fb7185"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Senior deduction ends',
                        position: 'top',
                        fill: '#fb7185',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="taxableSharePercent"
                    name="Taxable share of benefit"
                    stroke="#2dd4bf"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="effectiveRatePercent"
                    name="Effective rate on total income"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-axis-label">
              Tax year &middot; {formatCurrency(ordinaryIncome)} of other income and a{' '}
              {formatCurrency(ssBenefit)} benefit in {projection.startYear}, both
              growing at {colaAssumption}% a year
              {projection.publishedThroughYear > projection.startYear &&
                `, against published figures through ${projection.publishedThroughYear}`}
            </p>

            <p>
              {projection.first.taxableSharePercent >= 85 ? (
                <>
                  This filer is already at the 85% ceiling in {projection.startYear},
                  so there is no ratchet left to watch — the teal line is flat because
                  the thresholds have already done everything they can do. Lower the
                  other income, or the benefit, to see the climb.
                </>
              ) : projection.last.taxableSharePercent <=
                projection.first.taxableSharePercent ? (
                <>
                  At a {colaAssumption}% COLA nothing moves: the taxable share sits
                  at <strong>{projection.first.taxableSharePercent}%</strong> for all{' '}
                  {horizonYears} years. That is the control case, and it is worth a
                  moment — the thresholds are just as frozen here as anywhere else,
                  and they cost this filer nothing. The ratchet is not the
                  thresholds standing still. It is everything else moving past them.
                  Raise the slider to watch it bite.
                </>
              ) : projection.fullyTaxedYear !== null ? (
                <>
                  The taxable share climbs from{' '}
                  <strong>{projection.first.taxableSharePercent}%</strong> to the{' '}
                  <strong>85% ceiling in {projection.fullyTaxedYear}</strong>, and
                  stops there — 85% is all IRC 86 can ever reach. After that the
                  ratchet is spent:{' '}
                  {firstRmdRow
                    ? 'anything still climbing is the required distributions growing, not the thresholds.'
                    : 'the effective rate flattens out with it.'}
                </>
              ) : (
                <>
                  The taxable share climbs from{' '}
                  <strong>{projection.first.taxableSharePercent}%</strong> in{' '}
                  {projection.startYear} to{' '}
                  <strong>{projection.last.taxableSharePercent}%</strong> by{' '}
                  {projection.endYear} without reaching the 85% ceiling.{' '}
                  {colaAssumption > 0 ? (
                    <>
                      Every year of that is inflation walking the same real income
                      further past a threshold last touched in {SS_BASE85_ENACTED}
                      {firstRmdRow
                        ? ', with the required distribution pushing in the same direction'
                        : ''}
                      .
                    </>
                  ) : (
                    <>
                      With the COLA at zero the thresholds cost nothing on their own,
                      so none of that climb is them: it is the required distribution,
                      growing at {balanceGrowth}% a year against an income standing
                      still.
                    </>
                  )}
                </>
              )}
            </p>

            {firstRmdRow && (
              <p>
                {firstRmdRow.year > projection.startYear ? (
                  <>
                    The step at <strong>{firstRmdRow.year}</strong> is the first
                    required minimum distribution.
                  </>
                ) : (
                  <>
                    This filer is already past the applicable age, so a required
                    distribution lands in <strong>{projection.startYear}</strong> and
                    in every year after it — there is no step to look for here, only
                    a floor under the whole projection.
                  </>
                )}{' '}
                From the applicable age on, the prior year&apos;s closing balance
                divided by the Uniform Lifetime Table divisor comes out whether it is
                wanted or not, lands in ordinary income, and raises provisional
                income dollar for dollar — so it moves the benefit line as well as
                the bracket.{' '}
                {applicableAge > RMD_AGE_BEFORE_SECURE_2 && (
                  <>
                    SECURE 2.0 pushed that age from {RMD_AGE_BEFORE_SECURE_2} to{' '}
                    {applicableAge}, which sounds like relief and is closer to the
                    opposite:{' '}
                    {applicableAge - RMD_AGE_BEFORE_SECURE_2 === 1
                      ? 'another year'
                      : `${applicableAge - RMD_AGE_BEFORE_SECURE_2} more years`}{' '}
                    of compounding met by a smaller divisor.{' '}
                  </>
                )}
                The first distribution may be deferred to 1 April of the following
                year, but only once, and doing so stacks two distributions into one
                tax year.
              </p>
            )}

            {projection.seniorDeductionEndsYear !== null && (
              <p>
                {/* Not "the second step": the senior deduction can expire either
                    side of the first distribution, and does whenever the filer
                    reaches 65 before the applicable age. */}
                {firstRmdRow ? 'The other step, at ' : 'The step at '}
                <strong>{projection.seniorDeductionEndsYear}</strong>
                {firstRmdRow ? ', is' : ' is'} the OBBBA senior deduction expiring.
                It is written as{' '}
                {formatCurrency(SENIOR_DEDUCTION)} per qualifying person for{' '}
                {SENIOR_DEDUCTION_FIRST_YEAR} through {SENIOR_DEDUCTION_LAST_YEAR}{' '}
                and nothing after, so unless Congress extends it, taxable income
                jumps by that much in one year with no change in income at all.
              </p>
            )}

            <p>
              What this deliberately leaves out: capital gains, which are realised
              once rather than every year for thirty; Medicare&apos;s IRMAA, whose
              thresholds <em>are</em> indexed, so including it would blur the point
              rather than sharpen it; and state tax. It also treats the amount you
              set as &ldquo;other income&rdquo; as separate from the balance below
              it — if what you withdraw from the IRA already is your other income,
              the required distribution replaces part of it rather than adding to it.
            </p>
          </section>

          {/* ───── Withdrawal sequencing ───── */}
          <section className="explainer" aria-labelledby="sequencing-heading">
            <h2 id="sequencing-heading" className="section-heading-indigo">
              Which account you spend first
            </h2>
            <p>
              The conventional order is brokerage account, then IRA, then Roth, and
              it has one very good argument behind it: a dollar left in a
              tax-deferred account keeps compounding untaxed. It is also how a
              retiree arrives at {applicableAge} holding an IRA large enough that the
              required distribution alone drags the whole benefit past the{' '}
              {formatCurrency(ssBase85)} base, in a year when there is no longer any
              choice about it. These three orders fund the same retirement — the same
              horizon, COLA, birth year, IRA balance and growth rate set above — and
              the score is every year of federal tax, added up in {year} dollars.
            </p>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="sequencing-spending">After-tax spending each year</label>
                <span className="slider-value indigo">{formatCurrency(spendingNeed)}</span>
              </div>
              <input
                id="sequencing-spending"
                type="range"
                min={0}
                max={MAX_SPENDING}
                step={1_000}
                value={spendingNeed}
                onChange={(e) => setSpendingNeed(Number(e.target.value))}
                className="slider-indigo"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_SPENDING)}</span>
              </div>
              <p className="field-note">
                What the household spends, with federal tax paid on top of it rather
                than out of it. The benefit, the {formatCurrency(ordinaryIncome)} of
                other income and any tax-exempt interest cover the first part;
                withdrawals cover the rest, and the tax on those withdrawals, which
                is why the withdrawal needed to fund a year depends on the tax and
                the tax depends on the withdrawal.
              </p>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="sequencing-taxable">Taxable brokerage account</label>
                <span className="slider-value indigo">{formatCurrency(taxableBalance)}</span>
              </div>
              <input
                id="sequencing-taxable"
                type="range"
                min={0}
                max={MAX_ACCOUNT_BALANCE}
                step={25_000}
                value={taxableBalance}
                onChange={(e) => setTaxableBalance(Number(e.target.value))}
                className="slider-indigo"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_ACCOUNT_BALANCE)}</span>
              </div>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="sequencing-basis">Of that, cost basis</label>
                <span className="slider-value indigo">{taxableBasisPercent}%</span>
              </div>
              <input
                id="sequencing-basis"
                type="range"
                min={0}
                max={100}
                step={5}
                value={taxableBasisPercent}
                onChange={(e) => setTaxableBasisPercent(Number(e.target.value))}
                className="slider-indigo"
              />
              <div className="slider-range-labels">
                <span>0% — all gain</span>
                <span>100% — all basis</span>
              </div>
              <p className="field-note">
                A sale recovers basis in the same proportion the account holds it, so
                at {taxableBasisPercent}% basis,{' '}
                {formatCents(1 - taxableBasisPercent / 100)} of every dollar sold is
                a realised gain. Gains are taxed in their own brackets but counted in
                full toward provisional income, so the &ldquo;tax-efficient&rdquo;
                account is not free either — spending it can push benefits into the
                tax base just as an IRA withdrawal does.
              </p>
            </div>

            <div className="input-group">
              <div className="slider-header">
                <label htmlFor="sequencing-roth">Roth IRA</label>
                <span className="slider-value indigo">{formatCurrency(rothBalance)}</span>
              </div>
              <input
                id="sequencing-roth"
                type="range"
                min={0}
                max={MAX_ACCOUNT_BALANCE}
                step={25_000}
                value={rothBalance}
                onChange={(e) => setRothBalance(Number(e.target.value))}
                className="slider-indigo"
              />
              <div className="slider-range-labels">
                <span>$0</span>
                <span>{formatCurrency(MAX_ACCOUNT_BALANCE)}</span>
              </div>
              <p className="field-note">
                Qualified distributions are tax-free, stay out of provisional income
                entirely, and are never required — the one account that can fund a
                year without moving a single line on the return.
              </p>
            </div>

            <div className="input-group">
              <label htmlFor="sequencing-ceiling">Fill the IRA up to</label>
              <select
                id="sequencing-ceiling"
                className="ceiling-select"
                value={fillCeilingId}
                onChange={(e) => setFillCeilingId(e.target.value as ConversionCeilingId)}
              >
                {fillCeilings.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {formatCurrency(c.amount)} of{' '}
                    {CONVERSION_MEASURE_LABELS[c.measure]}
                  </option>
                ))}
              </select>
              <p className="field-note">
                Only the bracket-filling order uses this. Medicare&apos;s first IRMAA
                tier is on the Roth conversion menu under Strategies but not on
            this one: its
                thresholds are indexed and this projection carries a single published
                premium schedule forward unchanged, so an IRMAA ceiling would appear
                to tighten every year for no reason in the statute.
              </p>
            </div>

            <table className="tier-table">
              <caption>
                Both figures are in {sequencing.startYear} dollars, over{' '}
                {horizonYears} years to {sequencing.endYear}. What is left after tax
                values the closing balances net of what is still owed on them: the
                traditional balance run through the final year&apos;s return as
                ordinary income, with unrealised gain stacked on top of it. That is
                harsher than an heir spreading the balance over the ten years IRC
                401(a)(9)(H) allows, and it is here so that an order cannot win by
                simply never withdrawing.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Lifetime federal tax</th>
                  <th scope="col">Left after tax</th>
                  <th scope="col">IRA left</th>
                  <th scope="col">Tax owed on it</th>
                </tr>
              </thead>
              <tbody>
                {sequencing.strategies.map((s) => (
                  <tr key={s.strategy.id}>
                    <th scope="row">
                      <span style={{ color: SEQUENCING_COLORS[s.strategy.chartKey] }}>
                        {s.strategy.label}
                      </span>
                      <br />
                      <span className="seq-order">{s.strategy.order}</span>
                    </th>
                    <td
                      className={
                        s.lifetimeRealTax === sequencing.lowestTax.lifetimeRealTax
                          ? 'seq-best'
                          : undefined
                      }
                    >
                      {formatCurrency(s.lifetimeRealTax)}
                    </td>
                    <td
                      className={
                        s.endingAfterTaxReal === sequencing.mostAfterTax.endingAfterTaxReal
                          ? 'seq-best'
                          : undefined
                      }
                    >
                      {formatCurrency(s.endingAfterTaxReal)}
                    </td>
                    <td>{formatCurrency(s.endingTraditional)}</td>
                    <td>
                      {formatCurrency(s.deferredTraditionalTax)}
                      {s.endingTraditional > 0 && ` (${s.deferredTraditionalRate}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sequencingRows}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis
                    dataKey="year"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    allowDecimals={false}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={(value) => `$${formatCompact(value)}`}
                    width={70}
                  />
                  <Tooltip content={<SequencingTooltip comparison={sequencing} />} />
                  <Legend />
                  {seqConventional.firstRmdYear !== null && (
                    <ReferenceLine
                      x={seqConventional.firstRmdYear}
                      stroke="#fbbf24"
                      strokeDasharray="4 4"
                      label={{
                        value: 'RMDs begin',
                        position: 'top',
                        fill: '#fbbf24',
                        fontSize: 11,
                      }}
                    />
                  )}
                  {SEQUENCING_STRATEGIES.map((strategy) => (
                    <Line
                      key={strategy.id}
                      type="monotone"
                      dataKey={strategy.chartKey}
                      name={strategy.label}
                      stroke={SEQUENCING_COLORS[strategy.chartKey]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-axis-label">
              Running federal tax in {sequencing.startYear} dollars &middot; the year
              the lines cross is the year an order stops costing money and starts
              saving it
            </p>

            {sequencing.anyShortfall ? (
              <p>
                <strong>These accounts do not last {horizonYears} years.</strong> At{' '}
                {formatCurrency(spendingNeed)} of spending a year they run dry, and
                once they do every order is spending the same nothing — so the
                comparison below is measuring how fast each one got there, not which
                one is cheaper. Lower the spending, lengthen the balances, or shorten
                the horizon before reading anything into the figures.
              </p>
            ) : seqVoluntary === 0 ? (
              <p>
                <strong>Nothing here is being sequenced.</strong> The benefit and
                the {formatCurrency(ordinaryIncome)} of other income cover{' '}
                {formatCurrency(spendingNeed)} of spending and the tax on it without
                help, so no order withdraws a dollar it is not required to and all
                three post the same {formatCurrency(sequencing.lowestTax.lifetimeRealTax)}.
                The only money leaving an account is the required distribution, which
                is not a choice. Raise the spending above what the income covers and
                the orders have something to disagree about.
              </p>
            ) : seqFundedAccounts < 2 ? (
              <p>
                <strong>There is only one account to spend.</strong> Sequencing is a
                question about which of several accounts to draw on first, and with
                just one funded there is no order to choose — all three land on the
                same {formatCurrency(sequencing.lowestTax.lifetimeRealTax)}. Fund a
                second account above and the comparison starts saying something.
              </p>
            ) : sequencing.taxSpread < 1_000 ? (
              <p>
                All three orders land within{' '}
                <strong>{formatCurrency(sequencing.taxSpread)}</strong> of each other
                over {horizonYears} years, which is the honest answer for this filer:
                the sequencing decision is small next to how much is being withdrawn.
                It gets larger as the IRA does, and as the gap widens between the
                rate paid now and the rate the required distribution will attract
                later — try a bigger traditional balance above, or less spending.
              </p>
            ) : sequencing.scoresDisagree ? (
              <p>
                <strong>{sequencing.lowestTax.strategy.label}</strong> pays the least
                federal tax over these {horizonYears} years —{' '}
                {formatCurrency(sequencing.lowestTax.lifetimeRealTax)}, or{' '}
                {formatCurrency(sequencing.taxSpread)} less than the most expensive
                order — and finishes with less money than{' '}
                <strong>{sequencing.mostAfterTax.strategy.label}</strong>, by{' '}
                {formatCurrency(
                  sequencing.mostAfterTax.endingAfterTaxReal -
                    sequencing.lowestTax.endingAfterTaxReal,
                )}
                . That is the entire argument about sequencing in one line. The
                cheapest-looking order got there by leaving a bill behind:{' '}
                {sequencing.lowestTax.endingTraditional > 0 ? (
                  <>
                    {formatCurrency(sequencing.lowestTax.endingTraditional)} in the
                    IRA with{' '}
                    {formatCurrency(sequencing.lowestTax.deferredTraditionalTax)} of
                    tax still attached to it
                  </>
                ) : (
                  /*
                    No IRA left to blame — with the traditional balance at or near
                    zero the gap is unrealised gain in the brokerage account, or a
                    Roth that got spent to keep a year's tax down. Naming the IRA
                    here would print "$0 in the IRA with $0 of tax attached", which
                    is both true and an explanation of nothing.
                  */
                  <>
                    {formatCurrency(
                      Math.max(
                        0,
                        sequencing.lowestTax.endingTaxable -
                          sequencing.lowestTax.endingTaxableBasis,
                      ),
                    )}{' '}
                    of unrealised gain in the brokerage account, carrying{' '}
                    {formatCurrency(sequencing.lowestTax.deferredGainTax)} of tax,
                    and {formatCurrency(sequencing.lowestTax.endingRoth)} left in the
                    Roth against{' '}
                    {formatCurrency(sequencing.mostAfterTax.endingRoth)} — the
                    cheaper order spent the one account whose growth was never going
                    to be taxed
                  </>
                )}
                . Deferring the bill is not the same as avoiding it, and a bill
                deferred long enough is one that arrives all at once.
              </p>
            ) : (
              <p>
                <strong>{sequencing.lowestTax.strategy.label}</strong> wins both
                ways: {formatCurrency(sequencing.lowestTax.lifetimeRealTax)} of
                lifetime federal tax,{' '}
                {formatCurrency(sequencing.taxSpread)} less than the most expensive
                order, and {formatCurrency(sequencing.afterTaxSpread)} more left over
                once the deferred tax on every closing balance is subtracted. When
                the two scores agree the choice is not close, because they are
                measuring the same thing from opposite ends.
              </p>
            )}

            <p>
              {seqBracketFill.endingTraditional < seqConventional.endingTraditional ? (
                <>
                  Bracket filling works by paying tax earlier than it has to.
                  Aimed at {sequencing.fillCeiling.label.toLowerCase()} it leaves the
                  IRA at {formatCurrency(seqBracketFill.endingTraditional)}{' '}
                  in {sequencing.endYear} rather than{' '}
                  {formatCurrency(seqConventional.endingTraditional)} — the
                  same money, moved into the years where the filer chose the rate
                  instead of the years where the Uniform Lifetime Table chose it.
                </>
              ) : traditionalBalance === 0 ? (
                /*
                  The three ways the fill can come to nothing are different
                  statements about the filer, and the ceiling is only to blame for
                  the last of them. Ordered by what the reader can act on.
                */
                <>
                  There is no IRA here to fill. With the traditional balance at zero
                  the ceiling has nothing to aim at, and bracket filling is the
                  conventional order under another name — the three lines above
                  differ only in how they split the brokerage account and the Roth.
                </>
              ) : seqConventional.endingTraditional === 0 ? (
                <>
                  Every order empties the IRA before {sequencing.endYear} anyway, so
                  there is nothing left for {sequencing.fillCeiling.label.toLowerCase()}{' '}
                  to change: the spending is large enough to take the whole balance
                  out over the horizon whatever order it is taken in. Bracket filling
                  only has room to work when something would otherwise be left.
                </>
              ) : (
                <>
                  Bracket filling has nothing to fill here: this filer is already
                  past {sequencing.fillCeiling.label.toLowerCase()} on the income
                  they cannot turn off — the {formatCurrency(ordinaryIncome)} of
                  other income, the benefit, and the required distribution on top of
                  both — so the order collapses into the conventional one. Pick a
                  higher ceiling, or note that the ceiling is telling you something:
                  the bracket you were hoping to fill is already full.
                </>
              )}
            </p>

            <p>
              Two things this understates and one it leaves out. It understates
              bracket filling, because a dollar pulled out above what is spent lands
              in the brokerage account, where its growth is taxable — converting the
              same dollar to a Roth costs identical tax today and shelters that
              growth forever, so the figures above are the floor of what the strategy
              is worth. It understates the brokerage account, which here is pure
              appreciation and throws off no dividends or interest until it is sold.
              And it leaves out state tax and Medicare&apos;s IRMAA entirely: the
              first because nine states have nine different rules, the second because
              it is a premium rather than a tax and its two-year lag would need a
              timeline of its own.
            </p>
          </section>
        </div>
      )}

      {tab === 'states' && (
        <div
          className="tab-panel"
          role="tabpanel"
          id="panel-states"
          aria-labelledby="tab-states"
        >
          {/* ───── State treatment ───── */}
          <section className="explainer" aria-labelledby="state-treatment-heading">
            <h2 id="state-treatment-heading" className="section-heading-sky">
              Does your state tax it too?
            </h2>
            <p>
              Everything above this line is federal. Most states leave benefits
              alone: {50 - statesTaxing.length} of them, plus the
              District of Columbia, exempt Social Security outright, either because
              they have no income tax at all or because they subtract the benefit
              before they start.{' '}
              <strong>{statesTaxing.length}</strong> still reach
              some part of it in {year}
              {year >= 2026
                ? ' — West Virginia finished phasing its tax out this year, so the list is one shorter than it was a year ago'
                : '; West Virginia is the next to go, from 2026 on'}
              .
            </p>
            <p>
              Nearly all of them start from the same number the Tax Torpedo chart
          produces
              — the federally taxable share of the benefit — and then subtract,
              exempt or credit it back under an income test of their own. Montana
              does not even do that: it takes the federal figure and stops, so the
              torpedo arrives at full size. That makes the table below a lookup, not
              a calculation — no two of these rules have the same shape, and a wrong
              computation would be worse than an accurate pointer.
            </p>

            <p>
              Most of these are as frozen as the federal $25,000:{' '}
              <strong>{statesFrozen}</strong> of the {statesTaxing.length} rules
              below read word for word the same in {TAX_YEARS[0]} as in{' '}
              {TAX_YEARS[TAX_YEARS.length - 1]}.{' '}
              {statesMoving.length > 0 ? (
                <>
                  The{' '}
                  {statesMoving.length === 1
                    ? 'one that moves is'
                    : `${statesMoving.length} that move are`}{' '}
                  {formatNameList(statesMoving.map((rule) => rule.state))}. The
                  table prints both years for those, so the change is visible
                  without flipping the year selector and trying to remember what
                  was there before.
                </>
              ) : null}
            </p>

            <table className="state-table">
              <caption>
                Rules and figures for tax year {year}, from each state&apos;s own
                statute or revenue department. AGI means federal adjusted gross
                income unless the rule says otherwise. Where a state&apos;s test
                differs in another year this page can price, that year&apos;s
                wording is printed underneath in grey.
              </caption>
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Mechanism</th>
                  <th scope="col">Income test ({year})</th>
                </tr>
              </thead>
              <tbody>
                {statesTaxing.map((rule) => (
                  <tr key={rule.abbr}>
                    <th scope="row">{rule.state}</th>
                    <td>{rule.mechanism}</td>
                    <td>
                      <span className="state-test-current">
                        {rule.test[year]}
                      </span>
                      {stateTestDeltas(rule, year).map((delta) => (
                        <span className="state-test-delta" key={delta.year}>
                          <span className="state-test-delta-year">
                            {delta.year}
                          </span>{' '}
                          {delta.test}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <details className="state-details">
              <summary>Each rule in full, and where it comes from</summary>
              <dl className="state-rules">
                {statesTaxing.map((rule) => (
                  <div key={rule.abbr}>
                    <dt>
                      {rule.state}
                      {rule.indexed ? (
                        <span className="state-tag">indexed yearly</span>
                      ) : null}
                    </dt>
                    <dd>{rule.rule}</dd>
                    <dd className="state-source">{rule.source}</dd>
                  </div>
                ))}
              </dl>
            </details>

            <p className="warning-note">
              <strong>Check before you rely on this.</strong> State legislatures
              rewrite these every session — three states dropped off the list for
              2024 and a fourth for 2026 — and two of the ones left re-index their
              thresholds annually. The figures here were read off each state&apos;s
              own publications for tax year 2025, and 2026 where a state has
              published it. <em>Nothing on this page computes a state tax.</em>
            </p>
          </section>
        </div>
      )}

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

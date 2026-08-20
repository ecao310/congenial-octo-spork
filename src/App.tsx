import React, { useState, useMemo } from 'react';
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
  taxableSocialSecurity,
  muniInterestEffect,
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
import { statesTaxingSocialSecurity } from './utils/stateTax';
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

const FILING_STATUS_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
];

/** How each status reads inside a sentence. */
const FILING_STATUS_PROSE: Record<FilingStatus, string> = {
  single: 'a single filer',
  mfj: 'a married couple filing jointly',
  mfs: 'a married filer filing separately who lived with their spouse',
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

/** Premiums are quoted to the cent, unlike every other figure in the app. */
const formatCurrencyCents = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);

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
    irmaaMagi({ ordinaryIncome: point.income, ssBenefit, ltcg: 0, filingStatus, muniInterest }),
    { filingStatus, beneficiaries, year },
  );
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        Other income {formatCurrency(point.income)} · Total income {formatCurrency(point.income + ssBenefit)}
      </div>
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

const App: React.FC = () => {
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

  const statesTaxing = statesTaxingSocialSecurity(year);
  const yearParams = taxYearParams(year);
  const yearFiling = filingParams(year, filingStatus);

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
    setYear(next);
  };

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;
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
        year,
      }) >
      phaseoutEnd;

  const curve = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest, year },
        { maxIncome: MAX_INCOME, step: 250 },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, year],
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
        { ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, year },
        { maxLTCG: MAX_LTCG, step: 250 },
      ),
    [ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest, year],
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
        year,
      }),
    [muniInterest, ordinaryIncome, ssBenefit, plannedLtcg, filingStatus, seniors, year],
  );

  // Medicare is per enrollee, so a joint return with both spouses over 65 pays
  // every surcharge twice off one MAGI figure. Below 65 nobody is enrolled yet,
  // but the two-year lookback means this year's income still sets the first
  // premium they will see — so price one enrollee rather than none.
  const beneficiaries = filingStatus === 'mfj' && seniors === 2 ? 2 : 1;

  const cliffs = useMemo(
    () => irmaaCliffs({ ssBenefit, filingStatus, muniInterest, beneficiaries, year }),
    [ssBenefit, filingStatus, muniInterest, beneficiaries, year],
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
  });
  const irmaa = irmaaFor(scenarioMagi, { filingStatus, beneficiaries, year });

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

  return (
    <div className="card">
      <h1>Marginal Tax Rate</h1>
      <p className="subtitle">
        Federal marginal rate on the next dollar of other income for{' '}
        {FILING_STATUS_PROSE[filingStatus]} ({year} brackets, standard
        deduction),
        with Social Security taxed under the 50%/85% provisional-income rules.
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
                onChange={() => setFilingStatus(value)}
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
              treats you as unmarried — use Single instead. The brackets and
              standard deduction are identical up to $375,800 of taxable income.
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
          (the sliders further down) plus the{' '}
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
            Move the slider above to price it. Tax-exempt interest cannot land in
            taxable income itself, so the only line it can move is Social
            Security — which is exactly why the cost is so easy to miss.
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
          Flipping this slider on and off is the cleanest way to see the torpedo
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
              The dashed lines on the chart above mark{' '}
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
              No cliff falls inside the chart above: the first one needs{' '}
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
            {beneficiaries > 1 ? 'both of you' : 'one enrollee'}.
          </caption>
          <thead>
            <tr>
              <th scope="col">MAGI (single)</th>
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
          Nearly all of them start from the same number the chart above produces
          — the federally taxable share of the benefit — and then subtract,
          exempt or credit it back under an income test of their own. Montana
          does not even do that: it takes the federal figure and stops, so the
          torpedo arrives at full size. That makes the table below a lookup, not
          a calculation — no two of these rules have the same shape, and a wrong
          computation would be worse than an accurate pointer.
        </p>

        <table className="state-table">
          <caption>
            Rules and figures for tax year {year}, from each state&apos;s own
            statute or revenue department. AGI means federal adjusted gross
            income unless the rule says otherwise.
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
                <td>{rule.test[year]}</td>
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
            {formatCurrency(phaseoutEnd)} — exactly $100,000 later, for both
            filing statuses, because a couple where both spouses qualify has
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


      {/* ───── Roth Conversion Sizing ───── */}
      <section className="explainer" aria-labelledby="roth-sizing-heading">
        <h2 id="roth-sizing-heading" className="section-heading-emerald">
          Roth conversion sizing
        </h2>
        <p>
          A Roth conversion is ordinary income in the year you make it, so it
          moves every line the torpedo depends on at once. Pick the ceiling you
          want to stay under and this sizes the largest conversion that still
          fits beneath it, using the ordinary income and Social Security benefit
          set above.
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
              project. The other two statuses have somewhere to climb from.
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
            tier is on the conversion menu above but not on this one: its
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

import React, { useState, useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  marginalRateCurve,
  ltcgMarginalRateCurve,
  MAX_ANNUAL_SS_BENEFIT,
  AVG_ANNUAL_SS_BENEFIT,
  FILING_PARAMS,
  FilingStatus,
  segmentCurve,
  conversionCeilings,
  sizeConversion,
  CONVERSION_MEASURE_LABELS,
  ADDITIONAL_STD_DEDUCTION_65,
  standardDeductionFor,
  taxableSocialSecurity,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  seniorDeductionPhaseoutEnd,
} from './utils/tax';
import type {
  LTCGMarginalRatePoint,
  MarginalRatePoint,
  CurveSegment,
  ConversionCeilingId,
} from './utils/tax';

const MAX_INCOME = 150_000;
const MAX_LTCG = 200_000;
const DEFAULT_ORDINARY_INCOME = 30_000;
const MAX_CONVERSION = 1_000_000;

const FILING_STATUS_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
];

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
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  ssBenefit,
  segments,
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const segment = segments.find(
    (seg) => point.income >= seg.start && point.income <= seg.end,
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
  const [ssBenefit, setSsBenefit] = useState<number>(AVG_ANNUAL_SS_BENEFIT);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(DEFAULT_ORDINARY_INCOME);
  const [plannedLtcg, setPlannedLtcg] = useState<number>(0);
  const [ceilingId, setCeilingId] = useState<ConversionCeilingId>('bracket12');
  const [isSenior, setIsSenior] = useState<boolean>(false);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(false);

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;
  const baseDeduction = FILING_PARAMS[filingStatus].standardDeduction;
  const standardDeduction = standardDeductionFor(filingStatus, seniors);
  const seniorAddition = standardDeduction - baseDeduction;

  // The OBBBA senior deduction, before its phaseout eats into it.
  const seniorDeductionMax = seniors * SENIOR_DEDUCTION;
  const phaseoutStart = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  // With the age toggle off there is nothing to phase out, but the explainer
  // still needs a rate to talk about, so describe one qualifying person.
  const phaseoutRate = SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(1, seniors);
  const taxableIncomePerDollar = 1 + phaseoutRate;
  // Whether the far side of the phaseout is inside the chart's x-axis depends on
  // how much of the benefit is taxable, so work it out rather than guess.
  const phaseoutEndsOnChart =
    MAX_INCOME + taxableSocialSecurity(ssBenefit, MAX_INCOME, filingStatus) >
    phaseoutEnd;

  const curve = useMemo(
    () => marginalRateCurve(ssBenefit, MAX_INCOME, 250, filingStatus, seniors),
    [ssBenefit, filingStatus, seniors],
  );

  const segments = useMemo(
    () => segmentCurve(curve, (p) => p.income),
    [curve],
  );

  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];

  const ltcgCurve = useMemo(
    () =>
      ltcgMarginalRateCurve(ssBenefit, ordinaryIncome, MAX_LTCG, 250, filingStatus, seniors),
    [ssBenefit, ordinaryIncome, filingStatus, seniors],
  );

  const ltcgSegments = useMemo(
    () => segmentCurve(ltcgCurve, (p) => p.ltcg),
    [ltcgCurve],
  );

  const ceilings = useMemo(() => conversionCeilings(filingStatus), [filingStatus]);

  const sizing = useMemo(() => {
    const ceiling = ceilings.find((c) => c.id === ceilingId) ?? ceilings[0];
    return sizeConversion(
      ceiling,
      ordinaryIncome,
      ssBenefit,
      plannedLtcg,
      filingStatus,
      seniors,
      MAX_CONVERSION,
    );
  }, [ceilings, ceilingId, ordinaryIncome, ssBenefit, plannedLtcg, filingStatus, seniors]);

  const measureLabel = CONVERSION_MEASURE_LABELS[sizing.ceiling.measure];

  return (
    <div className="card">
      <h1>Marginal Tax Rate</h1>
      <p className="subtitle">
        Federal marginal rate on the next dollar of other income for{' '}
        {filingStatus === 'single'
          ? 'a single filer'
          : 'a married couple filing jointly'}{' '}
        (2025 brackets, standard deduction), with Social Security taxed under
        the 50%/85% provisional-income rules.
      </p>

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
            : `. Turning 65 adds ${formatCurrency(ADDITIONAL_STD_DEDUCTION_65[filingStatus])}${
                filingStatus === 'mfj' ? ' per qualifying spouse' : ''
              }.`}{' '}
          The addition widens the 0%-rate valley to the left of the torpedo:
          taxable income stays at zero for that much longer, so the whole curve
          shifts right.
        </p>
        <p className="field-note">
          {seniors > 0 ? (
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
          max={MAX_ANNUAL_SS_BENEFIT}
          step={12}
          value={ssBenefit}
          onChange={(e) => setSsBenefit(Number(e.target.value))}
        />
        <div className="slider-range-labels">
          <span>$0</span>
          <span>{formatCurrency(AVG_ANNUAL_SS_BENEFIT)} (2025 avg)</span>
          <span>{formatCurrency(MAX_ANNUAL_SS_BENEFIT)} (2025 max)</span>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
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
              content={<CustomTooltip ssBenefit={ssBenefit} segments={segments} />}
            />
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
      </p>

      <details className="explainer">
        <summary>
          <h2 id="tax-torpedo-heading">What is the tax torpedo?</h2>
        </summary>
        <div className="explainer-content">
          <p>
            Social Security benefits are not taxed dollar-for-dollar. The taxable
            share depends on <strong>provisional income</strong> — other income
            plus half of your benefits. Once provisional income passes{' '}
            {formatCurrency(ssBase50)}, each extra dollar of other income also
            drags up to 50&cent; of benefits into taxable income; past{' '}
            {formatCurrency(ssBase85)}, it drags in up to 85&cent;. (The
            thresholds shown are for the filing status selected above.)
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

import React, { useState, useMemo } from 'react';
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
  partBSurchargeMonthly,
  IRMAA_TIERS,
  IRMAA_FIRST_CLIFF_MAGI,
  IRMAA_MAGI_YEAR,
  IRMAA_PREMIUM_YEAR,
  IRMAA_LOOKBACK_YEARS,
  PART_B_STANDARD_PREMIUM,
} from './utils/tax';
import type {
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
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  ssBenefit,
  segments,
  filingStatus = 'single',
  muniInterest = 0,
  beneficiaries = 1,
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
    { filingStatus, beneficiaries },
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

const App: React.FC = () => {
  const [ssBenefit, setSsBenefit] = useState<number>(AVG_ANNUAL_SS_BENEFIT);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(DEFAULT_ORDINARY_INCOME);
  const [plannedLtcg, setPlannedLtcg] = useState<number>(0);
  const [ceilingId, setCeilingId] = useState<ConversionCeilingId>('bracket12');
  const [isSenior, setIsSenior] = useState<boolean>(false);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(false);
  const [muniInterest, setMuniInterest] = useState<number>(0);

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;
  const baseDeduction = FILING_PARAMS[filingStatus].standardDeduction;
  const standardDeduction = standardDeductionFor({ filingStatus, seniors });
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
      }) >
      phaseoutEnd;

  const curve = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest },
        { maxIncome: MAX_INCOME, step: 250 },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest],
  );

  const segments = useMemo(
    () => segmentCurve(curve, (p) => p.income),
    [curve],
  );

  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];

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
  });

  const ltcgCurve = useMemo(
    () =>
      ltcgMarginalRateCurve(
        { ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest },
        { maxLTCG: MAX_LTCG, step: 250 },
      ),
    [ssBenefit, ordinaryIncome, filingStatus, seniors, muniInterest],
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
      {
        ordinaryIncome,
        ssBenefit,
        ltcg: plannedLtcg,
        filingStatus,
        seniors,
        muniInterest,
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
      }),
    [muniInterest, ordinaryIncome, ssBenefit, plannedLtcg, filingStatus, seniors],
  );

  // Medicare is per enrollee, so a joint return with both spouses over 65 pays
  // every surcharge twice off one MAGI figure. Below 65 nobody is enrolled yet,
  // but the two-year lookback means this year's income still sets the first
  // premium they will see — so price one enrollee rather than none.
  const beneficiaries = filingStatus === 'mfj' && seniors === 2 ? 2 : 1;

  const cliffs = useMemo(
    () => irmaaCliffs({ ssBenefit, filingStatus, muniInterest, beneficiaries }),
    [ssBenefit, filingStatus, muniInterest, beneficiaries],
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
  const irmaa = irmaaFor(scenarioMagi, { filingStatus, beneficiaries });

  const measureLabel = CONVERSION_MEASURE_LABELS[sizing.ceiling.measure];

  return (
    <div className="card">
      <h1>Marginal Tax Rate</h1>
      <p className="subtitle">
        Federal marginal rate on the next dollar of other income for{' '}
        {FILING_STATUS_PROSE[filingStatus]} (2025 brackets, standard deduction),
        with Social Security taxed under the 50%/85% provisional-income rules.
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
            : `. Turning 65 adds ${formatCurrency(ADDITIONAL_STD_DEDUCTION_65[filingStatus])}${
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
                ? `standard ${formatCurrencyCents(PART_B_STANDARD_PREMIUM)} Part B premium only`
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
                PART_B_STANDARD_PREMIUM,
              )} Part B premium, and it is not included in any of the federal tax figures elsewhere on this page.`}
        </p>

        <table className="tier-table">
          <caption>
            {IRMAA_PREMIUM_YEAR} premiums, set by {IRMAA_MAGI_YEAR} MAGI. Per
            person enrolled; the annual column is for{' '}
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
            {IRMAA_TIERS.map((tier) => {
              const annual =
                (partBSurchargeMonthly(tier) + tier.partDSurchargeMonthly) *
                12 *
                beneficiaries;
              const range = (status: FilingStatus): string => {
                // Tier 0 runs up to whichever tier the status actually reaches
                // first, which is the fourth one on a separate return.
                if (tier.tier === 0)
                  return `Up to ${formatCurrency(IRMAA_FIRST_CLIFF_MAGI[status])}`;
                const floor = tier.magiOver[status];
                // Infinity marks a tier this status has no access to at all.
                if (!Number.isFinite(floor)) return '\u2014';
                // The separate-return top tier is the one inclusive threshold
                // in the statute: "equal to or greater than", not "over".
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
          {IRMAA_LOOKBACK_YEARS}-year lag: the {IRMAA_PREMIUM_YEAR} premiums in
          the table are set by {IRMAA_MAGI_YEAR} MAGI, so the income on this
          chart is really setting the premium for{' '}
          {IRMAA_PREMIUM_YEAR + IRMAA_LOOKBACK_YEARS}, under a schedule CMS has
          not published yet. Treat the lines as where the cliffs would fall at
          today&apos;s thresholds, not as a bill. The lag cuts both ways: a Roth
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
                {formatCurrency(FILING_PARAMS.mfj.ssBase50)} and{' '}
                {formatCurrency(FILING_PARAMS.mfj.ssBase85)} thresholds, the{' '}
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

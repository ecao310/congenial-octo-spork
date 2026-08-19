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
} from './utils/tax';
import type { LTCGMarginalRatePoint } from './utils/tax';

const MAX_INCOME = 150_000;
const MAX_LTCG = 200_000;
const DEFAULT_ORDINARY_INCOME = 30_000;

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
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  ssBenefit,
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
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
    </div>
  );
};

interface LTCGTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LTCGMarginalRatePoint }>;
  ordinaryIncome: number;
  ssBenefit: number;
}

const LTCGTooltip: React.FC<LTCGTooltipProps> = ({
  active,
  payload,
  ordinaryIncome,
  ssBenefit,
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
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
    </div>
  );
};

const App: React.FC = () => {
  const [ssBenefit, setSsBenefit] = useState<number>(AVG_ANNUAL_SS_BENEFIT);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(DEFAULT_ORDINARY_INCOME);

  const curve = useMemo(
    () => marginalRateCurve(ssBenefit, MAX_INCOME, 250, filingStatus),
    [ssBenefit, filingStatus],
  );

  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];

  const ltcgCurve = useMemo(
    () => ltcgMarginalRateCurve(ssBenefit, ordinaryIncome, MAX_LTCG, 250, filingStatus),
    [ssBenefit, ordinaryIncome, filingStatus],
  );

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
              content={<CustomTooltip ssBenefit={ssBenefit} />}
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

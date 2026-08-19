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
  MAX_ANNUAL_SS_BENEFIT,
  AVG_ANNUAL_SS_BENEFIT,
  FILING_PARAMS,
  FilingStatus,
} from './utils/tax';

const MAX_INCOME = 150_000;

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

const App: React.FC = () => {
  const [ssBenefit, setSsBenefit] = useState<number>(AVG_ANNUAL_SS_BENEFIT);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');

  const curve = useMemo(
    () => marginalRateCurve(ssBenefit, MAX_INCOME, 250, filingStatus),
    [ssBenefit, filingStatus],
  );

  const { ssBase50, ssBase85 } = FILING_PARAMS[filingStatus];

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
          <span>{formatCurrency(MAX_ANNUAL_SS_BENEFIT)} (2025 max)</span>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            syncId="income"
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
              tick={false}
              tickLine={false}
              height={10}
              stroke="#94a3b8"
            />
            <YAxis
              stroke="#94a3b8"
              tickFormatter={(value) => `${value}%`}
              width={70}
              domain={[0, 'auto']}
            />
            <Tooltip
              formatter={(value) => [`${Number(value)}%`, 'Marginal Rate']}
              labelFormatter={(income) => `Other income ${formatCurrency(Number(income))}`}
              contentStyle={TOOLTIP_STYLE}
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

      <h2 className="chart-panel-title" id="total-tax-panel-title">
        Total Federal Tax Paid
      </h2>
      <div className="chart-container chart-container--tax">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            syncId="income"
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="taxGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ea580c" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis
              dataKey="income"
              type="number"
              domain={[0, MAX_INCOME]}
              tickFormatter={formatCompact}
              stroke="#94a3b8"
              label={{
                value: 'Other Income ($)',
                position: 'insideBottom',
                offset: -5,
                fill: '#94a3b8',
              }}
            />
            <YAxis
              stroke="#94a3b8"
              tickFormatter={(value) => `$${formatCompact(Number(value))}`}
              width={70}
              domain={[0, 'auto']}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), 'Total Federal Tax']}
              labelFormatter={(income) => `Other income ${formatCurrency(Number(income))}`}
              contentStyle={TOOLTIP_STYLE}
            />
            <Area
              type="linear"
              dataKey="totalTax"
              stroke="#ea580c"
              strokeWidth={2}
              fill="url(#taxGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <section className="explainer" aria-labelledby="tax-torpedo-heading">
        <h2 id="tax-torpedo-heading">What is the tax torpedo?</h2>
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
      </section>

      <section className="explainer" aria-labelledby="torpedo-strategies-heading">
        <h2 id="torpedo-strategies-heading">How to mitigate the tax torpedo</h2>
        <p>
          The torpedo is driven entirely by provisional income, so every
          strategy comes down to the same idea: in the years you collect
          benefits, meet your spending with dollars that add little or nothing
          to provisional income.
        </p>
        <ul>
          <li>
            <strong>Spend from Roth accounts.</strong> Qualified withdrawals
            from a Roth IRA or Roth 401(k) are excluded from provisional income
            entirely, so a dollar of Roth spending never drags benefits into
            taxable income. Converting traditional balances to Roth in
            low-income years — for example, after retiring but before claiming
            benefits — pre-pays the tax outside the torpedo zone and shrinks
            the future required minimum distributions that push many retirees
            into it.
          </li>
          <li>
            <strong>Spend from taxable accounts.</strong> Selling from a
            taxable brokerage account adds only the gain to provisional income;
            the return of your own cost basis is tax-free. Mind the fine print,
            though: long-term capital gains and qualified dividends count
            toward provisional income in full, even when they fall in the 0%
            capital-gains bracket.
          </li>
          <li>
            <strong>Delay benefits and draw pre-tax accounts first.</strong>{' '}
            Spending from traditional IRAs and 401(k)s in the gap years before
            claiming at 70 funds the delay, and the smaller remaining balance
            means smaller required distributions landing on top of benefits
            later. A larger, delayed benefit is still at most 85% taxable.
          </li>
          <li>
            <strong>Give from an IRA.</strong> After age 70½, a qualified
            charitable distribution sends money straight from a traditional IRA
            to charity: it counts toward required minimum distributions but
            never appears in adjusted gross income or provisional income (up to
            $108,000 per person in 2025).
          </li>
          <li>
            <strong>Don&apos;t hide in municipal bonds.</strong> Tax-exempt
            interest is added back when computing provisional income, so
            shifting savings into munis does not steer around the torpedo.
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
          None of this is tax advice — the right mix depends on account
          balances, state taxes, Medicare premium surcharges, and more. But the
          chart above makes the goal concrete: keep provisional income out of
          the spike, or jump clean over it.
        </p>
      </section>
    </div>
  );
};

export default App;

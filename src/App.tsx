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
import { marginalRateCurve } from './utils/tax';

const MAX_INCOME = 150_000;

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

const App: React.FC = () => {
  const [ssBenefit, setSsBenefit] = useState<number>(24000);

  const curve = useMemo(
    () => marginalRateCurve(ssBenefit, MAX_INCOME),
    [ssBenefit],
  );

  return (
    <div className="card">
      <h1>Marginal Tax Rate</h1>
      <p className="subtitle">
        Federal marginal rate on the next dollar of other income for a single
        filer (2025 brackets, standard deduction), with Social Security taxed
        under the 50%/85% provisional-income rules.
      </p>

      <div className="input-group">
        <label htmlFor="ss-benefit">Annual Social Security Benefit ($)</label>
        <input
          id="ss-benefit"
          type="number"
          min={0}
          step={1000}
          value={ssBenefit}
          onChange={(e) => setSsBenefit(Math.max(0, Number(e.target.value)))}
        />
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
              label={{
                value: 'Other Income ($)',
                position: 'insideBottom',
                offset: -5,
                fill: '#94a3b8',
              }}
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
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
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
    </div>
  );
};

export default App;

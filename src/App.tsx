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
import { projectGrowth } from './utils/growth';

const ANNUAL_RATE = 0.07;
const YEARS = 30;

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
  const [initialAmount, setInitialAmount] = useState<number>(10000);

  const projection = useMemo(
    () => projectGrowth(initialAmount, ANNUAL_RATE, YEARS),
    [initialAmount],
  );

  return (
    <div className="card">
      <h1>Growth Projector</h1>
      <p className="subtitle">
        See how an amount grows at {ANNUAL_RATE * 100}% per year over {YEARS} years.
      </p>

      <div className="input-group">
        <label htmlFor="initial-amount">Initial Amount ($)</label>
        <input
          id="initial-amount"
          type="number"
          min={0}
          step={1000}
          value={initialAmount}
          onChange={(e) => setInitialAmount(Math.max(0, Number(e.target.value)))}
        />
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={projection} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis
              dataKey="year"
              stroke="#94a3b8"
              label={{ value: 'Year', position: 'insideBottom', offset: -5, fill: '#94a3b8' }}
            />
            <YAxis stroke="#94a3b8" tickFormatter={formatCompact} width={70} />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), 'Balance']}
              labelFormatter={(year) => `Year ${year}`}
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#38bdf8"
              strokeWidth={2}
              fill="url(#balanceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default App;

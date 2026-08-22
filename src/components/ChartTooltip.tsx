import { defaultTaxYear, irmaaFor, irmaaMagi, totalIncomeFor } from '../lib/tax';
import type { FilingStatus, TaxYear } from '../lib/tax';
import { formatCurrency } from '../lib/format';
import { PALETTE } from '../styles/palette';

interface TooltipPayloadPoint {
  income: number;
  marginalRate: number;
  totalTax: number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TooltipPayloadPoint }>;
  ssBenefit: number;
  filingStatus?: FilingStatus;
  muniInterest?: number;
  /** How many people on the return are enrolled in Medicare. */
  beneficiaries?: number;
  /** Which year's premium schedule prices the IRMAA line. */
  year?: TaxYear;
}

/**
 * What one point on the curve is worth: the income that makes it, the rate on
 * the next dollar there, the year's federal tax, and the Medicare surcharge.
 *
 * Four figures and no advice. It used to close with "stay under $x or over
 * $y" on a hill and "fill this valley" here on a valley, but that is a
 * recommendation about wherever a mouse happened to land — nobody's point in
 * particular, and no point at all on a touchscreen. Nothing here recommends a
 * move any more; the readout under the slider says where the reader is
 * standing and stops.
 *
 * The two cliff figures went the same way. "$x of MAGI to the next cliff" and
 * "$y of household income to the 400% poverty line" are distances, and a
 * distance is only worth reading from where you are standing: both are in the
 * close, keyed to the slider, in `Medicare surcharge` and in the poverty-line
 * explainer's "You are here". What stays here is what a hover is actually
 * good for — the surcharge and tier *at this point*, which no other reading of
 * the return can give you.
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  ssBenefit,
  filingStatus = 'single',
  muniInterest = 0,
  beneficiaries = 1,
  year = defaultTaxYear(),
}) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  // The hovered point, as a whole return, so that every figure below is priced
  // off one object rather than off a different subset of the props each time.
  const scenario = {
    ordinaryIncome: point.income,
    ssBenefit,
    filingStatus,
    muniInterest,
    year,
  };
  // Medicare reads a wider MAGI than the tax chain does — tax-exempt interest
  // is added back — so it has to be recomputed here rather than read off the
  // curve, which only carries taxable figures.
  const irmaa = irmaaFor(irmaaMagi(scenario), {
    filingStatus,
    beneficiaries,
    year,
  });
  // Not `point.income + ssBenefit`: tax-exempt interest is spent like any
  // other dollar, so it belongs in what this return takes in too. See
  // `totalIncomeFor`. Which is why the head below has to name the interest as
  // well: it quotes the total and then takes it apart, and a decomposition
  // that leaves out a term the total contains is an addition the reader can
  // watch fail.
  const totalIncome = totalIncomeFor(scenario);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-head">
        Total income {formatCurrency(totalIncome)} · {formatCurrency(ssBenefit)}{' '}
        SS
        {muniInterest > 0
          ? ` + ${formatCurrency(muniInterest)} tax-exempt`
          : ''}{' '}
        + {formatCurrency(point.income)} other income
      </div>
      <div>
        Marginal Rate: <strong style={{ color: PALETTE.accent }}>{point.marginalRate}%</strong>
      </div>
      <div>
        Total Federal Tax: <strong style={{ color: PALETTE.orange }}>{formatCurrency(point.totalTax)}</strong>
      </div>
      <div>
        Medicare IRMAA:{' '}
        <strong style={{ color: PALETTE.roseBright }}>
          {formatCurrency(irmaa.annualSurcharge)}/yr
        </strong>
        {irmaa.tier > 0 ? ` (tier ${irmaa.tier} of 5)` : ''}
      </div>
    </div>
  );
};

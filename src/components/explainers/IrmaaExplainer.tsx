import { IRMAA_LOOKBACK_YEARS, irmaaMagiYear } from '../../lib/tax';
import type { TaxYear } from '../../lib/tax';
import { formatCurrency } from '../../lib/format';

export interface IrmaaExplainerProps {
  /** The jump at the first cliff this return can reach, in dollars a year. */
  firstCliffStep: number;
  beneficiaries: number;
  muniInterest: number;
  year: TaxYear;
}

/** What Medicare charges above a MAGI threshold, and when it charges it. */
export const IrmaaExplainer: React.FC<IrmaaExplainerProps> = ({
  firstCliffStep,
  beneficiaries,
  muniInterest,
  year,
}) => (
  <details className="explainer">
    <summary>
      <h3 id="irmaa-cliffs-heading">Medicare&apos;s IRMAA cliffs</h3>
    </summary>
    <div className="explainer-content">
      <p>
        Above a MAGI threshold, Medicare adds an{' '}
        <strong>income-related monthly adjustment amount</strong> to the
        Part B and Part D premiums of everyone on the return who is
        enrolled. Unlike the torpedo, it is not a phase-in: one dollar over
        a threshold triggers the whole surcharge for twelve months. The
        chart above prices your own tier on hover and will draw the
        thresholds as red dashed lines if you ask it to, under{' '}
        <strong>Breakpoints</strong> in the corner of the plot. The
        first cliff this return
        can reach costs{' '}
        <strong>{formatCurrency(firstCliffStep)}</strong> a year
        {beneficiaries > 1 ? ' for the two of you' : ''} &mdash; on a single
        dollar of income.
      </p>
      <p>
        The lines sit at less other income than their MAGI figures suggest,
        because the benefits the torpedo drags into AGI get there first
        {muniInterest > 0
          ? `, and because Medicare's MAGI is wider than the tax code's — the ${formatCurrency(muniInterest)} of tax-exempt interest set above is added straight back in, moving every line ${formatCurrency(muniInterest)} further left`
          : '. Medicare’s MAGI is also wider than the tax code’s: tax-exempt interest is added straight back in, so muni bonds move these lines as well as the torpedo'}
        .
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
        The surcharge never appears on a tax return, so nothing about the filing reveals that one
        dollar of income cost {formatCurrency(firstCliffStep)}.
      </p>
    </div>
  </details>
);

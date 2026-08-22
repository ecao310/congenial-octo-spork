import {
  SS_BASE50_ENACTED,
  SS_BASE85_ENACTED,
  SS_BASES,
} from '../../lib/tax';
import type { FilingStatus } from '../../lib/tax';
import { formatCurrency } from '../../lib/format';

/** What the torpedo is, and why the thresholds that make it never move. */
export const TorpedoExplainer: React.FC<{ filingStatus: FilingStatus }> = ({
  filingStatus,
}) => {
  // Never read off the tax year: IRC 86(c) has never been indexed. See SS_BASES.
  const { ssBase50, ssBase85 } = SS_BASES[filingStatus];
  return (
    <details className="explainer">
      <summary>
        <h3 id="tax-torpedo-heading">What is the tax torpedo?</h3>
      </summary>
      <div className="explainer-content">
        <p>
          Social Security benefits are not taxed dollar-for-dollar. The taxable
          share depends on <strong>provisional income</strong> — other income
          plus half of your social security benefit. Once provisional income passes{' '}
          {formatCurrency(ssBase50)}, each extra dollar of other income also
          drags up to 50&cent; of benefits into taxable income; past{' '}
          {formatCurrency(ssBase85)}, it drags in up to 85&cent;.
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
          range.
        </p>
        <p>
          {/* What the two-button year selector used to demonstrate, said
              once instead of shown to whoever thought to click twice and
              compare. It is the reason any of this is worth drawing, so it
              does not belong behind a control. */}
          <strong>The thresholds have not moved since they were
            written.</strong> IRC 86(c) set{' '}
          {formatCurrency(SS_BASES.single.ssBase50)} and{' '}
          {formatCurrency(SS_BASES.mfj.ssBase50)} in {SS_BASE50_ENACTED},
          and {formatCurrency(SS_BASES.single.ssBase85)} and{' '}
          {formatCurrency(SS_BASES.mfj.ssBase85)} in {SS_BASE85_ENACTED}.
          Neither has ever been indexed. Everything around them is: the
          brackets, the standard deduction, the capital-gain bands, and the
          benefit itself, which takes a cost-of-living raise every January.
          So a retirement that has not changed at all in real terms sits
          further past the same line every year.
        </p>
      </div>
    </details>
  );
};

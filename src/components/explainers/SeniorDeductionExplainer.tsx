import {
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
} from '../../lib/tax';
import { formatCents, formatCurrency, formatPercent } from '../../lib/format';

export interface SeniorDeductionExplainerProps {
  /** MAGI at which each qualifying person's $6,000 starts shrinking. */
  phaseoutStart: number;
  /** MAGI at which it is gone. */
  phaseoutEnd: number;
  /** 6% per qualifying person: 12% on a joint return where both qualify. */
  phaseoutRate: number;
}

/**
 * The second hump on the same axis, and the one that appears on no rate
 * schedule: inside the phaseout every dollar earned also destroys deduction.
 */
export const SeniorDeductionExplainer: React.FC<SeniorDeductionExplainerProps> = ({
  phaseoutStart,
  phaseoutEnd,
  phaseoutRate,
}) => {
  const taxableIncomePerDollar = 1 + phaseoutRate;
  return (
    <details className="explainer">
      <summary>
        <h3 id="senior-deduction-heading">
          The senior deduction phaseout ({SENIOR_DEDUCTION_FIRST_YEAR}&ndash;
          {SENIOR_DEDUCTION_LAST_YEAR})
        </h3>
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
          {formatCurrency(phaseoutEnd)}.
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
          <strong>{formatPercent(0.22 * 1.85 * taxableIncomePerDollar)}</strong>
          .
        </p>
        <p>
          On the chart above, the second hump starts where MAGI clears{' '}
          {formatCurrency(phaseoutStart)}.
          The rate falls back once the deduction is fully gone at{' '}
          {formatCurrency(phaseoutEnd)} of MAGI. Note that tax-exempt interest
          is <em>not</em> added back for this
          phaseout, unlike the MAGI Medicare uses for IRMAA.
        </p>
      </div>
    </details>
  );
};

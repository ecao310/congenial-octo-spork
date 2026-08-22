/**
 * What to do about it, in three bullets and a caveat.
 *
 * The only disclosure here that takes no figures from the return: every claim
 * in it is about the shape of the curve rather than about where on the curve
 * this reader is standing, so nothing in it moves when a slider does.
 */
export const MitigationExplainer: React.FC = () => (
  <details className="explainer">
    <summary>
      <h3 id="torpedo-strategies-heading">How to mitigate the tax torpedo</h3>
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
          <strong>If you can&apos;t stay under it, blast past it.</strong> Once
          the 85% cap is reached, extra income is taxed at plain bracket
          rates again. Bunching income — say, one large Roth conversion —
          into a single year can cost less than sitting in the middle of the
          spike year after year.
        </li>
      </ul>
      <p>
        The right mix depends on account balances, Medicare premium
        surcharges, and more. The goal itself is concrete: keep
        provisional income out of the spike, or jump clean over it.
      </p>
    </div>
  </details>
);

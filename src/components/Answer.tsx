import { IRMAA_LOOKBACK_YEARS } from '../lib/tax';
import type { FilingStatus, IrmaaAssessment, TaxYear } from '../lib/tax';
import { formatCurrency, formatPercent } from '../lib/format';
import { FILING_STATUS_PROSE } from '../lib/returnProse';
import type { CopyState } from '../hooks/useScenarioAddress';

export interface AnswerProps {
  year: TaxYear;
  filingStatus: FilingStatus;
  ageProse: string;
  ssBenefit: number;
  ordinaryIncome: number;
  muniInterest: number;
  totalIncome: number;
  /** The year's federal tax at the reader's own point on the curve. */
  tax: number;
  /** The rate on the next dollar there, or null below the curve's first sample. */
  marginalRate: number | null;
  /** How much of the benefit 86(a) actually taxes. */
  taxableSS: number;
  irmaa: IrmaaAssessment;
  canCopy: boolean;
  copyState: CopyState;
  onCopy: () => void;
}

/**
 * The close: the reader's own answer, in one place.
 *
 * The mirror of the recap that closes step 1. That one names what was set;
 * this one says what came of it — and it is the first place the six figures a
 * reader actually leaves with sit together rather than one per step.
 *
 * Outside step 2 rather than at the foot of it, because it summarises both
 * steps and belongs to neither, and last before the disclaimer because it is
 * the thing a reader would screenshot. That is also why it restates the return
 * above the figures: a screenshot of an answer with no question in it is worth
 * nothing.
 */
export const Answer: React.FC<AnswerProps> = ({
  year,
  filingStatus,
  ageProse,
  ssBenefit,
  ordinaryIncome,
  muniInterest,
  totalIncome,
  tax,
  marginalRate,
  taxableSS,
  irmaa,
  canCopy,
  copyState,
  onCopy,
}) => (
  <section className="answer" id="answer" aria-labelledby="answer-heading">
    <p className="answer-kicker">The answer</p>
    <h2 className="answer-heading" id="answer-heading">
      What this return costs
    </h2>
    <p className="answer-intro">
      Priced for {year}: {FILING_STATUS_PROSE[filingStatus]}, {ageProse},
      with{' '}
      {ssBenefit > 0
        ? `${formatCurrency(ssBenefit)} of Social Security`
        : 'no Social Security'}{' '}
      and {formatCurrency(ordinaryIncome)} of other income
      {muniInterest > 0
        ? `, plus ${formatCurrency(muniInterest)} of tax-exempt interest`
        : ''}
      .
    </p>

    <dl className="answer-figures">
      <div className="answer-figure">
        <dt>Total income</dt>
        <dd>
          <strong>{formatCurrency(totalIncome)}</strong>
          <span className="answer-gloss">
            Social security plus other income
            {muniInterest > 0
              ? `, plus ${formatCurrency(muniInterest)} of tax-exempt interest`
              : ''}
            .
          </span>
        </dd>
      </div>

      <div className="answer-figure">
        <dt>Federal tax</dt>
        <dd>
          <strong>{formatCurrency(tax)}</strong>
          <span className="answer-gloss">
            What this {year} return owes. Federal only.
          </span>
        </dd>
      </div>

      <div className="answer-figure">
        <dt>Effective rate</dt>
        <dd>
          <strong>
            {totalIncome > 0 ? formatPercent(tax / totalIncome) : '—'}
          </strong>
          <span className="answer-gloss">
            {totalIncome > 0
              ? 'Percentage of total income paid in tax.'
              : 'No tax on no income.'}
          </span>
        </dd>
      </div>

      <div className="answer-figure">
        <dt>Marginal rate</dt>
        <dd>
          <strong>{marginalRate !== null ? `${marginalRate}%` : '—'}</strong>
          <span className="answer-gloss">
            What one more dollar of ordinary income costs.
          </span>
        </dd>
      </div>

      <div className="answer-figure">
        <dt>Taxable social security</dt>
        <dd>
          <strong>
            {ssBenefit > 0
              ? `${formatCurrency(taxableSS)} of ${formatCurrency(ssBenefit)}`
              : 'None'}
          </strong>
          <span className="answer-gloss">
            {ssBenefit > 0
              ? `${formatPercent(taxableSS / ssBenefit)} of it. 86(a) can never make more than 85% taxable.`
              : 'Step 1 sets no benefit, so there is nothing for other income to drag in — the rate follows the ordinary brackets and nothing else.'}
          </span>
        </dd>
      </div>

      <div className="answer-figure">
        <dt>Medicare surcharge</dt>
        <dd>
          <strong>
            {irmaa.tier > 0
              ? `Tier ${irmaa.tier} of 5 — ${formatCurrency(irmaa.annualSurcharge)}/yr`
              : 'None — the standard premium'}
          </strong>
          <span className="answer-gloss">
            Billed on a {IRMAA_LOOKBACK_YEARS}-year lag, so this is what{' '}
            {year} income sets for {year + IRMAA_LOOKBACK_YEARS}.
          </span>
        </dd>
      </div>
    </dl>

    {/* ───── The link is the return ─────

        The address bar has carried the whole return since the query string
        went in, and the only other place it is named is the failure case: the
        note that appears when a link asked for something that could not be
        shown.

        It belongs here rather than in the header, because what is worth
        sending is the answer, and this is the one place the answer sits
        together. The button is the whole of it — the sentence that used to say
        so in prose came off in the text pass — so a browser with no clipboard
        (`canCopy`) is left with nothing here at all. */}
    <div className="answer-share">
      {canCopy && (
        <button type="button" className="answer-share-button" onClick={onCopy}>
          Copy link to this return
        </button>
      )}
      {/* `aria-live` rather than `role="status"`: the same announcement,
          without becoming the second status region on a document whose first
          one is the link note. Rendered empty rather than conditionally,
          because a live region has to be mounted before the message lands in
          it to be read out reliably; CSS hides it while it is. */}
      <p className="answer-share-status" aria-live="polite" aria-atomic="true">
        {copyState === 'copied'
          ? 'Copied. That link opens this page on this return.'
          : copyState === 'failed'
            ? 'This browser would not take the copy. Select the address bar and copy it — it is the same link.'
            : ''}
      </p>
    </div>
  </section>
);

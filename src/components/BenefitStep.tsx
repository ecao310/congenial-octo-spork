import {
  FILING_STATUSES,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  avgAnnualSSBenefit,
  filingParams,
  maxAnnualSSBenefit,
  seniorDeductionPhaseoutEnd,
  standardDeductionFor,
} from '../lib/tax';
import type { FilingStatus, TaxYear } from '../lib/tax';
import { MAX_MUNI_INTEREST } from '../lib/scenarioUrl';
import { formatCents, formatCurrency } from '../lib/format';
import {
  FILING_STATUS_LABELS,
  FILING_STATUS_PROSE,
  advancedInputs,
} from '../lib/returnProse';
import { ProseList } from './ProseList';

export interface BenefitStepProps {
  stepNumber: number;
  stepCount: number;
  year: TaxYear;
  filingStatus: FilingStatus;
  onFilingStatus: (next: FilingStatus) => void;
  isSenior: boolean;
  onSenior: (next: boolean) => void;
  spouseIsSenior: boolean;
  onSpouseSenior: (next: boolean) => void;
  /** How many people on the return have reached 65: 0, 1 or 2. */
  seniors: number;
  ageProse: string;
  ssBenefit: number;
  onSsBenefit: (next: number) => void;
  muniInterest: number;
  onMuniInterest: (next: number) => void;
}

/**
 * Step 1: the return every figure after it prices — who files it, who on it
 * has reached 65, and how much Social Security it collects.
 *
 * The exception that sets the shape of the step below it: with no curve of its
 * own, the return itself stands where the chart stands there, and the benefit
 * slider follows it in the control's place. Tax-exempt interest belongs to no
 * axis and sits in the collapsed block at the end, because it starts at $0 and
 * at $0 leaves every chart identical.
 */
export const BenefitStep: React.FC<BenefitStepProps> = ({
  stepNumber,
  stepCount,
  year,
  filingStatus,
  onFilingStatus,
  isSenior,
  onSenior,
  spouseIsSenior,
  onSpouseSenior,
  seniors,
  ageProse,
  ssBenefit,
  onSsBenefit,
  muniInterest,
  onMuniInterest,
}) => {
  const yearFiling = filingParams(year, filingStatus);
  const baseDeduction = yearFiling.standardDeduction;
  const standardDeduction = standardDeductionFor({ filingStatus, seniors, year });
  const seniorAddition = standardDeduction - baseDeduction;

  // The OBBBA senior deduction, before its phaseout eats into it, and the band
  // it shrinks across. Every status has both ends of a band, so nothing here
  // branches on one.
  const seniorDeductionMax = seniors * SENIOR_DEDUCTION;
  const phaseoutStart = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  // With the age toggle off there is nothing to phase out, but the hint still
  // needs a rate to talk about, so describe one qualifying person.
  const phaseoutRate = SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(1, seniors);

  /**
   * A joint return is the only one that reports two benefits on line 6a, so it
   * is the only one whose slider is a household's rather than a person's. Note
   * that this does not follow the senior checkboxes: whether both spouses are
   * 65 changes the deduction, not who is collecting, and a couple can very
   * easily be one retiree on a benefit and one spouse who is not 65 yet.
   */
  const jointBenefit = filingStatus === 'mfj';
  const benefitSliderMax = maxAnnualSSBenefit(year, filingStatus);
  const benefitAverage = avgAnnualSSBenefit(year, filingStatus);

  const advanced = advancedInputs(muniInterest);

  /**
   * The second sentence of the recap, which exists only when an advanced
   * slider has been moved off $0.
   *
   * A sentence of its own rather than more clauses on the end of the first
   * one. The first sentence describes a filer — a year, a status, an age, a
   * benefit — and this is neither a fact about the filer nor a fifth thing of
   * the same kind; it is a figure a reader went and set by hand, and the point
   * of naming it here is that the section holding it is shut. Ending the filer
   * sentence and starting "Plus" is what says so.
   */
  const advancedClauses = advanced.map(({ label, noun, value }) => ({
    key: label,
    node: (
      <>
        <strong>{formatCurrency(value)}</strong> in {noun}
      </>
    ),
  }));

  return (
    <section
      className="step step-config"
      id="step-benefit"
      tabIndex={-1}
      aria-labelledby="step-benefit-heading"
    >
      <p className="step-kicker">
        Step {stepNumber} of {stepCount}
      </p>
      <h2 className="step-heading" id="step-benefit-heading">
        Your Social Security benefit
      </h2>

      <fieldset className="input-group filing-status">
        <legend>Filing Status</legend>
        <div className="segmented">
          {FILING_STATUSES.map((value) => (
            <label key={value} className="segmented-option">
              <input
                type="radio"
                name="filing-status"
                value={value}
                checked={filingStatus === value}
                onChange={() => onFilingStatus(value)}
              />
              <span>{FILING_STATUS_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="input-group filing-status">
        <legend>Age</legend>
        <div className="checkbox-group hint-anchor">
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={isSenior}
              aria-describedby="senior-deduction-hint"
              onChange={(e) => onSenior(e.target.checked)}
            />
            <span>Age 65 or older</span>
          </label>
          {filingStatus === 'mfj' && (
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={spouseIsSenior}
                disabled={!isSenior}
                aria-describedby="senior-deduction-hint"
                onChange={(e) => onSpouseSenior(e.target.checked)}
              />
              <span>Both spouses are 65 or older</span>
            </label>
          )}
          {/* One bubble for the whole group: both checkboxes describe the same
              two deductions, and a copy per checkbox would just duplicate it. */}
          <div className="hint-bubble" id="senior-deduction-hint" role="tooltip">
            <p className="field-note">
              Standard deduction{' '}
              <strong>{formatCurrency(standardDeduction)}</strong>
              {seniorAddition > 0
                ? ` — ${formatCurrency(baseDeduction)} base plus ${formatCurrency(seniorAddition)} for age 65 or older.`
                : `. Turning 65 adds ${formatCurrency(yearFiling.additionalStdDeduction65)}${filingStatus === 'mfj' ? ' per qualifying spouse' : ''
                }.`}{' '}
              The addition widens the 0%-rate valley to the left of the
              torpedo: taxable income stays at zero for that much longer, so
              the whole curve shifts right.
            </p>
            <p className="field-note">
              {seniors > 0 ? (
                <>
                  Senior deduction{' '}
                  <strong>{formatCurrency(seniorDeductionMax)}</strong>
                  {seniors > 1
                    ? ` (${formatCurrency(SENIOR_DEDUCTION)} per spouse)`
                    : ''}{' '}
                  on top of that, shrinking by {formatCents(phaseoutRate)} per
                  dollar of MAGI above {formatCurrency(phaseoutStart)}
                  {seniors > 1
                    ? ` (${formatCents(SENIOR_DEDUCTION_PHASEOUT_RATE)} for each spouse)`
                    : ''}{' '}
                  and gone at {formatCurrency(phaseoutEnd)}. It expires after
                  tax year {SENIOR_DEDUCTION_LAST_YEAR}.
                </>
              ) : (
                <>
                  Filers 65 or older also get the temporary senior deduction
                  — {formatCurrency(SENIOR_DEDUCTION)} each, for tax years{' '}
                  {SENIOR_DEDUCTION_FIRST_YEAR}&ndash;
                  {SENIOR_DEDUCTION_LAST_YEAR} only.
                </>
              )}
            </p>
          </div>
        </div>
      </fieldset>

      <div className="input-group">
        {/* Where this figure goes on the return: Form 1040, line 6a. */}
        <span className="line-ref" aria-hidden="true">
          6a
        </span>
        <div className="slider-header">
          <label htmlFor="ss-benefit">
            Annual Social Security Benefit
            {jointBenefit ? ' (both spouses)' : ''}
          </label>
          <span className="slider-value">{formatCurrency(ssBenefit)}</span>
        </div>
        <input
          id="ss-benefit"
          type="range"
          min={0}
          max={benefitSliderMax}
          step={12}
          value={ssBenefit}
          onChange={(e) => onSsBenefit(Number(e.target.value))}
        />
        <div className="slider-range-labels">
          <span>$0</span>
          <span>
            {formatCurrency(benefitAverage)} ({year}{' '}
            {jointBenefit ? 'couple avg' : 'avg'})
          </span>
          <span>
            {formatCurrency(benefitSliderMax)} ({year}{' '}
            {jointBenefit ? 'couple max' : 'max'})
          </span>
        </div>
      </div>

      <details className="advanced-inputs">
        <summary>
          {/* Line 2a: tax-exempt interest, which is the one input in here. */}
          <span className="line-ref" aria-hidden="true">
            2a
          </span>
          <span className="advanced-label">Advanced inputs</span>
          {advanced.length > 0 ? (
            <span className="advanced-state advanced-state-set">
              {advanced
                .map(({ label, value }) => `${label} ${formatCurrency(value)}`)
                .join(' · ')}
            </span>
          ) : (
            <span className="advanced-state">At $0</span>
          )}
        </summary>
        <div className="input-group">
          <div className="slider-header">
            <label htmlFor="muni-interest">Tax-Exempt (Municipal) Interest</label>
            <span className="slider-value violet">{formatCurrency(muniInterest)}</span>
          </div>
          <input
            id="muni-interest"
            type="range"
            min={0}
            max={MAX_MUNI_INTEREST}
            step={250}
            value={muniInterest}
            onChange={(e) => onMuniInterest(Number(e.target.value))}
            className="slider-violet"
          />
          <div className="slider-range-labels">
            <span>$0</span>
            <span>{formatCurrency(MAX_MUNI_INTEREST)}</span>
          </div>
          <p className="field-note">
            Municipal bond interest never enters taxable income, but it counts
            toward provisional income dollar for dollar — so it drags benefits
            into the tax base exactly as fast as a paycheck would, and shifts the
            whole curve to the left.
          </p>
        </div>
      </details>

      {/* What this step settled, in one line. The hero used to name the filing
          status and the year; it now says what all this is for, so the return
          being priced is named here instead — at the foot of the column that
          sets it, on the way into the step that spends it.

          "One year's return" rather than the "Everything from here on prices
          one return" it opened with: what a reader wants from a recap is the
          return, and a lead-in that describes where the sentence sits is a fact
          about the layout rather than about the return. */}
      <p className="scenario-recap">
        One year’s return: <strong>{year}</strong> brackets and standard
        deduction, <strong>{FILING_STATUS_PROSE[filingStatus]}</strong>,{' '}
        {ageProse}, collecting{' '}
        {ssBenefit > 0 ? (
          <>
            <strong>{formatCurrency(ssBenefit)}</strong> of Social Security
            per year
          </>
        ) : (
          <>
            <strong>no Social Security</strong> at all
          </>
        )}
        .
        {advancedClauses.length > 0 && (
          <>
            {' '}
            Plus <ProseList items={advancedClauses} />.
          </>
        )}
      </p>
    </section>
  );
};

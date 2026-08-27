import {
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  seniorDeductionPhaseoutEnd,
} from '../lib/tax';
import type {
  FilingStatus,
  IrmaaCliff,
  MarginalRatePoint,
  PtcAssessment,
  PtcCliff,
  TaxYear,
} from '../lib/tax';
import { formatCurrency, formatPercent } from '../lib/format';
import { BreakpointsMenu } from './BreakpointsMenu';
import { TorpedoChart } from './TorpedoChart';
import { IrmaaExplainer } from './explainers/IrmaaExplainer';
import { MitigationExplainer } from './explainers/MitigationExplainer';
import { SeniorDeductionExplainer } from './explainers/SeniorDeductionExplainer';
import { SubsidyCliffExplainer } from './explainers/SubsidyCliffExplainer';
import { TorpedoExplainer } from './explainers/TorpedoExplainer';
import { useState } from 'react';

/**
 * The two sentences that describe the axis end to end rather than a figure on
 * it: the plot's accessible name, and the caption under it.
 *
 * Both offered the reader an addition — a benefit that does not move, plus $0
 * to the right edge of other income — and both named the benefit and stopped
 * there, so both stopped adding up the moment the muni slider moved. At $3,750
 * of municipal interest the opening line said the axis began at $28,602 while
 * the arithmetic beside it reached $24,852. They are built from one list now.
 *
 * Each part appears only when it is non-zero, so a return with no benefit and
 * no municipal interest gets the bare axis name rather than a sentence about
 * two zeroes.
 */
const axisProse = (
  ssBenefit: number,
  muniInterest: number,
  axisDomain: [number, number],
  axisMax: number,
): { label: string; caption: string } => {
  const includes = [
    ssBenefit > 0 ? `${formatCurrency(ssBenefit)} of Social Security` : '',
    muniInterest > 0 ? `${formatCurrency(muniInterest)} of municipal interest` : '',
  ].filter(Boolean);

  const fixed =
    includes.length > 0
      ? includes.join(' and ')
      : `${formatCurrency(ssBenefit)} of Social Security`;

  return {
    caption:
      'Total income ($)' +
      (includes.length > 0 ? `, including ${includes.join(' and ')}.` : ''),
    label:
      'Chart: the marginal tax rate on the next dollar of other income, plotted ' +
      `against total income from ${formatCurrency(axisDomain[0])} to ` +
      `${formatCurrency(axisDomain[1])} — a fixed ${fixed} plus $0 to ` +
      `${formatCurrency(axisMax)} of other income.`,
  };
};

export interface TorpedoStepProps {
  stepNumber: number;
  stepCount: number;
  year: TaxYear;
  filingStatus: FilingStatus;
  ssBenefit: number;
  muniInterest: number;
  seniors: number;
  beneficiaries: number;
  ordinaryIncome: number;
  onOrdinaryIncome: (next: number) => void;
  /** The swept curve, and the axis it was swept across. */
  curve: MarginalRatePoint[];
  axisMax: number;
  incomeSliderStep: number;
  /** Where the reader is standing, read back off the curve. */
  herePoint: MarginalRatePoint | undefined;
  totalIncome: number;
  totalIncomeAt: (otherIncome: number) => number;
  /** Every IRMAA cliff this return has, in ascending order. */
  cliffs: IrmaaCliff[];
  /** The subset of them the axis reaches. */
  cliffsOnChart: IrmaaCliff[];
  /** The 400% line when it is this return's to meet, and null when it is not. */
  subsidyCliff: PtcCliff | null;
  subsidyCliffOnChart: PtcCliff | null;
  hereSubsidy: PtcAssessment;
}

/**
 * Step 2: what other income does to the benefit step 1 set.
 *
 * The chart, then the one control that says where on that chart the reader is
 * standing, then the collapsed explainers. Which of the two threshold lines
 * are drawn is the one piece of state that belongs to this step and nowhere
 * else — neither is income tax. The Medicare cliffs start on, because every
 * reader meets them sooner or later; the 400% line starts off, because it
 * belongs only to a reader still buying their own coverage. What each costs *this*
 * return is in the close rather than on the plot. Not in the query string
 * either: every key there describes the return, and a link carries a scenario
 * rather than a view of it. See `scenarioUrl`.
 */
export const TorpedoStep: React.FC<TorpedoStepProps> = ({
  stepNumber,
  stepCount,
  year,
  filingStatus,
  ssBenefit,
  muniInterest,
  seniors,
  beneficiaries,
  ordinaryIncome,
  onOrdinaryIncome,
  curve,
  axisMax,
  incomeSliderStep,
  herePoint,
  totalIncome,
  totalIncomeAt,
  cliffs,
  cliffsOnChart,
  subsidyCliff,
  subsidyCliffOnChart,
  hereSubsidy,
}) => {
  const [showIrmaaLines, setShowIrmaaLines] = useState(true);
  const [showSubsidyLine, setShowSubsidyLine] = useState(false);

  /**
   * The chart's x-axis, in the income the return actually takes in.
   *
   * The sweep is still every dollar of *other* income from nothing to the
   * right edge — that is the one figure the reader sets, and the slider, the
   * segments and every threshold are still measured in it. What changed is
   * what the axis is drawn in: a reader looking at the hump wants to know what
   * income puts them on it, and "$41,000" was only ever half an answer,
   * because the benefit sitting underneath it is income too.
   *
   * Read off the curve's own ends rather than recomputed, so the axis cannot
   * span anything the plot does not.
   */
  const axisDomain: [number, number] = [
    curve[0].totalIncome,
    curve[curve.length - 1].totalIncome,
  ];
  const { label, caption } = axisProse(ssBenefit, muniInterest, axisDomain, axisMax);

  const drawnCliffs = showIrmaaLines ? cliffsOnChart : [];
  const drawnSubsidyCliff = showSubsidyLine ? subsidyCliffOnChart : null;

  const phaseoutStart = SENIOR_DEDUCTION_PHASEOUT_START[filingStatus];
  const phaseoutEnd = seniorDeductionPhaseoutEnd(filingStatus);
  // With the age toggle off there is nothing to phase out, but the explainer
  // still needs a rate to talk about, so describe one qualifying person.
  const phaseoutRate = SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(1, seniors);
  const effectiveRate = (tax: number): number =>
    totalIncome > 0 ? tax / totalIncome : 0;

  return (
    <section
      className="step"
      id="step-torpedo"
      tabIndex={-1}
      aria-labelledby="step-torpedo-heading"
    >
      <p className="step-kicker">
        Step {stepNumber} of {stepCount}
      </p>
      <h2 className="step-heading" id="step-torpedo-heading">
        The tax torpedo
      </h2>
      <p className="step-deck">
        The marginal rate on the next dollar of other income, plotted against
        total income.
      </p>

      <figure className="chart-figure">
        <BreakpointsMenu
          linesShown={drawnCliffs.length + (drawnSubsidyCliff ? 1 : 0)}
          showIrmaaLines={showIrmaaLines}
          onShowIrmaaLines={setShowIrmaaLines}
          offerSubsidyLine={subsidyCliff !== null}
          showSubsidyLine={showSubsidyLine}
          onShowSubsidyLine={setShowSubsidyLine}
        />
        <TorpedoChart
          curve={curve}
          axisDomain={axisDomain}
          here={totalIncome}
          totalIncomeAt={totalIncomeAt}
          cliffs={drawnCliffs}
          subsidyCliff={drawnSubsidyCliff}
          label={label}
          caption={caption}
          ssBenefit={ssBenefit}
          filingStatus={filingStatus}
          muniInterest={muniInterest}
          beneficiaries={beneficiaries}
          year={year}
        />
      </figure>

      <div className="input-group chart-slider">
        <div className="slider-header">
          <label htmlFor="ordinary-income">Other Income (excluding Social Security)</label>
          <span className="slider-value amber">{formatCurrency(ordinaryIncome)}</span>
        </div>
        <input
          id="ordinary-income"
          type="range"
          min={0}
          max={axisMax}
          step={incomeSliderStep}
          value={ordinaryIncome}
          onChange={(e) => onOrdinaryIncome(Number(e.target.value))}
          className="slider-amber"
        />
        <div className="slider-range-labels">
          <span>$0</span>
          <span>{formatCurrency(axisMax)}</span>
        </div>

        {/* No "You are here." lead. Three things already say that this
            sentence is about the reader's own point and not the chart's:
            the dashed amber marker, the amber slider directly above, and
            the amber figure beside its label — and the sentence names
            the income the reader set in its first five words. The label
            was a fourth telling, and it was set in the same bold as the
            three figures below it, so the one phrase the paragraph
            stressed hardest was the one carrying no figure at all. */}
        <p className="slider-readout">
          At {formatCurrency(ordinaryIncome)} of other income the next
          dollar is taxed at{' '}
          <strong>{herePoint ? `${herePoint.marginalRate}%` : '—'}</strong>.
          {herePoint && totalIncome > 0 ? (
            <>
              {' '}
              This return owes{' '}
              <strong>{formatCurrency(herePoint.totalTax)}</strong> in federal
              tax on {formatCurrency(totalIncome)} of total income &mdash; an
              effective rate of{' '}
              <strong>{formatPercent(effectiveRate(herePoint.totalTax))}</strong>
              .
            </>
          ) : null}
        </p>
      </div>

      {/* The notes: every explainer under one kicker, numbered by the
          stylesheet. */}
      <p className="notes-kicker">Notes</p>
      <TorpedoExplainer filingStatus={filingStatus} />
      <MitigationExplainer />
      <IrmaaExplainer
        firstCliffStep={cliffs[0].step}
        beneficiaries={beneficiaries}
        muniInterest={muniInterest}
        year={year}
      />
      {/* Both halves of the condition, the same pair the Breakpoints panel
          uses. Whether anyone on the return is still buying their own coverage
          is the reader: nobody enrolled in Medicare can claim the credit. The
          cliff being non-null is the statute: the 400% ceiling was suspended
          from 2021 through 2025 and there is nothing to explain in a year
          without one. `PAGE_TAX_YEAR` has one — but the engine still prices
          both, so the guard stays. */}
      {subsidyCliff && (
        <SubsidyCliffExplainer
          cliff={subsidyCliff}
          here={hereSubsidy}
          ssBenefit={ssBenefit}
          year={year}
        />
      )}
      <SeniorDeductionExplainer
        phaseoutStart={phaseoutStart}
        phaseoutEnd={phaseoutEnd}
        phaseoutRate={phaseoutRate}
      />
    </section>
  );
};

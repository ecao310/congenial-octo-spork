import {
  FPL_GUIDELINE_LOOKBACK_YEARS,
  IRMAA_LOOKBACK_YEARS,
  PTC_CLIFF_PERCENT,
  fplGuidelineYear,
} from '../../lib/tax';
import type { PtcAssessment, PtcCliff, TaxYear } from '../../lib/tax';
import { formatCurrency } from '../../lib/format';

export interface SubsidyCliffExplainerProps {
  cliff: PtcCliff;
  /** Where this return's own household income stands against the line. */
  here: PtcAssessment;
  ssBenefit: number;
  year: TaxYear;
}

/**
 * The 400% poverty-line cliff: a credit the government stops paying rather
 * than a tax it charges, and the one threshold here that bites before 65.
 *
 * Rendered only when both halves of its condition hold — nobody enrolled in
 * Medicare can claim the credit, and a year with no 400% ceiling has no cliff
 * to explain — so this takes a `cliff` rather than a nullable one and the
 * caller carries the guard.
 */
export const SubsidyCliffExplainer: React.FC<SubsidyCliffExplainerProps> = ({
  cliff,
  here,
  ssBenefit,
  year,
}) => (
  <details className="explainer">
    <summary>
      <h3 id="subsidy-cliff-heading">
        The {PTC_CLIFF_PERCENT * 100}% poverty-line cliff
      </h3>
    </summary>
    <div className="explainer-content">
      <p>
        Health coverage bought on the Marketplace comes with a{' '}
        <strong>premium tax credit</strong> that pays whatever the
        benchmark silver plan costs above a set share of household
        income. IRC 36B(c)(1)(A) allows it to a household whose
        income is &ldquo;at least 100 percent but not more than 400
        percent&rdquo; of the federal poverty line. There is no row
        in the table past 400%, so past 400% the credit is not
        smaller &mdash; it is nothing. For this household that line
        is {formatCurrency(cliff.magi)}:{' '}
        {PTC_CLIFF_PERCENT * 100}% of the{' '}
        {formatCurrency(cliff.povertyLine)} poverty line for{' '}
        {cliff.householdSize === 1
          ? 'one person'
          : `${cliff.householdSize} people`}
        . Switch it on as a pink dashed line under{' '}
        <strong>Breakpoints</strong> in the corner of the chart;
        your own distance from it is at the foot of this note.
      </p>
      <p>
        <strong>What it costs is not a fixed figure.</strong> Just
        under the line the household pays at most{' '}
        {(cliff.topApplicablePercentage * 100).toFixed(2)}% of
        its income &mdash;{' '}
        {formatCurrency(cliff.cappedContribution)} &mdash; for
        the benchmark plan, and the credit covers the rest. One
        dollar over, it pays the full premium, which depends on ages
        and county: for a couple in their early sixties it is
        routinely five figures.
      </p>
      <p>
        <strong>It is not Medicare&apos;s line, or the tax
          code&apos;s.</strong> 36B(d)(2)(B) counts AGI plus
        tax-exempt interest plus{' '}
        <em>the untaxed part of the Social Security benefit</em>.
        That last term undoes the torpedo: whatever share of the{' '}
        {formatCurrency(ssBenefit)} benefit stays out of the tax
        base, this adds straight back, so the whole benefit counts
        at every income level. The practical difference shows in
        where the lines sit: raise the benefit by a dollar and the
        pink line moves a full dollar left, while the red ones move
        at most 85 cents, because 85 cents is all of that dollar
        that can ever reach the tax base. Two cliffs, two MAGIs, and
        no reading one off the other.
      </p>
      <p>
        <strong>You are here.</strong> This return&apos;s household
        income is {formatCurrency(Math.round(here.magi))},{' '}
        {(here.fplMultiple * 100).toFixed(0)}% of the poverty
        line.{' '}
        {here.overCliff
          ? 'That is past the cliff: there is no premium tax credit for this year, and coming back under it takes ' +
          formatCurrency(Math.round(here.magi - (here.cliffMagi ?? 0))) +
          ' less income.'
          : `Another ${formatCurrency(
            Math.round(here.headroom ?? 0),
          )} of it reaches the line, and the dollar after that is the one that costs.`}
      </p>
      <p>
        <strong>The cliff is back, and it was gone.</strong> From
        2021 through 2025 there was no 400% ceiling at all: ARPA
        section 9661, extended by the Inflation Reduction Act,
        replaced the table with one that ran past 400% and capped
        the household&apos;s own share at 8.5% of income however
        high income went. That expired for tax years beginning after
        2025. The poverty line itself runs{' '}
        {FPL_GUIDELINE_LOOKBACK_YEARS} year behind, where
        Medicare&apos;s MAGI runs {IRMAA_LOOKBACK_YEARS}: 26 CFR
        1.36B-1(h) fixes it at the guidelines in effect when open
        enrolment began, which is the previous 1 November, so {year}{' '}
        coverage is priced off the {fplGuidelineYear(year)}{' '}
        guidelines &mdash; already a year old when the year starts.
      </p>
      <p>
        <strong>Who this is not for.</strong> Nobody enrolled in
        Medicare is eligible for the credit, which is why the line
        disappears from this chart once everyone on the return has
        turned 65 &mdash; and why a couple with one spouse on either
        side of 65 is standing in front of both cliffs at once.
        Coverage from an employer, a retiree plan or a spouse&apos;s
        plan takes the credit away too, so a reader with any of
        those can read this line as decoration. The poverty line
        used here is the one for the lower 48 and DC; Alaska and
        Hawaii have their own, higher, so the line falls further
        right there than it is drawn.{' '}
        {cliff.householdSize === 1
          ? 'The household here is one person; a dependent would move the line right by about $5,500 of income.'
          : 'The household here is the two people this filing status implies; a dependent past them would move the line right by about $5,500 of income.'}
      </p>
    </div>
  </details>
);

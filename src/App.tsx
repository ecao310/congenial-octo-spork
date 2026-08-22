import { useMemo, useState } from 'react';
import {
  MIN_INCOME_AXIS,
  PAGE_TAX_YEAR,
  acaMagi,
  avgAnnualSSBenefit,
  incomeAxisMax,
  irmaaCliffs,
  irmaaFor,
  irmaaMagi,
  marginalRateCurve,
  maxAnnualSSBenefit,
  ptcCliff,
  ptcFor,
  taxableSocialSecurity,
  totalIncomeFor,
  totalTax,
} from './lib/tax';
import type {
  FilingStatus,
  IrmaaCliff,
  MarginalRatePoint,
  PtcCliff,
} from './lib/tax';
import { decodeScenario } from './lib/scenarioUrl';
import { formatCurrency, formatPercent } from './lib/format';
import {
  FILING_STATUS_PROSE,
  advancedInputs,
  advancedProse,
  ageProse as ageProseFor,
} from './lib/returnProse';
import { useScenarioAddress } from './hooks/useScenarioAddress';
import { useSettledReading } from './hooks/useSettledReading';
import { Answer } from './components/Answer';
import { BenefitStep } from './components/BenefitStep';
import { Header } from './components/Header';
import { TorpedoStep } from './components/TorpedoStep';

/**
 * One worked example in two steps, in the order a reader builds it: the
 * benefit they will collect, and what the rest of their income does to it.
 * Both steps price the same return, so a figure set in step 1 is still set in
 * step 2.
 *
 * The steps stay mounted and the window scrolls, where the tab strip this
 * replaced swapped one panel for another. Three reasons to scroll: a step you
 * have to click into existence reads as optional, and these are not; step 2
 * quotes figures the reader set in step 1, which only works if scrolling back
 * to them is possible; and printing or Ctrl-F now reaches everything rather
 * than the open panel. What it costs is length, which a step nav and a
 * next-step box used to pay for. Both came off with the four sections that
 * made the walk long enough to need them: two steps on one scroll are not a
 * flow a reader can be lost in, and a nav offering to carry them past one
 * heading is furniture charging rent.
 *
 * Six more sections have stood here. Four were tabs — Medicare, Strategies,
 * Over Time and State Taxes — and two were steps 3 and 4, Capital Gains
 * Stacking and Sizing the Conversion, which came off when this narrowed to the
 * torpedo alone. What they rendered went with them, and so has the arithmetic
 * underneath: the projection, sequencing, lump-sum, state-tax, gains-curve and
 * conversion-sizing modules are all out of the repo, and so is the 3.8% surtax
 * of IRC 1411, which outlived them by a pass as a term of a total that was
 * always zero. What is left in `lib/tax/` is what these two steps read.
 *
 * So the inputs are split across the steps that move them: filing status, age
 * and the benefit are step 1, and other ordinary income is step 2, being a
 * point on the axis its chart sweeps. Tax-exempt interest belongs to no axis
 * and sits in a collapsed block at the end of step 1, because it starts at $0
 * and at $0 leaves the chart identical.
 *
 * Nothing renders off the list itself any more. It carried a nav label, a
 * heading and a blurb per step until the nav and the next-step box went, and
 * each of the three had exactly one reader; the headings still shown are
 * written where they are shown. What is left is the pair of facts nothing else
 * can supply — `StepId`, which the live region is keyed to, and the count the
 * step kickers number themselves out of.
 */
const STEPS = ['benefit', 'torpedo'] as const;

type StepId = (typeof STEPS)[number];

/**
 * The point on a swept curve at the reader's own value.
 *
 * The chart prices a whole axis, so it does not move when the slider beneath
 * it moves: the reader's number is a *place* on a curve that is already drawn,
 * not an input to it. Reading the curve back at that place is what turns the
 * slider from an inert control into a position. The sweep ascends, so the last
 * sampled point at or below the value is the one — and every slider steps in a
 * multiple of what the curve beneath it samples, so in practice it is an exact
 * hit. See `curveStepFor`.
 */
function pointAt<P>(
  curve: P[],
  axis: (point: P) => number,
  value: number,
): P | undefined {
  let found: P | undefined;
  for (const point of curve) {
    if (axis(point) > value) break;
    found = point;
  }
  return found;
}

/**
 * Sampling interval for a swept curve, and the step of any slider walking it.
 *
 * The interval doubles each time the axis does, so the widest chart this app
 * can draw samples no more points than the narrowest one always did — at most
 * 600 either way.
 *
 * The last rungs exist for links rather than for sliders. Nothing a reader can
 * click takes the axis past $300,000, but a link can name any income up to
 * `MAX_OTHER_INCOME`, and without them a $1,000,000 return would sweep a
 * thousand points where the chart otherwise sweeps at most six hundred.
 */
const curveStepFor = (axisMax: number): number =>
  axisMax > 600_000 ? 2000 : axisMax > 300_000 ? 1000 : axisMax > 150_000 ? 500 : 250;

const App: React.FC = () => {
  /**
   * The return this opened with, read out of the address bar once.
   *
   * Lazily initialised rather than computed at module load, because the
   * address is a fact about this mount: the tests render `<App />` many times
   * under many different links, and a module-level read would hand every one
   * of them whichever link happened to be first.
   */
  const [openedWith] = useState(() => decodeScenario(window.location.search));
  const opening = openedWith.scenario;

  const [linkNotes, setLinkNotes] = useState<string[]>(() => openedWith.notes);

  /**
   * The year every figure below is priced for.
   *
   * A constant rather than state: there used to be a 2025/2026 picker, and it
   * was the only control that re-priced everything at once without telling the
   * reader anything they came for. What it demonstrated — that the COLA raises
   * the benefit while 86(c)'s thresholds sit still — is the whole subject here
   * and is said in prose under step 2, where it does not depend on the reader
   * thinking to click twice and compare. See `PAGE_TAX_YEAR` for why it is not
   * `defaultTaxYear()`.
   */
  const year = PAGE_TAX_YEAR;
  const [ssBenefit, setSsBenefit] = useState<number>(opening.ssBenefit);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(opening.filingStatus);
  const [ordinaryIncome, setOrdinaryIncome] = useState<number>(opening.ordinaryIncome);
  const [isSenior, setIsSenior] = useState<boolean>(opening.isSenior);
  const [spouseIsSenior, setSpouseIsSenior] = useState<boolean>(opening.spouseIsSenior);
  const [muniInterest, setMuniInterest] = useState<number>(opening.muniInterest);

  /**
   * Whose reading the live region is carrying, or null before the reader has
   * moved anything.
   *
   * Every readout here is silent to a screen reader: moving a slider announces
   * the slider's own value and nothing else, so the "you are here" sentence
   * and the effective rate under it both change unheard. A live region fixes
   * that, and the whole difficulty is how much to put in one — the closing
   * figures read out on every notch of a drag would be worse than the silence
   * they replaced. So the region carries exactly one step's reading: the step
   * whose control was last touched.
   *
   * Keyed to the control the reader last touched rather than to whichever step
   * is on screen, because every step is mounted at once and a reader can be
   * working step 2's slider with step 1 still in view. And one rather than two
   * regions, because step 1's benefit moves both readings — two regions would
   * queue two announcements for one drag, which is the noise this is trying to
   * avoid.
   *
   * Null at mount is what keeps things quiet on arrival: a region with nothing
   * in it announces nothing, and the close is meant to be read on the way down
   * rather than shouted on the way in.
   */
  const [announceFrom, announce] = useState<StepId | null>(null);

  const address = useScenarioAddress({
    filingStatus,
    ssBenefit,
    ordinaryIncome,
    isSenior,
    spouseIsSenior,
    muniInterest,
  });

  const changeOrdinaryIncome = (next: number): void => {
    setOrdinaryIncome(next);
    announce('torpedo');
  };

  /**
   * Line 6a on a joint return holds two benefits, so both ends of that slider
   * are the couple's: coming back from `mfj` can leave a figure standing past
   * a right edge that has nearly halved, and it is re-capped rather than left
   * parked out there.
   *
   * The extra rule is the average. A reader sitting exactly on one status's
   * average has not chosen that number, they have accepted the marker under
   * the slider — so when the marker moves, they move with it, and switching
   * back puts them where they started. Anywhere else on the slider is a figure
   * they set, and it stays set.
   */
  const changeFilingStatus = (next: FilingStatus): void => {
    setSsBenefit((current) =>
      current === avgAnnualSSBenefit(year, filingStatus)
        ? avgAnnualSSBenefit(year, next)
        : Math.min(current, maxAnnualSSBenefit(year, next)),
    );
    setFilingStatus(next);
    announce('benefit');
  };

  const changeIsSenior = (next: boolean): void => {
    setIsSenior(next);
    // The spouse's box answers "and the other one too?", so it cannot outlive
    // the question. Leaving it set left a checked box greyed out under
    // `disabled`, put a `spouse=1` in the link that priced nothing, and made
    // re-checking this box hand back a second $1,650 nobody asked for again.
    // `seniors` below already ignored it; this is the control agreeing with
    // the arithmetic.
    if (!next) setSpouseIsSenior(false);
    announce('benefit');
  };

  // Only a joint return can claim the addition twice, and the spouse's
  // checkbox is meaningless until the filer's is on.
  const seniors = isSenior ? (filingStatus === 'mfj' && spouseIsSenior ? 2 : 1) : 0;

  // Medicare is per enrollee, so a joint return with both spouses over 65 pays
  // every surcharge twice off one MAGI figure. Below 65 nobody is enrolled yet,
  // but the two-year lookback means this year's income still sets the first
  // premium they will see — so price one enrollee rather than none.
  const beneficiaries = filingStatus === 'mfj' && seniors === 2 ? 2 : 1;

  /**
   * The right edge of step 2's chart, and of the slider under it.
   *
   * Sized to this return rather than fixed, because what there is to see moves
   * with it: the torpedo is over by about $41,000 of other income, but a
   * return claiming the senior deduction has a second hump that does not
   * finish until $154,000 — $230,000 on a joint return — and the old fixed
   * $150,000 cut it in half. It never narrows below that figure, only widens
   * past it. See `incomeAxisMax`.
   *
   * The reader's own income is passed as the floor so the axis always contains
   * where they are standing. Without it, turning the age toggle back off would
   * pull the right edge in behind a slider left out at $170,000.
   */
  const axisMax = useMemo(
    () =>
      incomeAxisMax(
        { ssBenefit, filingStatus, seniors, muniInterest, year },
        { minimum: Math.max(MIN_INCOME_AXIS, ordinaryIncome) },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, year, ordinaryIncome],
  );

  /**
   * The slider steps in whatever the curve samples, never finer than the $500
   * it has always used. `pointAt` reads the reader's position back off the
   * nearest sample at or below it, so a slider that stepped finer than the
   * sweep would quietly report the marginal rate from somewhere else.
   */
  const curveStep = curveStepFor(axisMax);

  /**
   * Step 2's curve, and the only one drawn: every dollar that is not Social
   * Security, from nothing to the right edge, priced for what the next one
   * after it costs.
   *
   * Every dollar on this axis is ordinary income. A long-term gain reaches
   * provisional income identically but is charged under its own schedule, and
   * pricing that split is what the capital-gains step did — `ltcg` is still a
   * field on `Scenario` and `totalTax` still prices one, but nothing here sets
   * one, so nothing here passes one.
   */
  const curve: MarginalRatePoint[] = useMemo(
    () =>
      marginalRateCurve(
        { ssBenefit, filingStatus, seniors, muniInterest, year },
        { maxIncome: axisMax, step: curveStep },
      ),
    [ssBenefit, filingStatus, seniors, muniInterest, year, axisMax, curveStep],
  );

  /**
   * Where the reader is standing on the chart: the slider is a point on the
   * sweep, so it reads the curve back rather than changing it.
   */
  const herePoint = useMemo(
    () => pointAt(curve, (p) => p.income, ordinaryIncome),
    [curve, ordinaryIncome],
  );

  /**
   * The reader's own return, in the shape the tax chain reads it: one object
   * that everything below prices off, rather than a different subset of the
   * state at each call site.
   */
  const hereScenario = useMemo(
    () => ({
      ordinaryIncome,
      ssBenefit,
      filingStatus,
      seniors,
      muniInterest,
      year,
    }),
    [ordinaryIncome, ssBenefit, filingStatus, seniors, muniInterest, year],
  );

  /**
   * Everything this return takes in, which is the denominator an effective
   * rate needs and the figure the reader's own answer quotes.
   *
   * `totalIncomeFor` is the one definition — the axis labels and the tooltips
   * read it rather than each restating it — and its own comment says why the
   * whole benefit counts.
   */
  const totalIncome = totalIncomeFor(hereScenario);

  /**
   * The same question asked about a point that is not the reader's own: what
   * this return takes in when its other income is `income`.
   *
   * Every mark the chart places by other income goes through here, because the
   * axis those marks land on is drawn in total income. Rounded to match the
   * curve's own `totalIncome`, so a threshold at the sample the reader is
   * standing on shares its x with them rather than missing it by cents.
   */
  const totalIncomeAt = (income: number): number =>
    Math.round(totalIncomeFor({ ...hereScenario, ordinaryIncome: income }));

  const cliffs = useMemo(
    () =>
      irmaaCliffs({
        ssBenefit,
        filingStatus,
        muniInterest,
        beneficiaries,
        year,
      }),
    [ssBenefit, filingStatus, muniInterest, beneficiaries, year],
  );

  /** The cliffs that actually land inside the chart's x-axis. */
  const cliffsOnChart: IrmaaCliff[] = cliffs.filter(
    (c) => c.otherIncome > 0 && c.otherIncome <= axisMax,
  );

  /**
   * Whether anyone on this return still has to buy their own health coverage.
   *
   * The 400% cliff and the IRMAA cliffs are mutually exclusive *per person*:
   * 36B(c)(2)(B) makes anyone eligible for Medicare ineligible for the premium
   * tax credit, so the pink line is drawn for exactly the readers the red ones
   * are least about — and a joint return with one spouse over 65 and one under
   * it meets both, which is why this counts people rather than asking whether
   * the filer is a senior.
   *
   * What it cannot know is where that coverage comes from. An employer plan, a
   * retiree plan or a spouse's plan all leave the cliff irrelevant, and there
   * is no field for it. So the line is drawn on the age this return already
   * states and the prose beside it carries the condition, rather than a
   * checkbox nobody would tick being the thing that decides whether the
   * biggest cliff on the chart is mentioned at all.
   */
  const preMedicare = seniors < (filingStatus === 'mfj' ? 2 : 1);

  /**
   * The 400% line for this household: null in a tax year that has no cliff,
   * and null again when nobody on the return is still buying their own
   * coverage. Both halves of that condition travel together, because every
   * reader of this figure needs both.
   *
   * The same scenario the IRMAA cliffs are placed from, and it moves with the
   * same inputs — but along a different MAGI, so it does not move by the same
   * amounts. `householdSize` is deliberately left unset: there is no field for
   * dependents, so the scenario's own default sizes the poverty line from the
   * filing status. See `defaultHouseholdSize`.
   */
  const subsidyCliff: PtcCliff | null = useMemo(
    () =>
      preMedicare
        ? ptcCliff({ ssBenefit, filingStatus, muniInterest, year })
        : null,
    [preMedicare, ssBenefit, filingStatus, muniInterest, year],
  );

  /** The 400% line when the axis can show it as well. */
  const subsidyCliffOnChart: PtcCliff | null =
    subsidyCliff &&
      subsidyCliff.otherIncome > 0 &&
      subsidyCliff.otherIncome <= axisMax
      ? subsidyCliff
      : null;

  const ageProse = ageProseFor(seniors, filingStatus);

  /**
   * What the live region will read out, once whatever changed it has settled.
   *
   * One step's reading each, written to be listened to rather than looked at:
   * plain sentences with no markup to flatten, no em dashes, and the figures
   * in the order the eye takes them off the screen. It says what that step's
   * own readout says and stops there: the closing figures stay put, for a
   * reader who goes and reads them.
   *
   * Not memoised: it is two string concatenations on a component that has
   * already swept a curve, and holding it as a plain value is what lets the
   * settle hook below compare readings by their text rather than by identity.
   */
  const reading = ((): string => {
    switch (announceFrom) {
      case 'benefit': {
        /* The recap on screen, flattened: same words, same separators, so a
           listener and a reader are never told about two different returns. It
           used to tack the advanced inputs on as bare labels — "Muni interest
           $10,000" — because the recap only pointed at them and a pointer is no
           use to someone who has just moved one. The recap names them now, so
           this names them the same way, in the same second sentence. */
        const advanced = advancedInputs(muniInterest);
        const collecting =
          ssBenefit > 0
            ? `collecting ${formatCurrency(ssBenefit)} of Social Security per year`
            : 'collecting no Social Security at all';
        const plus = advanced.length ? ` Plus ${advancedProse(advanced)}.` : '';
        return `${year} brackets, ${FILING_STATUS_PROSE[filingStatus]}, ${ageProse}, ${collecting}.${plus}`;
      }
      case 'torpedo':
        return herePoint
          ? `At ${formatCurrency(ordinaryIncome)} of other income the next dollar is taxed at ${herePoint.marginalRate
          }%. Federal tax ${formatCurrency(herePoint.totalTax)} on ${formatCurrency(
            totalIncome,
          )} of total income, an effective rate of ${formatPercent(
            totalIncome > 0 ? herePoint.totalTax / totalIncome : 0,
          )}.`
          : '';
      default:
        return '';
    }
  })();

  /**
   * The same reading, held back until the control that changed it has stopped
   * moving. What is on screen never waits on this; only what is said does.
   */
  const announcement = useSettledReading(reading);

  /**
   * The year's federal tax at the reader's point.
   *
   * Read off the curve rather than recomputed, so the close quotes the figure
   * step 2's readout already quotes rather than a second rounding of it.
   * `totalTax` stands in for a slider parked below the curve's first sample,
   * which would mean below $0, and is the same call the sweep makes at every
   * point it plots.
   */
  const hereTax = herePoint?.totalTax ?? Math.round(totalTax(hereScenario));

  return (
    <div className="card">
      {/* The way past step 1.

          Step 1 is ten controls deep before the chart begins, and a reader who
          has already set the return — or who arrived on a link that set it for
          them — has to tab through every one of them to reach the thing this is
          about. So the first focusable element is the way out of that.

          It lands on `#step-torpedo` rather than on `#answer` because the
          fragment is already how a place is named here: `scenarioUrl` keeps
          whatever fragment the reader arrived on precisely so a link can point
          at a step, and the chart is what the steps lead to. The close sits
          after it in reading order and one heading jump away, so landing on the
          chart reaches both and landing on the close reaches only one.

          No handler: the target carries `tabIndex={-1}`, which is what makes a
          browser move focus into it rather than only scrolling to it. */}
      <a className="skip-link" href="#step-torpedo">
        Skip to the chart
      </a>

      <Header linkNotes={linkNotes} onDismissNotes={() => setLinkNotes([])} />

      {/* What a screen reader hears when a control moves, and the only thing
          here that is heard rather than read. Rendered always and empty until
          there is something to say, because a live region has to be mounted
          before the message lands in it to be read out reliably — the same
          reason the copy-link status is. `aria-atomic` because each reading is
          one sentence that replaces the last rather than an addition to it.

          Where it sits changes nothing about when it is read, so it sits above
          the steps rather than below them: the close is the last thing before
          the disclaimer, and that adjacency is part of the shape. Empty and a
          pixel wide, it interrupts nothing here. */}
      <p className="live-reading" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {/* The main landmark, and everything that is not the title or the
          disclaimer: both steps and the close.

          `.shell` is already the box that holds exactly that, so it becomes the
          landmark rather than gaining a wrapper — a second box here would be a
          grid parent with one grid child, which is a layout bug waiting to be
          written. The footer stays outside it on purpose: a `<footer>` inside
          `<main>` is not `contentinfo`, so folding it in would have traded the
          one landmark there already was for the one that was missing. */}
      <main className="shell">
        <BenefitStep
          stepNumber={1}
          stepCount={STEPS.length}
          year={year}
          filingStatus={filingStatus}
          onFilingStatus={changeFilingStatus}
          isSenior={isSenior}
          onSenior={changeIsSenior}
          spouseIsSenior={spouseIsSenior}
          onSpouseSenior={(next) => {
            setSpouseIsSenior(next);
            announce('benefit');
          }}
          seniors={seniors}
          ageProse={ageProse}
          ssBenefit={ssBenefit}
          onSsBenefit={(next) => {
            setSsBenefit(next);
            announce('benefit');
          }}
          muniInterest={muniInterest}
          onMuniInterest={(next) => {
            setMuniInterest(next);
            announce('benefit');
          }}
        />

        <div className="flow">
          <TorpedoStep
            stepNumber={2}
            stepCount={STEPS.length}
            year={year}
            filingStatus={filingStatus}
            ssBenefit={ssBenefit}
            muniInterest={muniInterest}
            seniors={seniors}
            beneficiaries={beneficiaries}
            ordinaryIncome={ordinaryIncome}
            onOrdinaryIncome={changeOrdinaryIncome}
            curve={curve}
            axisMax={axisMax}
            incomeSliderStep={Math.max(500, curveStep)}
            herePoint={herePoint}
            totalIncome={totalIncome}
            totalIncomeAt={totalIncomeAt}
            cliffs={cliffs}
            cliffsOnChart={cliffsOnChart}
            subsidyCliff={subsidyCliff}
            subsidyCliffOnChart={subsidyCliffOnChart}
            hereSubsidy={ptcFor(acaMagi(hereScenario), hereScenario)}
          />

          <Answer
            year={year}
            filingStatus={filingStatus}
            ageProse={ageProse}
            ssBenefit={ssBenefit}
            ordinaryIncome={ordinaryIncome}
            muniInterest={muniInterest}
            totalIncome={totalIncome}
            tax={hereTax}
            marginalRate={herePoint?.marginalRate ?? null}
            taxableSS={taxableSocialSecurity(hereScenario)}
            irmaa={irmaaFor(irmaaMagi(hereScenario), {
              filingStatus,
              beneficiaries,
              year,
            })}
            canCopy={address.canCopy}
            copyState={address.copyState}
            onCopy={address.copy}
          />
        </div>
      </main>

      <footer>
        <p>
          This tool is for educational purposes only and does not constitute tax
          or financial advice. Please consult a qualified tax professional
          regarding your specific situation.
        </p>
      </footer>
    </div>
  );
};

export default App;

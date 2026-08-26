import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { TAX_YEARS, PAGE_TAX_YEAR } from './lib/tax';
import { pinPageYear, AVG_ANNUAL_SS_BENEFIT, MAX_ANNUAL_SS_BENEFIT, scenarioRecap, chooseFilingStatus } from './test/pageFixtures';

/**
 * The page as a reader meets it: its landmarks, its two steps, and the recap
 * that names the return every figure after it prices.
 *
 * Everything here renders the whole of `<App />` — these are claims about a
 * page rather than about a component — which is why they are one suite per
 * subject rather than one per file under `components/`. What the chart draws
 * across its axis is `App.thresholds.test.tsx`, what the close adds up is
 * `App.answer.test.tsx`, and what recharts puts in the SVG is
 * `App.chart.test.tsx`.
 */

pinPageYear();

describe('App', () => {
  /**
   * The benefit slider's own input group.
   *
   * The retroactive-award section quotes the same benefit figure in its
   * worksheet rows — a 12-month back-pay year is one annual benefit — so an
   * unscoped `getByText` on the benefit now matches four elements. Asserting
   * inside the slider's group says what these tests actually mean.
   */
  const benefitGroup = (): HTMLElement =>
    screen
      .getByRole('slider', { name: /social security benefit/i })
      .closest('.input-group') as HTMLElement;

  it('leads with what the page is for rather than with the settings', () => {
    render(<App />);
    const hero = screen.getByRole('heading', {
      name: /social security and marginal tax rates/i,
      level: 1,
    });
    expect(hero).toBeInTheDocument();

    // The subtitle used to name the filing status and the tax year, which made
    // the first thing on the page a readout of two controls the reader had not
    // reached yet. It now says why the next dollar is not priced at the rate
    // the reader came expecting, which is the whole page in one line.
    const subtitle = hero.nextElementSibling as HTMLElement;
    expect(subtitle).toHaveClass('subtitle');
    expect(subtitle).toHaveTextContent(/how Social Security is taxed/);
    expect(subtitle).toHaveTextContent(/can actually decrease as income increases/);
    expect(subtitle).not.toHaveTextContent(/single filer/i);
    expect(subtitle).not.toHaveTextContent(/2025|2026/);

    // And it stays put when those controls move.
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(subtitle).not.toHaveTextContent(/married|2026/i);
  });

  it('renders the benefit slider defaulting to the 2026 average benefit', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue(String(AVG_ANNUAL_SS_BENEFIT));
    expect(within(benefitGroup()).getByText('$24,852')).toBeInTheDocument();
  });

  it('spans $0 to the 2026 maximum yearly benefit and shows avg/max labels', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(MAX_ANNUAL_SS_BENEFIT));
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    expect(screen.getByText('$62,172 (2026 max)')).toBeInTheDocument();
  });

  /**
   * Line 6a of a joint return holds both spouses' benefits, so both ends of
   * this slider and the marker between them are a couple's rather than one
   * person's. The ceiling doubles exactly — two maximum records — and the
   * average does not, because SSA's couple figure counts the spousal benefits
   * that are half a record rather than one.
   */
  describe('the benefit slider on a joint return', () => {
    const goJoint = (): void => {
      fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    };

    it('doubles the ceiling and moves the average marker with it', () => {
      render(<App />);
      goJoint();
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      expect(slider).toHaveAttribute('max', '124344');
      expect(screen.getByText('$38,496 (2026 couple avg)')).toBeInTheDocument();
      expect(screen.getByText('$124,344 (2026 couple max)')).toBeInTheDocument();
      expect(screen.queryByText('$24,852 (2026 avg)')).not.toBeInTheDocument();
      // And the label says whose benefit is being set.
      expect(
        screen.getByLabelText(/Annual Social Security Benefit \(both spouses\)/),
      ).toBe(slider);
    });

    /**
     * A reader sitting on the average has accepted the marker rather than
     * chosen a number, so the marker takes them with it — and switching back
     * puts them exactly where they started.
     */
    it('carries a reader sitting on the average across to the couple average', () => {
      render(<App />);
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      expect(slider).toHaveValue('24852');
      goJoint();
      expect(slider).toHaveValue('38496');
      fireEvent.click(screen.getByRole('radio', { name: 'Single' }));
      expect(slider).toHaveValue('24852');
      expect(slider).toHaveAttribute('max', '62172');
    });

    it('leaves a figure the reader set alone, and re-caps it on the way back', () => {
      render(<App />);
      const slider = screen.getByRole('slider', { name: /social security benefit/i });
      fireEvent.change(slider, { target: { value: '40000' } });
      goJoint();
      // Theirs, not the marker's, so it stays put where the average moved.
      expect(slider).toHaveValue('40000');

      fireEvent.change(slider, { target: { value: '100000' } });
      chooseFilingStatus('Single');
      // $100,000 is two benefits' worth and there is only one person on this
      // return now, so it comes back to the ceiling rather than standing past
      // the right edge of its own slider.
      expect(slider).toHaveValue('62172');
      expect(slider).toHaveAttribute('max', '62172');
      expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    });
  });

  it('updates the value, readout, and the axis the chart is drawn in', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    // The axis is total income, so the benefit is the fixed half of every
    // figure on it and the caption is where that half is named in dollars.
    expect(
      screen.getByText('Total income ($), including $24,852 of Social Security.'),
    ).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '36000' } });
    expect(slider).toHaveValue('36000');
    expect(within(benefitGroup()).getByText('$36,000')).toBeInTheDocument();
    expect(
      screen.getByText('Total income ($), including $36,000 of Social Security.'),
    ).toBeInTheDocument();
  });

  /**
   * The caption names what is inside a figure on the axis, and with no benefit
   * and nothing tax-exempt there is nothing inside it but the income the
   * slider moves. "Including $0 of Social Security" would be a sentence about
   * a zero, so the parts drop out one at a time and the axis keeps its name.
   */
  it('drops the caption’s clause when there is no benefit to name', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    expect(screen.getByText('Total income ($)')).toBeInTheDocument();

    // And the tax-exempt half stands on its own when it is the only part left.
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );
    expect(
      screen.getByText('Total income ($), including $5,000 of municipal interest.'),
    ).toBeInTheDocument();
  });

  it('renders a filing status selector defaulting to Single', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: /filing status/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Married Filing Jointly' }),
    ).not.toBeChecked();
    // The close repeats the status prose, so this asks the recap that closes
    // step 1 rather than the page.
    expect(scenarioRecap()).toHaveTextContent('a single filer');
  });

  /**
   * The page asks about two statuses and the strip is the whole question: no
   * menu beside it, and head of household and a separate return are gone from
   * the page rather than moved somewhere else on it. Asserted as an absence
   * across the whole document, because the failure worth catching is a note
   * or an explainer branch that outlived the option that reached it — the
   * strip losing an option would be caught by the list above either way.
   */
  it('offers two statuses and no way to reach the other two', () => {
    render(<App />);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'single',
      'mfj',
    ]);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const gone of [/head of household/i, /filing separately/i, /separate return/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('does not render a separate total federal tax panel', () => {
    render(<App />);
    expect(
      screen.queryByRole('heading', { name: /total federal tax paid/i }),
    ).not.toBeInTheDocument();
  });

  it('explains the tax torpedo with thresholds for the selected filing status and defaults to collapsed', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /what is the tax torpedo/i });
    const details = heading.closest('details') as HTMLElement;
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    /**
     * Scoped to the paragraph that quotes this return's own thresholds. The
     * last paragraph of the same explainer names all four bases as 86(c) wrote
     * them, which is the statute's history and does not follow the filing
     * status — so a page-wide "$25,000 is gone" would be asserting something
     * else, and would fail on prose that is correct.
     */
    const live = (): HTMLElement =>
      details.querySelector('.explainer-content p') as HTMLElement;

    expect(live()).toHaveTextContent(/provisional income passes \$25,000/);
    expect(live()).toHaveTextContent(/past \$34,000/);

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(live()).toHaveTextContent(/provisional income passes \$32,000/);
    expect(live()).toHaveTextContent(/past \$44,000/);
    expect(live()).not.toHaveTextContent('$25,000');
  });

  /**
   * The page used to open with a 2025/2026 picker, and clicking it was the only
   * way to watch the COLA raise the benefit while 86(c)'s bases sat still. That
   * is the app's own subject, so it is stated where a reader meets it rather
   * than left to whoever thinks to click twice and compare.
   */
  it('says the thresholds are frozen where the picker used to show it', () => {
    render(<App />);
    const frozen = screen.getByText(/The thresholds have not moved/).closest('p');
    expect(frozen).toHaveTextContent('IRC 86(c) set $25,000 and $32,000 in 1983');
    expect(frozen).toHaveTextContent('$34,000 and $44,000 in 1993');
    expect(frozen).toHaveTextContent('Neither has ever been indexed');
    // The point the frozen bases make: everything around them moves, so the
    // same real retirement drifts further over the line every year.
    expect(frozen).toHaveTextContent(
      'sits further past the same line every year',
    );
    // It is the same explainer the live thresholds are in, not a fifth block.
    expect(frozen?.closest('details')).toBe(
      screen.getByRole('heading', { name: /what is the tax torpedo/i }).closest('details'),
    );
  });

  it('lists strategies to mitigate the tax torpedo and defaults to collapsed', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /how to mitigate the tax torpedo/i });
    expect(heading).toBeInTheDocument();
    const details = heading.closest('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    expect(screen.getByText('Spend from Roth accounts.')).toBeInTheDocument();
    expect(screen.getByText('Spend from taxable accounts.')).toBeInTheDocument();
    expect(
      screen.getByText("If you can't stay under it, blast past it."),
    ).toBeInTheDocument();
  });

  it('switches to Married Filing Jointly', () => {
    render(<App />);
    const mfj = screen.getByRole('radio', { name: 'Married Filing Jointly' });
    fireEvent.click(mfj);
    expect(mfj).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Single' })).not.toBeChecked();
    expect(scenarioRecap()).toHaveTextContent('a married couple filing jointly');
  });

  it('renders the tax advice disclaimer footer', () => {
    render(<App />);
    expect(
      screen.getByText(/not constitute tax or financial advice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/consult a qualified tax professional/i),
    ).toBeInTheDocument();
  });

  it('renders the ordinary income slider defaulting to $40,000', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(excluding social security\)/i,
    });
    expect(slider).toHaveValue('40000');
    expect(slider).toHaveAttribute('min', '0');
    // Wide enough for the senior deduction's phaseout, which the opening
    // return claims.
    expect(slider).toHaveAttribute('max', '175000');
  });

  it('offers an age 65 or older toggle, on by default, that widens the standard deduction', () => {
    render(<App />);
    const senior = screen.getByRole('checkbox', { name: 'Age 65 or older' });
    expect(senior).toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $18,150 — $16,100 base plus $2,050 for age 65 or older.',
    );

    fireEvent.click(senior);
    expect(senior).not.toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $16,100. Turning 65 adds $2,050.',
    );
  });

  it('offers the second spouse toggle only for MFJ, and only once the first is on', () => {
    render(<App />);
    expect(
      screen.queryByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    // The filer is 65 as the page opens, so the spouse's box is live at once.
    const spouse = screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' });
    expect(spouse).toBeEnabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $33,850 — $32,200 base plus $1,650 for age 65 or older.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(spouse).toBeDisabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $32,200. Turning 65 adds $1,650 per qualifying spouse.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(spouse).toBeEnabled();
    fireEvent.click(spouse);
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $35,500 — $32,200 base plus $3,300 for age 65 or older.',
    );
  });

  /**
   * The spouse's box answers the filer's question, so it goes when the
   * question does. Before this it stayed checked behind `disabled` — a box
   * that bought nothing, since the deduction had already stopped counting it —
   * and turning 65 again handed back a second $1,650 the reader had last seen
   * greyed out.
   */
  it('clears the spouse toggle when the filer stops being 65', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    const senior = screen.getByRole('checkbox', { name: 'Age 65 or older' });
    const spouse = screen.getByRole('checkbox', {
      name: 'Both spouses are 65 or older',
    });

    // The filer opens at 65, so only the spouse's box needs ticking.
    fireEvent.click(spouse);
    expect(spouse).toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $35,500 — $32,200 base plus $3,300 for age 65 or older.',
    );

    fireEvent.click(senior);
    expect(spouse).not.toBeChecked();
    expect(spouse).toBeDisabled();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $32,200. Turning 65 adds $1,650 per qualifying spouse.',
    );

    // And the second one does not come back with the first.
    fireEvent.click(senior);
    expect(spouse).not.toBeChecked();
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $33,850 — $32,200 base plus $1,650 for age 65 or older.',
    );
  });

  it('describes the senior deduction and its phaseout beside the age toggle', () => {
    render(<App />);
    // Claimed as the page opens, so the note prices it and its phaseout.
    expect(screen.getByText(/^Senior deduction/)).toHaveTextContent(
      'Senior deduction $6,000 on top of that, shrinking by 6¢ per dollar of MAGI above $75,000 and gone at $175,000. It expires after tax year 2028.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(screen.getByText(/^Filers 65 or older/)).toHaveTextContent(
      'Filers 65 or older also get the temporary senior deduction — $6,000 each, for tax years 2025–2028 only.',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    // Two spouses lose 6¢ each, so the couple's $12,000 is gone $100,000 past
    // the threshold rather than $200,000 past it.
    expect(screen.getByText(/^Senior deduction/)).toHaveTextContent(
      'Senior deduction $12,000 ($6,000 per spouse) on top of that, shrinking by 12¢ per dollar of MAGI above $150,000 (6¢ for each spouse) and gone at $250,000. It expires after tax year 2028.',
    );
  });

  it('explains the senior deduction phaseout in a collapsed section', () => {
    render(<App />);
    const explainer = () =>
      screen
        .getByRole('heading', { name: /the senior deduction phaseout/i })
        .closest('details');

    expect(explainer()).toBeInTheDocument();
    expect(explainer()).not.toHaveAttribute('open');

    // 22% amplified by the 6% phaseout, and again by the torpedo's 1.85x.
    expect(explainer()).toHaveTextContent('$1.06');
    expect(explainer()).toHaveTextContent('23.32%');
    expect(explainer()).toHaveTextContent('$1.96');
    expect(explainer()).toHaveTextContent('43.14%');
    expect(explainer()).toHaveTextContent('gone at $175,000');
    // The deduction is claimed as the page opens, so the axis is sized to
    // its phaseout and the far side is on the chart. Take the box off and
    // the axis narrows back to $150,000 of other income — at the average
    // benefit, $170,155 of MAGI at the right edge — and the far side is not.
    expect(explainer()).toHaveTextContent('is inside the chart');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(explainer()).toHaveTextContent('sits past the right edge of the chart');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }));
    expect(explainer()).toHaveTextContent('24.64%');
    expect(explainer()).toHaveTextContent('45.58%');
    expect(explainer()).toHaveTextContent('gone at $250,000');
  });

  it('renders a tax-exempt interest slider defaulting to zero', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /tax-exempt \(municipal\) interest/i,
    });
    expect(slider).toHaveValue('0');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '50000');
    expect(
      screen.getByText(/^Municipal bond interest never enters taxable income/),
    ).toBeInTheDocument();
  });

  it('adds the municipal interest to the chart’s axis caption', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /tax-exempt \(municipal\) interest/i }),
      { target: { value: '5000' } },
    );

    expect(
      screen.getByText(
        'Total income ($), including $24,852 of Social Security and ' +
          '$5,000 of municipal interest.',
      ),
    ).toBeInTheDocument();
  });

  it('updates the ordinary income slider readout when moved', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(excluding social security\)/i,
    });
    fireEvent.change(slider, { target: { value: '50000' } });
    expect(slider).toHaveValue('50000');
  });
});

/**
 * Landmarks, and a way past step 1.
 *
 * Everything on this page used to render inside one `<div className="card">`
 * with the `<h1>` loose in it, so `<footer>` was the only landmark a screen
 * reader could jump to — on a page whose entire content is above the footer.
 * Jumping to landmarks is how a reader who cannot see the layout finds out
 * what the layout is, and this one answered "there is a disclaimer".
 *
 * The other half is the keyboard: step 1 is ten controls deep before the chart
 * begins, and until the skip link there was no way over them. Both halves fail
 * the same silent way — nothing throws, nothing renders differently, and the
 * only reader who notices is the one who was already worst served.
 *
 * `getByRole` is the assertion rather than `querySelector('main')` on purpose:
 * what is being claimed is the role an assistive technology computes, and
 * `<footer>` inside `<main>` computes to nothing at all.
 */
describe('the page’s landmarks', () => {
  it('gives a reader jumping by landmark all three of them', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('puts the title in the banner and the disclaimer outside the main', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('heading', { level: 1 }),
    );
    // The footer is `contentinfo` only while it is nobody's descendant but the
    // body's, which is the whole reason `.shell` is the main and `.card` is not.
    expect(screen.getByRole('main')).not.toContainElement(
      screen.getByRole('contentinfo'),
    );
  });

  it('holds both steps and the close inside the main', () => {
    render(<App />);
    const main = screen.getByRole('main');
    for (const id of ['step-benefit', 'step-torpedo', 'answer']) {
      expect(main).toContainElement(document.getElementById(id));
    }
  });

  /**
   * A note that only ever appears when a link asked for something out of
   * bounds, and so the one piece of visible content that could sit outside
   * every landmark without anyone noticing.
   */
  it('keeps the link note inside a landmark', () => {
    window.history.replaceState(null, '', '/?filing=widow');
    render(<App />);
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('status'),
    );
  });
});

/**
 * The skip link: first in the tab order, and pointed at something that can
 * take focus.
 *
 * An in-page link moves focus into its target only if the target is focusable,
 * which for a `<section>` means an explicit `tabindex="-1"`. Without it the
 * browser scrolls and leaves focus on the link, so the next Tab goes back to
 * the first control in step 1 and the skip link has skipped nothing. That is
 * the failure this guards: it is invisible in a screenshot and invisible in
 * every other test on the page.
 */
describe('the skip link', () => {
  const firstFocusable = (container: HTMLElement): Element | null =>
    container.querySelector(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

  /**
   * On a bare address and on one the page had to correct, because the second
   * is the case that can go wrong: the link note carries a Dismiss button, and
   * a skip link written below the note rather than above it is a skip link the
   * reader reaches second on exactly the arrival that needed it most.
   */
  it('is the first thing on the page a Tab can reach', () => {
    for (const address of ['/', '/?filing=widow']) {
      window.history.replaceState(null, '', address);
      const { container, unmount } = render(<App />);
      expect(firstFocusable(container)).toHaveTextContent(/skip to the chart/i);
      unmount();
    }
  });

  it('points past step 1 at something that can take the focus', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /skip to the chart/i });
    const target = document.getElementById(
      (link.getAttribute('href') ?? '').slice(1),
    );
    expect(target).not.toBeNull();
    expect(target).toHaveAttribute('tabindex', '-1');
    // Past step 1, not into it: a link landing inside the controls it exists
    // to skip would pass every check above and do nothing for the reader.
    expect(document.getElementById('step-benefit')).not.toContainElement(target);
  });
});

describe('the step flow', () => {
  /**
   * The whole point of the rewrite: the steps scroll rather than swap, so
   * every one of them is on the page at once. A reader on step 2 can scroll
   * back to the benefit they set in step 1, and Ctrl-F reaches all of it.
   */
  it('renders every step at once', () => {
    render(<App />);
    for (const name of [/your social security benefit/i, /^the tax torpedo$/i]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  /**
   * The two steps that came off the page: capital-gains stacking and the
   * conversion sizer. Their arithmetic is still in `lib/tax/` and still
   * under test there — what is gone is every trace of them a reader could
   * reach.
   */
  it('renders nothing of the steps that came off the page', () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: /capital gains stacking/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /sizing the conversion/i })).toBeNull();
    expect(document.getElementById('step-gains')).toBeNull();
    expect(document.getElementById('step-conversion')).toBeNull();
    expect(
      screen.queryByRole('slider', { name: /long-term capital gains/i }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: /bracket/i })).toBeNull();
  });

  /**
   * The nav and the next-step box, both gone.
   *
   * They were the price of length: a sticky strip marking which of four
   * sections you were in, and a box at the foot of each one naming the next.
   * Two sections on one scroll are not a walk anyone can be lost in, so both
   * were furniture — and the box was the worse of the two, because it took a
   * screen's width and four lines of prose to move the reader past a single
   * heading they could see from where they stood.
   *
   * Asserted as a shape rather than by class name: no toolbar anywhere, and
   * no button whose label counts steps. Putting either back under a different
   * name fails here.
   */
  it('offers nothing that navigates between the steps', () => {
    render(<App />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      screen.queryAllByRole('button').filter((b) => /step \d+ of/i.test(b.textContent ?? '')),
    ).toEqual([]);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  /**
   * The steps still number themselves, which is the whole of what the nav was
   * telling anyone: two of them, in this order. A kicker over each heading
   * says it without asking to be clicked.
   */
  it('still numbers both steps where each one starts', () => {
    const { container } = render(<App />);
    expect(
      Array.from(container.querySelectorAll('.step-kicker')).map((el) => el.textContent),
    ).toEqual(['Step 1 of 2', 'Step 2 of 2']);
  });

  /**
   * Both steps price the same return, and the inputs that set it are spread
   * across the page — the benefit in step 1, other income in step 2. Nothing
   * unmounts either, or a figure set in step 1 would be gone by the time the
   * close quoted it.
   */
  it('keeps every input mounted at once', () => {
    render(<App />);
    const income = screen.getByRole('slider', { name: /other income \(excluding social security\)/i });
    fireEvent.change(income, { target: { value: '90000' } });

    expect(
      screen.getByRole('slider', { name: /social security benefit/i }),
    ).toBeInTheDocument();
    expect(income).toHaveValue('90000');
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked();
  });
});

/**
 * Every step is laid out the same way, and this is the test of it.
 *
 * chart \u2192 the one control that says where on that chart you are \u2192 the
 * collapsed explainers. Step 1 has no curve of its own, so it starts at the
 * control. A control above its chart reads as an input to the chart, which
 * is exactly what it is not \u2014 the chart already prices every value the
 * control can take.
 */
describe('the shape every step shares', () => {
  /** The step's own landmarks in DOM order, runs of a kind collapsed. */
  const landmarks = (id: string): string[] => {
    const section = document.getElementById(id) as HTMLElement;
    const kinds = Array.from(
      section.querySelectorAll('.chart-container, input[type="range"], details'),
    )
      // A control inside a disclosure is that disclosure's business, not the
      // step's: the shape is about what the reader meets on the way down.
      .filter((el) => el.tagName === 'DETAILS' || el.closest('details') === null)
      .map((el) =>
        el.classList.contains('chart-container')
          ? 'chart'
          : el.tagName === 'DETAILS'
            ? 'details'
            : 'control',
      );
    return kinds.filter((kind, i) => kind !== kinds[i - 1]);
  };

  it('lays the charted step out chart, control, explainers', () => {
    render(<App />);
    expect(landmarks('step-torpedo')).toEqual(['chart', 'control', 'details']);
  });

  /**
   * Step 1 draws nothing, so the return it sets stands where a chart stands.
   * What it still owes the shape is the ordering of the rest: one control on
   * screen, the disclosure after it.
   */
  it('gives the uncharted step the same tail', () => {
    render(<App />);
    expect(landmarks('step-benefit')).toEqual(['control', 'details']);
  });

  it('puts the step’s control on the axis its own chart sweeps', () => {
    render(<App />);
    const slider = screen.getByRole('slider', {
      name: /other income \(excluding social security\)/i,
    });
    expect(document.getElementById('step-torpedo')?.contains(slider)).toBe(true);
  });

  /**
   * The readout is what makes the slider more than an inert control: it reads
   * the drawn curve back at the value the reader picked, which is the number
   * the chart cannot show them without being pointed at.
   */
  it('reads the torpedo curve back at the reader’s own income', () => {
    render(<App />);
    const readout = (): HTMLElement =>
      document.querySelector('#step-torpedo .slider-readout') as HTMLElement;
    expect(readout()).toHaveTextContent('At $40,000 of other income');

    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(excluding social security\)/i }),
      { target: { value: '90000' } },
    );
    expect(readout()).toHaveTextContent('At $90,000 of other income');
    expect(readout()).toHaveTextContent(/taxed at\s+\d+(\.\d+)?%/);
  });

  /**
   * The readout opens on the figure, not on a label for it.
   *
   * "You are here." led this paragraph for as long as it existed, and it was
   * the third thing on screen saying so: the dashed amber marker crosses the
   * curve at this point, the amber slider sits directly above, and the amber
   * figure beside the slider's label names the same income. Worse, it was
   * bold — the same weight as the rate, the tax and the effective rate — so
   * the phrase the paragraph stressed hardest was the only one with no figure
   * in it.
   *
   * Anchored at the start rather than asserted absent from the document: the
   * 400% explainer opens a paragraph the same way about a MAGI figure, and it
   * is a section lead inside a disclosure rather than a label on the chart.
   */
  it('opens on the reader’s income rather than a label for it', () => {
    render(<App />);
    const readout =
      document.querySelector('#step-torpedo .slider-readout') as HTMLElement;
    expect(readout).toHaveTextContent(/^At \$40,000 of other income/);
    expect(readout.querySelector('strong')).toHaveTextContent('22.2%');
  });
});

/**
 * What a chart says to a reader who cannot see it.
 *
 * A recharts chart is an SVG of unlabelled paths, so without a name the app's
 * centrepiece says nothing at all to a screen reader. The plot is one image
 * carrying one label: what is being plotted, and how far its axis runs.
 *
 * The band-by-band caption that sat under the figure until now — "0% up to
 * $14,750, 15% to $21,500, …" — is off the page. What states where the reader
 * is standing is the readout under the slider, which quotes their own dollar
 * rather than running through every band on the curve.
 *
 * Figures below are 2026, single, the $24,852 average benefit.
 */
describe('the charts as images', () => {
  const charts = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('.chart-container'));
  const chart = (step: 'torpedo'): HTMLElement =>
    document.querySelector(`#step-${step} .chart-container`) as HTMLElement;

  it('names the plot, and points at no description that is gone', () => {
    render(<App />);
    expect(charts()).toHaveLength(1);
    // The plot is one image with a name, not a tree of unlabelled paths.
    expect(chart('torpedo')).toHaveAttribute('role', 'img');
    expect(chart('torpedo').getAttribute('aria-label')).toMatch(/^Chart: /);
    // An aria-describedby whose target no longer renders is worse than none:
    // it promises a long description and resolves to nothing.
    expect(chart('torpedo')).not.toHaveAttribute('aria-describedby');
    expect(document.querySelector('figcaption')).toBeNull();
  });

  it('names the axis it plots, both halves of it, and where it stops', () => {
    render(<App />);
    // The axis is total income, so the name has to say what a figure on it is
    // made of: a benefit that stays put and other income that the slider
    // moves. Reading "$24,852 to $174,852" alone tells a listener nothing
    // about which of the two they control.
    expect(chart('torpedo').getAttribute('aria-label')).toBe(
      'Chart: the marginal tax rate on the next dollar of other income, ' +
        'plotted against total income from $24,852 to $199,852 — a fixed ' +
        '$24,852 of Social Security plus $0 to $175,000 of other income.',
    );
    // The axis is sized to the return, and the label follows it in — the
    // $175,000 is the senior deduction's phaseout, and a filer under 65 has
    // no phaseout to fit.
    fireEvent.click(screen.getByRole('checkbox', { name: /65 or older/i }));
    expect(chart('torpedo').getAttribute('aria-label')).toMatch(
      /plus \$0 to \$150,000 of other income\.$/,
    );
  });
});

/**
 * The scenario block opens on five inputs and hides two.
 *
 * A closed `<details>` still renders its children into jsdom, so every other
 * test in this file reaches those two sliders exactly as it did before the
 * split — which means nothing here can be inferred from the rest of the suite
 * passing. These tests assert the split itself: which inputs are inside the
 * disclosure, that it starts shut, and that shutting it never hides a value
 * that has been set.
 */
describe('advanced inputs', () => {
  // "Advanced inputs" is also the name two sections use when they point a
  // reader at a slider they cannot see, so pin the summary's own label.
  const advanced = (): HTMLElement =>
    screen
      .getByText('Advanced inputs', { selector: '.advanced-label' })
      .closest('details') as HTMLElement;

  /** The status line beside the label — what the section still says while shut. */
  const advancedState = (): HTMLElement =>
    advanced().querySelector('.advanced-state') as HTMLElement;

  it('starts collapsed', () => {
    render(<App />);
    expect(advanced()).toBeInTheDocument();
    expect(advanced()).not.toHaveAttribute('open');
  });

  /**
   * The line that justifies the whole disclosure: at its default it changes
   * nothing, so there is nothing to see until it is moved.
   */
  it('reports it sitting at its default', () => {
    render(<App />);
    expect(advancedState()).toHaveTextContent('At $0');
  });

  it('holds the input that belongs to no chart axis', () => {
    render(<App />);
    const inside = within(advanced());
    expect(inside.getByLabelText('Tax-Exempt (Municipal) Interest')).toHaveValue(
      '0',
    );
    expect(
      inside.queryByLabelText('Long-Term Capital Gains Inside That Income'),
    ).toBeNull();
  });

  /**
   * The complement, and the more important half. Two things earn a slider its
   * place on screen: it moves the opening picture, or it is the point on a
   * chart the reader is standing at.
   */
  it('leaves the inputs that move the opening picture on screen', () => {
    render(<App />);
    for (const label of [
      'Annual Social Security Benefit',
      'Other Income (excluding Social Security)',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBeNull();
    }
    for (const legend of ['Filing Status', 'Age']) {
      expect(screen.getByRole('group', { name: legend }).closest('details')).toBeNull();
    }
  });

  it('names the input once it has been moved off zero', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '5000' } },
    );
    expect(advancedState()).toHaveTextContent('Muni interest $5,000');

    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '0' } },
    );
    expect(advancedState()).toHaveTextContent('At $0');
  });

  /**
   * The disclosure sits at the foot of step 1 and the step below it prices off
   * what is in there, so a value set once has to survive everything the reader
   * does further down the page — which used to mean stepping through the nav
   * and now means working step 2's own slider.
   */
  it('keeps its values while the reader works the step below', () => {
    render(<App />);
    fireEvent.change(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
      { target: { value: '9000' } },
    );
    fireEvent.change(
      screen.getByRole('slider', { name: /other income \(excluding social security\)/i }),
      { target: { value: '90000' } },
    );
    expect(
      screen.getByLabelText('Tax-Exempt (Municipal) Interest'),
    ).toHaveValue('9000');
    expect(advancedState()).toHaveTextContent('Muni interest $9,000');
  });
});

/* ------------------------------------------------------------------ */
/*  The line that closes step 1                                        */
/* ------------------------------------------------------------------ */

/**
 * The hero says what the page is for; this says what it is currently pricing.
 * The two used to be one sentence, which meant the first thing on the page was
 * a readout of controls the reader had not scrolled to yet.
 */
describe('scenario recap', () => {
  it('closes step 1, on the way into the next one', () => {
    render(<App />);
    const recap = scenarioRecap();
    expect(recap.closest('section')).toHaveAttribute('id', 'step-benefit');
    // The last thing in the step, now that the box that followed it is gone.
    expect(recap.nextElementSibling).toBeNull();
  });

  it('names the return the defaults describe', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a single ' +
        'filer, 65 or older, collecting $24,852 of Social Security per year.',
    );
  });

  it('follows the status and the benefit', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '48000' } },
    );
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a married ' +
        'couple filing jointly, one spouse 65 or older, collecting $48,000 of Social ' +
        'Security per year.',
    );
  });

  /**
   * One qualifying spouse and two are different returns — one senior deduction
   * against two, and the standard-deduction addition once against twice — so
   * the joint case gets its own wording rather than a bare "65 or older".
   */
  it('distinguishes one senior from two on a joint return', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    expect(scenarioRecap()).toHaveTextContent('one spouse 65 or older');

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Both spouses are 65 or older' }),
    );
    expect(scenarioRecap()).toHaveTextContent('both spouses 65 or older');
  });

  it('says 65 or older once for a return with only one filer', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent('a single filer, 65 or older,');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Age 65 or older' }));
    expect(scenarioRecap()).toHaveTextContent('a single filer, under 65,');
  });

  it('says so when there is no benefit at all', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    expect(scenarioRecap()).toHaveTextContent(
      'collecting no Social Security at all.',
    );
    expect(scenarioRecap()).not.toHaveTextContent('$0 of Social Security');
  });

  /**
   * The recap used to end at the benefit and then point at the disclosure —
   * "Plus whatever is set under Advanced inputs above" — which is a pointer at
   * a section that is shut by default, in the one sentence whose job is to say
   * what is being priced. It names the figures now.
   */
  it('names an advanced input once it is set, and only then', () => {
    render(<App />);
    expect(scenarioRecap()).not.toHaveTextContent('municipal interest');
    expect(scenarioRecap()).not.toHaveTextContent('Advanced inputs');

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '5000' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'collecting $24,852 of Social Security per year. Plus $5,000 in ' +
        'municipal interest.',
    );

    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '0' },
    });
    expect(scenarioRecap()).not.toHaveTextContent('municipal interest');
    expect(scenarioRecap()).not.toHaveTextContent('Plus');
  });

  /**
   * The bullet that asked for this pinned the recap end to end, from the year
   * to the figure a reader set by hand, so that is what is pinned.
   */
  it('names the advanced input in the sentence the filer’s does not cover', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Married Filing Jointly' }));
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '38500' } },
    );
    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '3750' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'One year’s return: 2026 brackets and standard deduction, a married ' +
        'couple filing jointly, one spouse 65 or older, collecting $38,500 ' +
        'of Social Security per year. Plus $3,750 in municipal interest.',
    );
  });

  /**
   * The figure a reader set by hand gets a sentence of its own rather than
   * another clause hung off the filer: the first sentence describes a filer,
   * and this is neither a fact about the filer nor a fifth thing of the same
   * kind. The full stop before "Plus" is the whole difference, so it is pinned
   * rather than left to a substring that would pass either way.
   */
  it('starts a second sentence rather than extending the first', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '3750' },
    });
    expect(scenarioRecap().textContent).toMatch(/per year\. Plus \$3,750/);
    expect(scenarioRecap().textContent).not.toMatch(/per year,/);
  });

  it('keeps the no-benefit reading a sentence when an input is set', () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole('slider', { name: /social security benefit/i }),
      { target: { value: '0' } },
    );
    fireEvent.change(screen.getByLabelText('Tax-Exempt (Municipal) Interest'), {
      target: { value: '5000' },
    });
    expect(scenarioRecap()).toHaveTextContent(
      'collecting no Social Security at all. Plus $5,000 in municipal ' +
        'interest.',
    );
  });
});

/**
 * The year used to be a two-button segmented control at the top of step 1, and
 * clicking it re-priced the whole page. It is a constant now: the comparison it
 * demonstrated — the COLA raising the benefit while IRC 86(c)'s bases sit still
 * — is the page's subject rather than one of its inputs, and is made in prose
 * under step 2 where a reader meets it without having to think to click twice.
 */
describe('the year the page prices', () => {
  it('offers no way to change it', () => {
    render(<App />);
    expect(screen.queryByRole('group', { name: /tax year/i })).toBeNull();
    for (const year of TAX_YEARS) {
      expect(screen.queryByRole('radio', { name: String(year) })).toBeNull();
    }
  });

  it('names PAGE_TAX_YEAR in the recap and prices the deduction for it', () => {
    render(<App />);
    expect(scenarioRecap()).toHaveTextContent(
      `${PAGE_TAX_YEAR} brackets and standard deduction`,
    );
    expect(screen.getByText(/^Standard deduction/)).toHaveTextContent(
      'Standard deduction $18,150 — $16,100 base plus $2,050 for age 65 or older.',
    );
  });

  it('opens the benefit slider on that year’s average, running to its maximum', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /social security benefit/i });
    expect(slider).toHaveValue('24852');
    expect(slider).toHaveAttribute('max', '62172');
    expect(screen.getByText('$24,852 (2026 avg)')).toBeInTheDocument();
    expect(screen.getByText('$62,172 (2026 max)')).toBeInTheDocument();
  });

  /**
   * The point of `PAGE_TAX_YEAR` being a constant rather than `defaultTaxYear()`:
   * a page built on the wall calendar would re-price itself the January after a
   * new Rev. Proc. landed, and the link a reader sent in December would mean
   * something else by then. Every other test here pins the clock; this one does
   * not, so a drifting figure would fail it wherever the calendar stands.
   */
  it('does not follow the wall calendar', () => {
    vi.useRealTimers();
    render(<App />);
    expect(TAX_YEARS).toContain(PAGE_TAX_YEAR);
    expect(scenarioRecap()).toHaveTextContent(
      `${PAGE_TAX_YEAR} brackets and standard deduction`,
    );
  });
});

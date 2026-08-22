# The shelf

Finished, tested, sourced modules that nothing on the page imports.

Everything under `src/utils/` is reached, eventually, by something a reader can
see — with one stated exception, named at the bottom of this file. Everything
here is not, and is here so that the difference is visible from the file tree
instead of having to be rediscovered by grep.

## What is on it

| Module | Lines | What it computes |
| --- | --- | --- |
| `projection.ts` | 480 | 10–30 years of one scenario: brackets, standard deductions and capital-gain bands indexed forward at an assumed rate under IRC 1(f), the Social Security provisional-income thresholds deliberately *not* indexed, RMDs switching on at the SECURE 2.0 applicable age, and lifetime federal tax reported in start-year dollars. |
| `sequencing.ts` | 730 | The same horizon spent three ways — taxable first, proportional, and bracket-filling to a chosen ceiling — scored against each other on lifetime real federal tax. Built on `projection.ts`. |
| `stateTax.ts` | 269 | State treatment of a Social Security benefit for the two years this app prices: the nine states that taxed one in 2025 and the eight that still do in 2026, each with its own mechanism, its rule in a sentence, its test for each year and its source. A lookup table rather than a calculation, because no two of the nine share a shape. |
| `lumpSum.ts` | 409 | The IRC 86(e) election for a retroactive award: Pub 915 Worksheet 2 run once per back-pay year, against the default of taxing the whole award in the year it arrives. |
| `conversion.ts` | 320 | The seven ceilings a Roth conversion might be sized against — two bracket tops, the two Social Security bases, the 0% capital-gain band, Medicare's first IRMAA cliff and 400% of the poverty line — each with the income definition it caps, plus the search that finds the largest conversion fitting under one and what it costs. |
| `gainsCurve.ts` | 108 | The two rates on a long-term gain, swept from $0: what the next dollar of it costs, and what the gain has cost so far as a share of itself. Chart data, not pricing — a gain is still priced by `totalTax` in `src/utils/tax.ts`. |

Each has a test file beside it, and they run in the same `npm run test` as
everything else. They are on the shelf, not in quarantine.

## Why they are here

Three of them were rendered once, as the Over Time and Strategies tabs, and
commit 5fe9854 removed those tabs when the app became a linear step-by-step
flow. That was explicitly a render-layer deletion: the arithmetic was good, and
throwing away the sourced lines counted in the table above because the page
around them changed shape would have been the expensive kind of tidying. `stateTax.ts` arrived the same way and later:
it rendered as a footnote under step 2's chart until the page dropped every
mention of state tax, which took the paragraph and left the table.

What kept them from coming straight back is that the page is a *this-year* page.
It asks "How Much Can You Take Out This Year?", and its steps set a scenario and
walk the torpedo — all inside one tax year, all priced against figures the IRS
has published. `projection.ts`, `sequencing.ts` and `lumpSum.ts` answer a
different question, and to answer it they have to assume things the rest of the
page never asks for: an inflation rate, a spending need, account balances, a
birth year, a decade of them. That is a second app's worth of input hanging off a step of its own, which
is why the flow has none.

`stateTax.ts` is here for the opposite reason. It costs almost nothing to
render — a menu and a paragraph — and it was rendered, right up until the page
decided to be federal-only. It is shelved by a decision about scope rather than
by a decision about input cost, and it comes back when that decision does.

`conversion.ts` and `gainsCurve.ts` are the same shape as `stateTax.ts` and
arrived last. They were steps 3 and 4 — Capital gains stacking and Sizing the
conversion — and they came off in the pass that narrowed the page to the
torpedo alone. Neither needs an input the configuration column does not already
collect, so neither is shelved for what it would cost to render; both are
shelved because the page asks one question now.

They are also the two that were *not* files when they lost their sections. They
were chapters of `src/utils/tax.ts`, and they sat there long enough for
`conversion.ts` to become the odd case this directory exists to prevent: its
only caller in the repo was `sequencing.ts`, which is on this shelf, so
`src/utils/` was holding code whose sole consumer was shelved.

## The rule

Nothing outside `src/shelf/` imports from `src/shelf/`. `shelf.test.ts` fails if
anything does. Modules here may import each other freely, and may import
`src/utils/` — the rule is about direction, not about isolation. All six do
import `tax.ts`, because a rate or a threshold is still written down exactly
once and it is written down there.

So bringing a module back means *moving the file out* — into `src/utils/`, in the
same commit as the section that renders it. The directory is the decision, and
the only way to reverse the decision is to reverse the move.

### When a chapter can become a file

The unit here is the file, so a chapter of a *reached* file can only move if
nothing reached has to follow it across. That is the whole test, and it is
decidable by reading imports rather than by judgement:

- **`ltcgRateCurve`** had no caller in the repo at all. It moved.
- **The conversion ceilings** had one caller, `sequencing.ts`, already here.
  Moving them turned a `../utils/tax` import into a `./conversion` one and left
  nothing behind. They moved.
- **The IRC 1411 chapter** did not, and this is the exception the top of this
  file admits. It is equally unreached — `netInvestmentIncomeFor` counts only
  `ltcg`, and no control sets one — but `totalFederalTax` is the page's own
  "Federal income tax" figure and `IncomeAxisFeatures.niitEnd` is one of the
  three features the chart's axis is sized by. Both are reached, and both sit
  on top of the surtax. Moving 1411 would drag them here behind it or make
  `src/utils/` import from this directory, and that is the one thing the rule
  forbids. So the surtax stays in `tax.ts` under a dormancy note that says all
  of this, and `tax.test.ts`'s `dormant while the page sets no gain` fails the
  day it stops being true.

A dormant term of a live sum is not a shelved module. Writing that down is
cheaper than moving it twice.

## What it would take to bring one back

- **`projection.ts`** — the strongest candidate, because its thesis is the app's
  own: the $25,000/$34,000 thresholds have not moved since 1984 while every
  benefit has, so the same real income is taxed harder every year. One chart, one
  COLA slider, one birth year.
- **`sequencing.ts`** — needs `projection.ts` rendered first, plus three account
  balances and a spending figure, and it answers a question a reader who has not
  yet decided *this* year's withdrawal is not asking.
- **`lumpSum.ts`** — needs prior-year income for every year the award reaches
  back to. It is the right calculation for a narrow reader, and the input cost
  falls entirely on everyone else.
- **`stateTax.ts`** — the cheapest of the six: it is text, so it needs a
  selector in the configuration column and a paragraph under step 2's chart,
  which is exactly what it had. It comes back when states come back.
- **`gainsCurve.ts`** — needs one control, a gain slider, and step 2's chart
  already knows what to do with a gain: `marginalRateCurve` prices one, the
  axis makes room for the surtax band, and the 1411 chapter in `tax.ts` wakes
  up on its own. The cheapest of the six after `stateTax.ts`.
- **`conversion.ts`** — needs a ceiling picker and a place to put the six
  figures `sizeConversion` returns. No new input: every ceiling is read off the
  scenario the configuration column already sets.

## Open defects

Two bullets in `ralph/PLAN.md`'s Discovered Work are polish on code in this
directory: the shortfall figure summing nominal dollars under a caption
promising start-year ones, and whether the COLA slider should be anchored on
the raises the SSA has already announced. They are real, they are unfixed, and
they should stay unfixed while the code is here — fixing them today changes
nothing a reader can see. They come back with the section, which is the point
of having written them down.

`stateTax.ts` is the worked example of the move running both ways. It came off
this shelf in the commit that gave it a footnote under step 2's chart, and went
back on it in the commit that took the footnote away — the file moved both
times, because the move is the decision.

`conversion.ts` is the worked example of the other case: code that lost its
section but not its file, and so sat in `src/utils/` for two backlogs saying it
was reached. Splitting it out was a `git mv` that never happened until someone
asked why the two READMEs disagreed.

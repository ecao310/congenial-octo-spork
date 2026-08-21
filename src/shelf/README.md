# The shelf

Finished, tested, sourced modules that nothing on the page imports.

Everything under `src/utils/` is reached, eventually, by something a reader can
see. Everything here is not, and is here so that the difference is visible from
the file tree instead of having to be rediscovered by grep.

## What is on it

| Module | Lines | What it computes |
| --- | --- | --- |
| `projection.ts` | 636 | 10–30 years of one scenario: brackets, standard deductions and capital-gain bands indexed forward at an assumed rate under IRC 1(f), the Social Security provisional-income thresholds deliberately *not* indexed, RMDs switching on at the SECURE 2.0 applicable age, and lifetime federal tax reported in start-year dollars. |
| `sequencing.ts` | 800 | The same horizon spent three ways — taxable first, proportional, and bracket-filling to a chosen ceiling — scored against each other on lifetime real federal tax. Built on `projection.ts`. |
| `lumpSum.ts` | 409 | The IRC 86(e) election for a retroactive award: Pub 915 Worksheet 2 run once per back-pay year, against the default of taxing the whole award in the year it arrives. |

Each has a test file beside it, and they run in the same `npm run test` as
everything else. They are on the shelf, not in quarantine.

## Why they are here

They were rendered once, as the Over Time and Strategies tabs, and commit
5fe9854 removed those tabs when the app became a linear four-step flow. That was
explicitly a render-layer deletion: the arithmetic was good, and throwing away
1,845 sourced lines because the page around them changed shape would have been
the expensive kind of tidying.

What kept them from coming straight back is that the page is a *this-year* page.
It asks "How Much Can You Take Out This Year?", and its four steps set a
scenario, walk the torpedo, split the income into gains, and size a conversion —
all inside one tax year, all priced against figures the IRS has published. These
three modules answer a different question, and to answer it they have to assume
things the rest of the page never asks for: an inflation rate, a spending need,
account balances, a birth year, a decade of them. That is a second app's worth
of input hanging off a step 5, which is why the flow has four steps and this
directory has three files.

## The rule

Nothing outside `src/shelf/` imports from `src/shelf/`. `shelf.test.ts` fails if
anything does.

So bringing a module back means *moving the file out* — into `src/utils/`, in the
same commit as the section that renders it. The directory is the decision, and
the only way to reverse the decision is to reverse the move.

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

## Open defects

Three bullets in `ralph/PLAN.md`'s Discovered Work are polish on code in this
directory: the withdrawal-order comparison never pricing what its recurring gift
is worth to each order, the shortfall figure summing nominal dollars under a
caption promising start-year ones, and whether the COLA slider should be
anchored on the raises the SSA has already announced. They are real, they are
unfixed, and they should stay unfixed while the code is here — fixing them today
changes nothing a reader can see. They come back with the section, which is the
point of having written them down.

A fourth bullet used to be gated with them — the 2026 state figures — and is
not, because `stateTax.ts` earned its way off this list: it renders as a
footnote under step 2's chart. It is the worked example of what un-shelving
looks like.

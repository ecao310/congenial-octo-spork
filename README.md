# How Much Can You Take Out This Year?

One more dollar out of an IRA — a withdrawal, a Roth conversion, a realized
gain — can drag Social Security into the tax base behind it. What that dollar
actually costs is often nothing like the bracket it lands in: 12% becomes 22.2%
and 22% becomes 40.7%, and then the curve falls back down again.

This is one page that draws that cost across every income level for one
reader's own return, and marks the stretches worth filling and the ones worth
stepping around.

**Live:** https://ecao310.github.io/congenial-octo-spork/

## The two steps

Both steps have the same shape: the chart first, then the one control that
moves the reader along it, then collapsed explainers. Step 1 is the exception
that sets the rule — it has no curve of its own, so the return itself stands
where the chart stands below it.

1. **Your Social Security benefit** — the return everything after it prices:
   who files it, who on it has reached 65, and how much Social Security it
   collects. A joint return puts both spouses' benefits on one line, so the
   slider's ceiling and the average marked under it are a couple's there and
   one worker's everywhere else.
2. **The tax torpedo** — the marginal rate on the next dollar of other income,
   plotted against **total income**: the benefit set in step 1, which the
   slider cannot move, plus the other income it can. The slider is still in
   other income, so the axis and the control are in different units, and the
   marker, the tooltip and the caption under the plot all name both halves in
   dollars rather than leaving the split to be inferred from a position. The
   senior-deduction phaseout is in the curve, because it is tax. The IRMAA
   cliffs and the 400% poverty-line cliff are not: they are a Medicare premium
   and a Marketplace credit, so they are priced for the reader's own income in
   the chart's tooltip and drawn across the axis only when the **Breakpoints**
   button in the corner of the plot is asked for them. Every figure under it is
   a federal one.

The page closes on the six figures the whole walk was for: total income,
federal tax, effective rate, the rate on the next dollar, the taxable share of
the benefit, and the Medicare surcharge that MAGI buys.

## What is priced

`src/lib/tax/` runs the whole 1040 chain for tax years 2025 and 2026:
provisional income and the 50%/85% inclusion worksheet, the base standard
deduction plus the 65+ additional amount plus the OBBBA senior deduction and
its 6% phaseout, ordinary brackets, capital gains stacked on top of ordinary
taxable income, tax-exempt interest that moves provisional income without
moving the tax base, the IRMAA tiers on their two-year MAGI lag, and the
premium tax credit's 400% cliff under IRC 36B.

Two filing statuses, single and joint. The tax code has four, and this priced
all four for a long time — head of household with its own bracket table and
standard deduction under IRC 1(j)(2)(B) and 63(c)(2)(B), and a separate return
that lived with its spouse, whose $0 provisional-income bases under 86(c)(1)(C)
leave it with no valley and no hump at all. Neither was ever offered on the
page, and each cost a branch in the engine, a nullable return type, and a
paragraph of prose per explainer. A link that still names one is answered on
arrival rather than read past, because a filing status moves every figure there
is; see [Sharing a return](#sharing-a-return).

That last one is a credit the government stops paying rather than a tax it
charges, and it has a MAGI of its own: 36B(d)(2)(B) counts AGI plus tax-exempt
interest plus *the untaxed part of the benefit*, which undoes the torpedo and
puts the whole benefit in household income at every income level. So it rises a
flat dollar per dollar of other income where Medicare's rises by up to $1.85,
and the two cliffs on step 2's chart travel at different speeds. It also has a
year in it: ARPA section 9661, extended through 2025 by the Inflation Reduction
Act, replaced the applicable-percentage table with one that ran past 400% and
capped a household's own share at 8.5% of income, so there is no cliff to draw
on a 2025 return and there is one on a 2026 return. What crossing it costs is
the benchmark silver premium for the household's age and county, which this app
has no way to know — so the line is drawn where it falls and the loss is left
blank.

The Social Security thresholds — $25,000/$34,000 and $32,000/$44,000 — are not
indexed and stay frozen across both years while everything around them moves.
That
contrast used to be a two-button year selector, and clicking it was the only
way to see the point being made. The page states it in prose instead and
prices one year: `PAGE_TAX_YEAR` in `src/lib/tax/params.ts`. Everything below
that constant stays parameterized by year — the engine prices any year on file,
the tests exercise all of them — so moving the page to a new year is one line, in
the same place a reader would go to check the figures behind it.

## Sharing a return

The whole scenario lives in the query string, so a link survives a refresh and
can be sent to a spouse or an advisor: `filing`, `ss`, `income`, `muni`,
`senior`, `spouse`. Nothing is written unconditionally — a key appears only
when it differs from what the page opens with, so an untouched page has no
query string at all and every key present is something the reader did. A link
asking for something the page cannot show — an income past the slider's bound,
a benefit past the year's maximum — is clamped to what it can, and the page
says on load what it changed. A `year` in an older link is read past in
silence: there is no year to switch to, so there is nothing to tell the reader
and nothing to point them at. `ltcg`, `ceiling` and `qcd` are read past the
same way, for the same reason — each named a step that is no longer on the
page, and `ltcg` and `qcd` moved the curve, so honouring either would set a
figure no reader could see or change. The step is a fragment
(`#step-torpedo`), not a query parameter: it is where the reader is standing,
not what the return holds.

What the link looks like before it is opened is `index.html`: an Open Graph
and Twitter card block, pointing at `public/og-cover.png`. The card is not the
reader's own scenario and cannot be — this is static files on GitHub Pages, so
no server ever sees the query string, and a card built from figures would be
quoting the default's figures at everyone who shared a link. It says what the
page is; the figures stay on the page.

The curve on that card is the real one. `scripts/og-cover.mjs` bundles
`marginalRateCurve` out of `src/lib`, samples it for the scenario the page
opens on, and rasterises the result:

```bash
node scripts/og-cover.mjs   # rewrites public/og-cover.png and public/apple-touch-icon.png
```

It is run by hand rather than in CI, because rasterising needs a browser and
neither deploy workflow installs one — so the PNG is committed. `the cover` in
`src/guards/meta.test.ts` is what notices when it goes stale: it reads the
image's
size back out of the file, checks the mark and the card are still painted in
`:root`'s own colours, and fails if the rate the description quotes is no
longer the rate the arithmetic reaches.

## Development

```bash
npm install
npm run dev      # start dev server
npm run test     # vitest, 391 tests
npm run lint     # eslint
npm run build    # tsc -b && vite build
```

## Layout

| Path | What it is |
| --- | --- |
| `src/App.tsx` | The composition root: the return in state, the figures derived from it, and the three sections it hands them to. |
| `src/components/` | What the page is made of — the two steps, the chart and its tooltip, the Breakpoints panel, the five explainers, the close. |
| `src/hooks/` | The three pieces of behaviour that are not markup: the live region's debounce, the address bar, and dismissing a panel. |
| `src/lib/tax/` | Every figure on the page, and the only place a rate or a threshold is written down. One module per chapter of the code, behind `index.ts`. |
| `src/lib/scenarioUrl.ts` | The return, encoded into the address bar and clamped back out of it. |
| `src/lib/format.ts`, `src/lib/returnProse.ts` | How a figure is rendered, and how a return is described in words. |
| `src/styles/` | `index.css` and the subset of its palette the charts hand to SVG attributes. |
| `src/guards/` | The four suites that hold down what no other test reads: the build's chunking, the link preview and the README, the rendered prose, the stylesheet. |
| `src/test/` | Test setup and the fixtures more than one suite shares. |
| `public/` | The favicon, the touch icon and the link-preview card. |
| `scripts/og-cover.mjs` | Redraws the card from the page's own arithmetic. Run by hand; see above. |

Tests sit beside what they test: `src/lib/tax/irmaa.test.ts` next to `irmaa.ts`,
and the three `src/App.*.test.tsx` suites next to `App.tsx`, each rendering the
whole page and asking about one subject — the steps, the chart's thresholds, the
close.

## Deployment

The repo has one GitHub Pages site and one workflow that publishes it,
`.github/workflows/deploy.yml`, which runs on a push to either branch. Every
push to `main` tests, builds and publishes it at
https://ecao310.github.io/congenial-octo-spork/

Every push to `dev` publishes a preview nested under it, at
https://ecao310.github.io/congenial-octo-spork/preview/ .

Whichever branch pushed, the run checks out both, builds `main` at the root
and `dev` under `/preview/`, and publishes the combined tree. It has to: a
Pages deploy replaces the whole site, and when each branch had a workflow of
its own, every push to `main` published `main`'s build alone and took the
preview down until `dev` was next pushed. The production URL therefore always
serves `main`, and `dev` never needs to be merged to be seen. A broken `dev`
does not hold `main` back — pushed from `main`, a preview that fails its tests
or build is logged and production ships without it; pushed from `dev`, it
fails the run and nothing is published.

`the front door` in `src/guards/meta.test.ts` holds this section to that
file: it reads each "push to `branch`" sentence above and the URL it gives,
the branches the workflow fires on and the branch→base pairs its `env`
declares, and fails if any of them stop agreeing — or if **Live:** at the top
names a URL no branch here publishes. What it cannot see is which branch is
ahead of which: this file went on calling `main` the pre-rewrite app after the
merge had already landed, and the test stayed green the whole time, because
the link and the workflow it named still agreed with each other. Moving the
front door is a README edit; noticing that nobody made it is still a human
job.

---

Not tax advice. Every figure here is a model of published IRS and CMS numbers,
and a real return has facts a page like this never asks for.

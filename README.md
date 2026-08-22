# How Much Can You Take Out This Year?

One more dollar out of an IRA — a withdrawal, a Roth conversion, a realized
gain — can drag Social Security into the tax base behind it. What that dollar
actually costs is often nothing like the bracket it lands in: 12% becomes 22.2%
and 22% becomes 40.7%, and then the curve falls back down again.

This is one page that draws that cost across every income level for one
reader's own return, and marks the stretches worth filling and the ones worth
stepping around.

**Live:** https://ecao310.github.io/congenial-octo-spork/preview/

`dev` is the working branch, and that URL is where it publishes. The bare
https://ecao310.github.io/congenial-octo-spork/ is the same Pages site's other
build: it serves `main`, which has none of this rewrite on it and still opens
as *Marginal Tax Rate*. Nothing here has been merged there yet, and until it
is, the preview path is the page this README describes — see
[Deployment](#deployment) for why one repo publishes two apps.

## The two steps

Both steps have the same shape: the chart first, then the one control that
moves the reader along it, then collapsed explainers, then a box to the next
step.

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
   the chart's tooltip and drawn across the axis only when the **Lines** button
   above the plot is asked for them. Every figure under it is a federal one.

Two more steps stood here — Capital gains stacking, which split the income
already entered into ordinary and long-term halves, and Sizing the conversion,
which read off the largest conversion fitting under a chosen ceiling. Both came
off the page so that it asks one question, and both are coming back. What they
rendered is gone; what they rendered *from* is untouched and still under test,
on the shelf as `src/shelf/gainsCurve.ts` and `src/shelf/conversion.ts`. The
3.8% surtax those steps were the only route to did not go with them: it is a
term of `totalFederalTax`, which the close still prints, so `niitFor` stays in
`src/utils/tax.ts` under a note saying it is dormant rather than shelved. See
[`src/shelf/README.md`](src/shelf/README.md) for why the line falls there.

The page closes on the six figures the whole walk was for: total income,
federal tax, effective rate, the rate on the next dollar, the taxable share of
the benefit, and the Medicare surcharge that MAGI buys.

## What is priced

`src/utils/tax.ts` runs the whole 1040 chain for tax years 2025 and 2026:
provisional income and the 50%/85% inclusion worksheet, the base standard
deduction plus the 65+ additional amount plus the OBBBA senior deduction and
its 6% phaseout, ordinary brackets for all four filing statuses, capital gains
stacked on top of ordinary taxable income, tax-exempt interest that moves
provisional income without moving the tax base, the 3.8% net investment income
tax of IRC 1411, the IRMAA tiers on their two-year MAGI lag, and the premium
tax credit's 400% cliff under IRC 36B.

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

Section 1411 is charged on the *lesser* of net investment income and MAGI over
the threshold, and only the capital gain counts as net investment income here —
a distribution is excluded by 1411(c)(5), and tax-exempt interest is outside
both the income and the MAGI, even while it is moving provisional income. So
the surtax is priced by the engine and is $0 for everything the page can
currently set: with the gains step off the page there is no net investment
income for it to reach. It is charged again the moment a gain is back on the
page, which is the third effect stacking on the same axis.

The Social Security thresholds — $25,000/$34,000 and $32,000/$44,000 — are not
indexed and stay frozen across both years while everything around them moves,
and neither are 1411's $200,000/$250,000/$125,000, fixed since 2013. That
contrast used to be a two-button year selector, and clicking it was the only
way to see the point being made. The page states it in prose instead and
prices one year: `PAGE_TAX_YEAR` in `src/utils/tax.ts`. Everything below that
constant stays parameterized by year — the engine prices any year on file, the
tests exercise all of them — so moving the page to a new year is one line, in
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
`marginalRateCurve` out of `src/utils`, samples it for the scenario the page
opens on, and rasterises the result:

```bash
node scripts/og-cover.mjs   # rewrites public/og-cover.png and public/apple-touch-icon.png
```

It is run by hand rather than in CI, because rasterising needs a browser and
neither deploy workflow installs one — so the PNG is committed. `the cover` in
`src/meta.test.ts` is what notices when it goes stale: it reads the image's
size back out of the file, checks the mark and the card are still painted in
`:root`'s own colours, and fails if the rate the description quotes is no
longer the rate the arithmetic reaches.

## Development

```bash
npm install
npm run dev      # start dev server
npm run test     # vitest, 654 tests
npm run lint     # eslint
npm run build    # tsc -b && vite build
```

## Layout

| Path | What it is |
| --- | --- |
| `src/App.tsx` | The page: both steps, the chart, the explainers, the close. |
| `src/utils/tax.ts` | Every figure on the page, and the only place a rate or a threshold is written down. |
| `src/utils/scenarioUrl.ts` | The return, encoded into the address bar and clamped back out of it. |
| `src/shelf/` | Finished, tested modules that nothing on the page imports. See [`src/shelf/README.md`](src/shelf/README.md). |
| `public/` | The favicon, the touch icon and the link-preview card. |
| `scripts/og-cover.mjs` | Redraws the card from the page's own arithmetic. Run by hand; see above. |

Nothing outside `src/shelf/` may import from it, and a test enforces that.
Bringing a shelved module back is a `git mv` in the same commit as the section
that renders it.

## Deployment

Every push to `main` runs the tests, builds, and deploys to GitHub Pages:
https://ecao310.github.io/congenial-octo-spork/

Every push to `dev` publishes a preview alongside it, at
https://ecao310.github.io/congenial-octo-spork/preview/ . The repo has one
Pages site, so `.github/workflows/deploy-preview.yml` rebuilds main's site
verbatim from `main` and nests the dev build underneath it. The production URL
therefore always serves `main`; `dev` never needs to be merged to be seen —
and, for as long as `main` is the pre-rewrite app, the production URL is not
this page. That is why the link at the top of this file is the preview one.

`the front door` in `src/meta.test.ts` holds the two together: it reads the
working branch out of the sentence under that link, finds the workflow that
triggers on that branch, derives the base that workflow builds with, and fails
if the link and the workflow stop agreeing. Merging `dev` into `main` is
therefore a README edit the test will ask for rather than one to remember.

---

Not tax advice. Every figure here is a model of published IRS and CMS numbers,
and a real return has facts a page like this never asks for.

# How Much Can You Take Out This Year?

One more dollar out of an IRA — a withdrawal, a Roth conversion, a realized
gain — can drag Social Security into the tax base behind it and shove a
long-term gain out of the 0% band at the same time. What that dollar actually
costs is often nothing like the bracket it lands in: 12% becomes 22.2% and 22%
becomes 40.7%, and where a gain is in play the two effects compound into a
figure well past the statutory 15%.

This is one page that draws that cost across every income level for one
reader's own return, and answers the question in its title with a dollar
figure.

**Live:** https://ecao310.github.io/congenial-octo-spork/

## The four steps

Every step has the same shape: the chart first, then the one control that moves
the reader along it, then collapsed explainers, then a box to the next step.

1. **Your Social Security benefit** — the return everything after it prices:
   who files it, who on it has reached 65, and how much Social Security it
   collects. A joint return puts both spouses' benefits on one line, so the
   slider's ceiling and the average marked under it are a couple's there and
   one worker's everywhere else.
2. **The tax torpedo** — marginal rate against every dollar that is not Social
   Security. The senior-deduction phaseout is in the curve, because it is tax.
   The IRMAA cliffs and the 400% poverty-line cliff are not: they are a
   Medicare premium and a Marketplace credit, so they are priced for the
   reader's own income in the chart's tooltip and drawn across the axis only
   when the **Lines** button above the plot is asked for them. Every figure
   under it is a federal one.
3. **Capital gains stacking** — how much of the income already entered is a
   long-term gain. Gains are a *share* of that figure, not an addition to it,
   so moving the slider re-prices the same return rather than inventing a
   richer one.
4. **Sizing the conversion** — pick a ceiling (a bracket edge, an inclusion
   threshold, the top of the 0% gain band, an IRMAA tier, 400% of the poverty
   line) and read off the largest conversion that fits under it, what it costs,
   and the average cost per dollar converted.

The page closes on the eight figures the whole walk was for: total income,
federal tax, the 3.8% net investment income surtax inside it, effective rate,
the rate on the next dollar, the taxable share of the benefit, the Medicare
surcharge that MAGI buys, and the room left to convert.

## What is priced

`src/utils/tax.ts` runs the whole 1040 chain for tax years 2025 and 2026:
provisional income and the 50%/85% inclusion worksheet, the base standard
deduction plus the 65+ additional amount plus the OBBBA senior deduction and
its 6% phaseout, ordinary brackets for all four filing statuses, capital gains
stacked on top of ordinary taxable income, QCDs excluded under IRC 408(d)(8),
tax-exempt interest that moves provisional income without moving the tax base,
the 3.8% net investment income tax of IRC 1411, the IRMAA tiers on their
two-year MAGI lag, and the premium tax credit's 400% cliff under IRC 36B.

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
the threshold, which is why it belongs on a page about stacking: a pension or
an IRA withdrawal is expressly outside the surtax and still raises the MAGI it
is measured against, so it drags an already-realized gain into the base at
3.8%. Only the capital gain counts as net investment income here — a
distribution is excluded by 1411(c)(5), and tax-exempt interest is outside both
the income and the MAGI, even while it is moving provisional income.

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
can be sent to a spouse or an advisor: `filing`, `ss`, `income`, `ltcg`,
`muni`, `qcd`, `senior`, `spouse`, `ceiling`. Nothing is written
unconditionally — a key appears only when it differs from what the page opens
with, so an untouched page has no query string at all and every key present is
something the reader did. A link asking for something the page cannot show —
an income past the slider's bound, a gift past the statutory limit — is
clamped to what it can, and the page says on load what it changed. A `year` in
an older link is read past in silence: there is no year to switch to, so there
is nothing to tell the reader and nothing to point them at. The step is a
fragment (`#step-conversion`), not a query parameter: it is where the reader is
standing, not what the return holds.

## Development

```bash
npm install
npm run dev      # start dev server
npm run test     # vitest, 581 tests
npm run lint     # eslint
npm run build    # tsc -b && vite build
```

## Layout

| Path | What it is |
| --- | --- |
| `src/App.tsx` | The page: all four steps, the charts, the explainers, the close. |
| `src/utils/tax.ts` | Every figure on the page, and the only place a rate or a threshold is written down. |
| `src/utils/scenarioUrl.ts` | The return, encoded into the address bar and clamped back out of it. |
| `src/shelf/` | Finished, tested modules that nothing on the page imports. See [`src/shelf/README.md`](src/shelf/README.md). |

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
therefore always serves `main`; `dev` never needs to be merged to be seen.

---

Not tax advice. Every figure here is a model of published IRS and CMS numbers,
and a real return has facts a page like this never asks for.

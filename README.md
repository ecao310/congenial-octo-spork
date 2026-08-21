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
   the tax year, who files it, who on it has reached 65, and how much Social
   Security it collects.
2. **The tax torpedo** — marginal rate against every dollar that is not Social
   Security, with the IRMAA cliffs and the senior-deduction phaseout drawn on
   the same axis, and a footnote for the states that still tax the benefit —
   nine in 2025, eight in 2026 once West Virginia's phaseout finishes.
3. **Capital gains stacking** — how much of the income already entered is a
   long-term gain. Gains are a *share* of that figure, not an addition to it,
   so moving the slider re-prices the same return rather than inventing a
   richer one.
4. **Sizing the conversion** — pick a ceiling (a bracket edge, an inclusion
   threshold, the top of the 0% gain band, an IRMAA tier) and read off the
   largest conversion that fits under it, what it costs, and the average cost
   per dollar converted.

The page closes on the seven figures the whole walk was for: total income,
federal tax, effective rate, the rate on the next dollar, the taxable share of
the benefit, the Medicare surcharge that MAGI buys, and the room left to
convert.

## What is priced

`src/utils/tax.ts` runs the whole 1040 chain for tax years 2025 and 2026:
provisional income and the 50%/85% inclusion worksheet, the base standard
deduction plus the 65+ additional amount plus the OBBBA senior deduction and
its 6% phaseout, ordinary brackets for all four filing statuses, capital gains
stacked on top of ordinary taxable income, QCDs excluded under IRC 408(d)(8),
tax-exempt interest that moves provisional income without moving the tax base,
and the IRMAA tiers on their two-year MAGI lag.

The Social Security thresholds — $25,000/$34,000 and $32,000/$44,000 — are not
indexed and stay frozen across both years while everything around them moves.
That contrast is the point of the year selector, so the page states it rather
than hiding it.

## Sharing a return

The whole scenario lives in the query string, so a link survives a refresh and
can be sent to a spouse or an advisor: `year`, `filing`, `ss`, `income`,
`ltcg`, `muni`, `qcd`, `senior`, `spouse`, `ceiling`, `state`. Only the year is
always written; everything else appears only when it differs from what that
year opens with. A link asking for something the page cannot show — a year
with no published figures, an income past the slider's bound — is clamped to
what it can, and the page says on load what it changed. The step is a fragment
(`#step-conversion`), not a query parameter: it is where the reader is
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
| `src/utils/stateTax.ts` | Lookup table of state treatment of the benefit — text, deliberately not arithmetic. |
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

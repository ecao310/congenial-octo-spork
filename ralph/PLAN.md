Backlog
[x] Get IRS worksheet. Create test cases for the calculation.
[x] Make SS benefit input a slider from 0 to max yearly SS benefit for that year. Default to avg.
[x] Combine log.md and ralph.log. update instructions to use ralph.log. delete log.md.
[x] MFJ or single option selector. Default to Single.
[x] Create text section below graph explaining the tax torpedo.
[x] Create text section for strategies to mitigate tax torpedo. Consider Roths, taxable accounts, etc.
[x] Overlay total tax paid on the graph.
[x] "Other Income" text below graph is cut off.
[x] Add number for total income near graph. SS + other income. Add avg SS text near the max SS text.
[x] Remove graph for total tax paid. Instead, show total paid on mouse-over tool tip.
[x] Move and edit footer that this is not tax advice and to consult a professional.
[x] In a new section, create a new graph about Capital gains stacking. LTCG counts fully toward PI but is taxed in its own bracket. When extra ordinary income pushes SS into the tax base, it can also shove gains from the 0% bracket to 15% — stacking two effects. Marginal rates over 49% show up here. As input, create 1 slider total for non-LTCG, non-SS income. on graph, LTCG is the horizontal axis.
[x] Make What is the tax torpedo? and How to mitigate the tax torpedo explainers collapsible text. default to collapsed
[x] On mouseover on graph, add to tool tip. "Consider filling out this tax valley at $x". "Consider avoiding this tax hill by staying under $y or over $z".
[x] You're now on the dev branch on a worktree. Find a way to deploy this version without changing main.
[x] Create more action items based on this AI agent idea. Tier 1 — the reason people build this app

Tax torpedo curve. Plot effective marginal rate against income, not taxable SS against income. That's where 12% becomes 22.2% and 22% becomes 40.7%, then falls back down. The hump is the insight; the taxable-benefit chart only implies it.
Capital gains stacking. LTCG counts fully toward PI but is taxed in its own bracket. When extra ordinary income pushes SS into the tax base, it can also shove gains from the 0% bracket to 15% — stacking two effects. Marginal rates over 49% show up here.
Roth conversion sizing. Given a target ceiling (a bracket edge, an IRMAA tier, an inclusion ratio), solve for the largest conversion that stays under it. This is the action most users are actually there to take.

Tier 2 — completes the picture

Full 1040 chain: standard deduction + the 65+ additional amount + the temporary senior deduction (2025–2028, phases out at higher MAGI) → bracket application. Worth confirming current-year figures against IRS releases before you hardcode them.
IRMAA cliffs overlaid on the same x-axis. They're true cliffs, not phase-ins, and they use MAGI on a two-year lag, so they need their own income definition.
Muni-interest toggle. Flip tax-exempt interest on and off and watch taxable SS move. Best single "aha" in the app.
State treatment. Most states exempt benefits; a handful tax some portion, several with their own thresholds. A lookup table plus a note beats a wrong calculation.

Tier 3 — depth

Multi-year projection. The thresholds are frozen while COLAs aren't, so the same real income gets taxed more each year. Show 10–30 years to make that visible, with RMDs turning on at the applicable age.
Withdrawal sequencing comparison (taxable → traditional → Roth vs. proportional), scored on lifetime tax.
QCD modeling. Charitable distributions from an IRA bypass AGI entirely, so they reduce PI where an itemized deduction wouldn't.
Lump-sum election for retroactive awards — genuinely fiddly, needs prior-year data, worth deferring.
MFS-lived-together mode. Already handled in the code ($0 thresholds), but it deserves a loud UI warning since the curve looks broken otherwise.

[x] Roth conversion sizing: add `maxConversionUnder(ceiling, ...)` to tax.ts (binary search over the existing totalTax chain) plus a UI section that picks a ceiling — top of the 12% or 22% bracket, the SS 50% base, the SS 85% base, the top of the 0% LTCG bracket, or IRMAA tier 1 — and reports the largest conversion that stays under it, the resulting tax, and the marginal cost per dollar converted. This is the action most users are actually there to take.
[x] Age-65+ additional standard deduction: add an "age 65 or older" toggle (and a second "both spouses 65+" toggle for MFJ) adding $2,000 (single/HOH) or $1,600 per qualifying spouse (MFJ) on top of the base standard deduction for 2025. Widens the 0%-rate valley to the left of the torpedo.
[x] OBBBA senior deduction (tax years 2025–2028): $6,000 per filer age 65+ ($12,000 when both MFJ spouses qualify), phased out at 6% of MAGI above $75,000 single / $150,000 MFJ and fully gone at $175,000 / $250,000. That 6% phaseout is its own stealth surtax and should appear as a second hump stacked on the SS torpedo. Gate it behind the age-65 toggle and label it as expiring after 2028.
[ ] Muni-interest toggle: add a tax-exempt interest slider. Tax-exempt interest counts toward provisional income (and toward IRMAA MAGI) but never toward taxable income, so it moves taxable SS without moving the ordinary tax base. Show the taxable-SS delta and the implied tax cost of each muni dollar beside the chart. Best single "aha" in the app.
[ ] IRMAA cliffs overlaid on the ordinary-income chart: 2025 premiums use 2023 MAGI (AGI + tax-exempt interest) with true cliffs at $106k / $133k / $167k / $200k / $500k single (double for MFJ except the top tier) over a $185/mo base Part B premium. Draw them as ReferenceLines, put the annualized Part B + Part D surcharge in the tooltip, and state the two-year lag so the x-axis caveat is explicit.
[ ] Married Filing Separately (lived with spouse) filing status: its provisional-income thresholds are $0/$0, so 85% of benefits become taxable almost immediately. Note the code has only 'single' | 'mfj' today — the idea dump's claim that MFS is "already handled" is wrong — so this needs a new FilingStatus plus a loud UI warning, since the curve otherwise looks broken.
[ ] Tax-year selector: every figure is hardcoded to 2025 (Rev. Proc. 2024-40 brackets, OBBBA standard deductions, $61,296 max / $23,712 avg SS benefit). 2026 figures are already published (Rev. Proc. 2025-32: $16,100 single / $32,200 MFJ standard deduction, shifted brackets; $202.90 base Part B premium). Parameterize FILING_PARAMS, LTCG_BRACKETS and the SS benefit constants by year and default to the current year. The SS provisional-income thresholds stay frozen at $25k/$34k and $32k/$44k — that contrast IS the app's whole point, so surface it rather than hiding it.
[ ] State treatment: reference table of the nine states that still taxed Social Security for 2025 (CO, CT, MN, MT, NM, RI, UT, VT, WV — WV phasing out through 2026) with each state's own exemption rule, displayed as text rather than computed. A lookup table plus a note beats a wrong calculation.
[ ] Multi-year projection: the thresholds are frozen while COLAs are not, so the same real income is taxed more every year. Chart 10–30 years of taxable-SS share and effective rate under a COLA assumption slider, with RMDs switching on at the applicable age (73 / 75 under SECURE 2.0).
[ ] Withdrawal sequencing comparison: taxable → traditional → Roth vs. proportional vs. bracket-filling, scored on lifetime federal tax across the projection horizon.
[ ] QCD modeling: qualified charitable distributions from an IRA bypass AGI entirely, so they cut provisional income where an itemized deduction would not. Add a QCD slider capped at the annual limit and show the swing in taxable SS.
[ ] Head of Household filing status — absent from FilingStatus today; shares the single filer's $25k/$34k SS thresholds but has its own brackets and standard deduction.
[ ] Lump-sum election for retroactive SS awards (IRC 86(e)) — genuinely fiddly and needs prior-year income inputs; deliberately deferred until the Tier 2 items land.

[ ] Replace the positional parameter lists in tax.ts with an options object. `sizeConversion` and `maxConversionUnder` now take seven positional arguments (ceiling, ordinary, ss, ltcg, filingStatus, seniors, maxConversion) and each new scenario input — the OBBBA senior deduction, muni interest, QCDs, the tax year — adds another. Inserting `seniors` this iteration silently reassigned App.tsx's positional `MAX_CONVERSION` to it; the tests caught it, but the next insertion may not be so lucky.
[ ] Research and create more action items.

Discovered Work
[x] Fix pre-existing `as any` in vite.config.ts (eslint no-explicit-any error + tsc blindspot) by importing defineConfig from vitest/config
[x] Fix bookkeeping: mitigation-strategies task was completed and committed (4a85fce) but its checkbox was never flipped to [x]
[x] Fix failing test: commit c400999 swept in a human edit trimming the mitigation list from six to three strategies, leaving App.test.tsx asserting on removed QCD/muni text
[x] Fix `totalTaxWithLTCG` never letting the unused standard deduction offset LTCG — the LTCG band was `[ordinaryTaxable, ordinaryTaxable + ltcg]`, so when ordinary income underran the deduction the gains were taxed on the full band (single, $100k LTCG and no other income: $7,747.50 charged vs $5,385 correct; MFJ: $495 vs $0)
[ ] Add the nested `B/` worktree directory to .gitignore — `git worktree list` shows a worktree at ./B inside the repo, so it appears as untracked and a future `git add -A` would commit the whole checkout
[ ] Silence the CI deprecation annotation on both deploy workflows: actions/checkout@v4, actions/deploy-pages@v4 and actions/upload-artifact@v4 target Node 20 and are being force-run on Node 24 — bump to the v5 majors once they're released/stable


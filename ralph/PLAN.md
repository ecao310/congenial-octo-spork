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
[ ] Create more action items based on this AI agent idea. Tier 1 — the reason people build this app

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

[ ] Research and create more action items.

Discovered Work
[x] Fix pre-existing `as any` in vite.config.ts (eslint no-explicit-any error + tsc blindspot) by importing defineConfig from vitest/config
[x] Fix bookkeeping: mitigation-strategies task was completed and committed (4a85fce) but its checkbox was never flipped to [x]
[x] Fix failing test: commit c400999 swept in a human edit trimming the mitigation list from six to three strategies, leaving App.test.tsx asserting on removed QCD/muni text
[ ] Add the nested `B/` worktree directory to .gitignore — `git worktree list` shows a worktree at ./B inside the repo, so it appears as untracked and a future `git add -A` would commit the whole checkout
[ ] Silence the CI deprecation annotation on both deploy workflows: actions/checkout@v4, actions/deploy-pages@v4 and actions/upload-artifact@v4 target Node 20 and are being force-run on Node 24 — bump to the v5 majors once they're released/stable


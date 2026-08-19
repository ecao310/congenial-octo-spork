Backlog
[x] Get IRS worksheet. Create test cases for the calculation.
[x] Make SS benefit input a slider from 0 to max yearly SS benefit for that year. Default to avg.
[x] Combine log.md and ralph.log. update instructions to use ralph.log. delete log.md.
[x] MFJ or single option selector. Default to Single.
[x] Create text section below graph explaining the tax torpedo.
[x] Create text section for strategies to mitigate tax torpedo. Consider Roths, taxable accounts, etc.
[x] Overlay total tax paid on the graph.
[ ] "Other Income" text below graph is cut off.
[ ] Add number for total income near graph. SS + other income. Add avg SS text near the max SS text.
[ ] Remove graph for total tax paid. Instead, show total paid on mouse-over tool tip.
[ ] Add footer that this is not tax advice and to consult a professional.
[ ] Add animation to make obvious when y-axis max changes due to SS benefit change.
[ ] Fix hero text now that MFJ is an option.
[ ] Filing status selector should not take up all horizontal space if not necessary.
[ ] In a new section, create a new graph about Capital gains stacking. LTCG counts fully toward PI but is taxed in its own bracket. When extra ordinary income pushes SS into the tax base, it can also shove gains from the 0% bracket to 15% — stacking two effects. Marginal rates over 49% show up here. As input, create 1 slider total for non-LTCG, non-SS income. on graph, LTCG is the horizontal axis.

Discovered Work
[x] Fix pre-existing `as any` in vite.config.ts (eslint no-explicit-any error + tsc blindspot) by importing defineConfig from vitest/config
[x] Fix bookkeeping: mitigation-strategies task was completed and committed (4a85fce) but its checkbox was never flipped to [x]
[x] Fix failing test: commit c400999 swept in a human edit trimming the mitigation list from six to three strategies, leaving App.test.tsx asserting on removed QCD/muni text
[ ]

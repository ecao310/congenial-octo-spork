# IRS Pub 915 (2025) — Worksheet 1: Figuring Your Taxable Benefits

Source: https://www.irs.gov/publications/p915 (tax year 2025).
This is the worksheet behind Form 1040 line 6b. `src/utils/tax.ts`
(`taxableSocialSecurity`) implements the closed-form equivalent, taking line 4
(tax-exempt interest) as its `muniInterest` argument and assuming no exclusions
or Schedule 1 adjustments (lines 5 and 7 = 0); `src/utils/tax.test.ts` checks it
against a line-by-line reference implementation of this worksheet.

Note that line 4 is what makes municipal bond interest taxable in effect: it is
excluded from gross income by IRC 103 and never reaches Form 1040 line 15, yet
IRC 86(b)(2)(B) adds it straight back here, so it raises the taxable share of
benefits exactly as fast as a pension check would.

## Worksheet lines

| Line | Description |
|------|-------------|
| 1 | Total net benefits: box 5 of all Forms SSA-1099 and RRB-1099 |
| 2 | Line 1 × 50% |
| 3 | Form 1040 lines 1z, 2b, 3b, 4b, 5b, 7, 8 (other income) |
| 4 | Tax-exempt interest (Form 1040 line 2a) |
| 5 | Exclusions (adoption benefits, foreign earned income, etc.) |
| 6 | Combine lines 2, 3, 4, and 5 |
| 7 | Schedule 1 adjustments: lines 11–20, 23, and 25 |
| 8 | Line 6 − line 7 (provisional income) |
| 9 | Base amount: **$25,000** single / **$32,000** MFJ |
| 10 | Line 8 − line 9; if zero or less, none of the benefits are taxable |
| 11 | **$9,000** single / **$12,000** MFJ (second threshold minus base) |
| 12 | Line 10 − line 11 (enter 0 if zero or less) |
| 13 | Smaller of line 10 or line 11 |
| 14 | Line 13 × 50% |
| 15 | Smaller of line 2 or line 14 |
| 16 | Line 12 × 85% |
| 17 | Line 15 + line 16 |
| 18 | Line 1 × 85% |
| 19 | **Taxable benefits**: smaller of line 17 or line 18 |

## Worked example from the publication (single filer)

Net social security benefits of $5,980 (box 5), plus a fully taxable pension
of $18,600, part-time wages of $9,400, and taxable interest of $990
(other income = $28,990).

| Line | Value |
|------|-------|
| 1 | $5,980 |
| 2 | $2,990 |
| 3 | $28,990 |
| 8 | $31,980 |
| 9 | $25,000 |
| 10 | $6,980 |
| 13 | $6,980 |
| 14 | $3,490 |
| 15 | $2,990 |
| 19 | **$2,990 taxable** (Form 1040: line 6a = $5,980, line 6b = $2,990) |

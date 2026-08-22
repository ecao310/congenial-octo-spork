# The published IRS figures behind `TAX_YEAR_PARAMS`

Every inflation-adjusted dollar amount in `src/utils/tax.ts` transcribed from
the document that sets it, so the transcription can be checked without opening
a PDF. `src/utils/tax.test.ts` (`describe('the published IRS figures')`) pins
the app's tables against these.

| Figure | 2025 | 2026 |
|---|---|---|
| Rate tables, standard deduction, capital-gain amounts | [Rev. Proc. 2024-40](https://www.irs.gov/pub/irs-drop/rp-24-40.pdf) §§ 2.01, 2.03, 2.15 | [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) §§ 4.01, 4.03, 4.14 |
| Standard deduction as replaced by the OBBBA | Rev. Proc. 2025-32 § 3.01 | (in § 4.14) |
| 36B applicable percentage table | ARPA § 9661 as extended by IRA § 12001 | [Rev. Proc. 2025-25](https://www.irs.gov/pub/irs-drop/rp-25-25.pdf) § 3.01 |

Figures that are **not** here because no Rev. Proc. sets them: the § 86(c)
provisional-income thresholds and the § 1411(b) net investment income tax
thresholds are statutory and unindexed; the OBBBA senior deduction ($6,000, 6%
of MAGI over $75,000 / $150,000, 2025 through 2028) is statutory; the IRMAA
schedule is CMS's, the poverty guidelines are HHS's and the benefit figures are
SSA's, and each of those carries its own `source` string in `tax.ts`.

## Rate tables

Each row is a row of the Rev. Proc.'s own table: "$base plus rate% of the
excess over $over". The base amounts are worth transcribing even though they
are derivable, because they are the column that is not round — a mistyped
threshold has to be matched by a mistyped base to survive. That is what caught
the 2026 head-of-household 24% band sitting at $201,775, the single filer's
figure, instead of its own $201,750.

### 2025 — Rev. Proc. 2024-40 § 2.01

| Rate | MFJ / surviving spouse | Head of household | Single | MFS |
|---|---|---|---|---|
| 10% | $0 | $0 | $0 | $0 |
| 12% | $23,850 ($2,385) | $17,000 ($1,700) | $11,925 ($1,192.50) | $11,925 ($1,192.50) |
| 22% | $96,950 ($11,157) | $64,850 ($7,442) | $48,475 ($5,578.50) | $48,475 ($5,578.50) |
| 24% | $206,700 ($35,302) | $103,350 ($15,912) | $103,350 ($17,651) | $103,350 ($17,651) |
| 32% | $394,600 ($80,398) | $197,300 ($38,460) | $197,300 ($40,199) | $197,300 ($40,199) |
| 35% | $501,050 ($114,462) | $250,500 ($55,484) | $250,525 ($57,231) | $250,525 ($57,231) |
| 37% | $751,600 ($202,154.50) | $626,350 ($187,031.50) | $626,350 ($188,769.75) | $375,800 ($101,077.25) |

### 2026 — Rev. Proc. 2025-32 § 4.01

| Rate | MFJ / surviving spouse | Head of household | Single | MFS |
|---|---|---|---|---|
| 10% | $0 | $0 | $0 | $0 |
| 12% | $24,800 ($2,480) | $17,700 ($1,770) | $12,400 ($1,240) | $12,400 ($1,240) |
| 22% | $100,800 ($11,600) | $67,450 ($7,740) | $50,400 ($5,800) | $50,400 ($5,800) |
| 24% | $211,400 ($35,932) | $105,700 ($16,155) | $105,700 ($17,966) | $105,700 ($17,966) |
| 32% | $403,550 ($82,048) | **$201,750** ($39,207) | $201,775 ($41,024) | $201,775 ($41,024) |
| 35% | $512,450 ($116,896) | $256,200 ($56,631) | $256,225 ($58,448) | $256,225 ($58,448) |
| 37% | $768,700 ($206,583.50) | $640,600 ($191,171) | $640,600 ($192,979.25) | $384,350 ($103,291.75) |

The head-of-household schedule converges on the single one from the 22% band
up but never quite reaches it: the 24% and 32% band tops sit $25 below, and
only the 35% band top coincides.

## Standard deduction, § 63(c)(2)

| Filing status | 2025 | 2026 |
|---|---|---|
| MFJ / surviving spouse | $31,500 | $32,200 |
| Head of household | $23,625 | $24,150 |
| Single | $15,750 | $16,100 |
| MFS | $15,750 | $16,100 |

The 2025 amounts are the OBBBA's, printed in Rev. Proc. 2025-32 § 3.01, which
removes § 2.15(1) of Rev. Proc. 2024-40 and its $30,000 / $22,500 / $15,000.

### Aged or blind addition, § 63(f)

"The additional standard deduction amount under § 63(f) for the aged or the
blind is **$1,600** [2025] / **$1,650** [2026]. The additional standard
deduction amount is increased to **$2,000** / **$2,050** if the individual is
also unmarried and not a surviving spouse."

A head of household is unmarried, so takes the larger figure; a separate filer
is married, so takes the smaller one.

## Maximum zero rate and maximum 15 percent rate amounts, § 1(j)(5)(B)

| Filing status | 2025 zero / 15% | 2026 zero / 15% |
|---|---|---|
| MFJ / surviving spouse | $96,700 / $600,050 | $98,900 / $613,700 |
| MFS | $48,350 / $300,000 | $49,450 / $306,850 |
| Head of household | $64,750 / $566,700 | $66,200 / $579,600 |
| All other individuals | $48,350 / $533,400 | $49,450 / $545,500 |

Half of the 2026 joint 15% amount is $306,850 exactly, so that year the
separate figure really is the halved joint one; in 2025 separate rounding put
it $25 below half ($300,000 against $300,025).

## Applicable percentage table, § 36B(b)(3)(A)(i)

Rev. Proc. 2025-25 § 3.01, for taxable years beginning in 2026:

| Household income as a percentage of the federal poverty line | Initial | Final |
|---|---|---|
| Less than 133% | 2.10% | 2.10% |
| At least 133% but less than 150% | 3.14% | 4.19% |
| At least 150% but less than 200% | 4.19% | 6.60% |
| At least 200% but less than 250% | 6.60% | 8.44% |
| At least 250% but less than 300% | 8.44% | 9.96% |
| At least 300% but not more than 400% | 9.96% | 9.96% |

The last row is the last row there is, which is the 400% cliff: over that line
there is no applicable percentage and so no credit. `FPL_YEAR_PARAMS` carries
the 9.96% as `topApplicablePercentage`, which is what lets the page price the
cliff without knowing the reader's own benchmark premium. For 2025 the ARPA
table applies instead — it runs past 400% and tops out at 8.5%, so there is no
cliff at all.

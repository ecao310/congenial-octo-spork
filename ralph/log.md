# Durable notes for ralph iterations

- Per-iteration write-ups live in ralph/ralph.log (gitignored via *.log, local-only).
- Tax math: src/utils/tax.ts, single filer, 2025 params. Verified line-by-line
  against IRS Pub 915 (2025) Worksheet 1 — reference doc at
  docs/irs-pub915-worksheet1-2025.md, reference implementation + grid
  cross-check in src/utils/tax.test.ts.
- MFJ thresholds (for the MFJ/single selector task): base $32,000, second
  threshold $44,000 (line 11 = $12,000). Single: $25,000 / $34,000 ($9,000).
  MFJ 2025 standard deduction: $31,500; MFJ brackets differ from single too.
- Verify with: npx tsc -b && npm run lint && npm test && npm run build.

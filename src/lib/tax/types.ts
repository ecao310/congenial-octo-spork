/**
 * The two primitives every other module in this directory is keyed by.
 *
 * They live on their own because everything depends on them and they depend on
 * nothing: a status and a year are the axes the whole engine is indexed along,
 * so putting them anywhere with an implementation in it would make that file
 * the root of the import graph for reasons having nothing to do with what it
 * computes.
 */

/**
 * The filing statuses this app prices.
 *
 * The tax code has four. Head of household and a separate return that lived
 * with the spouse were both priced here for a long time — IRC 86(c) gives each
 * a base amount, and the engine ran all four — and each cost real weight for a
 * return almost nobody who opens this app files: 86(c)'s $0 bases for a
 * separate return, its own IRMAA ladder with three tiers missing, its
 * exclusion from the OBBBA senior deduction, and a head of household's own
 * bracket table and standard deduction. Every one of those was a branch, and
 * two of them were nullable return types every caller had to answer for.
 *
 * So the narrowing is stated here, once, and everything downstream is
 * exhaustive over it: adding a status back means adding it to this union and
 * fixing every `Record<FilingStatus, …>` the compiler then reports. See
 * `FILING_STATUSES` for the list, and `decodeScenario` for what happens to a
 * link that names one of the two that are gone.
 */
export type FilingStatus = 'single' | 'mfj';

/** A tax year this app has published figures for. See `TAX_YEAR_PARAMS`. */
export type TaxYear = 2025 | 2026;

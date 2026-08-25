/**
 * The tax engine's public surface, in the order the 1040 chain runs it.
 *
 * Everything a page, a script or a test asks this directory for comes through
 * here, so that the modules behind it can be re-cut without a caller noticing.
 * The one thing deliberately left out is `seniorCount`, which is how
 * `deductions.ts` reads a scenario's own field rather than a question anything
 * outside this directory has.
 *
 * The engine prices two filing statuses and two tax years. It used to price
 * four statuses and to have a render layer that narrowed them back down; the
 * narrowing is in `FilingStatus` itself now, so there is one set and nothing
 * downstream has to say which of two it means. The year is still narrowed by
 * the render layer, because both years on file are reachable arithmetic —
 * see `PAGE_TAX_YEAR`.
 */

export type { FilingStatus, TaxYear } from './types';

export type { Bracket, FilingYearParams, TaxYearParams } from './params';
export {
  TAX_YEAR_PARAMS,
  TAX_YEARS,
  FILING_STATUSES,
  PAGE_TAX_YEAR,
  defaultTaxYear,
  taxYearParams,
  filingParams,
} from './params';

export type { Scenario } from './scenario';
export {
  resolveScenario,
  filingParamsFor,
  maxSeniors,
  defaultHouseholdSize,
} from './scenario';

export {
  SS_BASES,
  SS_BASE50_ENACTED,
  SS_BASE85_ENACTED,
  maxAnnualSSBenefit,
  avgAnnualSSBenefit,
  taxableSocialSecurity,
} from './socialSecurity';

export {
  standardDeductionFor,
  SENIOR_DEDUCTION,
  SENIOR_DEDUCTION_FIRST_YEAR,
  SENIOR_DEDUCTION_LAST_YEAR,
  SENIOR_DEDUCTION_PHASEOUT_RATE,
  SENIOR_DEDUCTION_PHASEOUT_START,
  seniorDeductionPhaseoutEnd,
  seniorDeductionFor,
  deductionFor,
} from './deductions';

export {
  federalIncomeTax,
  agiFor,
  totalIncomeFor,
  splitOtherIncome,
  totalTax,
} from './income';

export type {
  IrmaaTier,
  IrmaaYearParams,
  IrmaaAssessment,
  IrmaaCliff,
} from './irmaa';
export {
  IRMAA_LOOKBACK_YEARS,
  IRMAA_YEAR_PARAMS,
  irmaaMagiYear,
  partBStandardPremium,
  irmaaTiersFor,
  irmaaMagi,
  irmaaTierFor,
  irmaaFor,
  otherIncomeAtIrmaaMagi,
  irmaaCliffs,
} from './irmaa';

export type { PtcYearParams, PtcCliff, PtcAssessment } from './ptc';
export {
  PTC_CLIFF_PERCENT,
  FPL_GUIDELINE_LOOKBACK_YEARS,
  FPL_YEAR_PARAMS,
  fplGuidelineYear,
  povertyLine,
  povertyLineFor,
  acaMagi,
  fplMultipleOf,
  ptcCliffMagi,
  otherIncomeAtAcaMagi,
  ptcCliff,
  ptcFor,
} from './ptc';

export type { IncomeAxisFeatures, IncomeAxisRange } from './axis';
export {
  otherIncomeAtTaxableSSCap,
  otherIncomeAtAgi,
  incomeAxisFeatures,
  MIN_INCOME_AXIS,
  incomeAxisMax,
} from './axis';

export type { MarginalRatePoint, IncomeCurveRange } from './curve';
export { marginalRateCurve, torpedoPeak } from './curve';

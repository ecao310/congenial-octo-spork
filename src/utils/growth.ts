export interface GrowthPoint {
  year: number;
  balance: number;
}

/**
 * Projects compound growth of an initial amount at a fixed annual rate.
 * Returns one data point per year, from year 0 (the initial amount)
 * through the given number of years.
 */
export function projectGrowth(
  initialAmount: number,
  annualRate: number,
  years: number,
): GrowthPoint[] {
  const data: GrowthPoint[] = [];
  let balance = initialAmount;

  for (let year = 0; year <= years; year++) {
    data.push({ year, balance: Math.round(balance) });
    balance = balance * (1 + annualRate);
  }

  return data;
}

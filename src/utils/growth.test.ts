import { projectGrowth } from './growth';

describe('projectGrowth', () => {
  it('returns one point per year including year 0', () => {
    const data = projectGrowth(10000, 0.07, 30);
    expect(data).toHaveLength(31);
    expect(data[0].year).toBe(0);
    expect(data[30].year).toBe(30);
  });

  it('starts at the initial amount', () => {
    const data = projectGrowth(10000, 0.07, 30);
    expect(data[0].balance).toBe(10000);
  });

  it('compounds annually at the given rate', () => {
    const data = projectGrowth(1000, 0.1, 3);
    expect(data[1].balance).toBe(1100);
    expect(data[2].balance).toBe(1210);
    expect(data[3].balance).toBe(1331);
  });

  it('stays flat with a zero rate', () => {
    const data = projectGrowth(5000, 0, 5);
    expect(data.every((d) => d.balance === 5000)).toBe(true);
  });

  it('handles a zero initial amount', () => {
    const data = projectGrowth(0, 0.07, 10);
    expect(data.every((d) => d.balance === 0)).toBe(true);
  });
});

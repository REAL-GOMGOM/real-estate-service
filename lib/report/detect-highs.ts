import type { DateRange, Deal, YearHigh } from './types';

const MIN_PRICE = 100_000_000; // 1억 원

function groupKey(d: Deal): string {
  const area = (Math.round(d.excluUseAr * 10) / 10).toFixed(1);
  return `${d.aptNm}|${d.lawdCd}|${d.umdNm}|${area}`;
}

function dealDate(d: Deal): string {
  return `${d.dealYear}-${d.dealMonth}-${d.dealDay}`;
}

export function detectYearHighs(
  deals: Deal[],
  range: DateRange,
): YearHigh[] {
  const groups = new Map<string, Deal[]>();

  for (const d of deals) {
    if (d.dealAmount < MIN_PRICE) continue;
    const key = groupKey(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  const yearHighs: YearHigh[] = [];

  for (const [, group] of groups) {
    const targetDeals = group.filter((d) => {
      const dd = dealDate(d);
      return dd >= range.from && dd <= range.to;
    });
    const prevDeals = group.filter((d) => dealDate(d) < range.from);

    if (targetDeals.length === 0 || prevDeals.length === 0) continue;

    const prevHigh = Math.max(...prevDeals.map((d) => d.dealAmount));

    for (const d of targetDeals) {
      if (d.dealAmount > prevHigh) {
        yearHighs.push({
          apartment: d.aptNm,
          region: d.umdNm,
          sido: d.sido,
          sigungu: d.districtName,
          area: d.excluUseAr,
          newPrice: d.dealAmount,
          prevHigh,
          increase: (d.dealAmount - prevHigh) / prevHigh,
          date: dealDate(d),
        });
      }
    }
  }

  return yearHighs;
}

import { kstTodayIso, shiftDays } from '@/lib/agg-window';
import type { MarketLiveAggRow } from '@/lib/agg-queries';

/** 홈에 노출할 수도권 핵심 6개 구. 순서는 UI 표시 순서다. */
export const MARKET_LIVE_REGIONS = ['강남구', '서초구', '송파구', '마포구', '용산구', '성동구'] as const;

export interface MarketLiveRow {
  region: string;
  recentAverage: number | null;
  recentCount: number;
  previousAverage: number | null;
  previousCount: number;
  changePct: number | null;
}

function roundedAverage(sum: number, count: number): number | null {
  return count > 0 ? Math.round(sum / count) : null;
}

/** DB 집계행을 UI 계약으로 변환. 요청한 6개 구는 0건이어도 모두 반환한다. */
export function buildMarketLiveRows(aggs: MarketLiveAggRow[]): MarketLiveRow[] {
  const byRegion = new Map(aggs.map((row) => [row.sigungu, row]));

  return MARKET_LIVE_REGIONS.map((region) => {
    const agg = byRegion.get(region);
    const recentCount = agg?.recentCount ?? 0;
    const previousCount = agg?.previousCount ?? 0;
    const recentAverage = roundedAverage(agg?.recentSum ?? 0, recentCount);
    const previousAverage = roundedAverage(agg?.previousSum ?? 0, previousCount);
    const changePct = recentAverage !== null && previousAverage !== null && previousAverage > 0
      ? Math.round(((recentAverage - previousAverage) / previousAverage) * 1000) / 10
      : null;

    return { region, recentAverage, recentCount, previousAverage, previousCount, changePct };
  });
}

export function marketLiveWindows(now: Date = new Date()) {
  const today = kstTodayIso(now);
  const recentFrom = shiftDays(today, -29);
  return {
    recent: {
      from: recentFrom,
      toExclusive: shiftDays(today, 1),
      days: 30,
    },
    previous: {
      from: shiftDays(recentFrom, -30),
      toExclusive: recentFrom,
      days: 30,
    },
  };
}

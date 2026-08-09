import { connection } from 'next/server';
import { fetchMarketLiveAggs } from '@/lib/agg-queries';
import { MARKET_LIVE_REGIONS, buildMarketLiveRows, marketLiveWindows } from '@/lib/market-live';

const aggregation = {
  metric: 'arithmetic_mean_per_transaction',
  label: '거래 1건당 동일 가중치의 단순 산술평균',
  priceUnit: '만원',
  dealType: '아파트 매매',
  areaM2: { min: 80, max: 88 },
  canceledExcluded: true,
} as const;

export async function GET() {
  // Cache Components가 build 시 DB를 실행하지 않도록 request-time 경계를 명시한다.
  await connection();

  const windows = marketLiveWindows();
  const updatedAt = new Date().toISOString();

  try {
    const aggs = await fetchMarketLiveAggs(
      MARKET_LIVE_REGIONS,
      windows.previous.from,
      windows.recent.from,
      windows.recent.toExclusive,
    );

    return Response.json(
      {
        status: 'ok',
        rows: buildMarketLiveRows(aggs),
        windows,
        aggregation,
        updatedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error('[transactions/market-live API] 집계 실패:', error);
    return Response.json(
      {
        status: 'degraded',
        rows: [],
        windows,
        aggregation,
        updatedAt,
        note: '84㎡ 실거래 평균을 잠시 불러오지 못했습니다.',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  }
}

import { connection } from 'next/server';
import { fetchMarketLiveAggs } from '@/lib/agg-queries';
import { MARKET_LIVE_REGIONS, buildMarketLiveRows, marketLiveWindows } from '@/lib/market-live';
import {
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
} from '@/lib/public-snapshots/runtime';
import {
  assertRolling30MarketLiveEnvelope,
  isServingArtifactFresh,
  MARKET_LIVE_ROLLING30_ARTIFACT_NAME,
  TRANSACTION_SNAPSHOT_MAX_AGE_MS,
  type Rolling30MarketLiveData,
} from '@/lib/public-snapshots/serving-artifacts';

const aggregation = {
  metric: 'arithmetic_mean_per_transaction',
  label: '거래 1건당 동일 가중치의 단순 산술평균',
  priceUnit: '만원',
  dealType: '아파트 매매',
  areaM2: { min: 80, max: 88 },
  canceledExcluded: true,
} as const;

const SUCCESS_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const DEGRADED_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

function matchesRequestedMarketLive(
  data: Rolling30MarketLiveData,
  requestedToExclusive: string,
  now: Date,
): boolean {
  return data.windows.recent.toExclusive <= requestedToExclusive
    && isServingArtifactFresh(data.updatedAt, {
      now,
      maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
    });
}

function degradedMarketLiveResponse(
  windows: ReturnType<typeof marketLiveWindows>,
  updatedAt = new Date().toISOString(),
  note = '검증된 84㎡ 실거래 평균 스냅샷을 준비 중입니다.',
): Response {
  return Response.json(
    {
      status: 'degraded',
      rows: [],
      windows,
      aggregation,
      updatedAt,
      note,
    },
    { headers: { 'Cache-Control': DEGRADED_CACHE_CONTROL } },
  );
}

export async function GET() {
  // Cache Components가 build 시 DB를 실행하지 않도록 request-time 경계를 명시한다.
  await connection();

  const windows = marketLiveWindows();
  const updatedAt = new Date().toISOString();
  const servingMode = isPublicSnapshotConfigured();

  try {
    const snapshot = await createPublicSnapshotRuntimeFromEnv()
      .getNamedArtifact(MARKET_LIVE_ROLLING30_ARTIFACT_NAME);
    if (snapshot.status === 'success') {
      try {
        assertRolling30MarketLiveEnvelope(snapshot.data);
        if (matchesRequestedMarketLive(snapshot.data.data, windows.recent.toExclusive, new Date())) {
          return Response.json(snapshot.data.data, {
            headers: {
              'Cache-Control': SUCCESS_CACHE_CONTROL,
              'X-Naezip-Data-Source': 'snapshot',
              'X-Naezip-Snapshot-Generated-At': snapshot.data.generatedAt,
            },
          });
        }
      } catch {
        // Invalid artifacts are unavailable, never authoritative.
      }
    }
  } catch {
    // Runtime errors are handled below without reviving an older Neon aggregate.
  }

  if (servingMode) return degradedMarketLiveResponse(windows, updatedAt);

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
      { headers: { 'Cache-Control': SUCCESS_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error('[transactions/market-live API] 집계 실패:', error);
    return degradedMarketLiveResponse(
      windows,
      updatedAt,
      '84㎡ 실거래 평균을 잠시 불러오지 못했습니다.',
    );
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchMarketLiveAggs: vi.fn(),
  getNamedArtifact: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('@/lib/agg-queries', () => ({ fetchMarketLiveAggs: mocks.fetchMarketLiveAggs }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({ getNamedArtifact: mocks.getNamedArtifact }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';
import {
  MARKET_LIVE_REGIONS,
  buildMarketLiveRows,
  marketLiveWindows,
} from '@/lib/market-live';
import { buildRolling30MarketLiveArtifact } from '@/lib/public-snapshots/serving-artifacts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-14T03:00:00Z'));
  mocks.connection.mockReset();
  mocks.fetchMarketLiveAggs.mockReset();
  mocks.getNamedArtifact.mockReset();
  mocks.isPublicSnapshotConfigured.mockReset();
  mocks.getNamedArtifact.mockResolvedValue({ status: 'disabled', reason: 'base-url-not-configured' });
  mocks.isPublicSnapshotConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function snapshotEnvelope(options: { generatedAt?: string; empty?: boolean } = {}) {
  const generatedAt = options.generatedAt ?? '2026-08-13T13:12:16.831Z';
  const aggregates = MARKET_LIVE_REGIONS.map((sigungu, index) => ({
    sigungu,
    recentSum: options.empty || index > 0 ? 0 : 610000,
    recentCount: options.empty || index > 0 ? 0 : 3,
    previousSum: options.empty || index > 0 ? 0 : 360000,
    previousCount: options.empty || index > 0 ? 0 : 2,
  }));
  const artifact = buildRolling30MarketLiveArtifact({ generatedAt, aggregates });
  return { schema: artifact.schema, generatedAt, itemCount: artifact.itemCount, data: artifact.data };
}

describe('GET /api/transactions/market-live', () => {
  it('스냅샷 hit는 Neon 없이 헤더와 완성 응답을 반환한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: snapshotEnvelope() });

    const response = await GET();
    const json = await response.json();

    expect(json.status).toBe('ok');
    expect(json.rows[0]).toMatchObject({ region: '강남구', recentCount: 3, previousCount: 2 });
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(response.headers.get('X-Naezip-Snapshot-Generated-At')).toBe('2026-08-13T13:12:16.831Z');
    expect(mocks.fetchMarketLiveAggs).not.toHaveBeenCalled();
  });

  it('정상적인 0건 스냅샷도 6개 구 status=ok hit로 유지한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: snapshotEnvelope({ empty: true }) });

    const response = await GET();
    const json = await response.json();

    expect(json.status).toBe('ok');
    expect(json.rows).toHaveLength(6);
    expect(json.rows.every((row: { recentCount: number }) => row.recentCount === 0)).toBe(true);
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(mocks.fetchMarketLiveAggs).not.toHaveBeenCalled();
  });

  it('configured snapshot이 오래됐으면 degraded로 강등하고 Neon을 호출하지 않는다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ generatedAt: '2026-08-10T03:00:00.000Z', empty: true }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(json.rows).toEqual([]);
    expect(response.headers.get('X-Naezip-Data-Source')).toBeNull();
    expect(mocks.fetchMarketLiveAggs).not.toHaveBeenCalled();
  });

  it('configured snapshot 본문이 깨졌어도 Neon 없이 degraded로 응답한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: { schema: 'wrong', generatedAt: '2026-08-13T13:12:16.831Z', itemCount: 0, data: {} },
    });

    const response = await GET();
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(mocks.fetchMarketLiveAggs).not.toHaveBeenCalled();
  });

  it('허용 오차 안의 미래 시각이어도 KST 다음날 window이면 거부한다', async () => {
    vi.setSystemTime(new Date('2026-08-14T14:59:00.000Z'));
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ generatedAt: '2026-08-14T15:01:00.000Z', empty: true }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(response.headers.get('X-Naezip-Data-Source')).toBeNull();
    expect(mocks.fetchMarketLiveAggs).not.toHaveBeenCalled();
  });

  it('6개 구를 단 한 번의 60일 SQL 집계로 요청한다', async () => {
    mocks.fetchMarketLiveAggs.mockResolvedValue([
      {
        sigungu: '강남구',
        recentSum: 610000,
        recentCount: 3,
        previousSum: 360000,
        previousCount: 2,
      },
    ]);

    const response = await GET();
    const json = await response.json();

    expect(mocks.fetchMarketLiveAggs).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMarketLiveAggs).toHaveBeenCalledWith(
      MARKET_LIVE_REGIONS,
      '2026-06-16',
      '2026-07-16',
      '2026-08-15',
    );
    expect(json.status).toBe('ok');
    expect(json.rows).toHaveLength(6);
    expect(json.rows[0]).toEqual({
      region: '강남구',
      recentAverage: 203333,
      recentCount: 3,
      previousAverage: 180000,
      previousCount: 2,
      changePct: 13,
    });
    expect(json.aggregation).toMatchObject({
      metric: 'arithmetic_mean_per_transaction',
      priceUnit: '만원',
      areaM2: { min: 80, max: 88 },
      canceledExcluded: true,
    });
  });

  it('DB 장애를 status=degraded와 빈 행으로 명시한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchMarketLiveAggs.mockRejectedValue(new Error('database unavailable'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('degraded');
    expect(json.rows).toEqual([]);
    expect(json.note).toContain('잠시 불러오지 못했습니다');
  });
});

describe('market-live payload helpers', () => {
  it('거래 합계와 표본수로 산술평균과 증감률을 계산한다', () => {
    const rows = buildMarketLiveRows([{
      sigungu: '강남구',
      recentSum: 610000,
      recentCount: 3,
      previousSum: 360000,
      previousCount: 2,
    }]);

    expect(rows[0]).toEqual({
      region: '강남구',
      recentAverage: 203333,
      recentCount: 3,
      previousAverage: 180000,
      previousCount: 2,
      changePct: 13,
    });
  });

  it('원래 요청한 구가 0건이어도 null 평균과 함께 유지한다', () => {
    const rows = buildMarketLiveRows([]);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      region: '강남구',
      recentAverage: null,
      recentCount: 0,
      previousAverage: null,
      previousCount: 0,
      changePct: null,
    });
  });

  it('KST 오늘을 포함한 최근 30일과 직전 30일을 겹치지 않게 나눈다', () => {
    expect(marketLiveWindows(new Date('2026-08-09T03:00:00Z'))).toEqual({
      recent: { from: '2026-07-11', toExclusive: '2026-08-10', days: 30 },
      previous: { from: '2026-06-11', toExclusive: '2026-07-11', days: 30 },
    });
  });
});

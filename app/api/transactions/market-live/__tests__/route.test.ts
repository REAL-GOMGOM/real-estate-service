import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchMarketLiveAggs: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('@/lib/agg-queries', () => ({ fetchMarketLiveAggs: mocks.fetchMarketLiveAggs }));

import { GET } from '../route';
import {
  MARKET_LIVE_REGIONS,
  buildMarketLiveRows,
  marketLiveWindows,
} from '@/lib/market-live';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-09T03:00:00Z'));
  mocks.connection.mockReset();
  mocks.fetchMarketLiveAggs.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /api/transactions/market-live', () => {
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
      '2026-06-11',
      '2026-07-11',
      '2026-08-10',
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

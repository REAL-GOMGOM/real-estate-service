import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ fetchRankingTradeStats: vi.fn() }));

vi.mock('@/lib/ranking-queries', () => ({
  RANKING_REGION_NAMES: { ALL: '등록 표본 전체', '11': '서울특별시' },
  RANKING_TOTAL_LABEL: '등록 표본 전체',
  rankingWindow: () => ({ from: '2026-05-09', toExclusive: '2026-08-10', asOf: '2026-08-09' }),
  fetchRankingTradeStats: mocks.fetchRankingTradeStats,
}));

import { GET } from '../route';

beforeEach(() => {
  vi.stubEnv('REALESTATE_STAT_API_KEY', '');
  mocks.fetchRankingTradeStats.mockReset();
  mocks.fetchRankingTradeStats.mockResolvedValue({
    coverage: {
      transactionCount: 12,
      districtCount: 2,
      firstDealDate: '2026-05-10',
      lastDealDate: '2026-08-08',
    },
    topPrice: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      price: 300000, area: 84, floor: 10, dealDate: '2026-08-01',
    }],
    volume: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      count: 4, avgPrice: 280000,
    }],
    newHigh: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      price: 300000, prevHigh: 280000, diff: 20000, diffPercent: 7.1,
    }],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/ranking', () => {
  it('내부 원장 커버리지와 표본 라벨을 공개하고 임의 환율을 만들지 않는다', async () => {
    const response = await GET(new NextRequest('https://example.com/api/ranking?period=3&area=all'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('partial');
    expect(json.coverage).toMatchObject({
      districtCount: 2,
      transactionCount: 12,
      label: '등록 표본 전체 · 2개 시군구',
      canceledExcluded: true,
    });
    expect(json.topPrice['등록 표본 전체'][0]).toMatchObject({
      aptName: '테스트단지',
      priceFormatted: '30.0억',
    });
    expect(json.topPrice['등록 표본 전체'][0]).not.toHaveProperty('dollarPrice');
    expect(json.volume['등록 표본 전체'][0]).toMatchObject({ dong: '대치동', count: 4 });
    expect(json.newHigh['등록 표본 전체'][0]).toMatchObject({ dong: '대치동', diffPercent: 7.1 });
  });

  it('지원하지 않는 기간·면적은 DB 조회 전에 거절한다', async () => {
    const response = await GET(new NextRequest('https://example.com/api/ranking?period=1&area=weird'));
    expect(response.status).toBe(400);
    expect(mocks.fetchRankingTradeStats).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getPriceChange,
} from '../route';
import { GET as getDistrictPriceChange } from '../districts/route';
import {
  isRecentPricePeriod,
  isMonthlyPriceChangeData,
  officialSummaryFromChangeRows,
  parsePriceChangeFrequency,
  parsePriceChangeTradeType,
} from '@/lib/price-map-contract';

describe('price-change frequency contract', () => {
  it('생략 또는 monthly만 지원한다', () => {
    expect(parsePriceChangeFrequency(null)).toBe('monthly');
    expect(parsePriceChangeFrequency('monthly')).toBe('monthly');
    expect(parsePriceChangeFrequency('weekly')).toBeNull();
    expect(parsePriceChangeFrequency('daily')).toBeNull();
  });

  it('지원하지 않는 거래 유형을 기본값으로 위장하지 않는다', () => {
    expect(parsePriceChangeTradeType(null)).toBe('sale');
    expect(parsePriceChangeTradeType('sale')).toBe('sale');
    expect(parsePriceChangeTradeType('rent')).toBe('rent');
    expect(parsePriceChangeTradeType('unknown')).toBeNull();
  });

  it('정상 응답에는 monthly frequency와 필수 집계 필드가 있어야 한다', () => {
    expect(isMonthlyPriceChangeData({
      frequency: 'monthly',
      period: '2026년 7월 (부동산원)',
      type: 'sale',
      summary: { nationwide: 0.1, capital_area: 0.2, non_capital: 0 },
      regions: [],
    })).toBe(true);
    expect(isMonthlyPriceChangeData({
      period: '2026년 7월 (부동산원)',
      type: 'sale',
      summary: { nationwide: 0.1, capital_area: 0.2, non_capital: 0 },
      regions: [],
    })).toBe(false);
    expect(isMonthlyPriceChangeData({
      frequency: 'weekly',
      period: '2026년 7월 (부동산원)',
      type: 'sale',
      summary: { nationwide: 0.1, capital_area: 0.2, non_capital: 0 },
      regions: [],
    })).toBe(false);
  });

  it('시도 API는 weekly 요청을 400으로 명확히 거절한다', async () => {
    const request = new NextRequest('https://example.com/api/price-change?type=sale&period=weekly');
    const response = await getPriceChange(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNSUPPORTED_FREQUENCY',
      supportedFrequencies: ['monthly'],
    });
  });

  it('번들 DB의 오래된 월간 값은 최신값으로 사용하지 않는다', () => {
    const now = new Date('2026-08-09T00:00:00+09:00');
    expect(isRecentPricePeriod('2026년 7월', now)).toBe(true);
    expect(isRecentPricePeriod('2026년 5월', now)).toBe(true);
    expect(isRecentPricePeriod('2026년 3월', now)).toBe(false);
    expect(isRecentPricePeriod('알 수 없음', now)).toBe(false);
  });

  it('요약은 시도 평균이 아니라 공식 전국·수도권·지방권 집계행을 사용한다', () => {
    expect(officialSummaryFromChangeRows([
      { region_code: '00', change_rate: 0.11 },
      { region_code: 'S0', change_rate: 0.22 },
      { region_code: 'L0', change_rate: -0.03 },
      { region_code: '11', change_rate: 9.99 },
    ])).toEqual({ nationwide: 0.11, capital_area: 0.22, non_capital: -0.03 });
    expect(officialSummaryFromChangeRows([
      { region_code: '11', change_rate: 0.1 },
    ])).toBeNull();
  });

  it('구별 API도 weekly 요청을 400으로 명확히 거절한다', async () => {
    const request = new NextRequest(
      'https://example.com/api/price-change/districts?province=11&type=sale&period=weekly',
    );
    const response = await getDistrictPriceChange(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNSUPPORTED_FREQUENCY',
      supportedFrequencies: ['monthly'],
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchSilvMonthAllPages: vi.fn(),
}));

vi.mock('@/lib/molit-months', () => ({
  getMonthList: () => ['202607', '202606'],
  fetchSilvMonthAllPages: mocks.fetchSilvMonthAllPages,
  revalidateForMonth: () => 0,
}));

import { GET } from '../route';

const XML = '<item><aptNm>분양단지</aptNm><excluUseAr>84</excluUseAr><dealAmount>100,000</dealAmount><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay><floor>10</floor><umdNm>삼성동</umdNm><jibun>1-1</jibun><cdealType></cdealType></item>';

describe('GET /api/transactions/silv partial contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.PUBLIC_DATA_API_KEY;
  });

  it('일부 월 조회 실패를 완전한 기간처럼 숨기지 않는다', async () => {
    mocks.fetchSilvMonthAllPages
      .mockResolvedValueOnce(XML)
      .mockRejectedValueOnce(new Error('temporary failure'));

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.failedMonths).toEqual(['202606']);
    expect(body.total).toBe(1);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

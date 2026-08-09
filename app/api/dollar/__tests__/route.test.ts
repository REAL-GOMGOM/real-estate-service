import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchDollarYearDeals: vi.fn(),
  fetchDollarLiveRates: vi.fn(),
  getExchangeRateQuotes: vi.fn(),
}));

vi.mock('@/lib/dollar-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/dollar-api')>(),
  fetchDollarYearDeals: mocks.fetchDollarYearDeals,
  fetchDollarLiveRates: mocks.fetchDollarLiveRates,
}));

vi.mock('@/lib/exchange-rate', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/exchange-rate')>(),
  getExchangeRateQuotes: mocks.getExchangeRateQuotes,
}));

import { GET } from '../route';

const originalKey = process.env.PUBLIC_DATA_API_KEY;

function request(query: string) {
  return new NextRequest(`https://example.com/api/dollar?${query}`);
}

function yearResult(year: number) {
  return {
    deals: [{ price: year === 2020 ? 200000 : 300000, area: 84.4 }],
    hasUsableResponse: true,
    window: {
      requestedMonths: [`${year}10`], successfulMonths: [`${year}10`],
      failedMonths: [], matchedMonths: [`${year}10`], canceledExcluded: 1, fallbackUsed: false,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
  process.env.PUBLIC_DATA_API_KEY = 'test-key';
  mocks.fetchDollarYearDeals.mockReset();
  mocks.fetchDollarYearDeals.mockImplementation(async (_code, year: number) => yearResult(year));
  mocks.fetchDollarLiveRates.mockReset();
  mocks.fetchDollarLiveRates.mockResolvedValue({
    ok: true,
    value: {
      btcKrw: 140_000_000, goldKrwPerGram: 190_000,
      usdKrwImplied: 1388, fetchedAt: '2026-08-09T00:00:00.000Z',
    },
  });
  mocks.getExchangeRateQuotes.mockReset();
  mocks.getExchangeRateQuotes.mockResolvedValue({
    quotes: {
      2020: { value: 1180, mode: 'official', source: '한국은행 ECOS', period: '2020', note: '연간 응답' },
      2026: { value: 1470, mode: 'static_estimate', source: '정적 참고 추정치', period: '2026', note: '참고' },
    },
    warning: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalKey === undefined) delete process.env.PUBLIC_DATA_API_KEY;
  else process.env.PUBLIC_DATA_API_KEY = originalKey;
});

describe('GET /api/dollar', () => {
  it('표본 수·기간·해제 제외와 자산별 실제 출처를 응답한다', async () => {
    const response = await GET(request('district=강남구&aptName=은마&baseYear=2020&compareYear=2026&area=84'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body).toMatchObject({
      basePriceKrw: 200000,
      comparePriceKrw: 300000,
      baseExchangeRate: 1180,
      compareExchangeRate: 1388,
    });
    expect(body.provenance.transactions).toMatchObject({
      cancellationExcluded: true,
      base: { sampleCount: 1, allAreaSampleCount: 1, canceledExcluded: 1 },
      compare: { sampleCount: 1, allAreaSampleCount: 1, canceledExcluded: 1 },
    });
    expect(body.provenance.exchangeRate.base.mode).toBe('official');
    expect(body.provenance.exchangeRate.compare.source).toContain('CoinGecko');
    expect(body.provenance.bitcoin.base.source).toBe('정적 참고 추정치');
    expect(body.provenance.gold.compare.source).toContain('PAX Gold');
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
  });

  it('잘못된 숫자 입력은 원본 조회 전에 400으로 거절한다', async () => {
    const response = await GET(request('district=강남구&aptName=은마&baseYear=2020junk&compareYear=2026'));
    expect(response.status).toBe(400);
    expect(mocks.fetchDollarYearDeals).not.toHaveBeenCalled();
  });

  it('MOLIT 원본을 확인할 수 없을 때 빈 정상값 대신 502를 반환한다', async () => {
    mocks.fetchDollarYearDeals.mockResolvedValue({
      deals: [], hasUsableResponse: false,
      window: {
        requestedMonths: ['202010'], successfulMonths: [], failedMonths: ['202010'],
        matchedMonths: [], canceledExcluded: 0, fallbackUsed: true,
      },
    });

    const response = await GET(request('district=강남구&aptName=은마&baseYear=2020&compareYear=2026'));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.status).toBe('degraded');
    expect(body.error).toContain('0건인지 판별하지 못했습니다');
  });

  it('MOLIT 키가 없으면 구성 장애를 명시하고 503을 반환한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    const response = await GET(request('district=강남구&aptName=은마&baseYear=2020&compareYear=2026'));
    expect(response.status).toBe(503);
    expect(mocks.fetchDollarYearDeals).not.toHaveBeenCalled();
  });
});

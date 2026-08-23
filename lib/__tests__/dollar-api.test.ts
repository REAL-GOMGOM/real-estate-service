import { beforeEach, describe, expect, it, vi } from 'vitest';

const molitMocks = vi.hoisted(() => ({
  fetchTradeMonthAllPages: vi.fn(),
  revalidateForMonth: vi.fn(() => 86400),
}));

vi.mock('@/lib/molit-months', () => molitMocks);

import {
  fetchDollarYearDeals,
  parseDollarDealsXml,
  parseDollarQuery,
  selectDollarAssets,
  type DollarLiveRatesResult,
} from '@/lib/dollar-api';

const NOW = new Date(2026, 7, 9);

function params(query: string) {
  return new URLSearchParams(query);
}

function xml(items = '') {
  const count = (items.match(/<item>/g) ?? []).length;
  return `<response><body><items>${items}</items><totalCount>${count}</totalCount></body></response>`;
}

function item({
  apt = '은마', price = '250,000', area = '84.43', cancellationType = '', cancellationDate = '',
}: {
  apt?: string; price?: string; area?: string; cancellationType?: string; cancellationDate?: string;
} = {}) {
  return `<item><aptNm>${apt}</aptNm><dealAmount>${price}</dealAmount><excluUseAr>${area}</excluUseAr><cdealType>${cancellationType}</cdealType><cdealDay>${cancellationDate}</cdealDay></item>`;
}

beforeEach(() => {
  molitMocks.fetchTradeMonthAllPages.mockReset();
  molitMocks.revalidateForMonth.mockClear();
});

describe('parseDollarQuery', () => {
  it('지원 연도와 정수 면적만 정확히 허용한다', () => {
    expect(parseDollarQuery(params('district=강남구&aptName=은마&baseYear=2020&compareYear=2026&area=84'), NOW))
      .toEqual({
        ok: true,
        value: { district: '강남구', aptName: '은마', baseYear: 2020, compareYear: 2026, area: 84 },
      });
  });

  it.each([
    'district=강남구&aptName=은마&baseYear=2020x&compareYear=2026',
    'district=강남구&aptName=은마&baseYear=2026&compareYear=2020',
    'district=강남구&aptName=은마&baseYear=2020&compareYear=2027',
    'district=강남구&aptName=은마&baseYear=2020&compareYear=2026&area=84.5',
    'district=강남구&aptName=은마&baseYear=2020&compareYear=2026&area=0',
  ])('부분 파싱·역전 연도·미래 연도·잘못된 면적을 거절한다: %s', (query) => {
    expect(parseDollarQuery(params(query), NOW).ok).toBe(false);
  });
});

describe('parseDollarDealsXml', () => {
  it('공백 제거 단지명 일치 거래 중 해제 표시나 해제일이 있는 건을 제외한다', () => {
    const result = parseDollarDealsXml(xml([
      item({ apt: '은마 아파트' }),
      item({ cancellationType: 'O', price: '999,000' }),
      item({ cancellationDate: '20260801', price: '888,000' }),
      item({ apt: '다른단지', price: '777,000' }),
    ].join('')), '은마아파트');

    expect(result).toEqual({
      deals: [{ price: 250000, area: 84.43 }],
      canceledExcluded: 2,
    });
  });
});

describe('fetchDollarYearDeals', () => {
  it('공용 전 페이지 수집기와 월별 캐시 정책을 쓰고 표본 월을 공개한다', async () => {
    molitMocks.fetchTradeMonthAllPages.mockImplementation(async (
      _key: string, _code: string, month: string,
    ) => month === '202011' ? xml(item()) : xml());

    const result = await fetchDollarYearDeals('11680', 2020, '은마', 'test-key', NOW);

    expect(molitMocks.fetchTradeMonthAllPages).toHaveBeenCalledTimes(3);
    expect(molitMocks.fetchTradeMonthAllPages).toHaveBeenCalledWith('test-key', '11680', '202010', 86400);
    expect(molitMocks.revalidateForMonth).toHaveBeenCalledWith('202010');
    expect(result.hasUsableResponse).toBe(true);
    expect(result.deals).toEqual([{ price: 250000, area: 84.43 }]);
    expect(result.window).toMatchObject({
      requestedMonths: ['202010', '202011', '202012'],
      successfulMonths: ['202010', '202011', '202012'],
      matchedMonths: ['202011'],
      failedMonths: [],
      fallbackUsed: false,
    });
  });

  it('오류 XML만 받은 경우 정상 0건으로 위장하지 않는다', async () => {
    molitMocks.fetchTradeMonthAllPages.mockResolvedValue('<resultCode>99</resultCode>');

    const result = await fetchDollarYearDeals('11680', 2020, '은마', 'test-key', NOW);

    expect(result.hasUsableResponse).toBe(false);
    expect(result.deals).toEqual([]);
    expect(result.window.failedMonths).toHaveLength(12);
    expect(result.window.fallbackUsed).toBe(true);
  });
});

describe('selectDollarAssets', () => {
  const staticExchange = {
    value: 1180,
    mode: 'static_estimate' as const,
    source: '정적 참고 추정치',
    period: '2020',
    note: '검증되지 않은 참고값',
  };

  it('과거 자산값은 정적 참고 추정치로 표시한다', () => {
    const result = selectDollarAssets(2020, 2026, staticExchange, null);
    expect(result.exchangeRate).toBe(1180);
    expect(result.provenance.exchangeRate.mode).toBe('static_estimate');
    expect(result.provenance.bitcoin.source).toBe('정적 참고 추정치');
    expect(result.provenance.gold.note).toContain('검증되지 않았습니다');
  });

  it('현재 CoinGecko 값과 BTC 비율 역산 환율을 현물 참고값으로 명시한다', () => {
    const live: DollarLiveRatesResult = {
      ok: true,
      value: { btcKrw: 140_000_000, goldKrwPerGram: 190_000, usdKrwImplied: 1388, fetchedAt: '2026-08-09T00:00:00.000Z' },
    };
    const result = selectDollarAssets(2026, 2026, staticExchange, live);

    expect(result.exchangeRate).toBe(1388);
    expect(result.provenance.exchangeRate).toMatchObject({
      mode: 'live_proxy',
      source: 'CoinGecko BTC 원화·달러 호가 비율 역산',
    });
    expect(result.provenance.gold.source).toContain('PAX Gold');
  });
});

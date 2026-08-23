import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getExchangeRateQuotes, getStaticRate } from '@/lib/exchange-rate';

const originalKey = process.env.BOK_API_KEY;

beforeEach(() => {
  delete process.env.BOK_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.BOK_API_KEY;
  else process.env.BOK_API_KEY = originalKey;
});

describe('getExchangeRateQuotes', () => {
  it('ECOS 키가 없을 때 수록값을 공식값이 아닌 정적 참고 추정치로 반환한다', async () => {
    const result = await getExchangeRateQuotes([2020]);

    expect(result.quotes[2020]).toMatchObject({
      value: 1180,
      mode: 'static_estimate',
      source: '정적 참고 추정치',
    });
    expect(result.warning).toContain('ECOS API 키가 없어');
  });

  it('ECOS가 실제 연간 값을 반환한 연도만 official로 표시한다', async () => {
    process.env.BOK_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        StatisticSearch: { row: [{ TIME: '2020', DATA_VALUE: '1180.3' }] },
      }),
    }));

    const result = await getExchangeRateQuotes([2020, 2026]);

    expect(result.quotes[2020]).toMatchObject({ value: 1180, mode: 'official' });
    expect(result.quotes[2026]).toMatchObject({ value: 1470, mode: 'static_estimate' });
    expect(result.warning).toContain('ECOS에 없는 연도');
  });

  it('지원하지 않는 연도에 1300 같은 임의값을 만들지 않는다', () => {
    expect(getStaticRate(2099)).toBeNull();
  });
});

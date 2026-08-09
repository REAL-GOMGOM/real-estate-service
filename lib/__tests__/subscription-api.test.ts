import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSubscriptions } from '@/lib/subscription-api';

function jsonResponse(data: Record<string, unknown>[], totalCount = data.length): Response {
  return new Response(JSON.stringify({ data, totalCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('청약홈 공공데이터 계약', () => {
  const originalKey = process.env.PUBLIC_DATA_API_KEY;

  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PUBLIC_DATA_API_KEY;
    else process.env.PUBLIC_DATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('모든 공고 원본이 실패하면 예외나 가짜 0건 대신 unavailable을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream unavailable')));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.status).toBe('unavailable');
    expect(result.items).toEqual([]);
    expect(result.coverage.successfulEndpoints).toBe(0);
    expect(result.coverage.failedEndpoints).toHaveLength(10);
    expect(result.note).toContain('임시 공고를 대신 표시하지 않습니다');
  });

  it('확인된 일정·면적·평형별 경쟁률만 사용하고 후보 가격과 단순 평균은 숨긴다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('getAPTLttotPblancDetail')) {
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-1',
          HOUSE_NM: '검증 단지',
          RCEPT_BGNDE: '2099-01-01',
          RCEPT_ENDDE: '20990102',
          PRZWNER_PRESNATN_DE: '2099.01.10',
          SUBSCRPT_AREA_CODE_NM: '서울',
          HSSPLY_ADRES: '서울시 테스트구',
          TOT_SUPLY_HSHLDCO: '120',
          PBLANC_URL: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=H-1',
        }]);
      }
      if (url.includes('getAPTLttotPblancMdl')) {
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-1',
          SUPLY_AR: '84.97',
          SUPLY_AMOUNT: '999999',
          LTTOT_TOP_PRICE: '888888',
        }]);
      }
      if (url.includes('getAPTLttotPblancCmpet')) {
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-1',
          HOUSE_TY: '084.9700A',
          CMPET_RATE: '12.3',
          REQ_CNT: '1,230',
        }]);
      }
      return jsonResponse([]);
    }));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.status).toBe('ok');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      startDate: '2099-01-01',
      endDate: '2099-01-02',
      announceDate: '2099-01-10',
      status: 'upcoming',
      houseType: '85㎡',
      minPrice: null,
      maxPrice: null,
      competitionRate: null,
      competitionRates: [{ houseType: '084.9700A', rate: 12.3, reqCount: 1230 }],
      sourceUrl: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=H-1',
    });
  });

  it('날짜가 누락되거나 실제 달력일이 아니면 예정 공고로 만들지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('getAPTLttotPblancDetail')) {
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-2',
          HOUSE_NM: '날짜 오류 단지',
          RCEPT_BGNDE: '20990230',
          RCEPT_ENDDE: '20990301',
        }]);
      }
      return jsonResponse([]);
    }));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.status).toBe('partial');
    expect(result.items).toEqual([]);
    expect(result.coverage.discardedRows).toBe(1);
    expect(result.note).toContain('날짜·필수값 오류 1건 제외');
  });

  it('공고에 세대수가 없으면 실제 0세대로 만들지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('getAPTLttotPblancDetail')) {
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-NO-UNITS',
          HOUSE_NM: '세대수 미표기 단지',
          RCEPT_BGNDE: '20990101',
          RCEPT_ENDDE: '20990102',
        }]);
      }
      return jsonResponse([]);
    }));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].totalUnits).toBeNull();
  });

  it('후속 페이지 하나가 실패하면 성공한 일부 행은 partial로 명시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes('getAPTLttotPblancDetail')) {
        if (url.searchParams.get('page') === '2') throw new Error('page 2 failed');
        return jsonResponse([{
          HOUSE_MANAGE_NO: 'H-3',
          HOUSE_NM: '부분 수집 단지',
          RCEPT_BGNDE: '20990101',
          RCEPT_ENDDE: '20990102',
        }], 101);
      }
      return jsonResponse([]);
    }));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.status).toBe('partial');
    expect(result.items).toHaveLength(1);
    expect(result.coverage.incompleteEndpoints).toContain('일반분양 공고');
    expect(result.note).toContain('부분 수집');
  });

  it('진행·예정은 모두 유지하고 오래된 마감 공고만 전송 대상에서 제외한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('getAPTLttotPblancDetail')) {
        return jsonResponse([
          { HOUSE_MANAGE_NO: 'ACTIVE', HOUSE_NM: '진행 공고', RCEPT_BGNDE: '20260801', RCEPT_ENDDE: '20260810', PBLANC_URL: 'https://evil.example/phishing' },
          { HOUSE_MANAGE_NO: 'RECENT', HOUSE_NM: '최근 마감', RCEPT_BGNDE: '20260701', RCEPT_ENDDE: '20260705' },
          { HOUSE_MANAGE_NO: 'OLD', HOUSE_NM: '오래된 마감', RCEPT_BGNDE: '20240101', RCEPT_ENDDE: '20240105' },
          { HOUSE_MANAGE_NO: 'FUTURE', HOUSE_NM: '예정 공고', RCEPT_BGNDE: '20270101', RCEPT_ENDDE: '20270102' },
        ]);
      }
      return jsonResponse([]);
    }));

    const result = await fetchSubscriptions('2026-08-09');

    expect(result.items.map((item) => item.name)).toEqual(['진행 공고', '예정 공고', '최근 마감']);
    expect(result.items[0].sourceUrl).toBeUndefined();
    expect(result.coverage.displayWindowStart).toBe('2026-02-10');
    expect(result.coverage.historicalRowsExcluded).toBe(1);
  });
});

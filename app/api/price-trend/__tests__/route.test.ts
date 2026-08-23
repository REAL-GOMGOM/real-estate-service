import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const fetchMock = vi.fn();
const originalApiKey = process.env.REALESTATE_STAT_API_KEY;

function request(query = '') {
  return new NextRequest(`https://www.naezipkorea.com/api/price-trend${query}`);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.REALESTATE_STAT_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.REALESTATE_STAT_API_KEY;
  else process.env.REALESTATE_STAT_API_KEY = originalApiKey;
});

describe('GET /api/price-trend', () => {
  it('연결 설정이 없을 때 더미 곡선 대신 503을 반환한다', async () => {
    const response = await GET(request('?period=six_months'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('지원하지 않는 기간 이름을 거부한다', async () => {
    const response = await GET(request('?period=weekly'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '유효하지 않은 조회 기간' });
  });

  it('모든 원본 호출이 실패하면 생성 데이터 대신 502를 반환한다', async () => {
    process.env.REALESTATE_STAT_API_KEY = 'test-key';
    fetchMock.mockRejectedValue(new Error('upstream unavailable'));

    const response = await GET(request('?period=six_months&region=서울'));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.status).toBe('degraded');
    expect(body.data).toBeUndefined();
  });

  it('실제 월간 지수의 첫 공개 월 대비 변화만 반환한다', async () => {
    process.env.REALESTATE_STAT_API_KEY = 'test-key';
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          SttsApiTblData: [{}, {
            row: [{ CLS_FULLNM: '서울', CLS_NM: '서울', DTA_VAL: String(100 + call) }],
          }],
        }),
      };
    });

    const response = await GET(request('?period=six_months&region=서울'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      period: 'six_months',
      frequency: 'monthly',
      metric: 'change_from_first_month_pct',
      source: '한국부동산원 R-ONE',
    });
    expect(body.data).toHaveLength(6);
    expect(body.coverage).toMatchObject({ requestedMonths: 6, returnedMonths: 6, unavailableMonths: 0 });
    expect(body.data[0].regions.서울).toBe(0);
  });
});

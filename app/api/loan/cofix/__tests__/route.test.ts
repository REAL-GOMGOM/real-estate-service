import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const fetchMock = vi.fn();

function ecosResponse(rows: Array<{ TIME: string; DATA_VALUE: unknown }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      StatisticSearch: {
        row: rows,
      },
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-23T03:00:00.000Z'));
  vi.stubEnv('BOK_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/loan/cofix', () => {
  it('12개월 범위에서 잘못된 최신 행을 건너뛰고 첫 유효값을 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(ecosResponse([
      { TIME: '202605', DATA_VALUE: '3.51' },
      { TIME: '202608', DATA_VALUE: 'N/A' },
      { TIME: '202604', DATA_VALUE: '3.42' },
    ]));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      rate: 3.51,
      period: '202605',
      name: '예금은행 대출평균금리(신규취급액)',
    });
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=86400, stale-while-revalidate=3600'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/1/100/121Y006/M/202509/202608/BECBLA01');
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('최근 12개월 범위가 없으면 404를 반환한다', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: '최근 12개월 내 예금은행 대출평균금리 데이터를 찾을 수 없습니다.',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('API 키가 없으면 외부 요청 없이 설정 오류를 반환한다', async () => {
    vi.stubEnv('BOK_API_KEY', '  ');

    const response = await GET();

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('범위 조회 통신 오류를 데이터 없음으로 오인하지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('ECOS unavailable'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: '예금은행 대출평균금리 조회 중 오류가 발생했습니다.',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

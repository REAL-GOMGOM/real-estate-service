import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchHighlightLists: vi.fn(),
  getBlogDb: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: mocks.connection,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
vi.mock('@/lib/agg-queries', () => ({ fetchHighlightLists: mocks.fetchHighlightLists }));
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));

import { GET } from '../route';

function request(window = 'rolling30') {
  return { nextUrl: new URL(`https://example.com/api/transactions/highlights?window=${window}`) } as never;
}

function database(result: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return { select: vi.fn(() => query) };
}

beforeEach(() => {
  mocks.connection.mockReset();
  mocks.fetchHighlightLists.mockReset();
  mocks.getBlogDb.mockReset();
  mocks.getBlogDb.mockReturnValue(database([]));
});

describe('GET /api/transactions/highlights', () => {
  it('정상적으로 0건인 응답을 status=ok로 구분한다', async () => {
    mocks.fetchHighlightLists.mockResolvedValue({ newHighs: [], surges: [], pyeong84: [] });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('ok');
    expect(json.newHighs).toEqual([]);
    expect(json.surges).toEqual([]);
    expect(json.pyeong84).toEqual([]);
  });

  it('DB 장애 빈 집계를 status=degraded로 구분한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchHighlightLists.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(json.note).toContain('일시 점검 중');
  });

  it('동명 단지는 법정동까지 일치하는 마스터 id만 부착한다', async () => {
    mocks.fetchHighlightLists.mockResolvedValue({
      newHighs: [{
        sigungu: '강남구', umdNm: '압구정동', aptName: '현대', area: 84,
        floor: 10, price: 300000, dealDate: '2026-08-01', prevHigh: 290000,
      }],
      surges: [{
        sigungu: '강남구', umdNm: '대치동', aptName: '현대', area: 84,
        floor: 12, price: 250000, dealDate: '2026-08-02', prevPrice: 200000,
      }],
      pyeong84: [],
    });
    mocks.getBlogDb.mockReturnValue(database([
      { id: 'apt-apgujeong', name: '현대', aliases: [], lawdCd: '11680', dong: '압구정동' },
      { id: 'apt-daechi', name: '현대', aliases: [], lawdCd: '11680', dong: '대치동' },
    ]));

    const response = await GET(request());
    const json = await response.json();

    expect(json.newHighs[0]).toMatchObject({ dong: '압구정동', masterId: 'apt-apgujeong' });
    expect(json.surges[0]).toMatchObject({ dong: '대치동', masterId: 'apt-daechi' });
  });
});

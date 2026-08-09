import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchDistrictAggs: vi.fn(),
  fetchRentDistrictAggs: vi.fn(),
  fetchSilvDistrictAggs: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: mocks.connection,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
vi.mock('@/lib/agg-queries', () => ({
  fetchDistrictAggs: mocks.fetchDistrictAggs,
  fetchRentDistrictAggs: mocks.fetchRentDistrictAggs,
  fetchSilvDistrictAggs: mocks.fetchSilvDistrictAggs,
}));
vi.mock('@/lib/db/client', () => ({ getBlogDb: vi.fn() }));

import { GET } from '../route';

function request(query = '') {
  return {
    nextUrl: new URL(`https://example.com/api/transactions/summary${query}`),
  } as never;
}

beforeEach(() => {
  mocks.connection.mockReset();
  mocks.fetchDistrictAggs.mockReset();
  mocks.fetchRentDistrictAggs.mockReset();
  mocks.fetchSilvDistrictAggs.mockReset();
});

describe('GET /api/transactions/summary', () => {
  it('정상적인 0건 집계도 지역 행과 status=ok로 반환한다', async () => {
    mocks.fetchSilvDistrictAggs.mockResolvedValue([]);

    const response = await GET(request('?dealType=bunyang'));
    const json = await response.json();

    expect(json.status).toBe('ok');
    expect(json.summary.length).toBeGreaterThan(0);
    expect(json.summary.every((row: { estimatedCount: number }) => row.estimatedCount === 0)).toBe(true);
  });

  it('DB 장애 빈 응답을 status=degraded로 명시한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetchDistrictAggs.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('degraded');
    expect(json.summary).toEqual([]);
    expect(json.note).toContain('일시 점검 중');
  });
});

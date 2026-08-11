import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchDistrictAggs: vi.fn(),
  fetchRentDistrictAggs: vi.fn(),
  fetchSilvDistrictAggs: vi.fn(),
  getBlogDb: vi.fn(),
  getNamedArtifact: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
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
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({
    getNamedArtifact: mocks.getNamedArtifact,
  }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

function request(query = '') {
  return {
    nextUrl: new URL(`https://example.com/api/transactions/summary${query}`),
  } as never;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
  mocks.connection.mockReset();
  mocks.fetchDistrictAggs.mockReset();
  mocks.fetchRentDistrictAggs.mockReset();
  mocks.fetchSilvDistrictAggs.mockReset();
  mocks.getBlogDb.mockReset();
  mocks.getNamedArtifact.mockReset();
  mocks.getNamedArtifact.mockResolvedValue({
    status: 'disabled',
    reason: 'base-url-not-configured',
  });
  mocks.isPublicSnapshotConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function summaryRows(monthly = false, count = 1) {
  return DISTRICT_GROUPS.map((group) => ({
    label: group.label,
    districtCount: group.districts.length,
    estimatedCount: count,
    sampleCount: count,
    newHighs: 0,
    avg59: null,
    avg84: null,
    ...(monthly ? { avgRent59: null, avgRent84: null } : {}),
    firstDistrict: group.districts[0],
  }));
}

function snapshotEnvelope(options: {
  dealType?: 'buy' | 'jeonse' | 'monthly' | 'bunyang';
  count?: number;
  itemCount?: number;
  from?: string;
  to?: string;
  generatedAt?: string;
} = {}) {
  const rows = summaryRows(options.dealType === 'monthly', options.count ?? 1);
  const generatedAt = options.generatedAt ?? '2026-08-11T02:30:00.000Z';
  return {
    schema: 'naezip.transaction-summary.v1',
    generatedAt,
    itemCount: options.itemCount ?? rows.length,
    data: {
      status: 'ok',
      summary: rows,
      daily: null,
      month: '202608',
      window: {
        type: 'rolling30',
        from: options.from ?? '2026-07-13',
        to: options.to ?? '2026-08-12',
      },
      updatedAt: generatedAt,
      note: '공개 스냅샷 집계',
    },
  };
}

describe('GET /api/transactions/summary', () => {
  it('유효한 rolling30 스냅샷 hit는 집계·DB를 호출하지 않는다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope(),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(mocks.getNamedArtifact).toHaveBeenCalledWith('summary/rolling30/buy');
    expect(json.status).toBe('ok');
    expect(json.note).toBe('공개 스냅샷 집계');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.fetchRentDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.fetchSilvDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('itemCount가 일치하지 않는 스냅샷은 기존 DB 집계로 폴백한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ dealType: 'bunyang', itemCount: 0 }),
    });
    mocks.fetchSilvDistrictAggs.mockResolvedValue([]);

    const response = await GET(request('?dealType=bunyang'));
    const json = await response.json();

    expect(mocks.getNamedArtifact).toHaveBeenCalledWith('summary/rolling30/bunyang');
    expect(mocks.fetchSilvDistrictAggs).toHaveBeenCalledOnce();
    expect(json.status).toBe('ok');
    expect(json.note).toContain('자체 분양권 원장');
  });

  it('serving mode의 snapshot miss는 stale DB 집계 없이 degraded로 반환한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ itemCount: 0 }),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(json.summary).toEqual([]);
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.fetchRentDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.fetchSilvDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('전체 지역이 0건인 유효 스냅샷도 hit로 처리한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ count: 0 }),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.summary).toHaveLength(DISTRICT_GROUPS.length);
    expect(json.summary.every((row: { estimatedCount: number }) => row.estimatedCount === 0)).toBe(true);
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('48시간 이내의 하루 전 last-good 스냅샷도 hit로 사용한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({
        from: '2026-07-12',
        to: '2026-08-11',
        generatedAt: '2026-08-10T02:30:00.000Z',
      }),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.window).toEqual({
      type: 'rolling30',
      from: '2026-07-12',
      to: '2026-08-11',
    });
    expect(json.updatedAt).toBe('2026-08-10T02:30:00.000Z');
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('48시간보다 오래된 스냅샷은 DB 집계로 폴백한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({
        from: '2026-07-10',
        to: '2026-08-09',
        generatedAt: '2026-08-09T02:59:59.999Z',
      }),
    });
    mocks.fetchSilvDistrictAggs.mockResolvedValue([]);

    await GET(request('?dealType=bunyang'));

    expect(mocks.fetchSilvDistrictAggs).toHaveBeenCalledOnce();
  });

  it('월별 요청은 스냅샷을 조회하지 않고 기존 DB 경로를 사용한다', async () => {
    mocks.fetchSilvDistrictAggs.mockResolvedValue([]);

    await GET(request('?window=202607&dealType=bunyang'));

    expect(mocks.getNamedArtifact).not.toHaveBeenCalled();
    expect(mocks.fetchSilvDistrictAggs).toHaveBeenCalledWith('2026-07-01', '2026-08-01');
  });

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

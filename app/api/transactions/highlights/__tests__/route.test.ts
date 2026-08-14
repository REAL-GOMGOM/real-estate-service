import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  fetchHighlightLists: vi.fn(),
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
vi.mock('@/lib/agg-queries', () => ({ fetchHighlightLists: mocks.fetchHighlightLists }));
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({ getNamedArtifact: mocks.getNamedArtifact }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';
import { buildRolling30HighlightsArtifact } from '@/lib/public-snapshots/serving-artifacts';

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-14T03:00:00Z'));
  mocks.connection.mockReset();
  mocks.fetchHighlightLists.mockReset();
  mocks.getBlogDb.mockReset();
  mocks.getNamedArtifact.mockReset();
  mocks.isPublicSnapshotConfigured.mockReset();
  mocks.getBlogDb.mockReturnValue(database([]));
  mocks.getNamedArtifact.mockResolvedValue({ status: 'disabled', reason: 'base-url-not-configured' });
  mocks.isPublicSnapshotConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function snapshotEnvelope(options: { generatedAt?: string; empty?: boolean } = {}) {
  const generatedAt = options.generatedAt ?? '2026-08-13T13:12:16.831Z';
  const artifact = buildRolling30HighlightsArtifact({
    generatedAt,
    newHighs: options.empty ? [] : [{
      district: '강남구', dong: '대치동', apt: '은마', area: 84.43,
      floor: 10, price: 300000, date: '2026-08-12', masterId: 'A13583507', prevHigh: 290000,
    }],
    surges: [],
    pyeong84: [],
  });
  return { schema: artifact.schema, generatedAt, itemCount: artifact.itemCount, data: artifact.data };
}

describe('GET /api/transactions/highlights', () => {
  it('rolling30 스냅샷 hit는 Neon 없이 헤더와 완성 응답을 반환한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: snapshotEnvelope() });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('ok');
    expect(json.newHighs).toHaveLength(1);
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(response.headers.get('X-Naezip-Snapshot-Generated-At')).toBe('2026-08-13T13:12:16.831Z');
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('정상적인 빈 스냅샷도 hit이며 Neon으로 폴백하지 않는다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: snapshotEnvelope({ empty: true }) });

    const response = await GET(request());
    const json = await response.json();

    expect(json).toMatchObject({ status: 'ok', newHighs: [], surges: [], pyeong84: [] });
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
  });

  it('configured snapshot이 오래됐으면 degraded로 강등하고 Neon을 호출하지 않는다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ generatedAt: '2026-08-10T03:00:00.000Z', empty: true }),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(response.headers.get('X-Naezip-Data-Source')).toBeNull();
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('configured snapshot 본문이 깨졌어도 Neon 없이 degraded로 응답한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: { schema: 'wrong', generatedAt: '2026-08-13T13:12:16.831Z', itemCount: 0, data: {} },
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('허용 오차 안의 미래 시각이어도 KST 다음날 window이면 거부한다', async () => {
    vi.setSystemTime(new Date('2026-08-14T14:59:00.000Z'));
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: snapshotEnvelope({ generatedAt: '2026-08-14T15:01:00.000Z', empty: true }),
    });

    const response = await GET(request());
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(response.headers.get('X-Naezip-Data-Source')).toBeNull();
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
  });

  it('configured mode의 월별 요청은 지원 전까지 Neon 없이 degraded로 응답한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);

    const response = await GET(request('202608'));
    const json = await response.json();

    expect(json.status).toBe('degraded');
    expect(mocks.getNamedArtifact).not.toHaveBeenCalled();
    expect(mocks.fetchHighlightLists).not.toHaveBeenCalled();
  });

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

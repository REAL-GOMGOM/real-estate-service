import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import type { ApartmentIndexItem } from '@/lib/public-snapshots/serving-artifacts';

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  getNamedArtifact: vi.fn(),
  getBlogDb: vi.fn(),
}));

vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: mocks.createRuntime,
}));

vi.mock('@/lib/db/client', () => ({
  getBlogDb: mocks.getBlogDb,
}));

import { GET } from '../route';

const apartment: ApartmentIndexItem = {
  id: 'apt-snapshot',
  name: '래미안 퍼스티지',
  aliases: ['래미안퍼스티지'],
  sido: '서울특별시',
  sigungu: '서초구',
  dong: '반포동',
  lawdCd: '11650',
  totalHouseholds: 2444,
  score: 1.5,
};

function envelope(data: ApartmentIndexItem[]) {
  return {
    schema: 'naezip.apartment-index.v1',
    generatedAt: '2026-08-11T00:00:00.000Z',
    itemCount: data.length,
    data,
  };
}

function dbWithRows(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockResolvedValue(rows);
  const db = { select: vi.fn(() => query) };
  mocks.getBlogDb.mockReturnValue(db);
  return db;
}

describe('GET /api/apartments/search snapshot-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    mocks.createRuntime.mockReturnValue({ getNamedArtifact: mocks.getNamedArtifact });
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('입력 검증을 snapshot과 DB 조회보다 먼저 수행한다', async () => {
    const response = await GET(new NextRequest('http://localhost/api/apartments/search?q=a'));

    expect(response.status).toBe(400);
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.getNamedArtifact).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('유효한 apartment index hit는 기존 schema로 반환하고 DB를 호출하지 않는다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: envelope([apartment]) });

    const response = await GET(new NextRequest(
      'http://localhost/api/apartments/search?q=%EB%9E%98%EB%AF%B8%EC%95%88&limit=5',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(response.headers.get('x-naezip-snapshot-generated-at'))
      .toBe('2026-08-11T00:00:00.000Z');
    expect(body).toEqual({
      results: [{
        id: apartment.id,
        name: apartment.name,
        sido: apartment.sido,
        sigungu: apartment.sigungu,
        dong: apartment.dong,
        lawdCd: apartment.lawdCd,
      }],
      query: '래미안',
      count: 1,
    });
    expect(mocks.getNamedArtifact).toHaveBeenCalledWith('apartment-index');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('유효한 snapshot의 검색 결과가 비어도 results 빈 배열을 권위 있게 반환한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: envelope([]) });

    const response = await GET(new NextRequest(
      'http://localhost/api/apartments/search?q=%EC%97%86%EB%8A%94%EB%8B%A8%EC%A7%80',
    ));
    const body = await response.json();

    expect(body).toEqual({ results: [], query: '없는단지', count: 0 });
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('엄격 검증을 통과하지 못한 envelope는 기존 DB 검색으로 폴백한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: { ...envelope([apartment]), schema: 'wrong-schema' },
    });
    const dbRow = {
      id: 'apt-db',
      name: '래미안 DB',
      sido: '서울특별시',
      sigungu: '서초구',
      dong: '반포동',
      lawdCd: '11650',
    };
    const db = dbWithRows([dbRow]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await GET(new NextRequest(
      'http://localhost/api/apartments/search?q=%EB%9E%98%EB%AF%B8%EC%95%88',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ results: [dbRow], query: '래미안', count: 1 });
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(db.select).toHaveBeenCalledOnce();
  });

  it('오래된 index는 권위 있게 빈 결과를 내지 않고 기존 DB로 폴백한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: { ...envelope([]), generatedAt: '2026-08-01T00:00:00.000Z' },
    });
    const dbRow = {
      id: 'apt-db', name: '래미안 DB', sido: '서울특별시', sigungu: '서초구',
      dong: '반포동', lawdCd: '11650',
    };
    dbWithRows([dbRow]);

    const response = await GET(new NextRequest(
      'http://localhost/api/apartments/search?q=%EB%9E%98%EB%AF%B8%EC%95%88',
    ));
    const body = await response.json();

    expect(body.results).toEqual([dbRow]);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(mocks.getBlogDb).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchSilvMonthAllPages: vi.fn(),
  getDistrictSnapshot: vi.fn(),
}));

vi.mock('@/lib/molit-months', () => ({
  getMonthList: () => ['202607', '202606'],
  fetchSilvMonthAllPages: mocks.fetchSilvMonthAllPages,
  revalidateForMonth: () => 0,
}));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({
    getDistrictSnapshot: mocks.getDistrictSnapshot,
  }),
}));

import { GET } from '../route';

const XML = '<item><aptNm>분양단지</aptNm><excluUseAr>84</excluUseAr><dealAmount>100,000</dealAmount><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay><floor>10</floor><umdNm>삼성동</umdNm><jibun>1-1</jibun><cdealType></cdealType></item>';

function snapshot(records: unknown[] = [{
  kind: 'presale',
  id: '222222222222222222222222',
  apartmentId: null,
  aptName: '분양단지',
  district: '강남구',
  dong: '삼성동',
  areaM2: 84,
  floor: 10,
  dealDate: '2026-08-10',
  buildYear: null,
  amountManwon: 100_000,
  canceled: false,
}]) {
  return {
    schema: 'naezip.public-transactions.v2',
    generatedAt: '2026-08-11T02:00:00.000Z',
    partition: { lawdCd: '11680', district: '강남구' },
    period: { from: '2026-01-01', through: '2026-08-11' },
    recordCount: records.length,
    records,
  };
}

describe('GET /api/transactions/silv partial contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PUBLIC_DATA_API_KEY;
  });

  it('검증된 스냅샷 hit는 공공 API key 없이도 반환한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot() });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(response.headers.get('x-naezip-snapshot-generated-at'))
      .toBe('2026-08-11T02:00:00.000Z');
    expect(body.status).toBe('ok');
    expect(body.total).toBe(1);
    expect(body.data[0].name).toBe('분양단지');
    expect(mocks.fetchSilvMonthAllPages).not.toHaveBeenCalled();
  });

  it('유효한 0건 스냅샷을 장애로 오인해 폴백하지 않는다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot([]) });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(mocks.fetchSilvMonthAllPages).not.toHaveBeenCalled();
  });

  it('입력 검증을 스냅샷 조회보다 먼저 수행한다', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EC%97%86%EB%8A%94%EA%B5%AC&months=2',
    ));

    expect(response.status).toBe(400);
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
  });

  it('손상된 스냅샷은 성공처럼 노출하지 않고 기존 live 경로로 폴백한다', async () => {
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'success',
      data: { ...snapshot(), recordCount: 2 },
    });
    mocks.fetchSilvMonthAllPages.mockResolvedValue(XML);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2',
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(mocks.fetchSilvMonthAllPages).toHaveBeenCalledTimes(2);
  });

  it('일부 월 조회 실패를 완전한 기간처럼 숨기지 않는다', async () => {
    mocks.fetchSilvMonthAllPages
      .mockResolvedValueOnce(XML)
      .mockRejectedValueOnce(new Error('temporary failure'));

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/silv?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.failedMonths).toEqual(['202606']);
    expect(body.total).toBe(1);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

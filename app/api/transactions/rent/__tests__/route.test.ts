import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchRentMonthAllPages: vi.fn(),
  getBlogDb: vi.fn(),
  getDistrictSnapshot: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
  txSource: vi.fn(),
}));

vi.mock('@/lib/molit-months', () => ({
  getMonthList: () => ['202607', '202606'],
  fetchRentMonthAllPages: mocks.fetchRentMonthAllPages,
  revalidateForMonth: () => 0,
}));

vi.mock('@/lib/tx-source', () => ({ txSource: mocks.txSource }));
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({
    getDistrictSnapshot: mocks.getDistrictSnapshot,
  }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';

const XML = '<item><aptNm>래미안</aptNm><excluUseAr>84</excluUseAr><deposit>100,000</deposit><monthlyRent>0</monthlyRent><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay><floor>10</floor><umdNm>대치동</umdNm><buildYear>2015</buildYear></item>';

function snapshot(records: unknown[] = [{
  kind: 'rent',
  id: '111111111111111111111111',
  apartmentId: null,
  aptName: '래미안',
  district: '강남구',
  dong: '대치동',
  areaM2: 84,
  floor: 10,
  dealDate: '2026-08-10',
  buildYear: 2015,
  depositManwon: 100_000,
  monthlyRentManwon: 0,
  contractType: null,
  previousDepositManwon: null,
  previousMonthlyRentManwon: null,
}]) {
  return {
    schema: 'naezip.public-transactions.v1',
    generatedAt: '2026-08-11T02:00:00.000Z',
    partition: { lawdCd: '11680', district: '강남구' },
    period: { from: '2026-07-01', through: '2026-08-11' },
    recordCount: records.length,
    records,
  };
}

describe('GET /api/transactions/rent partial contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
    mocks.txSource.mockReturnValue('live');
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PUBLIC_DATA_API_KEY;
  });

  it('검증된 스냅샷 hit는 DB·공공 API 없이 반환한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot() });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&rentType=jeonse',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(response.headers.get('x-naezip-snapshot-generated-at'))
      .toBe('2026-08-11T02:00:00.000Z');
    expect(body.status).toBe('ok');
    expect(body.total).toBe(1);
    expect(body.data[0].name).toBe('래미안');
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });

  it('유효한 0건 스냅샷을 장애로 오인해 폴백하지 않는다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot([]) });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&rentType=all',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });

  it('serving mode의 3개월 miss는 stale DB를 건너뛰고 live-first로 조회한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.txSource.mockReturnValue('db');
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot() });
    mocks.fetchRentMonthAllPages.mockResolvedValue(XML);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=3&rentType=jeonse',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(mocks.fetchRentMonthAllPages).toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.txSource).not.toHaveBeenCalled();
  });

  it('입력 검증을 스냅샷 조회보다 먼저 수행한다', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EC%97%86%EB%8A%94%EA%B5%AC&months=2',
    ));

    expect(response.status).toBe(400);
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
  });

  it('손상된 스냅샷은 성공처럼 노출하지 않고 기존 live 경로로 폴백한다', async () => {
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'success',
      data: { ...snapshot(), recordCount: 2 },
    });
    mocks.fetchRentMonthAllPages.mockResolvedValue(XML);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&rentType=jeonse',
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(mocks.fetchRentMonthAllPages).toHaveBeenCalledTimes(2);
  });

  it('일부 월 조회 실패를 완전한 기간처럼 숨기지 않는다', async () => {
    mocks.fetchRentMonthAllPages
      .mockResolvedValueOnce(XML)
      .mockRejectedValueOnce(new Error('temporary failure'));

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/rent?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&rentType=jeonse',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.failedMonths).toEqual(['202606']);
    expect(body.total).toBe(1);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

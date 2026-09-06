import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchRentMonthAllPages: vi.fn(),
  getBlogDb: vi.fn(),
  getDistrictSnapshot: vi.fn(),
  getNamedArtifact: vi.fn(),
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
    getNamedArtifact: mocks.getNamedArtifact,
  }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';

const XML = '<item><aptNm>래미안</aptNm><excluUseAr>84</excluUseAr><deposit>100,000</deposit><monthlyRent>0</monthlyRent><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay><floor>10</floor><umdNm>대치동</umdNm><buildYear>2015</buildYear></item>';

const APARTMENT = {
  id: 'apt-garam', name: '일원동가람아파트', aliases: ['가람'], dong: '일원동',
  lawdCd: '11680', sigungu: '강남구', sido: '서울특별시', totalHouseholds: 200, score: null,
};

function apartmentIndex(data = [APARTMENT]) {
  return {
    status: 'success',
    data: { schema: 'naezip.apartment-index.v1', generatedAt: '2026-08-11T02:00:00.000Z', itemCount: data.length, data },
  };
}

function rentXml(name: string, dong: string, monthly = 0) {
  return XML.replace('래미안', name).replace('대치동', dong).replace('<monthlyRent>0', `<monthlyRent>${monthly}`);
}

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
    schema: 'naezip.public-transactions.v2',
    generatedAt: '2026-08-11T02:00:00.000Z',
    partition: { lawdCd: '11680', district: '강남구' },
    period: { from: '2026-07-01', through: '2026-08-11' },
    recordCount: records.length,
    records,
  };
}

describe('GET /api/transactions/rent partial contract', () => {
  it.each(['abort', 'budget'])('웹 %s는 일부 성공분이 있어도 503 no-store이며 DB로 우회하지 않는다', async (stop) => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.txSource.mockReturnValue('db');
    // Snapshot/identity overhead must consume, not reset, the GET's 45s budget.
    mocks.getDistrictSnapshot.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return { status: 'unavailable', reason: 'network-error' };
    });
    mocks.fetchRentMonthAllPages.mockResolvedValueOnce(XML).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = GET(new NextRequest('http://localhost/api/transactions/rent?district=강남구&months=36&rentType=jeonse', {
      signal: controller.signal,
    }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.fetchRentMonthAllPages).toHaveBeenCalledTimes(2);
    const options = mocks.fetchRentMonthAllPages.mock.calls[1][4];
    expect(options).toMatchObject({ timeoutMs: 8_000, pageConcurrency: 2 });
    if (stop === 'abort') controller.abort('serviceKey=secret');
    else await vi.advanceTimersByTimeAsync(40_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(body).not.toHaveProperty('data');
    expect(body).not.toHaveProperty('status', 'partial');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(options.signal.aborted).toBe(true);
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.txSource).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
    mocks.txSource.mockReturnValue('live');
    mocks.getNamedArtifact.mockResolvedValue({ status: 'disabled', reason: 'base-url-not-configured' });
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PUBLIC_DATA_API_KEY;
  });

  it('이름·동 검색 total은 matching 거래만 세고 지역 목록 limit/최근10건 축약 전 합계를 유지한다', async () => {
    const xml = Array.from({ length: 37 }, (_, index) => rentXml(index < 35 ? '다른단지' : '가람', '일원동')
      .replace('<floor>10', `<floor>${index + 1}`)).join('');
    mocks.fetchRentMonthAllPages.mockImplementation((_key, _lawdCd, month) => Promise.resolve(month === '202607' ? xml : ''));

    const searched = await GET(new NextRequest('http://localhost/api/transactions/rent?district=강남구&q=가람&aptDong=일원동&months=2&rentType=jeonse'));
    const selected = await searched.json();
    expect(selected.total).toBe(2);
    expect(selected.data).toHaveLength(1);
    expect(selected.data[0]).toMatchObject({ name: '가람', dong: '일원동', txCount: 2 });

    const all = await GET(new NextRequest('http://localhost/api/transactions/rent?district=강남구&months=2&rentType=jeonse'));
    expect(await all.json()).toMatchObject({ total: 37 });
    const limited = await GET(new NextRequest('http://localhost/api/transactions/rent?district=강남구&months=2&rentType=jeonse&limit=1'));
    const body = await limited.json();
    expect(body.total).toBe(37);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '다른단지', txCount: 35 });
    expect(body.data[0].transactions).toHaveLength(10);
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

  it.each(['jeonse', 'monthly'])('선택 단지는 live %s 상위 60개 제한 전에 동·별칭으로 찾는다', async (rentType) => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const monthly = rentType === 'monthly' ? 120 : 0;
    const busy = Array.from({ length: 61 }, (_, index) =>
      rentXml(`인기단지${index}`, '대치동', monthly).repeat(3)).join('');
    mocks.fetchRentMonthAllPages.mockResolvedValueOnce(busy
      + rentXml('가람', '일원동', monthly).repeat(2)
      + rentXml('가람', '대치동', monthly).repeat(3)
      + rentXml('가람', '일원동', monthly ? 0 : 120))
      .mockResolvedValueOnce('');

    const response = await GET(new NextRequest(`http://localhost/api/transactions/rent?aptId=apt-garam&aptName=인기단지&aptDong=대치동&district=송파구&months=2&rentType=${rentType}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ district: '강남구', selectedAptId: 'apt-garam', total: 2, status: 'ok' });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '가람', dong: '일원동', masterId: 'apt-garam', txCount: 2 });
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('선택 단지의 0건 스냅샷과 기준정보 장애를 구분한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot() });
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&months=2'));
    expect(await response.json()).toMatchObject({ selectedAptId: 'apt-garam', total: 0, data: [], status: 'ok' });
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });

  it.each(['missing', 'corrupt', 'stale', 'unknown'])('aptId 기준정보 %s는 지역 전체로 폴백하지 않는다', async (kind) => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    const index = apartmentIndex(kind === 'unknown' ? [] : [APARTMENT]);
    if (kind === 'corrupt') index.data.itemCount = 200;
    if (kind === 'stale') index.data.generatedAt = '2026-07-01T00:00:00.000Z';
    if (kind !== 'missing') mocks.getNamedArtifact.mockResolvedValue(index);
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&aptName=가람&district=강남구&months=2'));
    expect(response.status).toBe(kind === 'unknown' ? 404 : 503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('비공개 DB 모드에서도 aptId로 마스터를 확인하고 집계 top60을 우회한다', async () => {
    mocks.txSource.mockReturnValue('db');
    const tx = {
      aptName: '가람', umdNm: '일원동', areaM2: 84, floor: 10, deposit: 90_000,
      monthlyRent: 0, dealDate: '2026-07-10', buildYear: 2000, contractType: null,
      prevDeposit: null, prevMonthlyRent: null,
    };
    const db = { select: vi.fn(), execute: vi.fn() };
    db.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [APARTMENT] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [tx, { ...tx, umdNm: '대치동' }] }) }) });
    mocks.getBlogDb.mockReturnValue(db);

    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&months=2&rentType=jeonse'));
    expect(await response.json()).toMatchObject({ selectedAptId: 'apt-garam', total: 1, data: [{ dong: '일원동', masterId: 'apt-garam' }] });
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });

  it('DB 원장이 비었을 때 live 폴백에도 검증한 단지 식별자를 유지한다', async () => {
    mocks.txSource.mockReturnValue('db');
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    mocks.getBlogDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
    });
    mocks.fetchRentMonthAllPages.mockResolvedValueOnce(rentXml('가람', '일원동') + rentXml('가람', '대치동')).mockResolvedValueOnce('');
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&months=2'));
    expect(await response.json()).toMatchObject({ selectedAptId: 'apt-garam', total: 1, data: [{ dong: '일원동' }] });
  });

  it.each(['not-found', 'unavailable'])('DB 단지 기준정보 %s도 거래 없는 단지로 처리하지 않는다', async (kind) => {
    mocks.getBlogDb.mockImplementation(() => {
      if (kind === 'unavailable') throw new Error('DB offline');
      return { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) };
    });
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&aptName=가람&months=2'));
    expect(response.status).toBe(kind === 'not-found' ? 404 : 503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });

  it('ID 없는 이전 공유 링크도 이름·동을 제한 전에 적용한다', async () => {
    const busy = Array.from({ length: 101 }, (_, index) => rentXml(`가람${index}`, '대치동')).join('');
    mocks.fetchRentMonthAllPages.mockResolvedValueOnce(busy + rentXml('가람', '일원동')).mockResolvedValueOnce('');
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptName=가람&aptDong=일원동&months=2'));
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '가람', dong: '일원동' });
  });

  it.each(['aptId=apt-garam', 'aptName=가람', 'aptDong=일원동', ''])('live 단지 지정(%s)은 10건 이전의 공유 계약도 보존한다', async (scope) => {
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const contracts = Array.from({ length: 12 }, (_, index) => rentXml('가람', '일원동')
      .replace('<dealDay>1', `<dealDay>${index + 1}`)).join('');
    mocks.fetchRentMonthAllPages.mockResolvedValueOnce(contracts).mockResolvedValueOnce('');
    const response = await GET(new NextRequest(`http://localhost/api/transactions/rent?months=2&${scope}`));
    const body = await response.json();
    expect(body.total).toBe(12);
    expect(body.data[0].txCount).toBe(12);
    expect(body.data[0].transactions).toHaveLength(scope ? 12 : 10);
    if (scope) expect(body.data[0].transactions.at(-1).date).toBe('2026-07-01');
  });

  it('DB 단지 선택도 전체 계약을 반환하면서 다른 동은 제외한다', async () => {
    mocks.txSource.mockReturnValue('db');
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const rows = Array.from({ length: 12 }, (_, index) => ({
      aptName: '가람', umdNm: '일원동', areaM2: 84, floor: index + 1, deposit: 90_000,
      monthlyRent: 0, dealDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      buildYear: 2000, contractType: null, prevDeposit: null, prevMonthlyRent: null,
    }));
    mocks.getBlogDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [...rows, { ...rows[0], umdNm: '대치동' }] }) }) }),
    });
    const response = await GET(new NextRequest('http://localhost/api/transactions/rent?aptId=apt-garam&months=2'));
    const body = await response.json();
    expect(body).toMatchObject({ total: 12, selectedAptId: 'apt-garam' });
    expect(body.data[0].txCount).toBe(12);
    expect(body.data[0].transactions).toHaveLength(12);
    expect(body.data[0].transactions.at(-1).date).toBe('2026-07-01');
    expect(mocks.fetchRentMonthAllPages).not.toHaveBeenCalled();
  });
});

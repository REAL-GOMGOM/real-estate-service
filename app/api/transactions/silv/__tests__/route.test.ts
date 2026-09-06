import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchSilvMonthAllPages: vi.fn(),
  getDistrictSnapshot: vi.fn(),
  getNamedArtifact: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
  getBlogDb: vi.fn(),
}));

vi.mock('@/lib/molit-months', () => ({
  getMonthList: () => ['202607', '202606'],
  fetchSilvMonthAllPages: mocks.fetchSilvMonthAllPages,
  revalidateForMonth: () => 0,
}));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: () => ({
    getDistrictSnapshot: mocks.getDistrictSnapshot,
    getNamedArtifact: mocks.getNamedArtifact,
  }),
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));

import { GET } from '../route';

const XML = '<item><aptNm>분양단지</aptNm><excluUseAr>84</excluUseAr><dealAmount>100,000</dealAmount><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay><floor>10</floor><umdNm>삼성동</umdNm><jibun>1-1</jibun><cdealType></cdealType></item>';

const APARTMENT = {
  id: 'apt-presale', name: '삼성동분양아파트', aliases: ['분양단지'], dong: '삼성동',
  lawdCd: '11680', sigungu: '강남구', sido: '서울특별시', totalHouseholds: 200, score: null,
};

function apartmentIndex(data = [APARTMENT]) {
  return {
    status: 'success',
    data: { schema: 'naezip.apartment-index.v1', generatedAt: '2026-08-11T02:00:00.000Z', itemCount: data.length, data },
  };
}

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
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
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

  it('aptId를 스냅샷에 전달하고 잘못된 URL 이름·동·지역은 무시한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const record = snapshot().records[0] as Record<string, unknown>;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot([
      record,
      { ...record, id: '333333333333333333333333', dong: '대치동' },
    ]) });
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptId=apt-presale&aptName=다른단지&aptDong=대치동&district=송파구&months=2'));
    const body = await response.json();
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(body).toMatchObject({ selectedAptId: 'apt-presale', district: '강남구', total: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ masterId: 'apt-presale', name: '분양단지', dong: '삼성동' });
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('선택 분양권이 60위 밖이어도 live 별칭·동 매칭으로 찾는다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const threeTrades = XML + XML.replace('<floor>10', '<floor>11') + XML.replace('<floor>10', '<floor>12');
    const busy = Array.from({ length: 61 }, (_, index) => threeTrades.replaceAll('분양단지', `인기단지${index}`)).join('');
    mocks.fetchSilvMonthAllPages.mockResolvedValueOnce(busy + XML + XML.replace('<floor>10', '<floor>11') + threeTrades.replaceAll('삼성동', '대치동'))
      .mockResolvedValueOnce('');
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptId=apt-presale&months=2'));
    const body = await response.json();
    expect(body).toMatchObject({ selectedAptId: 'apt-presale', total: 2, status: 'ok' });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '분양단지', dong: '삼성동', txCount: 2 });
  });

  it.each(['missing', 'corrupt', 'unknown'])('분양권 ID 기준정보 %s는 0건이나 지역 목록으로 바꾸지 않는다', async (kind) => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    const index = apartmentIndex(kind === 'unknown' ? [] : [APARTMENT]);
    if (kind === 'corrupt') index.data.itemCount = 100;
    if (kind !== 'missing') mocks.getNamedArtifact.mockResolvedValue(index);
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptId=apt-presale&aptName=분양단지&months=2'));
    expect(response.status).toBe(kind === 'unknown' ? 404 : 503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.fetchSilvMonthAllPages).not.toHaveBeenCalled();
  });

  it('선택 단지의 검증된 0건 스냅샷은 live 폴백하지 않는다', async () => {
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot([]) });
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptId=apt-presale&months=2'));
    expect(await response.json()).toMatchObject({ selectedAptId: 'apt-presale', total: 0, data: [], status: 'ok' });
    expect(mocks.fetchSilvMonthAllPages).not.toHaveBeenCalled();
  });

  it('ID 없는 분양권 공유 링크도 이름·동을 제한 전에 적용한다', async () => {
    const busy = Array.from({ length: 101 }, (_, index) => XML.replace('분양단지', `분양단지${index}`).replace('삼성동', '대치동')).join('');
    mocks.fetchSilvMonthAllPages.mockResolvedValueOnce(busy + XML).mockResolvedValueOnce('');
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptName=분양단지&aptDong=삼성동&months=2'));
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '분양단지', dong: '삼성동' });
  });

  it('선택 단지 조회의 일부 월 실패는 partial 상태를 보존한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    mocks.fetchSilvMonthAllPages.mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('temporary failure'));
    const response = await GET(new NextRequest('http://localhost/api/transactions/silv?aptId=apt-presale&months=2'));
    expect(await response.json()).toMatchObject({ selectedAptId: 'apt-presale', total: 0, status: 'partial', failedMonths: ['202606'] });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['aptId=apt-presale', 'aptName=분양단지', 'aptDong=삼성동', ''])('live 분양권 단지 지정(%s)은 10건 이전 계약도 보존한다', async (scope) => {
    mocks.getNamedArtifact.mockResolvedValue(apartmentIndex());
    const contracts = Array.from({ length: 12 }, (_, index) => XML
      .replace('<dealDay>1', `<dealDay>${index + 1}`)).join('');
    mocks.fetchSilvMonthAllPages.mockResolvedValueOnce(contracts).mockResolvedValueOnce('');
    const response = await GET(new NextRequest(`http://localhost/api/transactions/silv?months=2&${scope}`));
    const body = await response.json();
    expect(body.total).toBe(12);
    expect(body.data[0].txCount).toBe(12);
    expect(body.data[0].transactions).toHaveLength(scope ? 12 : 10);
    if (scope) expect(body.data[0].transactions.at(-1).date).toBe('2026-07-01');
  });
});

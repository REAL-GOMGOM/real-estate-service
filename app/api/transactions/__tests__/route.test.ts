import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchTradeMonthAllPages: vi.fn(),
  getBlogDb: vi.fn(),
  txSource: vi.fn(),
  createRuntime: vi.fn(),
  getDistrictSnapshot: vi.fn(),
  getNamedArtifact: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
}));

vi.mock('@/lib/molit-months', () => ({
  getMonthList: () => ['202607'],
  fetchTradeMonthAllPages: mocks.fetchTradeMonthAllPages,
  revalidateForMonth: () => 0,
}));

vi.mock('@/lib/db/client', () => ({
  getBlogDb: mocks.getBlogDb,
}));

vi.mock('@/lib/tx-source', () => ({
  txSource: mocks.txSource,
}));

vi.mock('@/lib/public-snapshots/runtime', () => ({
  createPublicSnapshotRuntimeFromEnv: mocks.createRuntime,
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';

function item(fields: Record<string, string>): string {
  return `<item>${Object.entries(fields)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join('')}</item>`;
}

const BASE = {
  dealAmount: '100,000',
  excluUseAr: '84.00',
  dealYear: '2026',
  dealMonth: '7',
  dealDay: '1',
  floor: '10',
  buildYear: '2000',
  jibun: '1-1',
};

function currentMonthPeriod() {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return {
    from: `${prefix}-01`,
    through: today,
    dealDate: today,
  };
}

function saleSnapshot(options: {
  apartmentId?: string | null;
  period?: { from: string; through: string; dealDate: string };
} = {}) {
  const period = options.period ?? currentMonthPeriod();
  return {
    schema: 'naezip.public-transactions.v2' as const,
    generatedAt: new Date().toISOString(),
    partition: { lawdCd: '11680', district: '강남구' },
    period: { from: period.from, through: period.through },
    recordCount: 1,
    records: [{
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      apartmentId: options.apartmentId ?? null,
      aptName: '스냅샷단지',
      district: '강남구',
      dong: '역삼동',
      areaM2: 84,
      floor: 10,
      dealDate: period.dealDate,
      buildYear: 2020,
      kind: 'sale' as const,
      amountManwon: 200_000,
      canceled: false,
    }],
  };
}

function apartmentEnvelope(data: Array<{
  id: string;
  name: string;
  aliases: string[];
  sido: string;
  sigungu: string;
  dong: string | null;
  lawdCd: string;
  totalHouseholds: number | null;
  score: number | null;
}>) {
  return {
    schema: 'naezip.apartment-index.v1',
    generatedAt: new Date().toISOString(),
    itemCount: data.length,
    data,
  };
}

function queryResult(value: unknown) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (result: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(resolve, reject),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function database(...results: unknown[]) {
  const queue = [...results];
  const queries: ReturnType<typeof queryResult>[] = [];
  const nextQuery = () => {
    const query = queryResult(queue.shift() ?? []);
    queries.push(query);
    return query;
  };
  return { select: vi.fn(nextQuery), queries };
}

function compiledWhere(query: ReturnType<typeof queryResult>) {
  const condition = query.where.mock.calls[0]?.[0] as SQL | undefined;
  expect(condition).toBeDefined();
  return new PgDialect().sqlToQuery(condition!);
}

describe('GET /api/transactions live data truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSource.mockReturnValue('live');
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
    mocks.createRuntime.mockReturnValue({
      getDistrictSnapshot: mocks.getDistrictSnapshot,
      getNamedArtifact: mocks.getNamedArtifact,
    });
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
    process.env.PUBLIC_DATA_API_KEY = 'test-key';
    mocks.getBlogDb.mockImplementation(() => {
      throw new Error('master join unavailable');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.PUBLIC_DATA_API_KEY;
    vi.restoreAllMocks();
  });

  it('정상 원거래와 해제 item이 함께 온 거래는 전체 제외하고 동명 단지는 법정동별로 나눈다', async () => {
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '취소단지', umdNm: '삼성동', cdealType: '' }) +
      item({ ...BASE, aptNm: '취소단지', umdNm: '삼성동', cdealType: 'O' }) +
      item({ ...BASE, aptNm: '현대', umdNm: '압구정동', jibun: '2-1', cdealType: '' }) +
      item({ ...BASE, aptNm: '현대', umdNm: '대치동', jibun: '3-1', cdealType: '' }),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((group: { dong: string }) => group.dong).sort()).toEqual(['대치동', '압구정동']);
    expect(body.data.some((group: { name: string }) => group.name === '취소단지')).toBe(false);
  });

  it('aptId 조회는 마스터 부가정보 조인이 실패해도 이름과 법정동이 맞는 거래만 반환한다', async () => {
    const aptQuery = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    aptQuery.from.mockReturnValue(aptQuery);
    aptQuery.where.mockReturnValue(aptQuery);
    aptQuery.limit.mockResolvedValue([{
      id: 'apt-exact',
      name: '현대',
      aliases: ['현대아파트'],
      dong: '압구정동',
      sigungu: '강남구',
      lawdCd: '11680',
    }]);
    mocks.getBlogDb
      .mockReset()
      .mockReturnValueOnce({ select: vi.fn(() => aptQuery) })
      .mockImplementation(() => {
        throw new Error('master join unavailable');
      });
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '현대아파트', umdNm: '압구정동', jibun: '2-1', cdealType: '' }) +
      item({ ...BASE, aptNm: '현대', umdNm: '대치동', jibun: '3-1', cdealType: '' }),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptId=apt-exact&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedAptId).toBe('apt-exact');
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '현대아파트', dong: '압구정동', masterId: 'apt-exact' });
  });

  it('serving mode의 3개월 miss는 snapshot index identity를 유지하고 DB 없이 live 조회한다', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.txSource.mockReturnValue('db');
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: apartmentEnvelope([{
        id: 'apt-exact',
        name: '현대',
        aliases: ['현대아파트'],
        sido: '서울특별시',
        sigungu: '강남구',
        dong: '압구정동',
        lawdCd: '11680',
        totalHouseholds: 1000,
        score: null,
      }]),
    });
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'success',
      data: saleSnapshot({ apartmentId: 'apt-exact' }),
    });
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '현대아파트', umdNm: '압구정동', jibun: '2-1', cdealType: '' }) +
      item({ ...BASE, aptNm: '현대', umdNm: '대치동', jibun: '3-1', cdealType: '' }),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptId=apt-exact&months=3',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(body.selectedAptId).toBe('apt-exact');
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({ dong: '압구정동', masterId: 'apt-exact' });
    expect(mocks.fetchTradeMonthAllPages).toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.txSource).not.toHaveBeenCalled();
  });

  it('DB aptId 조회는 정확한 식별 조건을 SQL로 제한하고 선택 단지 조인만 수행한다', async () => {
    mocks.txSource.mockReturnValue('db');

    const selectedMaster = {
      id: 'apt-exact',
      name: '현대',
      aliases: ['현대아파트'],
      dong: '압구정동',
      sigungu: '강남구',
      lawdCd: '11680',
    };
    const dbRow = (
      aptName: string,
      dong: string,
      masterId: string | null,
      price: number,
    ) => ({
      aptName,
      dong,
      areaM2: 84,
      floor: 10,
      price,
      dealDate: '2026-07-01',
      buildYear: 2000,
      masterId,
    });

    const aptLookupDb = database([selectedMaster]);
    // 실제 DB는 아래 SQL WHERE로 앞의 두 행만 반환한다. 뒤의 두 행도 mock에
    // 섞어 JS fail-closed 재검증이 잘못된 결과를 다시 차단하는지 함께 확인한다.
    const transactionsDb = database([
      dbRow('현대', '압구정동', 'apt-exact', 100_000),
      dbRow('현대(101동)', '압구정동', null, 110_000),
      dbRow('현대', '대치동', null, 120_000),
      dbRow('현대', '압구정동', 'apt-other', 130_000),
    ]);
    const groupedJoinDb = database(
      [{ ...selectedMaster, totalHouseholds: 1234 }],
      [{ masterId: 'apt-exact', score: 1.5 }],
    );
    mocks.getBlogDb
      .mockReset()
      .mockReturnValueOnce(aptLookupDb)
      .mockReturnValueOnce(transactionsDb)
      .mockReturnValueOnce(groupedJoinDb);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptId=apt-exact&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedAptId).toBe('apt-exact');
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      name: '현대',
      dong: '압구정동',
      masterId: 'apt-exact',
      households: 1234,
      score: 1.5,
    });
    expect(body.data[0].transactions.map((row: { price: number }) => row.price))
      .toEqual([100_000, 110_000]);

    const txWhere = compiledWhere(transactionsDb.queries[0]);
    expect(txWhere.sql).toContain('"transactions"."lawd_cd"');
    expect(txWhere.sql).toContain('"transactions"."master_id"');
    expect(txWhere.sql).toContain('"transactions"."master_id" is null');
    expect(txWhere.sql).toContain('"transactions"."apt_name_norm"');
    expect(txWhere.sql).toContain('"transactions"."umd_nm"');
    expect(txWhere.sql).toContain(' or ');
    expect(txWhere.params).toEqual(expect.arrayContaining([
      '11680',
      '2026-07-01',
      false,
      'apt-exact',
      '현대',
      '현대아파트',
      '압구정동',
    ]));

    const masterWhere = compiledWhere(groupedJoinDb.queries[0]);
    expect(masterWhere.sql).toContain('"apartments"."id"');
    expect(masterWhere.sql).not.toContain('"apartments"."lawd_cd"');
    expect(masterWhere.params).toEqual(['apt-exact']);

    const scoreWhere = compiledWhere(groupedJoinDb.queries[1]);
    expect(scoreWhere.sql).toContain('"apt_scores"."master_id"');
    expect(scoreWhere.params).toEqual(['apt-exact']);
  });

  it('DB 지역 목록 조회는 기존처럼 지역·기간 조건과 지역 단위 마스터 조인을 유지한다', async () => {
    mocks.txSource.mockReturnValue('db');
    const transactionsDb = database([{
      aptName: '현대',
      dong: '압구정동',
      areaM2: 84,
      floor: 10,
      price: 100_000,
      dealDate: '2026-07-01',
      buildYear: 2000,
      masterId: null,
    }]);
    const groupedJoinDb = database(
      [{
        id: 'apt-exact',
        name: '현대',
        aliases: [],
        dong: '압구정동',
        totalHouseholds: 1234,
      }],
      [{ masterId: 'apt-exact', score: 1.5 }],
    );
    mocks.getBlogDb
      .mockReset()
      .mockReturnValueOnce(transactionsDb)
      .mockReturnValueOnce(groupedJoinDb);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({ masterId: 'apt-exact', households: 1234 });

    const txWhere = compiledWhere(transactionsDb.queries[0]);
    expect(txWhere.sql).toContain('"transactions"."lawd_cd"');
    expect(txWhere.sql).toContain('"transactions"."deal_date"');
    expect(txWhere.sql).not.toContain('"transactions"."master_id"');
    expect(txWhere.sql).not.toContain('"transactions"."apt_name_norm"');

    const masterWhere = compiledWhere(groupedJoinDb.queries[0]);
    expect(masterWhere.sql).toContain('"apartments"."lawd_cd"');
    expect(masterWhere.params).toEqual(['11680']);
  });

  it('지원하지 않는 district는 snapshot·DB·MOLIT 조회 전에 거부한다', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?district=%EC%97%86%EB%8A%94%EA%B5%AC&months=1',
    ));

    expect(response.status).toBe(400);
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.fetchTradeMonthAllPages).not.toHaveBeenCalled();
  });

  it('ID 없는 공유 링크는 q와 동으로 스냅샷을 선필터해 상위 100개 밖 거래도 반환한다', async () => {
    const snapshot = saleSnapshot();
    const target = { ...snapshot.records[0], id: '000000000000000000000001', aptName: '동명공유단지', dong: '일원동' };
    snapshot.records = [
      ...Array.from({ length: 105 }, (_, i) => ({
        ...target, id: (i + 2).toString(16).padStart(24, '0'), dong: `다른${i}동`,
      })),
      target,
    ];
    snapshot.recordCount = snapshot.records.length;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot });
    const params = new URLSearchParams({ district: '강남구', q: '동명공유단지', aptDong: '일원동', months: '1', limit: '1' });
    const response = await GET(new NextRequest(`http://localhost/api/transactions?${params}`));
    const body = await response.json();
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].dong).toBe('일원동');
    expect(body.total).toBe(1);
    expect(mocks.fetchTradeMonthAllPages).not.toHaveBeenCalled();
  });

  it('ID 없는 공유 링크의 live 폴백도 같은 이름의 다른 동을 섞지 않는다', async () => {
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '가람', umdNm: '일원동', cdealType: '' }) +
      item({ ...BASE, aptNm: '가람', umdNm: '대치동', jibun: '2-1', cdealType: '' }),
    );
    const params = new URLSearchParams({ district: '강남구', aptName: '가람', aptDong: '일원동', months: '1' });
    const response = await GET(new NextRequest(`http://localhost/api/transactions?${params}`));
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].dong).toBe('일원동');
    expect(body.total).toBe(1);
  });

  it('직접 district snapshot hit는 apartment index·API key·DB·MOLIT 없이 즉시 반환한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: saleSnapshot() });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(response.headers.get('x-naezip-snapshot-generated-at')).toBeTruthy();
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    expect(body).toMatchObject({ district: '강남구', months: 1, total: 1 });
    expect(body.data[0]).toMatchObject({ name: '스냅샷단지', dong: '역삼동' });
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680');
    expect(mocks.getNamedArtifact).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.fetchTradeMonthAllPages).not.toHaveBeenCalled();
    expect(mocks.txSource).not.toHaveBeenCalled();
  });

  it('aptId index hit는 정확한 id의 lawdCd snapshot만 조회한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    const indexedApartment = {
      id: 'apt-exact',
      name: '스냅샷단지',
      aliases: [],
      sido: '서울특별시',
      sigungu: '강남구',
      dong: '역삼동',
      lawdCd: '11680',
      totalHouseholds: 999,
      score: 2.5,
    };
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: apartmentEnvelope([indexedApartment]),
    });
    mocks.getDistrictSnapshot.mockResolvedValue({
      status: 'success',
      data: saleSnapshot({ apartmentId: 'apt-exact' }),
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptId=apt-exact&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(body).toMatchObject({ selectedAptId: 'apt-exact', total: 1 });
    expect(body.data[0]).toMatchObject({
      masterId: 'apt-exact',
      households: 999,
      score: 2.5,
    });
    expect(mocks.getNamedArtifact).toHaveBeenCalledWith('apartment-index');
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.fetchTradeMonthAllPages).not.toHaveBeenCalled();
  });

  it('aptName-only index hit는 같은 구의 동명 단지를 선택한 id·법정동으로 제한한다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    const selected = {
      id: 'apt-a',
      name: '동명단지',
      aliases: [],
      sido: '서울특별시',
      sigungu: '강남구',
      dong: '압구정동',
      lawdCd: '11680',
      totalHouseholds: 500,
      score: 1,
    };
    const sameNameOtherDong = {
      ...selected,
      id: 'apt-b',
      dong: '대치동',
      totalHouseholds: 700,
    };
    const snapshot = saleSnapshot({ apartmentId: selected.id });
    snapshot.records[0] = {
      ...snapshot.records[0],
      aptName: '동명단지',
      dong: '압구정동',
    };
    snapshot.records.push({
      ...snapshot.records[0],
      id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      apartmentId: sameNameOtherDong.id,
      dong: '대치동',
    });
    snapshot.recordCount = snapshot.records.length;
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: apartmentEnvelope([selected, sameNameOtherDong]),
    });
    mocks.getDistrictSnapshot.mockResolvedValue({ status: 'success', data: snapshot });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptName=%EB%8F%99%EB%AA%85%EB%8B%A8%EC%A7%80&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBe('snapshot');
    expect(body).toMatchObject({ selectedAptId: selected.id, total: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      name: '동명단지',
      dong: '압구정동',
      masterId: selected.id,
    });
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680');
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.fetchTradeMonthAllPages).not.toHaveBeenCalled();
  });

  it('aptId snapshot index miss는 404를 확정하지 않고 기존 DB/live 경로로 폴백한다', async () => {
    mocks.getNamedArtifact.mockResolvedValue({ status: 'success', data: apartmentEnvelope([]) });
    const aptQuery = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    aptQuery.from.mockReturnValue(aptQuery);
    aptQuery.where.mockReturnValue(aptQuery);
    aptQuery.limit.mockResolvedValue([{
      id: 'apt-exact',
      name: '현대',
      aliases: ['현대아파트'],
      dong: '압구정동',
      sigungu: '강남구',
      lawdCd: '11680',
    }]);
    mocks.getBlogDb
      .mockReset()
      .mockReturnValueOnce({ select: vi.fn(() => aptQuery) })
      .mockImplementation(() => { throw new Error('master join unavailable'); });
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '현대아파트', umdNm: '압구정동', cdealType: '' }),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?aptId=apt-exact&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedAptId).toBe('apt-exact');
    expect(body.total).toBe(1);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).toHaveBeenCalled();
    expect(mocks.fetchTradeMonthAllPages).toHaveBeenCalled();
  });

  it.each([
    ['unavailable', { status: 'unavailable', reason: 'network-error' }],
    ['invalid', { status: 'success', data: { ...saleSnapshot(), recordCount: 2 } }],
    ['stale', {
      status: 'success',
      data: { ...saleSnapshot(), generatedAt: '2020-01-31T00:00:00.000Z' },
    }],
    ['period-not-covered', {
      status: 'success',
      data: saleSnapshot({
        period: { from: '2020-01-01', through: '2020-01-31', dealDate: '2020-01-10' },
      }),
    }],
  ])('%s district snapshot은 기존 live 경로로 폴백한다', async (_label, snapshotResult) => {
    mocks.getDistrictSnapshot.mockResolvedValue(snapshotResult);
    mocks.fetchTradeMonthAllPages.mockResolvedValue(
      item({ ...BASE, aptNm: '폴백단지', umdNm: '역삼동', cdealType: '' }),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-source')).toBeNull();
    expect(body.total).toBe(1);
    expect(mocks.fetchTradeMonthAllPages).toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({
  getBlogDb: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
  createPublicSnapshotRuntimeFromEnv: vi.fn(),
  getManifest: vi.fn(),
  getNamedArtifact: vi.fn(),
  getDistrictSnapshot: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
  createPublicSnapshotRuntimeFromEnv: mocks.createPublicSnapshotRuntimeFromEnv,
}));

import {
  AptPageDataUnavailableError,
  getAptPageData,
} from '@/lib/apt-detail';
import {
  APARTMENT_INDEX_SCHEMA,
  type ApartmentIndexItem,
} from '@/lib/public-snapshots/serving-artifacts';
import {
  PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
  type PublicTransactionManifest,
  type PublicTransactionRecord,
  type PublicTransactionSnapshot,
} from '@/lib/public-snapshots/contract';

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
  return {
    select: vi.fn(nextQuery),
    selectDistinct: vi.fn(nextQuery),
    queries,
  };
}

function compiledWhere(query: ReturnType<typeof queryResult>) {
  const condition = query.where.mock.calls[0]?.[0] as SQL | undefined;
  expect(condition).toBeDefined();
  return new PgDialect().sqlToQuery(condition!);
}

const master = {
  id: 'apt-a',
  name: '현대',
  aliases: ['현대아파트'],
  sido: '서울특별시',
  sigungu: '강남구',
  dong: '압구정동',
  roadAddress: null,
  jibunAddress: null,
  lawdCd: '11680',
  kaptCode: null,
  totalHouseholds: 1000,
  totalDongs: 10,
  lat: null,
  lng: null,
  source: 'test',
  updatedAt: new Date('2026-08-09T00:00:00Z'),
};

const trade = (dong: string) => ({
  aptName: '현대', umdNm: dong, areaM2: 84, floor: 10, price: 200000,
  dealDate: '2026-08-01', buildYear: 2000, masterId: null,
});

const rent = (dong: string) => ({
  aptName: '현대', umdNm: dong, areaM2: 84, floor: 10, deposit: 100000,
  monthlyRent: 0, dealDate: '2026-08-01', buildYear: 2000,
  contractType: '신규', prevDeposit: null, prevMonthlyRent: null,
});

const SNAPSHOT_GENERATED_AT = '2026-08-15T12:33:27.041Z';
const SNAPSHOT_MANIFEST = { releaseId: 'fixture-release' } as PublicTransactionManifest;
const snapshotApartment: ApartmentIndexItem = {
  id: 'apt-snapshot',
  name: '현대',
  aliases: ['현대아파트'],
  sido: '서울특별시',
  sigungu: '강남구',
  dong: '압구정동',
  lawdCd: '11680',
  totalHouseholds: 1000,
  score: 1.5,
};
const otherDongApartment: ApartmentIndexItem = {
  ...snapshotApartment,
  id: 'apt-other-dong',
  aliases: [],
  dong: '대치동',
};

function apartmentIndexEnvelope(
  data: ApartmentIndexItem[] = [snapshotApartment, otherDongApartment],
  generatedAt = SNAPSHOT_GENERATED_AT,
) {
  return {
    schema: APARTMENT_INDEX_SCHEMA,
    generatedAt,
    itemCount: data.length,
    data,
  };
}

function saleRecord(input: Partial<PublicTransactionRecord> = {}): PublicTransactionRecord {
  return {
    id: '111111111111111111111111',
    apartmentId: snapshotApartment.id,
    aptName: '원장 현대',
    district: '강남구',
    dong: '압구정동',
    areaM2: 84.4,
    floor: 10,
    dealDate: '2026-08-14',
    buildYear: 2000,
    kind: 'sale',
    amountManwon: 200_000,
    canceled: false,
    ...input,
  } as PublicTransactionRecord;
}

function rentRecord(input: Partial<PublicTransactionRecord> = {}): PublicTransactionRecord {
  return {
    id: '222222222222222222222222',
    apartmentId: null,
    aptName: '현대아파트',
    district: '강남구',
    dong: '압구정동',
    areaM2: 84.2,
    floor: 8,
    dealDate: '2026-08-13',
    buildYear: 2000,
    kind: 'rent',
    depositManwon: 100_000,
    monthlyRentManwon: 0,
    contractType: 'new',
    previousDepositManwon: null,
    previousMonthlyRentManwon: null,
    ...input,
  } as PublicTransactionRecord;
}

function districtSnapshot(
  records: PublicTransactionRecord[] = [saleRecord(), rentRecord()],
  options: {
    generatedAt?: string;
    through?: string;
    lawdCd?: string;
    district?: string;
  } = {},
): PublicTransactionSnapshot {
  return {
    schema: PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
    generatedAt: options.generatedAt ?? SNAPSHOT_GENERATED_AT,
    partition: {
      lawdCd: options.lawdCd ?? '11680',
      district: options.district ?? '강남구',
    },
    period: { from: '2026-07-01', through: options.through ?? '2026-08-15' },
    recordCount: records.length,
    records,
  };
}

function enableSnapshotMode(options: {
  index?: ReturnType<typeof apartmentIndexEnvelope>;
  snapshot?: PublicTransactionSnapshot;
} = {}) {
  mocks.isPublicSnapshotConfigured.mockReturnValue(true);
  mocks.getNamedArtifact.mockResolvedValue({
    status: 'success',
    data: options.index ?? apartmentIndexEnvelope(),
  });
  mocks.getDistrictSnapshot.mockResolvedValue({
    status: 'success',
    data: options.snapshot ?? districtSnapshot(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-16T00:00:00.000Z'));
  mocks.getBlogDb.mockReset();
  mocks.isPublicSnapshotConfigured.mockReset();
  mocks.isPublicSnapshotConfigured.mockReturnValue(false);
  mocks.createPublicSnapshotRuntimeFromEnv.mockReset();
  mocks.getManifest.mockReset();
  mocks.getManifest.mockResolvedValue({ status: 'success', data: SNAPSHOT_MANIFEST });
  mocks.getNamedArtifact.mockReset();
  mocks.getDistrictSnapshot.mockReset();
  mocks.createPublicSnapshotRuntimeFromEnv.mockReturnValue({
    getManifest: mocks.getManifest,
    getNamedArtifact: mocks.getNamedArtifact,
    getDistrictSnapshot: mocks.getDistrictSnapshot,
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getAptPageData public snapshot serving', () => {
  it('v1 index와 같은 release의 fresh district raw로 정확한 2개월 데이터를 만들고 Neon을 호출하지 않는다', async () => {
    enableSnapshotMode({
      snapshot: districtSnapshot([
        saleRecord({ floor: 0 }),
        rentRecord({ floor: 0 }),
        rentRecord({
          id: '333333333333333333333333',
          dong: '대치동',
        }),
        saleRecord({
          id: '444444444444444444444444',
          apartmentId: otherDongApartment.id,
          dong: '대치동',
        }),
      ]),
    });

    const data = await getAptPageData(snapshotApartment.id);

    expect(data).toMatchObject({
      district: '강남구',
      salesMonths: 2,
      rentMonths: 2,
      transactionsStatus: 'ok',
      rentStatus: 'ok',
      allTimeHigh: null,
      allTimeHighStatus: 'unavailable',
      aptScore: null,
      master: {
        id: snapshotApartment.id,
        source: 'snapshot',
        roadAddress: null,
        jibunAddress: null,
        kaptCode: null,
        totalDongs: null,
        lat: null,
        lng: null,
      },
    });
    expect(data?.group.transactions).toEqual([
      expect.objectContaining({
        aptName: snapshotApartment.name,
        dong: '압구정동',
        area: 84,
        floor: 0,
        price: 200_000,
      }),
    ]);
    expect(data?.rentTransactions).toEqual([
      expect.objectContaining({
        aptName: '현대아파트',
        dong: '압구정동',
        floor: 0,
        deposit: 100_000,
        contractType: '신규',
      }),
    ]);
    expect(data?.recentJeonse).toHaveLength(1);
    expect(mocks.getNamedArtifact).toHaveBeenCalledWith('apartment-index', SNAPSHOT_MANIFEST);
    expect(mocks.getDistrictSnapshot).toHaveBeenCalledWith('11680', SNAPSHOT_MANIFEST);
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('fresh complete index에 id가 없으면 authoritative null이며 district와 DB를 읽지 않는다', async () => {
    enableSnapshotMode({ index: apartmentIndexEnvelope([otherDongApartment]) });

    await expect(getAptPageData('missing-snapshot-id')).resolves.toBeNull();

    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('manifest unavailable은 typed safe error이며 다른 artifact나 DB를 읽지 않는다', async () => {
    enableSnapshotMode();
    mocks.getManifest.mockResolvedValue({ status: 'unavailable', reason: 'network-error' });

    const error = await getAptPageData(snapshotApartment.id).catch((caught) => caught);

    expect(error).toBeInstanceOf(AptPageDataUnavailableError);
    expect(error).toMatchObject({ reason: 'snapshot-manifest-unavailable' });
    expect(mocks.getNamedArtifact).not.toHaveBeenCalled();
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('masterId 없는 거래가 같은 이름·법정동의 복수 단지에 걸리면 어느 단지에도 섞지 않는다', async () => {
    const ambiguousApartment: ApartmentIndexItem = {
      ...snapshotApartment,
      id: 'apt-same-name-dong',
      aliases: ['현대아파트'],
    };
    enableSnapshotMode({
      index: apartmentIndexEnvelope([
        snapshotApartment,
        ambiguousApartment,
        otherDongApartment,
      ]),
      snapshot: districtSnapshot([
        saleRecord(),
        rentRecord(),
      ]),
    });

    const data = await getAptPageData(snapshotApartment.id);

    expect(data?.group.transactions).toHaveLength(1);
    expect(data?.rentTransactions).toEqual([]);
    expect(data?.recentJeonse).toEqual([]);
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it.each([
    ['sale', saleRecord({ floor: null })],
    ['rent', rentRecord({ floor: null })],
  ] as const)('%s 층 정보가 없으면 1층으로 위조하지 않고 typed error로 닫는다', async (_kind, record) => {
    enableSnapshotMode({ snapshot: districtSnapshot([record]) });

    const error = await getAptPageData(snapshotApartment.id).catch((caught) => caught);

    expect(error).toBeInstanceOf(AptPageDataUnavailableError);
    expect(error).toMatchObject({ reason: 'apartment-transaction-incomplete' });
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'index unavailable',
      reason: 'apartment-index-unavailable',
      setup: () => mocks.getNamedArtifact.mockResolvedValue({
        status: 'unavailable', reason: 'network-error',
      }),
    },
    {
      label: 'index invalid',
      reason: 'apartment-index-invalid',
      setup: () => mocks.getNamedArtifact.mockResolvedValue({
        status: 'success',
        data: { ...apartmentIndexEnvelope(), itemCount: 999 },
      }),
    },
    {
      label: 'index stale',
      reason: 'apartment-index-stale',
      setup: () => mocks.getNamedArtifact.mockResolvedValue({
        status: 'success',
        data: apartmentIndexEnvelope([snapshotApartment], '2026-08-08T12:00:00.000Z'),
      }),
    },
  ])('$label은 typed safe error이며 DB로 폴백하지 않는다', async ({ reason, setup }) => {
    enableSnapshotMode();
    setup();

    const error = await getAptPageData(snapshotApartment.id).catch((caught) => caught);

    expect(error).toBeInstanceOf(AptPageDataUnavailableError);
    expect(error).toMatchObject({
      message: 'Verified apartment snapshot data is unavailable',
      reason,
    });
    expect(mocks.getDistrictSnapshot).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'district unavailable',
      reason: 'district-snapshot-unavailable',
      configure: () => mocks.getDistrictSnapshot.mockResolvedValue({
        status: 'unavailable', reason: 'network-error',
      }),
    },
    {
      label: 'district invalid',
      reason: 'district-snapshot-invalid',
      configure: () => mocks.getDistrictSnapshot.mockResolvedValue({
        status: 'success', data: districtSnapshot([], { lawdCd: '11710' }),
      }),
    },
    {
      label: 'district stale',
      reason: 'district-snapshot-stale',
      configure: () => {
        const generatedAt = '2026-08-13T12:00:00.000Z';
        mocks.getNamedArtifact.mockResolvedValue({
          status: 'success', data: apartmentIndexEnvelope(undefined, generatedAt),
        });
        mocks.getDistrictSnapshot.mockResolvedValue({
          status: 'success',
          data: districtSnapshot([], { generatedAt, through: '2026-08-13' }),
        });
      },
    },
    {
      label: 'release mismatch',
      reason: 'snapshot-release-mismatch',
      configure: () => mocks.getDistrictSnapshot.mockResolvedValue({
        status: 'success',
        data: districtSnapshot([], { generatedAt: '2026-08-15T11:33:27.041Z' }),
      }),
    },
  ])('$label은 typed safe error이며 DB로 폴백하지 않는다', async ({ reason, configure }) => {
    enableSnapshotMode();
    configure();

    const error = await getAptPageData(snapshotApartment.id).catch((caught) => caught);

    expect(error).toBeInstanceOf(AptPageDataUnavailableError);
    expect(error).toMatchObject({ reason });
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });
});

describe('getAptPageData data truth', () => {
  it('정상 0건과 매매 원장 장애를 상태로 구분한다', async () => {
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database([], []))
      .mockReturnValueOnce(database([]));
    const empty = await getAptPageData(master.id);
    expect(empty).toMatchObject({
      transactionsStatus: 'ok',
      rentStatus: 'ok',
    });
    expect(empty?.group.transactions).toEqual([]);

    mocks.getBlogDb.mockReset();
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database(new Error('trade unavailable'), []))
      .mockReturnValueOnce(database([]));
    const failed = await getAptPageData(master.id);
    expect(failed).toMatchObject({ transactionsStatus: 'error', rentStatus: 'ok' });
    expect(failed?.group.transactions).toEqual([]);
  });

  it('전월세 원장 장애도 정상 0건과 별도 상태로 반환한다', async () => {
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database([], new Error('rent unavailable')))
      .mockReturnValueOnce(database([]));

    const failed = await getAptPageData(master.id);

    expect(failed).toMatchObject({ transactionsStatus: 'ok', rentStatus: 'error' });
    expect(failed?.rentTransactions).toEqual([]);
  });

  it('매매·전월세 모두 이름뿐 아니라 법정동까지 맞는 거래만 포함한다', async () => {
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database(
        [trade('압구정동'), trade('대치동')],
        [{ aptName: '현대' }],
        [rent('압구정동'), rent('대치동')],
      ))
      .mockReturnValueOnce(database([]))
      .mockReturnValueOnce(database([]));

    const data = await getAptPageData(master.id);

    expect(data?.group.transactions).toHaveLength(1);
    expect(data?.group.transactions[0].dong).toBe('압구정동');
    expect(data?.rentTransactions).toHaveLength(1);
    expect(data?.rentTransactions[0].dong).toBe('압구정동');
  });

  it('구 전체 행 대신 SQL에서 단지 식별자를 제한하고 JS에서도 재검증한다', async () => {
    const dataDb = database(
      [
        trade('압구정동'),
        trade('대치동'),
        { ...trade('압구정동'), masterId: 'apt-other' },
      ],
      [{ aptName: '현대(101동)' }, { aptName: '타워팰리스' }],
      [
        { ...rent('압구정동'), aptName: '현대(101동)' },
        { ...rent('압구정동'), aptName: '타워팰리스' },
      ],
    );
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(dataDb)
      .mockReturnValueOnce(database([]))
      .mockReturnValueOnce(database([]));

    const data = await getAptPageData(master.id);

    expect(data?.group.transactions).toHaveLength(1);
    expect(data?.rentTransactions.map((row) => row.aptName)).toEqual(['현대(101동)']);

    const tradeWhere = compiledWhere(dataDb.queries[0]);
    expect(tradeWhere.sql).toContain('"transactions"."lawd_cd"');
    expect(tradeWhere.sql).toContain('"transactions"."master_id"');
    expect(tradeWhere.sql).toContain('"transactions"."apt_name_norm"');
    expect(tradeWhere.sql).toContain('"transactions"."umd_nm"');
    expect(tradeWhere.params).toEqual(expect.arrayContaining([
      master.lawdCd, master.id, master.name, master.dong,
    ]));

    const rentNamesWhere = compiledWhere(dataDb.queries[1]);
    expect(rentNamesWhere.sql).toContain('"rent_transactions"."lawd_cd"');
    expect(rentNamesWhere.sql).toContain('"rent_transactions"."umd_nm"');
    expect(rentNamesWhere.params).toEqual(expect.arrayContaining([master.lawdCd, master.dong]));

    const rentBodyWhere = compiledWhere(dataDb.queries[2]);
    expect(rentBodyWhere.sql).toContain('"rent_transactions"."apt_name"');
    expect(rentBodyWhere.params).toContain('현대(101동)');
    expect(rentBodyWhere.params).not.toContain('타워팰리스');
  });

  it('법정동 없는 apt_highs가 동명 마스터 여러 개에 걸리면 역대 전고점을 숨긴다', async () => {
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database([trade('압구정동')], []))
      .mockReturnValueOnce(database([{ aptName: '현대', price: 300000, dealDate: '2025-01-01' }]))
      .mockReturnValueOnce(database([
        { id: 'apt-a', name: '현대', aliases: [], dong: '압구정동' },
        { id: 'apt-b', name: '현대', aliases: [], dong: '대치동' },
      ]))
      .mockReturnValueOnce(database([]));

    const data = await getAptPageData(master.id);

    expect(data?.allTimeHigh).toBeNull();
    expect(data?.allTimeHighStatus).toBe('ambiguous');
  });

  it('법정동 없는 apt_highs도 이름 후보가 유일할 때만 역대 전고점으로 사용한다', async () => {
    mocks.getBlogDb
      .mockReturnValueOnce(database([master]))
      .mockReturnValueOnce(database([trade('압구정동')], []))
      .mockReturnValueOnce(database([{ aptName: '현대', price: 300000, dealDate: '2025-01-01' }]))
      .mockReturnValueOnce(database([
        { id: 'apt-a', name: '현대', aliases: [], dong: '압구정동' },
      ]))
      .mockReturnValueOnce(database([]));

    const data = await getAptPageData(master.id);

    expect(data?.allTimeHigh).toEqual({ price: 300000, dealDate: '2025-01-01' });
    expect(data?.allTimeHighStatus).toBe('ok');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({ getBlogDb: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));

import { getAptPageData } from '@/lib/apt-detail';

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

beforeEach(() => {
  mocks.getBlogDb.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
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

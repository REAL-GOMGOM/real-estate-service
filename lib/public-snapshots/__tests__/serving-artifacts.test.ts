import { describe, expect, it } from 'vitest';

import {
  APARTMENT_INDEX_SCHEMA,
  ROLLING30_SUMMARY_ARTIFACT_NAMES,
  TRANSACTION_SUMMARY_SCHEMA,
  ServingArtifactValidationError,
  assertApartmentIndexEnvelope,
  assertRolling30SummaryEnvelope,
  buildApartmentIndexArtifact,
  buildBuyResponseFromSnapshot,
  buildPresaleResponseFromSnapshot,
  buildRentResponseFromSnapshot,
  buildRolling30SummaryArtifacts,
  findApartmentIndexById,
  searchApartmentIndex,
  type ApartmentIndexItem,
} from '../serving-artifacts';
import {
  createPublicTransactionSnapshot,
  toPublicPresaleTransaction,
  toPublicRentTransaction,
  toPublicSaleTransaction,
} from '../source-mappers';

const NOW = new Date('2026-08-11T03:00:00.000Z');
const GENERATED_AT = NOW.toISOString();

const apartmentIndex: ApartmentIndexItem[] = [{
  id: 'apt-1',
  name: '테스트 아파트',
  aliases: ['테스트'],
  sido: '서울특별시',
  sigungu: '강남구',
  dong: '역삼동',
  lawdCd: '11680',
  totalHouseholds: 1234,
  score: 1.8,
}];

function fixtureSnapshot() {
  return createPublicTransactionSnapshot({
    lawdCd: '11680',
    district: '강남구',
    period: { from: '2026-07-01', through: '2026-08-11' },
    generatedAt: GENERATED_AT,
    records: [
      toPublicSaleTransaction({
        dedupeKey: 'sale-month-only',
        masterId: null,
        aptName: '테스트 아파트',
        sigungu: '강남구',
        umdNm: '역삼동',
        areaM2: 59.4,
        floor: 3,
        dealAmount: 150_000,
        dealDate: '2026-08',
        buildYear: 2020,
        isCanceled: false,
      }),
      toPublicSaleTransaction({
        dedupeKey: 'sale-exact',
        masterId: 'apt-1',
        aptName: '테스트 아파트',
        sigungu: '강남구',
        umdNm: '역삼동',
        areaM2: 84.7,
        floor: 8,
        dealAmount: 210_000,
        dealDate: '2026-08-10',
        buildYear: 2020,
        isCanceled: false,
      }),
      toPublicRentTransaction({
        dedupeKey: 'rent-1',
        masterId: null,
        aptName: '테스트 아파트',
        sigungu: '강남구',
        umdNm: '역삼동',
        areaM2: 84.7,
        floor: 7,
        dealDate: '2026-08-09',
        deposit: 80_000,
        monthlyRent: 0,
        buildYear: 2020,
        contractType: '갱신',
        prevDeposit: 75_000,
        prevMonthlyRent: null,
      }),
      toPublicPresaleTransaction({
        dedupeKey: 'presale-1',
        masterId: null,
        aptName: '테스트 아파트',
        sigungu: '강남구',
        umdNm: '역삼동',
        areaM2: 84.7,
        floor: 9,
        dealAmount: 190_000,
        dealDate: '2026-08-08',
        buildYear: null,
        isCanceled: false,
      }),
    ],
  });
}

describe('serving named artifacts', () => {
  it('builds four rolling30 artifacts with the current summary API body', () => {
    const artifacts = buildRolling30SummaryArtifacts({
      generatedAt: GENERATED_AT,
      from: '2026-07-13',
      to: '2026-08-12',
      buy: [{
        sigungu: '강남구', cnt: 2, newHighs: 1,
        sum59: 300_000, cnt59: 2, sum84: 210_000, cnt84: 1,
      }],
      jeonse: [{
        sigungu: '강남구', cnt: 1,
        sumDep59: 0, cnt59: 0, sumDep84: 80_000, cnt84: 1,
        sumRent59: 0, sumRent84: 0,
      }],
      monthly: [{
        sigungu: '강남구', cnt: 1,
        sumDep59: 20_000, cnt59: 1, sumDep84: 0, cnt84: 0,
        sumRent59: 120, sumRent84: 0,
      }],
      bunyang: [],
    });

    expect(artifacts.map((artifact) => artifact.name)).toEqual([
      ROLLING30_SUMMARY_ARTIFACT_NAMES.buy,
      ROLLING30_SUMMARY_ARTIFACT_NAMES.jeonse,
      ROLLING30_SUMMARY_ARTIFACT_NAMES.monthly,
      ROLLING30_SUMMARY_ARTIFACT_NAMES.bunyang,
    ]);
    const buy = artifacts[0].data;
    expect(buy).toMatchObject({
      status: 'ok', daily: null, month: '202608',
      window: { type: 'rolling30', from: '2026-07-13', to: '2026-08-12' },
      updatedAt: GENERATED_AT,
    });
    expect(buy.summary[0]).toMatchObject({
      label: '서울', estimatedCount: 2, sampleCount: 2, newHighs: 1,
      avg59: 150_000, avg84: 210_000,
    });
    expect(artifacts[2].data.summary[0]).toMatchObject({ avgRent59: 120, avgRent84: null });
    expect(artifacts[3].data.summary.every((row) => row.estimatedCount === 0)).toBe(true);

    const envelope = {
      schema: TRANSACTION_SUMMARY_SCHEMA,
      generatedAt: GENERATED_AT,
      itemCount: buy.summary.length,
      data: buy,
    };
    expect(() => assertRolling30SummaryEnvelope(envelope)).not.toThrow();
    expect(() => assertRolling30SummaryEnvelope({ ...envelope, extra: true }))
      .toThrow(ServingArtifactValidationError);
  });

  it('builds, validates, finds, and alias-searches the strict apartment index', () => {
    const artifact = buildApartmentIndexArtifact([
      { ...apartmentIndex[0], aliases: ['테스트', '테스트', '테스트 아파트'] },
    ]);
    expect(artifact.data[0].aliases).toEqual(['테스트']);
    expect(findApartmentIndexById(artifact.data, 'apt-1')?.name).toBe('테스트 아파트');
    expect(searchApartmentIndex(artifact.data, '테스트', { limit: 10 })).toHaveLength(1);
    const envelope = {
      schema: APARTMENT_INDEX_SCHEMA,
      generatedAt: GENERATED_AT,
      itemCount: 1,
      data: artifact.data,
    };
    expect(() => assertApartmentIndexEnvelope(envelope)).not.toThrow();
    expect(() => assertApartmentIndexEnvelope({ ...envelope, itemCount: 2 }))
      .toThrow('itemCount does not match');
  });

  it('deduplicates equivalent apartment suffixes after ranking and still fills the limit', () => {
    const base = apartmentIndex[0];
    const index: ApartmentIndexItem[] = [
      { ...base, id: 'mltm-11710-잠실엘스', name: '잠실엘스', aliases: [], dong: '잠실동', lawdCd: '11710', sigungu: '송파구' },
      { ...base, id: 'A13822004', name: '잠실엘스아파트', aliases: [], dong: '잠실동', lawdCd: '11710', sigungu: '송파구' },
      { ...base, id: 'apt-ricenz', name: '잠실리센츠', aliases: [], dong: '잠실동', lawdCd: '11710', sigungu: '송파구' },
    ];

    expect(searchApartmentIndex(index, '잠실엘스', { limit: 10 }).map((item) => item.name))
      .toEqual(['잠실엘스']);
    expect(searchApartmentIndex(index, '잠실엘스아파트', { limit: 10 }).map((item) => item.name))
      .toEqual(['잠실엘스아파트']);
    expect(searchApartmentIndex(index, '잠실', { limit: 2 }).map((item) => item.name))
      .toEqual(['잠실엘스', '잠실리센츠']);
  });
});

describe('raw district snapshot response builders', () => {
  it('preserves YYYY-MM, serves newest transactions first, and enriches buy groups', () => {
    const result = buildBuyResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      apartmentIndex,
      now: NOW,
    });
    expect(result.hit).toBe(true);
    if (!result.hit) return;
    expect(result.body.total).toBe(2);
    expect(result.body.data[0]).toMatchObject({
      masterId: 'apt-1', households: 1234, score: 1.8,
      areas: [85, 59],
    });
    expect(result.body.data[0].transactions.map((tx) => tx.date)).toEqual(['2026-08-10', '2026-08']);
  });

  it('resolves aptId through the index and conservatively requires that index', () => {
    expect(buildBuyResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      aptId: 'apt-1',
      now: NOW,
    })).toEqual({ hit: false, reason: 'apartment-index-required' });

    const selected = buildBuyResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      aptId: 'apt-1',
      apartmentIndex,
      now: NOW,
    });
    expect(selected).toMatchObject({
      hit: true,
      body: { selectedAptId: 'apt-1', total: 2 },
    });
  });

  it('connects K-apt names to MOLIT variants without merging neighboring complexes', () => {
    const now = new Date('2026-08-27T03:00:00.000Z');
    const index: ApartmentIndexItem[] = [
      {
        ...apartmentIndex[0],
        id: 'A42084801',
        name: '중동은하마을주공2차',
        aliases: [],
        dong: '중동',
        lawdCd: '41192',
        sigungu: '부천원미구',
      },
      {
        ...apartmentIndex[0],
        id: 'A42084804',
        name: '중동은하마을주공1단지',
        aliases: [],
        dong: '중동',
        lawdCd: '41192',
        sigungu: '부천원미구',
      },
    ];
    const snapshot = createPublicTransactionSnapshot({
      lawdCd: '41192',
      district: '부천시 원미구',
      period: { from: '2026-07-01', through: '2026-08-27' },
      generatedAt: now.toISOString(),
      records: [
        { key: 'eunha-1-high', aptName: '은하마을(주공1)', amount: 67_000, area: 49.69, floor: 8, date: '2026-08-12' },
        { key: 'eunha-1-small', aptName: '은하마을(주공1)', amount: 42_200, area: 39.87, floor: 12, date: '2026-08-12' },
        { key: 'eunha-2', aptName: '은하마을(주공2)', amount: 61_500, area: 47.4, floor: 8, date: '2026-07-31' },
        { key: 'eunha-daewoo', aptName: '은하마을(대우)', amount: 105_700, area: 101.8, floor: 14, date: '2026-08-18' },
      ].map((row) => toPublicSaleTransaction({
        dedupeKey: row.key,
        masterId: null,
        aptName: row.aptName,
        sigungu: '부천시 원미구',
        umdNm: '중동',
        areaM2: row.area,
        floor: row.floor,
        dealAmount: row.amount,
        dealDate: row.date,
        buildYear: 1995,
        isCanceled: false,
      })),
    });

    const selected = buildBuyResponseFromSnapshot(snapshot, {
      months: 2,
      limit: 60,
      aptId: 'A42084804',
      apartmentIndex: index,
      now,
    });
    expect(selected).toMatchObject({
      hit: true,
      body: {
        selectedAptId: 'A42084804',
        total: 2,
        data: [{ masterId: 'A42084804' }],
      },
    });
    if (selected.hit) {
      expect(selected.body.data[0].transactions).toEqual(expect.arrayContaining([
        expect.objectContaining({ aptName: '은하마을(주공1)', price: 67_000, floor: 8 }),
      ]));
    }

    const district = buildBuyResponseFromSnapshot(snapshot, {
      months: 2,
      limit: 60,
      apartmentIndex: index,
      now,
    });
    expect(district.hit).toBe(true);
    if (district.hit) {
      expect(district.body.total).toBe(4);
      expect(district.body.data.map((group) => group.name).sort()).toEqual([
        '은하마을(대우)',
        '은하마을(주공1)',
        '은하마을(주공2)',
      ]);
      expect(district.body.data.find((group) => group.name === '은하마을(주공1)')?.transactions)
        .toHaveLength(2);
    }
  });

  it('builds current rent and presale bodies from the same raw partition', () => {
    const rent = buildRentResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      rentType: 'jeonse',
      now: NOW,
    });
    expect(rent).toMatchObject({
      hit: true,
      body: { status: 'ok', rentType: 'jeonse', total: 1 },
    });
    if (rent.hit) {
      expect(rent.body.data[0]).toMatchObject({ txCount: 1, maxDeposit: 80_000 });
      expect(rent.body.data[0].transactions[0].contractType).toBe('갱신');
    }

    const presale = buildPresaleResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      now: NOW,
    });
    expect(presale).toMatchObject({ hit: true, body: { status: 'ok', total: 1 } });
  });

  it.each(['jeonse', 'monthly', 'presale'] as const)('selects %s beyond the district top60 before limiting groups', (kind) => {
    const selectedIndex: ApartmentIndexItem[] = [{
      ...apartmentIndex[0], name: '일원동가람아파트', aliases: ['가람'], dong: '일원동',
    }];
    const makeRecord = (id: string, aptName: string, dong: string, floor: number) => {
      const common = {
        dedupeKey: id, masterId: null, aptName, umdNm: dong, sigungu: '강남구',
        areaM2: 84, floor, dealDate: '2026-08-10', buildYear: 2000,
      };
      return kind === 'presale'
        ? toPublicPresaleTransaction({ ...common, dealAmount: 90_000, isCanceled: false })
        : toPublicRentTransaction({ ...common, deposit: 90_000, monthlyRent: kind === 'monthly' ? 120 : 0, contractType: null, prevDeposit: null, prevMonthlyRent: null });
    };
    const records = Array.from({ length: 61 }, (_, index) =>
      Array.from({ length: 3 }, (_, floor) => makeRecord(`busy-${index}-${floor}`, `인기단지${index}`, '대치동', floor + 1)))
      .flat();
    records.push(
      makeRecord('selected-1', '가람', '일원동', 7),
      makeRecord('selected-2', '가람', '일원동', 8),
      makeRecord('same-name-other-dong', '가람', '대치동', 9),
    );
    const snapshot = createPublicTransactionSnapshot({
      lawdCd: '11680', district: '강남구', generatedAt: GENERATED_AT,
      period: { from: '2026-07-01', through: '2026-08-11' }, records,
    });
    const query = { months: 2, limit: 60, now: NOW, ...(kind === 'presale' ? {} : { rentType: kind }) };
    const district = kind === 'presale'
      ? buildPresaleResponseFromSnapshot(snapshot, query)
      : buildRentResponseFromSnapshot(snapshot, query);
    expect(district.hit && district.body.data.some((group) => group.name === '가람')).toBe(false);

    const exactQuery = {
      ...query, aptId: 'apt-1', apartmentIndex: selectedIndex,
      aptName: '인기단지', aptDong: '대치동',
    };
    const exact = kind === 'presale'
      ? buildPresaleResponseFromSnapshot(snapshot, exactQuery)
      : buildRentResponseFromSnapshot(snapshot, exactQuery);
    expect(exact).toMatchObject({
      hit: true, body: {
        selectedAptId: 'apt-1', total: 2, status: 'ok',
        data: [{ name: '가람', dong: '일원동', masterId: 'apt-1', txCount: 2 }],
      },
    });
    if (exact.hit) expect(exact.body.data).toHaveLength(1);
  });

  it.each([buildBuyResponseFromSnapshot, buildRentResponseFromSnapshot, buildPresaleResponseFromSnapshot])('filters legacy name/dong snapshots before the group limit', (build) => {
    const fixture = fixtureSnapshot();
    const repeated = Array.from({ length: 101 }, (_, index) => fixture.records.map((record) => ({
      ...record, id: index.toString(16).padStart(22, '0') + record.id.slice(-2),
      apartmentId: null, aptName: `테스트 ${index}`, dong: '대치동',
    }))).flat();
    const snapshot = { ...fixture, records: [...repeated, ...fixture.records], recordCount: repeated.length + fixture.records.length };
    const result = build(snapshot, { months: 2, limit: 60, aptName: '테스트', aptDong: '역삼동', now: NOW });
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.body.data).toHaveLength(1);
      expect(result.body.data[0]).toMatchObject({ name: '테스트 아파트', dong: '역삼동' });
    }
  });

  it.each([buildRentResponseFromSnapshot, buildPresaleResponseFromSnapshot])('requires a known in-partition apartment ID and preserves selected zero', (build) => {
    const query = { months: 2, limit: 60, aptId: 'apt-1', now: NOW };
    expect(build(fixtureSnapshot(), query)).toEqual({ hit: false, reason: 'apartment-index-required' });
    expect(build(fixtureSnapshot(), { ...query, apartmentIndex: [] })).toEqual({ hit: false, reason: 'apartment-not-found' });
    expect(build(fixtureSnapshot(), { ...query, apartmentIndex: [{ ...apartmentIndex[0], lawdCd: '11710' }] }))
      .toEqual({ hit: false, reason: 'apartment-not-found' });
    const snapshot = fixtureSnapshot();
    expect(build({ ...snapshot, records: [], recordCount: 0 }, { ...query, apartmentIndex }))
      .toMatchObject({ hit: true, body: { total: 0, data: [], selectedAptId: 'apt-1', status: 'ok' } });
  });

  it.each([buildRentResponseFromSnapshot, buildPresaleResponseFromSnapshot])('keeps all scoped contracts but only the latest ten for ordinary district lists', (build) => {
    const fixture = fixtureSnapshot();
    const records = Array.from({ length: 12 }, (_, index) => fixture.records
      .filter((record) => record.kind !== 'sale')
      .map((record) => ({
        ...record,
        id: index.toString(16).padStart(22, '0') + record.id.slice(-2),
        dealDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      }))).flat();
    const snapshot = { ...fixture, records, recordCount: records.length };
    for (const scope of [{}, { aptId: 'apt-1' }, { aptName: '테스트' }, { aptDong: '역삼동' }]) {
      const result = build(snapshot, { months: 2, limit: 60, now: NOW, apartmentIndex, ...scope });
      expect(result.hit).toBe(true);
      if (!result.hit) continue;
      expect(result.body.total).toBe(12);
      expect(result.body.data[0].txCount).toBe(12);
      const isScoped = Object.keys(scope).length > 0;
      expect(result.body.data[0].transactions).toHaveLength(isScoped ? 12 : 10);
      if (isScoped) expect(result.body.data[0].transactions.at(-1)?.date).toBe('2026-07-01');
    }
  });

  it('treats a valid zero-row snapshot as a hit for every transaction type', () => {
    const empty = createPublicTransactionSnapshot({
      lawdCd: '11680',
      district: '강남구',
      period: { from: '2026-07-01', through: '2026-08-11' },
      generatedAt: GENERATED_AT,
      records: [],
    });
    const query = { months: 2, limit: 60, now: NOW };
    expect(buildBuyResponseFromSnapshot(empty, query)).toEqual({
      hit: true,
      body: { data: [], district: '강남구', months: 2, total: 0 },
    });
    expect(buildRentResponseFromSnapshot(empty, query)).toMatchObject({
      hit: true, body: { data: [], total: 0, status: 'ok' },
    });
    expect(buildPresaleResponseFromSnapshot(empty, query)).toMatchObject({
      hit: true, body: { data: [], total: 0, status: 'ok' },
    });
  });

  it('keeps a name-and-dong match ambiguous after three apartment candidates', () => {
    const ambiguousIndex: ApartmentIndexItem[] = ['a', 'b', 'c'].map((id) => ({
      ...apartmentIndex[0], id, aliases: [], totalHouseholds: 100 + id.charCodeAt(0),
    }));
    const result = buildBuyResponseFromSnapshot(fixtureSnapshot(), {
      months: 2,
      limit: 60,
      apartmentIndex: ambiguousIndex,
      now: NOW,
    });
    expect(result.hit).toBe(true);
    if (!result.hit) return;
    // One source row has an unknown master id; ambiguity must not attach candidate c.
    const unknownMaster = result.body.data[0].transactions.find((tx) => tx.date === '2026-08');
    expect(unknownMaster?.masterId).toBeNull();
  });

  it.each([3, 6])('returns a miss when a %i-month request exceeds proven 2-month coverage', (months) => {
    const result = buildBuyResponseFromSnapshot(fixtureSnapshot(), {
      months,
      limit: 60,
      now: NOW,
    });
    expect(result).toEqual({ hit: false, reason: 'period-not-covered' });
  });

  it('does not serve an old or internally inconsistent snapshot as authoritative', () => {
    const stale = { ...fixtureSnapshot(), generatedAt: '2026-08-08T02:59:59.999Z' };
    expect(buildBuyResponseFromSnapshot(stale, {
      months: 1,
      limit: 60,
      now: NOW,
    })).toEqual({ hit: false, reason: 'snapshot-stale' });

    const mismatchedCoverage = {
      ...fixtureSnapshot(),
      period: { from: '2026-07-01', through: '2026-08-31' },
    };
    expect(buildRentResponseFromSnapshot(mismatchedCoverage, {
      months: 1,
      limit: 60,
      now: NOW,
    })).toEqual({ hit: false, reason: 'snapshot-stale' });
  });
});

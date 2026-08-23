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

import { describe, expect, it } from 'vitest';

import {
  PublicSnapshotValidationError,
  assertPublicTransactionSnapshot,
  countPublicTransactions,
} from '../contract';
import {
  createPublicTransactionSnapshot,
  toPublicPresaleTransaction,
  toPublicRentTransaction,
  toPublicSaleTransaction,
} from '../source-mappers';

function sourceRows() {
  const sale = toPublicSaleTransaction({
    dedupeKey: 'sale-public-key',
    masterId: 'apt-1',
    aptName: '테스트아파트',
    sigungu: '강남구',
    umdNm: '역삼동',
    areaM2: 84.99,
    floor: 10,
    dealAmount: 250_000,
    dealDate: '2026-08-01',
    buildYear: 2018,
    isCanceled: false,
  });
  const rent = toPublicRentTransaction({
    dedupeKey: 'rent-public-key',
    masterId: null,
    aptName: '테스트아파트',
    sigungu: '강남구',
    umdNm: '역삼동',
    areaM2: 84.99,
    floor: null,
    dealDate: '2026-08-02',
    deposit: 80_000,
    monthlyRent: 120,
    buildYear: 2018,
    contractType: '갱신',
    prevDeposit: 75_000,
    prevMonthlyRent: 100,
  });
  const presale = toPublicPresaleTransaction({
    dedupeKey: 'presale-public-key',
    masterId: null,
    aptName: '분양권단지',
    sigungu: '강남구',
    umdNm: '개포동',
    areaM2: 59.9,
    floor: 5,
    dealAmount: 180_000,
    dealDate: '2026-08-03',
    buildYear: null,
    isCanceled: false,
  });
  return { sale, rent, presale };
}

describe('public snapshot contract', () => {
  it('maps only the explicit public allowlist and counts all transaction kinds', () => {
    const raw = {
      dedupeKey: 'sale-public-key',
      masterId: 'apt-1',
      aptName: '테스트아파트',
      sigungu: '강남구',
      umdNm: '역삼동',
      areaM2: 84.99,
      floor: 10,
      dealAmount: 250_000,
      dealDate: '2026-08-01',
      buildYear: 2018,
      isCanceled: false,
      email: 'must-not-publish@example.com',
      jibun: '1-1',
      createdAt: new Date(),
    };
    const sale = toPublicSaleTransaction(raw);
    expect(sale).not.toHaveProperty('email');
    expect(sale).not.toHaveProperty('jibun');
    expect(sale).not.toHaveProperty('createdAt');
    expect(sale.id).toMatch(/^[a-f0-9]{24}$/);

    const { rent, presale } = sourceRows();
    expect(countPublicTransactions([sale, rent, presale])).toEqual({
      total: 3,
      sale: 1,
      rent: 1,
      presale: 1,
    });
  });

  it('builds a deterministic, strict district snapshot', () => {
    const { sale, rent, presale } = sourceRows();
    const snapshot = createPublicTransactionSnapshot({
      lawdCd: '11680',
      district: '강남구',
      period: { from: '2026-08-01', through: '2026-08-31' },
      generatedAt: '2026-08-11T00:00:00.000Z',
      records: [presale, rent, sale],
    });
    expect(snapshot.records.map((record) => record.kind)).toEqual(['sale', 'rent', 'presale']);
    expect(() => assertPublicTransactionSnapshot(snapshot)).not.toThrow();
  });

  it('normalizes unknown days, but rejects malformed dates, canceled deals, and unknown/PII fields', () => {
    const { sale } = sourceRows();
    const base = createPublicTransactionSnapshot({
      lawdCd: '11680',
      district: '강남구',
      period: { from: '2026-08-01', through: '2026-08-31' },
      generatedAt: '2026-08-11T00:00:00.000Z',
      records: [sale],
    });

    const unknownDay = toPublicSaleTransaction({
      dedupeKey: 'unknown-day', masterId: null, aptName: '테스트아파트', sigungu: '강남구',
      umdNm: '역삼동', areaM2: 84, floor: 1, dealAmount: 100_000,
      dealDate: '2026-08-00', buildYear: 2020, isCanceled: false,
    });
    expect(unknownDay.dealDate).toBe('2026-08');
    expect(() => assertPublicTransactionSnapshot({
      ...base,
      recordCount: 1,
      records: [unknownDay],
    })).not.toThrow();

    expect(() => assertPublicTransactionSnapshot({
      ...base,
      records: [{ ...sale, dealDate: '2026-13' }],
    })).toThrow(PublicSnapshotValidationError);
    expect(() => assertPublicTransactionSnapshot({
      ...base,
      records: [{ ...sale, canceled: true }],
    })).toThrow(/canceled/);
    expect(() => assertPublicTransactionSnapshot({
      ...base,
      records: [{ ...sale, buyerName: '홍길동' }],
    })).toThrow(/forbidden fields/);
  });
});

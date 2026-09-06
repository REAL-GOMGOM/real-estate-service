import { describe, expect, it } from 'vitest';
import { buildTransactionShareUrl } from '../transaction-share-url';

const apartment = {
  name: '래미안 원베일리 2차 (A&B)+가든',
  district: '용인시 수지구',
  dong: '성복동 1가',
  masterId: 'A-단지/123+45',
};

describe('buildTransactionShareUrl', () => {
  it('round-trips master identity, location, Unicode names and the contract without query injection', () => {
    const url = new URL(buildTransactionShareUrl({
      origin: 'https://www.naezipkorea.com', apartment, months: 36,
      tx: '2026-08-03_84_15_155000',
    }));

    expect(url.origin).toBe('https://www.naezipkorea.com');
    expect(url.pathname).toBe('/transactions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      district: apartment.district,
      q: apartment.name,
      aptId: apartment.masterId,
      aptDong: apartment.dong,
      months: '36',
      tx: '2026-08-03_84_15_155000',
    });
  });

  it('keeps name + dong for a legacy group and never guesses aptId from its display id', () => {
    const legacy = { ...apartment, id: 'A-looking-but-not-a-master-ID', masterId: null };
    const url = new URL(buildTransactionShareUrl({
      origin: 'http://localhost:3000', apartment: legacy, months: 6,
    }));

    expect(url.searchParams.get('q')).toBe(apartment.name);
    expect(url.searchParams.get('aptDong')).toBe(apartment.dong);
    expect(url.searchParams.has('aptId')).toBe(false);
    expect(url.searchParams.has('tx')).toBe(false);
    expect(url.searchParams.has('rtx')).toBe(false);
  });

  it('omits unavailable identity fields rather than serializing null or undefined', () => {
    const url = new URL(buildTransactionShareUrl({
      origin: 'https://www.naezipkorea.com/',
      apartment: { name: '우리집', district: '강남구', dong: null },
    }));

    expect(Object.fromEntries(url.searchParams)).toEqual({ district: '강남구', q: '우리집' });
  });

  it('restores the presale tab together with its sale-shaped transaction key', () => {
    const url = new URL(buildTransactionShareUrl({
      origin: 'https://www.naezipkorea.com', apartment, months: 12,
      dealType: 'bunyang', tx: '2026-08-03_84_15_155000',
    }));

    expect(url.searchParams.get('dealType')).toBe('bunyang');
    expect(url.searchParams.get('tx')).toBe('2026-08-03_84_15_155000');
    expect(url.searchParams.has('rtx')).toBe(false);
    expect(url.searchParams.get('aptId')).toBe(apartment.masterId);
  });

  it.each(['jeonse', 'monthly'] as const)('preserves %s identity using the rent contract parameter', (dealType) => {
    const url = new URL(buildTransactionShareUrl({
      origin: 'https://www.naezipkorea.com', apartment, months: 6,
      dealType, tx: '2026-08-03_84_15_50000_120',
    }));

    expect(url.searchParams.get('dealType')).toBe(dealType);
    expect(url.searchParams.get('rtx')).toBe('2026-08-03_84_15_50000_120');
    expect(url.searchParams.has('tx')).toBe(false);
    expect(url.searchParams.get('aptId')).toBe(apartment.masterId);
    expect(url.searchParams.get('aptDong')).toBe(apartment.dong);
  });
});

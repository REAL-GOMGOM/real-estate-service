import { describe, expect, it } from 'vitest';
import {
  buildRegionTransactionsHref,
  resolveRegionTransactionDistrict,
} from '@/lib/region-transactions-link';

describe('region transaction links', () => {
  it('directly supported district names are carried into transactions', () => {
    const region = {
      id: 'gangnam-gu',
      name: '강남구',
      region: '서울',
      district: '강남구',
    };

    expect(resolveRegionTransactionDistrict(region)).toBe('강남구');
    expect(buildRegionTransactionsHref(region)).toBe(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC',
    );
  });

  it('normalizes abbreviated local data to the transaction API district', () => {
    const region = {
      id: 'daejeon-yuseong',
      name: '대전유성구',
      region: '대전',
      district: '유성구',
    };

    expect(resolveRegionTransactionDistrict(region)).toBe('대전 유성구');
    expect(buildRegionTransactionsHref(region)).toBe(
      '/transactions?district=%EB%8C%80%EC%A0%84%20%EC%9C%A0%EC%84%B1%EA%B5%AC',
    );

    expect(resolveRegionTransactionDistrict({
      id: 'daejeon-jung',
      name: '대전중구',
      region: '대전',
      district: '중구',
    })).toBe('대전 중구');
  });

  it('uses a verified district for named-area records', () => {
    const region = {
      id: 'dongtan-2nd',
      name: '동탄',
      region: '2기신도시',
      district: '화성시',
    };

    expect(resolveRegionTransactionDistrict(region)).toBe('화성시 동탄구');
  });

  it('does not invent a district for a multi-district aggregate', () => {
    const region = {
      id: 'seoul-city',
      name: '서울',
      region: '서울',
      district: '서울특별시',
    };

    expect(resolveRegionTransactionDistrict(region)).toBeNull();
    expect(buildRegionTransactionsHref(region)).toBe('/transactions');
  });
});

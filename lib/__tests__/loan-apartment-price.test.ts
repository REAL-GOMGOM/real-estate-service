import { describe, expect, it } from 'vitest';
import { resolveLoanApartmentPrice } from '@/lib/loan-apartment-price';

describe('resolveLoanApartmentPrice', () => {
  it('유효 거래 표본이 있을 때만 적용 가능한 평균을 반환한다', () => {
    const result = resolveLoanApartmentPrice({
      data: [{ transactions: [
        { area: 84.6, price: 200000, date: '2026-07-01' },
        { area: 84.6, price: 220000, date: '2026-08-01' },
      ] }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.best).toMatchObject({ area: 85, count: 2, avg: 210000 });
    }
  });

  it.each([
    null,
    {},
    { data: [] },
    { data: [{ transactions: [] }] },
    { data: [{ transactions: [{ area: 0, price: 200000, date: '2026-07-01' }] }] },
  ])('빈 값·오류 계약·무효 표본은 적용 성공으로 위장하지 않는다: %j', (payload) => {
    const result = resolveLoanApartmentPrice(payload);
    expect(result.ok).toBe(false);
  });

  it('API가 제공한 오류 문구를 보존한다', () => {
    expect(resolveLoanApartmentPrice({ error: '원본 거래자료 조회 실패' })).toEqual({
      ok: false,
      error: '원본 거래자료 조회 실패',
    });
  });
});

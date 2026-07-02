/**
 * report/detect-highs 특성테스트 (Y5) — 신고가 검출 규칙 고정.
 *
 * 고정하는 규칙:
 * - 1억 원 미만 거래는 검출 대상 제외
 * - 그룹 키 = 단지명|법정동코드|읍면동|면적(0.1 단위 반올림)
 * - 기간 내 거래와 기간 전(prev) 거래가 모두 있어야 검출
 * - prevHigh "초과"만 신고가 (동일가 제외)
 * - 기간 내 여러 건이 각각 prevHigh와만 비교됨 (running max 아님 — 특성)
 */
import { describe, it, expect } from 'vitest';
import { detectYearHighs } from '../detect-highs';
import type { Deal, DateRange } from '../types';

const RANGE: DateRange = { from: '2026-06-04', to: '2026-07-03' };

function deal(over: Partial<Deal> = {}): Deal {
  return {
    aptNm: '테스트단지',
    umdNm: '역삼동',
    excluUseAr: 84.97,
    dealAmount: 1_000_000_000,
    dealYear: '2026',
    dealMonth: '06',
    dealDay: '15',
    lawdCd: '11680',
    districtName: '강남구',
    sido: '서울',
    ...over,
  };
}

const prevDeal = (amount: number, over: Partial<Deal> = {}) =>
  deal({ dealMonth: '01', dealDay: '10', dealAmount: amount, ...over });

describe('detectYearHighs — 검출 기본', () => {
  it('기간 내 거래가 이전 최고가를 초과하면 신고가로 검출', () => {
    const highs = detectYearHighs(
      [prevDeal(1_000_000_000), deal({ dealAmount: 1_200_000_000 })],
      RANGE,
    );
    expect(highs).toHaveLength(1);
    expect(highs[0]).toEqual({
      apartment: '테스트단지',
      region: '역삼동',
      sido: '서울',
      sigungu: '강남구',
      area: 84.97,
      newPrice: 1_200_000_000,
      prevHigh: 1_000_000_000,
      increase: 0.2,
      date: '2026-06-15',
    });
  });

  it('이전 최고가와 동일 금액은 신고가 아님 (초과만)', () => {
    const highs = detectYearHighs(
      [prevDeal(1_000_000_000), deal({ dealAmount: 1_000_000_000 })],
      RANGE,
    );
    expect(highs).toHaveLength(0);
  });

  it('1억 미만 거래는 대상 제외', () => {
    const highs = detectYearHighs(
      [prevDeal(80_000_000), deal({ dealAmount: 99_999_999 })],
      RANGE,
    );
    expect(highs).toHaveLength(0);
  });

  it('이전 거래(prev)가 없는 단지는 비교 불가 → 미검출', () => {
    const highs = detectYearHighs([deal({ dealAmount: 2_000_000_000 })], RANGE);
    expect(highs).toHaveLength(0);
  });
});

describe('detectYearHighs — 그룹 키 (면적 0.1 반올림)', () => {
  it('84.97㎡와 85.04㎡는 같은 그룹(85.0)으로 비교됨', () => {
    const highs = detectYearHighs(
      [
        prevDeal(1_000_000_000, { excluUseAr: 84.97 }),
        deal({ dealAmount: 1_100_000_000, excluUseAr: 85.04 }),
      ],
      RANGE,
    );
    expect(highs).toHaveLength(1);
  });

  it('84.9㎡와 85.0㎡는 다른 그룹 → prev 없음 처리로 미검출', () => {
    const highs = detectYearHighs(
      [
        prevDeal(1_000_000_000, { excluUseAr: 84.9 }),
        deal({ dealAmount: 1_100_000_000, excluUseAr: 85.0 }),
      ],
      RANGE,
    );
    expect(highs).toHaveLength(0);
  });
});

describe('detectYearHighs — 특성: 기간 내 다건은 각각 prevHigh와만 비교', () => {
  it('기간 내 12억·10.5억 모두 prev 10억 초과 → 2건 모두 검출 (running max 아님)', () => {
    const highs = detectYearHighs(
      [
        prevDeal(1_000_000_000),
        deal({ dealAmount: 1_200_000_000, dealDay: '10' }),
        deal({ dealAmount: 1_050_000_000, dealDay: '20' }),
      ],
      RANGE,
    );
    expect(highs).toHaveLength(2);
    expect(highs.map((h) => h.newPrice).sort()).toEqual([1_050_000_000, 1_200_000_000]);
    // 두 건 모두 prevHigh는 기간 전 최고가(10억) 기준
    expect(new Set(highs.map((h) => h.prevHigh))).toEqual(new Set([1_000_000_000]));
  });
});

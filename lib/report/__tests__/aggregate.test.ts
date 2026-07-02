/**
 * report/aggregate 특성테스트 (Y5) — 리포트 집계 규칙 고정.
 *
 * 시간 의존(title·generatedAt)은 fake timer로 고정.
 * 2026-07-03T03:00:00Z = KST 낮 12시 → 실행 환경 타임존(UTC/KST)과 무관하게 같은 날짜.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aggregate } from '../aggregate';
import type { Deal, DateRange, YearHigh } from '../types';

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

function high(increase: number, over: Partial<YearHigh> = {}): YearHigh {
  return {
    apartment: '테스트단지',
    region: '역삼동',
    sido: '서울',
    sigungu: '강남구',
    area: 84.97,
    newPrice: 1_200_000_000,
    prevHigh: 1_000_000_000,
    increase,
    date: '2026-06-15',
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-03T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('aggregate — 요약·타이틀', () => {
  it('KST 기준 타이틀·서브타이틀·생성시각 고정', () => {
    const r = aggregate([], RANGE, []);
    expect(r.title).toBe('2026년 7월 3일 기준 수도권 아파트 실거래 리포트');
    expect(r.subtitle).toBe('최근 30일 국토부 신고 거래 기준 (6/4 ~ 7/3)');
    expect(r.generatedAt).toBe('2026-07-03T03:00:00.000Z');
    expect(r.range).toBe('sudogwon');
    expect(r.notableThreshold).toBe(0.3);
  });

  it('기간 밖·1억 미만 거래는 집계 제외, 평균은 반올림', () => {
    const deals = [
      deal({ dealAmount: 1_000_000_000 }),
      deal({ dealAmount: 1_500_000_001 }),
      deal({ dealAmount: 99_999_999 }),                    // 1억 미만 제외
      deal({ dealAmount: 2_000_000_000, dealMonth: '05' }), // 기간 전 제외
    ];
    const r = aggregate(deals, RANGE, []);
    expect(r.summary.totalDeals).toBe(2);
    expect(r.summary.totalAmount).toBe(2_500_000_001);
    expect(r.summary.avgPrice).toBe(1_250_000_001); // round(2500000001/2)
  });

  it('disclaimer 문구 고정 (신고 지연 30일 안내)', () => {
    const r = aggregate([], RANGE, []);
    expect(r.disclaimer).toBe(
      '본 리포트는 국토부 실거래가 공개시스템에 신고 완료된 거래만 포함합니다. ' +
        '실거래 계약 후 신고까지 최대 30일이 소요되므로 실제 시장 거래량과 차이가 있을 수 있습니다. ' +
        '투자 판단의 참고 정보로만 활용하시기 바랍니다.',
    );
  });
});

describe('aggregate — 권역 분해', () => {
  it('서울·경기·인천 3행 고정 순서, 빈 권역은 0', () => {
    const deals = [
      deal({ sido: '서울', dealAmount: 1_000_000_000 }),
      deal({ sido: '경기', dealAmount: 600_000_000, umdNm: '영통동', districtName: '수원영통구' }),
      deal({ sido: '경기', dealAmount: 800_000_000, umdNm: '영통동', districtName: '수원영통구' }),
    ];
    const r = aggregate(deals, RANGE, [high(0.1, { sido: '경기' })]);

    expect(r.byRegion.map((b) => b.sido)).toEqual(['서울', '경기', '인천']);
    expect(r.byRegion[0]).toEqual({
      sido: '서울', deals: 1, yearHighs: 0, avgPrice: 1_000_000_000, totalAmount: 1_000_000_000,
    });
    expect(r.byRegion[1]).toEqual({
      sido: '경기', deals: 2, yearHighs: 1, avgPrice: 700_000_000, totalAmount: 1_400_000_000,
    });
    expect(r.byRegion[2]).toEqual({
      sido: '인천', deals: 0, yearHighs: 0, avgPrice: 0, totalAmount: 0,
    });
  });
});

describe('aggregate — 신고가 분류 (notable 30% 기준)', () => {
  it('상승률 0.3 이상은 notable(최대 5), 미만은 top(최대 20), 각각 내림차순', () => {
    const highs = [
      high(0.05), high(0.31), high(0.29), high(0.3), high(0.5), high(0.1),
    ];
    const r = aggregate([], RANGE, highs);

    // 경계 0.3은 notable 쪽 (이상 조건)
    expect(r.notableDeals.map((h) => h.increase)).toEqual([0.5, 0.31, 0.3]);
    expect(r.topYearHighs.map((h) => h.increase)).toEqual([0.29, 0.1, 0.05]);
    expect(r.summary.totalYearHighs).toBe(6);
  });

  it('notable 5개 초과분은 잘림', () => {
    const highs = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map((i) => high(i));
    const r = aggregate([], RANGE, highs);
    expect(r.notableDeals).toHaveLength(5);
    expect(r.notableDeals[0].increase).toBe(0.9);
  });
});

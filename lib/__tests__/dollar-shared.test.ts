import { describe, expect, it } from 'vitest';
import {
  monthsForYear,
  fallbackMonths,
  filterByArea,
  availableAreas,
  averagePrice,
  type DealRow,
} from '../dollar-shared';

const NOW = new Date(2026, 6, 12); // 2026-07-12

describe('monthsForYear — 연도별 조회 월', () => {
  it('과거 연도 → Q4 (기존 동작 보존)', () => {
    expect(monthsForYear(2020, NOW)).toEqual(['10', '11', '12']);
    expect(monthsForYear(2025, NOW)).toEqual(['10', '11', '12']);
  });

  it('현재 연도 → 최근 3개월 (당월 포함, 역순)', () => {
    expect(monthsForYear(2026, NOW)).toEqual(['07', '06', '05']);
  });

  it('연초 엣지 — 1월이면 1월만, 2월이면 2·1월', () => {
    expect(monthsForYear(2026, new Date(2026, 0, 15))).toEqual(['01']);
    expect(monthsForYear(2026, new Date(2026, 1, 15))).toEqual(['02', '01']);
  });
});

describe('fallbackMonths — 기본 월 외 나머지', () => {
  it('현재 연도(7월) → 1~4월 (5~7월은 기본에 포함)', () => {
    expect(fallbackMonths(2026, NOW)).toEqual(['01', '02', '03', '04']);
  });

  it('과거 연도 → 1~9월 (Q4 제외 전체)', () => {
    expect(fallbackMonths(2020, NOW)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
    );
  });
});

const DEALS: DealRow[] = [
  { price: 200000, area: 84.98 },
  { price: 210000, area: 84.62 },
  { price: 150000, area: 59.96 },
  { price: 300000, area: 114.5 },
];

describe('filterByArea — 평형 필터', () => {
  it('반올림 ㎡ 일치만 (84.98·84.62 → 85 그룹)', () => {
    expect(filterByArea(DEALS, 85)).toEqual([200000, 210000]);
    expect(filterByArea(DEALS, 60)).toEqual([150000]);
  });

  it('null 이면 전체', () => {
    expect(filterByArea(DEALS, null)).toHaveLength(4);
  });
});

describe('availableAreas — 평형 목록', () => {
  it('반올림 그룹·오름차순·건수', () => {
    expect(availableAreas(DEALS)).toEqual([
      { area: 60, count: 1 },
      { area: 85, count: 2 },
      { area: 115, count: 1 },
    ]);
  });

  it('면적 0 이하(파싱 실패)는 제외', () => {
    expect(availableAreas([{ price: 100, area: 0 }])).toEqual([]);
  });
});

describe('averagePrice', () => {
  it('평균 반올림, 빈 배열은 null', () => {
    expect(averagePrice([100, 101])).toBe(101); // 100.5 → 반올림
    expect(averagePrice([])).toBeNull();
  });
});

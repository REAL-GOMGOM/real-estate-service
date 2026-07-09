import { describe, it, expect } from 'vitest';
import { countNewHighs } from '@/lib/summary-highs';

describe('countNewHighs — 신고가 (최초 거래 제외)', () => {
  it('최초 거래(1건)는 신고가가 아니다', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 84, price: 50000, date: '20260705' },
    ])).toBe(0);
  });

  it('직전가를 초과한 최신 거래 = 신고가 1건', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 84, price: 50000, date: '20260701' },
      { aptName: 'A', area: 84, price: 55000, date: '20260705' },
    ])).toBe(1);
  });

  it('최신 거래가 직전보다 낮으면 신고가가 아니다', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 84, price: 55000, date: '20260701' },
      { aptName: 'A', area: 84, price: 50000, date: '20260705' },
    ])).toBe(0);
  });

  it('배열 순서와 무관하게 날짜 기준으로 최신을 판정한다', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 84, price: 55000, date: '20260705' },
      { aptName: 'A', area: 84, price: 50000, date: '20260701' },
    ])).toBe(1);
  });

  it('면적 반올림으로 같은 그룹 (83.9㎡·84.2㎡ 동일)', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 83.9, price: 50000, date: '20260701' },
      { aptName: 'A', area: 84.2, price: 55000, date: '20260705' },
    ])).toBe(1);
  });

  it('같은 단지라도 면적이 다르면 별개 그룹 (각 1건이면 0)', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 59, price: 40000, date: '20260701' },
      { aptName: 'A', area: 84, price: 60000, date: '20260705' },
    ])).toBe(0);
  });

  it('동일가 타이는 신고가가 아니다 (초과만 인정)', () => {
    expect(countNewHighs([
      { aptName: 'A', area: 84, price: 50000, date: '20260701' },
      { aptName: 'A', area: 84, price: 50000, date: '20260705' },
    ])).toBe(0);
  });

  it('과다집계 회귀 — 전부 최초 거래면 0 (기존 버그는 전건 카운트)', () => {
    const deals = Array.from({ length: 100 }, (_, i) => ({
      aptName: `APT${i}`, area: 84, price: 50000 + i, date: '20260705',
    }));
    expect(countNewHighs(deals)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  fmtPrice, fmtPriceFull, fmtContractDate,
  detectNewHigh, representativeArea,
  type AptGroup, type Transaction,
} from '../types';

/** 사이클 W — 실거래 카드 헬퍼 단위 테스트 */

function tx(partial: Partial<Transaction>): Transaction {
  return {
    aptName: '테스트단지', district: '강남구', area: 84, floor: 10,
    price: 100000, pricePerArea: 3000, date: '2026-06-15',
    ...partial,
  };
}

function group(transactions: Transaction[]): AptGroup {
  return {
    id: 'test', name: '테스트단지', district: '강남구',
    areas: [...new Set(transactions.map((t) => t.area))],
    transactions,
  };
}

describe('fmtPrice', () => {
  it('억 단위 — 소수 1자리, .0 제거', () => {
    expect(fmtPrice(120000)).toBe('12억');
    expect(fmtPrice(125000)).toBe('12.5억');
  });
  it('만 단위', () => {
    expect(fmtPrice(9100)).toBe('9,100만');
  });
});

describe('fmtPriceFull (아실형)', () => {
  it('억+만 조합', () => {
    expect(fmtPriceFull(25200)).toBe('2억 5,200만');
  });
  it('억 정수', () => {
    expect(fmtPriceFull(340000)).toBe('34억');
  });
  it('만 단위만', () => {
    expect(fmtPriceFull(9100)).toBe('9,100만');
  });
});

describe('fmtContractDate', () => {
  it('일 단위 — 26.06.26', () => {
    expect(fmtContractDate('2026-06-26')).toBe('26.06.26');
  });
  it('구캐시 월 단위 폴백 — 26.06', () => {
    expect(fmtContractDate('2026-06')).toBe('26.06');
  });
});

describe('detectNewHigh', () => {
  it('최신 거래가 동일 면적 최고가면 신고가', () => {
    const g = group([
      tx({ price: 100000, date: '2026-05-01' }),
      tx({ price: 110000, date: '2026-06-01' }),
    ]);
    expect(detectNewHigh(g)).toBe(true);
  });
  it('최신 거래가 최고가 아니면 false', () => {
    const g = group([
      tx({ price: 120000, date: '2026-05-01' }),
      tx({ price: 110000, date: '2026-06-01' }),
    ]);
    expect(detectNewHigh(g)).toBe(false);
  });
  it('거래 1건이면 false (비교 대상 없음)', () => {
    expect(detectNewHigh(group([tx({})]))).toBe(false);
  });
  it('다른 면적 거래는 비교에서 제외', () => {
    const g = group([
      tx({ price: 200000, area: 135, date: '2026-05-01' }),
      tx({ price: 110000, area: 84,  date: '2026-06-01' }),
    ]);
    // 84㎡ 비교군이 1건뿐 → false
    expect(detectNewHigh(g)).toBe(false);
  });
});

describe('representativeArea', () => {
  it('거래 최다 면적 반환', () => {
    const g = group([
      tx({ area: 59 }), tx({ area: 84 }), tx({ area: 84 }),
    ]);
    expect(representativeArea(g)).toBe(84);
  });
  it('거래 없으면 0', () => {
    expect(representativeArea(group([]))).toBe(0);
  });
});

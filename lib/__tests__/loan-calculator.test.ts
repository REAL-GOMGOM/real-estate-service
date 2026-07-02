/**
 * loan-calculator 특성테스트 (Y5) — 정책대출 시뮬레이터 현재 동작 고정.
 *
 * 고정 값은 2026-04-01 공시 금리 테이블(loan-products.ts) 기준.
 * 금리 테이블 갱신 시 이 테스트의 기대값도 함께 갱신할 것.
 *
 * 특성(현재 동작) 주의 사항:
 * - 지방 소재 우대(0.2%p)는 우대금리 상한(cap) "밖에서" 가산된다 → 상한 0.7 + 0.2 = 0.9 가능.
 * - DSR 40% 초과는 rejectReasons에 들어가지만 feasible은 true 유지 (경고 성격).
 */
import { describe, it, expect } from 'vitest';
import {
  simulateLoan,
  calcEqualPrincipalInterest,
  calcEqualPrincipalFirstMonth,
  calcGraduatedPayment,
  type LoanInput,
} from '../loan-calculator';

const BASE: LoanInput = {
  housePrice: 40000,
  deposit: 15000,
  income: 5000,
  existingDebtPayment: 0,
  loanTerm: 30,
  productId: 'didimdol',
  isNewlywedFirstTime: false,
  isLocalHouse: false,
  isCapitalArea: true,
  exclusiveDiscount: null,
  stackableDiscounts: [],
  repaymentType: 'equal_principal_interest',
};

describe('상환액 계산 함수', () => {
  it('원리금균등 — 금리 0이면 원금/개월수', () => {
    expect(calcEqualPrincipalInterest(12000, 0, 12)).toBe(1000);
  });

  it('원리금균등 — 2억(만원 단위), 3.75%, 30년 → 월 92.6231…', () => {
    expect(calcEqualPrincipalInterest(20000, 3.75, 360)).toBeCloseTo(92.623118, 5);
  });

  it('원금균등 첫 달 — 원금/개월수 + 첫 달 이자', () => {
    // 12000/120 + 12000 * (0.03/12) = 100 + 30 = 130
    expect(calcEqualPrincipalFirstMonth(12000, 3.0, 120)).toBe(130);
  });

  it('체증식 — 30년(growthRate 0.02)의 1·2년차, 연 2% 증가 관계 고정', () => {
    const y1 = calcGraduatedPayment(20000, 3.75, 360, 1);
    const y2 = calcGraduatedPayment(20000, 3.75, 360, 2);
    expect(y1).toBeCloseTo(68.49458, 4);
    expect(y2).toBeCloseTo(y1 * 1.02, 8);
  });
});

describe('simulateLoan — 디딤돌 일반 (대표 시나리오 고정)', () => {
  it('4억 주택·자기자금 1.5억·소득 5천 → 한도 2억, 3.75%, 월 92.62', () => {
    const r = simulateLoan(BASE);
    // LTV 70% = 28000, 상품한도 20000, 필요액 25000 → min = 20000
    expect(r.loanAmount).toBe(20000);
    expect(r.baseRate).toBe(3.75);
    expect(r.appliedRate).toBe(3.75);
    expect(r.ltvUsed).toBe(70);
    expect(r.monthlyPayment).toBe(92.62);
    expect(r.totalInterest).toBe(13344.32);
    expect(r.totalPayment).toBe(33344.32);
    expect(r.dsr).toBe(22.23);
    expect(r.dti).toBe(22.23);
    expect(r.feasible).toBe(true);
    expect(r.rejectReasons).toEqual([]);
  });

  it('상환 스케줄 — 12개월 고정, 1개월차 원리금 분해 값', () => {
    const r = simulateLoan(BASE);
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule[0]).toEqual({
      month: 1,
      principal: 30.12,
      interest: 62.5,
      payment: 92.62,
      remainingBalance: 19969.88,
    });
  });
});

describe('simulateLoan — 신혼·생애최초 분기', () => {
  it('신혼 + 비수도권 → LTV 80, 신혼 금리 테이블(소득 7천·30년 → 3.45%)', () => {
    const r = simulateLoan({
      ...BASE,
      isNewlywedFirstTime: true,
      isCapitalArea: false,
      income: 7000,
      housePrice: 55000,
      deposit: 10000,
    });
    expect(r.ltvUsed).toBe(80);
    expect(r.baseRate).toBe(3.45);
    expect(r.loanAmount).toBe(32000); // 신혼 상품한도
    expect(r.feasible).toBe(true);
  });
});

describe('simulateLoan — 우대금리 (특성: 지방 우대는 상한 밖 가산)', () => {
  it('다자녀(0.7) + 중복 0.6 → cap 0.7, 지방 0.2 별도 가산 → 총 0.9', () => {
    const r = simulateLoan({
      ...BASE,
      exclusiveDiscount: 'child3',
      stackableDiscounts: ['savings_15y', 'e_contract'],
      isLocalHouse: true,
    });
    expect(r.discountRate).toBe(0.9);
    expect(r.appliedRate).toBe(2.85); // 3.75 - 0.9
  });
});

describe('simulateLoan — 요건 미충족·경고', () => {
  it('소득요건 초과 → feasible false + 사유 명시', () => {
    const r = simulateLoan({ ...BASE, income: 9000 });
    expect(r.feasible).toBe(false);
    expect(r.rejectReasons).toEqual(['소득요건 초과: 연소득 9000만원 > 한도 6000만원']);
  });

  it('DSR 40% 초과 — 경고는 남지만 feasible은 true 유지 (특성)', () => {
    const r = simulateLoan({ ...BASE, income: 2500, housePrice: 30000, deposit: 3000 });
    expect(r.dsr).toBe(42.58);
    expect(r.rejectReasons).toEqual(['DSR 42.58% > 40% 초과 (경고: 대출 심사 시 제한 가능)']);
    expect(r.feasible).toBe(true);
  });

  it('존재하지 않는 상품 → 전체 0 + 사유', () => {
    const r = simulateLoan({ ...BASE, productId: 'nope' });
    expect(r.feasible).toBe(false);
    expect(r.rejectReasons).toEqual(['존재하지 않는 상품입니다.']);
    expect(r.loanAmount).toBe(0);
    expect(r.schedule).toHaveLength(0);
  });
});

describe('simulateLoan — 보금자리론·체증식', () => {
  it('보금자리론 — rateRange 중간값 4.25% 적용', () => {
    const r = simulateLoan({ ...BASE, productId: 'bogeumjari', income: 9000, housePrice: 55000 });
    expect(r.baseRate).toBe(4.25);
    expect(r.appliedRate).toBe(4.25);
    expect(r.loanAmount).toBe(38500); // LTV 70% (housePrice 55000 → 38500), 한도 50000 미만
    expect(r.feasible).toBe(true);
  });

  it('체증식 30년 — 연차별(1·10·20·30) 월 상환액 고정, 총이자는 원리금균등과 동일', () => {
    const r = simulateLoan({ ...BASE, repaymentType: 'graduated' });
    expect(r.monthlyPayment).toBe(68.49);
    expect(r.graduatedYears).toEqual([
      { year: 1, monthlyPayment: 68.49 },
      { year: 10, monthlyPayment: 81.86 },
      { year: 20, monthlyPayment: 99.78 },
      { year: 30, monthlyPayment: 121.64 },
    ]);
    expect(r.totalInterest).toBe(13344.32); // 원리금균등과 동일 (설계 의도)
  });
});

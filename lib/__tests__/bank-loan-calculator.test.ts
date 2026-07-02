/**
 * bank-loan-calculator 특성테스트 (Y5) — 시중은행 주담대 시뮬레이터 현재 동작 고정.
 *
 * 특성(현재 동작) 주의 사항:
 * - DSR/스트레스 DSR 초과는 warnings에만 기록, feasible은 true 유지.
 * - 스트레스 가산(0.75%p)은 변동금리에만 적용.
 */
import { describe, it, expect } from 'vitest';
import {
  simulateBankLoan,
  LTV_BY_REGULATION,
  STRESS_RATE,
  type BankLoanInput,
} from '../bank-loan-calculator';

const BASE: BankLoanInput = {
  housePrice: 100000,
  deposit: 50000,
  income: 8000,
  existingDebtPayment: 0,
  loanTerm: 30,
  rateType: 'variable',
  rateMin: 4.0,
  rateMax: 4.5,
  regulation: 'speculative',
  repaymentType: 'equal_principal_interest',
  bankName: 'KB',
  productName: '테스트상품',
};

describe('규제 상수', () => {
  it('LTV 규제 테이블·스트레스 가산 고정', () => {
    expect(LTV_BY_REGULATION).toEqual({ speculative: 40, adjusted: 50, none: 70 });
    expect(STRESS_RATE).toBe(0.75);
  });
});

describe('simulateBankLoan — 대표 시나리오 (투기과열·변동금리)', () => {
  it('10억 주택·투기과열 LTV 40% → 한도 4억, 금리 범위 상환액 고정', () => {
    const r = simulateBankLoan(BASE);
    expect(r.loanAmount).toBe(40000); // min(LTV 40000, 필요액 50000)
    expect(r.ltvUsed).toBe(40);
    expect(r.stressedRate).toBe(4.75); // 변동금리 → rateMin + 0.75
    expect(r.monthlyPaymentMin).toBe(190.97);
    expect(r.monthlyPaymentMax).toBe(202.67);
    expect(r.totalInterestMin).toBe(28747.8);
    expect(r.totalPaymentMax).toBe(72962.68);
    expect(r.dsr).toBe(28.64);
    expect(r.stressedDsr).toBe(31.3);
    expect(r.dti).toBe(28.64);
    expect(r.feasible).toBe(true);
    expect(r.warnings).toHaveLength(0);
    expect(r.scheduleMin).toHaveLength(12);
  });

  it('고정금리 → 스트레스 가산 없음 (stressedRate = rateMin)', () => {
    const r = simulateBankLoan({ ...BASE, rateType: 'fixed' });
    expect(r.stressedRate).toBe(4.0);
  });
});

describe('simulateBankLoan — 대출 불필요·경고 특성', () => {
  it('자기자금 ≥ 매매가 → 대출 0, feasible false, 스케줄 없음', () => {
    const r = simulateBankLoan({
      ...BASE,
      housePrice: 50000,
      deposit: 60000,
      regulation: 'none',
      rateType: 'fixed',
      repaymentType: 'equal_principal',
    });
    expect(r.loanAmount).toBe(0);
    expect(r.feasible).toBe(false);
    expect(r.rejectReasons).toEqual(['자기자금이 매매가 이상이라 대출이 필요 없습니다']);
    expect(r.monthlyPaymentMin).toBe(0);
    expect(r.scheduleMin).toHaveLength(0);
  });

  it('DSR·스트레스 DSR 초과 → 경고 2건, feasible은 true 유지 (특성)', () => {
    const r = simulateBankLoan({
      ...BASE,
      housePrice: 80000,
      deposit: 20000,
      income: 6000,
      existingDebtPayment: 500,
      rateMin: 4.2,
      rateMax: 4.8,
      regulation: 'adjusted',
    });
    expect(r.loanAmount).toBe(40000); // LTV 50% = 40000 < 필요액 60000
    expect(r.ltvUsed).toBe(50);
    expect(r.dsr).toBe(47.45);
    expect(r.stressedDsr).toBe(51.03);
    expect(r.warnings).toEqual([
      '일반 DSR 47.45% — 40% 초과로 대출 불가능할 수 있습니다',
      '스트레스 DSR 51.03% — 변동금리 규제 초과',
    ]);
    expect(r.feasible).toBe(true);
  });
});

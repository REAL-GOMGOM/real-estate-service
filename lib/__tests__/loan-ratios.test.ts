/**
 * loan-ratios 특성테스트 (Y5) — 현재 동작을 스펙으로 고정.
 * 리디자인 중 회귀 감지가 목적. 동작 변경 시 이 테스트를 의도적으로 갱신할 것.
 */
import { describe, it, expect } from 'vitest';
import {
  calcDsr,
  calcDti,
  classifyRatio,
  DTI_LIMIT_POLICY,
  DTI_LIMIT_BANK,
  RATIO_WARNING_THRESHOLD,
} from '../loan-ratios';

describe('상수 고정', () => {
  it('정책 한도 상수가 문서와 일치', () => {
    expect(DTI_LIMIT_POLICY).toBe(60);
    expect(DTI_LIMIT_BANK).toBe(40);
    expect(RATIO_WARNING_THRESHOLD).toBe(0.75);
  });
});

describe('calcDsr', () => {
  it('문서 예시: 2000+400 / 6000 → 40', () => {
    expect(calcDsr({ annualRepayment: 2000, existingDebtPayment: 400, income: 6000 })).toBe(40);
  });

  it('소수 둘째 자리 반올림: 1234/7000 → 17.63', () => {
    expect(calcDsr({ annualRepayment: 1000, existingDebtPayment: 234, income: 7000 })).toBe(17.63);
  });

  it('income 0 이하 가드 → 0', () => {
    expect(calcDsr({ annualRepayment: 2000, existingDebtPayment: 0, income: 0 })).toBe(0);
    expect(calcDsr({ annualRepayment: 2000, existingDebtPayment: 0, income: -100 })).toBe(0);
  });
});

describe('calcDti', () => {
  it('문서 예시: 2000+100 / 6000 → 35', () => {
    expect(calcDti({ annualRepayment: 2000, existingDebtInterest: 100, income: 6000 })).toBe(35);
  });

  it('문서 예시: 2000+0 / 6000 → 33.33', () => {
    expect(calcDti({ annualRepayment: 2000, existingDebtInterest: 0, income: 6000 })).toBe(33.33);
  });

  it('income 0 이하 가드 → 0', () => {
    expect(calcDti({ annualRepayment: 2000, existingDebtInterest: 0, income: 0 })).toBe(0);
  });
});

describe('classifyRatio — 경계값', () => {
  it('한도×0.75 미만 → success', () => {
    expect(classifyRatio(35, 60)).toBe('success');
    expect(classifyRatio(44.99, 60)).toBe('success');
  });

  it('한도×0.75 정확히 → warning (이상 조건)', () => {
    expect(classifyRatio(45, 60)).toBe('warning');
  });

  it('한도 정확히 → warning (초과가 아님)', () => {
    expect(classifyRatio(60, 60)).toBe('warning');
  });

  it('한도 초과 → danger', () => {
    expect(classifyRatio(60.01, 60)).toBe('danger');
    expect(classifyRatio(65, 60)).toBe('danger');
  });
});

import {
  calcEqualPrincipalInterest,
  calcEqualPrincipalFirstMonth,
  MonthlySchedule,
} from './loan-calculator';

export interface BankLoanInput {
  housePrice: number;
  deposit: number;
  income: number;
  existingDebtPayment: number;
  loanTerm: number;
  rateType: 'fixed' | 'variable';
  rateMin: number;
  rateMax: number;
  regulation: 'speculative' | 'adjusted' | 'none';
  repaymentType: 'equal_principal_interest' | 'equal_principal';
  bankName: string;
  productName: string;
}

export interface BankLoanResult {
  loanAmount: number;
  appliedRateMin: number;
  appliedRateMax: number;
  stressedRate: number;
  monthlyPaymentMin: number;
  monthlyPaymentMax: number;
  totalInterestMin: number;
  totalInterestMax: number;
  totalPaymentMin: number;
  totalPaymentMax: number;
  dsr: number;
  stressedDsr: number;
  ltvUsed: number;
  feasible: boolean;
  warnings: string[];
  rejectReasons: string[];
  scheduleMin: MonthlySchedule[];
}

// LTV 규제 테이블
export const LTV_BY_REGULATION = {
  speculative: 40, // 투기과열
  adjusted: 50, // 조정대상
  none: 70, // 비규제
} as const;

export const REGULATION_LABELS: Record<keyof typeof LTV_BY_REGULATION, string> = {
  speculative: '투기과열지구',
  adjusted: '조정대상지역',
  none: '비규제',
};

// 스트레스 DSR 가산금리 (2026년 기준, 변동금리에만 적용)
export const STRESS_RATE = 0.75;

function monthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
  type: 'equal_principal_interest' | 'equal_principal'
): number {
  if (type === 'equal_principal_interest') {
    return calcEqualPrincipalInterest(principal, annualRate, months);
  }
  return calcEqualPrincipalFirstMonth(principal, annualRate, months);
}

function totalInterest(
  principal: number,
  annualRate: number,
  months: number,
  type: 'equal_principal_interest' | 'equal_principal'
): number {
  const r = annualRate / 100 / 12;
  if (type === 'equal_principal_interest') {
    const m = calcEqualPrincipalInterest(principal, annualRate, months);
    return m * months - principal;
  }
  // 원금균등
  return (principal * r * (months + 1)) / 2;
}

function buildSchedule(
  principal: number,
  annualRate: number,
  months: number,
  type: 'equal_principal_interest' | 'equal_principal'
): MonthlySchedule[] {
  const r = annualRate / 100 / 12;
  const schedule: MonthlySchedule[] = [];
  let remaining = principal;

  for (let m = 1; m <= Math.min(months, 12); m++) {
    const interest = remaining * r;
    let principalPay: number;
    let payment: number;

    if (type === 'equal_principal_interest') {
      payment = calcEqualPrincipalInterest(principal, annualRate, months);
      principalPay = payment - interest;
    } else {
      principalPay = principal / months;
      payment = principalPay + interest;
    }

    remaining -= principalPay;

    schedule.push({
      month: m,
      principal: Math.round(principalPay * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      payment: Math.round(payment * 100) / 100,
      remainingBalance: Math.round(Math.max(remaining, 0) * 100) / 100,
    });
  }

  return schedule;
}

export function simulateBankLoan(input: BankLoanInput): BankLoanResult {
  const warnings: string[] = [];
  const rejectReasons: string[] = [];

  // 1. LTV 적용
  const ltv = LTV_BY_REGULATION[input.regulation];
  const maxByLtv = Math.floor(input.housePrice * (ltv / 100));
  const maxByDeposit = Math.max(0, input.housePrice - input.deposit);
  const loanAmount = Math.min(maxByLtv, maxByDeposit);

  if (loanAmount <= 0) {
    rejectReasons.push('자기자금이 매매가 이상이라 대출이 필요 없습니다');
  }

  // 2. 금리 (공시 범위)
  const rateMin = input.rateMin;
  const rateMax = input.rateMax;

  // 스트레스 DSR (변동금리만)
  const stressedRate = input.rateType === 'variable' ? rateMin + STRESS_RATE : rateMin;

  // 3. 월 상환액
  const months = input.loanTerm * 12;
  const monthlyPaymentMin = loanAmount > 0
    ? monthlyPayment(loanAmount, rateMin, months, input.repaymentType)
    : 0;
  const monthlyPaymentMax = loanAmount > 0
    ? monthlyPayment(loanAmount, rateMax, months, input.repaymentType)
    : 0;

  // 4. DSR
  const annualPaymentMin = monthlyPaymentMin * 12;
  const annualStressed = loanAmount > 0
    ? monthlyPayment(loanAmount, stressedRate, months, input.repaymentType) * 12
    : 0;

  const dsr = input.income > 0
    ? Math.round(((annualPaymentMin + input.existingDebtPayment) / input.income) * 100 * 100) / 100
    : 0;
  const stressedDsr = input.income > 0
    ? Math.round(((annualStressed + input.existingDebtPayment) / input.income) * 100 * 100) / 100
    : 0;

  if (dsr > 40) {
    warnings.push(`일반 DSR ${dsr}% — 40% 초과로 대출 불가능할 수 있습니다`);
  }
  if (input.rateType === 'variable' && stressedDsr > 40) {
    warnings.push(`스트레스 DSR ${stressedDsr}% — 변동금리 규제 초과`);
  }

  // 5. 총 이자
  const totalInterestMin = loanAmount > 0
    ? totalInterest(loanAmount, rateMin, months, input.repaymentType)
    : 0;
  const totalInterestMax = loanAmount > 0
    ? totalInterest(loanAmount, rateMax, months, input.repaymentType)
    : 0;
  const totalPaymentMin = loanAmount + totalInterestMin;
  const totalPaymentMax = loanAmount + totalInterestMax;

  const scheduleMin = loanAmount > 0
    ? buildSchedule(loanAmount, rateMin, months, input.repaymentType)
    : [];

  return {
    loanAmount,
    appliedRateMin: Math.round(rateMin * 100) / 100,
    appliedRateMax: Math.round(rateMax * 100) / 100,
    stressedRate: Math.round(stressedRate * 100) / 100,
    monthlyPaymentMin: Math.round(monthlyPaymentMin * 100) / 100,
    monthlyPaymentMax: Math.round(monthlyPaymentMax * 100) / 100,
    totalInterestMin: Math.round(totalInterestMin * 100) / 100,
    totalInterestMax: Math.round(totalInterestMax * 100) / 100,
    totalPaymentMin: Math.round(totalPaymentMin * 100) / 100,
    totalPaymentMax: Math.round(totalPaymentMax * 100) / 100,
    dsr,
    stressedDsr,
    ltvUsed: ltv,
    feasible: rejectReasons.length === 0,
    warnings,
    rejectReasons,
    scheduleMin,
  };
}

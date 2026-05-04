import {
  getBaseRate,
  calcTotalDiscount,
  LOAN_PRODUCTS,
  MIN_RATE_GENERAL,
  MIN_RATE_NEWLYWED_FIRST,
} from './loan-products';
import { calcDti } from './loan-ratios';

export interface LoanInput {
  housePrice: number;
  deposit: number;
  income: number;
  existingDebtPayment: number;
  existingDebtInterest?: number;  // 기존 부채 연 이자 (만원, DTI 계산용, default 0)
  loanTerm: number;
  productId: string;
  isNewlywedFirstTime: boolean;
  isLocalHouse: boolean;
  isCapitalArea: boolean;
  exclusiveDiscount: string | null;
  stackableDiscounts: string[];
  repaymentType: 'equal_principal_interest' | 'equal_principal' | 'graduated';
}

export interface MonthlySchedule {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  remainingBalance: number;
}

export interface GraduatedYearInfo {
  year: number;
  monthlyPayment: number;
}

export interface LoanResult {
  loanAmount: number;
  appliedRate: number;
  baseRate: number;
  discountRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
  dsr: number;
  dti: number;  // 총부채상환비율 (정책대출 한도 60% 기준)
  ltvUsed: number;
  feasible: boolean;
  rejectReasons: string[];
  schedule: MonthlySchedule[];
  graduatedYears?: GraduatedYearInfo[];
}

export function calcEqualPrincipalInterest(
  principal: number,
  annualRate: number,
  months: number
): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function calcEqualPrincipalFirstMonth(
  principal: number,
  annualRate: number,
  months: number
): number {
  const r = annualRate / 100 / 12;
  return principal / months + principal * r;
}

// 체증식: 초기 상환액이 적고 매년 일정 비율로 증가
// 총 상환액은 원리금균등과 동일하되 초기에 적게, 후기에 많이 내는 구조
export function calcGraduatedPayment(
  principal: number,
  annualRate: number,
  months: number,
  year: number
): number {
  const growthRate = months <= 120 ? 0.06 : months <= 180 ? 0.04 : months <= 240 ? 0.03 : 0.02;

  const r = annualRate / 100 / 12;
  const equalPayment = r === 0
    ? principal / months
    : principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);

  const years = months / 12;
  let sumFactor = 0;
  for (let y = 0; y < years; y++) {
    sumFactor += Math.pow(1 + growthRate, y) * 12;
  }
  const firstYearMonthly = (equalPayment * months) / sumFactor;

  return firstYearMonthly * Math.pow(1 + growthRate, year - 1);
}

function buildSchedule(
  principal: number,
  annualRate: number,
  months: number,
  repaymentType: LoanInput['repaymentType']
): MonthlySchedule[] {
  const r = annualRate / 100 / 12;
  const schedule: MonthlySchedule[] = [];
  let remaining = principal;

  for (let m = 1; m <= Math.min(months, 12); m++) {
    const interest = remaining * r;
    let principalPay: number;
    let payment: number;

    if (repaymentType === 'graduated') {
      const year = Math.ceil(m / 12);
      payment = calcGraduatedPayment(principal, annualRate, months, year);
      principalPay = payment - interest;
    } else if (repaymentType === 'equal_principal_interest') {
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

function calcTotalInterest(
  principal: number,
  annualRate: number,
  months: number,
  repaymentType: LoanInput['repaymentType']
): number {
  const r = annualRate / 100 / 12;

  if (repaymentType === 'equal_principal_interest' || repaymentType === 'graduated') {
    // 체증식도 총 상환액은 원리금균등과 동일
    const monthlyPayment = calcEqualPrincipalInterest(principal, annualRate, months);
    return monthlyPayment * months - principal;
  }

  // 원금균등: 총이자 = 원금 * 월이율 * (개월수 + 1) / 2
  return principal * r * (months + 1) / 2;
}

export function simulateLoan(input: LoanInput): LoanResult {
  const rejectReasons: string[] = [];
  const product = LOAN_PRODUCTS.find((p) => p.id === input.productId);

  if (!product) {
    return {
      loanAmount: 0,
      appliedRate: 0,
      baseRate: 0,
      discountRate: 0,
      monthlyPayment: 0,
      totalInterest: 0,
      totalPayment: 0,
      dsr: 0,
      dti: 0,
      ltvUsed: 0,
      feasible: false,
      rejectReasons: ['존재하지 않는 상품입니다.'],
      schedule: [],
    };
  }

  const isDidimdol = product.id === 'didimdol';
  const didimdol = isDidimdol
    ? (product as {
        id: string;
        maxLoan: { general: number; firstTime: number; newlywed: number };
        incomeLimit: { general: number; firstTime: number; newlywed: number };
        housePriceLimit: { general: number; newlywed: number };
        ltv: { general: number; firstTime: number; firstTimeCapital: number };
      })
    : null;

  // 소득요건 체크
  if (didimdol) {
    const limit = input.isNewlywedFirstTime
      ? didimdol.incomeLimit.newlywed
      : didimdol.incomeLimit.general;
    if (input.income > limit) {
      rejectReasons.push(
        `소득요건 초과: 연소득 ${input.income}만원 > 한도 ${limit}만원`
      );
    }
  } else {
    const limit = product.incomeLimit as number;
    if (input.income > limit) {
      rejectReasons.push(
        `소득요건 초과: 연소득 ${input.income}만원 > 한도 ${limit}만원`
      );
    }
  }

  // 주택가격요건 체크
  if (didimdol) {
    const priceLimit = input.isNewlywedFirstTime
      ? didimdol.housePriceLimit.newlywed
      : didimdol.housePriceLimit.general;
    if (input.housePrice > priceLimit) {
      rejectReasons.push(
        `주택가격 초과: ${input.housePrice}만원 > 한도 ${priceLimit}만원`
      );
    }
  } else {
    const priceLimit = product.housePriceLimit as number;
    if (input.housePrice > priceLimit) {
      rejectReasons.push(
        `주택가격 초과: ${input.housePrice}만원 > 한도 ${priceLimit}만원`
      );
    }
  }

  // LTV 계산
  let ltvUsed: number;
  if (didimdol) {
    if (input.isNewlywedFirstTime && !input.isCapitalArea) {
      ltvUsed = didimdol.ltv.firstTime; // 80%
    } else if (input.isNewlywedFirstTime && input.isCapitalArea) {
      ltvUsed = didimdol.ltv.firstTimeCapital; // 70%
    } else {
      ltvUsed = didimdol.ltv.general; // 70%
    }
  } else {
    ltvUsed = product.ltv as number;
  }

  // 대출가능액 산정
  let maxLoanByProduct: number;
  if (didimdol) {
    if (input.isNewlywedFirstTime) {
      maxLoanByProduct = didimdol.maxLoan.newlywed;
    } else {
      maxLoanByProduct = didimdol.maxLoan.general;
    }
  } else {
    maxLoanByProduct = product.maxLoan as number;
  }

  const ltvAmount = Math.floor(input.housePrice * (ltvUsed / 100));
  const neededAmount = input.housePrice - input.deposit;
  const loanAmount = Math.max(0, Math.min(ltvAmount, maxLoanByProduct, neededAmount));

  // 금리 계산
  let baseRate: number;
  let discountRate = 0;
  let appliedRate: number;

  if (isDidimdol) {
    baseRate = getBaseRate(input.income, input.loanTerm, input.isNewlywedFirstTime);

    // 지방 소재 우대
    const localDiscount = input.isLocalHouse ? 0.2 : 0;

    // 우대금리
    const isMultiChild3 = input.exclusiveDiscount === 'child3';
    discountRate =
      calcTotalDiscount(input.exclusiveDiscount, input.stackableDiscounts, isMultiChild3) +
      localDiscount;

    const minRate = input.isNewlywedFirstTime ? MIN_RATE_NEWLYWED_FIRST : MIN_RATE_GENERAL;
    appliedRate = Math.max(baseRate - discountRate, minRate);
  } else {
    // 보금자리론, 신생아특례: rateRange 중간값
    const range = (product as { rateRange: { min: number; max: number } }).rateRange;
    baseRate = (range.min + range.max) / 2;
    appliedRate = baseRate;
  }

  // 월 상환액
  const months = input.loanTerm * 12;
  let monthlyPayment: number;
  if (input.repaymentType === 'graduated') {
    monthlyPayment = calcGraduatedPayment(loanAmount, appliedRate, months, 1);
  } else if (input.repaymentType === 'equal_principal_interest') {
    monthlyPayment = calcEqualPrincipalInterest(loanAmount, appliedRate, months);
  } else {
    monthlyPayment = calcEqualPrincipalFirstMonth(loanAmount, appliedRate, months);
  }
  monthlyPayment = Math.round(monthlyPayment * 100) / 100;

  // 체증식 연차별 정보
  let graduatedYears: GraduatedYearInfo[] | undefined;
  if (input.repaymentType === 'graduated') {
    const totalYears = input.loanTerm;
    const keyYears = [1];
    if (totalYears >= 10) keyYears.push(10);
    if (totalYears >= 20) keyYears.push(20);
    if (totalYears >= 30) keyYears.push(30);
    if (!keyYears.includes(totalYears)) keyYears.push(totalYears);
    graduatedYears = keyYears.map((y) => ({
      year: y,
      monthlyPayment: Math.round(calcGraduatedPayment(loanAmount, appliedRate, months, y) * 100) / 100,
    }));
  }

  // 총이자, 총상환
  const totalInterest = Math.round(
    calcTotalInterest(loanAmount, appliedRate, months, input.repaymentType) * 100
  ) / 100;
  const totalPayment = Math.round((loanAmount + totalInterest) * 100) / 100;

  // DSR 계산 (체증식은 1년차 기준)
  const annualRepayment = monthlyPayment * 12;
  const dsr =
    input.income > 0
      ? Math.round(
          ((annualRepayment + input.existingDebtPayment) / input.income) * 100 * 100
        ) / 100
      : 0;

  if (dsr > 40) {
    rejectReasons.push(`DSR ${dsr}% > 40% 초과 (경고: 대출 심사 시 제한 가능)`);
  }

  // DTI 계산 (보조 지표 — 정책대출 통상 한도 60%)
  const dti = calcDti({
    annualRepayment,
    existingDebtInterest: input.existingDebtInterest ?? 0,
    income: input.income,
  });

  // 상환 스케줄
  const schedule = buildSchedule(loanAmount, appliedRate, months, input.repaymentType);

  const feasible = rejectReasons.filter(
    (r) => !r.startsWith('DSR')
  ).length === 0;

  return {
    loanAmount,
    appliedRate: Math.round(appliedRate * 100) / 100,
    baseRate: Math.round(baseRate * 100) / 100,
    discountRate: Math.round(discountRate * 100) / 100,
    monthlyPayment,
    totalInterest,
    totalPayment,
    dsr,
    dti,
    ltvUsed,
    graduatedYears,
    feasible,
    rejectReasons,
    schedule,
  };
}

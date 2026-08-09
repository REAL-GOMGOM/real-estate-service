import {
  getBaseRate,
  hasDirectDidimdolRate,
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
  /** 약정 기간 말 상환 후 잔액. 정상 완납 계산이면 0. */
  maturityBalance: number;
  rateBasis: 'stored_table' | 'term_proxy_assumption' | 'range_midpoint_assumption' | 'unavailable';
  rateNote: string;
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

function graduatedGrowthRate(months: number): number {
  return months <= 120 ? 0.06 : months <= 180 ? 0.04 : months <= 240 ? 0.03 : 0.02;
}

// 체증식: 월 납입액은 한 해 동안 일정하고 매년 정해진 비율로 증가한다.
// 각 납입액의 현재가치 합이 원금과 같아지도록 1년차 납입액을 역산해야
// 이자를 반영한 뒤에도 만기에 잔액이 남지 않는다.
export function calcGraduatedPayment(
  principal: number,
  annualRate: number,
  months: number,
  year: number
): number {
  if (principal <= 0 || months <= 0 || year <= 0) return 0;
  const growthRate = graduatedGrowthRate(months);
  const r = annualRate / 100 / 12;
  let presentValueFactor = 0;
  for (let month = 1; month <= months; month++) {
    const paymentGrowth = Math.pow(1 + growthRate, Math.floor((month - 1) / 12));
    presentValueFactor += paymentGrowth / Math.pow(1 + r, month);
  }
  if (!Number.isFinite(presentValueFactor) || presentValueFactor <= 0) return 0;
  const firstYearMonthly = principal / presentValueFactor;

  return firstYearMonthly * Math.pow(1 + growthRate, year - 1);
}

interface AmortizationProjection {
  schedule: MonthlySchedule[];
  totalInterest: number;
  totalPayment: number;
  maturityBalance: number;
}

function projectAmortization(
  principal: number,
  annualRate: number,
  months: number,
  repaymentType: LoanInput['repaymentType']
): AmortizationProjection {
  if (principal <= 0 || months <= 0) {
    return { schedule: [], totalInterest: 0, totalPayment: 0, maturityBalance: 0 };
  }

  const r = annualRate / 100 / 12;
  const schedule: MonthlySchedule[] = [];
  let remaining = principal;
  let totalInterest = 0;
  let totalPayment = 0;

  for (let m = 1; m <= months; m++) {
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

    // 부동소수점 오차까지 포함해 마지막 회차에 원리금을 정확히 완납한다.
    if (m === months || payment > remaining + interest) {
      payment = remaining + interest;
      principalPay = remaining;
    }

    remaining = Math.max(0, remaining - principalPay);
    totalInterest += interest;
    totalPayment += payment;

    if (m <= 12) {
      schedule.push({
        month: m,
        principal: Math.round(principalPay * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        payment: Math.round(payment * 100) / 100,
        remainingBalance: Math.round(remaining * 100) / 100,
      });
    }
  }

  return { schedule, totalInterest, totalPayment, maturityBalance: remaining };
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
      maturityBalance: 0,
      rateBasis: 'unavailable',
      rateNote: '상품을 확인할 수 없어 금리도 계산하지 않았습니다.',
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
  let rateBasis: LoanResult['rateBasis'];
  let rateNote: string;

  if (isDidimdol) {
    baseRate = getBaseRate(input.income, input.loanTerm, input.isNewlywedFirstTime);
    if (hasDirectDidimdolRate(input.loanTerm)) {
      rateBasis = 'stored_table';
      rateNote = `${input.loanTerm}년 저장 금리표와 사용자가 선택한 우대 조건을 적용했습니다.`;
    } else {
      rateBasis = 'term_proxy_assumption';
      rateNote = `${input.loanTerm}년 별도 금리값이 저장되어 있지 않아 20년 금리표 값을 계산 가정으로 사용했습니다. 실제 ${input.loanTerm}년 금리가 아닙니다.`;
    }

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
    // 보금자리론, 신생아특례: 개인 적용금리를 알 수 없어 저장 범위 중간값을 가정.
    const range = (product as { rateRange: { min: number; max: number } }).rateRange;
    baseRate = (range.min + range.max) / 2;
    appliedRate = baseRate;
    rateBasis = 'range_midpoint_assumption';
    rateNote = `저장된 금리 범위 ${range.min}~${range.max}%의 단순 중간값을 계산 가정으로 사용했습니다. 개인 적용금리나 공식 대표금리가 아닙니다.`;
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

  // 전 기간 월별 현금흐름으로 총이자·총상환·만기잔액을 함께 검증한다.
  const amortization = projectAmortization(
    loanAmount,
    appliedRate,
    months,
    input.repaymentType,
  );
  const totalInterest = Math.round(amortization.totalInterest * 100) / 100;
  const totalPayment = Math.round(amortization.totalPayment * 100) / 100;
  const maturityBalance = Math.round(amortization.maturityBalance * 100) / 100;

  // DSR 계산 (체증식은 1년차 기준)
  const annualRepayment = monthlyPayment * 12;
  const dsr =
    input.income > 0
      ? Math.round(
          ((annualRepayment + input.existingDebtPayment) / input.income) * 100 * 100
        ) / 100
      : 0;

  if (dsr > 40) {
    rejectReasons.push(`DSR ${dsr}% > 40%: 시뮬레이터의 일반 한도를 초과했습니다.`);
  }

  // DTI 계산 (보조 지표 — 정책대출 통상 한도 60%)
  const dti = calcDti({
    annualRepayment,
    existingDebtInterest: input.existingDebtInterest ?? 0,
    income: input.income,
  });

  const feasible = rejectReasons.length === 0;

  return {
    loanAmount,
    appliedRate: Math.round(appliedRate * 100) / 100,
    baseRate: Math.round(baseRate * 100) / 100,
    discountRate: Math.round(discountRate * 100) / 100,
    monthlyPayment,
    totalInterest,
    totalPayment,
    maturityBalance,
    rateBasis,
    rateNote,
    dsr,
    dti,
    ltvUsed,
    graduatedYears,
    feasible,
    rejectReasons,
    schedule: amortization.schedule,
  };
}

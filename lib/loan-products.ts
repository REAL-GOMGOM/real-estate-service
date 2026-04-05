// 디딤돌 일반 금리 테이블 (2026.04.01 공시)
export const DIDIMDOL_RATE_TABLE = [
  { incomeMax: 2000, rate10: 2.85, rate15: 2.95, rate20: 3.05 },
  { incomeMax: 4000, rate10: 3.20, rate15: 3.30, rate20: 3.40 },
  { incomeMax: 7000, rate10: 3.55, rate15: 3.65, rate20: 3.75 },
  { incomeMax: 8500, rate10: 3.90, rate15: 4.00, rate20: 4.10 },
];

// 디딤돌 생애최초 신혼 금리 테이블
export const DIDIMDOL_NEWLYWED_RATE_TABLE = [
  { incomeMax: 2000, rate10: 2.55, rate15: 2.65, rate20: 2.75 },
  { incomeMax: 4000, rate10: 2.90, rate15: 3.00, rate20: 3.10 },
  { incomeMax: 7000, rate10: 3.25, rate15: 3.35, rate20: 3.45 },
  { incomeMax: 8500, rate10: 3.60, rate15: 3.70, rate20: 3.80 },
];

// 소득(만원) + 대출기간(년) → 기본금리 조회
export function getBaseRate(
  income: number,
  term: number,
  isNewlywedFirstTime: boolean
): number {
  const table = isNewlywedFirstTime
    ? DIDIMDOL_NEWLYWED_RATE_TABLE
    : DIDIMDOL_RATE_TABLE;
  const row = table.find((r) => income <= r.incomeMax) || table[table.length - 1];
  if (term <= 10) return row.rate10;
  if (term <= 15) return row.rate15;
  return row.rate20;
}

// 우대금리 카테고리
export interface DiscountOption {
  id: string;
  label: string;
  rate: number;
  type: 'exclusive' | 'stackable';
  note?: string;
}

// 택1 우대금리 (하나만 선택 가능)
export const EXCLUSIVE_DISCOUNTS: DiscountOption[] = [
  { id: 'child3', label: '다자녀 (3명 이상)', rate: 0.7, type: 'exclusive' },
  { id: 'single_parent', label: '한부모 (소득 6천만↓)', rate: 0.5, type: 'exclusive' },
  { id: 'child2', label: '2자녀', rate: 0.5, type: 'exclusive' },
  { id: 'child1', label: '1자녀', rate: 0.3, type: 'exclusive' },
  { id: 'first_time', label: '생애최초 주택구입', rate: 0.2, type: 'exclusive' },
  { id: 'newlywed', label: '신혼가구', rate: 0.2, type: 'exclusive' },
  { id: 'disabled', label: '장애인가구', rate: 0.2, type: 'exclusive' },
  { id: 'multicultural', label: '다문화가구', rate: 0.2, type: 'exclusive' },
];

// 중복 가능 우대금리 (여러 개 동시 선택)
export const STACKABLE_DISCOUNTS: DiscountOption[] = [
  { id: 'savings_5y', label: '청약저축 5년 이상', rate: 0.3, type: 'stackable' },
  { id: 'savings_10y', label: '청약저축 10년 이상', rate: 0.4, type: 'stackable' },
  { id: 'savings_15y', label: '청약저축 15년 이상', rate: 0.5, type: 'stackable' },
  {
    id: 'e_contract',
    label: '전자계약',
    rate: 0.1,
    type: 'stackable',
    note: '26.12.31까지 한시',
  },
  { id: 'low_amount', label: '대출가능금액 30% 이하 신청', rate: 0.1, type: 'stackable' },
  { id: 'prepay_40', label: '원금 40% 이상 중도상환', rate: 0.2, type: 'stackable' },
  { id: 'local_unsold', label: '지방 준공후 미분양', rate: 0.2, type: 'stackable' },
];

// 최종 우대금리 계산
export function calcTotalDiscount(
  exclusiveId: string | null,
  stackableIds: string[],
  isMultiChild3: boolean
): number {
  const maxDiscount = isMultiChild3 ? 0.7 : 0.5;

  let total = 0;

  if (exclusiveId) {
    const exc = EXCLUSIVE_DISCOUNTS.find((d) => d.id === exclusiveId);
    if (exc) total += exc.rate;
  }

  for (const id of stackableIds) {
    const st = STACKABLE_DISCOUNTS.find((d) => d.id === id);
    if (st) total += st.rate;
  }

  return Math.min(total, maxDiscount);
}

// 최저금리 하한
export const MIN_RATE_GENERAL = 1.5;
export const MIN_RATE_NEWLYWED_FIRST = 1.2;

// 상품 요약 정보
export const LOAN_PRODUCTS = [
  {
    id: 'didimdol',
    name: '디딤돌 대출 (일반)',
    description: '무주택 서민 내집마련 지원',
    maxLoan: { general: 20000, firstTime: 24000, newlywed: 32000 },
    incomeLimit: { general: 6000, firstTime: 7000, newlywed: 8500 },
    housePriceLimit: { general: 50000, newlywed: 60000 },
    ltv: { general: 70, firstTime: 80, firstTimeCapital: 70 },
    dti: 60,
    terms: [10, 15, 20],
    eligibility: ['무주택 세대주', '순자산 5.11억원 이하', 'CB점수 350점 이상'],
  },
  {
    id: 'bogeumjari',
    name: '보금자리론',
    description: '고정금리 장기 주택담보대출',
    rateRange: { min: 4.1, max: 4.4 },
    maxLoan: 50000,
    incomeLimit: 10000,
    housePriceLimit: 60000,
    ltv: 70,
    dti: 60,
    terms: [10, 15, 20, 30, 40, 50],
    eligibility: ['무주택 또는 1주택', '부부합산 연소득 1억원 이하'],
  },
  {
    id: 'baby-loan',
    name: '신생아 특례대출',
    description: '출생 2년 이내 신생아 보유 가구',
    rateRange: { min: 1.8, max: 2.75 },
    maxLoan: 50000,
    incomeLimit: 13000,
    housePriceLimit: 90000,
    ltv: 70,
    dti: 60,
    terms: [10, 15, 20, 30],
    eligibility: [
      '출생 2년 이내 신생아 보유',
      '무주택 세대주',
      '부부합산 1.3억원 이하',
    ],
  },
];

export const LAST_UPDATED = '2026-04-01';

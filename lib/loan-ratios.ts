/**
 * 대출 부담 비율 계산 헬퍼 — DSR / DTI / 상태 분류
 *
 * 정책 출처 (검증일: 2026-05-04):
 * - 금융위원회 가계대출 관리방안 (2026): https://www.fsc.go.kr/
 * - 한국주택금융공사 정책대출 안내: https://www.hf.go.kr/
 *
 * 한국 부동산 대출 규제 현황 (2026.05 기준):
 * - DSR: 현행 심사 dominant 기준 (1금융권 40%, 2금융권 50%)
 * - DTI: 정책대출에서 보조 기준 적용 (디딤돌·보금자리 통상 60%)
 *        시중은행은 DSR 우선이라 DTI 40%는 가이드라인 성격
 *
 * 한도 정책 변경 시 본 모듈 상수 갱신 필요. 분기 1회 web_search 권장.
 *
 * 검증 예시 (테스트 인프라 도입 시 단위 테스트로 이전):
 *   calcDsr({ annualRepayment: 2000, existingDebtPayment: 400, income: 6000 }) → 40
 *   calcDsr({ annualRepayment: 0, existingDebtPayment: 0, income: 0 }) → 0 (income guard)
 *
 *   calcDti({ annualRepayment: 2000, existingDebtInterest: 100, income: 6000 }) → 35
 *   calcDti({ annualRepayment: 2000, existingDebtInterest: 0, income: 6000 }) → 33.33
 *
 *   classifyRatio(35, 60) → 'success' (한도×0.75=45 미만)
 *   classifyRatio(50, 60) → 'warning' (45~60)
 *   classifyRatio(65, 60) → 'danger' (60 초과)
 */

// DTI 한도 — 정책대출 통상 (디딤돌·보금자리·신생아특례)
export const DTI_LIMIT_POLICY = 60;

// DTI 한도 — 시중은행 1금융권 가이드라인 (현행 심사는 DSR 우선)
export const DTI_LIMIT_BANK = 40;

// 한도 대비 주의 임계 (한도×0.75 ~ 한도 사이는 warning)
export const RATIO_WARNING_THRESHOLD = 0.75;

interface DsrInput {
  annualRepayment: number;       // 신규 주담대 연 원리금 (만원)
  existingDebtPayment: number;   // 기존 부채 연 원리금 (만원, 신용대출·학자금 포함)
  income: number;                // 연소득 (만원)
}

interface DtiInput {
  annualRepayment: number;       // 신규 주담대 연 원리금 (만원)
  existingDebtInterest: number;  // 기존 부채 연 이자 (만원, 주담대 외 대출의 이자만)
  income: number;                // 연소득 (만원)
}

/**
 * DSR (총부채원리금상환비율)
 * 분자: 모든 부채의 연 원리금 합산
 * 소수 둘째 자리까지 반올림
 */
export function calcDsr({ annualRepayment, existingDebtPayment, income }: DsrInput): number {
  if (income <= 0) return 0;
  return Math.round(((annualRepayment + existingDebtPayment) / income) * 100 * 100) / 100;
}

/**
 * DTI (총부채상환비율)
 * 분자: 신규 주담대 연 원리금 + 기존 부채 연 이자
 * (기존 주담대 보유자(대환·추가매수)는 별도 안내 필요 — 첫 매수자 시나리오 우선)
 */
export function calcDti({ annualRepayment, existingDebtInterest, income }: DtiInput): number {
  if (income <= 0) return 0;
  return Math.round(((annualRepayment + existingDebtInterest) / income) * 100 * 100) / 100;
}

// 한도 대비 상태 분류 — UI 색상 분기용
export type RatioStatus = 'success' | 'warning' | 'danger';

/**
 * 비율 값과 한도를 비교해 상태 반환
 * - 한도 초과: danger
 * - 한도×0.75 ~ 한도: warning
 * - 한도×0.75 미만: success
 */
export function classifyRatio(value: number, limit: number): RatioStatus {
  if (value > limit) return 'danger';
  if (value >= limit * RATIO_WARNING_THRESHOLD) return 'warning';
  return 'success';
}

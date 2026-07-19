/**
 * 전월세 공유 문자열·식별 헬퍼 — 전월세 대칭 (2026-07-19).
 *
 * 매매(tx-share-text)와 대칭. 전월세 특성 반영:
 * - 전세(월세 0): 보증금 기준 평당·기간 내 최고 보증금 라인 제공
 * - 월세: 보증금/월세 2차원이라 최고가 라인은 생략, 갱신 종전가로 맥락 제공
 */
import { pricePerPyeong, fmtMonthsLabel } from './tx-share-text';
import { isJeonse, fmtRentPrice, type RentTransaction } from './rent-shared';

/** 전월세 계약 건 딥링크 식별자 — (계약일·면적·층·보증금·월세) 조합 */
export function rentTxKey(t: {
  date: string; area: number; floor: number; deposit: number; monthlyRent: number;
}): string {
  return [t.date, t.area, t.floor, t.deposit, t.monthlyRent].join('_');
}

export interface RentPeakLineInput {
  deposit:  number;         // 이 계약 보증금 (만원)
  peak:     number;         // 기간 내 동일유형·면적 최고 보증금 (이 건 포함)
  prevPeak: number | null;  // 이 건 제외 최고 보증금
  months:   number;
  fmt:      (n: number) => string;
}

/**
 * 전세 보증금 기준 최고가 라인 — 기간 캡션 필수 (매매 buildPeakLine 대칭).
 *   경신: "3년 내 최고 보증금 · 종전 6억 +6,000만"
 *   미달: "3년 내 최고 보증금 6.6억 대비 -6,000만"
 */
export function buildRentPeakLine({ deposit, peak, prevPeak, months, fmt }: RentPeakLineInput): string {
  if (peak <= 0 || deposit <= 0) return '';
  const period = fmtMonthsLabel(months);
  if (deposit >= peak) {
    return prevPeak !== null && prevPeak < deposit
      ? `${period} 내 최고 보증금 · 종전 ${fmt(prevPeak)} +${fmt(deposit - prevPeak)}`
      : `${period} 내 최고 보증금`;
  }
  return `${period} 내 최고 보증금 ${fmt(peak)} 대비 -${fmt(peak - deposit)}`;
}

export interface RentTxShareTextInput {
  aptName:  string;
  location: string;
  tx:       Pick<RentTransaction, 'deposit' | 'monthlyRent' | 'area' | 'floor' | 'date' | 'contractType' | 'prevDeposit' | 'prevMonthlyRent'>;
  peakLine: string;              // 전세만 ('' 가능 — 월세는 항상 '')
  fmt:      (n: number) => string;
  fmtDate:  (d: string) => string;
}

/** 전월세 텍스트 공유 본문 — 유형·평당 보증금(전세)·갱신 종전가 포함 */
export function buildRentTxShareText(i: RentTxShareTextInput): string {
  const { tx } = i;
  const jeonse = isJeonse(tx);
  const kind   = jeonse ? '전세' : '월세';
  const py     = Math.round(tx.area / 3.3058);
  let s = `${i.aptName} ${kind} ${fmtRentPrice(tx, i.fmt)} (${tx.area}㎡·${py}평·${tx.floor}층·${i.fmtDate(tx.date)} 계약)`;
  if (jeonse) s += ` · 평당 보증금 ${i.fmt(pricePerPyeong(tx.deposit, tx.area))}`;
  if (i.peakLine) s += ` · ${i.peakLine}`;
  if (tx.contractType === '갱신' && tx.prevDeposit) {
    s += ` · 갱신(종전 ${fmtRentPrice({ deposit: tx.prevDeposit, monthlyRent: tx.prevMonthlyRent ?? 0 }, i.fmt)})`;
  } else if (tx.contractType) {
    s += ` · ${tx.contractType}`;
  }
  return `${s} · ${i.location} — 내집 My.ZIP`;
}

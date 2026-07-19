/**
 * 실거래 공유 문자열·식별 헬퍼 — 공유 강화 (2026-07-19).
 *
 * 카드(캔버스)·텍스트 공유·딥링크가 공용으로 쓰는 순수 함수 (단위 테스트 대상).
 * 원칙: 전고점은 "조회 기간 내" 기준이므로 기간 캡션을 반드시 함께 표기해
 * 역대 전고점으로 오해하지 않게 한다 (신뢰 이슈 방지).
 */

const PY_PER_M2 = 3.3058; // 1평 = 3.3058㎡

/** 12·24·36개월은 년 단위 표기 ("3년"), 그 외 "6개월" */
export function fmtMonthsLabel(months: number): string {
  return months >= 12 && months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}

/**
 * 진짜 평당가 (만원/평).
 * 주의: API 의 pricePerArea 는 ㎡당 값이라 "평당" 표기에 쓰면 3.3배 틀린다
 * (기존 모달 표기 버그) — 표시용은 반드시 이 함수를 쓴다.
 */
export function pricePerPyeong(price: number, areaM2: number): number {
  if (areaM2 <= 0 || price <= 0) return 0;
  return Math.round(price / (areaM2 / PY_PER_M2));
}

export interface PeakLineInput {
  price:    number;         // 이 거래가 (만원)
  peak:     number;         // 조회 기간 내 동일면적 최고가 (만원, 이 거래 포함)
  prevPeak: number | null;  // 이 거래 제외 기간 최고가 (경신 폭 표기용)
  months:   number;         // 조회 기간 (기준 캡션)
  fmt:      (n: number) => string; // fmtPrice 주입
}

/**
 * 전고점 라인 — 항상 기간 캡션 포함.
 *   경신:   "3년 내 최고가 · 종전 14.9억 +0.6억"
 *   미달:   "3년 내 최고 15.5억 대비 -0.4억"
 *   비교불가(단일 거래 등): "3년 내 최고가"
 */
export function buildPeakLine({ price, peak, prevPeak, months, fmt }: PeakLineInput): string {
  if (peak <= 0 || price <= 0) return '';
  const period = fmtMonthsLabel(months);
  if (price >= peak) {
    return prevPeak !== null && prevPeak < price
      ? `${period} 내 최고가 · 종전 ${fmt(prevPeak)} +${fmt(price - prevPeak)}`
      : `${period} 내 최고가`;
  }
  return `${period} 내 최고 ${fmt(peak)} 대비 -${fmt(peak - price)}`;
}

export interface TxShareTextInput {
  aptName:  string;
  location: string;              // "용인시 수지구 성복동"
  price:    number;              // 만원
  areaM2:   number;              // 반올림 ㎡
  floor:    number;
  date:     string;              // YYYY-MM-DD (또는 YYYY-MM)
  peakLine: string;              // buildPeakLine 결과 ('' 가능)
  fmt:      (n: number) => string;
  fmtDate:  (d: string) => string;
}

/** 텍스트 공유 본문 — 평당가·전고점(기간 캡션) 포함 */
export function buildTxShareText(i: TxShareTextInput): string {
  const py    = Math.round(i.areaM2 / PY_PER_M2);
  const perPy = pricePerPyeong(i.price, i.areaM2);
  let s = `${i.aptName} 실거래 ${i.fmt(i.price)} (${i.areaM2}㎡·${py}평·${i.floor}층·${i.fmtDate(i.date)} 계약)`;
  s += ` · 평당 ${i.fmt(perPy)}`;
  if (i.peakLine) s += ` · ${i.peakLine}`;
  return `${s} · ${i.location} — 내집 My.ZIP`;
}

/**
 * 계약 건 딥링크 식별자 — dedupeKey 는 응답에 없으므로 클라이언트가 가진
 * (계약일·면적·층·가격) 조합으로 만든다. 한 단지 안에서 사실상 유일.
 */
export function txKey(t: { date: string; area: number; floor: number; price: number }): string {
  return [t.date, t.area, t.floor, t.price].join('_');
}

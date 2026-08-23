/**
 * 집계 조회 윈도우 해석 — 집계 3종(summary·districts·highlights) 공용.
 *
 * 배경(2026-08-02): 기존 집계가 "당월 계약분" 고정이라 매달 1~5일은
 * 구조적으로 빈 화면이었다("월초 공백"). 기본을 "최근 30일 롤링"으로
 * 바꾸고, 월 지정 조회(YYYYMM)를 열어 지난달 실거래도 볼 수 있게 한다.
 *
 * 날짜는 전부 KST 기준 문자열(YYYY-MM-DD)로 계산한다 — 서버(UTC)에서
 * new Date() 월을 그대로 쓰면 KST 자정~09시 사이에 하루 어긋난다.
 */

export interface AggWindow {
  type: 'rolling30' | 'month';
  /** 포함 하한 (deal_date >= from) */
  from: string;
  /** 배타 상한 (deal_date < to) */
  to: string;
  /** month 타입일 때만 — 'YYYYMM' */
  yyyymm?: string;
}

const KST_OFFSET_MS = 9 * 3600_000;
const ROLLING_DAYS = 30;

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
export function kstTodayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO 날짜 문자열에 일수 가감 (UTC 산술 — DST 없음) */
export function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYYMM' → { from: 월초, to: 익월초 } */
function monthBounds(yyyymm: string): { from: string; to: string } {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(4, 6), 10);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${nextY}-${String(nextM).padStart(2, '0')}-01`,
  };
}

/**
 * window 파라미터 해석.
 *   미지정 · 'rolling30'  → 최근 30일 (KST 오늘 포함)
 *   'YYYYMM'              → 해당 월 (미래 월·형식 오류는 null — 호출부 400 처리)
 */
export function resolveAggWindow(
  param: string | null | undefined,
  now: Date = new Date(),
): AggWindow | null {
  const today = kstTodayIso(now);

  if (!param || param === 'rolling30') {
    return {
      type: 'rolling30',
      from: shiftDays(today, -(ROLLING_DAYS - 1)),
      to: shiftDays(today, 1),
    };
  }

  if (/^\d{6}$/.test(param)) {
    const y = parseInt(param.slice(0, 4), 10);
    const m = parseInt(param.slice(4, 6), 10);
    if (y < 2006 || y > 2100 || m < 1 || m > 12) return null;
    const bounds = monthBounds(param);
    // 미래 월 거부 — 당월은 허용
    if (bounds.from > today) return null;
    return { type: 'month', yyyymm: param, ...bounds };
  }

  return null;
}

/** 현재 KST 기준 'YYYYMM' (프론트 호환 필드용) */
export function kstCurrentYyyymm(now: Date = new Date()): string {
  return kstTodayIso(now).slice(0, 7).replace('-', '');
}

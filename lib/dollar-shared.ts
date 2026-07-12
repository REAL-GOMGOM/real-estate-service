/**
 * 실질 가치 비교 API 순수 로직 — 2026-07-12 (최신 시세 + 평형 지원)
 *
 * 배경 피드백: ① "시세가 최신이 아니다" — 가격 기준이 항상 Q4(10~12월)라
 * 올해를 선택해도 미래 분기라 비거나 작년 4분기가 최신이었다.
 * ② 전 평형 통합 평균이라 평형 스펙트럼 넓은 단지는 수치가 무의미했다.
 *
 * 정책:
 * - 과거 연도: Q4 평균 (연말 대표 시세 — 기존과 동일)
 * - 현재 연도: 최근 신고 3개월 평균 (연중 시세) + isYtd 라벨
 * - 평형: 전용면적 반올림(㎡) 그룹, area 파라미터로 필터
 */

export interface DealRow {
  price: number;   // 만원
  area:  number;   // 전용 ㎡ (원본)
}

/** 연도별 조회 대상 월. 현재 연도면 최근 3개월(당월 포함), 과거면 Q4. */
export function monthsForYear(year: number, now: Date = new Date()): string[] {
  const curYear = now.getFullYear();
  if (year < curYear) return ['10', '11', '12'];
  // 현재(또는 미래 입력 방어) 연도 — 당월부터 최대 3개월 역순, 연초엔 1월까지만
  const m = year === curYear ? now.getMonth() + 1 : 12;
  const months: string[] = [];
  for (let mm = m; mm >= Math.max(1, m - 2); mm--) {
    months.push(String(mm).padStart(2, '0'));
  }
  return months;
}

/** 폴백 조회 월 — 기본 월을 제외한 해당 연도의 나머지 전체 */
export function fallbackMonths(year: number, now: Date = new Date()): string[] {
  const primary = new Set(monthsForYear(year, now));
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const months: string[] = [];
  for (let mm = 1; mm <= maxMonth; mm++) {
    const s = String(mm).padStart(2, '0');
    if (!primary.has(s)) months.push(s);
  }
  return months;
}

/** 평형(반올림 ㎡) 필터 — area null 이면 전체 */
export function filterByArea(deals: DealRow[], area: number | null): number[] {
  if (area === null) return deals.map((d) => d.price);
  return deals.filter((d) => Math.round(d.area) === area).map((d) => d.price);
}

/** 등장 평형 목록 (반올림 ㎡, 오름차순) + 거래 수 */
export function availableAreas(deals: DealRow[]): { area: number; count: number }[] {
  const map = new Map<number, number>();
  for (const d of deals) {
    if (d.area <= 0) continue;
    const a = Math.round(d.area);
    map.set(a, (map.get(a) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => a.area - b.area);
}

export function averagePrice(prices: number[]): number | null {
  if (prices.length === 0) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

/**
 * 실거래 조회 공용 타입 — 사이클 W (아실형 개편)
 *
 * /api/transactions 응답 구조와 1:1. date 는 YYYY-MM-DD (일 단위,
 * 구버전 캐시 데이터는 YYYY-MM 일 수 있어 표기 시 방어 처리).
 */

export interface Transaction {
  aptName:      string;
  district:     string;
  dong?:        string | null;
  area:         number;
  floor:        number;
  price:        number;        // 만원
  pricePerArea: number;        // 만원/평
  date:         string;        // YYYY-MM-DD (구캐시: YYYY-MM)
  buildYear?:   number | null;
}

export interface AptGroup {
  id:           string;
  name:         string;
  district:     string;
  dong?:        string | null;
  buildYear?:   number | null;
  households?:  number | null;
  areas:        number[];
  transactions: Transaction[];
}

export interface DistrictStat {
  district: string;
  count:    number;
  newHighs: number;
}

// ── 공용 헬퍼 ────────────────────────────────────

export function fmtPrice(manwon: number): string {
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    // 12.0억 → 12억
    const s = eok.toFixed(1).replace(/\.0$/, '');
    return `${s}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

/** 아실형 상세 가격 표기 — 25200 → "2억 5,200만", 9100 → "9,100만" */
export function fmtPriceFull(manwon: number): string {
  if (manwon >= 10000) {
    const eok  = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

/** 아실형 계약일 표기 — 26.06.26 (일 정보 없으면 26.06) */
export function fmtContractDate(date: string): string {
  const [y, m, d] = date.split('-');
  const yy = y?.slice(2) ?? '';
  return d ? `${yy}.${m}.${d}` : `${yy}.${m}`;
}

/** 신고가 판정 — 동일 면적(±6㎡) 내 최신 거래가 기간 최고가 */
export function detectNewHigh(apt: AptGroup): boolean {
  if (apt.transactions.length < 2) return false;
  const sorted = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const same   = apt.transactions.filter((t) => Math.abs(t.area - latest.area) <= 6);
  return same.length > 1 && latest.price >= Math.max(...same.map((t) => t.price));
}

/**
 * 스파크라인 시리즈 — 아실 스타일 (개별 거래를 시간축 비례로).
 * t 는 0~1 정규화된 계약일 위치. 거래 밀집·공백이 그대로 드러나
 * 실제 시세 차트처럼 보인다. 포인트가 적으면 (5개 미만) 곡선 스무딩 권장.
 */
export interface SparkPoint { t: number; price: number }

export function sparkSeries(apt: AptGroup): { points: SparkPoint[]; rising: boolean } | null {
  const repArea = representativeArea(apt);
  const txs = apt.transactions
    .filter((tr) => Math.abs(tr.area - repArea) <= 6)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (txs.length < 2) return null;

  const toTime = (date: string): number => {
    const [y, m, d] = date.split('-').map((v) => parseInt(v));
    return new Date(y, (m ?? 1) - 1, d ?? 15).getTime();
  };

  const t0 = toTime(txs[0].date);
  const tN = toTime(txs[txs.length - 1].date);
  const span = tN - t0 || 1;

  const points = txs.map((tr) => ({
    t: (toTime(tr.date) - t0) / span,
    price: tr.price,
  }));

  return { points, rising: points[points.length - 1].price >= points[0].price };
}

/** 거래 최다 대표 면적 (카드 라인차트·평균가 기준) */
export function representativeArea(apt: AptGroup): number {
  const counts = new Map<number, number>();
  apt.transactions.forEach((t) => counts.set(t.area, (counts.get(t.area) ?? 0) + 1));
  let best = apt.transactions[0]?.area ?? 0;
  let bestCount = 0;
  counts.forEach((c, area) => {
    if (c > bestCount) { best = area; bestCount = c; }
  });
  return best;
}

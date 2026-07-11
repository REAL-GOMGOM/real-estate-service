/**
 * 단지 실거래 요약 — 대출 시뮬레이터 단지 검색용 (2026-07-11).
 *
 * 배경: 기존에는 단지 전체 평형을 통합 평균해서 "최근 3개월 평균"으로만
 * 표기했다. 평형 스펙트럼이 넓은 단지(잠실엘스 등)는 통합 평균이 무의미하고,
 * "최근"이라는 표기도 막연하다는 피드백 반영:
 * - 평형(전용 ㎡ 반올림)별 그룹 평균 제공 → UI에서 평형 선택
 * - 실제 거래 월 범위 라벨 제공 ("26.04~26.07")
 * - 기본 선택은 최다 거래 평형 (동률이면 국평 84㎡ 근접 우선)
 */

export interface AptAreaGroup {
  /** 전용면적 반올림 ㎡ */
  area: number;
  /** 공급 환산 아님 — 전용 기준 평 (참고 표기용) */
  pyeong: number;
  count: number;
  /** 평균가 (만원) */
  avg: number;
}

export interface AptPriceSummary {
  /** 거래 월 범위 라벨 — "26.04~26.07" / 단월이면 "26.07" */
  periodLabel: string;
  totalCount: number;
  totalAvg: number;
  /** 면적 오름차순 */
  groups: AptAreaGroup[];
  /** 기본 적용 그룹 — 최다 거래, 동률 시 84㎡ 근접 */
  best: AptAreaGroup;
}

interface TxLike {
  area: number;
  price: number;
  date: string;
}

const NATIONAL_STANDARD_AREA = 84; // 국평 (전용 84㎡)
const PYEONG_PER_SQM = 3.305785;

/** "2026-07-09" / "20260709" / "2026.07.09" → "26.07". 파싱 불가 시 null */
function toYearMonthLabel(date: string): string | null {
  const digits = date.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const yy = digits.slice(2, 4);
  const mm = digits.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  return `${yy}.${mm}`;
}

export function summarizeAptTxns(txns: TxLike[]): AptPriceSummary | null {
  const valid = txns.filter((t) => t.price > 0 && t.area > 0);
  if (valid.length === 0) return null;

  // 평형 그룹핑 (전용 ㎡ 반올림)
  const byArea = new Map<number, { sum: number; count: number }>();
  let totalSum = 0;
  for (const t of valid) {
    const a = Math.round(t.area);
    const g = byArea.get(a) ?? { sum: 0, count: 0 };
    g.sum += t.price;
    g.count += 1;
    byArea.set(a, g);
    totalSum += t.price;
  }

  const groups: AptAreaGroup[] = [...byArea.entries()]
    .map(([area, g]) => ({
      area,
      pyeong: Math.round(area / PYEONG_PER_SQM),
      count: g.count,
      avg: Math.round(g.sum / g.count),
    }))
    .sort((a, b) => a.area - b.area);

  // 최다 거래 → 동률이면 국평 근접 → 그래도 동률이면 작은 면적 (결정론)
  const best = [...groups].sort(
    (a, b) =>
      b.count - a.count ||
      Math.abs(a.area - NATIONAL_STANDARD_AREA) - Math.abs(b.area - NATIONAL_STANDARD_AREA) ||
      a.area - b.area,
  )[0];

  // 거래 월 범위
  const months = valid
    .map((t) => toYearMonthLabel(t.date))
    .filter((m): m is string => m !== null)
    .sort();
  let periodLabel = "최근 3개월"; // 날짜 파싱 전부 실패 시 기존 표기 유지
  if (months.length > 0) {
    const first = months[0];
    const last = months[months.length - 1];
    periodLabel = first === last ? first : `${first}~${last}`;
  }

  return {
    periodLabel,
    totalCount: valid.length,
    totalAvg: Math.round(totalSum / valid.length),
    groups,
    best,
  };
}

/**
 * 시도별 요약 신고가 집계 — 신고가 정확도 수정.
 *
 * "신고가"는 동일 단지+면적에서 직전 최고가를 넘어선 거래를 뜻한다.
 * 최초 거래(해당 집계 창에 1건뿐 — 비교 대상 없음)는 제외한다.
 *
 * 기존 버그: 단지별 { max, latest } 로 두고 latest >= max 를 세어,
 * 거래가 1건인 단지(대다수)도 latest == max 라 전부 신고가로 잡혔다
 * (당월 대부분 단지가 1건 → 신고가 비율이 비현실적으로 ~76%까지 부풀었다).
 */

export interface SummaryDeal {
  aptName: string;
  area:    number;   // 전용면적 ㎡ (반올림 전)
  price:   number;   // 거래가 (만원)
  date:    string;   // 계약일 YYYYMMDD (최신 판정용)
}

/**
 * 신고가 건수 — 동일 단지+면적(반올림) 그룹에서 거래가 2건 이상이고,
 * 날짜상 최신 거래가가 그 이전 모든 거래가를 "초과"할 때만 1건으로 센다.
 * (최초 거래 제외 · 직전 최고가 경신 기준 · XML 나열 순서와 무관하게 날짜로 판정)
 */
export function countNewHighs(deals: SummaryDeal[]): number {
  const byApt = new Map<string, { price: number; date: string }[]>();
  for (const d of deals) {
    if (!d.aptName || !d.price || !d.area) continue;
    const key = `${d.aptName}-${Math.round(d.area)}`;
    let arr = byApt.get(key);
    if (!arr) { arr = []; byApt.set(key, arr); }
    arr.push({ price: d.price, date: d.date });
  }

  let newHighs = 0;
  for (const txs of byApt.values()) {
    if (txs.length < 2) continue;  // 최초 거래 제외 — 비교 대상이 없음
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    let priorMax = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].price > priorMax) priorMax = sorted[i].price;
    }
    if (latest.price > priorMax) newHighs++;  // 이전 최고가를 넘어선 신고가
  }
  return newHighs;
}

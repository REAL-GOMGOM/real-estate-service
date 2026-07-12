/**
 * 실질 가치 비교(/dollar) 공유 로직 — 해석 문장 + 공유 텍스트 (2026-07-12)
 *
 * 배경: 자산별 퍼센트 표만으로는 "그래서 뭐?"가 전달되지 않는다는 피드백.
 * 숫자 조합을 사람이 읽는 한 줄 결론으로 변환하고(결정론적 템플릿, LLM 미사용),
 * 카톡/SNS 붙여넣기용 텍스트를 생성한다. 이미지 카드는 lib/share-image.ts 담당.
 */

export interface RealValueCardStats {
  aptName: string;
  district: string;
  baseYear: number;
  compareYear: number;
  /** 변동률(%) — 계산 불가 시 null */
  krwPct: number | null;
  usdPct: number | null;
  btcPct: number | null;
  goldPct: number | null;
  /** 표시용 포맷 값 (공유 텍스트에 그대로 사용) — 없으면 해당 행 생략 */
  krwBase?: string;
  krwCompare?: string;
  usdBase?: string;
  usdCompare?: string;
  btcBase?: string;
  btcCompare?: string;
  goldBase?: string;
  goldCompare?: string;
}

const fmtPct = (p: number) => `${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(1)}%`;

/**
 * 카드 하단 해석 문장. 데이터 부족 시 null (호출부에서 행 생략).
 *
 * 우선순위: "원화 상승 + 실물(금/BTC) 하락" 조합이 이 페이지의 핵심 메시지라
 * 가장 먼저 매칭한다.
 */
export function buildRealValueInsight(s: RealValueCardStats): string | null {
  const { krwPct: k, usdPct: u, btcPct: b, goldPct: g } = s;
  if (k === null) return null;

  const years = s.compareYear - s.baseYear;
  const kTxt = `${Math.abs(k).toFixed(1)}%`;

  if (k >= 0) {
    // 원화 상승 — 실물 기준과 비교
    const drops: string[] = [];
    if (g !== null && g < 0) drops.push(`금으로 재면 ${Math.abs(g).toFixed(1)}%`);
    if (b !== null && b < 0) drops.push(`비트코인으로 재면 ${Math.abs(b).toFixed(1)}%`);

    if (drops.length > 0) {
      return `${years}년간 원화로는 ${kTxt} 올랐지만, ${drops.join(', ')} 오히려 줄었습니다. 상승분의 일부는 화폐 가치 하락분입니다.`;
    }
    if (g !== null && g >= 0 && u !== null && u >= 0) {
      return `${years}년간 원화·달러·금 모든 기준에서 가치가 올랐습니다. 화폐 착시가 아닌 실질 상승입니다.`;
    }
    if (u !== null && u < 0) {
      return `${years}년간 원화로는 ${kTxt} 올랐지만 달러 기준으로는 ${Math.abs(u).toFixed(1)}% 낮아졌습니다. 원화 약세(환율 상승)의 영향입니다.`;
    }
    return `${years}년간 원화 기준 ${kTxt} 상승했습니다.`;
  }

  // 원화 하락
  const worse: string[] = [];
  if (g !== null && g < k) worse.push('금');
  if (u !== null && u < k) worse.push('달러');
  if (worse.length > 0) {
    return `${years}년간 원화로 ${kTxt} 내렸고, ${worse.join('·')} 기준으로는 하락 폭이 더 큽니다.`;
  }
  return `${years}년간 원화 기준 ${kTxt} 하락했습니다.`;
}

/** 카톡/SNS 붙여넣기용 공유 텍스트 (플레인, 하단 링크 1개) */
export function buildRealValueShareText(s: RealValueCardStats): string {
  const lines: string[] = [
    `🏠 ${s.aptName} 실질 가치 (${s.baseYear}→${s.compareYear})`,
    '',
  ];
  const row = (icon: string, label: string, base?: string, compare?: string, pct?: number | null) => {
    if (!base || !compare) return;
    const badge = pct !== null && pct !== undefined ? ` (${fmtPct(pct)})` : '';
    lines.push(`${icon} ${label}  ${base} → ${compare}${badge}`);
  };
  row('₩', '원화', s.krwBase, s.krwCompare, s.krwPct);
  row('$', '달러', s.usdBase, s.usdCompare, s.usdPct);
  row('₿', '비트', s.btcBase, s.btcCompare, s.btcPct);
  row('🥇', '금', s.goldBase, s.goldCompare, s.goldPct);

  const insight = buildRealValueInsight(s);
  if (insight) {
    lines.push('', `💡 ${insight}`);
  }
  lines.push('', '📊 실질 가치 비교 → https://www.naezipkorea.com/dollar');
  return lines.join('\n');
}

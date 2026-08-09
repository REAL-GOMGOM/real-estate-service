export function getScoreColor(score: number): string {
  if (score <= 1.9) return '#22C55E';
  if (score <= 2.9) return '#86EFAC';
  if (score <= 3.9) return '#F59E0B';
  return '#EF4444';
}

export function getScoreBgColor(score: number): string {
  if (score <= 1.9) return 'rgba(34, 197, 94, 0.14)';
  if (score <= 2.9) return 'rgba(134, 239, 172, 0.1)';
  if (score <= 3.9) return 'rgba(245, 158, 11, 0.14)';
  return 'rgba(239, 68, 68, 0.14)';
}

/** 공개 입지 점수 표기 — 원척도 1.00(최상)~5.00(최하). */
export function formatLocationScore(score: number): string {
  return score.toFixed(2);
}

/**
 * 원점수를 시각화 막대 너비로만 변환한다.
 * 반환값은 공개 점수가 아니며 화면에서 LOCATION SCORE로 표시하면 안 된다.
 */
export function scoreToQualityPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(((5 - score) / 4) * 100)));
}

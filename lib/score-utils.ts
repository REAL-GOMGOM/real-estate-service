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

export function formatKoreanPrice(
  won: number,
  options: { compact?: boolean } = {},
): string {
  if (!won || won <= 0) return '—';
  const { compact = false } = options;
  const uk = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);

  if (compact) {
    if (uk >= 10000) {
      const jo = Math.floor(uk / 10000);
      const remainUk = uk % 10000;
      if (remainUk === 0) return `${jo}조`;
      return `${jo}조 ${(remainUk / 10000 * 10000 / 10000).toFixed(1)}억`.replace(/\.0억$/, '억');
    }
    if (uk > 0) {
      const decimal = man > 0 ? (man / 10000).toFixed(1) : '';
      if (decimal && decimal !== '0.0') {
        return `${uk}.${decimal.split('.')[1]}억`;
      }
      return `${uk}억`;
    }
    if (man > 0) return `${man.toLocaleString()}만`;
    return '0원';
  }

  if (uk >= 10000) {
    const jo = Math.floor(uk / 10000);
    const remainUk = uk % 10000;
    if (remainUk === 0 && man === 0) return `${jo}조`;
    if (man === 0) return `${jo}조 ${remainUk.toLocaleString()}억`;
    return `${jo}조 ${remainUk.toLocaleString()}억 ${man.toLocaleString()}만원`;
  }
  if (uk > 0 && man > 0) return `${uk.toLocaleString()}억 ${man.toLocaleString()}만원`;
  if (uk > 0) return `${uk.toLocaleString()}억`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return '0원';
}

export function formatPercent(ratio: number): string {
  const sign = ratio >= 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(1)}%`;
}

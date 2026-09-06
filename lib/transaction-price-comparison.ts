export interface PriceTransaction {
  date: string;
  area: number;
  price: number;
}

export interface TransactionPriceComparison<T extends PriceTransaction> {
  target: T;
  /** Valid, similar-area transactions no later than the target; newest first. */
  sameArea: T[];
  /** Only contracts known to predate the target; newest first. */
  prior: T[];
  priorPeak: number | null;
  priorPeakTransaction: T | null;
  periodPeak: number;
  /** Null when the preceding contract date has multiple different prices. */
  previous: T | null;
  state: 'insufficient' | 'equal' | 'new-high' | 'below';
  gapToPeak: number | null;
}

/** A month-only legacy date covers the whole month, not an invented contract day. */
function dateBounds(date: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const start = Date.UTC(year, month - 1, day);
  const parsed = new Date(start);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { start, end: match[3] ? start : Date.UTC(year, month, 0) };
}

export function isComparablePriceTransaction(transaction: PriceTransaction): boolean {
  return Number.isFinite(transaction.area) && transaction.area > 0
    && Number.isFinite(transaction.price) && transaction.price > 0
    && dateBounds(transaction.date) !== null;
}

/**
 * Compare one contract only with the supplied window, in the existing ±6㎡ cohort.
 * Same-day records may set the window maximum, but never establish a prior high.
 */
export function analyzeTransactionPrice<T extends PriceTransaction>(
  transactions: readonly T[],
  target?: T,
): TransactionPriceComparison<T> | null {
  const valid = transactions.filter(isComparablePriceTransaction)
    .sort((a, b) => b.date.localeCompare(a.date));
  const selected = target ?? valid[0];
  if (!selected || !isComparablePriceTransaction(selected)) return null;
  const selectedBounds = dateBounds(selected.date)!;
  // A month-only record cannot establish a peak before that whole month ends.
  const sameArea = valid.filter((transaction) =>
    Math.abs(transaction.area - selected.area) <= 6
    && transaction.date <= selected.date
    && dateBounds(transaction.date)!.end <= selectedBounds.end,
  );
  const prior = sameArea.filter((transaction) => dateBounds(transaction.date)!.end < selectedBounds.start);
  const priorPeakTransaction = prior.reduce<T | null>(
    (peak, transaction) => !peak || transaction.price > peak.price ? transaction : peak,
    null,
  );
  const priorPeak = priorPeakTransaction?.price ?? null;
  const periodPeak = sameArea.reduce((peak, transaction) => Math.max(peak, transaction.price), selected.price);
  const previousDate = prior[0]?.date;
  const previousCandidates = previousDate ? prior.filter((transaction) => transaction.date === previousDate) : [];
  const previous = previousCandidates.length > 0 && previousCandidates.every((transaction) => transaction.price === previousCandidates[0].price)
    ? previousCandidates[0]
    : null;
  // Callers may pass a cloned target. Exclude one matching self record instead
  // of treating it as an equal-price peer; additional matches remain peers.
  let selectedIndex = sameArea.indexOf(selected);
  if (selectedIndex < 0) {
    selectedIndex = sameArea.findIndex((transaction) => transaction.date === selected.date
      && transaction.area === selected.area && transaction.price === selected.price);
  }
  const hasSameDateEqual = sameArea.some((transaction, index) => index !== selectedIndex
    && transaction.date === selected.date && transaction.price === selected.price);
  const state = priorPeak === null ? 'insufficient'
    : selected.price < periodPeak ? 'below'
    : selected.price === priorPeak || hasSameDateEqual ? 'equal'
    : 'new-high';

  return {
    target: selected, sameArea, prior, priorPeak, priorPeakTransaction, periodPeak, previous, state,
    gapToPeak: priorPeak === null ? null : Math.max(0, periodPeak - selected.price),
  };
}

/** Shared wording for card, detail and share output; never implies an all-time high. */
export function formatTransactionComparisonLine<T extends PriceTransaction>(
  comparison: TransactionPriceComparison<T> | null,
  months: number,
  fmt: (price: number) => string,
): string {
  const period = months >= 12 && months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
  if (!comparison || comparison.state === 'insufficient') return `${period} 비교 거래 부족`;
  if (comparison.state === 'equal') return `${period} 내 최고가와 같음`;
  if (comparison.state === 'new-high') {
    return `${period} 내 최고가 · 종전 ${fmt(comparison.priorPeak!)} +${fmt(comparison.target.price - comparison.priorPeak!)}`;
  }
  return `${period} 내 최고 ${fmt(comparison.periodPeak)} 대비 -${fmt(comparison.gapToPeak!)}`;
}

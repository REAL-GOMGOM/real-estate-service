/** Provenance from the successful data response, never the visitor's clock. */
export interface TransactionFreshness {
  kind: 'snapshot' | 'aggregate';
  at: string;
}

export interface TransactionFreshnessResult {
  requestKey: string;
  status: 'loading' | 'ready' | 'error';
  value?: TransactionFreshness | null;
}

function timestamp(value: unknown, now: number): string | null {
  // Require a timezone, valid calendar date and time. Date.parse alone normalizes
  // impossible dates (e.g. February 30) and accepts ambiguous date-only strings.
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now + 5 * 60_000) return null;
  const iso = new Date(parsed).toISOString();
  return iso.slice(0, 19) === value.slice(0, 19) ? iso : null;
}

export function readTransactionFreshness(
  headers: Pick<Headers, 'get'> | undefined,
  options: { aggregateUpdatedAt?: unknown; now?: number } = {},
): TransactionFreshness | null {
  const now = options.now ?? Date.now();
  if (headers?.get('X-Naezip-Data-Source') === 'snapshot') {
    const at = timestamp(headers.get('X-Naezip-Snapshot-Generated-At'), now);
    return at ? { kind: 'snapshot', at } : null;
  }
  // Non-snapshot summary.updatedAt is query/aggregation time, NOT collection time.
  const at = timestamp(options.aggregateUpdatedAt, now);
  return at ? { kind: 'aggregate', at } : null;
}

export function transactionFreshnessLabel(value: TransactionFreshness): string {
  const kst = new Date(Date.parse(value.at) + 9 * 60 * 60_000).toISOString();
  const date = kst.slice(0, 10).replaceAll('-', '.');
  return `${value.kind === 'snapshot' ? '데이터 기준' : '집계 생성'} ${date} ${kst.slice(11, 16)} (한국시간)`;
}

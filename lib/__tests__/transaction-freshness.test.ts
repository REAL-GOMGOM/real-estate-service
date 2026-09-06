import { describe, expect, it } from 'vitest';
import { readTransactionFreshness, transactionFreshnessLabel } from '../transaction-freshness';

const now = Date.parse('2026-09-06T00:00:00Z');
const snapshotHeaders = (at: string) => new Headers({
  'X-Naezip-Data-Source': 'snapshot',
  'X-Naezip-Snapshot-Generated-At': at,
});

describe('transaction freshness provenance', () => {
  it('shows the response snapshot timestamp in KST, not the visit time or browser timezone', () => {
    const result = readTransactionFreshness(snapshotHeaders('2026-09-04T20:17:00Z'), { now });
    expect(result).toEqual({ kind: 'snapshot', at: '2026-09-04T20:17:00.000Z' });
    expect(transactionFreshnessLabel(result!)).toBe('데이터 기준 2026.09.05 05:17 (한국시간)');
  });

  it.each(['', 'not-a-date', '2026-09-01', '2026-09-01T00:00:00', '2026-02-30T00:00:00Z', '2026-09-06T05:00:00Z'])(
    'does not present an invalid or future timestamp as current: %s', (at) => {
      expect(readTransactionFreshness(snapshotHeaders(at), { now, aggregateUpdatedAt: '2026-09-06T00:00:00Z' })).toBeNull();
    },
  );

  it('missing metadata stays unknown, including cached/live detail responses', () => {
    expect(readTransactionFreshness(undefined, { now })).toBeNull();
    expect(readTransactionFreshness(new Headers(), { now })).toBeNull();
  });

  it('does not mistake aggregation generation time for collection time', () => {
    const result = readTransactionFreshness(new Headers(), { now, aggregateUpdatedAt: '2026-09-05T20:00:00Z' });
    expect(transactionFreshnessLabel(result!)).toBe('집계 생성 2026.09.06 05:00 (한국시간)');
  });

  it('prefers snapshot provenance over query generation time', () => {
    expect(readTransactionFreshness(snapshotHeaders('2026-09-04T20:17:00Z'), {
      now, aggregateUpdatedAt: '2026-09-06T00:00:00Z',
    })?.at).toBe('2026-09-04T20:17:00.000Z');
  });

  it('normalizes KST year rollover correctly', () => {
    expect(transactionFreshnessLabel({ kind: 'snapshot', at: '2025-12-31T15:00:00Z' }))
      .toBe('데이터 기준 2026.01.01 00:00 (한국시간)');
  });
});

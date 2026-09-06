import { describe, expect, it } from 'vitest';
import {
  analyzeTransactionPrice,
  formatTransactionComparisonLine,
  isComparablePriceTransaction,
  type PriceTransaction,
} from '../transaction-price-comparison';

function tx(overrides: Partial<PriceTransaction> = {}): PriceTransaction {
  return { date: '2026-06-15', area: 84, price: 120000, ...overrides };
}

describe('analyzeTransactionPrice', () => {
  it('anchors the comparison to the latest transaction, not the majority area', () => {
    const previousSmall = tx({ date: '2026-04-01', area: 59, price: 70000 });
    const latestSmall = tx({ area: 59, price: 80000 });
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-01-01', price: 180000 }),
      tx({ date: '2026-02-01', price: 190000 }),
      tx({ date: '2026-03-01', price: 200000 }),
      previousSmall,
      latestSmall,
    ])!;

    expect(comparison.target).toBe(latestSmall);
    expect(comparison.sameArea).toEqual([latestSmall, previousSmall]);
    expect(comparison.priorPeak).toBe(70000);
    expect(comparison.periodPeak).toBe(80000);
    expect(comparison.state).toBe('new-high');
  });

  it('includes both ±6㎡ boundaries without re-centering on the most frequent peer area', () => {
    const lower = tx({ date: '2026-03-01', area: 78, price: 90000 });
    const lowerAgain = tx({ date: '2026-04-01', area: 78, price: 95000 });
    const upper = tx({ date: '2026-05-01', area: 90, price: 110000 });
    const selected = tx();
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-01-01', area: 77.99, price: 300000 }),
      tx({ date: '2026-02-01', area: 90.01, price: 400000 }),
      lower, lowerAgain, upper, selected,
    ])!;

    expect(comparison.sameArea).toEqual([selected, upper, lowerAgain, lower]);
    expect(comparison.priorPeak).toBe(110000);
    expect(comparison.priorPeakTransaction).toBe(upper);
  });

  it('only treats strictly earlier contract dates as prior transactions', () => {
    const earlier = tx({ date: '2026-06-14', price: 100000 });
    const sameDay = tx({ price: 110000 });
    const selected = tx();
    const comparison = analyzeTransactionPrice([sameDay, earlier, selected], selected)!;

    expect(comparison.sameArea).toContain(sameDay);
    expect(comparison.prior).toEqual([earlier]);
    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.previous).toBe(earlier);
    expect(comparison.state).toBe('new-high');
  });

  it('reports insufficient comparison for a single transaction', () => {
    const selected = tx();
    expect(analyzeTransactionPrice([selected])).toMatchObject({
      target: selected,
      sameArea: [selected],
      prior: [],
      priorPeak: null,
      priorPeakTransaction: null,
      periodPeak: selected.price,
      previous: null,
      state: 'insufficient',
      gapToPeak: null,
    });
  });

  it('does not treat same-day transactions alone as sufficient prior comparison', () => {
    const selected = tx();
    const comparison = analyzeTransactionPrice([
      tx({ price: 100000 }), selected, tx({ price: 140000 }),
    ], selected)!;

    expect(comparison.prior).toEqual([]);
    expect(comparison.periodPeak).toBe(140000);
    expect(comparison.state).toBe('insufficient');
    expect(comparison.gapToPeak).toBeNull();
  });

  it.each([
    { currentPrice: 100000, expectedState: 'equal', expectedPeak: 100000, expectedGap: 0 },
    { currentPrice: 120000, expectedState: 'new-high', expectedPeak: 120000, expectedGap: 0 },
    { currentPrice: 80000, expectedState: 'below', expectedPeak: 100000, expectedGap: 20000 },
  ] as const)('classifies $expectedState against a genuine prior high', ({ currentPrice, expectedState, expectedPeak, expectedGap }) => {
    const earlier = tx({ date: '2026-05-01', price: 100000 });
    const comparison = analyzeTransactionPrice([earlier, tx({ price: currentPrice })])!;

    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.priorPeakTransaction).toBe(earlier);
    expect(comparison.periodPeak).toBe(expectedPeak);
    expect(comparison.state).toBe(expectedState);
    expect(comparison.gapToPeak).toBe(expectedGap);
  });

  it('excludes future transactions when explicitly analyzing an older selected contract', () => {
    const earlier = tx({ date: '2026-03-01', price: 100000 });
    const selected = tx({ date: '2026-04-01', price: 110000 });
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 300000 }),
      selected,
      earlier,
    ], selected)!;

    expect(comparison.target).toBe(selected);
    expect(comparison.sameArea).toEqual([selected, earlier]);
    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.periodPeak).toBe(110000);
    expect(comparison.state).toBe('new-high');
  });

  it('keeps the latest-price delta unknown when the previous date has mixed prices', () => {
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 100000 }),
      tx({ date: '2026-05-01', price: 110000 }),
      tx({ date: '2026-04-01', price: 90000 }),
      tx(),
    ])!;

    expect(comparison.priorPeak).toBe(110000);
    expect(comparison.previous).toBeNull();
    expect(comparison.state).toBe('new-high');
  });

  it('allows a previous-price delta when every transaction on the preceding date has the same price', () => {
    const previous = tx({ date: '2026-05-01', price: 100000 });
    const comparison = analyzeTransactionPrice([
      previous,
      tx({ date: '2026-05-01', area: 85, price: 100000 }),
      tx(),
    ])!;

    expect(comparison.previous).toBe(previous);
  });

  it('includes a higher same-day transaction in the period peak but not the prior peak', () => {
    const selected = tx();
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 100000 }),
      selected,
      tx({ price: 140000 }),
    ], selected)!;

    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.periodPeak).toBe(140000);
    expect(comparison.state).toBe('below');
    expect(comparison.gapToPeak).toBe(20000);
  });

  it('conservatively reports equality when another same-day transaction has the same price', () => {
    const selected = tx();
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 100000 }),
      selected,
      tx({ area: 85 }),
    ], selected)!;

    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.state).toBe('equal');
    expect(comparison.gapToPeak).toBe(0);
  });

  it('produces the same comparison for a target clone without treating its own record as a tied peer', () => {
    const selected = tx();
    const transactions = [tx({ date: '2026-05-01', price: 100000 }), selected];
    const originalComparison = analyzeTransactionPrice(transactions, selected)!;
    const clonedComparison = analyzeTransactionPrice(transactions, { ...selected })!;

    expect(originalComparison.state).toBe('new-high');
    expect(clonedComparison).toEqual(originalComparison);
  });

  it('preserves a genuine same-day equal peer when the target is cloned and both records share a tuple', () => {
    const selected = tx();
    const sameDayPeer = tx();
    const transactions = [
      tx({ date: '2026-05-01', price: 100000 }), selected, sameDayPeer,
    ];
    const originalComparison = analyzeTransactionPrice(transactions, selected)!;
    const clonedComparison = analyzeTransactionPrice(transactions, { ...selected })!;

    expect(originalComparison.state).toBe('equal');
    expect(clonedComparison).toEqual(originalComparison);
    expect(clonedComparison.sameArea).toHaveLength(3);
  });

  it('does not invent chronology between a month-only record and a known day in that month', () => {
    const selected = tx();
    const overlapping = tx({ date: '2026-06', price: 100000 });
    const comparison = analyzeTransactionPrice([overlapping, selected], selected)!;

    expect(comparison.prior).toEqual([]);
    expect(comparison.priorPeak).toBeNull();
    expect(comparison.previous).toBeNull();
    expect(comparison.state).toBe('insufficient');
  });

  it('excludes an overlapping month-only high from the period peak for a mid-month target', () => {
    const previous = tx({ date: '2026-05-01', price: 100000 });
    const overlapping = tx({ date: '2026-06', price: 200000 });
    const selected = tx({ date: '2026-06-15', price: 120000 });
    const comparison = analyzeTransactionPrice([previous, overlapping, selected], selected)!;

    expect(comparison.sameArea).toEqual([selected, previous]);
    expect(comparison.prior).toEqual([previous]);
    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.periodPeak).toBe(120000);
    expect(comparison.state).toBe('new-high');
    expect(comparison.gapToPeak).toBe(0);
  });

  it('includes a month-only high in the final-day period peak but never as a strict prior transaction', () => {
    const previous = tx({ date: '2026-05-01', price: 100000 });
    const sameMonth = tx({ date: '2026-06', price: 200000 });
    const selected = tx({ date: '2026-06-30', price: 120000 });
    const comparison = analyzeTransactionPrice([previous, sameMonth, selected], selected)!;

    expect(comparison.sameArea).toEqual([selected, sameMonth, previous]);
    expect(comparison.prior).toEqual([previous]);
    expect(comparison.previous).toBe(previous);
    expect(comparison.priorPeak).toBe(100000);
    expect(comparison.periodPeak).toBe(200000);
    expect(comparison.state).toBe('below');
    expect(comparison.gapToPeak).toBe(80000);
  });

  it('does not use a known day as prior to a month-only target within the same month', () => {
    const selected = tx({ date: '2026-06' });
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-06-01', price: 100000 }), selected,
    ], selected)!;

    expect(comparison.prior).toEqual([]);
    expect(comparison.state).toBe('insufficient');
  });

  it('accepts a month-only record as prior when its whole month predates the target', () => {
    const previous = tx({ date: '2026-05', price: 100000 });
    const selected = tx({ date: '2026-06-01' });
    const comparison = analyzeTransactionPrice([selected, previous], selected)!;

    expect(comparison.prior).toEqual([previous]);
    expect(comparison.previous).toBe(previous);
    expect(comparison.state).toBe('new-high');
  });

  it('returns null for an empty window', () => {
    expect(analyzeTransactionPrice([])).toBeNull();
  });

  it('does not mutate the supplied transaction order', () => {
    const earlier = tx({ date: '2026-05-01', price: 100000 });
    const latest = tx();
    const transactions = Object.freeze([earlier, latest]);

    expect(analyzeTransactionPrice(transactions)!.sameArea).toEqual([latest, earlier]);
    expect(transactions).toEqual([earlier, latest]);
  });
});

describe('invalid comparison records', () => {
  it.each([
    { label: 'zero price', overrides: { price: 0 } },
    { label: 'negative price', overrides: { price: -1 } },
    { label: 'NaN price', overrides: { price: Number.NaN } },
    { label: 'infinite price', overrides: { price: Number.POSITIVE_INFINITY } },
    { label: 'zero area', overrides: { area: 0 } },
    { label: 'negative area', overrides: { area: -1 } },
    { label: 'NaN area', overrides: { area: Number.NaN } },
    { label: 'infinite area', overrides: { area: Number.POSITIVE_INFINITY } },
    { label: 'missing date', overrides: { date: '' } },
    { label: 'malformed date', overrides: { date: '2026-6-1' } },
    { label: 'invalid month', overrides: { date: '2026-13-01' } },
    { label: 'zero day', overrides: { date: '2026-06-00' } },
    { label: 'overflowing day', overrides: { date: '2026-02-30' } },
    { label: 'non-leap February 29', overrides: { date: '2026-02-29' } },
  ])('ignores $label and rejects it as an explicit target', ({ overrides }) => {
    const invalid = tx({ date: '2026-07-01', ...overrides });
    const selected = tx();
    const previous = tx({ date: '2026-05-01', price: 100000 });
    const comparison = analyzeTransactionPrice([invalid, previous, selected])!;

    expect(isComparablePriceTransaction(invalid)).toBe(false);
    expect(comparison.target).toBe(selected);
    expect(comparison.sameArea).toEqual([selected, previous]);
    expect(comparison.periodPeak).toBe(120000);
    expect(comparison.state).toBe('new-high');
    expect(analyzeTransactionPrice([invalid])).toBeNull();
    expect(analyzeTransactionPrice([selected, invalid], invalid)).toBeNull();
  });

  it.each(['2024-02-29', '2026-06-30', '2026-06'])('accepts valid calendar date %s', (date) => {
    expect(isComparablePriceTransaction(tx({ date }))).toBe(true);
  });
});

describe('formatTransactionComparisonLine', () => {
  const fmt = (price: number) => `${price.toLocaleString('en-US')}만`;

  it.each([
    [2, '2개월'], [6, '6개월'], [12, '1년'], [18, '18개월'], [24, '2년'], [36, '3년'],
  ])('includes the lookup period for %i months', (months, period) => {
    expect(formatTransactionComparisonLine(null, months as number, fmt)).toBe(`${period} 비교 거래 부족`);
  });

  it('does not claim a high when no prior comparison is available', () => {
    expect(formatTransactionComparisonLine(analyzeTransactionPrice([tx()]), 36, fmt))
      .toBe('3년 비교 거래 부족');
  });

  it('describes a tied peak without claiming a new high', () => {
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 120000 }), tx(),
    ]);
    expect(formatTransactionComparisonLine(comparison, 6, fmt))
      .toBe('6개월 내 최고가와 같음');
  });

  it('shows the genuine prior high and the amount exceeded', () => {
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 100000 }), tx(),
    ]);
    expect(formatTransactionComparisonLine(comparison, 36, fmt))
      .toBe('3년 내 최고가 · 종전 100,000만 +20,000만');
  });

  it('shows the period peak and remaining difference when below it', () => {
    const comparison = analyzeTransactionPrice([
      tx({ date: '2026-05-01', price: 140000 }), tx(),
    ]);
    expect(formatTransactionComparisonLine(comparison, 2, fmt))
      .toBe('2개월 내 최고 140,000만 대비 -20,000만');
  });
});

import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/lib/tx-shared';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Line: () => <span>monthly-line</span>,
  Scatter: () => <span>individual-deals</span>,
  ReferenceLine: () => <span>peak-reference-line</span>,
  Tooltip: ({ content }: { content: ReactElement }) => cloneElement(content as ReactElement<Record<string, unknown>>, {
    active: true, payload: [{ payload: { kind: 'month', ts: new Date(2026, 7, 15).getTime(), avg: 153000 } }],
  }),
}));

import PriceComboChart from '../PriceComboChart';

const transactions: Transaction[] = [
  { aptName: '우리집', district: '송파구', date: '2026-08-03', area: 84, floor: 15, price: 155000, pricePerArea: 1845 },
  { aptName: '우리집', district: '송파구', date: '2026-07-01', area: 84, floor: 8, price: 151000, pricePerArea: 1798 },
];

describe('PriceComboChart data completeness', () => {
  it('keeps the default completed-data legend, peak reference and monthly tooltip', () => {
    const html = renderToStaticMarkup(<PriceComboChart transactions={transactions} maxPrice={155000} />);
    expect(html).toContain('점선 = 기간 내 최고가');
    expect(html).toContain('peak-reference-line');
    expect(html).toContain('26.08 월평균');
    expect(html).not.toContain('확인된 거래');
    expect(renderToStaticMarkup(<PriceComboChart transactions={transactions} maxPrice={155000} dataComplete />)).toBe(html);
  });

  it('removes peak references and qualifies monthly tooltip and legend when partial', () => {
    const html = renderToStaticMarkup(<PriceComboChart transactions={transactions} maxPrice={155000} dataComplete={false} />);
    expect(html).not.toContain('peak-reference-line');
    expect(html).not.toContain('최고가');
    expect(html).toContain('26.08 확인된 거래 월평균');
    expect(html).toContain('선 = 확인된 거래 월평균 · 점 = 확인된 개별 거래 · 일부 월 자료 누락');
    expect(html).toContain('monthly-line');
    expect(html).toContain('individual-deals');
    expect(html).toContain('15.3억');
  });

  it('retains the existing empty/single transaction guard', () => {
    expect(renderToStaticMarkup(<PriceComboChart transactions={[]} maxPrice={0} dataComplete={false} />)).toBe('');
    expect(renderToStaticMarkup(<PriceComboChart transactions={transactions.slice(0, 1)} maxPrice={155000} dataComplete={false} />)).toBe('');
  });
});

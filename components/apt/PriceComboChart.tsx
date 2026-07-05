'use client';

import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { type Transaction, fmtPrice, fmtContractDate } from '@/lib/tx-shared';

/**
 * 시세 콤보 차트 — 월평균 라인 + 개별 거래 도트 (시간축).
 * 단지 상세 모달(사이클 W)에서 추출해 단지 전용 페이지와 공용 (사이클 DD).
 */

interface PriceComboChartProps {
  transactions: Transaction[];   // 정렬 무관 (내부에서 시간순 정렬)
  maxPrice:     number;          // 기간 내 최고가 (점선 기준선, 0이면 생략)
  height?:      number;
}

function toTimestamp(date: string): number {
  // YYYY-MM-DD 또는 YYYY-MM (구캐시) 모두 처리
  const [y, m, d] = date.split('-').map((v) => parseInt(v));
  return new Date(y, (m ?? 1) - 1, d ?? 15).getTime();
}

function fmtTick(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface TooltipPayloadItem {
  payload?: {
    kind: 'deal' | 'month';
    ts: number;
    price?: number; avg?: number;
    date?: string; area?: number; floor?: number;
  };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = (payload.find((p) => p.payload?.kind === 'deal')?.payload ?? payload[0].payload)!;
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-hover)',
      fontSize: '12px',
    }}>
      {d.kind === 'deal' ? (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{fmtContractDate(d.date ?? '')} · {d.area}㎡ · {d.floor}층</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPrice(d.price ?? 0)}</p>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{fmtTick(d.ts)} 월평균</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPrice(d.avg ?? 0)}</p>
        </>
      )}
    </div>
  );
}

export default function PriceComboChart({ transactions, maxPrice, height = 190 }: PriceComboChartProps) {
  const asc = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const dealDots = asc.map((t) => ({
    kind: 'deal' as const,
    ts: toTimestamp(t.date),
    price: t.price,
    date: t.date, area: t.area, floor: t.floor,
  }));

  const byMonth = new Map<string, number[]>();
  asc.forEach((t) => {
    const ym = t.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(t.price);
  });
  const monthlyLine = [...byMonth.entries()].map(([ym, prices]) => ({
    kind: 'month' as const,
    ts: toTimestamp(ym + '-15'),
    avg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
  }));

  if (dealDots.length <= 1) return null;

  return (
    <div>
      <div style={{
        borderRadius: '12px', padding: '16px 8px 8px',
        backgroundColor: 'var(--bg-overlay)',
        border: '1px solid var(--border-light)',
      }}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtTick}
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="price"
              domain={['auto', 'auto']}
              tickFormatter={(v) => fmtPrice(v)}
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              width={56}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            {maxPrice > 0 && (
              <ReferenceLine
                y={maxPrice}
                stroke="rgba(201,47,47,0.35)"
                strokeDasharray="4 4"
              />
            )}
            <Line
              data={monthlyLine}
              dataKey="avg"
              type="monotone"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Scatter
              data={dealDots}
              dataKey="price"
              fill="var(--accent)"
              opacity={0.5}
              shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={3} fill="var(--accent)" opacity={0.55} />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)' }}>
        선 = 월평균 · 점 = 개별 거래 · 점선 = 기간 내 최고가
      </p>
    </div>
  );
}

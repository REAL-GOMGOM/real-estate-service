'use client';

import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { GapResult } from '@/types/gap-analysis';

interface GapChartProps {
  result: GapResult;
}

export default function GapChart({ result }: GapChartProps) {
  const hasB = !!result.complexB;

  if (hasB) {
    // 모드 1: 단지 vs 단지 갭 차트
    const chartData = result.monthlyGap.map((g) => {
      const a = result.complexA.prices.find((p) => p.date === g.date);
      const b = result.complexB?.prices.find((p) => p.date === g.date);
      return {
        date: g.date.slice(2), // "25-01"
        [result.complexA.name]: a ? Math.round(a.avgPrice / 10000 * 10) / 10 : null,
        [result.complexB!.name]: b ? Math.round(b.avgPrice / 10000 * 10) / 10 : null,
        gap: Math.round(g.gap / 10000 * 10) / 10,
      };
    });

    return (
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
          <YAxis yAxisId="price" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={(v) => `${v}억`} />
          <YAxis yAxisId="gap" orientation="right" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={(v) => `${v}억`} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }}
            formatter={(value: unknown, name: unknown) => [`${value}억`, String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line yAxisId="price" type="monotone" dataKey={result.complexA.name} stroke="#C4654A" strokeWidth={2} dot={{ r: 2 }} />
          {result.complexB && (
            <Line yAxisId="price" type="monotone" dataKey={result.complexB.name} stroke="#6B8F71" strokeWidth={2} dot={{ r: 2 }} />
          )}
          <Bar yAxisId="gap" dataKey="gap" fill="#D4A853" opacity={0.4} barSize={12} name="갭" />
          <ReferenceLine yAxisId="gap" y={Math.round(result.historicalAvgGap / 10000 * 10) / 10} stroke="#EF4444" strokeDasharray="5 5" label={{ value: '평균 갭', fill: '#EF4444', fontSize: 10 }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // 모드: 단일 단지 시세 추이
  const chartData = result.complexA.prices.map((p) => ({
    date: p.date.slice(2),
    price: Math.round(p.avgPrice / 10000 * 10) / 10,
    count: p.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
        <XAxis dataKey="date" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
        <YAxis yAxisId="price" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={(v) => `${v}억`} />
        <YAxis yAxisId="count" orientation="right" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Line yAxisId="price" type="monotone" dataKey="price" stroke="#C4654A" strokeWidth={2} dot={{ r: 3 }} name="평균가(억)" />
        <Bar yAxisId="count" dataKey="count" fill="#6B8F71" opacity={0.3} barSize={12} name="거래건수" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

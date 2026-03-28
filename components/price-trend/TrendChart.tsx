'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { REGION_COLORS } from '@/types/price-trend';

interface TrendChartProps {
  data: Array<{ date: string; regions: Record<string, number> }>;
  regions: string[];
}

export default function TrendChart({ data, regions }: TrendChartProps) {
  // recharts 형식으로 변환
  const chartData = data.map((d) => ({
    date: d.date,
    ...d.regions,
  }));

  return (
    <div style={{
      padding: '20px', borderRadius: '14px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
    }}>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '10px', fontSize: '12px',
            }}
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              return [`${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, String(name)];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }}
          />
          {regions.map((region) => (
            <Line
              key={region}
              type="monotone"
              dataKey={region}
              stroke={REGION_COLORS[region] || 'var(--text-muted)'}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

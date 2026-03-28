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
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', fontSize: '12px',
            }}
            labelStyle={{ color: '#94A3B8' }}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              return [`${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, String(name)];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#94A3B8' }}
          />
          {regions.map((region) => (
            <Line
              key={region}
              type="monotone"
              dataKey={region}
              stroke={REGION_COLORS[region] || '#94A3B8'}
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

'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { BRAND } from '@/lib/design-tokens';
import type { RegionDetail } from '@/lib/types';

interface Props {
  scenarios: RegionDetail['scenarios'];
}

export function ScenarioBarChart({ scenarios }: Props) {
  const data = [
    { label: '기본', value: scenarios.base ?? 0 },
    { label: '시세중심', value: scenarios.price ?? 0 },
    { label: '성장중심', value: scenarios.growth ?? 0 },
    { label: '인프라중심', value: scenarios.infra ?? 0 },
  ];

  return (
    <div className="w-full" style={{ minHeight: 320 }}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: BRAND.inkSoft, fontSize: 12 }}
            axisLine={{ stroke: BRAND.line }}
            tickLine={false}
          />
          <YAxis
            domain={[1.0, 5.0]}
            reversed
            tick={{ fill: BRAND.inkSoft, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: '점수 (낮을수록 상급지)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: BRAND.inkSoft, fontSize: 11, textAnchor: 'middle' },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: `1px solid ${BRAND.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
            formatter={(value) => [`${Number(value).toFixed(2)}`, '점수']}
          />
          <Bar
            dataKey="value"
            fill={BRAND.terracotta}
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
          >
            <LabelList
              dataKey="value"
              position="top"
              formatter={(value: unknown) =>
                typeof value === 'number' ? value.toFixed(2) : ''
              }
              style={{ fill: BRAND.ink, fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

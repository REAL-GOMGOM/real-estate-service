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

/**
 * 시나리오 민감도 막대 차트
 *
 * 데이터 변환:
 * - 원본 점수: 1~5, 낮을수록 상급지 (강남=1.34)
 * - displayValue = 5 - rawValue (막대 길수록 좋음)
 * - 툴팁·라벨은 원본 점수 유지
 */
export function ScenarioBarChart({ scenarios }: Props) {
  const data = [
    { label: '기본', rawScore: scenarios.base ?? 0, displayValue: 5 - (scenarios.base ?? 0) },
    { label: '시세중심', rawScore: scenarios.price ?? 0, displayValue: 5 - (scenarios.price ?? 0) },
    { label: '성장중심', rawScore: scenarios.growth ?? 0, displayValue: 5 - (scenarios.growth ?? 0) },
    { label: '인프라중심', rawScore: scenarios.infra ?? 0, displayValue: 5 - (scenarios.infra ?? 0) },
  ];

  return (
    <div className="w-full" style={{ minHeight: 320 }}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 30, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: BRAND.inkSoft, fontSize: 12 }}
            axisLine={{ stroke: BRAND.line }}
            tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: BRAND.inkSoft, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: '상급지 지수 (높을수록 우수)',
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
            formatter={(_value, _name, item) => {
              const raw = item?.payload?.rawScore;
              return [
                typeof raw === 'number' ? `${raw.toFixed(2)} (낮을수록 상급지)` : '',
                '점수',
              ];
            }}
          />
          <Bar
            dataKey="displayValue"
            fill={BRAND.terracotta}
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
          >
            <LabelList
              dataKey="rawScore"
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

'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { BRAND } from '@/lib/design-tokens';
import type { RegionDetail } from '@/lib/types';

interface Props {
  metrics: RegionDetail['metrics'];
}

/**
 * 입지 4지표 레이더 차트
 *
 * 대상 (모두 0~10 스케일 주관 지수):
 * - transport, school, industry, supply
 *
 * 제외 (원시 통계값):
 * - populationFlow: 명/월
 * - tradeVolumeChange: YoY %
 * → RegionMarketMetrics 카드에서 표시
 */
export function ScoreRadarChart({ metrics }: Props) {
  const data = [
    { subject: '교통', value: metrics.transport ?? 0, fullMark: 10 },
    { subject: '학군', value: metrics.school ?? 0, fullMark: 10 },
    { subject: '산업', value: metrics.industry ?? 0, fullMark: 10 },
    { subject: '공급', value: metrics.supply ?? 0, fullMark: 10 },
  ];

  return (
    <div className="w-full" style={{ minHeight: 320 }}>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke={BRAND.line} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: BRAND.inkSoft, fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 10]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="지표"
            dataKey="value"
            stroke={BRAND.terracotta}
            fill={BRAND.terracotta}
            fillOpacity={0.25}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: `1px solid ${BRAND.line}`,
              borderRadius: 8,
              fontSize: 13,
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} / 10`, '']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

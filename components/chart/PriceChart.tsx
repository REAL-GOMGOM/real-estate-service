'use client';

import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface MonthlyData {
  date: string;
  avgPrice: number;
  minPrice: number;
  count: number;
}

interface Props {
  data: MonthlyData[];
}

/** 만원 → 억 변환 */
function toEok(manwon: number): string {
  return `${(manwon / 10000).toFixed(1)}억`;
}

/** 커스텀 툴팁 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const count    = payload.find((p: any) => p.dataKey === 'count');
  const avgPrice = payload.find((p: any) => p.dataKey === 'avgPrice');
  const minPrice = payload.find((p: any) => p.dataKey === 'minPrice');

  return (
    <div style={{
      backgroundColor: 'rgba(15,22,41,0.97)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '12px',
      padding: '12px 16px',
      backdropFilter: 'blur(12px)',
      minWidth: '160px',
    }}>
      <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>{label}</p>
      {count && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: '#8B5CF6' }}>매매물량</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'Roboto Mono, monospace' }}>
            {count.value}개
          </span>
        </div>
      )}
      {avgPrice && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: '#F97316' }}>매호가(평균)</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'Roboto Mono, monospace' }}>
            {toEok(avgPrice.value)}
          </span>
        </div>
      )}
      {minPrice && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: '#EF4444' }}>매호가(저)</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'Roboto Mono, monospace' }}>
            {toEok(minPrice.value)}
          </span>
        </div>
      )}
    </div>
  );
}

/** 커스텀 범례 */
function CustomLegend() {
  return (
    <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginBottom: '8px' }}>
      {[
        { color: '#8B5CF6', label: '매매물량', dashed: false, bar: true },
        { color: '#F97316', label: '매호가(평균)', dashed: false, bar: false },
        { color: '#EF4444', label: '매호가(저)',   dashed: true,  bar: false },
      ].map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {item.bar ? (
            <div style={{ width: '12px', height: '10px', backgroundColor: item.color, borderRadius: '2px', opacity: 0.7 }} />
          ) : (
            <div style={{
              width: '20px', height: '2px',
              backgroundColor: item.color,
              borderTop: item.dashed ? `2px dashed ${item.color}` : undefined,
            }} />
          )}
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PriceChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div style={{
        height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0F1629', color: '#475569', fontSize: '14px',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
      }}>
        거래 데이터가 없습니다
      </div>
    );
  }

  // Y축 가격 범위 계산 (여백 10%)
  const prices    = data.flatMap((d) => [d.avgPrice, d.minPrice]);
  const minY      = Math.floor(Math.min(...prices) * 0.97 / 10000) * 10000;
  const maxY      = Math.ceil(Math.max(...prices)  * 1.03 / 10000) * 10000;
  const maxCount  = Math.max(...data.map((d) => d.count));

  return (
    <div style={{
      padding: '20px 20px 8px',
      borderRadius: '16px',
      backgroundColor: '#0F1629',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <CustomLegend />
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} margin={{ top: 8, right: 60, left: 10, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />

          {/* X축 */}
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={false}
          />

          {/* 좌측 Y축 — 거래량 */}
          <YAxis
            yAxisId="volume"
            orientation="left"
            domain={[0, maxCount * 4]}
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}개`}
          />

          {/* 우측 Y축 — 가격 */}
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={[minY, maxY]}
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
            width={55}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />

          {/* 거래량 히스토그램 */}
          <Bar
            yAxisId="volume"
            dataKey="count"
            fill="rgba(139,92,246,0.5)"
            radius={[2, 2, 0, 0]}
            maxBarSize={32}
          />

          {/* 평균가 라인 */}
          <Line
            yAxisId="price"
            dataKey="avgPrice"
            stroke="#F97316"
            strokeWidth={2}
            dot={{ fill: '#F97316', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#F97316' }}
          />

          {/* 최저가 라인 */}
          <Line
            yAxisId="price"
            dataKey="minPrice"
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4, fill: '#EF4444' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
'use client';

import { useMemo } from 'react';
import { REGION_COLORS } from '@/types/price-trend';

interface RegionRankingTableProps {
  data: Array<{ date: string; regions: Record<string, number> }>;
  regions: string[];
}

export default function RegionRankingTable({ data, regions }: RegionRankingTableProps) {
  // 최신 데이터 기준 정렬
  const ranking = useMemo(() => {
    if (data.length === 0) return [];
    const latest = data[data.length - 1].regions;
    return regions
      .map((r) => ({ name: r, value: latest[r] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [data, regions]);

  if (ranking.length === 0) return null;

  return (
    <div style={{
      borderRadius: '14px', overflow: 'hidden',
      border: '1px solid var(--border-light)',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '50px 1fr 100px',
        padding: '10px 16px', backgroundColor: 'var(--border-light)',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>순위</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>지역</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>변동률</span>
      </div>
      {ranking.map((r, i) => (
        <div
          key={r.name}
          style={{
            display: 'grid', gridTemplateColumns: '50px 1fr 100px',
            padding: '10px 16px',
            backgroundColor: i % 2 === 0 ? 'var(--bg-overlay)' : 'transparent',
            borderBottom: '1px solid var(--border-light)',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: REGION_COLORS[r.name] || 'var(--text-muted)',
            }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
          </div>
          <span style={{
            fontSize: '13px', fontWeight: 700, textAlign: 'right',
            fontFamily: 'Roboto Mono, monospace',
            color: r.value >= 0 ? '#F87171' : '#60A5FA',
          }}>
            {r.value >= 0 ? '+' : ''}{r.value.toFixed(3)}%
          </span>
        </div>
      ))}
    </div>
  );
}

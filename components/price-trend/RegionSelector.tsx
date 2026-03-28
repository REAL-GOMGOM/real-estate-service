'use client';

import { REGION_COLORS } from '@/types/price-trend';

const ALL_REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

interface RegionSelectorProps {
  selected: Set<string>;
  onToggle: (region: string) => void;
}

export default function RegionSelector({ selected, onToggle }: RegionSelectorProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {ALL_REGIONS.map((region) => {
        const active = selected.has(region);
        const color = REGION_COLORS[region] || 'var(--text-muted)';
        return (
          <button
            key={region}
            onClick={() => onToggle(region)}
            style={{
              padding: '5px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s',
              backgroundColor: active ? color + '22' : 'var(--border-light)',
              color: active ? color : 'var(--text-dim)',
              outline: active ? `1.5px solid ${color}55` : '1.5px solid transparent',
            }}
          >
            {region}
          </button>
        );
      })}
    </div>
  );
}

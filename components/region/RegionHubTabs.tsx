'use client';

import { BRAND } from '@/lib/design-tokens';

const REGIONS = [
  '전체', '서울', '경기', '인천',
  '1기신도시', '2기신도시', '3기신도시',
  '부산', '대구', '울산',
];

interface Props {
  selected: string;
  onSelect: (region: string) => void;
  counts: Record<string, number>;
}

export function RegionHubTabs({ selected, onSelect, counts }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2"
      role="tablist"
      aria-label="지역 선택"
    >
      {REGIONS.map((region) => {
        const isActive = selected === region;
        const count = counts[region] ?? 0;
        return (
          <button
            key={region}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(region)}
            className="px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              backgroundColor: isActive ? BRAND.terracotta : '#FFFFFF',
              color: isActive ? '#FFFFFF' : BRAND.inkSoft,
              border: `1px solid ${isActive ? BRAND.terracotta : BRAND.line}`,
            }}
          >
            {region} <span className="opacity-70 text-xs ml-1">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

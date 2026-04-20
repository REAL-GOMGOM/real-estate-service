'use client';

import { BRAND } from '@/lib/design-tokens';

export type SortBy = 'score' | 'name' | 'pricePerPyeong';
export type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'score', label: '입지 점수' },
  { value: 'name', label: '가나다' },
  { value: 'pricePerPyeong', label: '평당가' },
];

interface Props {
  sortBy: SortBy;
  sortDir: SortDir;
  onChange: (sortBy: SortBy, sortDir: SortDir) => void;
}

export function RegionSortToggle({ sortBy, sortDir, onChange }: Props) {
  const handleClick = (newBy: SortBy) => {
    if (newBy === sortBy) {
      onChange(newBy, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onChange(newBy, 'asc');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: BRAND.inkSoft }}>정렬:</span>
      <div className="flex gap-1">
        {SORT_OPTIONS.map(({ value, label }) => {
          const isActive = sortBy === value;
          return (
            <button
              key={value}
              onClick={() => handleClick(value)}
              className="px-3 py-1 rounded-md text-xs transition-colors flex items-center gap-1"
              style={{
                backgroundColor: isActive ? BRAND.paper : 'transparent',
                color: isActive ? BRAND.terracotta : BRAND.inkSoft,
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
              {isActive && (
                <span style={{ fontSize: '10px' }}>
                  {sortDir === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

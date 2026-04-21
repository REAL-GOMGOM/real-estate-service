'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RegionHubSearch } from './RegionHubSearch';
import { RegionHubTabs } from './RegionHubTabs';
import { RegionSortToggle, type SortBy, type SortDir } from './RegionSortToggle';
import { RegionHubGrid } from './RegionHubGrid';
import { BRAND } from '@/lib/design-tokens';
import type { LocationScore } from '@/lib/types';

interface Props {
  initialData: LocationScore[];
}

export function RegionHubClient({ initialData }: Props) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const counts = useMemo(() => {
    const result: Record<string, number> = { '전체': initialData.length };
    initialData.forEach((item) => {
      result[item.region] = (result[item.region] ?? 0) + 1;
    });
    return result;
  }, [initialData]);

  const filteredSorted = useMemo(() => {
    let result = [...initialData];

    if (selectedRegion !== '전체') {
      result = result.filter((item) => item.region === selectedRegion);
    }

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.region.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'score') {
        cmp = a.score - b.score;
      } else if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, 'ko');
      } else if (sortBy === 'pricePerPyeong') {
        const aP = a.metrics?.pricePerPyeong ?? 0;
        const bP = b.metrics?.pricePerPyeong ?? 0;
        cmp = aP - bP;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [initialData, selectedRegion, query, sortBy, sortDir]);

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
      <div className="mb-6">
        <RegionHubSearch onChange={setQuery} />
      </div>

      <div className="mb-4">
        <RegionHubTabs
          selected={selectedRegion}
          onSelect={setSelectedRegion}
          counts={counts}
        />
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="text-sm" style={{ color: BRAND.inkSoft }}>
          총 <strong style={{ color: BRAND.ink }}>{filteredSorted.length}</strong>개 지역
        </div>
        <RegionSortToggle
          sortBy={sortBy}
          sortDir={sortDir}
          onChange={(newBy, newDir) => {
            setSortBy(newBy);
            setSortDir(newDir);
          }}
        />
      </div>

      <RegionHubGrid items={filteredSorted} query={query} onQueryChange={setQuery} />
    </div>
  );
}

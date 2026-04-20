import { RegionCard } from './RegionCard';
import { BRAND } from '@/lib/design-tokens';
import type { LocationScore } from '@/lib/types';

interface Props {
  items: LocationScore[];
}

export function RegionHubGrid({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: BRAND.inkSoft }}>
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item, idx) => (
        <RegionCard
          key={item.id}
          rank={idx + 1}
          name={item.name}
          score={item.score}
          href={`/region/${item.id}`}
          isHighlight={idx < 3}
          subLabel={
            item.metrics?.pricePerPyeong
              ? `평당 ${Math.round(item.metrics.pricePerPyeong).toLocaleString()}만`
              : item.region
          }
        />
      ))}
    </div>
  );
}

import { RegionCard } from './RegionCard';
import { BRAND } from '@/lib/design-tokens';
import type { LocationScore } from '@/lib/types';

const POPULAR_SEARCHES = ['강남구', '분당', '마포구', '용산구', '판교'];

interface Props {
  items: LocationScore[];
  query?: string;
  onQueryChange?: (q: string) => void;
}

export function RegionHubGrid({ items, query, onQueryChange }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 px-6">
        <p className="text-lg font-medium mb-2" style={{ color: BRAND.ink }}>
          {query ? `"${query}"에 대한 검색 결과가 없습니다` : '검색 결과가 없습니다'}
        </p>
        <p className="text-sm mb-6" style={{ color: BRAND.inkSoft }}>
          다른 키워드로 검색해보세요
        </p>
        {onQueryChange && (
          <div className="flex flex-wrap justify-center gap-2">
            {POPULAR_SEARCHES.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onQueryChange(term)}
                className="px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${BRAND.line}`,
                  color: BRAND.inkSoft,
                  cursor: 'pointer',
                }}
              >
                #{term}
              </button>
            ))}
          </div>
        )}
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

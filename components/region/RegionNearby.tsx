import type { RegionDetail } from '@/lib/types';
import { getNearbyRegions } from '@/lib/region-data';
import { RegionCard } from './RegionCard';

interface Props {
  region: RegionDetail;
}

export async function RegionNearby({ region }: Props) {
  const nearby = await getNearbyRegions(region, 5);
  if (nearby.length === 0) return null;

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2
        className="text-xl md:text-2xl font-semibold mb-4"
        style={{ color: 'var(--text-strong)' }}
      >
        주변 지역
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        {region.region} 내 점수가 비슷한 지역입니다.
      </p>

      <div className="space-y-3">
        {nearby.map((r) => (
          <RegionCard
            key={r.id}
            name={r.name}
            score={r.score}
            href={`/region/${r.id}`}
            subLabel={r.region}
          />
        ))}
      </div>
    </section>
  );
}

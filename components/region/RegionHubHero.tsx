import Link from 'next/link';
import { BRAND } from '@/lib/design-tokens';

interface RegionHubHeroProps {
  regionCount: number;
}

export function RegionHubHero({ regionCount }: RegionHubHeroProps) {
  return (
    <section
      className="py-12 md:py-16"
      style={{ background: `linear-gradient(180deg, ${BRAND.surfaceDeep} 0%, ${BRAND.surface} 100%)` }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1
              className="text-3xl md:text-5xl font-bold"
              style={{ color: BRAND.ink, letterSpacing: '-0.02em' }}
            >
              등록 <span style={{ color: BRAND.primary }}>{regionCount}개 지역</span> 입지 지표
            </h1>
            <p className="mt-3 text-sm md:text-base" style={{ color: BRAND.inkSoft }}>
              자체 산식 점수와 수록 시장 지표를 한눈에
            </p>
          </div>
          <Link
            href="/location-map"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-80"
            style={{
              backgroundColor: '#FFFFFF',
              color: BRAND.primary,
              border: `1px solid ${BRAND.primary}`,
            }}
          >
            지도로 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}

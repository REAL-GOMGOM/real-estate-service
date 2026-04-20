import Link from 'next/link';
import { BRAND } from '@/lib/design-tokens';

export function RegionHubHero() {
  return (
    <section
      className="py-12 md:py-16"
      style={{ background: `linear-gradient(180deg, ${BRAND.paper} 0%, ${BRAND.bg} 100%)` }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1
              className="text-3xl md:text-5xl font-bold"
              style={{ color: BRAND.ink, letterSpacing: '-0.02em' }}
            >
              전국 <span style={{ color: BRAND.terracotta }}>126개 지역</span> 입지 분석
            </h1>
            <p className="mt-3 text-sm md:text-base" style={{ color: BRAND.inkSoft }}>
              점수·시장 추세·AI 해설을 한눈에
            </p>
          </div>
          <Link
            href="/location-map"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-80"
            style={{
              backgroundColor: '#FFFFFF',
              color: BRAND.terracotta,
              border: `1px solid ${BRAND.terracotta}`,
            }}
          >
            지도로 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getAllRegionIds, getRegionById } from '@/lib/region-data';
import { RegionBreadcrumb } from '@/components/region/RegionBreadcrumb';
import { RegionHero } from '@/components/region/RegionHero';
import { RegionInsight } from '@/components/region/RegionInsight';
import { RegionScoreBreakdown } from '@/components/region/RegionScoreBreakdown';
import { RegionMarketMetrics } from '@/components/region/RegionMarketMetrics';
import { RegionScenarios } from '@/components/region/RegionScenarios';
import { RegionNearby } from '@/components/region/RegionNearby';
import { RegionDataSource } from '@/components/region/RegionDataSource';
import { RegionCTA } from '@/components/region/RegionCTA';
import { AdSlot } from '@/components/shared/AdSlot';
import { buildRegionHeadline, buildRegionSummary } from '@/lib/region-copy';
import { SITE_URL } from '@/lib/site';

interface PageProps {
  params: Promise<{ id: string }>;
}

// SSG: 빌드 시 location-scores에 등록된 전체 지역 페이지 생성
export async function generateStaticParams() {
  const ids = await getAllRegionIds();
  return ids.map((id) => ({ id }));
}

// 페이지별 메타데이터
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const region = await getRegionById(id);

  if (!region) {
    return { title: '지역을 찾을 수 없습니다 | 내집(NAEZIP)' };
  }

  const title = `${region.name} 입지 지표 | 내집(NAEZIP)`;
  const description = buildRegionSummary(region);
  const headline = buildRegionHeadline(region);
  const canonical = `${SITE_URL}/region/${region.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: headline,
      description,
      url: canonical,
      siteName: '내집(NAEZIP)',
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

async function RegionContent({ id }: { id: string }) {
  const region = await getRegionById(id);
  if (!region) notFound();

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '입지지도', item: `${SITE_URL}/location-map` },
      { '@type': 'ListItem', position: 3, name: region.region, item: `${SITE_URL}/location-map?region=${encodeURIComponent(region.region)}` },
      { '@type': 'ListItem', position: 4, name: region.name },
    ],
  };

  const placeLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: region.name,
    address: { '@type': 'PostalAddress', addressRegion: region.region, addressCountry: 'KR' },
    ...(region.lat && region.lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: region.lat, longitude: region.lng } }
      : {}),
  };

  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: buildRegionHeadline(region),
    description: buildRegionSummary(region),
    url: `${SITE_URL}/region/${region.id}`,
    isPartOf: { '@type': 'WebSite', name: '내집(NAEZIP)', url: SITE_URL },
    about: { '@type': 'Place', name: region.name },
    dateModified: region.lastUpdated || region.month,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }} />

      <RegionBreadcrumb region={region} />
      <RegionHero region={region} />
      <RegionInsight region={region} />

      <AdSlot type="article" slotId={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE} />

      <RegionScoreBreakdown region={region} />
      <RegionMarketMetrics region={region} />
      <RegionScenarios region={region} />
      <RegionNearby region={region} />

      <AdSlot type="bottom" slotId={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM} />

      <RegionDataSource region={region} />
      <RegionCTA region={region} />
    </>
  );
}

function RegionFallback() {
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-20">
      <div className="animate-pulse space-y-4">
        <div className="h-4 rounded w-1/4" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="h-10 rounded w-3/4" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="h-6 rounded w-1/2" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      </div>
    </div>
  );
}

export default async function RegionDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<RegionFallback />}>
          <RegionContent id={id} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

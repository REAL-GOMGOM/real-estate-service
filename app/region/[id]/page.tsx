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

interface PageProps {
  params: Promise<{ id: string }>;
}

// SSG: 빌드 시 126개 페이지 미리 생성
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

  const title = `${region.name} 입지 분석 | 내집(NAEZIP)`;
  const description =
    region.insight.summary ||
    `${region.region} ${region.name}의 입지 점수, 시세, 교통·학군 지표를 분석합니다. 내집(NAEZIP)에서 확인하세요.`;
  const canonical = `https://www.naezipkorea.com/region/${region.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${region.name} — ${region.insight.headline || '입지 분석'}`,
      description,
      url: canonical,
      siteName: '내집(NAEZIP)',
      locale: 'ko_KR',
      type: 'article',
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
      { '@type': 'ListItem', position: 1, name: '홈', item: 'https://www.naezipkorea.com' },
      { '@type': 'ListItem', position: 2, name: '입지지도', item: 'https://www.naezipkorea.com/location-map' },
      { '@type': 'ListItem', position: 3, name: region.region, item: `https://www.naezipkorea.com/location-map?region=${encodeURIComponent(region.region)}` },
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

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: region.insight.headline || `${region.name} 입지 분석`,
    description: region.insight.summary || `${region.region} ${region.name}의 입지 점수와 시세 분석`,
    author: { '@type': 'Organization', name: '내집(NAEZIP)', url: 'https://www.naezipkorea.com' },
    publisher: { '@type': 'Organization', name: '내집(NAEZIP)', url: 'https://www.naezipkorea.com' },
    datePublished: region.lastUpdated || region.month,
    dateModified: region.lastUpdated || region.month,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />

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

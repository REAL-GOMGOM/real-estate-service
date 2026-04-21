import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { RegionHubHero } from '@/components/region/RegionHubHero';
import { RegionHubClient } from '@/components/region/RegionHubClient';
import locationScores from '@/data/location-scores.json';
import type { LocationScore } from '@/lib/types';

export const metadata: Metadata = {
  title: '전국 부동산 입지 분석 | 내집(My.ZIP)',
  description:
    '서울·경기·인천 등 전국 126개 지역의 입지 점수, 평당가, 시장 추세를 AI 분석과 함께 한눈에 확인하세요. 국토교통부·한국부동산원 공식 데이터 기반.',
  keywords: '부동산 입지, 지역 분석, 입지 점수, 부동산 순위, 전국 부동산 비교',
  openGraph: {
    title: '전국 부동산 입지 분석 | 내집(My.ZIP)',
    description: '126개 지역 입지 점수·AI 해설을 한눈에.',
    url: 'https://www.naezipkorea.com/region',
    type: 'website',
  },
};

export default function RegionHubPage() {
  const scores = locationScores as LocationScore[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '전국 부동산 입지 분석 리스트',
    numberOfItems: scores.length,
    itemListElement: scores.slice(0, 50).map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `https://www.naezipkorea.com/region/${item.id}`,
      name: item.name,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main>
        <RegionHubHero />
        <Suspense>
          <RegionHubClient initialData={scores} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

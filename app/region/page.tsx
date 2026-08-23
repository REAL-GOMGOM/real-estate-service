import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { RegionHubHero } from '@/components/region/RegionHubHero';
import { RegionHubClient } from '@/components/region/RegionHubClient';
import { createPageMetadata } from '@/lib/metadata';
import { PUBLIC_LOCATION_SCORES } from '@/lib/location-score-data';

const REGION_COUNT = PUBLIC_LOCATION_SCORES.length;

export const metadata = createPageMetadata({
  title: '지역별 부동산 입지 지표 | 내집(My.ZIP)',
  description:
    `서울·경기·인천 등을 포함한 등록 ${REGION_COUNT}개 지역의 자체 입지 점수와 수록 평당가·시장 지표를 비교하세요. 공개 통계와 민간 참고자료를 함께 가공한 탐색용 상대 지표입니다.`,
  keywords: '부동산 입지, 지역 분석, 입지 점수, 부동산 순위, 전국 부동산 비교',
  path: '/region',
});

export default function RegionHubPage() {
  const scores = PUBLIC_LOCATION_SCORES;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '등록 지역 부동산 입지 지표 리스트',
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
        <RegionHubHero regionCount={scores.length} />
        <Suspense>
          <RegionHubClient initialData={scores} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import RankingClientPage from '@/components/ranking/RankingClientPage';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '지역별 아파트 실거래 랭킹 | 내집(My.ZIP)',
  description:
    '등록된 시군구의 공개 실거래를 바탕으로 최고가, 거래량, 신고가를 비교합니다. 집계 기간과 표본 범위를 함께 확인하세요.',
  path: '/ranking',
});

export default function RankingPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '64px' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>불러오는 중...</p>
        </div>
      }>
        <RankingClientPage />
      </Suspense>
      <Footer />
    </>
  );
}

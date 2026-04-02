import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import RankingClientPage from '@/components/ranking/RankingClientPage';

export const metadata = { title: '주간 랭킹 | 내집' };

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

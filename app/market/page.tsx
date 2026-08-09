import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MarketDashboard from '@/components/market/MarketDashboard';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '아파트 시장 현황·시세 분석 | 내집(My.ZIP)',
  description:
    '주요 지역 아파트 거래량과 가격 흐름을 공개 데이터 기반 지표로 확인하세요.',
  path: '/market',
});

export default function MarketPage() {
  return (
    <>
      <Header />
      <MarketDashboard />
      <Footer />
    </>
  );
}

import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MarketDashboard from '@/components/market/MarketDashboard';

export const metadata = { title: '시세 분석 | 내집' };

export default function MarketPage() {
  return (
    <>
      <Header />
      <MarketDashboard />
      <Footer />
    </>
  );
}

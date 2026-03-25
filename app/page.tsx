import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/landing/HeroSection';
import ServiceCards from '@/components/landing/ServiceCards';
import LocationMapPreview from '@/components/landing/LocationMapPreview';
import MarketPreview from '@/components/landing/MarketPreview';
import SubscriptionPreview from '@/components/landing/SubscriptionPreview';
import TransactionSearch from '@/components/landing/TransactionSearch';
import { fetchSubscriptions } from '@/lib/subscription-api';

export default async function HomePage() {
  // 홈에는 진행 중·예정 상위 3건만 노출
  const allItems     = await fetchSubscriptions().catch(() => []);
  const previewItems = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 3);

  return (
    <main>
      <Header />
      <HeroSection />
      <ServiceCards />
      <TransactionSearch />
      <LocationMapPreview />
      <MarketPreview />
      <SubscriptionPreview items={previewItems} />
      <Footer />
    </main>
  );
}

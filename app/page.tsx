import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Hero } from '@/components/landing/Hero';
import { TodayReport } from '@/components/landing/TodayReport';
import { CoreServices } from '@/components/landing/CoreServices';
import { TopLocations } from '@/components/landing/TopLocations';
import { SubscriptionList } from '@/components/landing/SubscriptionList';
import { ValueProps } from '@/components/landing/ValueProps';
import { KakaoBanner } from '@/components/landing/KakaoBanner';
import { VisitorStatsSlim } from '@/components/landing/VisitorStatsSlim';
import { MOCK_TICKER, MOCK_DISTRICTS, MOCK_TOP_LOCATIONS } from '@/lib/mock-data';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';
import { getStats } from '@/lib/visitor-tracking';
import type { TickerItem } from '@/components/landing/LiveTicker';

const FALLBACK_STATS = { today: 0, active24h: 0, total: 0 };

async function HeroSection({ ticker }: { ticker: TickerItem[] }) {
  return <Hero ticker={ticker} />;
}

async function VisitorStatsSlimSection() {
  const stats = await getStats();
  return <VisitorStatsSlim initialStats={stats} />;
}

export default async function HomePage() {
  const allItems = await fetchSubscriptions().catch(() => []);
  const subscriptions = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 3)
    .map(toSubscription);

  return (
    <main>
      <Header />

      {/* 1. Hero (VisitorStats 제거됨) */}
      <Hero ticker={MOCK_TICKER} />

      {/* 2. ValueProps — 상단 이동 */}
      <ValueProps />

      {/* 3. TodayReport */}
      <TodayReport districts={MOCK_DISTRICTS} />

      {/* 4. CoreServices */}
      <CoreServices />

      {/* 5. TopLocations */}
      <TopLocations items={MOCK_TOP_LOCATIONS} />

      {/* 6. SubscriptionList */}
      <SubscriptionList items={subscriptions} />

      {/* 7. KakaoBanner */}
      <KakaoBanner />

      {/* 8. VisitorStatsSlim — Footer 직전 */}
      <Suspense fallback={<VisitorStatsSlim initialStats={FALLBACK_STATS} />}>
        <VisitorStatsSlimSection />
      </Suspense>

      <Footer />
    </main>
  );
}

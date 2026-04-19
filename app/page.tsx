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
import { MOCK_TICKER, MOCK_DISTRICTS, MOCK_TOP_LOCATIONS } from '@/lib/mock-data';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';
import { getStats } from '@/lib/visitor-tracking';
import type { TickerItem } from '@/components/landing/LiveTicker';

const FALLBACK_STATS = { today: 0, active24h: 0, total: 0 };

async function HeroWithStats({ ticker }: { ticker: TickerItem[] }) {
  const initialStats = await getStats();
  return <Hero ticker={ticker} initialStats={initialStats} />;
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
      <Suspense fallback={<Hero ticker={MOCK_TICKER} initialStats={FALLBACK_STATS} />}>
        <HeroWithStats ticker={MOCK_TICKER} />
      </Suspense>
      <TodayReport districts={MOCK_DISTRICTS} />
      <CoreServices />
      <TopLocations items={MOCK_TOP_LOCATIONS} />
      <SubscriptionList items={subscriptions} />
      <KakaoBanner />
      <ValueProps />
      <Footer />
    </main>
  );
}

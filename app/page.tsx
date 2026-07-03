import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Hero } from '@/components/landing/Hero';
import { QuickAccess } from '@/components/landing/QuickAccess';
import { TodayReport } from '@/components/landing/TodayReport';
import { CoreServices } from '@/components/landing/CoreServices';
import { TopLocations } from '@/components/landing/TopLocations';
import { SubscriptionList } from '@/components/landing/SubscriptionList';
import { ValueProps } from '@/components/landing/ValueProps';
import { TelegramBanner } from '@/components/landing/TelegramBanner';
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

      {/* 1. Hero — 사이클 U 다크 네이비 (티커 스트립 포함) */}
      <Hero ticker={MOCK_TICKER} />

      {/* 1.5 Quick Access — 히어로 밖 독립 섹션 (사이클 U) */}
      <section
        style={{
          maxWidth: 'var(--container-default)',
          margin: '0 auto',
          padding: '28px var(--page-padding) 0',
        }}
      >
        <QuickAccess />
      </section>

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

      {/* 7. TelegramBanner */}
      <TelegramBanner />

      {/* 8. VisitorStatsSlim — Footer 직전 */}
      <Suspense fallback={<VisitorStatsSlim initialStats={FALLBACK_STATS} />}>
        <VisitorStatsSlimSection />
      </Suspense>

      <Footer />
    </main>
  );
}

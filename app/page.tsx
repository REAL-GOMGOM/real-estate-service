import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CompactHero } from '@/components/landing/CompactHero';
import { FilterRail } from '@/components/landing/FilterRail';
import { DealFeed } from '@/components/landing/DealFeed';
import { RightRail } from '@/components/landing/RightRail';
import { SubscriptionList } from '@/components/landing/SubscriptionList';
import { TelegramBanner } from '@/components/landing/TelegramBanner';
import { VisitorStatsSlim } from '@/components/landing/VisitorStatsSlim';
import { MOCK_DISTRICTS, MOCK_DEALS } from '@/lib/mock-data';
import { getTopLocations } from '@/lib/region-data';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';
import { getStats } from '@/lib/visitor-tracking';

const FALLBACK_STATS = { today: 0, active24h: 0, total: 0 };

async function VisitorStatsSlimSection() {
  const stats = await getStats();
  return <VisitorStatsSlim initialStats={stats} />;
}

/**
 * 사이클 U 메인 — 시안 1a (피드 우선형).
 * 컴팩트 히어로 + 3컬럼(필터 레일 / 실거래 카드 피드 / 다크 리포트·TOP5 레일).
 */
export default async function HomePage() {
  const allItems = await fetchSubscriptions().catch(() => []);
  const subscriptions = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 3)
    .map(toSubscription);

  return (
    <main>
      <Header />

      {/* 1. 컴팩트 히어로 (시안 1a) */}
      <CompactHero />

      {/* 2. 3컬럼 본문 — 필터 레일 / 실거래 피드 / 우측 레일 */}
      <section
        className="mx-auto grid grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)_268px] gap-5"
        style={{
          maxWidth: '1280px',
          padding: '24px var(--page-padding) 32px',
        }}
      >
        <FilterRail />
        <DealFeed deals={MOCK_DEALS} />
        <RightRail districts={MOCK_DISTRICTS} topLocations={getTopLocations(5)} />
      </section>

      {/* 3. 청약 일정 */}
      <SubscriptionList items={subscriptions} />

      {/* 4. 텔레그램 채널 배너 */}
      <TelegramBanner />

      {/* 5. 방문자 통계 — Footer 직전 */}
      <Suspense fallback={<VisitorStatsSlim initialStats={FALLBACK_STATS} />}>
        <VisitorStatsSlimSection />
      </Suspense>

      <Footer />
    </main>
  );
}

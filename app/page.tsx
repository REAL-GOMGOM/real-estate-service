import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CompactHero } from '@/components/landing/CompactHero';
import { FeedSection } from '@/components/landing/FeedSection';
import { RightRail } from '@/components/landing/RightRail';
import { SubscriptionList } from '@/components/landing/SubscriptionList';
import { TelegramBanner } from '@/components/landing/TelegramBanner';
import { getTopLocations } from '@/lib/region-data';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';

/**
 * 메인 — 시안 1a (피드 우선형), 사이클 Z3 에서 방문자 카운터 제거.
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

      {/* 2. 3컬럼 본문 — 필터 레일 / 실거래 피드(실데이터) / 우측 레일(실집계) */}
      <FeedSection
        rightRail={<RightRail topLocations={getTopLocations(5)} />}
      />

      {/* 3. 청약 일정 */}
      <SubscriptionList items={subscriptions} />

      {/* 4. 텔레그램 채널 배너 */}
      <TelegramBanner />

      <Footer />
    </main>
  );
}

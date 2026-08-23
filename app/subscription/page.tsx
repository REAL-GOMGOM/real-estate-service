import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import SubscriptionClientPage from '@/components/subscription/page';
import { fetchSubscriptions } from '@/lib/subscription-api';
import type { SubscriptionItem } from '@/lib/types';

export default async function SubscriptionPage() {
  let items: SubscriptionItem[] = [];
  let dataStatus: 'ok' | 'partial' | 'degraded' = 'ok';
  let note: string | undefined;
  let coverage: Awaited<ReturnType<typeof fetchSubscriptions>>['coverage'] | undefined;
  try {
    const result = await fetchSubscriptions();
    items = result.items;
    dataStatus = result.status === 'unavailable' ? 'degraded' : result.status;
    note = result.note;
    coverage = result.coverage;
  } catch (error) {
    dataStatus = 'degraded';
    console.error('[subscription] data unavailable', error);
  }

  return (
    <>
      <Header />
      <SubscriptionClientPage
        items={items}
        dataStatus={dataStatus}
        note={note}
        coverage={coverage}
      />
      <Footer />
    </>
  );
}

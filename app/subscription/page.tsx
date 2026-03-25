import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import SubscriptionClientPage from '@/components/subscription/page';
import { fetchSubscriptions } from '@/lib/subscription-api';

export default async function SubscriptionPage() {
  let items = await fetchSubscriptions().catch(() => []);

  return (
    <>
      <Header />
      <SubscriptionClientPage items={items} />
      <Footer />
    </>
  );
}

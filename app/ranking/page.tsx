import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import RankingClientPage from '@/components/ranking/RankingClientPage';

export const metadata = { title: '주간 랭킹 | 내집' };

async function fetchRanking(path: string) {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const res = await fetch(`${base}/api/ranking/${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) return { period: '', data: [] };
    return await res.json();
  } catch {
    return { period: '', data: [] };
  }
}

export default async function RankingPage() {
  const [volume, price] = await Promise.all([
    fetchRanking('volume'),
    fetchRanking('price-change'),
  ]);

  return (
    <>
      <Header />
      <RankingClientPage
        volumeData={volume.data || []}
        volumePeriod={volume.period || ''}
        priceData={price.data || []}
        pricePeriod={price.period || ''}
      />
      <Footer />
    </>
  );
}

import { fetchSubscriptions } from '@/lib/subscription-api';

export async function GET() {
  try {
    const items = await fetchSubscriptions();
    return Response.json({ data: items, total: items.length }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (error) {
    console.error('[subscription API]', error instanceof Error ? error.message : error);
    return Response.json({ error: '청약 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

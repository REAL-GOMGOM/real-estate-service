import { connection } from 'next/server';
import { fetchSubscriptions } from '@/lib/subscription-api';

export async function GET() {
  await connection();
  try {
    const result = await fetchSubscriptions();
    const body = {
      status: result.status,
      data: result.items,
      total: result.items.length,
      coverage: result.coverage,
      note: result.note,
    };
    if (result.status === 'unavailable') {
      return Response.json(body, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return Response.json(body, {
      headers: {
        'Cache-Control': result.status === 'partial'
          ? 'no-store'
          : 's-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('[subscription API]', error instanceof Error ? error.message : error);
    return Response.json({
      status: 'unavailable',
      error: '청약 데이터를 불러올 수 없습니다',
    }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

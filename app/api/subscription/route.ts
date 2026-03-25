import { fetchSubscriptions } from '@/lib/subscription-api';

export async function GET() {
  try {
    const items = await fetchSubscriptions();
    return Response.json({ data: items, total: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[subscription API]', message);
    return Response.json({ error: '청약 데이터 조회 실패: ' + message }, { status: 500 });
  }
}

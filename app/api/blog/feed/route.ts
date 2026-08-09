import { connection } from 'next/server';
import { getRecentPublishedPostsForFeed } from '@/lib/blog/queries';

export async function GET() {
  // 홈 빌드가 외부 DB 상태에 종속되지 않도록 실제 요청 시점에만 조회한다.
  await connection();
  try {
    const items = await getRecentPublishedPostsForFeed(5);
    return Response.json({
      status: 'ok',
      data: items.map((item) => ({
        slug: item.slug,
        title: item.title,
        publishedAt: item.publishedAt.toISOString(),
        categoryName: item.categoryName,
      })),
    }, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('[blog/feed API]', error instanceof Error ? error.message : error);
    return Response.json({
      status: 'unavailable',
      error: '칼럼 목록을 불러올 수 없습니다',
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

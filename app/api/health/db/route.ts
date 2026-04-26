import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * 칼럼 시스템 DB 헬스체크 엔드포인트.
 *
 * 보안: CRON_SECRET 재사용 + fail-closed.
 * 응답: 최소화 (DB 호스트·버전 노출 X).
 *
 * 구현 메모: drizzle.execute()의 결과 형식 호환성 이슈 회피를 위해
 * raw neon() 드라이버 직접 사용. 본격 CRUD는 lib/db/client.ts의 drizzle 인스턴스로.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET missing' },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      { ok: false, error: 'DATABASE_URL missing' },
      { status: 500 },
    );
  }

  const startedAt = Date.now();
  try {
    const sql = neon(url);

    // 단순 ping
    await sql`SELECT 1`;
    const pingMs = Date.now() - startedAt;

    // posts·categories 테이블 존재 여부 (raw neon은 plain array 반환)
    const rows = (await sql`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('posts', 'categories')
    `) as Array<{ table_name: string }>;

    const tableNames = rows.map((r) => r.table_name);
    const hasPosts = tableNames.includes('posts');
    const hasCategories = tableNames.includes('categories');

    return NextResponse.json({
      ok: hasPosts && hasCategories,
      pingMs,
      tables: { posts: hasPosts, categories: hasCategories },
    });
  } catch (e) {
    console.error('[health/db] 에러:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

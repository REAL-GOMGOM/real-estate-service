import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';

/**
 * 칼럼 시스템 DB 헬스체크 엔드포인트.
 *
 * 보안: CRON_SECRET 재사용 (별도 secret ��가하지 않음).
 *       fail-closed — secret 미설정 시 500 반환.
 *
 * 응답 정보 최소화 — DB 호스트·버전 등 메타데이터 노출 X.
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

  const startedAt = Date.now();
  try {
    const db = getBlogDb();
    await db.execute(sql`SELECT 1`);
    const pingMs = Date.now() - startedAt;

    const tablesResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('posts', 'categories')
      ORDER BY table_name
    `);

    // neon-http 드라이버: 결과가 직접 배열 형태
    const tableNames = (tablesResult as unknown as { table_name: string }[]).map(
      (r) => r.table_name,
    );

    return NextResponse.json({
      ok: tableNames.includes('posts') && tableNames.includes('categories'),
      pingMs,
      tables: {
        posts: tableNames.includes('posts'),
        categories: tableNames.includes('categories'),
      },
    });
  } catch (e) {
    console.error('[health/db] 에러:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

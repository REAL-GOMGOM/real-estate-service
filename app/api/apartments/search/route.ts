import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

// `%`, `_`, `\\` 는 ILIKE 메타문자 — 사용자 입력은 escape 필요 (인젝션·풀스캔 방지)
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawQ           = searchParams.get('q')?.trim() ?? '';
  const limitParam     = searchParams.get('limit');

  if (rawQ.length === 0) {
    return NextResponse.json({ error: 'q parameter required' }, { status: 400 });
  }
  if (rawQ.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `q must be at least ${MIN_QUERY_LENGTH} characters` },
      { status: 400 },
    );
  }

  const q = rawQ.slice(0, MAX_QUERY_LENGTH);

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (Number.isFinite(parsed)) {
      limit = Math.max(1, Math.min(MAX_LIMIT, parsed));
    }
  }

  try {
    const db = getBlogDb();
    const rows = await db
      .select({
        id:      apartments.id,
        name:    apartments.name,
        sido:    apartments.sido,
        sigungu: apartments.sigungu,
        dong:    apartments.dong,
        lawdCd:  apartments.lawdCd,
      })
      .from(apartments)
      // 공백 무시 매칭 — 마스터 '철산자이 더 헤리티지'를 '철산자이더헤리티지'로도 찾도록
      .where(sql`replace(${apartments.name}, ' ', '') ILIKE ${'%' + escapeLike(q.replace(/\s+/g, '')) + '%'}`)
      .orderBy(sql`length(${apartments.name}) ASC`)
      .limit(limit);

    return NextResponse.json({
      results: rows,
      query:   q,
      count:   rows.length,
    });
  } catch (error) {
    console.error('[apartments/search] DB 조회 실패:', error);
    return NextResponse.json({ error: '검색에 실패했습니다' }, { status: 500 });
  }
}

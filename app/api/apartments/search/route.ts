import { NextRequest, NextResponse } from 'next/server';
import { cacheLife } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
import {
  APARTMENT_INDEX_ARTIFACT_NAME,
  APARTMENT_INDEX_MAX_AGE_MS,
  assertApartmentIndexEnvelope,
  isServingArtifactFresh,
  searchApartmentIndex,
  type ApartmentIndexItem,
} from '@/lib/public-snapshots/serving-artifacts';
import {
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
  type PublicSnapshotRuntime,
} from '@/lib/public-snapshots/runtime';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const SUCCESS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

// `%`, `_`, `\\` 는 ILIKE 메타문자 — 사용자 입력은 escape 필요 (인젝션·풀스캔 방지)
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function loadApartmentIndexSnapshot(): Promise<{
  index: ApartmentIndexItem[];
  generatedAt: string;
} | null> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const runtime: PublicSnapshotRuntime = createPublicSnapshotRuntimeFromEnv();
  const result = await runtime.getNamedArtifact<ApartmentIndexItem[]>(
    APARTMENT_INDEX_ARTIFACT_NAME,
  );
  if (result.status !== 'success') return null;
  try {
    assertApartmentIndexEnvelope(result.data);
    if (!isServingArtifactFresh(result.data.generatedAt, {
      maxAgeMs: APARTMENT_INDEX_MAX_AGE_MS,
    })) return null;
    return {
      index: result.data.data,
      generatedAt: result.data.generatedAt,
    };
  } catch {
    // The caller decides whether legacy DB fallback is allowed. Once public
    // serving is configured, a broken artifact must not resurrect stale Neon.
    console.warn('[apartments/search] apartment snapshot validation failed');
    return null;
  }
}

async function searchSnapshot(
  query: string,
  limit: number,
): Promise<{ rows: ApartmentIndexItem[]; generatedAt: string } | null> {
  const snapshot = await loadApartmentIndexSnapshot();
  if (snapshot === null) return null;
  return {
    rows: searchApartmentIndex(snapshot.index, query, { limit }),
    generatedAt: snapshot.generatedAt,
  };
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

  // All request validation/normalization above must complete before snapshot I/O.
  const snapshotRows = await searchSnapshot(q, limit);
  if (snapshotRows !== null) {
    const results = snapshotRows.rows.map(({ id, name, sido, sigungu, dong, lawdCd }) => ({
      id,
      name,
      sido,
      sigungu,
      dong,
      lawdCd,
    }));
    return NextResponse.json(
      { results, query: q, count: results.length },
      {
        headers: {
          'Cache-Control': SUCCESS_CACHE_CONTROL,
          'X-Naezip-Data-Source': 'snapshot',
          'X-Naezip-Snapshot-Generated-At': snapshotRows.generatedAt,
        },
      },
    );
  }

  if (isPublicSnapshotConfigured()) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: '검증된 단지 검색 스냅샷을 준비 중입니다',
        results: [],
        query: q,
        count: 0,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      },
    );
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

    return NextResponse.json(
      {
        results: rows,
        query:   q,
        count:   rows.length,
      },
      { headers: { 'Cache-Control': SUCCESS_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error('[apartments/search] DB 조회 실패:', error);
    return NextResponse.json({ error: '검색에 실패했습니다' }, { status: 500 });
  }
}

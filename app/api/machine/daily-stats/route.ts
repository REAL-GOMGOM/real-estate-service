import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { dailyStats } from '@/lib/db/schema';
import { verifyMachineToken } from '@/lib/api/machine-auth';

/**
 * 일별 공개분 수신 API — 사이클 AA (봇 공개분 연동)
 *
 * POST /api/machine/daily-stats
 * Body: { date: 'YYYY-MM-DD', regions: [{ label, count, newHighs }] }
 * 인증: Authorization: Bearer <MACHINE_PUBLISH_SECRET> (칼럼 발행과 동일)
 *
 * 아침 봇이 diff 산출 직후 호출. 같은 날짜 재전송은 upsert (멱등).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REGIONS = 30;

interface RegionRow { label: string; count: number; newHighs: number }

export async function POST(req: NextRequest) {
  const auth = verifyMachineToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { date?: string; regions?: RegionRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 });
  }

  const { date, regions } = body;
  if (!date || !DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: 'date 형식 오류 (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!Array.isArray(regions) || regions.length === 0 || regions.length > MAX_REGIONS) {
    return NextResponse.json({ error: 'regions 배열 필요 (1~30개)' }, { status: 400 });
  }
  for (const r of regions) {
    if (
      typeof r.label !== 'string' || r.label.length === 0 || r.label.length > 20 ||
      !Number.isInteger(r.count) || r.count < 0 ||
      !Number.isInteger(r.newHighs) || r.newHighs < 0
    ) {
      return NextResponse.json({ error: 'regions 항목 형식 오류' }, { status: 400 });
    }
  }

  const totalCount = regions.reduce((s, r) => s + r.count, 0);
  const totalNewHighs = regions.reduce((s, r) => s + r.newHighs, 0);

  try {
    const db = getBlogDb();
    await db
      .insert(dailyStats)
      .values({ date, regions, totalCount, totalNewHighs })
      .onConflictDoUpdate({
        target: dailyStats.date,
        set: {
          regions,
          totalCount,
          totalNewHighs,
          updatedAt: sql`now()`,
        },
      });

    return NextResponse.json({ ok: true, date, totalCount, totalNewHighs });
  } catch (e) {
    console.error('[machine/daily-stats] 저장 실패:', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

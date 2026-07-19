import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { getBlogDb } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';

/**
 * 구별 거래 현황 API — DB 전환 (2026-07-19).
 *
 * 기존: 그룹 내 전 구(경기 41개)를 MOLIT 실시간 병렬 조회 — 콜드 수 초~타임아웃.
 * 개편: 자체 원장(transactions) 당월 단일 조회 → 수백 ms. 취소 제외.
 * 간이 신고가: 동일 단지·면적 내 최신(계약일 기준) 거래가 기간 최고가면 집계.
 */

function currentMonth(): { yyyymm: string; fromDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { yyyymm: `${y}${m}`, fromDate: `${y}-${m}-01` };
}

export async function GET(req: NextRequest) {
  const groupLabel = req.nextUrl.searchParams.get('group')?.trim() ?? '';
  const group = DISTRICT_GROUPS.find((g) => g.label === groupLabel);
  if (!group) {
    return NextResponse.json({ error: '지원하지 않는 그룹: ' + groupLabel }, { status: 400 });
  }

  const { yyyymm, fromDate } = currentMonth();

  try {
    const db = getBlogDb();
    const rows = await db
      .select({
        sigungu:  transactions.sigungu,
        aptName:  transactions.aptName,
        areaM2:   transactions.areaM2,
        price:    transactions.dealAmount,
        dealDate: transactions.dealDate,
      })
      .from(transactions)
      .where(and(
        inArray(transactions.sigungu, [...group.districts]),
        gte(transactions.dealDate, fromDate),
        eq(transactions.isCanceled, false),
      ));

    // 구별 count + 간이 신고가 (계약일 오름차순 기준 최신가 = 기간 최고가)
    const byDistrict = new Map<string, Map<string, { max: number; latest: number; latestDate: string }>>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.sigungu, (counts.get(r.sigungu) ?? 0) + 1);
      let apts = byDistrict.get(r.sigungu);
      if (!apts) { apts = new Map(); byDistrict.set(r.sigungu, apts); }
      const key = `${r.aptName}-${Math.round(r.areaM2)}`;
      const cur = apts.get(key);
      if (!cur) {
        apts.set(key, { max: r.price, latest: r.price, latestDate: r.dealDate });
      } else {
        if (r.price > cur.max) cur.max = r.price;
        if (r.dealDate >= cur.latestDate) { cur.latest = r.price; cur.latestDate = r.dealDate; }
      }
    }

    const districts = group.districts.map((district) => {
      const apts = byDistrict.get(district);
      const newHighs = apts
        ? [...apts.values()].filter((v) => v.latest >= v.max && v.max > 0).length
        : 0;
      return { district, count: counts.get(district) ?? 0, newHighs };
    });

    // 아실형: 건수 많은 순 정렬
    districts.sort((a, b) => b.count - a.count);

    return NextResponse.json(
      { group: group.label, month: yyyymm, districts },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/districts API] 집계 실패:', error);
    return NextResponse.json({ error: '거래 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

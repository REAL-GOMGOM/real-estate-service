import { NextResponse, connection } from 'next/server';
import { and, eq, gte } from 'drizzle-orm';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { getBlogDb } from '@/lib/db/client';
import { dailyStats, transactions } from '@/lib/db/schema';
import { countNewHighs, type SummaryDeal } from '@/lib/summary-highs';

/**
 * 시도별 실거래 집계 API — DB 전환 (2026-07-19).
 *
 * 기존: 콜드 히트마다 전 시군구(~190개) MOLIT 실시간 배치 → 수십 초 +
 * 함수 타임아웃으로 간헐 500 (랜딩·특이실거래 로딩 사고의 뿌리).
 * 개편: 자체 원장(transactions) 당월 단일 조회 → 수백 ms.
 * sync 크론이 당월을 매일 재적재하므로 최대 1일 지연 — "오늘 공개분"은
 * 봇 dailyStats 가 담당(기존과 동일). 취소거래는 집계에서 제외(정확도 개선).
 */

function currentMonth(): { yyyymm: string; fromDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { yyyymm: `${y}${m}`, fromDate: `${y}-${m}-01` };
}

interface DistrictAgg {
  count:    number;
  newHighs: number;
  prices59: number[];
  prices84: number[];
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

export async function GET() {
  // 프리렌더 제외 (Cache Components 호환) — 빌드 시점 DB 조회 거부 에러 방지 (highlights 와 동일 패턴)
  await connection();

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
      .where(and(gte(transactions.dealDate, fromDate), eq(transactions.isCanceled, false)));

    // 구별 집계 — 기존과 동일 단위로 count·가격표본·신고가(countNewHighs) 산출
    const byDistrict = new Map<string, { agg: DistrictAgg; deals: SummaryDeal[] }>();
    for (const r of rows) {
      let e = byDistrict.get(r.sigungu);
      if (!e) {
        e = { agg: { count: 0, newHighs: 0, prices59: [], prices84: [] }, deals: [] };
        byDistrict.set(r.sigungu, e);
      }
      e.agg.count++;
      if (r.areaM2 >= 55 && r.areaM2 <= 63) e.agg.prices59.push(r.price);
      if (r.areaM2 >= 80 && r.areaM2 <= 88) e.agg.prices84.push(r.price);
      e.deals.push({
        aptName: r.aptName,
        area:    r.areaM2,
        price:   r.price,
        date:    r.dealDate.replace(/-/g, ''),
      });
    }
    byDistrict.forEach((e) => { e.agg.newHighs = countNewHighs(e.deals); });

    // 그룹(시도) 합산 — 응답 schema 기존과 동일 (프론트 무변경)
    const summary = DISTRICT_GROUPS.map((g) => {
      const acc: DistrictAgg = { count: 0, newHighs: 0, prices59: [], prices84: [] };
      for (const d of g.districts) {
        const e = byDistrict.get(d);
        if (!e) continue;
        acc.count += e.agg.count;
        acc.newHighs += e.agg.newHighs;
        acc.prices59.push(...e.agg.prices59);
        acc.prices84.push(...e.agg.prices84);
      }
      return {
        label:          g.label,
        districtCount:  g.districts.length,
        // 필드명은 프론트 호환 유지 — 의미는 "당월 실집계 (취소 제외)"
        estimatedCount: acc.count,
        sampleCount:    acc.count,
        newHighs:       acc.newHighs,
        avg59:          avg(acc.prices59),
        avg84:          avg(acc.prices84),
        firstDistrict:  g.districts[0],
      };
    });

    // 봇이 push 한 "오늘 공개분"이 있으면 병기 (사이클 AA — 기존 그대로)
    let daily: { date: string; totalCount: number; totalNewHighs: number } | null = null;
    try {
      const kstNow = new Date(Date.now() + 9 * 3600_000);
      const todayKst = kstNow.toISOString().slice(0, 10);
      const drows = await db.select().from(dailyStats).where(eq(dailyStats.date, todayKst)).limit(1);
      const row = drows[0];
      if (row) {
        daily = { date: row.date, totalCount: row.totalCount, totalNewHighs: row.totalNewHighs };
        const byLabel = new Map(row.regions.map((r) => [r.label, r]));
        for (const g of summary as (typeof summary[number] & { todayCount?: number; todayNewHighs?: number })[]) {
          const match = byLabel.get(g.label);
          if (match) {
            g.todayCount = match.count;
            g.todayNewHighs = match.newHighs;
          }
        }
      }
    } catch {
      // daily 는 부가 지표 — 조회 실패 시 월 누계만 제공
    }

    return NextResponse.json(
      {
        summary,
        daily,
        month: yyyymm,
        updatedAt: new Date().toISOString(),
        note: '자체 원장 당월 실집계 (취소 제외, 매일 갱신)',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('시도별 집계 실패:', error);
    return NextResponse.json({ error: '집계 실패' }, { status: 500 });
  }
}

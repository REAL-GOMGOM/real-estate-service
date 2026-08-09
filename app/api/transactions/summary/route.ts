import { NextRequest, NextResponse, connection } from 'next/server';
import { eq } from 'drizzle-orm';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { getBlogDb } from '@/lib/db/client';
import { dailyStats } from '@/lib/db/schema';
import { resolveAggWindow, kstCurrentYyyymm } from '@/lib/agg-window';
import { fetchDistrictAggs, fetchRentDistrictAggs, fetchSilvDistrictAggs } from '@/lib/agg-queries';

/**
 * 시도별 실거래 집계 API — SQL 푸시다운 전환 (2026-08-02).
 *
 * 기존(7/19 버전): 당월 원장 행 전체를 매 콜 전송 → JS 집계.
 *   ① 전송량 폭탄 (Neon 무료 5GB 소진의 주범 — 7/26 402 사고)
 *   ② "당월 계약" 고정이라 매달 1~5일은 빈 화면 (월초 공백)
 * 개편: 집계를 Postgres 안에서 끝내고 구 단위 결과만 전송 (~250행).
 *   윈도우 파라미터 지원 — ?window=rolling30(기본) | YYYYMM.
 * 신고가 의미론은 기존 countNewHighs 와 동일 (lib/agg-queries.ts 참조).
 *
 * 유형 탭 지원 (2026-08-02): ?dealType=jeonse|monthly 면 rent_transactions
 * 집계 — avg59/avg84 는 평균 보증금, avgRent59/84(월세만)는 평균 월세.
 * 전월세엔 신고가·봇 공개분(daily) 개념이 없어 newHighs=0, daily=null.
 * ?dealType=bunyang 은 silv_transactions 집계 — 의미론 매매와 동일
 * (신고가 포함, 취소 제외), daily 만 없음 (봇 집계는 매매 전용).
 */

function avgOf(sum: number, cnt: number): number | null {
  if (cnt === 0) return null;
  return Math.round(sum / cnt);
}

export async function GET(req: NextRequest) {
  // 프리렌더 제외 (Cache Components 호환) — 빌드 시점 DB 조회 거부 에러 방지
  await connection();

  const window = resolveAggWindow(req.nextUrl.searchParams.get('window'));
  if (!window) {
    return NextResponse.json(
      { error: 'window 는 rolling30 또는 YYYYMM(미래 월 불가) 형식입니다.' },
      { status: 400 },
    );
  }
  const yyyymm = window.type === 'month' ? window.yyyymm! : kstCurrentYyyymm();

  const dealTypeParam = req.nextUrl.searchParams.get('dealType');
  if (dealTypeParam && !['buy', 'jeonse', 'monthly', 'bunyang'].includes(dealTypeParam)) {
    return NextResponse.json(
      { error: 'dealType 은 buy(기본)·jeonse·monthly·bunyang 만 지원합니다.' },
      { status: 400 },
    );
  }
  const dealType = (dealTypeParam ?? 'buy') as 'buy' | 'jeonse' | 'monthly' | 'bunyang';

  try {
    // ── 분양권 집계 (2026-08-02) — 의미론 매매와 동일, daily 만 없음 ──
    if (dealType === 'bunyang') {
      const aggRows = await fetchSilvDistrictAggs(window.from, window.to);
      const byDistrict = new Map(aggRows.map((r) => [r.sigungu, r]));
      const summary = DISTRICT_GROUPS.map((g) => {
        let cnt = 0, newHighs = 0, sum59 = 0, cnt59 = 0, sum84 = 0, cnt84 = 0;
        for (const d of g.districts) {
          const e = byDistrict.get(d);
          if (!e) continue;
          cnt      += e.cnt;
          newHighs += e.newHighs;
          sum59    += e.sum59;
          cnt59    += e.cnt59;
          sum84    += e.sum84;
          cnt84    += e.cnt84;
        }
        return {
          label:          g.label,
          districtCount:  g.districts.length,
          estimatedCount: cnt,
          sampleCount:    cnt,
          newHighs,
          avg59:          avgOf(sum59, cnt59),
          avg84:          avgOf(sum84, cnt84),
          firstDistrict:  g.districts[0],
        };
      });
      return NextResponse.json(
        {
          status: 'ok',
          summary,
          daily: null,
          month: yyyymm,
          window: { type: window.type, from: window.from, to: window.to },
          updatedAt: new Date().toISOString(),
          note: `자체 분양권 원장 ${window.type === 'rolling30' ? '최근 30일' : '월별'} 실집계 (취소 제외)`,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
      );
    }

    // ── 전월세 유형 집계 (2026-08-02) — 신고가·daily 없음 ──
    if (dealType !== 'buy') {
      const rentRows = await fetchRentDistrictAggs(window.from, window.to, dealType);
      const byDistrict = new Map(rentRows.map((r) => [r.sigungu, r]));
      const summary = DISTRICT_GROUPS.map((g) => {
        let cnt = 0, sumDep59 = 0, cnt59 = 0, sumDep84 = 0, cnt84 = 0, sumRent59 = 0, sumRent84 = 0;
        for (const d of g.districts) {
          const e = byDistrict.get(d);
          if (!e) continue;
          cnt       += e.cnt;
          sumDep59  += e.sumDep59;
          cnt59     += e.cnt59;
          sumDep84  += e.sumDep84;
          cnt84     += e.cnt84;
          sumRent59 += e.sumRent59;
          sumRent84 += e.sumRent84;
        }
        return {
          label:          g.label,
          districtCount:  g.districts.length,
          estimatedCount: cnt,
          sampleCount:    cnt,
          newHighs:       0,
          // avg59/84 = 평균 보증금 (프론트 카드 슬롯 재사용)
          avg59:          avgOf(sumDep59, cnt59),
          avg84:          avgOf(sumDep84, cnt84),
          ...(dealType === 'monthly'
            ? { avgRent59: avgOf(sumRent59, cnt59), avgRent84: avgOf(sumRent84, cnt84) }
            : {}),
          firstDistrict:  g.districts[0],
        };
      });
      return NextResponse.json(
        {
          status: 'ok',
          summary,
          daily: null,
          month: yyyymm,
          window: { type: window.type, from: window.from, to: window.to },
          updatedAt: new Date().toISOString(),
          note: `자체 전월세 원장 ${window.type === 'rolling30' ? '최근 30일' : '월별'} 실집계`,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
      );
    }

    const aggRows = await fetchDistrictAggs(window.from, window.to);
    const byDistrict = new Map(aggRows.map((r) => [r.sigungu, r]));

    // 그룹(시도) 합산 — 응답 schema 기존과 동일 (프론트 무변경)
    const summary = DISTRICT_GROUPS.map((g) => {
      let cnt = 0, newHighs = 0, sum59 = 0, cnt59 = 0, sum84 = 0, cnt84 = 0;
      for (const d of g.districts) {
        const e = byDistrict.get(d);
        if (!e) continue;
        cnt      += e.cnt;
        newHighs += e.newHighs;
        sum59    += e.sum59;
        cnt59    += e.cnt59;
        sum84    += e.sum84;
        cnt84    += e.cnt84;
      }
      return {
        label:          g.label,
        districtCount:  g.districts.length,
        // 필드명은 프론트 호환 유지 — 의미는 "윈도우 내 실집계 (취소 제외)"
        estimatedCount: cnt,
        sampleCount:    cnt,
        newHighs,
        avg59:          avgOf(sum59, cnt59),
        avg84:          avgOf(sum84, cnt84),
        firstDistrict:  g.districts[0],
      };
    });

    // 봇이 push 한 "오늘 공개분"이 있으면 병기 (사이클 AA — 기존 그대로)
    let daily: { date: string; totalCount: number; totalNewHighs: number } | null = null;
    try {
      const db = getBlogDb();
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
      // daily 는 부가 지표 — 조회 실패 시 윈도우 집계만 제공
    }

    return NextResponse.json(
      {
        status: 'ok',
        summary,
        daily,
        month: yyyymm,
        window: { type: window.type, from: window.from, to: window.to },
        updatedAt: new Date().toISOString(),
        note: window.type === 'rolling30'
          ? '자체 원장 최근 30일 실집계 (취소 제외)'
          : '자체 원장 월별 실집계 (취소 제외)',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    // DB 불가(전송량 차단 등) 시 500 대신 빈 집계로 우아하게 강등 —
    // 랜딩·크롤러가 에러 페이지를 만나지 않게. 짧은 캐시로 복구 시 빠른 재반영.
    console.error('시도별 집계 실패 — 빈 집계 강등:', error);
    return NextResponse.json(
      {
        status: 'degraded',
        summary: [],
        daily: null,
        month: yyyymm,
        window: { type: window.type, from: window.from, to: window.to },
        updatedAt: new Date().toISOString(),
        note: '집계 데이터 일시 점검 중입니다. 잠시 후 다시 확인해주세요.',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  }
}

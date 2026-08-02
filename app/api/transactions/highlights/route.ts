import { NextRequest, NextResponse, connection } from 'next/server';
import { inArray } from 'drizzle-orm';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';
import { resolveAggWindow, kstCurrentYyyymm } from '@/lib/agg-window';
import { fetchHighlightLists, type RawHighlightRow } from '@/lib/agg-queries';

/**
 * 오늘의 주요거래 API — SQL 푸시다운 전환 (2026-08-02).
 *
 * 기존(7/19 버전): 당월 원장 행 전체 전송 → JS 선정 (전송량 폭탄 + 월초 공백).
 * 개편: 신고가·급등·국평 선정을 Postgres 에서 끝내고 카테고리당 최대
 * PER_CATEGORY 행만 전송. ?window=rolling30(기본)|YYYYMM 지원.
 * 선정 의미론은 기존 그대로 (lib/agg-queries.ts fetchHighlightLists 참조).
 */

const PER_CATEGORY = 8;

interface Deal {
  district: string;
  apt:      string;
  area:     number;
  floor:    number;
  price:    number;
  date:     string;
  /** 단지 마스터 PK — 있으면 프론트가 /apt/[id] 전용 페이지로 링크 (사이클 JJ) */
  masterId?: string | null;
}

/** 원시 행 → Deal (일자 '00'(일 미상)이면 월까지만 · floor 0/null 은 1층 폴백 — 기존 규칙) */
function toDeal(r: RawHighlightRow): Deal {
  return {
    district: r.sigungu,
    apt:      r.aptName,
    area:     r.area,
    floor:    r.floor || 1,
    price:    r.price,
    date:     r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate,
  };
}

/**
 * 최종 하이라이트(최대 24건)에 단지 마스터 id 부여 — fail-open.
 * 대상 구의 lawd_cd 로 일괄 조회 후 등록명·별칭·정제명 매칭 (transactions API 와 동일 규칙).
 */
async function attachMasterIds(deals: Deal[]): Promise<void> {
  if (deals.length === 0) return;
  try {
    const lawdCds = [...new Set(deals.map((d) => DISTRICT_CODE[d.district]).filter(Boolean))];
    const rows = await getBlogDb()
      .select({
        id:      apartments.id,
        name:    apartments.name,
        aliases: apartments.aliases,
        lawdCd:  apartments.lawdCd,
      })
      .from(apartments)
      .where(inArray(apartments.lawdCd, lawdCds));

    // lawdCd 별 이름 → id 매핑
    const byLawd = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!byLawd.has(r.lawdCd)) byLawd.set(r.lawdCd, new Map());
      const m = byLawd.get(r.lawdCd)!;
      if (!m.has(r.name)) m.set(r.name, r.id);
      for (const alias of r.aliases ?? []) {
        if (!m.has(alias)) m.set(alias, r.id);
      }
    }

    for (const d of deals) {
      const m = byLawd.get(DISTRICT_CODE[d.district]);
      if (!m) continue;
      d.masterId = m.get(d.apt) ?? m.get(normalizeMLTMName(d.apt)) ?? null;
    }
  } catch (e) {
    console.error('[highlights API] 마스터 조인 실패 (fail-open):', e);
  }
}

export async function GET(req: NextRequest) {
  // 프리렌더 제외 (Cache Components 호환 방식 — 기존 그대로)
  await connection();

  const window = resolveAggWindow(req.nextUrl.searchParams.get('window'));
  if (!window) {
    return NextResponse.json(
      { error: 'window 는 rolling30 또는 YYYYMM(미래 월 불가) 형식입니다.' },
      { status: 400 },
    );
  }
  const yyyymm = window.type === 'month' ? window.yyyymm! : kstCurrentYyyymm();

  try {
    const lists = await fetchHighlightLists(window.from, window.to, PER_CATEGORY);

    const topNewHighs = lists.newHighs.map((r) => ({ ...toDeal(r), prevHigh: r.prevHigh ?? 0 }));
    const topSurges   = lists.surges.map((r) => {
      const prevPrice = r.prevPrice ?? 0;
      return {
        ...toDeal(r),
        prevPrice,
        // 기존 JS 와 동일: 소수 1자리 반올림 상승률
        ratePct: prevPrice > 0 ? Math.round(((r.price - prevPrice) / prevPrice) * 1000) / 10 : 0,
      };
    });
    const pyeong84 = lists.pyeong84.map(toDeal);

    // 최종 결과에만 단지 마스터 id 부여 (사이클 JJ — 단지 페이지 내부 링크)
    await attachMasterIds([...topNewHighs, ...topSurges, ...pyeong84]);

    return NextResponse.json(
      {
        month: yyyymm,
        window: { type: window.type, from: window.from, to: window.to },
        coverage: window.type === 'rolling30'
          ? '등록 시군구 전체 · 최근 30일 신고분 (자체 원장, 취소 제외)'
          : '등록 시군구 전체 · 월별 신고분 (자체 원장, 취소 제외)',
        newHighs: topNewHighs,
        surges:   topSurges,
        pyeong84,
        updatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    // DB 불가 시 빈 집계 강등 (500 방지) — 짧은 캐시로 복구 시 빠른 재반영
    console.error('[transactions/highlights API] 집계 실패 — 빈 집계 강등:', error);
    return NextResponse.json(
      {
        month: yyyymm,
        coverage: '집계 데이터 일시 점검 중',
        newHighs: [],
        surges: [],
        pyeong84: [],
        updatedAt: new Date().toISOString(),
        note: '집계 데이터 일시 점검 중입니다. 잠시 후 다시 확인해주세요.',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  }
}

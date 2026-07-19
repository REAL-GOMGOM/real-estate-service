import { NextResponse, connection } from 'next/server';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getBlogDb } from '@/lib/db/client';
import { apartments, transactions } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';

/**
 * 오늘의 주요거래 API — DB 전환 (2026-07-19).
 *
 * 기존: 콜드 히트마다 전 시군구(~190개) MOLIT 실시간 배치 → 수십 초 +
 * 함수 타임아웃 간헐 500 ("특이실거래 진입 불가" 사고의 원인).
 * 개편: 자체 원장(transactions) 당월 단일 조회 → 수백 ms. 취소 제외.
 * 하이라이트 선정 로직(신고가·급등·국평 TOP)은 기존 그대로.
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

function currentMonth(): { yyyymm: string; fromDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { yyyymm: `${y}${m}`, fromDate: `${y}-${m}-01` };
}

export async function GET() {
  // 프리렌더 제외 (Cache Components 호환 방식 — 기존 그대로)
  await connection();

  const { yyyymm, fromDate } = currentMonth();

  try {
    const db = getBlogDb();
    const rows = await db
      .select({
        sigungu:  transactions.sigungu,
        aptName:  transactions.aptName,
        areaM2:   transactions.areaM2,
        floor:    transactions.floor,
        price:    transactions.dealAmount,
        dealDate: transactions.dealDate,
      })
      .from(transactions)
      .where(and(gte(transactions.dealDate, fromDate), eq(transactions.isCanceled, false)));

    // DB 행 → Deal (기존 parseDeals 와 동일 포맷 — 일자 '00' 이면 월까지만)
    const all: Deal[] = rows.map((r) => ({
      district: r.sigungu,
      apt:      r.aptName,
      area:     Math.round(r.areaM2),
      floor:    r.floor || 1,
      price:    r.price,
      date:     r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate,
    }));

    // 단지·면적 키로 이력 그룹 (이하 선정 로직은 기존 그대로)
    const byApt = new Map<string, Deal[]>();
    all.forEach((d) => {
      const key = `${d.district}|${d.apt}|${d.area}`;
      if (!byApt.has(key)) byApt.set(key, []);
      byApt.get(key)!.push(d);
    });

    const newHighs: (Deal & { prevHigh: number })[] = [];
    const surges:   (Deal & { prevPrice: number; ratePct: number })[] = [];

    byApt.forEach((deals) => {
      if (deals.length < 2) return;
      const sorted = [...deals].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const others = sorted.slice(1);
      const prevMax = Math.max(...others.map((d) => d.price));

      if (latest.price >= prevMax) {
        newHighs.push({ ...latest, prevHigh: prevMax });
      }
      const prev = others[0];
      if (prev && prev.price > 0 && latest.price > prev.price) {
        surges.push({
          ...latest,
          prevPrice: prev.price,
          ratePct: Math.round(((latest.price - prev.price) / prev.price) * 1000) / 10,
        });
      }
    });

    newHighs.sort((a, b) => b.price - a.price);
    surges.sort((a, b) => b.ratePct - a.ratePct);

    // 국평 고가 — 80~88㎡ 최고가 (단지당 1건)
    const seen = new Set<string>();
    const pyeong84 = all
      .filter((d) => d.area >= 80 && d.area <= 88)
      .sort((a, b) => b.price - a.price)
      .filter((d) => {
        const key = `${d.district}|${d.apt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, PER_CATEGORY);

    const topNewHighs = newHighs.slice(0, PER_CATEGORY);
    const topSurges   = surges.slice(0, PER_CATEGORY);

    // 최종 결과에만 단지 마스터 id 부여 (사이클 JJ — 단지 페이지 내부 링크)
    await attachMasterIds([...topNewHighs, ...topSurges, ...pyeong84]);

    return NextResponse.json(
      {
        month: yyyymm,
        coverage: '등록 시군구 전체 기준 (자체 원장, 취소 제외)',
        newHighs: topNewHighs,
        surges:   topSurges,
        pyeong84,
        updatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/highlights API] 집계 실패:', error);
    return NextResponse.json({ error: '주요거래 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

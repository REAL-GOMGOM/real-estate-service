import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { fetchMolitXml } from '@/lib/molit-fetch';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';

/**
 * 오늘의 주요거래 API — 사이클 X (최종 디자인 TURN 4)
 *
 * GET /api/transactions/highlights
 * → 최근 1개월 공개분에서 3개 카테고리 하이라이트:
 *   newHighs  — 신고가 (동일 단지·면적 최신가 = 기간 최고가, 2건 이상)
 *   surges    — 급등 (직전 거래 대비 상승률 TOP)
 *   pyeong84  — 국평(84㎡) 고가 TOP
 *
 * 커버리지: 등록 시군구 전체 (summary 와 동일 URL 조회 → Next data cache 공유).
 */

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
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

function latestMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseDeals(xml: string, district: string): Deal[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const deals: Deal[] = [];
  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = Math.round(parseFloat(get('excluUseAr')));
    const aptNm = get('aptNm');
    const year  = get('dealYear');
    const month = get('dealMonth').padStart(2, '0');
    const day   = get('dealDay').padStart(2, '0');
    const floor = parseInt(get('floor')) || 1;
    if (!price || !area || !aptNm || !year) return;
    deals.push({
      district, apt: aptNm, area, floor, price,
      date: `${year}-${month}${day !== '00' ? '-' + day : ''}`,
    });
  });
  return deals;
}

export async function GET() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/highlights API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '주요거래 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const yyyymm = latestMonth();

  // 등록 전 시군구 — summary 와 동일 URL 조회 (Next Data Cache 공유로 저비용)
  const targets: string[] = DISTRICT_GROUPS.flatMap((g) =>
    g.districts.filter((d) => DISTRICT_CODE[d])
  );

  const all: Deal[] = [];
  const BATCH = 15; // MOLIT 부하 보호 (summary 와 동일 정책)
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map(async (district) => {
        const lawdCd = DISTRICT_CODE[district];
        const params = new URLSearchParams({
          LAWD_CD: lawdCd, DEAL_YMD: yyyymm, numOfRows: '1000', pageNo: '1',
        });
        try {
          const xml = await fetchMolitXml(BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString(), 21600);
          all.push(...parseDeals(xml, district));
        } catch {
          // 개별 구 실패 fail-open
        }
      })
    );
  }

  // 단지·면적 키로 이력 그룹
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
      coverage: '등록 시군구 전체 기준',
      newHighs: topNewHighs,
      surges:   topSurges,
      pyeong84,
      updatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } }
  );
}

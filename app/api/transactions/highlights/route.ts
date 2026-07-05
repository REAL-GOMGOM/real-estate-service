import { NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

/**
 * 오늘의 주요거래 API — 사이클 X (최종 디자인 TURN 4)
 *
 * GET /api/transactions/highlights
 * → 최근 1개월 공개분에서 3개 카테고리 하이라이트:
 *   newHighs  — 신고가 (동일 단지·면적 최신가 = 기간 최고가, 2건 이상)
 *   surges    — 급등 (직전 거래 대비 상승률 TOP)
 *   pyeong84  — 국평(84㎡) 고가 TOP
 *
 * 커버리지: 시도별 대표 2개 구 (summary 와 동일 URL 조회 → Next data cache 공유).
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

  // 시도별 대표 2개 구 — summary 와 동일 커버리지·동일 URL (캐시 공유)
  const targets: string[] = DISTRICT_GROUPS.flatMap((g) => g.districts.slice(0, 2));

  const all: Deal[] = [];
  await Promise.all(
    targets.map(async (district) => {
      const lawdCd = DISTRICT_CODE[district];
      if (!lawdCd) return;
      const params = new URLSearchParams({
        LAWD_CD: lawdCd, DEAL_YMD: yyyymm, numOfRows: '1000', pageNo: '1',
      });
      try {
        const xml = await fetch(BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString(), {
          next: { revalidate: 21600 },
        }).then((r) => r.text());
        all.push(...parseDeals(xml, district));
      } catch {
        // 개별 구 실패 fail-open
      }
    })
  );

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

  return NextResponse.json(
    {
      month: yyyymm,
      coverage: '시도별 대표 구 기준',
      newHighs: newHighs.slice(0, PER_CATEGORY),
      surges:   surges.slice(0, PER_CATEGORY),
      pyeong84,
      updatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } }
  );
}

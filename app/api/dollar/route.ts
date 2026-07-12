import { NextRequest } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getExchangeRates } from '@/lib/exchange-rate';
import { getBtcKrw, getGoldKrwPerGram, TROY_OZ_TO_GRAM } from '@/lib/asset-rates';
import {
  type DealRow,
  monthsForYear,
  fallbackMonths,
  filterByArea,
  availableAreas,
  averagePrice,
} from '@/lib/dollar-shared';

const TRADE_API_BASE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

/** 공백 제거 후 비교 — "래미안 대치팰리스" vs "래미안대치팰리스" 허용 */
function normalize(s: string) {
  return s.replace(/\s/g, '');
}

/** XML → 단지 매칭 거래 {price, area} 목록 (2026-07-12: 평형 지원 위해 area 파싱 추가) */
function parseXmlDeals(xml: string, aptNameQuery: string): DealRow[] {
  const deals: DealRow[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const normQuery = normalize(aptNameQuery);

  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';

    const aptNm     = get('aptNm');
    const normAptNm = normalize(aptNm);
    if (!normAptNm.includes(normQuery) && !normQuery.includes(normAptNm)) continue;

    const price = parseInt(get('dealAmount').replace(/,/g, ''), 10);
    const area  = parseFloat(get('excluUseAr'));
    if (!isNaN(price) && price > 0) {
      deals.push({ price, area: isNaN(area) ? 0 : area });
    }
  }
  return deals;
}

async function fetchMonthDeals(
  lawdCd:   string,
  yyyymm:   string,
  aptName:  string,
  apiKey:   string,
): Promise<DealRow[]> {
  const params = new URLSearchParams({
    LAWD_CD:   lawdCd,
    DEAL_YMD:  yyyymm,
    numOfRows: '100',
    pageNo:    '1',
  });
  const url = `${TRADE_API_BASE}?serviceKey=${apiKey}&${params}`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next:   { revalidate: 86400 },
    });
    const xml = await res.text();
    return parseXmlDeals(xml, aptName);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchYearDeals(
  lawdCd: string, year: number, aptName: string, apiKey: string, now: Date,
): Promise<DealRow[]> {
  const primary = await Promise.allSettled(
    monthsForYear(year, now).map((mm) => fetchMonthDeals(lawdCd, `${year}${mm}`, aptName, apiKey)),
  );
  let deals = primary.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (deals.length === 0) {
    const fb = await Promise.allSettled(
      fallbackMonths(year, now).map((mm) => fetchMonthDeals(lawdCd, `${year}${mm}`, aptName, apiKey)),
    );
    deals = fb.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }
  return deals;
}

/**
 * 현재 연도 라이브 시세 — CoinGecko (BTC·PAXG, /api/crypto 와 동일 소스).
 * BTC의 krw/usd 비율로 실시간 환율까지 도출. 실패 시 null (정적 잠정치 유지).
 */
async function fetchLiveRates(): Promise<{ btcKrw: number; goldKrwPerGram: number; usdKrw: number } | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold&vs_currencies=usd,krw',
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const btcKrw  = json?.bitcoin?.krw;
    const btcUsd  = json?.bitcoin?.usd;
    const paxgKrw = json?.['pax-gold']?.krw;
    if (!btcKrw || !btcUsd || !paxgKrw) return null;
    return {
      btcKrw,
      goldKrwPerGram: paxgKrw / TROY_OZ_TO_GRAM,
      usdKrw: btcKrw / btcUsd,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const district    = searchParams.get('district') ?? '';
  const aptName     = searchParams.get('aptName')  ?? '';
  const baseYear    = parseInt(searchParams.get('baseYear')    ?? '2020', 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? String(new Date().getFullYear()), 10);
  const areaParam   = searchParams.get('area');
  const area        = areaParam ? parseInt(areaParam, 10) : null;

  if (!district || !aptName) {
    return Response.json({ error: 'district, aptName 파라미터가 필요합니다' }, { status: 400 });
  }

  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return Response.json({ error: `지원하지 않는 구: ${district}` }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[dollar API] PUBLIC_DATA_API_KEY 환경변수 미설정');
    return Response.json({ error: '데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  const now = new Date();
  const curYear = now.getFullYear();

  const [baseDeals, compareDeals] = await Promise.all([
    fetchYearDeals(lawdCd, baseYear, aptName, apiKey, now),
    fetchYearDeals(lawdCd, compareYear, aptName, apiKey, now),
  ]);

  // 평형 목록: 양 연도 등장 평형 합집합 (건수는 비교 연도 우선 표기용)
  const areaMap = new Map<number, number>();
  for (const { area: a, count } of availableAreas(compareDeals)) areaMap.set(a, count);
  for (const { area: a } of availableAreas(baseDeals)) if (!areaMap.has(a)) areaMap.set(a, 0);
  const areas = [...areaMap.entries()]
    .map(([a, count]) => ({ area: a, count }))
    .sort((x, y) => x.area - y.area);

  const basePriceKrw    = averagePrice(filterByArea(baseDeals, area));
  const comparePriceKrw = averagePrice(filterByArea(compareDeals, area));

  const [rates, live] = await Promise.all([
    getExchangeRates([baseYear, compareYear]),
    (baseYear === curYear || compareYear === curYear) ? fetchLiveRates() : Promise.resolve(null),
  ]);

  // 현재 연도는 라이브 시세 우선 (연중 잠정 static 은 폴백)
  const btcFor  = (y: number) => (y === curYear && live ? Math.round(live.btcKrw) : getBtcKrw(y));
  const goldFor = (y: number) => (y === curYear && live ? Math.round(live.goldKrwPerGram) : getGoldKrwPerGram(y));
  const rateFor = (y: number, fallback: number) =>
    y === curYear && live ? Math.round(live.usdKrw) : (rates[y] ?? fallback);

  return Response.json({
    aptName,
    district,
    baseYear,
    compareYear,
    basePriceKrw,
    comparePriceKrw,
    baseExchangeRate:      rateFor(baseYear, 1180),
    compareExchangeRate:   rateFor(compareYear, 1470),
    baseBtcKrw:            btcFor(baseYear),
    compareBtcKrw:         btcFor(compareYear),
    baseGoldKrwPerGram:    goldFor(baseYear),
    compareGoldKrwPerGram: goldFor(compareYear),
    // 2026-07-12 추가 — 평형 선택·연중 라벨용
    area,
    availableAreas: areas,
    baseIsYtd:    baseYear === curYear,
    compareIsYtd: compareYear === curYear,
  });
}

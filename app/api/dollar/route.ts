import { NextRequest } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getExchangeRates } from '@/lib/exchange-rate';
import { getBtcKrw, getGoldKrwPerGram } from '@/lib/asset-rates';

const TRADE_API_BASE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// Q4: 연도별 대표 거래 시점 (10·11·12월)
const Q4_MONTHS    = ['10', '11', '12'];
// Q4 데이터 없을 때 fallback: 상반기 포함 (01~09월)
const FULL_MONTHS  = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];

/** 공백 제거 후 비교 — "래미안 대치팰리스" vs "래미안대치팰리스" 허용 */
function normalize(s: string) {
  return s.replace(/\s/g, '');
}

function parseXmlPrices(xml: string, aptNameQuery: string): number[] {
  const prices: number[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const normQuery = normalize(aptNameQuery);

  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';

    const aptNm     = get('aptNm');
    const normAptNm = normalize(aptNm);
    // 정방향(API명이 쿼리를 포함) 또는 역방향(쿼리가 API명을 포함) 모두 허용
    if (!normAptNm.includes(normQuery) && !normQuery.includes(normAptNm)) continue;

    const price = parseInt(get('dealAmount').replace(/,/g, ''), 10);
    if (!isNaN(price) && price > 0) prices.push(price);
  }
  return prices;
}

async function fetchMonthAvg(
  lawdCd:   string,
  yyyymm:   string,
  aptName:  string,
  apiKey:   string,
): Promise<number[]> {
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
    return parseXmlPrices(xml, aptName);
  } finally {
    clearTimeout(timeoutId);
  }
}

function average(prices: number[]): number | null {
  if (prices.length === 0) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const district    = searchParams.get('district') ?? '';
  const aptName     = searchParams.get('aptName')  ?? '';
  const baseYear    = parseInt(searchParams.get('baseYear')    ?? '2020', 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? '2025', 10);

  if (!district || !aptName) {
    return Response.json({ error: 'district, aptName 파라미터가 필요합니다' }, { status: 400 });
  }

  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return Response.json({ error: `지원하지 않는 구: ${district}` }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    return Response.json({ error: 'PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  // Q4 6개월 병렬 fetch (baseYear 3개월 + compareYear 3개월)
  const q4Tasks = [
    ...Q4_MONTHS.map((mm) => fetchMonthAvg(lawdCd, `${baseYear}${mm}`,    aptName, apiKey)),
    ...Q4_MONTHS.map((mm) => fetchMonthAvg(lawdCd, `${compareYear}${mm}`, aptName, apiKey)),
  ];

  const q4Results = await Promise.allSettled(q4Tasks);
  const q4Prices  = q4Results.map((r) => r.status === 'fulfilled' ? r.value : []);

  let basePrices    = q4Prices.slice(0, 3).flat();
  let comparePrices = q4Prices.slice(3, 6).flat();

  // Q4에 해당 단지 거래 없으면 1~9월 전체로 fallback (연도별 독립 처리)
  async function fullYearFallback(year: number): Promise<number[]> {
    const results = await Promise.allSettled(
      FULL_MONTHS.map((mm) => fetchMonthAvg(lawdCd, `${year}${mm}`, aptName, apiKey)),
    );
    return results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
  }

  if (basePrices.length === 0)    basePrices    = await fullYearFallback(baseYear);
  if (comparePrices.length === 0) comparePrices = await fullYearFallback(compareYear);

  const [rates] = await Promise.all([
    getExchangeRates([baseYear, compareYear]),
  ]);

  return Response.json({
    aptName,
    district,
    baseYear,
    compareYear,
    basePriceKrw:          average(basePrices),
    comparePriceKrw:       average(comparePrices),
    baseExchangeRate:      rates[baseYear]    ?? 1180,
    compareExchangeRate:   rates[compareYear] ?? 1470,
    baseBtcKrw:            getBtcKrw(baseYear),
    compareBtcKrw:         getBtcKrw(compareYear),
    baseGoldKrwPerGram:    getGoldKrwPerGram(baseYear),
    compareGoldKrwPerGram: getGoldKrwPerGram(compareYear),
  });
}

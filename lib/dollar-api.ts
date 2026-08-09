import { getBtcKrw, getGoldKrwPerGram, TROY_OZ_TO_GRAM } from '@/lib/asset-rates';
import { AVAILABLE_YEARS, type ExchangeRateQuote } from '@/lib/exchange-rate';
import { fetchTradeMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import {
  fallbackMonths,
  monthsForYear,
  type DealRow,
} from '@/lib/dollar-shared';
import type { DollarQuoteProvenance, DollarTransactionWindow } from '@/lib/types';
import { kstTodayIso } from '@/lib/agg-window';

const MIN_AREA_M2 = 1;
const MAX_AREA_M2 = 500;
const MAX_APARTMENT_QUERY_LENGTH = 80;

export interface DollarQuery {
  district: string;
  aptName: string;
  baseYear: number;
  compareYear: number;
  area: number | null;
}

export type DollarQueryResult =
  | { ok: true; value: DollarQuery }
  | { ok: false; error: string };

export interface ParsedDollarDeals {
  deals: DealRow[];
  canceledExcluded: number;
}

export interface DollarYearDeals {
  deals: DealRow[];
  window: Omit<DollarTransactionWindow, 'sampleCount' | 'allAreaSampleCount'>;
  hasUsableResponse: boolean;
}

export interface DollarLiveRates {
  btcKrw: number;
  goldKrwPerGram: number;
  /** CoinGecko의 동일 BTC 호가(KRW/USD) 비율로 역산한 참고 환율. */
  usdKrwImplied: number;
  fetchedAt: string;
}

export type DollarLiveRatesResult =
  | { ok: true; value: DollarLiveRates }
  | { ok: false; error: string };

function parseYear(raw: string | null, fallback: number): number | null {
  const value = raw ?? String(fallback);
  if (!/^\d{4}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * 달러 비교 API 입력 계약. `parseInt`식 부분 파싱을 허용하지 않는다.
 */
export function parseDollarQuery(
  searchParams: URLSearchParams,
  now: Date = new Date(),
): DollarQueryResult {
  const district = (searchParams.get('district') ?? '').trim();
  const aptName = (searchParams.get('aptName') ?? '').trim();

  if (!district || !aptName) {
    return { ok: false, error: 'district, aptName 파라미터가 필요합니다.' };
  }
  if (district.length > 20 || aptName.length > MAX_APARTMENT_QUERY_LENGTH) {
    return { ok: false, error: '지역명 또는 단지명이 너무 깁니다.' };
  }

  const currentYear = Number(kstTodayIso(now).slice(0, 4));
  const minYear = Math.min(...AVAILABLE_YEARS);
  const baseYear = parseYear(searchParams.get('baseYear'), 2020);
  const compareYear = parseYear(searchParams.get('compareYear'), currentYear);

  if (
    baseYear === null
    || compareYear === null
    || baseYear < minYear
    || compareYear > currentYear
    || !AVAILABLE_YEARS.includes(baseYear)
    || !AVAILABLE_YEARS.includes(compareYear)
  ) {
    return {
      ok: false,
      error: `조회 연도는 ${minYear}년부터 ${currentYear}년까지의 지원 연도여야 합니다.`,
    };
  }
  if (baseYear >= compareYear) {
    return { ok: false, error: '기준 연도는 비교 연도보다 앞서야 합니다.' };
  }

  const rawArea = searchParams.get('area');
  let area: number | null = null;
  if (rawArea !== null) {
    if (!/^\d{1,3}$/.test(rawArea)) {
      return { ok: false, error: '전용면적은 정수(㎡)로 입력해야 합니다.' };
    }
    area = Number(rawArea);
    if (area < MIN_AREA_M2 || area > MAX_AREA_M2) {
      return {
        ok: false,
        error: `전용면적은 ${MIN_AREA_M2}㎡ 이상 ${MAX_AREA_M2}㎡ 이하여야 합니다.`,
      };
    }
  }

  return { ok: true, value: { district, aptName, baseYear, compareYear, area } };
}

function normalizeApartmentName(value: string): string {
  return value.replace(/\s/g, '');
}

function readXmlTag(item: string, tag: string): string {
  return item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';
}

/**
 * MOLIT XML에서 공백 제거 후 단지명이 부분 일치하는 유효 거래만 추출한다.
 * 해제 표시(`cdealType=O`) 또는 해제일이 있는 거래는 통계에서 제외한다.
 */
export function parseDollarDealsXml(xml: string, aptNameQuery: string): ParsedDollarDeals {
  const deals: DealRow[] = [];
  let canceledExcluded = 0;
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const normalizedQuery = normalizeApartmentName(aptNameQuery);

  for (const item of items) {
    const aptName = readXmlTag(item, 'aptNm');
    const normalizedAptName = normalizeApartmentName(aptName);
    if (
      !normalizedAptName
      || (!normalizedAptName.includes(normalizedQuery) && !normalizedQuery.includes(normalizedAptName))
    ) {
      continue;
    }

    const cancellationType = readXmlTag(item, 'cdealType').toUpperCase();
    const cancellationDate = readXmlTag(item, 'cdealDay');
    if (cancellationType === 'O' || cancellationDate !== '') {
      canceledExcluded += 1;
      continue;
    }

    const price = Number.parseInt(readXmlTag(item, 'dealAmount').replace(/,/g, ''), 10);
    const area = Number.parseFloat(readXmlTag(item, 'excluUseAr'));
    if (Number.isFinite(price) && price > 0) {
      deals.push({ price, area: Number.isFinite(area) ? area : 0 });
    }
  }

  return { deals, canceledExcluded };
}

interface MonthResult {
  month: string;
  deals: DealRow[];
  canceledExcluded: number;
}

async function fetchMonth(
  lawdCd: string,
  yyyymm: string,
  aptName: string,
  apiKey: string,
): Promise<MonthResult> {
  const xml = await fetchTradeMonthAllPages(
    apiKey,
    lawdCd,
    yyyymm,
    revalidateForMonth(yyyymm),
  );
  // MOLIT 오류 XML이나 네트워크 실패를 정상적인 0건으로 취급하지 않는다.
  if (!/<totalCount>\d+<\/totalCount>/.test(xml)) {
    throw new Error(`MOLIT response unavailable for ${yyyymm}`);
  }
  const parsed = parseDollarDealsXml(xml, aptName);
  return { month: yyyymm, ...parsed };
}

async function fetchMonths(
  lawdCd: string,
  months: string[],
  aptName: string,
  apiKey: string,
): Promise<{ fulfilled: MonthResult[]; failed: string[] }> {
  const settled = await Promise.allSettled(
    months.map((month) => fetchMonth(lawdCd, month, aptName, apiKey)),
  );
  const fulfilled: MonthResult[] = [];
  const failed: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') fulfilled.push(result.value);
    else failed.push(months[index]);
  });
  return { fulfilled, failed };
}

/** 공용 MOLIT 전 페이지 수집기를 이용해 한 연도의 대표 거래 표본을 만든다. */
export async function fetchDollarYearDeals(
  lawdCd: string,
  year: number,
  aptName: string,
  apiKey: string,
  now: Date = new Date(),
): Promise<DollarYearDeals> {
  const primary = monthsForYear(year, now).map((month) => `${year}${month}`);
  const primaryResult = await fetchMonths(lawdCd, primary, aptName, apiKey);
  let fulfilled = [...primaryResult.fulfilled];
  let failed = [...primaryResult.failed];
  let fallbackUsed = false;

  if (fulfilled.flatMap((result) => result.deals).length === 0) {
    const fallback = fallbackMonths(year, now).map((month) => `${year}${month}`);
    if (fallback.length > 0) {
      fallbackUsed = true;
      const fallbackResult = await fetchMonths(lawdCd, fallback, aptName, apiKey);
      fulfilled = fulfilled.concat(fallbackResult.fulfilled);
      failed = failed.concat(fallbackResult.failed);
    }
  }

  const deals = fulfilled.flatMap((result) => result.deals);
  const matchedMonths = fulfilled
    .filter((result) => result.deals.length > 0)
    .map((result) => result.month);

  return {
    deals,
    hasUsableResponse: fulfilled.length > 0,
    window: {
      requestedMonths: primary.concat(fallbackUsed ? fallbackMonths(year, now).map((m) => `${year}${m}`) : []),
      successfulMonths: fulfilled.map((result) => result.month),
      failedMonths: failed,
      matchedMonths,
      canceledExcluded: fulfilled.reduce((sum, result) => sum + result.canceledExcluded, 0),
      fallbackUsed,
    },
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 현재 시점의 BTC·PAXG 호가. 실패 원인을 호출부가 숨기지 않도록 결과를 구분한다. */
export async function fetchDollarLiveRates(): Promise<DollarLiveRatesResult> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold&vs_currencies=usd,krw',
      { next: { revalidate: 300 } },
    );
    if (!response.ok) {
      return { ok: false, error: `CoinGecko HTTP ${response.status}` };
    }
    const json = await response.json() as {
      bitcoin?: { usd?: unknown; krw?: unknown };
      'pax-gold'?: { krw?: unknown };
    };
    const btcKrw = json.bitcoin?.krw;
    const btcUsd = json.bitcoin?.usd;
    const paxgKrw = json['pax-gold']?.krw;
    if (!isPositiveNumber(btcKrw) || !isPositiveNumber(btcUsd) || !isPositiveNumber(paxgKrw)) {
      return { ok: false, error: 'CoinGecko 응답에 필요한 호가가 없습니다.' };
    }
    return {
      ok: true,
      value: {
        btcKrw: Math.round(btcKrw),
        goldKrwPerGram: Math.round(paxgKrw / TROY_OZ_TO_GRAM),
        usdKrwImplied: Math.round(btcKrw / btcUsd),
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: 'CoinGecko 시세 조회에 실패했습니다.' };
  }
}

export interface DollarAssetSelection {
  exchangeRate: number | null;
  btcKrw: number | null;
  goldKrwPerGram: number | null;
  provenance: {
    exchangeRate: DollarQuoteProvenance;
    bitcoin: DollarQuoteProvenance;
    gold: DollarQuoteProvenance;
  };
}

function staticQuote(asset: 'bitcoin' | 'gold', year: number, available: boolean): DollarQuoteProvenance {
  const assetLabel = asset === 'bitcoin' ? 'BTC/KRW' : '금 KRW/g';
  if (!available) {
    return {
      mode: 'unavailable',
      source: '자료 없음',
      period: String(year),
      note: `${year}년 ${assetLabel} 참고값이 수록되어 있지 않습니다.`,
    };
  }
  return {
    mode: 'static_estimate',
    source: '정적 참고 추정치',
    period: String(year),
    note: `코드에 수록된 ${assetLabel} 추정값이며 원자료 기준일과 정확한 산출 근거가 검증되지 않았습니다.`,
  };
}

function exchangeProvenance(quote: ExchangeRateQuote): DollarQuoteProvenance {
  return {
    mode: quote.mode,
    source: quote.source,
    period: quote.period,
    note: quote.note,
  };
}

/** 선택 연도의 환산값과, 값마다 반드시 함께 노출할 출처를 결합한다. */
export function selectDollarAssets(
  year: number,
  currentYear: number,
  exchangeQuote: ExchangeRateQuote,
  live: DollarLiveRatesResult | null,
): DollarAssetSelection {
  if (year === currentYear && live?.ok) {
    return {
      exchangeRate: live.value.usdKrwImplied,
      btcKrw: live.value.btcKrw,
      goldKrwPerGram: live.value.goldKrwPerGram,
      provenance: {
        exchangeRate: {
          mode: 'live_proxy',
          source: 'CoinGecko BTC 원화·달러 호가 비율 역산',
          period: '현재 시점',
          asOf: live.value.fetchedAt,
          note: '공식 외환 고시값이나 연평균이 아닌 현물 호가 기반 참고 환율입니다.',
        },
        bitcoin: {
          mode: 'live_proxy',
          source: 'CoinGecko Bitcoin KRW 호가',
          period: '현재 시점',
          asOf: live.value.fetchedAt,
          note: '연평균이 아닌 조회 시점의 시장 호가입니다.',
        },
        gold: {
          mode: 'live_proxy',
          source: 'CoinGecko PAX Gold(PAXG) KRW 호가 환산',
          period: '현재 시점',
          asOf: live.value.fetchedAt,
          note: '실물 금 고시가격이 아니라 PAXG 1트로이온스 호가를 g 단위로 환산한 참고값입니다.',
        },
      },
    };
  }

  const btcKrw = getBtcKrw(year);
  const goldKrwPerGram = getGoldKrwPerGram(year);
  return {
    exchangeRate: exchangeQuote.value,
    btcKrw,
    goldKrwPerGram,
    provenance: {
      exchangeRate: exchangeProvenance(exchangeQuote),
      bitcoin: staticQuote('bitcoin', year, btcKrw !== null),
      gold: staticQuote('gold', year, goldKrwPerGram !== null),
    },
  };
}

import type { Deal, Sido } from './types';

const BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

const CONCURRENCY = 10;
const MAX_PAGES = 3;

export function getMonthList(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${yyyy}${mm}`);
  }
  return result;
}

async function fetchAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
): Promise<string> {
  const makeUrl = (pageNo: number) => {
    const params = new URLSearchParams({
      LAWD_CD: lawdCd,
      DEAL_YMD: yyyymm,
      numOfRows: '1000',
      pageNo: String(pageNo),
    });
    return BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
  };

  const firstPage = await fetch(makeUrl(1)).then((r) => r.text());

  const resultCode = firstPage.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);

  if (!totalMatch) {
    // HTML 차단 응답, 빈 응답, 비정상 짧은 응답은 재시도해도 복구 불가
    const isBlocked =
      firstPage.length < 100 ||
      firstPage.includes('Request Blocked') ||
      firstPage.includes('<!DOCTYPE');
    const err = new Error(
      `Invalid API response for ${lawdCd} ${yyyymm}: len=${firstPage.length}, resultCode=${resultCode || 'none'}`,
    );
    (err as any).noRetry = isBlocked;
    throw err;
  }

  if (resultCode && resultCode !== '00') {
    throw new Error(
      `API error for ${lawdCd} ${yyyymm}: resultCode=${resultCode}`,
    );
  }

  const totalCount = parseInt(totalMatch[1]);
  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), MAX_PAGES);
  const additionalPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetch(makeUrl(i + 2)).then((r) => r.text()),
    ),
  );

  return [firstPage, ...additionalPages].join('\n');
}

function parseItems(
  xml: string,
  district: { name: string; code: string; sido: Sido },
): Deal[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items
    .map((item) => {
      const get = (tag: string) =>
        item
          .match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]
          ?.trim() ?? '';

      const rawAmount = get('dealAmount').replace(/[,\s]/g, '');
      const dealAmount = parseInt(rawAmount) * 10000;
      const excluUseAr = parseFloat(get('excluUseAr'));
      const aptNm = get('aptNm');
      const dealYear = get('dealYear');
      const dealMonth = get('dealMonth').padStart(2, '0');
      const dealDay = get('dealDay').padStart(2, '0');
      const umdNm = get('umdNm');

      if (!dealAmount || !excluUseAr || !aptNm || !dealYear) return null;

      return {
        aptNm,
        umdNm,
        excluUseAr,
        dealAmount,
        dealYear,
        dealMonth,
        dealDay,
        lawdCd: district.code,
        districtName: district.name,
        sido: district.sido,
      } satisfies Deal;
    })
    .filter((d): d is Deal => d !== null);
}

async function fetchWithRetry<T>(
  task: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await task();
    } catch (e) {
      lastError = e;
      if ((e as any)?.noRetry) throw e;
      if (attempt < maxRetries) {
        console.log('[retry]', attempt + 1, '/', maxRetries, (e as Error)?.message?.slice(0, 80));
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

interface LimitResult<T> {
  results: T[];
  failed: number;
  total: number;
}

function runWithLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<LimitResult<T>> {
  const results: T[] = [];
  let failed = 0;
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = await tasks[i]();
      } catch {
        failed++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    next(),
  );
  return Promise.all(workers).then(() => ({
    results,
    failed,
    total: tasks.length,
  }));
}

export interface FetchResult {
  deals: Deal[];
  failedDistricts: number;
  totalDistricts: number;
}

export async function fetchSudogwonDeals(
  apiKey: string,
  districts: { name: string; code: string; sido: Sido }[],
  months: number,
): Promise<FetchResult> {
  const monthList = getMonthList(months);

  const tasks = districts.flatMap((district) =>
    monthList.map(
      (yyyymm) => async () => {
        return fetchWithRetry(async () => {
          const xml = await fetchAllPages(apiKey, district.code, yyyymm);
          return parseItems(xml, district);
        });
      },
    ),
  );

  const t0 = Date.now();
  const { results, failed, total } = await runWithLimit(tasks, CONCURRENCY);
  console.log('[timing] fetch phase:', Date.now() - t0, 'ms, failed:', failed, '/', total);

  const deals: Deal[] = [];
  for (const batch of results) {
    if (batch) deals.push(...batch);
  }

  return {
    deals,
    failedDistricts: failed,
    totalDistricts: total,
  };
}

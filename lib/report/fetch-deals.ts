import type { Deal, Sido } from './types';

const BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

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

  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), 3);
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
        const xml = await fetchAllPages(apiKey, district.code, yyyymm);
        return parseItems(xml, district);
      },
    ),
  );

  const { results, failed, total } = await runWithLimit(tasks, 10);

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

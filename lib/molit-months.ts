import { fetchMolitXml, type MolitFetchOptions } from '@/lib/molit-fetch';

/**
 * MOLIT 월 목록·페이지네이션 공용 — 사이클 DD.
 *
 * /api/transactions 의 조회 루틴을 단지 전용 페이지와 공유하기 위해 추출.
 * fetch 캐시 키가 URL 단위라 API·페이지가 같은 캐시를 나눠 쓴다 (부하 증가 없음).
 */

const TRADE_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const RENT_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const SILV_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade';
const PAGE_SIZE = 1000;
const PAGE_BATCH_SIZE = 4;
const MAX_PAGES = 50;

function buildMonthUrl(
  baseUrl: string,
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  pageNo: number,
): string {
  const params = new URLSearchParams({
    LAWD_CD: lawdCd,
    DEAL_YMD: yyyymm,
    numOfRows: String(PAGE_SIZE),
    pageNo: String(pageNo),
  });
  return `${baseUrl}?serviceKey=${apiKey}&${params}`;
}

function readTotalCount(xml: string, context: string): number {
  const match = xml.match(/<totalCount>\s*(\d+)\s*<\/totalCount>/);
  if (!match) throw new Error(`MOLIT ${context} 응답을 확인할 수 없습니다.`);
  return Number(match[1]);
}

async function fetchMonthAllPages(
  baseUrl: string,
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate: number,
  fetchOptions?: MolitFetchOptions,
): Promise<string> {
  const firstPage = await fetchMolitXml(
    buildMonthUrl(baseUrl, apiKey, lawdCd, yyyymm, 1),
    revalidate,
    fetchOptions,
  );
  const totalCount = readTotalCount(firstPage, `${lawdCd}/${yyyymm}/1페이지`);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages <= 1) return firstPage;
  if (totalPages > MAX_PAGES) {
    throw new Error(`MOLIT ${lawdCd}/${yyyymm} ${totalPages}페이지가 안전 한도 ${MAX_PAGES}를 초과했습니다.`);
  }

  const documents = [firstPage];
  const configuredPageConcurrency = fetchOptions?.pageConcurrency;
  const pageConcurrency = Number.isFinite(configuredPageConcurrency)
    ? Math.min(PAGE_BATCH_SIZE, Math.max(1, Math.trunc(configuredPageConcurrency!)))
    : PAGE_BATCH_SIZE;
  for (let first = 2; first <= totalPages; first += pageConcurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(pageConcurrency, totalPages - first + 1) },
      (_, index) => first + index,
    );
    const batch = await Promise.all(
      pageNumbers.map(async (pageNo) => {
        const xml = await fetchMolitXml(
          buildMonthUrl(baseUrl, apiKey, lawdCd, yyyymm, pageNo),
          revalidate,
          fetchOptions,
        );
        readTotalCount(xml, `${lawdCd}/${yyyymm}/${pageNo}페이지`);
        return xml;
      }),
    );
    documents.push(...batch);
  }
  return documents.join('\n');
}

/**
 * 월별 캐시 수명 — MOLIT 일 한도 보호 (사이클 KK).
 * 2개월 이상 지난 달의 거래는 사실상 불변(소급 신고 미미)이므로 7일,
 * 최근 2개월만 24h. 단지 페이지 크롤·API 재조회 비용을 크게 줄인다.
 */
export function revalidateForMonth(yyyymm: string, now: Date = new Date()): number {
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cur = koreaNow.getUTCFullYear() * 12 + koreaNow.getUTCMonth();
  const ym  = parseInt(yyyymm.slice(0, 4)) * 12 + (parseInt(yyyymm.slice(4, 6)) - 1);
  return cur - ym >= 2 ? 604800 : 86400;
}

/** 최근 n개월 'YYYYMM' 목록 (이번 달부터 과거로) */
export function getMonthList(months: number, now: Date = new Date()): string[] {
  const result: string[] = [];
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(koreaNow.getUTCFullYear(), koreaNow.getUTCMonth() - i, 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    result.push(`${yyyy}${mm}`);
  }
  return result;
}

/**
 * 한 구·한 달 매매 XML 전체 페이지 조회.
 * @param revalidate fetch 캐시 초 (기본 86400 — API 라우트와 동일)
 */
export async function fetchTradeMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
  fetchOptions?: MolitFetchOptions,
): Promise<string> {
  return fetchMonthAllPages(
    TRADE_BASE_URL,
    apiKey,
    lawdCd,
    yyyymm,
    revalidate,
    fetchOptions,
  );
}

/**
 * 한 구·한 달 분양권전매 XML 전체 페이지 조회 — 분양권 탭.
 * 매매(fetchTradeMonthAllPages)와 동일 규칙으로 전 페이지를 조회한다.
 */
export async function fetchSilvMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
  fetchOptions?: MolitFetchOptions,
): Promise<string> {
  return fetchMonthAllPages(
    SILV_BASE_URL,
    apiKey,
    lawdCd,
    yyyymm,
    revalidate,
    fetchOptions,
  );
}

/**
 * 한 구·한 달 전월세 XML 전체 페이지 조회 — 사이클 II (전세·월세 탭).
 * 매매(fetchTradeMonthAllPages)와 동일 규칙으로 전 페이지를 조회한다.
 */
export async function fetchRentMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
  fetchOptions?: MolitFetchOptions,
): Promise<string> {
  return fetchMonthAllPages(
    RENT_BASE_URL,
    apiKey,
    lawdCd,
    yyyymm,
    revalidate,
    fetchOptions,
  );
}

import { fetchMolitXml } from '@/lib/molit-fetch';

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

/**
 * 월별 캐시 수명 — MOLIT 일 한도 보호 (사이클 KK).
 * 2개월 이상 지난 달의 거래는 사실상 불변(소급 신고 미미)이므로 7일,
 * 최근 2개월만 24h. 단지 페이지 크롤·API 재조회 비용을 크게 줄인다.
 */
export function revalidateForMonth(yyyymm: string): number {
  const now = new Date();
  const cur = now.getFullYear() * 12 + now.getMonth();
  const ym  = parseInt(yyyymm.slice(0, 4)) * 12 + (parseInt(yyyymm.slice(4, 6)) - 1);
  return cur - ym >= 2 ? 604800 : 86400;
}

/** 최근 n개월 'YYYYMM' 목록 (이번 달부터 과거로) */
export function getMonthList(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${yyyy}${mm}`);
  }
  return result;
}

/**
 * 한 구·한 달 매매 XML 전체 페이지 조회 (최대 3페이지 = 3,000건).
 * @param revalidate fetch 캐시 초 (기본 86400 — API 라우트와 동일)
 */
export async function fetchTradeMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
): Promise<string> {
  const makeUrl = (pageNo: number) => {
    const params = new URLSearchParams({
      LAWD_CD: lawdCd,
      DEAL_YMD: yyyymm,
      numOfRows: '1000',
      pageNo: String(pageNo),
    });
    return TRADE_BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
  };

  const firstPage = await fetchMolitXml(makeUrl(1), revalidate);

  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), 3);
  const additionalPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchMolitXml(makeUrl(i + 2), revalidate)
    )
  );

  return [firstPage, ...additionalPages].join('\n');
}

/**
 * 한 구·한 달 분양권전매 XML 전체 페이지 조회 — 분양권 탭.
 * 매매(fetchTradeMonthAllPages)와 동일 규칙: 최대 3페이지, fetch 캐시 공유.
 */
export async function fetchSilvMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
): Promise<string> {
  const makeUrl = (pageNo: number) => {
    const params = new URLSearchParams({
      LAWD_CD: lawdCd,
      DEAL_YMD: yyyymm,
      numOfRows: '1000',
      pageNo: String(pageNo),
    });
    return SILV_BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
  };

  const firstPage = await fetchMolitXml(makeUrl(1), revalidate);

  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), 3);
  const additionalPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchMolitXml(makeUrl(i + 2), revalidate)
    )
  );

  return [firstPage, ...additionalPages].join('\n');
}

/**
 * 한 구·한 달 전월세 XML 전체 페이지 조회 — 사이클 II (전세·월세 탭).
 * 매매(fetchTradeMonthAllPages)와 동일 규칙: 최대 3페이지, fetch 캐시 공유.
 */
export async function fetchRentMonthAllPages(
  apiKey: string,
  lawdCd: string,
  yyyymm: string,
  revalidate = 86400,
): Promise<string> {
  const makeUrl = (pageNo: number) => {
    const params = new URLSearchParams({
      LAWD_CD: lawdCd,
      DEAL_YMD: yyyymm,
      numOfRows: '1000',
      pageNo: String(pageNo),
    });
    return RENT_BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
  };

  const firstPage = await fetchMolitXml(makeUrl(1), revalidate);

  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), 3);
  const additionalPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchMolitXml(makeUrl(i + 2), revalidate)
    )
  );

  return [firstPage, ...additionalPages].join('\n');
}

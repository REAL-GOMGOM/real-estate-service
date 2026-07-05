import { fetchMolitXml } from '@/lib/molit-fetch';

/**
 * MOLIT 월 목록·페이지네이션 공용 — 사이클 DD.
 *
 * /api/transactions 의 조회 루틴을 단지 전용 페이지와 공유하기 위해 추출.
 * fetch 캐시 키가 URL 단위라 API·페이지가 같은 캐시를 나눠 쓴다 (부하 증가 없음).
 */

const TRADE_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

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

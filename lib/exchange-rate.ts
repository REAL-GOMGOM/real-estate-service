// ────────────────────────────────────────────────────────────────────
// 환율 데이터 소스 추상화
//
// BOK_API_KEY 환경변수 없음  → 정적 연간 평균 환율 (fallback)
// BOK_API_KEY 환경변수 있음 → 한국은행 ECOS API (실데이터)
//
// 키 발급 후: .env.local 에 BOK_API_KEY=발급받은키 추가하면 자동 전환
// ────────────────────────────────────────────────────────────────────

// 연간 평균 USD/KRW (원 단위 — 1달러 = N원)
// 출처: 한국은행 경제통계시스템 연간 평균 기준
const STATIC_ANNUAL_RATES: Record<number, number> = {
  // 2006년부터 — 국토부 실거래 공개 시스템 데이터 시작 연도
  2006:  955, 2007:  929, 2008: 1102, 2009: 1276,
  2010: 1156, 2011: 1108, 2012: 1127, 2013: 1095, 2014: 1053,
  2015: 1131, 2016: 1161, 2017: 1131, 2018: 1100, 2019: 1166,
  2020: 1180, 2021: 1144, 2022: 1292, 2023: 1306, 2024: 1363,
  2025: 1470,
};

const BOK_ECOS_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';
// 통계표: 731Y001 (주요국통화의대원화환율), 항목: 0000001 (USD)
const BOK_USD_KRW_STAT = '731Y001';
const BOK_USD_ITEM     = '0000001';

async function fetchFromBok(years: number[], apiKey: string): Promise<Record<number, number>> {
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const url = [
    BOK_ECOS_BASE,
    apiKey, 'json', 'kr', '1', '100',
    BOK_USD_KRW_STAT, 'A',
    String(minYear), String(maxYear),
    BOK_USD_ITEM,
  ].join('/');

  const res  = await fetch(url, { next: { revalidate: 86400 } }); // 24h 캐시
  const json = await res.json();

  const rows: { TIME: string; DATA_VALUE: string }[] =
    json?.StatisticSearch?.row ?? [];

  const result: Record<number, number> = {};
  for (const row of rows) {
    const year = parseInt(row.TIME, 10);
    const rate = parseFloat(row.DATA_VALUE);
    if (!isNaN(year) && !isNaN(rate)) result[year] = Math.round(rate);
  }
  return result;
}

export async function getExchangeRates(years: number[]): Promise<Record<number, number>> {
  const bokKey = process.env.BOK_API_KEY;

  if (bokKey) {
    try {
      const rates = await fetchFromBok(years, bokKey);
      // BOK 응답에 없는 연도는 정적 데이터로 보완
      for (const year of years) {
        if (!rates[year] && STATIC_ANNUAL_RATES[year]) {
          rates[year] = STATIC_ANNUAL_RATES[year];
        }
      }
      return rates;
    } catch {
      console.warn('[exchange-rate] BOK API 실패 — 정적 데이터로 fallback');
    }
  }

  // 정적 fallback
  return Object.fromEntries(
    years.map((y) => [y, STATIC_ANNUAL_RATES[y] ?? 1300]),
  );
}

export const AVAILABLE_YEARS = Object.keys(STATIC_ANNUAL_RATES).map(Number).sort();

/** 클라이언트에서도 사용 가능한 정적 환율 조회 (서버 API 응답 전 초기값용) */
export function getStaticRate(year: number): number {
  return STATIC_ANNUAL_RATES[year] ?? 1300;
}

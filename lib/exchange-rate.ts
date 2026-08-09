// ────────────────────────────────────────────────────────────────────
// 환율 데이터 소스 추상화
//
// BOK_API_KEY 환경변수 없음  → 정적 참고 추정치
// BOK_API_KEY 환경변수 있음 → 한국은행 ECOS 응답값, 누락·실패 시 출처가 표시된 추정치
//
// 키 발급 후: .env.local 에 BOK_API_KEY=발급받은키 추가하면 자동 전환
// ────────────────────────────────────────────────────────────────────

// 연간 USD/KRW 참고값 (원 단위 — 1달러 = N원).
// 원자료 기준일과 산출 과정을 이 저장소에서 재검증할 수 없으므로, ECOS 응답이
// 없는 경우에는 공식 통계가 아니라 "정적 참고 추정치"로만 노출한다.
const STATIC_ANNUAL_RATES: Record<number, number> = {
  // 2006년부터 — 국토부 실거래 공개 시스템 데이터 시작 연도
  2006:  955, 2007:  929, 2008: 1102, 2009: 1276,
  2010: 1156, 2011: 1108, 2012: 1127, 2013: 1095, 2014: 1053,
  2015: 1131, 2016: 1161, 2017: 1131, 2018: 1100, 2019: 1166,
  2020: 1180, 2021: 1144, 2022: 1292, 2023: 1306, 2024: 1363,
  2025: 1470,
  2026: 1470,   // 코드 수록 참고값. 현재 연도는 /api/dollar가 CoinGecko 호가 비율 역산값을 우선 사용.
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
  if (!res.ok) throw new Error(`ECOS HTTP ${res.status}`);
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

export type ExchangeRateQuoteMode = 'official' | 'static_estimate' | 'unavailable';

export interface ExchangeRateQuote {
  value: number | null;
  mode: ExchangeRateQuoteMode;
  source: string;
  period: string;
  note: string;
}

export interface ExchangeRateQuoteResult {
  quotes: Record<number, ExchangeRateQuote>;
  warning: string | null;
}

function staticQuote(year: number, reason: string): ExchangeRateQuote {
  const value = STATIC_ANNUAL_RATES[year] ?? null;
  if (value === null) {
    return {
      value: null,
      mode: 'unavailable',
      source: '자료 없음',
      period: String(year),
      note: `${year}년 USD/KRW 값을 확인할 수 없습니다.`,
    };
  }
  return {
    value,
    mode: 'static_estimate',
    source: '정적 참고 추정치',
    period: String(year),
    note: `${reason} 코드 수록값이며 원자료 기준일과 산출 근거가 검증되지 않았습니다.`,
  };
}

/** 값과 출처를 함께 반환해 fallback을 공식 ECOS 값으로 오인하지 않게 한다. */
export async function getExchangeRateQuotes(years: number[]): Promise<ExchangeRateQuoteResult> {
  const uniqueYears = [...new Set(years)];
  const bokKey = process.env.BOK_API_KEY;
  const quotes: Record<number, ExchangeRateQuote> = {};

  if (bokKey) {
    try {
      const rates = await fetchFromBok(uniqueYears, bokKey);
      for (const year of uniqueYears) {
        const value = rates[year];
        quotes[year] = Number.isFinite(value) && value > 0
          ? {
              value,
              mode: 'official',
              source: '한국은행 ECOS 731Y001·0000001',
              period: String(year),
              note: 'ECOS 연간 주기 응답값입니다.',
            }
          : staticQuote(year, 'ECOS 응답에 해당 연도 값이 없어');
      }
      const usedStatic = Object.values(quotes).some((quote) => quote.mode !== 'official');
      return {
        quotes,
        warning: usedStatic ? 'ECOS에 없는 연도는 정적 참고 추정치로 표시했습니다.' : null,
      };
    } catch {
      for (const year of uniqueYears) quotes[year] = staticQuote(year, 'ECOS 조회에 실패해');
      return { quotes, warning: '한국은행 ECOS 조회에 실패해 정적 참고 추정치를 사용했습니다.' };
    }
  }

  for (const year of uniqueYears) quotes[year] = staticQuote(year, 'ECOS API 키가 설정되지 않아');
  return { quotes, warning: 'ECOS API 키가 없어 정적 참고 추정치를 사용했습니다.' };
}

export async function getExchangeRates(years: number[]): Promise<Record<number, number>> {
  const result = await getExchangeRateQuotes(years);
  return Object.fromEntries(
    Object.entries(result.quotes)
      .filter(([, quote]) => quote.value !== null)
      .map(([year, quote]) => [year, quote.value as number]),
  );
}

export const AVAILABLE_YEARS = Object.keys(STATIC_ANNUAL_RATES).map(Number).sort();

/** 정적 참고 환율 조회. 값이 없는 연도에 임의 기본값을 만들지 않는다. */
export function getStaticRate(year: number): number | null {
  return STATIC_ANNUAL_RATES[year] ?? null;
}

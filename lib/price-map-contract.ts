import type { PeriodType, PriceChangeData, TradeType } from '@/types/price-map';
import { kstCurrentYyyymm } from '@/lib/agg-window';

export const PRICE_CHANGE_FREQUENCY: PeriodType = 'monthly';
const MAX_DB_AGE_MONTHS = 3;

export function pricePeriodKey(periodLabel: string): number | null {
  const match = periodLabel.match(/(\d{4})\D+(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

/** 번들 DB는 보조 소스이므로 최근 공개 가능 범위를 벗어나면 사용하지 않는다. */
export function isRecentPricePeriod(periodLabel: string, now = new Date()): boolean {
  const key = pricePeriodKey(periodLabel);
  if (key === null) return false;
  const current = kstCurrentYyyymm(now);
  const currentKey = Number(current.slice(0, 4)) * 12 + Number(current.slice(4, 6)) - 1;
  const ageMonths = currentKey - key;
  return ageMonths >= 0 && ageMonths <= MAX_DB_AGE_MONTHS;
}

type AggregateChangeRow = { region_code: string; change_rate: number };

/** 전국·수도권·지방권은 시도 단순평균이 아니라 공식 집계행만 사용한다. */
export function officialSummaryFromChangeRows(
  rows: AggregateChangeRow[],
): PriceChangeData['summary'] | null {
  const byCode = new Map(rows.map((row) => [row.region_code, row.change_rate]));
  const nationwide = byCode.get('00');
  const capitalArea = byCode.get('S0');
  const nonCapital = byCode.get('L0');
  if (![nationwide, capitalArea, nonCapital].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return {
    nationwide: nationwide!,
    capital_area: capitalArea!,
    non_capital: nonCapital!,
  };
}

export function parsePriceChangeFrequency(value: string | null): PeriodType | null {
  if (value === null || value === PRICE_CHANGE_FREQUENCY) return PRICE_CHANGE_FREQUENCY;
  return null;
}

export function parsePriceChangeTradeType(value: string | null): TradeType | null {
  if (value === null || value === 'sale') return 'sale';
  if (value === 'rent') return 'rent';
  return null;
}

export function isMonthlyPriceChangeData(value: unknown): value is PriceChangeData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PriceChangeData>;
  return candidate.frequency === PRICE_CHANGE_FREQUENCY
    && (candidate.type === 'sale' || candidate.type === 'rent')
    && typeof candidate.period === 'string'
    && Array.isArray(candidate.regions)
    && !!candidate.summary
    && typeof candidate.summary.nationwide === 'number'
    && typeof candidate.summary.capital_area === 'number'
    && typeof candidate.summary.non_capital === 'number';
}

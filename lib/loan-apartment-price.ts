import { summarizeAptTxns, type AptPriceSummary } from '@/lib/apt-price-summary';

interface TransactionLike {
  area: number;
  price: number;
  date: string;
}

export type LoanApartmentPriceResult =
  | { ok: true; summary: AptPriceSummary }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTransaction(value: unknown): value is TransactionLike {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.area)
    && Number(value.area) > 0
    && Number.isFinite(value.price)
    && Number(value.price) > 0
    && typeof value.date === 'string';
}

/**
 * 거래 API 응답을 대출 매매가에 적용해도 되는지 검증한다.
 * 유효 표본이 없거나 응답 계약이 다르면 기존/기본 매매가를 실거래가로 둔갑시키지 않는다.
 */
export function resolveLoanApartmentPrice(payload: unknown): LoanApartmentPriceResult {
  if (!isRecord(payload)) {
    return { ok: false, error: '실거래 응답 형식을 확인할 수 없습니다.' };
  }

  const apiError = typeof payload.error === 'string' ? payload.error.trim() : '';
  const data = Array.isArray(payload.data) ? payload.data : [];
  const first = data[0];
  const transactions = isRecord(first) && Array.isArray(first.transactions)
    ? first.transactions.filter(isTransaction)
    : [];
  const summary = summarizeAptTxns(transactions);

  if (!summary) {
    return {
      ok: false,
      error: apiError || '선택한 단지의 조회 기간 내 유효한 실거래 표본이 없습니다.',
    };
  }
  return { ok: true, summary };
}

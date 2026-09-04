import { isFieldReportSource, type FieldReportFlagReason, type FieldReportSource, type FieldReportTradeType } from './types';
import { eokToManwon, pyeongToSquareMeters } from './units';

export const REPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export interface FieldReportInput {
  apartmentId: string;
  area: number;
  tradeType: FieldReportTradeType;
  price: number;
  monthlyRent: number | null;
  contractDate: string;
  source: FieldReportSource;
}

/** Whitelist only: free text, names, contact details and attachments are not accepted. */
export function parseFieldReportForm(form: FormData, now = new Date()): FieldReportInput | { error: string } {
  const allowed = new Set(['apartmentId', 'area', 'price', 'areaPyeong', 'priceEok', 'tradeType', 'monthlyRent', 'contractDate', 'source', 'consent', 'confirmContracted', 'website']);
  for (const [key, value] of form.entries()) {
    // React's own action metadata is not application input.
    if (key.startsWith('$ACTION_')) continue;
    if (!allowed.has(key) || typeof value !== 'string' || value.length > 200 || form.getAll(key).length !== 1) {
      return { error: '허용되지 않은 입력이 있습니다. 입력 항목을 다시 확인해 주세요.' };
    }
  }
  const value = (key: string) => String(form.get(key) ?? '').trim();
  if (value('website')) return { error: '접수할 수 없는 요청입니다.' };
  if (value('consent') !== 'on' || value('confirmContracted') !== 'on') {
    return { error: '계약 소식 확인과 제보 정보 처리·공개 동의가 필요합니다.' };
  }
  const apartmentId = value('apartmentId');
  if (!apartmentId || apartmentId.length > 160 || /[\x00-\x1f<>]/.test(apartmentId)) {
    return { error: '검색 결과에서 아파트 단지를 선택해 주세요.' };
  }
  const tradeType = value('tradeType');
  if (tradeType !== 'sale' && tradeType !== 'jeonse' && tradeType !== 'monthly') return { error: '거래 유형을 선택해 주세요.' };
  const hasNewArea = form.has('areaPyeong');
  const hasNewPrice = form.has('priceEok');
  const hasLegacyArea = form.has('area');
  const hasLegacyPrice = form.has('price');
  const usesNewFields = hasNewArea && hasNewPrice;
  const usesLegacyFields = hasLegacyArea && hasLegacyPrice;
  if ((hasNewArea !== hasNewPrice) || (hasLegacyArea !== hasLegacyPrice) || usesNewFields === usesLegacyFields) {
    return { error: '면적과 금액 입력 형식을 다시 확인해 주세요.' };
  }

  let area: number;
  let price: number;
  if (usesNewFields) {
    const parsedArea = pyeongToSquareMeters(value('areaPyeong'));
    if (parsedArea === null) return { error: '전용면적은 10~500㎡ 범위의 평 단위로, 소수점 첫째 자리까지 입력해 주세요.' };
    const parsedPrice = eokToManwon(value('priceEok'), tradeType === 'monthly');
    if (parsedPrice === null) return { error: '금액은 최대 500억원, 소수점 둘째 자리까지 입력해 주세요.' };
    area = parsedArea;
    price = parsedPrice;
  } else {
    const areaText = value('area');
    area = Number(areaText);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(areaText) || area < 10 || area > 500) {
      return { error: '전용면적은 10~500㎡, 소수점 둘째 자리까지 입력해 주세요.' };
    }
    const priceText = value('price');
    price = Number(priceText);
    if (!/^\d{1,7}$/.test(priceText) || price > 5_000_000 || price < (tradeType === 'monthly' ? 0 : 1)) {
      return { error: '금액을 만원 단위 정수로 확인해 주세요. 최대 500억원까지 입력할 수 있습니다.' };
    }
  }
  const rentText = value('monthlyRent');
  const rent = Number(rentText);
  if (tradeType === 'monthly' && (!/^\d{1,5}$/.test(rentText) || rent < 1 || rent > 10_000)) {
    return { error: '월세는 1~10,000만원의 정수로 입력해 주세요.' };
  }
  if (tradeType !== 'monthly' && rentText) return { error: '월세 금액은 월세 거래에만 입력해 주세요.' };
  const contractDate = value('contractDate');
  const date = new Date(`${contractDate}T00:00:00.000Z`);
  const today = kstDate(now);
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY_MS).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contractDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== contractDate || contractDate > today || contractDate < earliest) {
    return { error: '계약일은 오늘부터 최근 90일 이내의 실제 날짜로 입력해 주세요.' };
  }
  const source = value('source');
  if (!isFieldReportSource(source)) return { error: '제보 출처를 선택해 주세요.' };
  return { apartmentId, area, tradeType, price, monthlyRent: tradeType === 'monthly' ? rent : null, contractDate, source };
}

export function isFlagReason(value: unknown): value is FieldReportFlagReason {
  return value === 'false_information' || value === 'duplicate' || value === 'personal_information';
}

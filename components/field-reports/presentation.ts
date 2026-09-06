import { isFieldReportSource, type FieldReportSource, type PublicFieldReport } from '@/lib/field-reports/types';
import { squareMetersToPyeong } from '@/lib/field-reports/units';

export const TRADE_LABELS = { sale: '매매', jeonse: '전세', monthly: '월세' } as const;
export const SOURCE_LABELS = {
  participant: '계약 당사자 제보',
  agent: '중개업 종사자 제보',
  neighbor: '이웃 제보',
  anonymous: '익명 제보',
  field_news: '현장소식 제보',
} as const satisfies Record<FieldReportSource, string>;

export function formatReportAmount(amount: number): string {
  const hundredMillion = Math.floor(amount / 10_000);
  const remainder = amount % 10_000;
  if (hundredMillion === 0) return `${remainder.toLocaleString('ko-KR')}만원`;
  if (remainder === 0) return `${hundredMillion.toLocaleString('ko-KR')}억원`;
  return `${hundredMillion.toLocaleString('ko-KR')}억 ${remainder.toLocaleString('ko-KR')}만원`;
}

export function formatReportArea(area: number): { pyeong: string; squareMeters: string } {
  return {
    pyeong: `${squareMetersToPyeong(area).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평`,
    squareMeters: `${area.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎡`,
  };
}

/** Keep browser date constraints aligned to Korean calendar days, not the visitor's timezone. */
export function contractDateBounds(now = new Date()): { min: string; max: string } {
  const koreanDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const max = koreanDate.toISOString().slice(0, 10);
  koreanDate.setUTCDate(koreanDate.getUTCDate() - 90);
  return { min: koreanDate.toISOString().slice(0, 10), max };
}

export function formatReportPublishedDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
  }).format(new Date(value));
}

/** A malformed API response must not be presented as an empty, healthy feed. */
export function isPublicFieldReport(value: unknown): value is PublicFieldReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<PublicFieldReport>;
  return typeof report.id === 'string' && report.id.length > 0
    && typeof report.apartmentId === 'string' && report.apartmentId.trim().length > 0
    && report.apartmentId.length <= 160 && !/[\x00-\x1f<>]/.test(report.apartmentId)
    && typeof report.apartmentName === 'string' && report.apartmentName.trim().length > 0
    && typeof report.sido === 'string'
    && typeof report.sigungu === 'string' && report.sigungu.trim().length > 0
    && (typeof report.dong === 'string' || report.dong === null)
    && typeof report.area === 'number' && Number.isFinite(report.area) && report.area >= 10 && report.area <= 500
    && (report.tradeType === 'sale' || report.tradeType === 'jeonse' || report.tradeType === 'monthly')
    && typeof report.price === 'number' && Number.isInteger(report.price)
    && report.price >= (report.tradeType === 'monthly' ? 0 : 1) && report.price <= 5_000_000
    && (report.tradeType === 'monthly'
      ? typeof report.monthlyRent === 'number' && Number.isInteger(report.monthlyRent)
        && report.monthlyRent >= 1 && report.monthlyRent <= 10_000
      : report.monthlyRent === null)
    && typeof report.contractDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(report.contractDate)
    && isFieldReportSource(report.source)
    && typeof report.createdAt === 'string' && Number.isFinite(Date.parse(report.createdAt))
    && typeof report.publishedAt === 'string' && Number.isFinite(Date.parse(report.publishedAt));
}

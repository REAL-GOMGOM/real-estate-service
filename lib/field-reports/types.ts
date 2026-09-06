/** 제보는 공식 거래 원장/통계와 결합하지 않는 별도 콘텐츠입니다. */
export type FieldReportTradeType = 'sale' | 'jeonse' | 'monthly';
export const FIELD_REPORT_SOURCES = ['participant', 'agent', 'neighbor', 'anonymous', 'field_news'] as const;
export type FieldReportSource = (typeof FIELD_REPORT_SOURCES)[number];
export type FieldReportStatus = 'pending' | 'published' | 'rejected' | 'hidden';
export type FieldReportFlagReason = 'false_information' | 'duplicate' | 'personal_information';

export interface PublicFieldReport {
  id: string;
  apartmentId: string;
  apartmentName: string;
  sido: string;
  sigungu: string;
  dong: string | null;
  /** 전용면적 단위: ㎡. */
  area: number;
  tradeType: FieldReportTradeType;
  /** 금액 단위: 만원 (월세는 보증금). */
  price: number;
  /** 월세 단위: 만원/월. */
  monthlyRent: number | null;
  contractDate: string;
  source: FieldReportSource;
  createdAt: string;
  publishedAt: string;
}

export interface AdminFieldReport extends Omit<PublicFieldReport, 'publishedAt'> {
  publishedAt: string | null;
  status: FieldReportStatus;
  expiresAt: string;
  flaggedAt: string | null;
  flagReason: FieldReportFlagReason | null;
}

/** Legacy records may omit nullable metadata. Missing is not a complaint;
 * any present complaint metadata still requires review, even if malformed. */
export function hasFieldReportFlag(report: Pick<AdminFieldReport, 'flaggedAt' | 'flagReason'>): boolean {
  return report.flaggedAt != null || report.flagReason != null;
}

export type FieldReportActionState =
  | { status: 'idle' }
  | { status: 'success'; receipt: string; message: string }
  | { status: 'error'; message: string };

export type FieldReportFlagState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

export interface FieldReportFeed {
  status: 'ok' | 'preparing' | 'unavailable';
  submissionsEnabled: boolean;
  reports: PublicFieldReport[];
  message?: string;
}

export const FIELD_REPORT_TRADE_LABELS = { sale: '매매', jeonse: '전세', monthly: '월세' } as const;
export const FIELD_REPORT_SOURCE_LABELS = {
  participant: '거래 당사자', agent: '공인중개사', neighbor: '입주민·이웃',
  anonymous: '익명', field_news: '현장소식',
} as const satisfies Record<FieldReportSource, string>;
export const FIELD_REPORT_PUBLIC_DAYS = 30;
export const FIELD_REPORT_RETENTION_DAYS = 90;

export function isFieldReportSource(value: unknown): value is FieldReportSource {
  return typeof value === 'string' && (FIELD_REPORT_SOURCES as readonly string[]).includes(value);
}

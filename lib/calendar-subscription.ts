import { cacheLife } from 'next/cache';

const ODCLOUD_BASE    = 'https://api.odcloud.kr/api';
const DETAIL_SVC      = 'ApplyhomeInfoDetailSvc/v1';
const FETCH_TIMEOUT_MS = 5_000;

type ApiRow = Record<string, string>;

// ─────────────────────────────────────────
// YYYYMMDD → YYYY-MM-DD
// ─────────────────────────────────────────
function parseApiDate(raw: string | undefined): string {
  if (!raw || raw.length !== 8) return '';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────
export type SubscriptionEventType =
  | 'special'   // 특별공급
  | 'first'     // 1순위
  | 'second'    // 2순위
  | 'announce'  // 당첨자 발표
  | 'contract'; // 계약

export interface SubscriptionCalendarEvent {
  id:         string;
  date:       string; // YYYY-MM-DD
  name:       string; // 단지명
  district:   string;
  address:    string;
  type:       SubscriptionEventType;
  totalUnits: number;
}

// ─────────────────────────────────────────
// API 행 → 날짜별 이벤트 분해
// 각 청약 건에서 최대 5개의 날짜 이벤트 생성
// ─────────────────────────────────────────
const DATE_FIELD_MAP: Array<{ field: string; type: SubscriptionEventType }> = [
  { field: 'SPSPLY_RCEPT_BGNDE',                type: 'special'  },
  { field: 'GNRL_RNK1_CRSPAREA_RCEPT_BGNDE',   type: 'first'    },
  { field: 'GNRL_RNK2_CRSPAREA_RCEPT_BGNDE',   type: 'second'   },
  { field: 'PRZWNER_PRESNATN_DE',               type: 'announce' },
  { field: 'CNTRCT_CNCLS_BGNDE',               type: 'contract' },
];

function extractEventsFromRow(row: ApiRow): SubscriptionCalendarEvent[] {
  const houseNo = row['HOUSE_MANAGE_NO'];
  const name    = row['HOUSE_NM']?.trim();
  if (!houseNo || !name) return [];

  const district   = row['SUBSCRPT_AREA_CODE_NM']?.trim() ?? '';
  const address    = row['HSSPLY_ADRES']?.trim() ?? '';
  const totalUnits = parseInt(row['TOT_SUPLY_HSHLDCO'] ?? '0', 10) || 0;

  return DATE_FIELD_MAP.flatMap(({ field, type }) => {
    const date = parseApiDate(row[field]);
    if (!date) return [];
    return [{
      id: `${houseNo}-${type}`,
      date,
      name,
      district,
      address,
      type,
      totalUnits,
    }];
  });
}

// ─────────────────────────────────────────
// 단일 페이지 호출
// ─────────────────────────────────────────
async function fetchDetailPage(
  endpoint: string,
  apiKey:   string,
  page:     number,
  perPage:  number,
): Promise<{ data: ApiRow[]; totalCount: number }> {
  const params = new URLSearchParams({
    page:       String(page),
    perPage:    String(perPage),
    returnType: 'JSON',
    serviceKey: apiKey,
  });

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res  = await fetch(`${ODCLOUD_BASE}/${DETAIL_SVC}/${endpoint}?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as {
      data?: ApiRow[];
      totalCount?: number;
      matchCount?: number;
    };
    return {
      data:       json.data       ?? [],
      totalCount: json.totalCount ?? json.matchCount ?? 0,
    };
  } finally {
    clearTimeout(timerId);
  }
}

// ─────────────────────────────────────────
// 메인 export: 청약 달력 이벤트 목록
// 1시간 캐시 (API 쿼터 절약)
// ─────────────────────────────────────────
export async function fetchSubscriptionCalendarEvents(): Promise<SubscriptionCalendarEvent[]> {
  'use cache';
  cacheLife('hours');

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다');
  const apiKey = decodeURIComponent(rawKey);

  const [aptResult, remndrResult] = await Promise.allSettled([
    fetchDetailPage('getAPTLttotPblancDetail',   apiKey, 1, 100),
    fetchDetailPage('getRemndrLttotPblancDetail', apiKey, 1, 100),
  ]);

  const aptRows    = aptResult.status    === 'fulfilled' ? aptResult.value.data    : [];
  const remndrRows = remndrResult.status === 'fulfilled' ? remndrResult.value.data : [];

  const seenIds = new Set<string>();
  const events: SubscriptionCalendarEvent[] = [];

  for (const row of [...aptRows, ...remndrRows]) {
    for (const event of extractEventsFromRow(row)) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        events.push(event);
      }
    }
  }

  return events;
}

import { cacheLife } from 'next/cache';
import type { SubscriptionItem, CompetitionRateEntry, SupplyDate } from '@/lib/types';

const ODCLOUD_BASE     = 'https://api.odcloud.kr/api';
const DETAIL_SVC       = 'ApplyhomeInfoDetailSvc/v1';
const CMPET_SVC        = 'ApplyhomeInfoCmpetRtSvc/v1';
const FETCH_TIMEOUT_MS = 5000;

type SubscriptionStatus = 'upcoming' | 'ongoing' | 'closed';
type ApiRow = Record<string, string>;

// ────────────────────────────────────────────────
// 날짜 → 상태 변환
// ────────────────────────────────────────────────
function deriveStatus(startDate: string, endDate: string): SubscriptionStatus {
  if (!startDate || !endDate) return 'upcoming';
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'closed';
  return 'ongoing';
}

// ────────────────────────────────────────────────
// 가격 필드 추출
// ⚠️ 실제 API 응답 확인 전까지 후보 필드 순서대로 시도
// ────────────────────────────────────────────────
const PRICE_FIELD_CANDIDATES = [
  'SUPLY_AMOUNT',
  'LTTOT_TOP_PRICE',
  'SUPLY_PRICE_MAX',
  'HSHLD_PRICE',
] as const;

function extractPriceManwon(row: ApiRow): number | null {
  for (const field of PRICE_FIELD_CANDIDATES) {
    const raw = row[field];
    if (!raw) continue;
    const parsed = parseInt(raw.replace(/,/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

// ────────────────────────────────────────────────
// 단일 odcloud 엔드포인트 호출
// ────────────────────────────────────────────────
async function fetchOdcloudPage(
  service:  string,
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
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${ODCLOUD_BASE}/${service}/${endpoint}?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`odcloud ${endpoint} HTTP ${res.status}`);
    const json = await res.json() as { data?: ApiRow[]; totalCount?: number; matchCount?: number };
    return {
      data:       json.data ?? [],
      totalCount: json.totalCount ?? json.matchCount ?? 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** perPage씩 최대 maxPages 페이지까지 자동 페이징 */
async function fetchOdcloudEndpoint(
  service:   string,
  endpoint:  string,
  apiKey:    string,
  perPage:   number,
  maxPages = 3,
): Promise<ApiRow[]> {
  const first = await fetchOdcloudPage(service, endpoint, apiKey, 1, perPage);
  const allData = [...first.data];

  const totalPages = Math.min(maxPages, Math.ceil(first.totalCount / perPage));
  if (totalPages > 1) {
    const rest = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetchOdcloudPage(service, endpoint, apiKey, i + 2, perPage),
      ),
    );
    for (const r of rest) {
      if (r.status === 'fulfilled') allData.push(...r.value.data);
    }
  }

  return allData;
}

// ────────────────────────────────────────────────
// 주택관리번호별 가격·면적 집계
// ────────────────────────────────────────────────
interface HouseStats {
  minPrice: number | null;
  maxPrice: number | null;
  minArea:  number | null;
  maxArea:  number | null;
}

function buildHouseStatsMap(modelRows: ApiRow[]): Map<string, HouseStats> {
  const map = new Map<string, HouseStats>();

  for (const row of modelRows) {
    const houseNo = row['HOUSE_MANAGE_NO'];
    if (!houseNo) continue;

    const price = extractPriceManwon(row);
    const area  = parseFloat(row['SUPLY_AR'] ?? '') || null;
    const curr  = map.get(houseNo) ?? { minPrice: null, maxPrice: null, minArea: null, maxArea: null };

    map.set(houseNo, {
      minPrice: price === null ? curr.minPrice : curr.minPrice === null ? price : Math.min(curr.minPrice, price),
      maxPrice: price === null ? curr.maxPrice : curr.maxPrice === null ? price : Math.max(curr.maxPrice, price),
      minArea:  area  === null ? curr.minArea  : curr.minArea  === null ? area  : Math.min(curr.minArea,  area),
      maxArea:  area  === null ? curr.maxArea  : curr.maxArea  === null ? area  : Math.max(curr.maxArea,  area),
    });
  }

  return map;
}

// ────────────────────────────────────────────────
// 주택관리번호별 경쟁률 집계 (평형별 상세 + 전체 평균)
// ────────────────────────────────────────────────

// 주택형 필드명 후보 — 실제 응답 확인 전 순서대로 시도
const HOUSE_TYPE_FIELD_CANDIDATES = ['HOUSE_TY', 'HOUSING_TYPE', 'HOUSEHOLD_TYPE'] as const;

function extractHouseType(row: ApiRow): string {
  for (const field of HOUSE_TYPE_FIELD_CANDIDATES) {
    const val = row[field]?.trim();
    if (val) return val;
  }
  // 면적으로 폴백: "084.97A" 같은 숫자형 필드가 있을 경우 ㎡ 단위로 변환
  const area = parseFloat(row['SUPLY_AR'] ?? '');
  if (!isNaN(area) && area > 0) return `${Math.round(area)}㎡`;
  return '기타';
}

interface CmpetAccEntry {
  houseType: string;
  rate:      number;
  reqCount:  number | null;
}

interface CmpetMapValue {
  entries:     CmpetAccEntry[];
  overallRate: number;  // 평형별 평균
}

function buildCompetitionRateMap(cmpetRows: ApiRow[]): Map<string, CmpetMapValue> {
  // houseNo → 평형별 항목 배열
  const raw = new Map<string, CmpetAccEntry[]>();

  for (const row of cmpetRows) {
    const houseNo = row['HOUSE_MANAGE_NO'];
    if (!houseNo) continue;

    const rateRaw = row['CMPET_RATE'];
    if (!rateRaw) continue;

    const rate = parseFloat(rateRaw.replace(/,/g, ''));
    if (isNaN(rate)) continue;

    const reqCountRaw = row['REQ_CNT'];
    const reqCount    = reqCountRaw ? parseInt(reqCountRaw.replace(/,/g, ''), 10) || null : null;
    const houseType   = extractHouseType(row);

    const list = raw.get(houseNo) ?? [];
    list.push({ houseType, rate, reqCount });
    raw.set(houseNo, list);
  }

  const result = new Map<string, CmpetMapValue>();
  for (const [houseNo, entries] of raw) {
    const sum         = entries.reduce((acc, e) => acc + e.rate, 0);
    const overallRate = Math.round((sum / entries.length) * 10) / 10;
    result.set(houseNo, { entries, overallRate });
  }
  return result;
}

// ────────────────────────────────────────────────
// 공급유형별 일정 추출
// ────────────────────────────────────────────────
const SUPPLY_DATE_FIELDS: [string, SupplyDate['type'], string][] = [
  ['SPSPLY_RCEPT_BGNDE',          'special', '특별공급'],
  ['GNRL_RNK1_CRSPAREA_RCPTDE',   'first',   '1순위'],
  ['GNRL_RNK2_CRSPAREA_RCPTDE',   'second',  '2순위'],
  ['GNRL_RNK1_ETC_AREA_RCPTDE',   'etc',     '무순위/기타'],
];

function extractSupplyDates(row: ApiRow): SupplyDate[] {
  const dates: SupplyDate[] = [];
  for (const [field, type, label] of SUPPLY_DATE_FIELDS) {
    const val = row[field]?.trim();
    if (val && val.length >= 8) {
      dates.push({ type, label, date: val });
    }
  }
  return dates;
}

// ────────────────────────────────────────────────
// API 행 → SubscriptionItem 변환
// ────────────────────────────────────────────────
function buildHouseType(stats: HouseStats | undefined): string {
  if (!stats) return '';
  const { minArea, maxArea } = stats;
  if (minArea === null) return '';
  if (maxArea === null || minArea === maxArea) return `${Math.round(minArea)}㎡`;
  return `${Math.round(minArea)}㎡~${Math.round(maxArea)}㎡`;
}

function mapRowToItem(
  row:      ApiRow,
  statsMap: Map<string, HouseStats>,
  cmpetMap: Map<string, CmpetMapValue>,
  idPrefix: string,
): SubscriptionItem | null {
  const houseNo = row['HOUSE_MANAGE_NO'];
  const name    = row['HOUSE_NM']?.trim();
  if (!houseNo || !name) return null;

  const startDate = row['RCEPT_BGNDE'] ?? '';
  const endDate   = row['RCEPT_ENDDE'] ?? '';
  const stats     = statsMap.get(houseNo);
  const cmpet     = cmpetMap.get(houseNo);

  const competitionRates: CompetitionRateEntry[] = cmpet?.entries.map((e) => ({
    houseType: e.houseType,
    rate:      e.rate,
    reqCount:  e.reqCount,
  })) ?? [];

  return {
    id:               `${idPrefix}-${houseNo}`,
    name,
    district:         row['SUBSCRPT_AREA_CODE_NM']?.trim() ?? '',
    address:          row['HSSPLY_ADRES']?.trim() ?? '',
    startDate,
    endDate,
    announceDate:     row['PRZWNER_PRESNATN_DE'] ?? '',
    totalUnits:       parseInt(row['TOT_SUPLY_HSHLDCO'] ?? '0', 10) || 0,
    competitionRate:  cmpet?.overallRate ?? null,
    competitionRates,
    status:           deriveStatus(startDate, endDate),
    minPrice:         stats?.minPrice ?? null,
    maxPrice:         stats?.maxPrice ?? null,
    houseType:        buildHouseType(stats),
    supplyDates:      extractSupplyDates(row),
  };
}

// ────────────────────────────────────────────────
// 상태 정렬 우선순위
// ────────────────────────────────────────────────
const STATUS_ORDER: Record<SubscriptionStatus, number> = {
  ongoing:  0,
  upcoming: 1,
  closed:   2,
};

// ────────────────────────────────────────────────
// 메인 fetch 함수 (1시간 캐시)
// ────────────────────────────────────────────────
export async function fetchSubscriptions(): Promise<SubscriptionItem[]> {
  'use cache';
  cacheLife('hours');

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다');
  const apiKey = decodeURIComponent(rawKey);

  // 6개 엔드포인트 병렬 호출 — 일부 실패해도 나머지 결과 사용
  const [
    aptDetailResult,
    remndrDetailResult,
    aptModelResult,
    remndrModelResult,
    aptCmpetResult,
    remndrCmpetResult,
  ] = await Promise.allSettled([
    fetchOdcloudEndpoint(DETAIL_SVC, 'getAPTLttotPblancDetail',    apiKey, 100, 3),
    fetchOdcloudEndpoint(DETAIL_SVC, 'getRemndrLttotPblancDetail',  apiKey, 100, 3),
    fetchOdcloudEndpoint(DETAIL_SVC, 'getAPTLttotPblancMdl',        apiKey, 300, 2),
    fetchOdcloudEndpoint(DETAIL_SVC, 'getRemndrLttotPblancMdl',     apiKey, 300, 2),
    fetchOdcloudEndpoint(CMPET_SVC,  'getAPTLttotPblancCmpet',      apiKey, 300, 2),
    fetchOdcloudEndpoint(CMPET_SVC,  'getRemndrLttotPblancCmpet',   apiKey, 300, 2),
  ]);

  const aptDetails    = aptDetailResult.status    === 'fulfilled' ? aptDetailResult.value    : [];
  const remndrDetails = remndrDetailResult.status === 'fulfilled' ? remndrDetailResult.value : [];
  const aptModels     = aptModelResult.status     === 'fulfilled' ? aptModelResult.value     : [];
  const remndrModels  = remndrModelResult.status  === 'fulfilled' ? remndrModelResult.value  : [];
  const aptCmpet      = aptCmpetResult.status     === 'fulfilled' ? aptCmpetResult.value     : [];
  const remndrCmpet   = remndrCmpetResult.status  === 'fulfilled' ? remndrCmpetResult.value  : [];

  const statsMap = buildHouseStatsMap([...aptModels, ...remndrModels]);
  const cmpetMap = buildCompetitionRateMap([...aptCmpet, ...remndrCmpet]);

  const remndrSet = new Set(remndrDetails);
  const seenIds   = new Set<string>();
  const items: SubscriptionItem[] = [];

  for (const row of [...aptDetails, ...remndrDetails]) {
    const prefix = remndrSet.has(row) ? 'remndr' : 'apt';
    const item   = mapRowToItem(row, statsMap, cmpetMap, prefix);
    if (item && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      items.push(item);
    }
  }

  return items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

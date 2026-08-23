import { cacheLife } from 'next/cache';
import type { CompetitionRateEntry, SubscriptionItem, SupplyDate } from '@/lib/types';
import {
  deriveSubscriptionStatusOnDate,
  normalizeSubscriptionDate,
  type SubscriptionStatus,
} from '@/lib/subscription-date';
import { kstTodayIso } from '@/lib/agg-window';

const ODCLOUD_BASE = 'https://api.odcloud.kr/api';
const APT_DETAIL_SVC = 'ApplyhomeInfoDetailSvc/v1';
const APT_CMPET_SVC = 'ApplyhomeInfoCmpetRtSvc/v1';
const FETCH_TIMEOUT_MS = 5_000;
const MAX_ENDPOINT_PAGES = 50;
const PAGE_BATCH_SIZE = 5;
const CLOSED_HISTORY_DAYS = 180;

type ApiRow = Record<string, string>;
type RowSource = 'apt' | 'remndr' | 'arbitrary';

const HOUSE_SECD_ILLEGAL = '06';

interface EndpointDefinition {
  key: string;
  label: string;
  service: string;
  endpoint: string;
  perPage: number;
  source?: RowSource;
  kind: 'detail' | 'model' | 'competition';
}

const ENDPOINTS: readonly EndpointDefinition[] = [
  { key: 'aptDetail', label: '일반분양 공고', service: APT_DETAIL_SVC, endpoint: 'getAPTLttotPblancDetail', perPage: 100, source: 'apt', kind: 'detail' },
  { key: 'aptModel', label: '일반분양 주택형', service: APT_DETAIL_SVC, endpoint: 'getAPTLttotPblancMdl', perPage: 300, kind: 'model' },
  { key: 'aptCompetition', label: '일반분양 경쟁률', service: APT_CMPET_SVC, endpoint: 'getAPTLttotPblancCmpet', perPage: 300, kind: 'competition' },
  { key: 'remainderDetail', label: '잔여세대 공고', service: APT_DETAIL_SVC, endpoint: 'getRemndrLttotPblancDetail', perPage: 100, source: 'remndr', kind: 'detail' },
  { key: 'remainderModel', label: '잔여세대 주택형', service: APT_DETAIL_SVC, endpoint: 'getRemndrLttotPblancMdl', perPage: 300, kind: 'model' },
  { key: 'remainderCompetition', label: '잔여세대 경쟁률', service: APT_CMPET_SVC, endpoint: 'getRemndrLttotPblancCmpet', perPage: 300, kind: 'competition' },
  { key: 'optionalDetail', label: '임의공급 공고', service: APT_DETAIL_SVC, endpoint: 'getOPTLttotPblancDetail', perPage: 100, source: 'arbitrary', kind: 'detail' },
  { key: 'optionalModel', label: '임의공급 주택형', service: APT_DETAIL_SVC, endpoint: 'getOPTLttotPblancMdl', perPage: 300, kind: 'model' },
  { key: 'optionalCompetition', label: '임의공급 경쟁률', service: APT_CMPET_SVC, endpoint: 'getOPTLttotPblancCmpet', perPage: 300, kind: 'competition' },
  { key: 'cancelCompetition', label: '취소후재공급 경쟁률', service: APT_CMPET_SVC, endpoint: 'getCancResplLttotPblancCmpet', perPage: 300, kind: 'competition' },
] as const;

interface EndpointFetchResult {
  data: ApiRow[];
  complete: boolean;
  totalCount: number;
  fetchedPages: number;
  failedPages: number[];
}

export interface SubscriptionCoverage {
  requestedEndpoints: number;
  successfulEndpoints: number;
  failedEndpoints: string[];
  incompleteEndpoints: string[];
  discardedRows: number;
  historicalRowsExcluded: number;
  displayWindowStart: string | null;
}

export interface SubscriptionFetchResult {
  status: 'ok' | 'partial' | 'unavailable';
  items: SubscriptionItem[];
  coverage: SubscriptionCoverage;
  note?: string;
}

function unavailableResult(note: string): SubscriptionFetchResult {
  return {
    status: 'unavailable',
    items: [],
    coverage: {
      requestedEndpoints: ENDPOINTS.length,
      successfulEndpoints: 0,
      failedEndpoints: ENDPOINTS.map((endpoint) => endpoint.label),
      incompleteEndpoints: [],
      discardedRows: 0,
      historicalRowsExcluded: 0,
      displayWindowStart: null,
    },
    note,
  };
}

function calendarDateDaysBefore(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`) - days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeApplyhomeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return undefined;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'applyhome.co.kr' && hostname !== 'www.applyhome.co.kr') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

async function getSubscriptionToday(): Promise<string> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 300, expire: 600 });
  return kstTodayIso(new Date());
}

async function fetchOdcloudPage(
  service: string,
  endpoint: string,
  apiKey: string,
  page: number,
  perPage: number,
): Promise<{ data: ApiRow[]; totalCount: number }> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    returnType: 'JSON',
    serviceKey: apiKey,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${ODCLOUD_BASE}/${service}/${endpoint}?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      next: { revalidate: 3_600 },
    });
    if (!response.ok) throw new Error(`odcloud ${endpoint} HTTP ${response.status}`);

    const json = await response.json() as {
      data?: unknown;
      totalCount?: unknown;
      matchCount?: unknown;
    };
    const totalValue = json.totalCount ?? json.matchCount;
    const totalCount = typeof totalValue === 'number'
      ? totalValue
      : typeof totalValue === 'string'
        ? Number(totalValue)
        : Number.NaN;

    if (!Array.isArray(json.data) || !Number.isInteger(totalCount) || totalCount < 0) {
      throw new Error(`odcloud ${endpoint} 응답 형식이 올바르지 않습니다`);
    }

    const data = json.data.filter(
      (row): row is ApiRow => typeof row === 'object' && row !== null && !Array.isArray(row),
    );
    if (data.length !== json.data.length) {
      throw new Error(`odcloud ${endpoint} 행 형식이 올바르지 않습니다`);
    }
    return { data, totalCount };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOdcloudEndpoint(
  definition: EndpointDefinition,
  apiKey: string,
): Promise<EndpointFetchResult> {
  const first = await fetchOdcloudPage(
    definition.service,
    definition.endpoint,
    apiKey,
    1,
    definition.perPage,
  );
  const totalPages = Math.max(1, Math.ceil(first.totalCount / definition.perPage));
  const requestedPages = Math.min(totalPages, MAX_ENDPOINT_PAGES);
  const data = [...first.data];
  const failedPages: number[] = [];

  const remainingPages = Array.from({ length: Math.max(0, requestedPages - 1) }, (_, index) => index + 2);
  for (let index = 0; index < remainingPages.length; index += PAGE_BATCH_SIZE) {
    const batch = remainingPages.slice(index, index + PAGE_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((page) => fetchOdcloudPage(
        definition.service,
        definition.endpoint,
        apiKey,
        page,
        definition.perPage,
      )),
    );
    settled.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') data.push(...result.value.data);
      else failedPages.push(batch[resultIndex]);
    });
  }

  return {
    data,
    complete: totalPages <= MAX_ENDPOINT_PAGES
      && failedPages.length === 0
      && data.length >= first.totalCount,
    totalCount: first.totalCount,
    fetchedPages: requestedPages - failedPages.length,
    failedPages,
  };
}

interface HouseStats {
  minArea: number | null;
  maxArea: number | null;
}

function buildHouseStatsMap(modelRows: ApiRow[]): Map<string, HouseStats> {
  const map = new Map<string, HouseStats>();
  for (const row of modelRows) {
    const houseNo = row['HOUSE_MANAGE_NO'];
    if (!houseNo) continue;
    const parsedArea = Number.parseFloat(row['SUPLY_AR'] ?? '');
    const area = Number.isFinite(parsedArea) && parsedArea > 0 ? parsedArea : null;
    const current = map.get(houseNo) ?? { minArea: null, maxArea: null };
    map.set(houseNo, {
      minArea: area === null || current.minArea !== null && current.minArea <= area ? current.minArea : area,
      maxArea: area === null || current.maxArea !== null && current.maxArea >= area ? current.maxArea : area,
    });
  }
  return map;
}

interface CompetitionMapValue {
  entries: CompetitionRateEntry[];
}

function buildCompetitionRateMap(cmpetRows: ApiRow[]): Map<string, CompetitionMapValue> {
  const raw = new Map<string, CompetitionRateEntry[]>();
  for (const row of cmpetRows) {
    const houseNo = row['HOUSE_MANAGE_NO'];
    const rateValue = Number.parseFloat((row['CMPET_RATE'] ?? '').replace(/,/g, ''));
    if (!houseNo || !Number.isFinite(rateValue) || rateValue < 0) continue;

    const countValue = Number.parseInt((row['REQ_CNT'] ?? '').replace(/,/g, ''), 10);
    const entry: CompetitionRateEntry = {
      houseType: row['HOUSE_TY']?.trim() || '주택형 미표기',
      rate: rateValue,
      reqCount: Number.isInteger(countValue) && countValue >= 0 ? countValue : null,
    };
    const entries = raw.get(houseNo) ?? [];
    entries.push(entry);
    raw.set(houseNo, entries);
  }
  return new Map(Array.from(raw, ([houseNo, entries]) => [houseNo, { entries }]));
}

const APT_SUPPLY_DATE_FIELDS: [string, SupplyDate['type'], string][] = [
  ['SPSPLY_RCEPT_BGNDE', 'special', '특별공급'],
  ['GNRL_RNK1_CRSPAREA_RCPTDE', 'first', '1순위'],
  ['GNRL_RNK2_CRSPAREA_RCPTDE', 'second', '2순위'],
];

const REMNDR_OR_ARBITRARY_DATE_FIELDS: [string, string][] = [
  ['SPSPLY_RCEPT_BGNDE', '특별공급'],
  ['GNRL_RCEPT_BGNDE', '일반공급'],
];

function extractAptSupplyDates(row: ApiRow): SupplyDate[] {
  return APT_SUPPLY_DATE_FIELDS.flatMap(([field, type, label]) => {
    const date = normalizeSubscriptionDate(row[field]);
    return date ? [{ type, label, date }] : [];
  });
}

function classifyRemainderType(houseSecd: string): 'unranked' | 'illegal' {
  return houseSecd === HOUSE_SECD_ILLEGAL ? 'illegal' : 'unranked';
}

function extractRemainderSupplyDates(row: ApiRow): SupplyDate[] {
  const type = classifyRemainderType(row['HOUSE_SECD'] ?? '04');
  const typeLabel = type === 'illegal' ? '불법행위재공급' : '무순위';
  return REMNDR_OR_ARBITRARY_DATE_FIELDS.flatMap(([field, label]) => {
    const date = normalizeSubscriptionDate(row[field]);
    return date ? [{ type, label: `${typeLabel}-${label}`, date }] : [];
  });
}

function extractArbitrarySupplyDates(row: ApiRow): SupplyDate[] {
  return REMNDR_OR_ARBITRARY_DATE_FIELDS.flatMap(([field, label]) => {
    const date = normalizeSubscriptionDate(row[field]);
    return date ? [{ type: 'arbitrary' as const, label: `임의공급-${label}`, date }] : [];
  });
}

function buildHouseType(stats: HouseStats | undefined): string {
  if (!stats || stats.minArea === null) return '';
  if (stats.maxArea === null || stats.minArea === stats.maxArea) return `${Math.round(stats.minArea)}㎡`;
  return `${Math.round(stats.minArea)}㎡~${Math.round(stats.maxArea)}㎡`;
}

function mapRowToItem(
  row: ApiRow,
  source: RowSource,
  statsMap: Map<string, HouseStats>,
  competitionMap: Map<string, CompetitionMapValue>,
  evaluationDate: string,
): SubscriptionItem | null {
  const houseNo = row['HOUSE_MANAGE_NO'];
  const name = row['HOUSE_NM']?.trim();
  if (!houseNo || !name) return null;

  let rawStartDate: string;
  let rawEndDate: string;
  let supplyDates: SupplyDate[];
  let supplyCategory: SubscriptionItem['supplyCategory'];
  let idPrefix: string;

  if (source === 'apt') {
    rawStartDate = row['RCEPT_BGNDE'] ?? '';
    rawEndDate = row['RCEPT_ENDDE'] ?? '';
    supplyDates = extractAptSupplyDates(row);
    supplyCategory = 'apt';
    idPrefix = 'apt';
  } else if (source === 'remndr') {
    rawStartDate = row['SUBSCRPT_RCEPT_BGNDE'] ?? row['GNRL_RCEPT_BGNDE'] ?? '';
    rawEndDate = row['SUBSCRPT_RCEPT_ENDDE'] ?? row['GNRL_RCEPT_ENDDE'] ?? '';
    supplyDates = extractRemainderSupplyDates(row);
    const remainderType = classifyRemainderType(row['HOUSE_SECD'] ?? '04');
    supplyCategory = remainderType === 'illegal' ? 'remndr-illegal' : 'remndr-unranked';
    idPrefix = supplyCategory;
  } else {
    rawStartDate = row['SUBSCRPT_RCEPT_BGNDE'] ?? row['GNRL_RCEPT_BGNDE'] ?? '';
    rawEndDate = row['SUBSCRPT_RCEPT_ENDDE'] ?? row['GNRL_RCEPT_ENDDE'] ?? '';
    supplyDates = extractArbitrarySupplyDates(row);
    supplyCategory = 'arbitrary';
    idPrefix = 'arbitrary';
  }

  const startDate = normalizeSubscriptionDate(rawStartDate);
  const endDate = normalizeSubscriptionDate(rawEndDate);
  const status = startDate && endDate
    ? deriveSubscriptionStatusOnDate(startDate, endDate, evaluationDate)
    : null;
  if (!startDate || !endDate || !status) return null;

  const stats = statsMap.get(houseNo);
  const competitionRates = competitionMap.get(houseNo)?.entries ?? [];
  const units = Number.parseInt(row['TOT_SUPLY_HSHLDCO'] ?? '', 10);

  return {
    id: `${idPrefix}-${houseNo}`,
    name,
    district: row['SUBSCRPT_AREA_CODE_NM']?.trim() ?? '',
    address: row['HSSPLY_ADRES']?.trim() ?? '',
    startDate,
    endDate,
    announceDate: normalizeSubscriptionDate(row['PRZWNER_PRESNATN_DE']) ?? '',
    totalUnits: Number.isInteger(units) && units > 0 ? units : null,
    competitionRate: null,
    competitionRates,
    status,
    // 공급유형별 가격 필드 의미를 실응답으로 검증하기 전까지 숫자를 노출하지 않는다.
    minPrice: null,
    maxPrice: null,
    houseType: buildHouseType(stats),
    supplyDates,
    supplyCategory,
    sourceUrl: normalizeApplyhomeUrl(row['PBLANC_URL']),
  };
}

const STATUS_ORDER: Record<SubscriptionStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  closed: 2,
};

export async function fetchSubscriptions(evaluationDate?: string): Promise<SubscriptionFetchResult> {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) return unavailableResult('공공데이터 API 환경설정을 확인하고 있습니다.');

  let apiKey: string;
  try {
    apiKey = decodeURIComponent(rawKey);
  } catch {
    return unavailableResult('공공데이터 API 환경설정 형식이 올바르지 않습니다.');
  }

  const settled = await Promise.allSettled(
    ENDPOINTS.map((definition) => fetchOdcloudEndpoint(definition, apiKey)),
  );
  const successful = new Map<string, EndpointFetchResult>();
  const failedEndpoints: string[] = [];
  const incompleteEndpoints: string[] = [];

  settled.forEach((result, index) => {
    const definition = ENDPOINTS[index];
    if (result.status === 'fulfilled') {
      successful.set(definition.key, result.value);
      if (!result.value.complete) incompleteEndpoints.push(definition.label);
    } else {
      failedEndpoints.push(definition.label);
    }
  });

  const detailDefinitions = ENDPOINTS.filter((definition) => definition.kind === 'detail');
  const availableDetailDefinitions = detailDefinitions.filter((definition) => successful.has(definition.key));
  const baseCoverage: SubscriptionCoverage = {
    requestedEndpoints: ENDPOINTS.length,
    successfulEndpoints: successful.size,
    failedEndpoints,
    incompleteEndpoints,
    discardedRows: 0,
    historicalRowsExcluded: 0,
    displayWindowStart: null,
  };

  if (availableDetailDefinitions.length === 0) {
    return {
      status: 'unavailable',
      items: [],
      coverage: baseCoverage,
      note: '청약홈 공고 원본을 불러오지 못했습니다. 임시 공고를 대신 표시하지 않습니다.',
    };
  }

  const statusDate = normalizeSubscriptionDate(evaluationDate) ?? await getSubscriptionToday();

  const modelRows = ENDPOINTS
    .filter((definition) => definition.kind === 'model')
    .flatMap((definition) => successful.get(definition.key)?.data ?? []);
  const competitionRows = ENDPOINTS
    .filter((definition) => definition.kind === 'competition')
    .flatMap((definition) => successful.get(definition.key)?.data ?? []);
  const statsMap = buildHouseStatsMap(modelRows);
  const competitionMap = buildCompetitionRateMap(competitionRows);

  const seenIds = new Set<string>();
  const items: SubscriptionItem[] = [];
  let discardedRows = 0;
  for (const definition of availableDetailDefinitions) {
    const source = definition.source;
    if (!source) continue;
    for (const row of successful.get(definition.key)?.data ?? []) {
      const item = mapRowToItem(row, source, statsMap, competitionMap, statusDate);
      if (!item) {
        discardedRows += 1;
        continue;
      }
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        items.push(item);
      }
    }
  }

  const displayWindowStart = calendarDateDaysBefore(statusDate, CLOSED_HISTORY_DAYS);
  const displayItems = items.filter(
    (item) => item.status !== 'closed' || item.endDate >= displayWindowStart,
  );
  const coverage = {
    ...baseCoverage,
    discardedRows,
    historicalRowsExcluded: items.length - displayItems.length,
    displayWindowStart,
  };
  const status: SubscriptionFetchResult['status'] = failedEndpoints.length > 0
    || incompleteEndpoints.length > 0
    || discardedRows > 0
    ? 'partial'
    : 'ok';
  const noteParts: string[] = [];
  if (failedEndpoints.length > 0) noteParts.push(`${failedEndpoints.length}개 자료 호출 실패`);
  if (incompleteEndpoints.length > 0) noteParts.push(`${incompleteEndpoints.length}개 자료 부분 수집`);
  if (discardedRows > 0) noteParts.push(`날짜·필수값 오류 ${discardedRows}건 제외`);

  return {
    status,
    items: displayItems.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || a.startDate.localeCompare(b.startDate)),
    coverage,
    note: noteParts.length > 0
      ? `일부 자료만 표시합니다: ${noteParts.join(', ')}.`
      : undefined,
  };
}

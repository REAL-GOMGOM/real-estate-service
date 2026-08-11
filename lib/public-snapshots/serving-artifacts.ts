import { DISTRICT_GROUPS } from '../district-groups';
import { normalizeMLTMName } from '../normalize-mltm-name';
import { matchesQuery } from '../search-utils';
import { transactionGroupKey } from '../transaction-identity';
import type {
  PublicNamedArtifactEnvelope,
  PublicTransactionRecord,
  PublicTransactionSnapshot,
} from './contract';
import { assertPublicTransactionSnapshot } from './contract';
import type { PublicNamedArtifactInput } from './publisher';

export const TRANSACTION_SUMMARY_SCHEMA = 'naezip.transaction-summary.v1' as const;
export const APARTMENT_INDEX_SCHEMA = 'naezip.apartment-index.v1' as const;

export const ROLLING30_SUMMARY_ARTIFACT_NAMES = {
  buy: 'summary/rolling30/buy',
  jeonse: 'summary/rolling30/jeonse',
  monthly: 'summary/rolling30/monthly',
  bunyang: 'summary/rolling30/bunyang',
} as const;

export const APARTMENT_INDEX_ARTIFACT_NAME = 'apartment-index' as const;
export const TRANSACTION_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const APARTMENT_INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type SummaryDealType = keyof typeof ROLLING30_SUMMARY_ARTIFACT_NAMES;
export type RentType = 'all' | 'jeonse' | 'monthly';

export interface SaleDistrictAggregate {
  sigungu: string;
  cnt: number;
  newHighs: number;
  sum59: number;
  cnt59: number;
  sum84: number;
  cnt84: number;
}

export interface RentDistrictAggregate {
  sigungu: string;
  cnt: number;
  sumDep59: number;
  cnt59: number;
  sumDep84: number;
  cnt84: number;
  sumRent59: number;
  sumRent84: number;
}

export interface TransactionSummaryRow {
  label: string;
  districtCount: number;
  estimatedCount: number;
  sampleCount: number;
  newHighs: number;
  avg59: number | null;
  avg84: number | null;
  avgRent59?: number | null;
  avgRent84?: number | null;
  firstDistrict: string;
}

export interface Rolling30SummaryData {
  status: 'ok';
  summary: TransactionSummaryRow[];
  daily: null;
  month: string;
  window: { type: 'rolling30'; from: string; to: string };
  updatedAt: string;
  note: string;
}

export interface ApartmentIndexSourceRow {
  id: string;
  name: string;
  aliases: string[];
  sido: string;
  sigungu: string;
  dong: string | null;
  lawdCd: string;
  totalHouseholds: number | null;
  score: number | null;
}

export type ApartmentIndexItem = ApartmentIndexSourceRow;

export class ServingArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServingArtifactValidationError';
  }
}

export function isServingArtifactFresh(
  generatedAt: string,
  options: { now?: Date; maxAgeMs: number },
): boolean {
  if (!isIsoTimestamp(generatedAt)) return false;
  const ageMs = (options.now ?? new Date()).getTime() - Date.parse(generatedAt);
  return ageMs >= -SNAPSHOT_FUTURE_TOLERANCE_MS && ageMs <= options.maxAgeMs;
}

function kstCalendarDate(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function isDistrictSnapshotFresh(
  snapshot: PublicTransactionSnapshot,
  now: Date = new Date(),
): boolean {
  return isServingArtifactFresh(snapshot.generatedAt, {
    now,
    maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
  }) && snapshot.period.through === kstCalendarDate(snapshot.generatedAt);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new ServingArtifactValidationError(`${path} fields are invalid`);
  }
}

function assertFiniteNumber(value: unknown, path: string, options: { integer?: boolean; min?: number } = {}): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || (options.integer && !Number.isInteger(value))
    || (options.min !== undefined && value < options.min)) {
    throw new ServingArtifactValidationError(`${path} must be a valid number`);
  }
}

function assertNullableNumber(value: unknown, path: string, options: { integer?: boolean; min?: number } = {}): void {
  if (value !== null) assertFiniteNumber(value, path, options);
}

function assertNonEmptyString(value: unknown, path: string, max = 200): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new ServingArtifactValidationError(`${path} must be a non-empty string`);
  }
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function avgOf(sum: number, count: number): number | null {
  return count === 0 ? null : Math.round(sum / count);
}

function assertAggregateNumber(value: number, path: string): void {
  assertFiniteNumber(value, path, { min: 0 });
}

function saleAggregateMap(rows: readonly SaleDistrictAggregate[], label: string): Map<string, SaleDistrictAggregate> {
  const result = new Map<string, SaleDistrictAggregate>();
  for (const row of rows) {
    assertNonEmptyString(row.sigungu, `${label}.sigungu`, 80);
    if (result.has(row.sigungu)) {
      throw new ServingArtifactValidationError(`${label} has duplicate district: ${row.sigungu}`);
    }
    assertAggregateNumber(row.cnt, `${label}.${row.sigungu}.cnt`);
    assertAggregateNumber(row.newHighs, `${label}.${row.sigungu}.newHighs`);
    assertAggregateNumber(row.sum59, `${label}.${row.sigungu}.sum59`);
    assertAggregateNumber(row.cnt59, `${label}.${row.sigungu}.cnt59`);
    assertAggregateNumber(row.sum84, `${label}.${row.sigungu}.sum84`);
    assertAggregateNumber(row.cnt84, `${label}.${row.sigungu}.cnt84`);
    result.set(row.sigungu, row);
  }
  return result;
}

function rentAggregateMap(rows: readonly RentDistrictAggregate[], label: string): Map<string, RentDistrictAggregate> {
  const result = new Map<string, RentDistrictAggregate>();
  for (const row of rows) {
    assertNonEmptyString(row.sigungu, `${label}.sigungu`, 80);
    if (result.has(row.sigungu)) {
      throw new ServingArtifactValidationError(`${label} has duplicate district: ${row.sigungu}`);
    }
    assertAggregateNumber(row.cnt, `${label}.${row.sigungu}.cnt`);
    assertAggregateNumber(row.sumDep59, `${label}.${row.sigungu}.sumDep59`);
    assertAggregateNumber(row.cnt59, `${label}.${row.sigungu}.cnt59`);
    assertAggregateNumber(row.sumDep84, `${label}.${row.sigungu}.sumDep84`);
    assertAggregateNumber(row.cnt84, `${label}.${row.sigungu}.cnt84`);
    assertAggregateNumber(row.sumRent59, `${label}.${row.sigungu}.sumRent59`);
    assertAggregateNumber(row.sumRent84, `${label}.${row.sigungu}.sumRent84`);
    result.set(row.sigungu, row);
  }
  return result;
}

function buildSaleSummaryRows(rows: readonly SaleDistrictAggregate[], label: string): TransactionSummaryRow[] {
  const byDistrict = saleAggregateMap(rows, label);
  return DISTRICT_GROUPS.map((group) => {
    let count = 0;
    let newHighs = 0;
    let sum59 = 0;
    let count59 = 0;
    let sum84 = 0;
    let count84 = 0;
    for (const district of group.districts) {
      const row = byDistrict.get(district);
      if (!row) continue;
      count += row.cnt;
      newHighs += row.newHighs;
      sum59 += row.sum59;
      count59 += row.cnt59;
      sum84 += row.sum84;
      count84 += row.cnt84;
    }
    return {
      label: group.label,
      districtCount: group.districts.length,
      estimatedCount: count,
      sampleCount: count,
      newHighs,
      avg59: avgOf(sum59, count59),
      avg84: avgOf(sum84, count84),
      firstDistrict: group.districts[0],
    };
  });
}

function buildRentSummaryRows(rows: readonly RentDistrictAggregate[], monthly: boolean): TransactionSummaryRow[] {
  const byDistrict = rentAggregateMap(rows, monthly ? 'monthly' : 'jeonse');
  return DISTRICT_GROUPS.map((group) => {
    let count = 0;
    let sum59 = 0;
    let count59 = 0;
    let sum84 = 0;
    let count84 = 0;
    let sumRent59 = 0;
    let sumRent84 = 0;
    for (const district of group.districts) {
      const row = byDistrict.get(district);
      if (!row) continue;
      count += row.cnt;
      sum59 += row.sumDep59;
      count59 += row.cnt59;
      sum84 += row.sumDep84;
      count84 += row.cnt84;
      sumRent59 += row.sumRent59;
      sumRent84 += row.sumRent84;
    }
    return {
      label: group.label,
      districtCount: group.districts.length,
      estimatedCount: count,
      sampleCount: count,
      newHighs: 0,
      avg59: avgOf(sum59, count59),
      avg84: avgOf(sum84, count84),
      ...(monthly ? {
        avgRent59: avgOf(sumRent59, count59),
        avgRent84: avgOf(sumRent84, count84),
      } : {}),
      firstDistrict: group.districts[0],
    };
  });
}

function kstMonth(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new ServingArtifactValidationError('generatedAt is invalid');
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 7).replace('-', '');
}

function summaryNote(dealType: SummaryDealType): string {
  const registeredDistrictCount = new Set(
    DISTRICT_GROUPS.flatMap((group) => group.districts),
  ).size;
  const scope = `등록 ${registeredDistrictCount}개 시군구 최근 30일 실집계`;
  if (dealType === 'buy') return `자체 원장 ${scope} (취소·일자 미상 제외)`;
  if (dealType === 'bunyang') return `자체 분양권 원장 ${scope} (취소·일자 미상 제외)`;
  return `자체 전월세 원장 ${scope} (일자 미상 제외)`;
}

export function buildRolling30SummaryArtifacts(input: {
  generatedAt: string;
  from: string;
  to: string;
  buy: readonly SaleDistrictAggregate[];
  jeonse: readonly RentDistrictAggregate[];
  monthly: readonly RentDistrictAggregate[];
  bunyang: readonly SaleDistrictAggregate[];
}): PublicNamedArtifactInput<Rolling30SummaryData>[] {
  if (!isIsoTimestamp(input.generatedAt)) throw new ServingArtifactValidationError('generatedAt is invalid');
  if (!isCalendarDate(input.from) || !isCalendarDate(input.to) || input.from >= input.to) {
    throw new ServingArtifactValidationError('rolling30 window is invalid');
  }
  const rowsByType: Record<SummaryDealType, TransactionSummaryRow[]> = {
    buy: buildSaleSummaryRows(input.buy, 'buy'),
    jeonse: buildRentSummaryRows(input.jeonse, false),
    monthly: buildRentSummaryRows(input.monthly, true),
    bunyang: buildSaleSummaryRows(input.bunyang, 'bunyang'),
  };

  return (Object.keys(ROLLING30_SUMMARY_ARTIFACT_NAMES) as SummaryDealType[]).map((dealType) => {
    const data: Rolling30SummaryData = {
      status: 'ok',
      summary: rowsByType[dealType],
      daily: null,
      month: kstMonth(input.generatedAt),
      window: { type: 'rolling30', from: input.from, to: input.to },
      updatedAt: input.generatedAt,
      note: summaryNote(dealType),
    };
    assertRolling30SummaryData(data);
    return {
      name: ROLLING30_SUMMARY_ARTIFACT_NAMES[dealType],
      schema: TRANSACTION_SUMMARY_SCHEMA,
      itemCount: data.summary.length,
      data,
    };
  });
}

const SUMMARY_DATA_KEYS = ['daily', 'month', 'note', 'status', 'summary', 'updatedAt', 'window'] as const;
const SUMMARY_ROW_KEYS = [
  'avg59', 'avg84', 'districtCount', 'estimatedCount', 'firstDistrict', 'label',
  'newHighs', 'sampleCount',
] as const;
const MONTHLY_SUMMARY_ROW_KEYS = [...SUMMARY_ROW_KEYS, 'avgRent59', 'avgRent84'] as const;

export function assertRolling30SummaryData(value: unknown): asserts value is Rolling30SummaryData {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('summary data must be an object');
  assertExactKeys(value, SUMMARY_DATA_KEYS, 'summary data');
  if (value.status !== 'ok' || value.daily !== null) {
    throw new ServingArtifactValidationError('summary status or daily is invalid');
  }
  if (typeof value.month !== 'string' || !/^\d{6}$/.test(value.month)) {
    throw new ServingArtifactValidationError('summary month is invalid');
  }
  if (!isIsoTimestamp(value.updatedAt)) throw new ServingArtifactValidationError('summary updatedAt is invalid');
  assertNonEmptyString(value.note, 'summary note', 300);
  if (!isPlainObject(value.window)) throw new ServingArtifactValidationError('summary window is invalid');
  assertExactKeys(value.window, ['from', 'to', 'type'], 'summary window');
  if (value.window.type !== 'rolling30' || !isCalendarDate(value.window.from)
    || !isCalendarDate(value.window.to) || value.window.from >= value.window.to) {
    throw new ServingArtifactValidationError('summary rolling30 window is invalid');
  }
  if (!Array.isArray(value.summary) || value.summary.length !== DISTRICT_GROUPS.length) {
    throw new ServingArtifactValidationError('summary rows are incomplete');
  }
  let monthlyRows: boolean | null = null;
  value.summary.forEach((row, index) => {
    if (!isPlainObject(row)) throw new ServingArtifactValidationError(`summary[${index}] must be an object`);
    const hasMonthlyValues = 'avgRent59' in row || 'avgRent84' in row;
    if (monthlyRows === null) monthlyRows = hasMonthlyValues;
    if (monthlyRows !== hasMonthlyValues) {
      throw new ServingArtifactValidationError('summary rows mix incompatible variants');
    }
    assertExactKeys(row, hasMonthlyValues ? MONTHLY_SUMMARY_ROW_KEYS : SUMMARY_ROW_KEYS, `summary[${index}]`);
    const group = DISTRICT_GROUPS[index];
    if (row.label !== group.label || row.firstDistrict !== group.districts[0]) {
      throw new ServingArtifactValidationError(`summary[${index}] district group is invalid`);
    }
    assertFiniteNumber(row.districtCount, `summary[${index}].districtCount`, { integer: true, min: 1 });
    if (row.districtCount !== group.districts.length) {
      throw new ServingArtifactValidationError(`summary[${index}].districtCount is invalid`);
    }
    for (const key of ['estimatedCount', 'sampleCount', 'newHighs'] as const) {
      assertFiniteNumber(row[key], `summary[${index}].${key}`, { integer: true, min: 0 });
    }
    if (row.estimatedCount !== row.sampleCount) {
      throw new ServingArtifactValidationError(`summary[${index}] counts disagree`);
    }
    assertNullableNumber(row.avg59, `summary[${index}].avg59`, { integer: true, min: 0 });
    assertNullableNumber(row.avg84, `summary[${index}].avg84`, { integer: true, min: 0 });
    if (hasMonthlyValues) {
      assertNullableNumber(row.avgRent59, `summary[${index}].avgRent59`, { integer: true, min: 0 });
      assertNullableNumber(row.avgRent84, `summary[${index}].avgRent84`, { integer: true, min: 0 });
    }
  });
}

export function assertRolling30SummaryEnvelope(
  value: unknown,
): asserts value is PublicNamedArtifactEnvelope<Rolling30SummaryData> {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('summary envelope must be an object');
  assertExactKeys(value, ['data', 'generatedAt', 'itemCount', 'schema'], 'summary envelope');
  if (value.schema !== TRANSACTION_SUMMARY_SCHEMA || !isIsoTimestamp(value.generatedAt)) {
    throw new ServingArtifactValidationError('summary envelope metadata is invalid');
  }
  assertFiniteNumber(value.itemCount, 'summary envelope itemCount', { integer: true, min: 0 });
  assertRolling30SummaryData(value.data);
  if (value.itemCount !== value.data.summary.length || value.generatedAt !== value.data.updatedAt) {
    throw new ServingArtifactValidationError('summary envelope does not match its data');
  }
}

const APARTMENT_INDEX_KEYS = [
  'aliases', 'dong', 'id', 'lawdCd', 'name', 'score', 'sido', 'sigungu', 'totalHouseholds',
] as const;

function assertApartmentIndexItem(value: unknown, path: string): asserts value is ApartmentIndexItem {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError(`${path} must be an object`);
  assertExactKeys(value, APARTMENT_INDEX_KEYS, path);
  assertNonEmptyString(value.id, `${path}.id`, 200);
  assertNonEmptyString(value.name, `${path}.name`, 200);
  assertNonEmptyString(value.sido, `${path}.sido`, 80);
  assertNonEmptyString(value.sigungu, `${path}.sigungu`, 80);
  if (value.dong !== null) assertNonEmptyString(value.dong, `${path}.dong`, 100);
  if (typeof value.lawdCd !== 'string' || !/^\d{5}$/.test(value.lawdCd)) {
    throw new ServingArtifactValidationError(`${path}.lawdCd is invalid`);
  }
  if (!Array.isArray(value.aliases) || value.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    throw new ServingArtifactValidationError(`${path}.aliases is invalid`);
  }
  if (new Set(value.aliases).size !== value.aliases.length) {
    throw new ServingArtifactValidationError(`${path}.aliases contains duplicates`);
  }
  assertNullableNumber(value.totalHouseholds, `${path}.totalHouseholds`, { integer: true, min: 0 });
  assertNullableNumber(value.score, `${path}.score`, { min: 0 });
}

export function assertApartmentIndexData(value: unknown): asserts value is ApartmentIndexItem[] {
  if (!Array.isArray(value)) throw new ServingArtifactValidationError('apartment index must be an array');
  const ids = new Set<string>();
  value.forEach((item, index) => {
    assertApartmentIndexItem(item, `apartment index[${index}]`);
    if (ids.has(item.id)) throw new ServingArtifactValidationError(`duplicate apartment id: ${item.id}`);
    ids.add(item.id);
  });
}

export function assertApartmentIndexEnvelope(
  value: unknown,
): asserts value is PublicNamedArtifactEnvelope<ApartmentIndexItem[]> {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('apartment index envelope must be an object');
  assertExactKeys(value, ['data', 'generatedAt', 'itemCount', 'schema'], 'apartment index envelope');
  if (value.schema !== APARTMENT_INDEX_SCHEMA || !isIsoTimestamp(value.generatedAt)) {
    throw new ServingArtifactValidationError('apartment index envelope metadata is invalid');
  }
  assertFiniteNumber(value.itemCount, 'apartment index itemCount', { integer: true, min: 0 });
  assertApartmentIndexData(value.data);
  if (value.itemCount !== value.data.length) {
    throw new ServingArtifactValidationError('apartment index itemCount does not match data');
  }
}

export function buildApartmentIndexArtifact(
  sourceRows: readonly ApartmentIndexSourceRow[],
): PublicNamedArtifactInput<ApartmentIndexItem[]> {
  const data = sourceRows.map((source) => {
    const aliases = [...new Set(source.aliases.map((alias) => alias.trim()).filter(Boolean))]
      .filter((alias) => alias !== source.name);
    const item: ApartmentIndexItem = {
      id: source.id,
      name: source.name,
      aliases,
      sido: source.sido,
      sigungu: source.sigungu,
      dong: source.dong,
      lawdCd: source.lawdCd,
      totalHouseholds: source.totalHouseholds,
      score: source.score,
    };
    assertApartmentIndexItem(item, `apartment ${source.id || '(missing id)'}`);
    return item;
  }).sort((left, right) => left.id.localeCompare(right.id));
  assertApartmentIndexData(data);
  return {
    name: APARTMENT_INDEX_ARTIFACT_NAME,
    schema: APARTMENT_INDEX_SCHEMA,
    itemCount: data.length,
    data,
  };
}

export function findApartmentIndexById(
  index: readonly ApartmentIndexItem[],
  id: string,
): ApartmentIndexItem | null {
  return index.find((item) => item.id === id) ?? null;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

export function searchApartmentIndex(
  index: readonly ApartmentIndexItem[],
  query: string,
  options: { limit?: number; lawdCd?: string } = {},
): ApartmentIndexItem[] {
  const needle = normalizeSearchText(query.trim());
  if (!needle) return [];
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 10), 1), 100);
  return index
    .filter((item) => !options.lawdCd || item.lawdCd === options.lawdCd)
    .flatMap((item) => {
      const candidates = [item.name, ...item.aliases].map(normalizeSearchText);
      if (!candidates.some((candidate) => candidate.includes(needle))) return [];
      const rank = candidates.some((candidate) => candidate === needle)
        ? 0
        : candidates.some((candidate) => candidate.startsWith(needle)) ? 1 : 2;
      return [{ item, rank }];
    })
    .sort((left, right) => left.rank - right.rank
      || left.item.name.length - right.item.name.length
      || left.item.id.localeCompare(right.item.id))
    .slice(0, limit)
    .map(({ item }) => item);
}

export type SnapshotServeMissReason =
  | 'period-not-covered'
  | 'snapshot-stale'
  | 'apartment-index-required'
  | 'apartment-not-found';
export type SnapshotServeResult<T> =
  | { hit: true; body: T }
  | { hit: false; reason: SnapshotServeMissReason };

export interface SnapshotTransactionQuery {
  months: number;
  limit: number;
  aptId?: string;
  aptName?: string;
  apartmentIndex?: readonly ApartmentIndexItem[];
  now?: Date;
}

export interface BuySnapshotResponse {
  data: BuyApartmentGroup[];
  district: string;
  months: number;
  total: number;
  selectedAptId?: string;
}

export interface BuyTransactionRow {
  aptName: string;
  district: string;
  dong: string;
  area: number;
  floor: number;
  price: number;
  pricePerArea: number;
  date: string;
  buildYear: number | null;
  dealType: 'buy';
  masterId: string | null;
}

export interface BuyApartmentGroup {
  id: string;
  name: string;
  district: string;
  dong: string | null;
  buildYear: number | null;
  households: number | null;
  masterId: string | null;
  score: number | null;
  areas: number[];
  transactions: BuyTransactionRow[];
}

export interface RentTransactionRow {
  aptName: string;
  district: string;
  dong: string;
  area: number;
  floor: number;
  deposit: number;
  monthlyRent: number;
  date: string;
  buildYear: number | null;
  contractType: string;
  prevDeposit: number | null;
  prevMonthlyRent: number | null;
}

export interface RentApartmentGroup {
  id: string;
  name: string;
  district: string;
  dong: string | null;
  buildYear: number | null;
  areas: number[];
  txCount: number;
  maxDeposit: number;
  maxMonthlyRent: number;
  transactions: RentTransactionRow[];
}

export interface RentSnapshotResponse {
  data: RentApartmentGroup[];
  district: string;
  months: number;
  rentType: RentType;
  total: number;
  status: 'ok';
}

export interface PresaleTransactionRow {
  aptName: string;
  district: string;
  dong: string;
  area: number;
  floor: number;
  price: number;
  pricePerArea: number;
  date: string;
  buildYear: number | null;
}

export interface PresaleApartmentGroup {
  id: string;
  name: string;
  district: string;
  dong: string | null;
  buildYear: number | null;
  areas: number[];
  txCount: number;
  transactions: PresaleTransactionRow[];
}

export interface PresaleSnapshotResponse {
  data: PresaleApartmentGroup[];
  district: string;
  months: number;
  total: number;
  status: 'ok';
}

function normalizedRequestMonths(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), 36) : 3;
}

function normalizedRequestLimit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), 100) : 60;
}

function recentMonthKeys(months: number, now: Date): string[] {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function snapshotCoversMonths(snapshot: PublicTransactionSnapshot, monthKeys: readonly string[]): boolean {
  const oldest = monthKeys.at(-1)!;
  const newest = monthKeys[0];
  return snapshot.period.from <= `${oldest}-01`
    && snapshot.period.through.slice(0, 7) >= newest;
}

function normalizeDong(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').trim();
}

function recordMatchesApartment(record: PublicTransactionRecord, apartment: ApartmentIndexItem): boolean {
  if (record.apartmentId) return record.apartmentId === apartment.id;
  const names = new Set([apartment.name, ...apartment.aliases].map(normalizeMLTMName).filter(Boolean));
  if (!names.has(normalizeMLTMName(record.aptName))) return false;
  return Boolean(apartment.dong) && normalizeDong(record.dong) === normalizeDong(apartment.dong);
}

interface PreparedSnapshotQuery {
  months: number;
  limit: number;
  aptName: string;
  selectedApartment: ApartmentIndexItem | null;
  monthKeys: Set<string>;
  index: readonly ApartmentIndexItem[];
}

function prepareSnapshotQuery(
  snapshot: PublicTransactionSnapshot,
  query: SnapshotTransactionQuery,
): SnapshotServeResult<PreparedSnapshotQuery> {
  assertPublicTransactionSnapshot(snapshot);
  const months = normalizedRequestMonths(query.months);
  const now = query.now ?? new Date();
  if (!isDistrictSnapshotFresh(snapshot, now)) {
    return { hit: false, reason: 'snapshot-stale' };
  }
  const keys = recentMonthKeys(months, now);
  if (!snapshotCoversMonths(snapshot, keys)) return { hit: false, reason: 'period-not-covered' };
  const index = query.apartmentIndex ?? [];
  let selectedApartment: ApartmentIndexItem | null = null;
  if (query.aptId) {
    if (!query.apartmentIndex) return { hit: false, reason: 'apartment-index-required' };
    selectedApartment = findApartmentIndexById(index, query.aptId);
    if (!selectedApartment) return { hit: false, reason: 'apartment-not-found' };
  }
  return {
    hit: true,
    body: {
      months,
      limit: normalizedRequestLimit(query.limit),
      aptName: query.aptId ? '' : (query.aptName ?? '').trim().slice(0, 50),
      selectedApartment,
      monthKeys: new Set(keys),
      index,
    },
  };
}

function recordsForQuery(
  snapshot: PublicTransactionSnapshot,
  prepared: PreparedSnapshotQuery,
  kind: PublicTransactionRecord['kind'],
): PublicTransactionRecord[] {
  return snapshot.records
    .filter((record) => record.kind === kind && prepared.monthKeys.has(record.dealDate.slice(0, 7)))
    .filter((record) => !prepared.selectedApartment || recordMatchesApartment(record, prepared.selectedApartment))
    .sort((left, right) => right.dealDate.localeCompare(left.dealDate) || right.id.localeCompare(left.id));
}

function apartmentLookup(index: readonly ApartmentIndexItem[], lawdCd: string): {
  byId: Map<string, ApartmentIndexItem>;
  byNameAndDong: Map<string, ApartmentIndexItem | null>;
} {
  const byId = new Map<string, ApartmentIndexItem>();
  const byNameAndDong = new Map<string, ApartmentIndexItem | null>();
  for (const apartment of index) {
    if (apartment.lawdCd !== lawdCd) continue;
    byId.set(apartment.id, apartment);
    for (const name of [apartment.name, ...apartment.aliases]) {
      const key = `${normalizeMLTMName(name)}\u0000${normalizeDong(apartment.dong)}`;
      if (byNameAndDong.has(key) && byNameAndDong.get(key) === null) continue;
      const existing = byNameAndDong.get(key);
      byNameAndDong.set(key, existing && existing.id !== apartment.id ? null : apartment);
    }
  }
  return { byId, byNameAndDong };
}

function findApartmentForRecord(
  record: PublicTransactionRecord,
  lookup: ReturnType<typeof apartmentLookup>,
): ApartmentIndexItem | null {
  if (record.apartmentId) return lookup.byId.get(record.apartmentId) ?? null;
  return lookup.byNameAndDong.get(`${normalizeMLTMName(record.aptName)}\u0000${normalizeDong(record.dong)}`) ?? null;
}

export function buildBuyResponseFromSnapshot(
  snapshot: PublicTransactionSnapshot,
  query: SnapshotTransactionQuery,
): SnapshotServeResult<BuySnapshotResponse> {
  const preparedResult = prepareSnapshotQuery(snapshot, query);
  if (!preparedResult.hit) return preparedResult;
  const prepared = preparedResult.body;
  const lookup = apartmentLookup(prepared.index, snapshot.partition.lawdCd);
  const grouped = new Map<string, BuyApartmentGroup>();

  for (const record of recordsForQuery(snapshot, prepared, 'sale')) {
    if (record.kind !== 'sale' || record.canceled) continue;
    const apartment = prepared.selectedApartment ?? findApartmentForRecord(record, lookup);
    const area = Math.round(record.areaM2);
    const tx: BuyTransactionRow = {
      aptName: record.aptName,
      district: snapshot.partition.district,
      dong: record.dong,
      area,
      floor: record.floor || 1,
      price: record.amountManwon,
      pricePerArea: Math.round(record.amountManwon / record.areaM2),
      date: record.dealDate,
      buildYear: record.buildYear,
      dealType: 'buy',
      masterId: apartment?.id ?? record.apartmentId,
    };
    const key = transactionGroupKey(tx.aptName, tx.dong);
    let group = grouped.get(key);
    if (!group) {
      group = {
        id: `${tx.dong || 'unknown'}-${tx.aptName}`.replace(/\s/g, '-'),
        name: tx.aptName,
        district: snapshot.partition.district,
        dong: tx.dong || null,
        buildYear: tx.buildYear,
        households: apartment?.totalHouseholds ?? null,
        masterId: apartment?.id ?? tx.masterId,
        score: apartment?.score ?? null,
        areas: [],
        transactions: [],
      };
      grouped.set(key, group);
    }
    group.transactions.push(tx);
    if (!group.areas.includes(area)) group.areas.push(area);
    if (!group.buildYear && tx.buildYear) group.buildYear = tx.buildYear;
  }

  const data = [...grouped.values()]
    .filter((group) => !prepared.aptName || matchesQuery(group.name, prepared.aptName))
    .sort((left, right) => right.transactions.length - left.transactions.length)
    .slice(0, prepared.aptName ? 100 : prepared.limit);
  return {
    hit: true,
    body: {
      data,
      district: snapshot.partition.district,
      months: prepared.months,
      total: data.reduce((sum, group) => sum + group.transactions.length, 0),
      ...(prepared.selectedApartment ? { selectedAptId: prepared.selectedApartment.id } : {}),
    },
  };
}

export function buildRentResponseFromSnapshot(
  snapshot: PublicTransactionSnapshot,
  query: SnapshotTransactionQuery & { rentType?: RentType },
): SnapshotServeResult<RentSnapshotResponse> {
  const preparedResult = prepareSnapshotQuery(snapshot, query);
  if (!preparedResult.hit) return preparedResult;
  const prepared = preparedResult.body;
  const rentType = query.rentType ?? 'all';
  if (!['all', 'jeonse', 'monthly'].includes(rentType)) {
    throw new ServingArtifactValidationError(`invalid rent type: ${rentType}`);
  }
  const records = recordsForQuery(snapshot, prepared, 'rent')
    .filter((record) => record.kind === 'rent')
    .filter((record) => rentType === 'all'
      || (rentType === 'jeonse' ? record.monthlyRentManwon === 0 : record.monthlyRentManwon > 0));
  const grouped = new Map<string, RentApartmentGroup>();
  for (const record of records) {
    if (record.kind !== 'rent') continue;
    const tx: RentTransactionRow = {
      aptName: record.aptName,
      district: snapshot.partition.district,
      dong: record.dong,
      area: Math.round(record.areaM2),
      floor: record.floor || 1,
      deposit: record.depositManwon,
      monthlyRent: record.monthlyRentManwon,
      date: record.dealDate,
      buildYear: record.buildYear,
      contractType: record.contractType === 'new' ? '신규' : record.contractType === 'renewal' ? '갱신' : '',
      prevDeposit: record.previousDepositManwon,
      prevMonthlyRent: record.previousMonthlyRentManwon,
    };
    const key = transactionGroupKey(tx.aptName, tx.dong);
    let group = grouped.get(key);
    if (!group) {
      group = {
        id: `${tx.dong || 'unknown'}-${tx.aptName}`.replace(/\s/g, '-'),
        name: tx.aptName,
        district: snapshot.partition.district,
        dong: tx.dong || null,
        buildYear: tx.buildYear,
        areas: [],
        txCount: 0,
        maxDeposit: 0,
        maxMonthlyRent: 0,
        transactions: [],
      };
      grouped.set(key, group);
    }
    group.transactions.push(tx);
    group.txCount += 1;
    group.maxDeposit = Math.max(group.maxDeposit, tx.deposit);
    group.maxMonthlyRent = Math.max(group.maxMonthlyRent, tx.monthlyRent);
    if (!group.areas.includes(tx.area)) group.areas.push(tx.area);
    if (!group.buildYear && tx.buildYear) group.buildYear = tx.buildYear;
  }
  const data = [...grouped.values()]
    .filter((group) => !prepared.aptName || matchesQuery(group.name, prepared.aptName))
    .map((group) => ({ ...group, areas: [...group.areas].sort((a, b) => a - b) }))
    .sort((left, right) => right.txCount - left.txCount)
    .slice(0, prepared.aptName ? 100 : prepared.limit)
    .map((group) => ({ ...group, transactions: group.transactions.slice(0, 10) }));
  return {
    hit: true,
    body: {
      data,
      district: snapshot.partition.district,
      months: prepared.months,
      rentType,
      total: records.length,
      status: 'ok',
    },
  };
}

export function buildPresaleResponseFromSnapshot(
  snapshot: PublicTransactionSnapshot,
  query: SnapshotTransactionQuery,
): SnapshotServeResult<PresaleSnapshotResponse> {
  const preparedResult = prepareSnapshotQuery(snapshot, query);
  if (!preparedResult.hit) return preparedResult;
  const prepared = preparedResult.body;
  const records = recordsForQuery(snapshot, prepared, 'presale')
    .filter((record) => record.kind === 'presale' && !record.canceled);
  const grouped = new Map<string, PresaleApartmentGroup>();
  for (const record of records) {
    if (record.kind !== 'presale') continue;
    const tx: PresaleTransactionRow = {
      aptName: record.aptName,
      district: snapshot.partition.district,
      dong: record.dong,
      area: Math.round(record.areaM2),
      floor: record.floor || 1,
      price: record.amountManwon,
      pricePerArea: Math.round(record.amountManwon / record.areaM2),
      date: record.dealDate,
      buildYear: record.buildYear,
    };
    const key = transactionGroupKey(tx.aptName, tx.dong);
    let group = grouped.get(key);
    if (!group) {
      group = {
        id: `${tx.dong || 'unknown'}-${tx.aptName}`.replace(/\s/g, '-'),
        name: tx.aptName,
        district: snapshot.partition.district,
        dong: tx.dong || null,
        buildYear: tx.buildYear,
        areas: [],
        txCount: 0,
        transactions: [],
      };
      grouped.set(key, group);
    }
    group.transactions.push(tx);
    group.txCount += 1;
    if (!group.areas.includes(tx.area)) group.areas.push(tx.area);
    if (!group.buildYear && tx.buildYear) group.buildYear = tx.buildYear;
  }
  const data = [...grouped.values()]
    .filter((group) => !prepared.aptName || matchesQuery(group.name, prepared.aptName))
    .map((group) => ({ ...group, areas: [...group.areas].sort((a, b) => a - b) }))
    .sort((left, right) => right.txCount - left.txCount)
    .slice(0, prepared.aptName ? 100 : prepared.limit)
    .map((group) => ({ ...group, transactions: group.transactions.slice(0, 10) }));
  return {
    hit: true,
    body: {
      data,
      district: snapshot.partition.district,
      months: prepared.months,
      total: records.length,
      status: 'ok',
    },
  };
}

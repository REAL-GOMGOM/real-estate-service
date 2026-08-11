import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

import { DISTRICT_CODE } from '../lib/district-codes';
import { DISTRICT_GROUPS } from '../lib/district-groups';
import { assertMacLocalDatabaseUrl } from '../lib/local-postgres-url';
import type { PublicTransactionRecord, PublicTransactionSnapshot } from '../lib/public-snapshots/contract';
import { PUBLIC_TRANSACTION_SNAPSHOT_MONTHS } from '../lib/public-snapshots/coverage-policy';
import { createPublicSnapshotStoreFromEnv } from '../lib/public-snapshots/object-store';
import {
  readAndAssertMacMiniSyncHealth,
  type MacMiniSyncHealthMarker,
} from '../lib/public-snapshots/publish-health';
import { withPublicSnapshotPublicationLock } from '../lib/public-snapshots/publication-lock';
import {
  publishPublicSnapshotRelease,
  type PublicNamedArtifactInput,
  type PublishPublicSnapshotReleaseResult,
} from '../lib/public-snapshots/publisher';
import {
  createPublicTransactionSnapshot,
  toPublicPresaleTransaction,
  toPublicRentTransaction,
  toPublicSaleTransaction,
  type PublicPresaleSourceRow,
  type PublicRentSourceRow,
  type PublicSaleSourceRow,
} from '../lib/public-snapshots/source-mappers';
import {
  APARTMENT_INDEX_ARTIFACT_NAME,
  APARTMENT_INDEX_SCHEMA,
  ROLLING30_SUMMARY_ARTIFACT_NAMES,
  TRANSACTION_SUMMARY_SCHEMA,
  assertApartmentIndexData,
  assertRolling30SummaryData,
  buildApartmentIndexArtifact,
  buildRolling30SummaryArtifacts,
  type ApartmentIndexSourceRow,
  type RentDistrictAggregate,
  type Rolling30SummaryData,
  type SaleDistrictAggregate,
  type SummaryDealType,
} from '../lib/public-snapshots/serving-artifacts';

export { assertMacLocalDatabaseUrl } from '../lib/local-postgres-url';

export const SNAPSHOT_SOURCE_AT_ENV = 'NAEZIP_SNAPSHOT_SOURCE_AT';

const HELP = `
Usage: npx tsx scripts/publish-public-transactions.ts [--dry-run] [--allow-stale-local]

Publishes a serving-only snapshot from NAEZIP_LOCAL_DB_URL. Production R2 publish
requires a recent healthy Mac mini sync marker (exit 0 or Neon-only degraded exit 2).

--dry-run            Ignore R2 credentials and write under NAEZIP_SNAPSHOT_DRY_RUN_DIR.
                     Without this flag, all four R2 credentials are mandatory.
--allow-stale-local   MANUAL EMERGENCY OVERRIDE: bypass the sync health marker.
                      R2 mode also requires an explicit NAEZIP_SNAPSHOT_SOURCE_AT.
                      Never configure this flag in launchd or routine automation.
`;

export const DISTRICT_SALE_SELECT = `
  SELECT dedupe_key AS "dedupeKey",
         master_id AS "masterId",
         apt_name AS "aptName",
         sigungu,
         umd_nm AS "umdNm",
         area_m2::float8 AS "areaM2",
         floor,
         deal_amount AS "dealAmount",
         deal_date AS "dealDate",
         build_year AS "buildYear",
         is_canceled AS "isCanceled"
    FROM transactions
   WHERE lawd_cd = $1
     AND left(deal_date, 7) >= $2
     AND left(deal_date, 7) <= $3
     AND is_canceled = false
   ORDER BY deal_date DESC, dedupe_key ASC
`;

export const DISTRICT_RENT_SELECT = `
  -- rent_transactions has no cancellation column; every persisted row is serving-active.
  SELECT dedupe_key AS "dedupeKey",
         apt_name AS "aptName",
         sigungu,
         umd_nm AS "umdNm",
         area_m2::float8 AS "areaM2",
         floor,
         deal_date AS "dealDate",
         deposit,
         monthly_rent AS "monthlyRent",
         build_year AS "buildYear",
         contract_type AS "contractType",
         prev_deposit AS "prevDeposit",
         prev_monthly_rent AS "prevMonthlyRent"
    FROM rent_transactions
   WHERE lawd_cd = $1
     AND left(deal_date, 7) >= $2
     AND left(deal_date, 7) <= $3
   ORDER BY deal_date DESC, dedupe_key ASC
`;

export const DISTRICT_PRESALE_SELECT = `
  SELECT dedupe_key AS "dedupeKey",
         apt_name AS "aptName",
         sigungu,
         umd_nm AS "umdNm",
         area_m2::float8 AS "areaM2",
         floor,
         deal_amount AS "dealAmount",
         deal_date AS "dealDate",
         build_year AS "buildYear",
         is_canceled AS "isCanceled"
    FROM silv_transactions
   WHERE lawd_cd = $1
     AND left(deal_date, 7) >= $2
     AND left(deal_date, 7) <= $3
     AND is_canceled = false
   ORDER BY deal_date DESC, dedupe_key ASC
`;

export const SALE_SUMMARY_SELECT = `
  WITH w AS (
    SELECT sigungu, umd_nm, apt_name, round(area_m2::numeric)::int AS area_r,
           area_m2, deal_amount, deal_date
      FROM transactions
     WHERE deal_date >= $1 AND deal_date < $2
       AND right(deal_date, 2) <> '00'
       AND is_canceled = false
  ), latest AS (
    SELECT DISTINCT ON (sigungu, umd_nm, apt_name, area_r)
           sigungu, umd_nm, apt_name, area_r, deal_amount, deal_date
      FROM w
     WHERE apt_name <> '' AND deal_amount > 0 AND area_r > 0
     ORDER BY sigungu, umd_nm, apt_name, area_r, deal_date DESC, deal_amount DESC
  ), latest_with_prior AS (
    SELECT latest.sigungu, latest.umd_nm, latest.apt_name, latest.area_r,
           latest.deal_amount AS latest_amt,
           max(history.deal_amount) AS prior_max
      FROM latest
      JOIN transactions history
        ON history.sigungu = latest.sigungu
       AND history.umd_nm = latest.umd_nm
       AND history.apt_name = latest.apt_name
       AND round(history.area_m2::numeric)::int = latest.area_r
       AND history.deal_date < latest.deal_date
       AND right(history.deal_date, 2) <> '00'
       AND history.deal_amount > 0
       AND history.is_canceled = false
     GROUP BY latest.sigungu, latest.umd_nm, latest.apt_name, latest.area_r,
              latest.deal_amount
  ), highs AS (
    SELECT sigungu, count(*)::int AS new_highs
      FROM latest_with_prior
     WHERE prior_max IS NOT NULL AND latest_amt > prior_max
     GROUP BY sigungu
  ), aggs AS (
    SELECT sigungu,
           count(*)::int AS cnt,
           coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS sum59,
           count(*) FILTER (WHERE area_m2 BETWEEN 55 AND 63)::int AS cnt59,
           coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS sum84,
           count(*) FILTER (WHERE area_m2 BETWEEN 80 AND 88)::int AS cnt84
      FROM w
     GROUP BY sigungu
  )
  SELECT a.sigungu, a.cnt, coalesce(h.new_highs, 0)::int AS "newHighs",
         a.sum59, a.cnt59, a.sum84, a.cnt84
    FROM aggs a
    LEFT JOIN highs h USING (sigungu)
`;

export const PRESALE_SUMMARY_SELECT = SALE_SUMMARY_SELECT.replaceAll(
  'transactions',
  'silv_transactions',
);

export const RENT_SUMMARY_SELECT = `
  SELECT sigungu,
         count(*)::int AS cnt,
         coalesce(sum(deposit) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS "sumDep59",
         count(*) FILTER (WHERE area_m2 BETWEEN 55 AND 63)::int AS cnt59,
         coalesce(sum(deposit) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS "sumDep84",
         count(*) FILTER (WHERE area_m2 BETWEEN 80 AND 88)::int AS cnt84,
         coalesce(sum(monthly_rent) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS "sumRent59",
         coalesce(sum(monthly_rent) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS "sumRent84"
    FROM rent_transactions
   WHERE deal_date >= $1 AND deal_date < $2
     AND right(deal_date, 2) <> '00'
     AND (($3 AND monthly_rent = 0) OR (NOT $3 AND monthly_rent > 0))
   GROUP BY sigungu
`;

export const APARTMENT_INDEX_SELECT = `
  SELECT a.id,
         a.name,
         a.aliases,
         a.sido,
         a.sigungu,
         a.dong,
         a.lawd_cd AS "lawdCd",
         a.total_households AS "totalHouseholds",
         score.score::float8 AS score
    FROM apartments a
    LEFT JOIN LATERAL (
      SELECT s.score
        FROM apt_scores s
       WHERE s.master_id = a.id
       ORDER BY s.updated_at DESC, s.id ASC
       LIMIT 1
    ) score ON true
   ORDER BY a.id ASC
`;

interface QueryResult<Row> {
  rows: Row[];
}

export interface PublicSnapshotQueryClient {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}

interface SaleSourceDbRow {
  dedupeKey: unknown;
  masterId: unknown;
  aptName: unknown;
  sigungu: unknown;
  umdNm: unknown;
  areaM2: unknown;
  floor: unknown;
  dealAmount: unknown;
  dealDate: unknown;
  buildYear: unknown;
  isCanceled: unknown;
}

interface RentSourceDbRow {
  dedupeKey: unknown;
  aptName: unknown;
  sigungu: unknown;
  umdNm: unknown;
  areaM2: unknown;
  floor: unknown;
  dealDate: unknown;
  deposit: unknown;
  monthlyRent: unknown;
  buildYear: unknown;
  contractType: unknown;
  prevDeposit: unknown;
  prevMonthlyRent: unknown;
}

interface SummaryDbRow extends Record<string, unknown> {
  sigungu: unknown;
  cnt: unknown;
  newHighs?: unknown;
  sum59?: unknown;
  cnt59: unknown;
  sum84?: unknown;
  cnt84: unknown;
  sumDep59?: unknown;
  sumDep84?: unknown;
  sumRent59?: unknown;
  sumRent84?: unknown;
}

interface ApartmentDbRow extends Record<string, unknown> {
  id: unknown;
  name: unknown;
  aliases: unknown;
  sido: unknown;
  sigungu: unknown;
  dong: unknown;
  lawdCd: unknown;
  totalHouseholds: unknown;
  score: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is invalid`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} is invalid`);
  return value;
}

function numberValue(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} is invalid`);
  return parsed;
}

function integerValue(value: unknown, field: string): number {
  const parsed = numberValue(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`${field} is invalid`);
  return parsed;
}

function nullableInteger(value: unknown, field: string): number | null {
  return value === null ? null : integerValue(value, field);
}

function nullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : numberValue(value, field);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} is invalid`);
  return value;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** Preserve an unknown MOLIT day as YYYY-MM; never invent a calendar day. */
export function normalizePublicSourceDealDate(value: unknown): string {
  const raw = requiredString(value, 'dealDate');
  if (/^\d{4}-(0[1-9]|1[0-2])-00$/.test(raw)) return raw.slice(0, 7);
  if (!isCalendarDate(raw)) throw new Error(`dealDate is invalid: ${raw}`);
  return raw;
}

function assertSourceDistrict(source: string, expected: string): void {
  if (source !== expected) {
    throw new Error(`source district mismatch for ${expected}: ${source}`);
  }
}

function saleSourceRow(row: SaleSourceDbRow, district: string): PublicSaleSourceRow {
  const sigungu = requiredString(row.sigungu, 'sale.sigungu');
  assertSourceDistrict(sigungu, district);
  const isCanceled = booleanValue(row.isCanceled, 'sale.isCanceled');
  if (isCanceled) throw new Error('canceled sale escaped the active-row query');
  return {
    dedupeKey: requiredString(row.dedupeKey, 'sale.dedupeKey'),
    masterId: nullableString(row.masterId, 'sale.masterId'),
    aptName: requiredString(row.aptName, 'sale.aptName'),
    sigungu,
    umdNm: requiredString(row.umdNm, 'sale.umdNm'),
    areaM2: numberValue(row.areaM2, 'sale.areaM2'),
    floor: nullableInteger(row.floor, 'sale.floor'),
    dealAmount: integerValue(row.dealAmount, 'sale.dealAmount'),
    dealDate: normalizePublicSourceDealDate(row.dealDate),
    buildYear: nullableInteger(row.buildYear, 'sale.buildYear'),
    isCanceled,
  };
}

function presaleSourceRow(row: SaleSourceDbRow, district: string): PublicPresaleSourceRow {
  const source = saleSourceRow(row, district);
  return { ...source };
}

function rentSourceRow(row: RentSourceDbRow, district: string): PublicRentSourceRow {
  const sigungu = requiredString(row.sigungu, 'rent.sigungu');
  assertSourceDistrict(sigungu, district);
  return {
    dedupeKey: requiredString(row.dedupeKey, 'rent.dedupeKey'),
    masterId: null,
    aptName: requiredString(row.aptName, 'rent.aptName'),
    sigungu,
    umdNm: requiredString(row.umdNm, 'rent.umdNm'),
    areaM2: numberValue(row.areaM2, 'rent.areaM2'),
    floor: nullableInteger(row.floor, 'rent.floor'),
    dealDate: normalizePublicSourceDealDate(row.dealDate),
    deposit: integerValue(row.deposit, 'rent.deposit'),
    monthlyRent: integerValue(row.monthlyRent, 'rent.monthlyRent'),
    buildYear: nullableInteger(row.buildYear, 'rent.buildYear'),
    contractType: nullableString(row.contractType, 'rent.contractType'),
    prevDeposit: nullableInteger(row.prevDeposit, 'rent.prevDeposit'),
    prevMonthlyRent: nullableInteger(row.prevMonthlyRent, 'rent.prevMonthlyRent'),
  };
}

function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function monthShift(month: string, offset: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function publicSnapshotWindows(now: Date): {
  period: { from: string; through: string };
  fromMonth: string;
  throughMonth: string;
  rolling30: { from: string; to: string };
} {
  const today = kstToday(now);
  const currentMonth = today.slice(0, 7);
  const fromMonth = monthShift(currentMonth, -(PUBLIC_TRANSACTION_SNAPSHOT_MONTHS - 1));
  return {
    period: { from: `${fromMonth}-01`, through: today },
    fromMonth,
    throughMonth: currentMonth,
    rolling30: { from: shiftDays(today, -29), to: shiftDays(today, 1) },
  };
}

function saleAggregate(row: SummaryDbRow, label: string): SaleDistrictAggregate {
  return {
    sigungu: requiredString(row.sigungu, `${label}.sigungu`),
    cnt: integerValue(row.cnt, `${label}.cnt`),
    newHighs: integerValue(row.newHighs, `${label}.newHighs`),
    sum59: numberValue(row.sum59, `${label}.sum59`),
    cnt59: integerValue(row.cnt59, `${label}.cnt59`),
    sum84: numberValue(row.sum84, `${label}.sum84`),
    cnt84: integerValue(row.cnt84, `${label}.cnt84`),
  };
}

function rentAggregate(row: SummaryDbRow, label: string): RentDistrictAggregate {
  return {
    sigungu: requiredString(row.sigungu, `${label}.sigungu`),
    cnt: integerValue(row.cnt, `${label}.cnt`),
    sumDep59: numberValue(row.sumDep59, `${label}.sumDep59`),
    cnt59: integerValue(row.cnt59, `${label}.cnt59`),
    sumDep84: numberValue(row.sumDep84, `${label}.sumDep84`),
    cnt84: integerValue(row.cnt84, `${label}.cnt84`),
    sumRent59: numberValue(row.sumRent59, `${label}.sumRent59`),
    sumRent84: numberValue(row.sumRent84, `${label}.sumRent84`),
  };
}

function apartmentIndexSource(row: ApartmentDbRow): ApartmentIndexSourceRow {
  if (!Array.isArray(row.aliases) || row.aliases.some((alias) => typeof alias !== 'string')) {
    throw new Error('apartment.aliases is invalid');
  }
  return {
    id: requiredString(row.id, 'apartment.id'),
    name: requiredString(row.name, 'apartment.name'),
    aliases: row.aliases as string[],
    sido: requiredString(row.sido, 'apartment.sido'),
    sigungu: requiredString(row.sigungu, 'apartment.sigungu'),
    dong: nullableString(row.dong, 'apartment.dong'),
    lawdCd: requiredString(row.lawdCd, 'apartment.lawdCd'),
    totalHouseholds: nullableInteger(row.totalHouseholds, 'apartment.totalHouseholds'),
    score: nullableNumber(row.score, 'apartment.score'),
  };
}

export interface CollectedPublicTransactionRelease {
  snapshots: PublicTransactionSnapshot[];
  namedArtifacts: PublicNamedArtifactInput[];
  publishedAt: string;
}

export interface PublicTransactionCompletenessOptions {
  /** Test-only escape hatch for deliberately reduced or empty fixture releases. */
  allowIncompleteForTest?: boolean;
  /** Test-only small floors for a structurally complete synthetic release. */
  thresholdsForTest?: PublicTransactionCompletenessThresholds;
  /** Test-only recency limits for deterministic historical fixtures. */
  recencyThresholdsForTest?: PublicTransactionRecencyThresholds;
}

export interface PublicTransactionCompletenessThresholds {
  totalRecords: number;
  nonemptyDistricts: number;
  apartmentIndexItems: number;
  saleRecords: number;
  rentRecords: number;
  presaleRecords: number;
}

export const PRODUCTION_COMPLETENESS_THRESHOLDS: Readonly<PublicTransactionCompletenessThresholds> = Object.freeze({
  totalRecords: 10_000,
  nonemptyDistricts: 100,
  apartmentIndexItems: 25_000,
  saleRecords: 1_000,
  rentRecords: 1_000,
  presaleRecords: 10,
});

export interface PublicTransactionRecencyThresholds {
  saleMaxAgeDays: number;
  rentMaxAgeDays: number;
  presaleMaxAgeDays: number;
}

export const PRODUCTION_RECENCY_THRESHOLDS: Readonly<PublicTransactionRecencyThresholds> = Object.freeze({
  saleMaxAgeDays: 14,
  rentMaxAgeDays: 14,
  presaleMaxAgeDays: 30,
});

export class PublicTransactionCompletenessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicTransactionCompletenessError';
  }
}

const EXPECTED_NAMED_ARTIFACTS = Object.freeze([
  ...Object.values(ROLLING30_SUMMARY_ARTIFACT_NAMES),
  APARTMENT_INDEX_ARTIFACT_NAME,
].sort());

function artifactValidationFailure(name: string, error: unknown): PublicTransactionCompletenessError {
  const detail = error instanceof Error ? error.message : 'unknown validation error';
  return new PublicTransactionCompletenessError(
    `release completeness failed: invalid named artifact ${name}: ${detail}`,
  );
}

export function assertPublicTransactionReleaseCompleteness(
  release: Pick<CollectedPublicTransactionRelease, 'snapshots' | 'namedArtifacts'>,
  options: PublicTransactionCompletenessOptions = {},
): void {
  if (options.allowIncompleteForTest) return;
  const expectedByCode = new Map(
    Object.entries(DISTRICT_CODE).map(([district, lawdCd]) => [lawdCd, district]),
  );
  const actualByCode = new Map<string, PublicTransactionSnapshot>();
  for (const snapshot of release.snapshots) {
    if (actualByCode.has(snapshot.partition.lawdCd)) {
      throw new PublicTransactionCompletenessError(
        `duplicate district partition: ${snapshot.partition.lawdCd}`,
      );
    }
    actualByCode.set(snapshot.partition.lawdCd, snapshot);
  }

  const missing = [...expectedByCode.keys()].filter((lawdCd) => !actualByCode.has(lawdCd));
  const unexpected = [...actualByCode.keys()].filter((lawdCd) => !expectedByCode.has(lawdCd));
  const mislabeled = [...actualByCode].filter(([lawdCd, snapshot]) =>
    expectedByCode.get(lawdCd) !== snapshot.partition.district);
  if (missing.length > 0 || unexpected.length > 0 || mislabeled.length > 0
    || actualByCode.size !== expectedByCode.size) {
    throw new PublicTransactionCompletenessError(
      `district partition completeness failed: expected=${expectedByCode.size}, actual=${actualByCode.size}, missing=${missing.length}, unexpected=${unexpected.length}, mislabeled=${mislabeled.length}`,
    );
  }

  const actualArtifactNames = release.namedArtifacts.map((artifact) => artifact.name).sort();
  if (actualArtifactNames.length !== EXPECTED_NAMED_ARTIFACTS.length
    || actualArtifactNames.some((name, index) => name !== EXPECTED_NAMED_ARTIFACTS[index])) {
    throw new PublicTransactionCompletenessError(
      `release completeness failed: expected exactly five named artifacts (${EXPECTED_NAMED_ARTIFACTS.join(', ')})`,
    );
  }

  const artifactsByName = new Map(release.namedArtifacts.map((artifact) => [artifact.name, artifact]));
  const apartmentIndex = artifactsByName.get(APARTMENT_INDEX_ARTIFACT_NAME)!;
  if (apartmentIndex.schema !== APARTMENT_INDEX_SCHEMA) {
    throw new PublicTransactionCompletenessError(
      `release completeness failed: invalid schema for ${APARTMENT_INDEX_ARTIFACT_NAME}`,
    );
  }
  try {
    assertApartmentIndexData(apartmentIndex.data);
  } catch (error) {
    throw artifactValidationFailure(APARTMENT_INDEX_ARTIFACT_NAME, error);
  }
  if (apartmentIndex.itemCount !== apartmentIndex.data.length || apartmentIndex.data.length === 0) {
    throw new PublicTransactionCompletenessError(
      'release completeness failed: apartment-index is missing, mismatched, or zero rows',
    );
  }

  const summaryDataByType = new Map<SummaryDealType, Rolling30SummaryData>();
  for (const dealType of Object.keys(ROLLING30_SUMMARY_ARTIFACT_NAMES) as SummaryDealType[]) {
    const artifactName = ROLLING30_SUMMARY_ARTIFACT_NAMES[dealType];
    const artifact = artifactsByName.get(artifactName)!;
    if (artifact.schema !== TRANSACTION_SUMMARY_SCHEMA) {
      throw new PublicTransactionCompletenessError(
        `release completeness failed: invalid schema for ${artifactName}`,
      );
    }
    try {
      assertRolling30SummaryData(artifact.data);
    } catch (error) {
      throw artifactValidationFailure(artifactName, error);
    }
    if (artifact.itemCount !== artifact.data.summary.length) {
      throw new PublicTransactionCompletenessError(
        `release completeness failed: itemCount mismatch for ${artifactName}`,
      );
    }
    const estimatedCount = artifact.data.summary.reduce(
      (sum, row) => sum + row.estimatedCount,
      0,
    );
    if (estimatedCount <= 0) {
      throw new PublicTransactionCompletenessError(
        `release completeness failed: rolling30 ${dealType} summary is zero rows`,
      );
    }
    summaryDataByType.set(dealType, artifact.data);
  }

  const counts = { total: 0, sale: 0, rent: 0, presale: 0, nonemptyDistricts: 0 };
  for (const snapshot of release.snapshots) {
    if (snapshot.records.length > 0) counts.nonemptyDistricts += 1;
    for (const record of snapshot.records) {
      counts.total += 1;
      counts[record.kind] += 1;
    }
  }
  const totalRecords = counts.total;
  if (totalRecords === 0) {
    throw new PublicTransactionCompletenessError(
      'release completeness failed: all covered district snapshots are zero rows',
    );
  }

  // Summary groups intentionally cover the 164 registered districts, not all
  // 248 raw partitions. Compare each summary with the same registered subset
  // so an empty SELECT, filter drift, or omitted registered district fails
  // before any immutable object or discovery manifest can be written.
  const summaryDistricts = new Set(DISTRICT_GROUPS.flatMap((group) => group.districts));
  const groupedRecords = release.snapshots
    .filter((snapshot) => summaryDistricts.has(snapshot.partition.district))
    .flatMap((snapshot) => snapshot.records);
  for (const dealType of Object.keys(ROLLING30_SUMMARY_ARTIFACT_NAMES) as SummaryDealType[]) {
    const summary = summaryDataByType.get(dealType)!;
    const expectedCount = groupedRecords.filter((record) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.dealDate)
        || record.dealDate < summary.window.from || record.dealDate >= summary.window.to) {
        return false;
      }
      if (dealType === 'buy') return record.kind === 'sale' && !record.canceled;
      if (dealType === 'bunyang') return record.kind === 'presale' && !record.canceled;
      if (record.kind !== 'rent') return false;
      return dealType === 'jeonse' ? record.monthlyRentManwon === 0 : record.monthlyRentManwon > 0;
    }).length;
    const actualCount = summary.summary.reduce((sum, row) => sum + row.estimatedCount, 0);
    if (actualCount !== expectedCount) {
      throw new PublicTransactionCompletenessError(
        `release completeness failed: rolling30 ${dealType} summary/raw parity mismatch (${actualCount} != ${expectedCount})`,
      );
    }
  }

  const referenceTimestamp = Math.max(
    ...release.snapshots.map((snapshot) => Date.parse(snapshot.generatedAt)),
  );
  const referenceDate = kstToday(new Date(referenceTimestamp));
  const latestExactDates: Record<PublicTransactionRecord['kind'], string | null> = {
    sale: null,
    rent: null,
    presale: null,
  };
  for (const record of release.snapshots.flatMap((snapshot) => snapshot.records)) {
    // YYYY-MM rows truthfully preserve an unknown day, but cannot prove source
    // freshness and are never accepted as the nationwide recency witness.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.dealDate)) continue;
    const previous = latestExactDates[record.kind];
    if (previous === null || record.dealDate > previous) latestExactDates[record.kind] = record.dealDate;
  }
  const recencyThresholds = options.recencyThresholdsForTest ?? PRODUCTION_RECENCY_THRESHOLDS;
  const recencyFailures: string[] = [];
  for (const [kind, thresholdKey] of [
    ['sale', 'saleMaxAgeDays'],
    ['rent', 'rentMaxAgeDays'],
    ['presale', 'presaleMaxAgeDays'],
  ] as const) {
    const maxAgeDays = recencyThresholds[thresholdKey];
    if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 0) {
      throw new PublicTransactionCompletenessError(`invalid recency threshold: ${thresholdKey}`);
    }
    const latest = latestExactDates[kind];
    if (latest === null) {
      recencyFailures.push(`${kind}=no-exact-date`);
      continue;
    }
    const ageDays = Math.floor(
      (Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000,
    );
    if (ageDays < 0 || ageDays > maxAgeDays) {
      recencyFailures.push(`${kind}=${ageDays}d>${maxAgeDays}d`);
    }
  }
  if (recencyFailures.length > 0) {
    throw new PublicTransactionCompletenessError(
      `release completeness recency failed: ${recencyFailures.join(', ')}`,
    );
  }
  const thresholds = options.thresholdsForTest ?? PRODUCTION_COMPLETENESS_THRESHOLDS;
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PublicTransactionCompletenessError(`invalid completeness threshold: ${name}`);
    }
  }
  const failures = [
    counts.total < thresholds.totalRecords
      ? `total=${counts.total}<${thresholds.totalRecords}` : null,
    counts.nonemptyDistricts < thresholds.nonemptyDistricts
      ? `nonemptyDistricts=${counts.nonemptyDistricts}<${thresholds.nonemptyDistricts}` : null,
    apartmentIndex.data.length < thresholds.apartmentIndexItems
      ? `apartmentIndex=${apartmentIndex.data.length}<${thresholds.apartmentIndexItems}` : null,
    counts.sale < thresholds.saleRecords
      ? `sale=${counts.sale}<${thresholds.saleRecords}` : null,
    counts.rent < thresholds.rentRecords
      ? `rent=${counts.rent}<${thresholds.rentRecords}` : null,
    counts.presale < thresholds.presaleRecords
      ? `presale=${counts.presale}<${thresholds.presaleRecords}` : null,
  ].filter((failure): failure is string => failure !== null);
  if (failures.length > 0) {
    throw new PublicTransactionCompletenessError(
      `release completeness absolute floors failed: ${failures.join(', ')}`,
    );
  }
}

export async function collectPublicTransactionRelease(
  client: PublicSnapshotQueryClient,
  options: {
    now?: Date;
    districts?: readonly (readonly [string, string])[];
  } = {},
): Promise<CollectedPublicTransactionRelease> {
  const now = options.now ?? new Date();
  const publishedAt = now.toISOString();
  const windows = publicSnapshotWindows(now);
  const districts = options.districts ?? Object.entries(DISTRICT_CODE).sort((left, right) => left[1].localeCompare(right[1]));
  const snapshots: PublicTransactionSnapshot[] = [];

  for (const [district, lawdCd] of districts) {
    const records: PublicTransactionRecord[] = [];
    {
      const result = await client.query<SaleSourceDbRow>(DISTRICT_SALE_SELECT, [
        lawdCd, windows.fromMonth, windows.throughMonth,
      ]);
      for (const row of result.rows) records.push(toPublicSaleTransaction(saleSourceRow(row, district)));
    }
    {
      const result = await client.query<RentSourceDbRow>(DISTRICT_RENT_SELECT, [
        lawdCd, windows.fromMonth, windows.throughMonth,
      ]);
      for (const row of result.rows) records.push(toPublicRentTransaction(rentSourceRow(row, district)));
    }
    {
      const result = await client.query<SaleSourceDbRow>(DISTRICT_PRESALE_SELECT, [
        lawdCd, windows.fromMonth, windows.throughMonth,
      ]);
      for (const row of result.rows) records.push(toPublicPresaleTransaction(presaleSourceRow(row, district)));
    }

    // A 0-row district is still a valid, authoritative snapshot partition.
    snapshots.push(createPublicTransactionSnapshot({
      lawdCd,
      district,
      period: windows.period,
      generatedAt: publishedAt,
      records,
    }));
  }

  const summaryParams = [windows.rolling30.from, windows.rolling30.to] as const;
  const buyRows = await client.query<SummaryDbRow>(SALE_SUMMARY_SELECT, summaryParams);
  const jeonseRows = await client.query<SummaryDbRow>(RENT_SUMMARY_SELECT, [...summaryParams, true]);
  const monthlyRows = await client.query<SummaryDbRow>(RENT_SUMMARY_SELECT, [...summaryParams, false]);
  const bunyangRows = await client.query<SummaryDbRow>(PRESALE_SUMMARY_SELECT, summaryParams);
  const apartmentRows = await client.query<ApartmentDbRow>(APARTMENT_INDEX_SELECT);

  const namedArtifacts: PublicNamedArtifactInput[] = [
    ...buildRolling30SummaryArtifacts({
      generatedAt: publishedAt,
      from: windows.rolling30.from,
      to: windows.rolling30.to,
      buy: buyRows.rows.map((row) => saleAggregate(row, 'buy')),
      jeonse: jeonseRows.rows.map((row) => rentAggregate(row, 'jeonse')),
      monthly: monthlyRows.rows.map((row) => rentAggregate(row, 'monthly')),
      bunyang: bunyangRows.rows.map((row) => saleAggregate(row, 'bunyang')),
    }),
    buildApartmentIndexArtifact(apartmentRows.rows.map(apartmentIndexSource)),
  ];
  return { snapshots, namedArtifacts, publishedAt };
}

export async function publishPublicTransactionsFromClient(
  client: PublicSnapshotQueryClient,
  store: ReturnType<typeof createPublicSnapshotStoreFromEnv>['store'],
  options: {
    now?: Date;
    districts?: readonly (readonly [string, string])[];
    completeness?: PublicTransactionCompletenessOptions;
  } = {},
): Promise<PublishPublicSnapshotReleaseResult> {
  if (options.districts && !options.completeness?.allowIncompleteForTest) {
    throw new PublicTransactionCompletenessError(
      'custom district subsets require completeness.allowIncompleteForTest=true',
    );
  }
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let release: CollectedPublicTransactionRelease;
  try {
    release = await collectPublicTransactionRelease(client, options);
    assertPublicTransactionReleaseCompleteness(release, options.completeness);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Publication is deliberately after this block: any partial SELECT failure
    // therefore leaves both immutable objects and the discovery manifest untouched.
    throw error;
  }
  return publishPublicSnapshotRelease({
    store,
    snapshots: release.snapshots,
    namedArtifacts: release.namedArtifacts,
    publishedAt: release.publishedAt,
  });
}

function dryRunEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...env };
  delete result.NAEZIP_SNAPSHOT_R2_ACCOUNT_ID;
  delete result.NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID;
  delete result.NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY;
  delete result.NAEZIP_SNAPSHOT_R2_BUCKET;
  delete result.NAEZIP_SNAPSHOT_R2_ENDPOINT;
  return result;
}

export function selectPublisherStore(
  env: NodeJS.ProcessEnv,
  options: { forceDryRun: boolean },
): ReturnType<typeof createPublicSnapshotStoreFromEnv> {
  const selection = createPublicSnapshotStoreFromEnv(
    options.forceDryRun ? dryRunEnvironment(env) : env,
  );
  if (!options.forceDryRun && selection.mode !== 'r2') {
    throw new Error(
      'R2 snapshot credentials are required for publisher automation; use --dry-run explicitly for a local sink',
    );
  }
  return selection;
}

export function resolveSnapshotSourceAt(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    marker?: Pick<MacMiniSyncHealthMarker, 'completedAt'>;
    now?: Date;
    requireExplicit?: boolean;
  } = {},
): Date {
  const env = options.env ?? process.env;
  const raw = env[SNAPSHOT_SOURCE_AT_ENV]?.trim();
  if (options.requireExplicit && !raw) {
    throw new Error(
      `${SNAPSHOT_SOURCE_AT_ENV} is required when production publish bypasses the sync health marker`,
    );
  }
  let fromEnvironment: Date | undefined;
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)
      || !Number.isFinite(Date.parse(raw))) {
      throw new Error(`${SNAPSHOT_SOURCE_AT_ENV} must be a valid UTC ISO timestamp`);
    }
    fromEnvironment = new Date(raw);
  }

  if (options.marker) {
    if (raw && raw !== options.marker.completedAt) {
      throw new Error(`${SNAPSHOT_SOURCE_AT_ENV} does not match the validated sync health marker`);
    }
    return new Date(options.marker.completedAt);
  }
  return fromEnvironment ?? options.now ?? new Date();
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP.trim());
    return 0;
  }
  const allowed = new Set(['--dry-run', '--allow-stale-local']);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    console.error(`[public-snapshot] 알 수 없는 옵션: ${unknown.join(', ')}`);
    console.error(HELP.trim());
    return 1;
  }
  return withPublicSnapshotPublicationLock({ env: process.env }, async () => {
    const forceDryRun = args.includes('--dry-run');
    const allowStaleLocal = args.includes('--allow-stale-local');
    const selection = selectPublisherStore(process.env, { forceDryRun });
    let marker: MacMiniSyncHealthMarker | undefined;

    if (selection.mode === 'r2') {
      if (allowStaleLocal) {
        console.warn('[public-snapshot] 비상 우회 활성화: sync health marker를 건너뜁니다. 정기 자동화에 사용하지 마세요.');
      } else {
        marker = await readAndAssertMacMiniSyncHealth();
        console.log(`[public-snapshot] sync health gate 통과: exit=${marker.exitCode}, completedAt=${marker.completedAt}`);
      }
    } else {
      console.log(`[public-snapshot] local dry-run store: ${selection.dryRunDirectory}`);
      // The wrapper injects the completed sync timestamp even for dry runs. In
      // that path, validate it against the same marker used by production.
      if (!allowStaleLocal && process.env[SNAPSHOT_SOURCE_AT_ENV]?.trim()) {
        marker = await readAndAssertMacMiniSyncHealth();
      }
    }
    const sourceAt = resolveSnapshotSourceAt({
      env: process.env,
      marker,
      requireExplicit: selection.mode === 'r2' && allowStaleLocal,
    });

    const localDatabaseUrl = assertMacLocalDatabaseUrl(process.env.NAEZIP_LOCAL_DB_URL);
    const pool = new Pool({
      connectionString: localDatabaseUrl,
      application_name: 'naezip-public-snapshot-publisher',
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    try {
      const pgClient = await pool.connect();
      try {
        const client: PublicSnapshotQueryClient = {
          query: async <Row>(text: string, values?: readonly unknown[]) => {
            const result = await pgClient.query(text, values ? [...values] : undefined);
            return { rows: result.rows as Row[] };
          },
        };
        const result = await publishPublicTransactionsFromClient(client, selection.store, {
          now: sourceAt,
        });
        console.log(
          `[public-snapshot] 완료: release=${result.releaseId}, districts=${result.manifest.districts.length}, records=${result.manifest.totals.total}, artifacts=${result.manifest.namedArtifacts.length}`,
        );
      } finally {
        pgClient.release();
      }
    } finally {
      await pool.end();
    }
    return 0;
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error('[public-snapshot] 실패:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

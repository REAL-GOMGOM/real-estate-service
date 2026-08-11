/**
 * Public, serving-oriented real-estate transaction snapshot contract.
 *
 * This is deliberately a strict allowlist. Database rows, pg_dump output, user
 * records, request logs, and arbitrary JSON are not valid publish inputs.
 */

export const PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA = 'naezip.public-transactions.v1' as const;
export const PUBLIC_TRANSACTION_MANIFEST_SCHEMA = 'naezip.public-transactions.manifest.v1' as const;
export const PUBLIC_TRANSACTION_SNAPSHOT_PREFIX = 'public-transactions/v1' as const;

export type PublicTransactionKind = 'sale' | 'rent' | 'presale';

export interface PublicSnapshotPartition {
  lawdCd: string;
  district: string;
}

export interface PublicSnapshotPeriod {
  from: string;
  through: string;
}

interface PublicTransactionBase {
  /** Opaque identifier derived only from the source's public transaction key. */
  id: string;
  apartmentId: string | null;
  aptName: string;
  district: string;
  dong: string;
  areaM2: number;
  floor: number | null;
  dealDate: string;
  buildYear: number | null;
}

export interface PublicSaleTransaction extends PublicTransactionBase {
  kind: 'sale';
  amountManwon: number;
  canceled: boolean;
}

export interface PublicPresaleTransaction extends PublicTransactionBase {
  kind: 'presale';
  amountManwon: number;
  canceled: boolean;
}

export interface PublicRentTransaction extends PublicTransactionBase {
  kind: 'rent';
  depositManwon: number;
  monthlyRentManwon: number;
  contractType: 'new' | 'renewal' | null;
  previousDepositManwon: number | null;
  previousMonthlyRentManwon: number | null;
}

export type PublicTransactionRecord = PublicSaleTransaction | PublicRentTransaction | PublicPresaleTransaction;

export interface PublicTransactionSnapshot {
  schema: typeof PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA;
  generatedAt: string;
  partition: PublicSnapshotPartition;
  period: PublicSnapshotPeriod;
  recordCount: number;
  records: PublicTransactionRecord[];
}

export interface PublicSnapshotCounts {
  total: number;
  sale: number;
  rent: number;
  presale: number;
}

export interface PublicSnapshotObjectDescriptor {
  key: string;
  schema: typeof PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA;
  contentType: 'application/json';
  contentEncoding: 'gzip';
  /** SHA-256 of the exact compressed object stored in R2. */
  sha256: string;
  /** SHA-256 after gzip decoding, used when HTTP clients transparently decode. */
  payloadSha256: string;
  byteLength: number;
  payloadByteLength: number;
}

export interface PublicNamedArtifactDescriptor {
  key: string;
  /** Owned by the artifact producer, for example naezip.transaction-summary.v1. */
  schema: string;
  itemCount: number;
  contentType: 'application/json';
  contentEncoding: 'gzip';
  sha256: string;
  payloadSha256: string;
  byteLength: number;
  payloadByteLength: number;
}

export interface PublicNamedArtifactEntry {
  name: string;
  artifact: PublicNamedArtifactDescriptor;
}

export interface PublicNamedArtifactEnvelope<T = unknown> {
  schema: string;
  generatedAt: string;
  itemCount: number;
  data: T;
}

/** Search index and summary entry for one district snapshot. */
export interface PublicSnapshotDistrictEntry {
  lawdCd: string;
  district: string;
  period: PublicSnapshotPeriod;
  counts: PublicSnapshotCounts;
  latestDealDate: string | null;
  snapshot: PublicSnapshotObjectDescriptor;
}

export interface PublicTransactionManifest {
  schema: typeof PUBLIC_TRANSACTION_MANIFEST_SCHEMA;
  releaseId: string;
  publishedAt: string;
  source: {
    provider: 'molit-open-data';
    format: 'normalized-public-records';
    containsPersonalData: false;
  };
  totals: PublicSnapshotCounts;
  districts: PublicSnapshotDistrictEntry[];
  /** Optional producer-defined summaries and search indexes; empty when unused. */
  namedArtifacts: PublicNamedArtifactEntry[];
}

export class PublicSnapshotValidationError extends Error {
  readonly issues: readonly string[];

  constructor(label: string, issues: readonly string[]) {
    super(`${label} validation failed: ${issues.join('; ')}`);
    this.name = 'PublicSnapshotValidationError';
    this.issues = issues;
  }
}

const SNAPSHOT_KEYS = ['generatedAt', 'partition', 'period', 'recordCount', 'records', 'schema'] as const;
const PARTITION_KEYS = ['district', 'lawdCd'] as const;
const PERIOD_KEYS = ['from', 'through'] as const;
const SALE_KEYS = [
  'amountManwon', 'apartmentId', 'aptName', 'areaM2', 'buildYear', 'canceled',
  'dealDate', 'district', 'dong', 'floor', 'id', 'kind',
] as const;
const RENT_KEYS = [
  'apartmentId', 'aptName', 'areaM2', 'buildYear', 'contractType', 'dealDate',
  'depositManwon', 'district', 'dong', 'floor', 'id', 'kind', 'monthlyRentManwon',
  'previousDepositManwon', 'previousMonthlyRentManwon',
] as const;
const MANIFEST_KEYS = ['districts', 'namedArtifacts', 'publishedAt', 'releaseId', 'schema', 'source', 'totals'] as const;
const SOURCE_KEYS = ['containsPersonalData', 'format', 'provider'] as const;
const COUNTS_KEYS = ['presale', 'rent', 'sale', 'total'] as const;
const DISTRICT_ENTRY_KEYS = ['counts', 'district', 'latestDealDate', 'lawdCd', 'period', 'snapshot'] as const;
const DESCRIPTOR_KEYS = [
  'byteLength', 'contentEncoding', 'contentType', 'key', 'payloadByteLength',
  'payloadSha256', 'schema', 'sha256',
] as const;
const NAMED_ARTIFACT_ENTRY_KEYS = ['artifact', 'name'] as const;
const NAMED_DESCRIPTOR_KEYS = [
  'byteLength', 'contentEncoding', 'contentType', 'itemCount', 'key',
  'payloadByteLength', 'payloadSha256', 'schema', 'sha256',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkExactKeys(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: string[],
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0) issues.push(`${path} is missing: ${missing.join(', ')}`);
  if (extra.length > 0) issues.push(`${path} has forbidden fields: ${extra.join(', ')}`);
  return missing.length === 0 && extra.length === 0;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function publicDealDateRange(value: unknown): { from: string; through: string } | null {
  if (isCalendarDate(value)) return { from: value, through: value };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${value}-01`,
    through: `${value}-${String(lastDay).padStart(2, '0')}`,
  };
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function checkString(
  value: unknown,
  path: string,
  issues: string[],
  { min = 1, max = 200, pattern }: { min?: number; max?: number; pattern?: RegExp } = {},
): value is string {
  if (typeof value !== 'string' || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    issues.push(`${path} must be a valid string`);
    return false;
  }
  return true;
}

function checkNumber(
  value: unknown,
  path: string,
  issues: string[],
  { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false }: { min?: number; max?: number; integer?: boolean } = {},
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    issues.push(`${path} must be a valid number`);
    return false;
  }
  return true;
}

function checkNullableNumber(
  value: unknown,
  path: string,
  issues: string[],
  options: { min?: number; max?: number; integer?: boolean } = {},
): void {
  if (value !== null) checkNumber(value, path, issues, options);
}

function validatePeriod(value: unknown, path: string, issues: string[]): value is PublicSnapshotPeriod {
  if (!checkExactKeys(value, PERIOD_KEYS, path, issues)) return false;
  if (!isCalendarDate(value.from)) issues.push(`${path}.from must be YYYY-MM-DD`);
  if (!isCalendarDate(value.through)) issues.push(`${path}.through must be YYYY-MM-DD`);
  if (isCalendarDate(value.from) && isCalendarDate(value.through) && value.from > value.through) {
    issues.push(`${path}.from must not be after through`);
  }
  return true;
}

function validateCounts(value: unknown, path: string, issues: string[]): value is PublicSnapshotCounts {
  if (!checkExactKeys(value, COUNTS_KEYS, path, issues)) return false;
  checkNumber(value.total, `${path}.total`, issues, { integer: true });
  checkNumber(value.sale, `${path}.sale`, issues, { integer: true });
  checkNumber(value.rent, `${path}.rent`, issues, { integer: true });
  checkNumber(value.presale, `${path}.presale`, issues, { integer: true });
  if (typeof value.total === 'number' && typeof value.sale === 'number'
    && typeof value.rent === 'number' && typeof value.presale === 'number'
    && value.total !== value.sale + value.rent + value.presale) {
    issues.push(`${path}.total must equal sale + rent + presale`);
  }
  return true;
}

function validateBaseRecord(
  record: Record<string, unknown>,
  path: string,
  partition: PublicSnapshotPartition,
  period: PublicSnapshotPeriod,
  issues: string[],
): void {
  checkString(record.id, `${path}.id`, issues, { pattern: /^[a-f0-9]{24}$/ });
  if (record.apartmentId !== null) checkString(record.apartmentId, `${path}.apartmentId`, issues, { max: 100 });
  checkString(record.aptName, `${path}.aptName`, issues, { max: 200 });
  checkString(record.district, `${path}.district`, issues, { max: 80 });
  checkString(record.dong, `${path}.dong`, issues, { max: 100 });
  checkNumber(record.areaM2, `${path}.areaM2`, issues, { min: 0.01, max: 1000 });
  checkNullableNumber(record.floor, `${path}.floor`, issues, { min: -20, max: 300, integer: true });
  checkNullableNumber(record.buildYear, `${path}.buildYear`, issues, { min: 1800, max: 3000, integer: true });
  const dealRange = publicDealDateRange(record.dealDate);
  if (!dealRange) {
    issues.push(`${path}.dealDate must be YYYY-MM-DD or YYYY-MM`);
  } else if (dealRange.through < period.from || dealRange.from > period.through) {
    issues.push(`${path}.dealDate is outside the snapshot period`);
  }
  if (record.district !== partition.district) {
    issues.push(`${path}.district must match partition.district`);
  }
}

function validateRecord(
  value: unknown,
  path: string,
  partition: PublicSnapshotPartition,
  period: PublicSnapshotPeriod,
  issues: string[],
): value is PublicTransactionRecord {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`);
    return false;
  }
  if (value.kind === 'sale') {
    if (!checkExactKeys(value, SALE_KEYS, path, issues)) return false;
    validateBaseRecord(value, path, partition, period, issues);
    checkNumber(value.amountManwon, `${path}.amountManwon`, issues, { min: 1, integer: true });
    if (typeof value.canceled !== 'boolean') issues.push(`${path}.canceled must be boolean`);
    if (value.canceled === true) issues.push(`${path} is canceled and must not be published`);
    return true;
  }
  if (value.kind === 'presale') {
    if (!checkExactKeys(value, SALE_KEYS, path, issues)) return false;
    validateBaseRecord(value, path, partition, period, issues);
    checkNumber(value.amountManwon, `${path}.amountManwon`, issues, { min: 1, integer: true });
    if (typeof value.canceled !== 'boolean') issues.push(`${path}.canceled must be boolean`);
    if (value.canceled === true) issues.push(`${path} is canceled and must not be published`);
    return true;
  }
  if (value.kind === 'rent') {
    if (!checkExactKeys(value, RENT_KEYS, path, issues)) return false;
    validateBaseRecord(value, path, partition, period, issues);
    checkNumber(value.depositManwon, `${path}.depositManwon`, issues, { min: 1, integer: true });
    checkNumber(value.monthlyRentManwon, `${path}.monthlyRentManwon`, issues, { integer: true });
    if (value.contractType !== null && value.contractType !== 'new' && value.contractType !== 'renewal') {
      issues.push(`${path}.contractType must be new, renewal, or null`);
    }
    checkNullableNumber(value.previousDepositManwon, `${path}.previousDepositManwon`, issues, { min: 1, integer: true });
    checkNullableNumber(value.previousMonthlyRentManwon, `${path}.previousMonthlyRentManwon`, issues, { min: 0, integer: true });
    return true;
  }
  issues.push(`${path}.kind must be sale, rent, or presale`);
  return false;
}

export function snapshotValidationIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!checkExactKeys(value, SNAPSHOT_KEYS, 'snapshot', issues)) return issues;
  if (value.schema !== PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA) issues.push('snapshot.schema is unsupported');
  if (!isIsoTimestamp(value.generatedAt)) issues.push('snapshot.generatedAt must be an ISO UTC timestamp');

  let partition: PublicSnapshotPartition | null = null;
  if (checkExactKeys(value.partition, PARTITION_KEYS, 'snapshot.partition', issues)) {
    checkString(value.partition.lawdCd, 'snapshot.partition.lawdCd', issues, { pattern: /^\d{5}$/ });
    checkString(value.partition.district, 'snapshot.partition.district', issues, { max: 80 });
    partition = value.partition as unknown as PublicSnapshotPartition;
  }
  const period = validatePeriod(value.period, 'snapshot.period', issues)
    ? value.period as unknown as PublicSnapshotPeriod
    : null;
  checkNumber(value.recordCount, 'snapshot.recordCount', issues, { integer: true });

  if (!Array.isArray(value.records)) {
    issues.push('snapshot.records must be an array');
  } else if (partition && period) {
    const ids = new Set<string>();
    value.records.forEach((record, index) => {
      if (validateRecord(record, `snapshot.records[${index}]`, partition!, period!, issues)) {
        if (ids.has(record.id)) issues.push(`snapshot.records[${index}].id is duplicated`);
        ids.add(record.id);
      }
    });
    if (value.recordCount !== value.records.length) {
      issues.push('snapshot.recordCount must equal records.length');
    }
  }
  return issues;
}

export function assertPublicTransactionSnapshot(value: unknown): asserts value is PublicTransactionSnapshot {
  const issues = snapshotValidationIssues(value);
  if (issues.length > 0) throw new PublicSnapshotValidationError('snapshot', issues);
}

function validateDescriptor(
  value: unknown,
  path: string,
  releaseId: string,
  issues: string[],
): value is PublicSnapshotObjectDescriptor {
  if (!checkExactKeys(value, DESCRIPTOR_KEYS, path, issues)) return false;
  if (value.schema !== PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA) issues.push(`${path}.schema is unsupported`);
  if (value.contentType !== 'application/json') issues.push(`${path}.contentType must be application/json`);
  if (value.contentEncoding !== 'gzip') issues.push(`${path}.contentEncoding must be gzip`);
  checkString(value.sha256, `${path}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/ });
  checkString(value.payloadSha256, `${path}.payloadSha256`, issues, { pattern: /^[a-f0-9]{64}$/ });
  checkNumber(value.byteLength, `${path}.byteLength`, issues, { min: 1, integer: true });
  checkNumber(value.payloadByteLength, `${path}.payloadByteLength`, issues, { min: 1, integer: true });
  const expectedPrefix = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/districts/`;
  if (typeof value.key !== 'string'
    || !value.key.startsWith(expectedPrefix)
    || !/\/\d{5}\.json\.gz$/.test(value.key)
    || value.key.includes('..')) {
    issues.push(`${path}.key must be an immutable district snapshot key`);
  }
  return true;
}

function validateNamedDescriptor(
  value: unknown,
  path: string,
  releaseId: string,
  issues: string[],
): value is PublicNamedArtifactDescriptor {
  if (!checkExactKeys(value, NAMED_DESCRIPTOR_KEYS, path, issues)) return false;
  checkString(value.schema, `${path}.schema`, issues, { max: 160, pattern: /^naezip\.[a-z0-9.-]+\.v\d+$/ });
  checkNumber(value.itemCount, `${path}.itemCount`, issues, { integer: true });
  if (value.contentType !== 'application/json') issues.push(`${path}.contentType must be application/json`);
  if (value.contentEncoding !== 'gzip') issues.push(`${path}.contentEncoding must be gzip`);
  checkString(value.sha256, `${path}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/ });
  checkString(value.payloadSha256, `${path}.payloadSha256`, issues, { pattern: /^[a-f0-9]{64}$/ });
  checkNumber(value.byteLength, `${path}.byteLength`, issues, { min: 1, integer: true });
  checkNumber(value.payloadByteLength, `${path}.payloadByteLength`, issues, { min: 1, integer: true });
  const expectedPrefix = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/artifacts/`;
  if (typeof value.key !== 'string'
    || !value.key.startsWith(expectedPrefix)
    || !/\/[a-z0-9][a-z0-9/_-]*\.json\.gz$/.test(value.key)
    || value.key.includes('..')) {
    issues.push(`${path}.key must be an immutable named artifact key`);
  }
  return true;
}

export function manifestValidationIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!checkExactKeys(value, MANIFEST_KEYS, 'manifest', issues)) return issues;
  if (value.schema !== PUBLIC_TRANSACTION_MANIFEST_SCHEMA) issues.push('manifest.schema is unsupported');
  const validReleaseId = checkString(value.releaseId, 'manifest.releaseId', issues, {
    pattern: /^\d{8}T\d{6}Z-[a-f0-9]{12}$/,
  });
  if (!isIsoTimestamp(value.publishedAt)) issues.push('manifest.publishedAt must be an ISO UTC timestamp');
  if (checkExactKeys(value.source, SOURCE_KEYS, 'manifest.source', issues)) {
    if (value.source.provider !== 'molit-open-data') issues.push('manifest.source.provider is unsupported');
    if (value.source.format !== 'normalized-public-records') issues.push('manifest.source.format is unsupported');
    if (value.source.containsPersonalData !== false) issues.push('manifest.source must declare no personal data');
  }

  const totalsValid = validateCounts(value.totals, 'manifest.totals', issues);
  if (!Array.isArray(value.districts)) {
    issues.push('manifest.districts must be an array');
    return issues;
  }

  const seenCodes = new Set<string>();
  const summed: PublicSnapshotCounts = { total: 0, sale: 0, rent: 0, presale: 0 };
  value.districts.forEach((entry, index) => {
    const path = `manifest.districts[${index}]`;
    if (!checkExactKeys(entry, DISTRICT_ENTRY_KEYS, path, issues)) return;
    const lawdValid = checkString(entry.lawdCd, `${path}.lawdCd`, issues, { pattern: /^\d{5}$/ });
    checkString(entry.district, `${path}.district`, issues, { max: 80 });
    validatePeriod(entry.period, `${path}.period`, issues);
    const countsValid = validateCounts(entry.counts, `${path}.counts`, issues);
    if (entry.latestDealDate !== null && !publicDealDateRange(entry.latestDealDate)) {
      issues.push(`${path}.latestDealDate must be YYYY-MM-DD, YYYY-MM, or null`);
    }
    if (validReleaseId) validateDescriptor(entry.snapshot, `${path}.snapshot`, value.releaseId as string, issues);
    if (lawdValid) {
      if (seenCodes.has(entry.lawdCd as string)) issues.push(`${path}.lawdCd is duplicated`);
      seenCodes.add(entry.lawdCd as string);
      if (isPlainObject(entry.snapshot) && typeof entry.snapshot.key === 'string'
        && !entry.snapshot.key.endsWith(`/${entry.lawdCd}.json.gz`)) {
        issues.push(`${path}.snapshot.key must match lawdCd`);
      }
    }
    if (countsValid) {
      const counts = entry.counts as unknown as PublicSnapshotCounts;
      summed.total += counts.total;
      summed.sale += counts.sale;
      summed.rent += counts.rent;
      summed.presale += counts.presale;
    }
  });

  if (totalsValid) {
    const totals = value.totals as unknown as PublicSnapshotCounts;
    if (totals.total !== summed.total
      || totals.sale !== summed.sale
      || totals.rent !== summed.rent
      || totals.presale !== summed.presale) {
      issues.push('manifest.totals must equal the sum of district counts');
    }
  }

  if (!Array.isArray(value.namedArtifacts)) {
    issues.push('manifest.namedArtifacts must be an array');
  } else {
    const names = new Set<string>();
    value.namedArtifacts.forEach((entry, index) => {
      const path = `manifest.namedArtifacts[${index}]`;
      if (!checkExactKeys(entry, NAMED_ARTIFACT_ENTRY_KEYS, path, issues)) return;
      const nameValid = checkString(entry.name, `${path}.name`, issues, {
        max: 100,
        pattern: /^[a-z0-9][a-z0-9/_-]*$/,
      });
      if (nameValid) {
        if (names.has(entry.name as string)) issues.push(`${path}.name is duplicated`);
        names.add(entry.name as string);
      }
      if (validReleaseId && validateNamedDescriptor(entry.artifact, `${path}.artifact`, value.releaseId as string, issues)
        && nameValid && !entry.artifact.key.endsWith(`/${entry.name}.json.gz`)) {
        issues.push(`${path}.artifact.key must match name`);
      }
    });
  }
  return issues;
}

export function assertPublicTransactionManifest(value: unknown): asserts value is PublicTransactionManifest {
  const issues = manifestValidationIssues(value);
  if (issues.length > 0) throw new PublicSnapshotValidationError('manifest', issues);
}

export function countPublicTransactions(records: readonly PublicTransactionRecord[]): PublicSnapshotCounts {
  let sale = 0;
  let rent = 0;
  let presale = 0;
  for (const record of records) {
    if (record.kind === 'sale') sale += 1;
    else if (record.kind === 'rent') rent += 1;
    else presale += 1;
  }
  return { total: records.length, sale, rent, presale };
}

export function latestPublicDealDate(records: readonly PublicTransactionRecord[]): string | null {
  let latest: string | null = null;
  for (const record of records) {
    const candidateThrough = publicDealDateRange(record.dealDate)?.through ?? record.dealDate;
    const latestThrough = latest ? publicDealDateRange(latest)?.through ?? latest : null;
    if (latestThrough === null || candidateThrough > latestThrough) latest = record.dealDate;
  }
  return latest;
}

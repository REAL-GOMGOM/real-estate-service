import { DISTRICT_GROUPS } from '../district-groups';
import type { PublicNamedArtifactEnvelope } from './contract';
import type { PublicNamedArtifactInput } from './publisher';
import {
  ServingArtifactValidationError,
  type SaleDistrictAggregate,
} from './serving-artifacts';

export const DISTRICT_ROLLING30_SCHEMA = 'naezip.transaction-districts.v1' as const;
export const DISTRICT_ROLLING30_ARTIFACT_NAME = 'districts/rolling30' as const;

export interface Rolling30DistrictRow {
  district: string;
  count: number;
  newHighs: number;
}

export interface Rolling30DistrictsData {
  status: 'ok';
  month: string;
  window: { type: 'rolling30'; from: string; to: string };
  districts: Rolling30DistrictRow[];
  updatedAt: string;
}

const REGISTERED_DISTRICTS = DISTRICT_GROUPS.flatMap((group) => group.districts);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new ServingArtifactValidationError(`${path} fields are invalid`);
  }
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function kstMonth(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 9 * 3_600_000).toISOString().slice(0, 7).replace('-', '');
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ServingArtifactValidationError(`${path} must be a non-negative integer`);
  }
}

export function assertRolling30DistrictsData(value: unknown): asserts value is Rolling30DistrictsData {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('districts data must be an object');
  assertExactKeys(value, ['districts', 'month', 'status', 'updatedAt', 'window'], 'districts data');
  if (value.status !== 'ok' || !isIsoTimestamp(value.updatedAt)) {
    throw new ServingArtifactValidationError('districts metadata is invalid');
  }
  if (value.month !== kstMonth(value.updatedAt)) {
    throw new ServingArtifactValidationError('districts month does not match updatedAt');
  }
  if (!isPlainObject(value.window)) throw new ServingArtifactValidationError('districts window is invalid');
  assertExactKeys(value.window, ['from', 'to', 'type'], 'districts window');
  if (value.window.type !== 'rolling30' || !isCalendarDate(value.window.from)
    || !isCalendarDate(value.window.to) || value.window.from >= value.window.to) {
    throw new ServingArtifactValidationError('districts rolling30 window is invalid');
  }
  const generatedDate = new Date(Date.parse(value.updatedAt) + 9 * 3_600_000)
    .toISOString().slice(0, 10);
  if (value.window.from !== shiftDate(generatedDate, -29)
    || value.window.to !== shiftDate(generatedDate, 1)) {
    throw new ServingArtifactValidationError('districts window does not match updatedAt');
  }
  if (!Array.isArray(value.districts) || value.districts.length !== REGISTERED_DISTRICTS.length) {
    throw new ServingArtifactValidationError('district rows are incomplete');
  }
  value.districts.forEach((candidate, index) => {
    const path = `districts[${index}]`;
    if (!isPlainObject(candidate)) throw new ServingArtifactValidationError(`${path} must be an object`);
    assertExactKeys(candidate, ['count', 'district', 'newHighs'], path);
    if (candidate.district !== REGISTERED_DISTRICTS[index]) {
      throw new ServingArtifactValidationError(`${path}.district is out of order`);
    }
    assertNonNegativeInteger(candidate.count, `${path}.count`);
    assertNonNegativeInteger(candidate.newHighs, `${path}.newHighs`);
    if (candidate.newHighs > candidate.count) {
      throw new ServingArtifactValidationError(`${path}.newHighs exceeds count`);
    }
  });
}

export function assertRolling30DistrictsEnvelope(
  value: unknown,
): asserts value is PublicNamedArtifactEnvelope<Rolling30DistrictsData> {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('districts envelope must be an object');
  assertExactKeys(value, ['data', 'generatedAt', 'itemCount', 'schema'], 'districts envelope');
  if (value.schema !== DISTRICT_ROLLING30_SCHEMA || !isIsoTimestamp(value.generatedAt)) {
    throw new ServingArtifactValidationError('districts envelope metadata is invalid');
  }
  assertNonNegativeInteger(value.itemCount, 'districts envelope itemCount');
  assertRolling30DistrictsData(value.data);
  if (value.generatedAt !== value.data.updatedAt || value.itemCount !== value.data.districts.length) {
    throw new ServingArtifactValidationError('districts envelope does not match its data');
  }
}

export function buildRolling30DistrictsArtifact(input: {
  generatedAt: string;
  from: string;
  to: string;
  buy: readonly SaleDistrictAggregate[];
}): PublicNamedArtifactInput<Rolling30DistrictsData> {
  const byDistrict = new Map<string, SaleDistrictAggregate>();
  for (const row of input.buy) {
    if (byDistrict.has(row.sigungu)) {
      throw new ServingArtifactValidationError(`district aggregates contain duplicate: ${row.sigungu}`);
    }
    byDistrict.set(row.sigungu, row);
  }
  const data: Rolling30DistrictsData = {
    status: 'ok',
    month: kstMonth(input.generatedAt),
    window: { type: 'rolling30', from: input.from, to: input.to },
    districts: REGISTERED_DISTRICTS.map((district) => {
      const row = byDistrict.get(district);
      return { district, count: row?.cnt ?? 0, newHighs: row?.newHighs ?? 0 };
    }),
    updatedAt: input.generatedAt,
  };
  assertRolling30DistrictsData(data);
  return {
    name: DISTRICT_ROLLING30_ARTIFACT_NAME,
    schema: DISTRICT_ROLLING30_SCHEMA,
    itemCount: data.districts.length,
    data,
  };
}

import {
  RANKING_REGION_NAMES,
  rankingWindow,
  type RankingArea,
  type RankingCoverageRow,
  type RankingNewHighRow,
  type RankingTopPriceRow,
  type RankingTradeStats,
  type RankingVolumeRow,
} from '../ranking-queries';
import type { PublicNamedArtifactEnvelope } from './contract';
import type { PublicNamedArtifactInput } from './publisher';
import { ServingArtifactValidationError } from './serving-artifacts';

export const RANKING_TRADE_STATS_SCHEMA = 'naezip.ranking-trade-stats.v1' as const;
export const RANKING_TRADE_STATS_ARTIFACT_NAME = 'ranking/trade-stats' as const;
export const RANKING_PERIOD_MONTHS = [3, 12] as const;
export const RANKING_AREAS = ['all', '59', '84', 'large'] as const satisfies readonly RankingArea[];

export interface RankingTradeStatsVariant extends RankingTradeStats {
  periodMonths: 3 | 12;
  area: RankingArea;
  window: { from: string; toExclusive: string; asOf: string };
}

export interface RankingTradeStatsArtifactData {
  status: 'ok';
  updatedAt: string;
  variants: RankingTradeStatsVariant[];
}

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

function assertNumber(
  value: unknown,
  path: string,
  options: { integer?: boolean; min?: number } = {},
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || (options.integer && !Number.isInteger(value))
    || (options.min !== undefined && value < options.min)) {
    throw new ServingArtifactValidationError(`${path} must be a valid number`);
  }
}

function assertString(value: unknown, path: string, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ServingArtifactValidationError(`${path} must be a non-empty string`);
  }
}

function assertRegionRows<T extends Record<string, unknown>>(
  value: unknown,
  path: string,
  expectedKeys: readonly string[],
  validate: (row: T, rowPath: string) => void,
): void {
  if (!Array.isArray(value) || value.length > Object.keys(RANKING_REGION_NAMES).length * 5) {
    throw new ServingArtifactValidationError(`${path} contains too many rows`);
  }
  const nextRank = new Map<string, number>();
  value.forEach((candidate, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isPlainObject(candidate)) throw new ServingArtifactValidationError(`${rowPath} must be an object`);
    assertExactKeys(candidate, expectedKeys, rowPath);
    const regionCode = candidate.regionCode;
    if (typeof regionCode !== 'string' || !Object.hasOwn(RANKING_REGION_NAMES, regionCode)) {
      throw new ServingArtifactValidationError(`${rowPath}.regionCode is invalid`);
    }
    assertNumber(candidate.rank, `${rowPath}.rank`, { integer: true, min: 1 });
    const expectedRank = nextRank.get(regionCode) ?? 1;
    if (candidate.rank !== expectedRank || candidate.rank > 5) {
      throw new ServingArtifactValidationError(`${rowPath}.rank is out of order`);
    }
    nextRank.set(regionCode, expectedRank + 1);
    assertString(candidate.aptName, `${rowPath}.aptName`);
    assertString(candidate.district, `${rowPath}.district`, 80);
    assertString(candidate.dong, `${rowPath}.dong`, 100);
    validate(candidate as T, rowPath);
  });
}

function assertCoverage(value: unknown, path: string): asserts value is RankingCoverageRow {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError(`${path} must be an object`);
  assertExactKeys(value, ['districtCount', 'firstDealDate', 'lastDealDate', 'transactionCount'], path);
  assertNumber(value.transactionCount, `${path}.transactionCount`, { integer: true, min: 0 });
  assertNumber(value.districtCount, `${path}.districtCount`, { integer: true, min: 0 });
  if (value.firstDealDate !== null && !isCalendarDate(value.firstDealDate)) {
    throw new ServingArtifactValidationError(`${path}.firstDealDate is invalid`);
  }
  if (value.lastDealDate !== null && !isCalendarDate(value.lastDealDate)) {
    throw new ServingArtifactValidationError(`${path}.lastDealDate is invalid`);
  }
  if ((value.transactionCount === 0
    && (value.firstDealDate !== null || value.lastDealDate !== null))
    || (value.transactionCount > 0
      && (value.firstDealDate === null || value.lastDealDate === null))) {
    throw new ServingArtifactValidationError(`${path} dates do not match transactionCount`);
  }
}

function assertVariant(value: unknown, updatedAt: string, index: number): asserts value is RankingTradeStatsVariant {
  const path = `ranking variants[${index}]`;
  if (!isPlainObject(value)) throw new ServingArtifactValidationError(`${path} must be an object`);
  assertExactKeys(value, [
    'area', 'coverage', 'newHigh', 'periodMonths', 'topPrice', 'volume', 'window',
  ], path);
  const expectedPeriod = RANKING_PERIOD_MONTHS[Math.floor(index / RANKING_AREAS.length)];
  const expectedArea = RANKING_AREAS[index % RANKING_AREAS.length];
  if (value.periodMonths !== expectedPeriod || value.area !== expectedArea) {
    throw new ServingArtifactValidationError(`${path} period/area order is invalid`);
  }
  if (!isPlainObject(value.window)) throw new ServingArtifactValidationError(`${path}.window must be an object`);
  assertExactKeys(value.window, ['asOf', 'from', 'toExclusive'], `${path}.window`);
  const expectedWindow = rankingWindow(expectedPeriod, new Date(updatedAt));
  if (value.window.from !== expectedWindow.from
    || value.window.toExclusive !== expectedWindow.toExclusive
    || value.window.asOf !== expectedWindow.asOf) {
    throw new ServingArtifactValidationError(`${path}.window does not match generatedAt`);
  }
  assertCoverage(value.coverage, `${path}.coverage`);

  assertRegionRows<RankingTopPriceRow & Record<string, unknown>>(
    value.topPrice,
    `${path}.topPrice`,
    ['aptName', 'area', 'dealDate', 'district', 'dong', 'floor', 'price', 'rank', 'regionCode'],
    (row, rowPath) => {
      assertNumber(row.price, `${rowPath}.price`, { integer: true, min: 1 });
      assertNumber(row.area, `${rowPath}.area`, { min: 1 });
      if (row.floor !== null) assertNumber(row.floor, `${rowPath}.floor`, { integer: true });
      if (!isCalendarDate(row.dealDate)
        || row.dealDate < expectedWindow.from
        || row.dealDate >= expectedWindow.toExclusive) {
        throw new ServingArtifactValidationError(`${rowPath}.dealDate is outside its window`);
      }
    },
  );
  assertRegionRows<RankingVolumeRow & Record<string, unknown>>(
    value.volume,
    `${path}.volume`,
    ['aptName', 'avgPrice', 'count', 'district', 'dong', 'rank', 'regionCode'],
    (row, rowPath) => {
      assertNumber(row.count, `${rowPath}.count`, { integer: true, min: 1 });
      assertNumber(row.avgPrice, `${rowPath}.avgPrice`, { integer: true, min: 1 });
    },
  );
  assertRegionRows<RankingNewHighRow & Record<string, unknown>>(
    value.newHigh,
    `${path}.newHigh`,
    ['aptName', 'diff', 'diffPercent', 'district', 'dong', 'prevHigh', 'price', 'rank', 'regionCode'],
    (row, rowPath) => {
      for (const key of ['price', 'prevHigh', 'diff'] as const) {
        assertNumber(row[key], `${rowPath}.${key}`, { integer: true, min: 1 });
      }
      assertNumber(row.diffPercent, `${rowPath}.diffPercent`, { min: 0 });
      if (row.price <= row.prevHigh || row.diff !== row.price - row.prevHigh) {
        throw new ServingArtifactValidationError(`${rowPath} is not a strict new high`);
      }
      const expectedPercent = Math.round((row.diff / row.prevHigh) * 1_000) / 10;
      if (row.diffPercent !== expectedPercent) {
        throw new ServingArtifactValidationError(`${rowPath}.diffPercent is invalid`);
      }
    },
  );
}

export function assertRankingTradeStatsData(
  value: unknown,
): asserts value is RankingTradeStatsArtifactData {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('ranking data must be an object');
  assertExactKeys(value, ['status', 'updatedAt', 'variants'], 'ranking data');
  if (value.status !== 'ok' || !isIsoTimestamp(value.updatedAt)) {
    throw new ServingArtifactValidationError('ranking metadata is invalid');
  }
  if (!Array.isArray(value.variants)
    || value.variants.length !== RANKING_PERIOD_MONTHS.length * RANKING_AREAS.length) {
    throw new ServingArtifactValidationError('ranking variants are incomplete');
  }
  value.variants.forEach((variant, index) => assertVariant(variant, value.updatedAt as string, index));
}

export function assertRankingTradeStatsEnvelope(
  value: unknown,
): asserts value is PublicNamedArtifactEnvelope<RankingTradeStatsArtifactData> {
  if (!isPlainObject(value)) throw new ServingArtifactValidationError('ranking envelope must be an object');
  assertExactKeys(value, ['data', 'generatedAt', 'itemCount', 'schema'], 'ranking envelope');
  if (value.schema !== RANKING_TRADE_STATS_SCHEMA || !isIsoTimestamp(value.generatedAt)) {
    throw new ServingArtifactValidationError('ranking envelope metadata is invalid');
  }
  assertNumber(value.itemCount, 'ranking envelope itemCount', { integer: true, min: 0 });
  assertRankingTradeStatsData(value.data);
  if (value.generatedAt !== value.data.updatedAt || value.itemCount !== value.data.variants.length) {
    throw new ServingArtifactValidationError('ranking envelope does not match its data');
  }
}

export function buildRankingTradeStatsArtifact(input: {
  generatedAt: string;
  variants: readonly RankingTradeStatsVariant[];
}): PublicNamedArtifactInput<RankingTradeStatsArtifactData> {
  const data: RankingTradeStatsArtifactData = {
    status: 'ok',
    updatedAt: input.generatedAt,
    variants: input.variants.map((variant) => ({
      ...variant,
      coverage: { ...variant.coverage },
      topPrice: variant.topPrice.map((row) => ({ ...row })),
      volume: variant.volume.map((row) => ({ ...row })),
      newHigh: variant.newHigh.map((row) => ({ ...row })),
      window: { ...variant.window },
    })),
  };
  assertRankingTradeStatsData(data);
  return {
    name: RANKING_TRADE_STATS_ARTIFACT_NAME,
    schema: RANKING_TRADE_STATS_SCHEMA,
    itemCount: data.variants.length,
    data,
  };
}

export function findRankingTradeStatsVariant(
  data: RankingTradeStatsArtifactData,
  periodMonths: 3 | 12,
  area: RankingArea,
): RankingTradeStatsVariant | null {
  return data.variants.find((variant) => (
    variant.periodMonths === periodMonths && variant.area === area
  )) ?? null;
}

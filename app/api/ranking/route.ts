import { NextRequest, NextResponse } from 'next/server';
import {
  RANKING_REGION_NAMES,
  RANKING_TOTAL_LABEL,
  fetchRankingTradeStats,
  rankingWindow,
  type RankingArea,
  type RankingNewHighRow,
  type RankingTopPriceRow,
  type RankingTradeStats,
  type RankingVolumeRow,
} from '@/lib/ranking-queries';
import {
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
} from '@/lib/public-snapshots/runtime';
import {
  RANKING_TRADE_STATS_ARTIFACT_NAME,
  assertRankingTradeStatsEnvelope,
  findRankingTradeStatsVariant,
} from '@/lib/public-snapshots/ranking-artifact';
import {
  TRANSACTION_SNAPSHOT_MAX_AGE_MS,
  isServingArtifactFresh,
} from '@/lib/public-snapshots/serving-artifacts';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const RONE_STAT_TABLE = 'A_2024_00045';

interface RoneRow {
  CLS_NM: string;
  CLS_FULLNM: string;
  DTA_VAL: string;
}

type ChangeEntry = { name: string; changeRate: number; direction: 'up' | 'down' | 'flat' };
type RankedEntry = ChangeEntry & { rank: number };

function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

function toPyeong(area: number): number {
  return Math.round(area / 3.3058);
}

function monthStr(offset: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchRoneRows(apiKey: string, month: string): Promise<RoneRow[]> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${RONE_STAT_TABLE}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`R-ONE HTTP ${response.status}`);
  const json = await response.json();
  return json?.SttsApiTblData?.[1]?.row || [];
}

function parseRegions(rows: RoneRow[]): Record<string, number> {
  const parsed: Record<string, number> = {};
  for (const row of rows) {
    const value = Number.parseFloat(row.DTA_VAL);
    if ((row.CLS_FULLNM || '').split('>').length === 1 && Number.isFinite(value)) {
      parsed[row.CLS_NM] = value;
    }
  }
  return parsed;
}

function parseSeoulDistricts(rows: RoneRow[]): Record<string, number> {
  const pathMap: Record<string, number> = {};
  for (const row of rows) {
    const fullPath = row.CLS_FULLNM || '';
    const value = Number.parseFloat(row.DTA_VAL);
    if (fullPath.startsWith('서울>') && Number.isFinite(value)) pathMap[fullPath] = value;
  }

  const paths = Object.keys(pathMap);
  const parsed: Record<string, number> = {};
  for (const path of paths) {
    const hasChild = paths.some((other) => other !== path && other.startsWith(`${path}>`));
    if (!hasChild) parsed[path.split('>').pop() || path] = pathMap[path];
  }
  return parsed;
}

function rankChanges(current: Record<string, number>, previous: Record<string, number>, limit?: number): RankedEntry[] {
  const changes: ChangeEntry[] = [];
  for (const [name, currentValue] of Object.entries(current)) {
    const previousValue = previous[name];
    if (!Number.isFinite(previousValue) || previousValue === 0) continue;
    const rate = ((currentValue - previousValue) / previousValue) * 100;
    changes.push({
      name,
      changeRate: +rate.toFixed(3),
      direction: rate > 0.01 ? 'up' : rate < -0.01 ? 'down' : 'flat',
    });
  }
  const sorted = changes.sort((a, b) => b.changeRate - a.changeRate);
  const selected = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  return selected
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

async function fetchPriceChange(apiKey: string): Promise<{
  period: string;
  regions: RankedEntry[];
  seoulDistricts: RankedEntry[];
} | null> {
  const months = [0, -1, -2, -3, -4].map(monthStr);
  const results = await Promise.allSettled(
    months.map((month) => fetchRoneRows(apiKey, month)),
  );

  for (let index = 0; index < results.length - 1; index += 1) {
    const current = results[index];
    const previous = results[index + 1];
    if (
      current.status !== 'fulfilled'
      || previous.status !== 'fulfilled'
      || current.value.length === 0
      || previous.value.length === 0
    ) continue;

    const allowedRegions = new Set([
      '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
    ]);
    const regions = rankChanges(parseRegions(current.value), parseRegions(previous.value))
      .filter((entry) => allowedRegions.has(entry.name))
      .map((entry, rank) => ({ ...entry, rank: rank + 1 }));
    const seoulDistricts = rankChanges(
      parseSeoulDistricts(current.value),
      parseSeoulDistricts(previous.value),
      10,
    );
    if (regions.length === 0 && seoulDistricts.length === 0) continue;
    return { period: months[index], regions, seoulDistricts };
  }

  return null;
}

function mapByRegion<T extends { regionCode: string }>(
  rows: T[],
  transform: (row: T) => Record<string, unknown>,
): Record<string, Record<string, unknown>[]> {
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    const regionName = RANKING_REGION_NAMES[row.regionCode];
    if (!regionName) continue;
    (grouped[regionName] ||= []).push(transform(row));
  }
  return grouped;
}

function mapTopPrice(rows: RankingTopPriceRow[]) {
  return mapByRegion(rows, (row) => ({
    rank: Number(row.rank),
    aptName: row.aptName,
    district: row.district,
    dong: row.dong,
    price: Number(row.price),
    priceFormatted: formatPrice(Number(row.price)),
    area: Number(row.area),
    pyeong: toPyeong(Number(row.area)),
    floor: Number(row.floor ?? 0),
    dealDate: row.dealDate,
  }));
}

function mapVolume(rows: RankingVolumeRow[]) {
  return mapByRegion(rows, (row) => ({
    rank: Number(row.rank),
    aptName: row.aptName,
    district: row.district,
    dong: row.dong,
    count: Number(row.count),
    avgPrice: Number(row.avgPrice),
    avgPriceFormatted: formatPrice(Number(row.avgPrice)),
  }));
}

function mapNewHigh(rows: RankingNewHighRow[]) {
  return mapByRegion(rows, (row) => ({
    rank: Number(row.rank),
    aptName: row.aptName,
    district: row.district,
    dong: row.dong,
    price: Number(row.price),
    prevHigh: Number(row.prevHigh),
    diffPercent: Number(row.diffPercent),
    diffFormatted: `+${formatPrice(Number(row.diff))}`,
  }));
}

export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get('period') || '3';
  const areaParam = request.nextUrl.searchParams.get('area') || 'all';
  if (!['3', '12'].includes(periodParam)) {
    return NextResponse.json({ error: '조회 기간은 3개월 또는 12개월만 지원합니다.' }, { status: 400 });
  }
  if (!['all', '59', '84', 'large'].includes(areaParam)) {
    return NextResponse.json({ error: '지원하지 않는 면적 구분입니다.' }, { status: 400 });
  }

  const periodMonths = Number(periodParam) as 3 | 12;
  const area = areaParam as RankingArea;
  const requestedWindow = rankingWindow(periodMonths);

  try {
    let tradeStats: RankingTradeStats | undefined;
    let servedWindow = requestedWindow;
    let updatedAt = new Date().toISOString();
    let snapshotHeaders: Record<string, string> = {};
    const snapshot = await createPublicSnapshotRuntimeFromEnv()
      .getNamedArtifact(RANKING_TRADE_STATS_ARTIFACT_NAME);
    if (snapshot.status === 'success') {
      try {
        assertRankingTradeStatsEnvelope(snapshot.data);
        const variant = findRankingTradeStatsVariant(snapshot.data.data, periodMonths, area);
        if (variant
          && variant.window.toExclusive <= requestedWindow.toExclusive
          && isServingArtifactFresh(snapshot.data.generatedAt, {
            maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
          })) {
          tradeStats = variant;
          servedWindow = variant.window;
          updatedAt = snapshot.data.generatedAt;
          snapshotHeaders = {
            'X-Naezip-Data-Source': 'snapshot',
            'X-Naezip-Snapshot-Generated-At': snapshot.data.generatedAt,
          };
        }
      } catch {
        // Invalid ranking artifacts are unavailable, never authoritative.
      }
    }

    if (!tradeStats) {
      if (isPublicSnapshotConfigured()) {
        return NextResponse.json(
          { status: 'degraded', error: '랭킹 데이터를 잠시 불러올 수 없습니다.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      tradeStats = await fetchRankingTradeStats(
        requestedWindow.from,
        requestedWindow.toExclusive,
        area,
      );
    }
    const roneKey = process.env.REALESTATE_STAT_API_KEY;
    const priceChange = roneKey
      ? await fetchPriceChange(roneKey).catch(() => null)
      : null;
    const partial = priceChange === null;

    return NextResponse.json({
      status: partial ? 'partial' : 'ok',
      note: partial ? '한국부동산원 월간 상승률을 잠시 불러오지 못했습니다.' : undefined,
      period: periodMonths === 3 ? '최근 3개월' : '최근 1년',
      area,
      updatedAt,
      coverage: {
        source: '국토교통부 공개자료를 적재한 내집 실거래 원장',
        districtCount: Number(tradeStats.coverage.districtCount),
        transactionCount: Number(tradeStats.coverage.transactionCount),
        from: servedWindow.from,
        toExclusive: servedWindow.toExclusive,
        firstDealDate: tradeStats.coverage.firstDealDate,
        lastDealDate: tradeStats.coverage.lastDealDate,
        label: `${RANKING_TOTAL_LABEL} · ${Number(tradeStats.coverage.districtCount)}개 시군구`,
        canceledExcluded: true,
      },
      topPrice: mapTopPrice(tradeStats.topPrice),
      volume: mapVolume(tradeStats.volume),
      newHigh: mapNewHigh(tradeStats.newHigh),
      priceChange: priceChange ?? { period: null, regions: [], seoulDistricts: [] },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600',
        ...snapshotHeaders,
      },
    });
  } catch (error) {
    console.error('[ranking API]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { status: 'degraded', error: '랭킹 데이터를 잠시 불러올 수 없습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import type { PriceChangeData, RegionChange, TradeType } from '@/types/price-map';
import {
  PRICE_CHANGE_FREQUENCY,
  isRecentPricePeriod,
  officialSummaryFromChangeRows,
  parsePriceChangeFrequency,
  parsePriceChangeTradeType,
  pricePeriodKey,
} from '@/lib/price-map-contract';
import { kstCurrentYyyymm } from '@/lib/agg-window';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STAT_TABLES = { sale: 'A_2024_00045', rent: 'A_2024_00050' };

const REGION_MAP: Record<string, string> = {
  '전국': '00', '수도권': 'S0', '지방권': 'L0',
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '42', '충북': '43', '충남': '44',
  '전북': '45', '전남': '46', '경북': '47', '경남': '48', '제주': '50',
};

interface RoneRow {
  CLS_NM: string;
  CLS_FULLNM: string;
  ITM_NM: string;
  DTA_VAL: string;
}

async function fetchRoneIndex(apiKey: string, statblId: string, month: string): Promise<Record<string, number>> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${statblId}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=300`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`R-ONE API ${res.status}`);
  const data = await res.json();
  const rows: RoneRow[] = data?.SttsApiTblData?.[1]?.row || [];
  const result: Record<string, number> = {};
  for (const r of rows) {
    if ((r.CLS_FULLNM || '').split('>').length === 1) {
      result[r.CLS_NM] = parseFloat(r.DTA_VAL);
    }
  }
  return result;
}

function getMonthStr(offset: number): string {
  const current = kstCurrentYyyymm();
  const d = new Date(Date.UTC(
    Number(current.slice(0, 4)),
    Number(current.slice(4, 6)) - 1 + offset,
    1,
  ));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function officialSummaryFromIndexes(
  current: Record<string, number>,
  previous: Record<string, number>,
): PriceChangeData['summary'] | null {
  const change = (name: '전국' | '수도권' | '지방권') => {
    const currentValue = current[name];
    const previousValue = previous[name];
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
    return +(((currentValue - previousValue) / previousValue) * 100).toFixed(3);
  };
  const nationwide = change('전국');
  const capitalArea = change('수도권');
  const nonCapital = change('지방권');
  if (nationwide === null || capitalArea === null || nonCapital === null) return null;
  return { nationwide, capital_area: capitalArea, non_capital: nonCapital };
}

// SQLite fallback 시도
async function tryDbData(tradeType: TradeType): Promise<PriceChangeData | null> {
  try {
    // 동적 import — better-sqlite3 를 못 쓰는 환경에서는 catch 로 fallback
    const { default: Database } = await import('better-sqlite3');
    const dbPath = path.join(process.cwd(), 'data', 'realestate.db');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT region_code, region_name, period_label, change_rate FROM price_changes WHERE period_type='monthly' AND trade_type=?`
    ).all(tradeType) as {
      region_code: string;
      region_name: string;
      period_label: string;
      change_rate: number;
    }[];
    db.close();
    if (rows.length === 0) return null;

    const latestKey = Math.max(...rows.map((row) => pricePeriodKey(row.period_label) ?? -Infinity));
    if (!Number.isFinite(latestKey)) return null;
    const latestRows = rows.filter((row) => pricePeriodKey(row.period_label) === latestKey);
    const latestPeriod = latestRows[0]?.period_label;
    if (!latestPeriod || !isRecentPricePeriod(latestPeriod)) return null;
    const summary = officialSummaryFromChangeRows(latestRows);
    if (!summary) return null;

    const regions: RegionChange[] = latestRows
      .filter((r) => !['00', 'S0', 'L0'].includes(r.region_code))
      .map((r) => ({
        code: r.region_code,
        name: r.region_name,
        change_rate: r.change_rate,
        direction: (r.change_rate > 0.01 ? 'up' : r.change_rate < -0.01 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
      }));

    return {
      period: latestPeriod,
      frequency: PRICE_CHANGE_FREQUENCY,
      type: tradeType,
      summary,
      regions,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const frequency = parsePriceChangeFrequency(searchParams.get('period'));
    if (!frequency) {
      return NextResponse.json(
        {
          error: '지원하지 않는 집계 주기입니다. 현재 월간 데이터만 제공합니다.',
          code: 'UNSUPPORTED_FREQUENCY',
          supportedFrequencies: [PRICE_CHANGE_FREQUENCY],
        },
        { status: 400 },
      );
    }
    const type = parsePriceChangeTradeType(searchParams.get('type'));
    if (!type) {
      return NextResponse.json({ error: '지원하지 않는 거래 유형입니다.' }, { status: 400 });
    }

    // 1) SQLite 시도
    const dbData = await tryDbData(type);
    if (dbData) {
      return NextResponse.json(dbData, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600' },
      });
    }

    // 2) R-ONE API 직접 호출
    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) {
      console.error('[price-change API] REALESTATE_STAT_API_KEY 미설정');
      return NextResponse.json({ error: '시세 변동 데이터를 불러올 수 없습니다' }, { status: 500 });
    }

    const statblId = STAT_TABLES[type] || STAT_TABLES.sale;

    // 최신 데이터 찾기: 당월 → 전월 → 전전월 → 3개월전 순으로 fallback
    let thisData: Record<string, number> = {};
    let lastData: Record<string, number> = {};
    let usedMonth = '';

    // 병렬로 최근 4개월 호출
    const months = [getMonthStr(0), getMonthStr(-1), getMonthStr(-2), getMonthStr(-3)];
    const fetched = await Promise.allSettled(
      months.map((m) => fetchRoneIndex(apiKey, statblId, m)),
    );

    // 실패·미공개 월을 건너뛰되, 월을 건너뛴 증감률은 만들지 않는다.
    for (let i = 0; i < fetched.length - 1; i++) {
      const current = fetched[i];
      const previous = fetched[i + 1];
      if (
        current.status === 'fulfilled'
        && previous.status === 'fulfilled'
        && Object.keys(current.value).length > 0
        && Object.keys(previous.value).length > 0
      ) {
        thisData = current.value;
        lastData = previous.value;
        usedMonth = months[i];
        break;
      }
    }

    if (!usedMonth) {
      return NextResponse.json(
        { error: '비교 가능한 월간 지수 데이터가 없습니다.', frequency },
        { status: 503 },
      );
    }

    const regions: RegionChange[] = [];
    for (const [name, code] of Object.entries(REGION_MAP)) {
      if (['00', 'S0', 'L0'].includes(code)) continue;
      if (thisData[name] != null && lastData[name] != null) {
        const change = ((thisData[name] - lastData[name]) / lastData[name]) * 100;
        regions.push({
          code,
          name,
          change_rate: +change.toFixed(3),
          direction: change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat',
        });
      }
    }

    const summary = officialSummaryFromIndexes(thisData, lastData);
    if (!summary) {
      return NextResponse.json(
        { error: '전국·수도권·지방권 공식 집계행을 확인할 수 없습니다.', frequency },
        { status: 503 },
      );
    }

    const periodLabel = usedMonth
      ? `${usedMonth.slice(0, 4)}년 ${parseInt(usedMonth.slice(4))}월 (부동산원)`
      : `${kstCurrentYyyymm().slice(0, 4)}년 ${Number(kstCurrentYyyymm().slice(4, 6))}월 (부동산원)`;

    const data: PriceChangeData = {
      period: periodLabel,
      frequency,
      type,
      summary,
      regions,
    };

    return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error: unknown) {
    console.error('[price-change API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '시세 변동 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import type { PriceChangeData, RegionChange } from '@/types/price-map';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STAT_TABLES = { sale: 'A_2024_00045', rent: 'A_2024_00050' };

const REGION_MAP: Record<string, string> = {
  '전국': '00', '수도권': 'S0', '지방권': 'L0',
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '42', '충북': '43', '충남': '44',
  '전북': '45', '전남': '46', '경북': '47', '경남': '48', '제주': '50',
};

const CAPITAL_CODES = ['11', '28', '41'];

interface RoneRow {
  CLS_NM: string;
  CLS_FULLNM: string;
  ITM_NM: string;
  DTA_VAL: string;
}

async function fetchRoneIndex(apiKey: string, statblId: string, month: string): Promise<Record<string, number>> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${statblId}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=300`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
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
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// SQLite fallback 시도
function tryDbData(tradeType: string): PriceChangeData | null {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'realestate.db');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT region_code, region_name, change_rate FROM price_changes WHERE period_type='monthly' AND trade_type=?`
    ).all(tradeType) as { region_code: string; region_name: string; change_rate: number }[];
    db.close();
    if (rows.length === 0) return null;

    const regions: RegionChange[] = rows
      .filter((r) => !['00', 'S0', 'L0'].includes(r.region_code))
      .map((r) => ({
        code: r.region_code,
        name: r.region_name,
        change_rate: r.change_rate,
        direction: (r.change_rate > 0.01 ? 'up' : r.change_rate < -0.01 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
      }));

    const capitalRegions = regions.filter((r) => CAPITAL_CODES.includes(r.code));
    const nonCapitalRegions = regions.filter((r) => !CAPITAL_CODES.includes(r.code));
    const avg = (arr: RegionChange[]) => arr.length > 0 ? +(arr.reduce((s, r) => s + r.change_rate, 0) / arr.length).toFixed(2) : 0;

    return {
      period: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 (부동산원)`,
      type: tradeType as 'sale' | 'rent',
      summary: { nationwide: avg(regions), capital_area: avg(capitalRegions), non_capital: avg(nonCapitalRegions) },
      regions,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = (searchParams.get('type') || 'sale') as 'sale' | 'rent';

    // 1) SQLite 시도
    const dbData = tryDbData(type);
    if (dbData) return NextResponse.json(dbData);

    // 2) R-ONE API 직접 호출
    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) {
      console.error('[price-change API] REALESTATE_STAT_API_KEY 미설정');
      return NextResponse.json({ error: '시세 변동 데이터를 불러올 수 없습니다' }, { status: 500 });
    }

    const statblId = STAT_TABLES[type] || STAT_TABLES.sale;

    // 최신 데이터 찾기: 이번달 → 지난달 → 2달전 순으로 시도
    let thisData: Record<string, number> = {};
    let lastData: Record<string, number> = {};

    // 병렬로 최근 3개월 시도 (하나라도 데이터 있으면 사용)
    const [m0, m1, m2] = await Promise.all([
      fetchRoneIndex(apiKey, statblId, getMonthStr(-1)),
      fetchRoneIndex(apiKey, statblId, getMonthStr(-2)),
      fetchRoneIndex(apiKey, statblId, getMonthStr(0)),
    ]);
    if (Object.keys(m2).length > 0) { thisData = m2; lastData = m0; }
    else if (Object.keys(m0).length > 0) { thisData = m0; lastData = m1; }
    else { thisData = m1; lastData = {}; }

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

    const capitalRegions = regions.filter((r) => CAPITAL_CODES.includes(r.code));
    const nonCapitalRegions = regions.filter((r) => !CAPITAL_CODES.includes(r.code));
    const avg = (arr: RegionChange[]) => arr.length > 0 ? +(arr.reduce((s, r) => s + r.change_rate, 0) / arr.length).toFixed(2) : 0;

    const data: PriceChangeData = {
      period: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 (부동산원)`,
      type,
      summary: { nationwide: avg(regions), capital_area: avg(capitalRegions), non_capital: avg(nonCapitalRegions) },
      regions,
    };

    return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error: unknown) {
    console.error('[price-change API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '시세 변동 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

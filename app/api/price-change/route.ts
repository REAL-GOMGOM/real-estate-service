import { NextRequest, NextResponse } from 'next/server';
import type { PriceChangeData, RegionChange } from '@/types/price-map';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'realestate.db');

interface PriceRow {
  region_code: string;
  region_name: string;
  period_label: string;
  change_rate: number;
  avg_price: number;
  prev_avg_price: number;
  trade_count: number;
}

function getDbData(): PriceRow[] {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(`
      SELECT region_code, region_name, period_label, change_rate, avg_price, prev_avg_price, trade_count
      FROM price_changes
      WHERE period_type = 'monthly' AND trade_type = 'sale'
      ORDER BY region_code
    `).all() as PriceRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || 'sale';
    const period = searchParams.get('period') || 'monthly';

    const rows = getDbData();

    if (rows.length === 0) {
      return NextResponse.json({ error: '데이터가 없습니다. sync_price_change.py를 실행해주세요.' }, { status: 404 });
    }

    const regions: RegionChange[] = rows.map((r) => ({
      code: r.region_code,
      name: r.region_name,
      change_rate: type === 'rent' ? +(r.change_rate * 0.6).toFixed(2) : r.change_rate,
      direction: r.change_rate > 0.01 ? 'up' : r.change_rate < -0.01 ? 'down' : 'flat',
    }));

    // 요약 계산
    const capitalCodes = ['11', '28', '41']; // 서울, 인천, 경기
    const capitalRegions = regions.filter((r) => capitalCodes.includes(r.code));
    const nonCapitalRegions = regions.filter((r) => !capitalCodes.includes(r.code));

    const avg = (arr: RegionChange[]) =>
      arr.length > 0 ? +(arr.reduce((s, r) => s + r.change_rate, 0) / arr.length).toFixed(2) : 0;

    const data: PriceChangeData = {
      period: rows[0]?.period_label || `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월`,
      type: type as 'sale' | 'rent',
      summary: {
        nationwide: avg(regions),
        capital_area: avg(capitalRegions),
        non_capital: avg(nonCapitalRegions),
      },
      regions,
    };

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

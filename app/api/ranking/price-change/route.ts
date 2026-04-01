import { NextResponse } from 'next/server';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STATBL_ID = 'A_2024_00045'; // 매매가격지수_아파트

interface RoneRow {
  CLS_NM: string;
  CLS_FULLNM: string;
  DTA_VAL: string;
}

function getMonthStr(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodLabel(): string {
  const d = new Date();
  const weekNum = Math.ceil(d.getDate() / 7);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${weekNum}주`;
}

async function fetchRoneIndex(apiKey: string, month: string): Promise<Record<string, number>> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
  const data = await res.json();
  const rows: RoneRow[] = data?.SttsApiTblData?.[1]?.row || [];
  const result: Record<string, number> = {};
  for (const r of rows) {
    const fullPath = r.CLS_FULLNM || '';
    // 서울 하위 구 단위만 (서울>강남구 형태)
    if (fullPath.startsWith('서울>')) {
      const parts = fullPath.split('>');
      // 최하위(구 단위)만 — 자식이 없는 것 판별은 어려우므로 2depth만
      if (parts.length === 2) {
        result[parts[1]] = parseFloat(r.DTA_VAL);
      }
    }
  }
  return result;
}

export async function GET() {
  const apiKey = process.env.REALESTATE_STAT_API_KEY;
  if (!apiKey) {
    console.error('[ranking/price-change API] REALESTATE_STAT_API_KEY 미설정');
    return NextResponse.json({ period: '', type: 'sale', data: [] }, { status: 500 });
  }

  try {
    // 최근 2개월 비교 (이번달 데이터 없을 수 있으므로 -1, -2 시도)
    let thisData: Record<string, number> = {};
    let lastData: Record<string, number> = {};

    const [m0, m1, m2] = await Promise.all([
      fetchRoneIndex(apiKey, getMonthStr(-1)),
      fetchRoneIndex(apiKey, getMonthStr(-2)),
      fetchRoneIndex(apiKey, getMonthStr(0)),
    ]);

    if (Object.keys(m2).length > 0) { thisData = m2; lastData = m0; }
    else if (Object.keys(m0).length > 0) { thisData = m0; lastData = m1; }
    else { thisData = m1; lastData = {}; }

    const entries: { name: string; changeRate: number; direction: 'up' | 'down' | 'flat' }[] = [];

    for (const [district, thisVal] of Object.entries(thisData)) {
      const lastVal = lastData[district];
      if (lastVal == null) continue;
      const change = ((thisVal - lastVal) / lastVal) * 100;
      entries.push({
        name: district,
        changeRate: +change.toFixed(3),
        direction: change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat',
      });
    }

    const sorted = entries
      .sort((a, b) => b.changeRate - a.changeRate)
      .slice(0, 10)
      .map((e, i) => ({ rank: i + 1, ...e }));

    return NextResponse.json(
      { period: getPeriodLabel(), type: 'sale', data: sorted },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error('[ranking/price-change API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ period: '', type: 'sale', data: [] }, { status: 500 });
  }
}

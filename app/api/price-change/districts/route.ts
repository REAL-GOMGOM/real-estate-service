import { NextRequest, NextResponse } from 'next/server';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STAT_TABLES = { sale: 'A_2024_00045', rent: 'A_2024_00050' };

// 시도 이름 매핑
const PROVINCE_NAMES: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주',
  '30': '대전', '31': '울산', '36': '세종', '41': '경기', '42': '강원',
  '43': '충북', '44': '충남', '45': '전북', '46': '전남', '47': '경북',
  '48': '경남', '50': '제주',
};

interface DistrictChange {
  name: string;
  fullPath: string;
  change_rate: number;
  direction: 'up' | 'down' | 'flat';
  index_value: number;
}

function getMonthStr(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchRoneAll(apiKey: string, statblId: string, month: string) {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${statblId}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
  const data = await res.json();
  return data?.SttsApiTblData?.[1]?.row || [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const provinceCode = searchParams.get('province') || '11';
    const type = (searchParams.get('type') || 'sale') as 'sale' | 'rent';

    const provinceName = PROVINCE_NAMES[provinceCode];
    if (!provinceName) {
      return NextResponse.json({ error: '유효하지 않은 시도 코드' }, { status: 400 });
    }

    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) {
      console.error('[price-change/districts API] REALESTATE_STAT_API_KEY 미설정');
      return NextResponse.json({ error: '구별 시세 데이터를 불러올 수 없습니다' }, { status: 500 });
    }

    const statblId = STAT_TABLES[type] || STAT_TABLES.sale;

    // 최신 데이터 찾기 (당월 → 전월 → 전전월 → 3개월전 fallback)
    let thisRows: any[] = [];
    let lastRows: any[] = [];
    for (let offset = 0; offset >= -4; offset--) {
      const rows = await fetchRoneAll(apiKey, statblId, getMonthStr(offset));
      if (rows.length > 0) {
        thisRows = rows;
        lastRows = await fetchRoneAll(apiKey, statblId, getMonthStr(offset - 1));
        break;
      }
    }

    // 해당 시도의 구 단위 필터
    const thisMap: Record<string, number> = {};
    const lastMap: Record<string, number> = {};

    for (const r of thisRows) {
      const full = r.CLS_FULLNM || '';
      if (full.startsWith(provinceName + '>')) {
        thisMap[full] = parseFloat(r.DTA_VAL);
      }
    }
    for (const r of lastRows) {
      const full = r.CLS_FULLNM || '';
      if (full.startsWith(provinceName + '>')) {
        lastMap[full] = parseFloat(r.DTA_VAL);
      }
    }

    // 최하위 구 단위만 추출 (자식이 없는 노드)
    const allPaths = Object.keys(thisMap);
    const leafPaths = allPaths.filter((path) => {
      return !allPaths.some((other) => other !== path && other.startsWith(path + '>'));
    });

    const districts: DistrictChange[] = leafPaths.map((path) => {
      const thisVal = thisMap[path];
      const lastVal = lastMap[path];
      const change = lastVal ? ((thisVal - lastVal) / lastVal) * 100 : 0;
      const name = path.split('>').pop() || path;

      return {
        name,
        fullPath: path,
        change_rate: +change.toFixed(3),
        direction: (change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        index_value: +thisVal.toFixed(2),
      };
    }).sort((a, b) => b.change_rate - a.change_rate);

    return NextResponse.json({
      province: provinceName,
      provinceCode,
      type,
      districts,
    });
  } catch (error: unknown) {
    console.error('[price-change/districts API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '구별 시세 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

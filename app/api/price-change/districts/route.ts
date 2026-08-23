import { NextRequest, NextResponse } from 'next/server';
import {
  PRICE_CHANGE_FREQUENCY,
  parsePriceChangeFrequency,
  parsePriceChangeTradeType,
} from '@/lib/price-map-contract';
import { kstCurrentYyyymm } from '@/lib/agg-window';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STAT_TABLES = { sale: 'A_2024_00045', rent: 'A_2024_00050' };

// 시도 이름 매핑
const PROVINCE_NAMES: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주',
  '30': '대전', '31': '울산', '36': '세종', '41': '경기', '42': '강원',
  '43': '충북', '44': '충남', '45': '전북', '46': '전남', '47': '경북',
  '48': '경남', '50': '제주',
};

// R-ONE 통계 응답 행 (사용 필드만)
interface RoneRow {
  CLS_FULLNM: string;
  DTA_VAL: string;
}

interface DistrictChange {
  name: string;
  fullPath: string;
  change_rate: number;
  direction: 'up' | 'down' | 'flat';
  index_value: number;
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

async function fetchRoneAll(apiKey: string, statblId: string, month: string): Promise<RoneRow[]> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${statblId}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`R-ONE API ${res.status}`);
  const data = await res.json();
  return data?.SttsApiTblData?.[1]?.row || [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const provinceCode = searchParams.get('province') || '11';
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

    // 최신 데이터 찾기. 한 달의 장애가 다른 월까지 무효화하지 않게 독립 조회한다.
    let thisRows: RoneRow[] = [];
    let lastRows: RoneRow[] = [];
    let usedMonth = '';
    const months = [0, -1, -2, -3, -4, -5].map(getMonthStr);
    const fetched = await Promise.allSettled(
      months.map((month) => fetchRoneAll(apiKey, statblId, month)),
    );
    for (let i = 0; i < fetched.length - 1; i += 1) {
      const current = fetched[i];
      const previous = fetched[i + 1];
      if (
        current.status === 'fulfilled'
        && previous.status === 'fulfilled'
        && current.value.length > 0
        && previous.value.length > 0
      ) {
        thisRows = current.value;
        lastRows = previous.value;
        usedMonth = months[i];
        break;
      }
    }

    if (thisRows.length === 0 || lastRows.length === 0) {
      return NextResponse.json(
        { error: '비교 가능한 월간 구별 지수 데이터가 없습니다.', frequency },
        { status: 503 },
      );
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

    const districts: DistrictChange[] = leafPaths.flatMap((path) => {
      const thisVal = thisMap[path];
      const lastVal = lastMap[path];
      if (!Number.isFinite(thisVal) || !Number.isFinite(lastVal) || lastVal === 0) return [];
      const change = ((thisVal - lastVal) / lastVal) * 100;
      const name = path.split('>').pop() || path;

      return [{
        name,
        fullPath: path,
        change_rate: +change.toFixed(3),
        direction: (change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        index_value: +thisVal.toFixed(2),
      }];
    }).sort((a, b) => b.change_rate - a.change_rate);

    return NextResponse.json({
      province: provinceName,
      provinceCode,
      type,
      frequency,
      period: `${usedMonth.slice(0, 4)}년 ${Number(usedMonth.slice(4))}월`,
      districts,
    });
  } catch (error: unknown) {
    console.error('[price-change/districts API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '구별 시세 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

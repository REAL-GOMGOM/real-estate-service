import { NextRequest, NextResponse } from 'next/server';
import type { PriceTrendData, TrendPeriod } from '@/types/price-trend';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STATBL_ID = 'A_2024_00045'; // 매매가격지수_아파트

const REGION_NAMES = [
  '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

async function fetchRoneMonth(apiKey: string, month: string): Promise<Record<string, number>> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=300`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
    const data = await res.json();
    const rows = data?.SttsApiTblData?.[1]?.row || [];
    const result: Record<string, number> = {};
    for (const r of rows) {
      if ((r.CLS_FULLNM || '').split('>').length === 1) {
        result[r.CLS_NM] = parseFloat(r.DTA_VAL);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function getMonthStr(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

function generateMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  // 현재월은 데이터 없을 수 있으므로 전월부터
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.unshift(getMonthStr(d.getFullYear(), d.getMonth() + 1));
  }
  return months;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const period = (searchParams.get('period') || 'weekly') as TrendPeriod;
    const regionParam = searchParams.get('region');
    const regions = regionParam
      ? regionParam.split(',').filter((r) => REGION_NAMES.includes(r))
      : ['서울', '경기', '인천'];

    if (regions.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 지역' }, { status: 400 });
    }

    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) {
      // fallback: 더미 데이터
      return NextResponse.json(generateDummy(period, regions));
    }

    // R-ONE API로 시계열 생성
    let monthCount: number;
    switch (period) {
      case 'daily': monthCount = 6; break;
      case 'weekly': monthCount = 6; break;
      case 'quarterly': monthCount = 12; break;
      case 'half_yearly': monthCount = 18; break;
      case 'yearly': monthCount = 24; break;
      default: monthCount = 6;
    }

    const months = generateMonths(monthCount);
    const dataPoints: PriceTrendData['data'] = [];

    // 기준월(첫 번째) 지수 저장
    let baseIndex: Record<string, number> = {};

    for (const month of months) {
      const indexData = await fetchRoneMonth(apiKey, month);
      if (Object.keys(indexData).length === 0) continue;

      if (Object.keys(baseIndex).length === 0) {
        baseIndex = { ...indexData };
      }

      const regionData: Record<string, number> = {};
      for (const r of regions) {
        if (indexData[r] != null && baseIndex[r] != null) {
          // 기준월 대비 변동률 (%)
          regionData[r] = +((indexData[r] - baseIndex[r]) / baseIndex[r] * 100).toFixed(3);
        }
      }

      const label = `${month.slice(0, 4)}.${month.slice(4)}`;
      dataPoints.push({ date: label, regions: regionData });
    }

    if (dataPoints.length === 0) {
      return NextResponse.json(generateDummy(period, regions));
    }

    return NextResponse.json({ period, data: dataPoints });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 더미 데이터 fallback
function generateDummy(period: TrendPeriod, regions: string[]): PriceTrendData {
  const points: PriceTrendData['data'] = [];
  const count = 12;
  const seeds: Record<string, number> = {
    '서울': 0.15, '경기': 0.10, '인천': 0.08, '부산': 0.02,
    '대구': -0.05, '대전': 0.04, '광주': -0.02, '울산': -0.08,
    '세종': -0.12, '강원': 0.01, '충북': 0.03, '충남': -0.01,
    '전북': 0.02, '전남': -0.03, '경북': -0.04, '경남': -0.06, '제주': -0.10,
  };
  for (let i = 0; i < count; i++) {
    const regionData: Record<string, number> = {};
    for (const r of regions) {
      const base = seeds[r] ?? 0;
      const noise = Math.sin(i * 0.7 + (r.charCodeAt(0) * 0.1)) * 0.05;
      regionData[r] = +(base + noise * (i / count)).toFixed(3);
    }
    const d = new Date();
    d.setMonth(d.getMonth() - (count - i));
    points.push({ date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`, regions: regionData });
  }
  return { period, data: points };
}

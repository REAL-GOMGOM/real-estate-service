import { NextRequest, NextResponse } from 'next/server';
import type { PriceTrendData, TrendPeriod } from '@/types/price-trend';
import { kstCurrentYyyymm } from '@/lib/agg-window';

const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const STATBL_ID = 'A_2024_00045'; // 매매가격지수_아파트

const REGION_NAMES = [
  '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

async function fetchRoneMonth(apiKey: string, month: string): Promise<Record<string, number>> {
  const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=300`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`R-ONE HTTP ${res.status}`);
  const data = await res.json();
  const rows = data?.SttsApiTblData?.[1]?.row || [];
  const result: Record<string, number> = {};
  for (const r of rows) {
    if ((r.CLS_FULLNM || '').split('>').length === 1) {
      const value = Number.parseFloat(r.DTA_VAL);
      if (typeof r.CLS_NM === 'string' && Number.isFinite(value)) {
        result[r.CLS_NM] = value;
      }
    }
  }
  return result;
}

function getMonthStr(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

function generateMonths(count: number): string[] {
  const months: string[] = [];
  const current = kstCurrentYyyymm();
  const currentYear = Number(current.slice(0, 4));
  const currentMonth = Number(current.slice(4, 6));
  // 현재월은 데이터 없을 수 있으므로 전월부터
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    months.unshift(getMonthStr(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return months;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const periodParam = searchParams.get('period') || 'six_months';
    const allowedPeriods: TrendPeriod[] = ['six_months', 'one_year', 'eighteen_months', 'two_years'];
    if (!allowedPeriods.includes(periodParam as TrendPeriod)) {
      return NextResponse.json({ error: '유효하지 않은 조회 기간' }, { status: 400 });
    }
    const period = periodParam as TrendPeriod;
    const regionParam = searchParams.get('region');
    const regions = regionParam
      ? regionParam.split(',').filter((r) => REGION_NAMES.includes(r))
      : ['서울', '경기', '인천'];

    if (regions.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 지역' }, { status: 400 });
    }

    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { status: 'degraded', error: '가격지수 데이터 연결이 설정되지 않았습니다' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const monthCount: Record<TrendPeriod, number> = {
      six_months: 6,
      one_year: 12,
      eighteen_months: 18,
      two_years: 24,
    };

    const months = generateMonths(monthCount[period]);
    const dataPoints: PriceTrendData['data'] = [];

    // 기준월(첫 번째) 지수 저장
    let baseIndex: Record<string, number> = {};

    // 월별 응답은 독립적이므로 병렬 조회한다. 일부 월 장애는 제외하되 전부 실패하면 502.
    const monthlyResults = await Promise.allSettled(
      months.map((month) => fetchRoneMonth(apiKey, month)),
    );
    if (monthlyResults.every((result) => result.status === 'rejected')) {
      return NextResponse.json(
        { status: 'degraded', error: '한국부동산원 가격지수 응답을 받지 못했습니다' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    for (let i = 0; i < months.length; i += 1) {
      const result = monthlyResults[i];
      if (result.status === 'rejected') continue;
      const month = months[i];
      const indexData = result.value;
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
      if (Object.keys(regionData).length === 0) continue;

      const label = `${month.slice(0, 4)}.${month.slice(4)}`;
      dataPoints.push({ date: label, regions: regionData });
    }

    if (dataPoints.length < 2) {
      return NextResponse.json(
        { status: 'empty', period, frequency: 'monthly', data: [] },
        { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
      );
    }

    const unavailableMonths = months.length - dataPoints.length;
    const responseStatus: PriceTrendData['status'] = unavailableMonths > 0 ? 'partial' : 'ok';

    return NextResponse.json(
      {
        status: responseStatus,
        period,
        frequency: 'monthly',
        metric: 'change_from_first_month_pct',
        source: '한국부동산원 R-ONE',
        coverage: {
          requestedMonths: months.length,
          returnedMonths: dataPoints.length,
          unavailableMonths,
          firstMonth: dataPoints[0].date,
          lastMonth: dataPoints[dataPoints.length - 1].date,
        },
        data: dataPoints,
      } satisfies PriceTrendData,
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600' } },
    );
  } catch (error: unknown) {
    console.error('[price-trend API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '시세 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

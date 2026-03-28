import { NextRequest, NextResponse } from 'next/server';
import type { PriceTrendData, TrendPeriod } from '@/types/price-trend';

/**
 * GET /api/price-trend?period=weekly&region=서울,경기
 *
 * 현재는 더미 시계열 데이터 반환.
 * 향후 한국부동산원 API 연동 예정.
 */

function generateDummy(period: TrendPeriod, regions: string[]): PriceTrendData {
  const points: PriceTrendData['data'] = [];
  let count: number;
  let labelFn: (i: number) => string;

  switch (period) {
    case 'daily':
      count = 30;
      labelFn = (i) => {
        const d = new Date(2026, 2, 28);
        d.setDate(d.getDate() - (count - 1 - i));
        return `${d.getMonth() + 1}/${d.getDate()}`;
      };
      break;
    case 'weekly':
      count = 12;
      labelFn = (i) => `${Math.floor((i + 1) / 4) + 1}월 ${((i % 4) + 1)}주`;
      break;
    case 'quarterly':
      count = 8;
      labelFn = (i) => `${2024 + Math.floor(i / 4)}년 ${(i % 4) + 1}Q`;
      break;
    case 'half_yearly':
      count = 6;
      labelFn = (i) => `${2023 + Math.floor(i / 2)}년 ${(i % 2) + 1}H`;
      break;
    case 'yearly':
      count = 5;
      labelFn = (i) => `${2022 + i}년`;
      break;
    default:
      count = 12;
      labelFn = (i) => `W${i + 1}`;
  }

  // 시드 기반 결정론적 더미 생성
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
    points.push({ date: labelFn(i), regions: regionData });
  }

  return { period, data: points };
}

const ALL_REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const period = (searchParams.get('period') || 'weekly') as TrendPeriod;
    const regionParam = searchParams.get('region');

    const regions = regionParam
      ? regionParam.split(',').filter((r) => ALL_REGIONS.includes(r))
      : ['서울', '경기', '인천'];

    if (regions.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 지역' }, { status: 400 });
    }

    const data = generateDummy(period, regions);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

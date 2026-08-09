import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import {
  parseGapRentsXml,
  parseGapTradesXml,
  selectGapRows,
  type GapTradeRow,
} from '@/lib/gap-analysis-data';
import {
  fetchRentMonthAllPages,
  fetchTradeMonthAllPages,
  getMonthList,
  revalidateForMonth,
} from '@/lib/molit-months';
import type { GapResult, MonthlyPrice } from '@/types/gap-analysis';

interface ComplexTarget {
  district: string;
  name: string;
  dong?: string;
  size?: number;
}

interface SourceCoverage {
  requestedMonths: string[];
  successfulMonths: string[];
  failedMonths: string[];
}

interface LoadedRows<T> {
  rows: T[];
  coverage: SourceCoverage;
}

function validTarget(value: unknown): value is ComplexTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.district === 'string'
    && target.district.length > 0
    && target.district.length <= 20
    && typeof target.name === 'string'
    && target.name.trim().length >= 1
    && target.name.length <= 100
    && (target.dong === undefined || (typeof target.dong === 'string' && target.dong.length <= 30))
    && (
      target.size === undefined
      || (typeof target.size === 'number' && Number.isFinite(target.size) && target.size > 0 && target.size <= 500)
    )
  );
}

async function loadRows<T>(
  apiKey: string,
  lawdCd: string,
  months: string[],
  fetchMonth: (apiKey: string, lawdCd: string, month: string, revalidate: number) => Promise<string>,
  parse: (xml: string) => T[],
): Promise<LoadedRows<T>> {
  const settled = await Promise.allSettled(
    months.map(async (month) => ({
      month,
      rows: parse(await fetchMonth(apiKey, lawdCd, month, revalidateForMonth(month))),
    })),
  );

  const successfulMonths: string[] = [];
  const failedMonths: string[] = [];
  const rows: T[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulMonths.push(result.value.month);
      rows.push(...result.value.rows);
    } else {
      failedMonths.push(months[index]);
    }
  });

  return {
    rows,
    coverage: { requestedMonths: months, successfulMonths, failedMonths },
  };
}

function aggregateMonthly(trades: GapTradeRow[]): MonthlyPrice[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const trade of trades) {
    const current = map.get(trade.date) ?? { total: 0, count: 0 };
    current.total += trade.price;
    current.count += 1;
    map.set(trade.date, current);
  }
  return [...map.entries()]
    .map(([date, { total, count }]) => ({ date, avgPrice: Math.round(total / count), count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unavailableCoverage(coverage: SourceCoverage): boolean {
  return coverage.successfulMonths.length === 0;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ status: 'invalid_request', error: 'JSON 요청 본문을 확인해 주세요.' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ status: 'invalid_request', error: '요청 본문을 확인해 주세요.' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (!validTarget(input.complexA)) {
      return NextResponse.json({ status: 'invalid_request', error: '기준 단지와 지역을 다시 선택해 주세요.' }, { status: 400 });
    }
    if (input.complexB !== undefined && !validTarget(input.complexB)) {
      return NextResponse.json({ status: 'invalid_request', error: '비교 단지와 지역을 다시 선택해 주세요.' }, { status: 400 });
    }
    const complexA = input.complexA;
    const complexB = input.complexB as ComplexTarget | undefined;
    const rawPeriod = input.period ?? 6;
    if (!Number.isInteger(rawPeriod) || Number(rawPeriod) < 3 || Number(rawPeriod) > 12) {
      return NextResponse.json({ status: 'invalid_request', error: '조회 기간은 3~12개월이어야 합니다.' }, { status: 400 });
    }
    const period = Number(rawPeriod);

    const rawKey = process.env.PUBLIC_DATA_API_KEY;
    if (!rawKey) {
      console.error('[gap-analysis API] PUBLIC_DATA_API_KEY 미설정');
      return NextResponse.json(
        { status: 'unavailable', error: '국토교통부 실거래가 연결 설정이 없어 현재 분석할 수 없습니다.' },
        { status: 503 },
      );
    }

    const lawdA = DISTRICT_CODE[complexA.district];
    const lawdB = complexB ? DISTRICT_CODE[complexB.district] : undefined;
    if (!lawdA || (complexB && !lawdB)) {
      return NextResponse.json({ status: 'invalid_request', error: '지원하지 않는 지역입니다.' }, { status: 400 });
    }

    const monthList = getMonthList(period);
    const [saleAResult, rentAResult, saleBResult] = await Promise.all([
      loadRows(rawKey, lawdA, monthList, fetchTradeMonthAllPages, parseGapTradesXml),
      loadRows(rawKey, lawdA, monthList, fetchRentMonthAllPages, parseGapRentsXml),
      complexB && lawdB
        ? loadRows(rawKey, lawdB, monthList, fetchTradeMonthAllPages, parseGapTradesXml)
        : Promise.resolve(null),
    ]);

    if (unavailableCoverage(saleAResult.coverage)) {
      return NextResponse.json(
        { status: 'unavailable', error: '기준 단지의 국토교통부 매매 원본을 확인하지 못했습니다.' },
        { status: 502 },
      );
    }
    if (saleBResult && unavailableCoverage(saleBResult.coverage)) {
      return NextResponse.json(
        { status: 'unavailable', error: '비교 단지의 국토교통부 매매 원본을 확인하지 못했습니다.' },
        { status: 502 },
      );
    }

    const tradesA = selectGapRows(saleAResult.rows, complexA);
    const rentsA = selectGapRows(rentAResult.rows, complexA);
    const pricesA = aggregateMonthly(tradesA);
    if (pricesA.length === 0) {
      return NextResponse.json(
        {
          status: 'insufficient_data',
          error: `${period}개월 안에 선택한 동·전용면적과 일치하는 기준 단지 매매가 없습니다.`,
        },
        { status: 422 },
      );
    }

    let pricesB: MonthlyPrice[] = [];
    if (complexB && saleBResult) {
      pricesB = aggregateMonthly(selectGapRows(saleBResult.rows, complexB));
      if (pricesB.length === 0) {
        return NextResponse.json(
          {
            status: 'insufficient_data',
            error: `${period}개월 안에 선택한 동·전용면적과 일치하는 비교 단지 매매가 없습니다.`,
          },
          { status: 422 },
        );
      }
    }

    const latestA = pricesA.at(-1)?.avgPrice ?? null;
    const rentMonths = [...new Set(rentsA.map((row) => row.date))].sort().slice(-3);
    const recentRents = rentsA.filter((row) => rentMonths.includes(row.date));
    const avgRentA = recentRents.length > 0
      ? Math.round(average(recentRents.map((row) => row.deposit)))
      : null;

    const monthlyGap = complexB
      ? pricesA.flatMap((priceA) => {
          const priceB = pricesB.find((candidate) => candidate.date === priceA.date);
          return priceB ? [{ date: priceA.date, gap: priceA.avgPrice - priceB.avgPrice }] : [];
        })
      : pricesA.map((price) => ({ date: price.date, gap: price.avgPrice }));

    if (complexB && monthlyGap.length < 2) {
      return NextResponse.json(
        { status: 'insufficient_data', error: '두 단지의 공통 거래월이 2개월 미만이라 갭 추이를 비교할 수 없습니다.' },
        { status: 422 },
      );
    }

    let signal: GapResult['signal'] = 'insufficient';
    let zScore: number | null = null;
    let historicalAvgGap = 0;
    let currentGap = 0;
    let margin = 0;
    if (complexB) {
      const gaps = monthlyGap.map((row) => row.gap);
      const currentWindow = Math.min(3, Math.max(1, Math.floor(gaps.length / 2)));
      const baseline = gaps.slice(0, -currentWindow);
      const recent = gaps.slice(-currentWindow);
      historicalAvgGap = average(baseline);
      currentGap = average(recent);
      margin = currentGap - historicalAvgGap;
      if (baseline.length >= 3) {
        const variance = average(baseline.map((gap) => (gap - historicalAvgGap) ** 2));
        const standardDeviation = Math.sqrt(variance);
        if (standardDeviation > 0) {
          zScore = margin / standardDeviation;
          signal = zScore > 1 ? 'above_baseline' : zScore < -1 ? 'below_baseline' : 'near_baseline';
        }
      }
    }

    const warnings: string[] = [];
    const coverages = [saleAResult.coverage, rentAResult.coverage, saleBResult?.coverage].filter(Boolean) as SourceCoverage[];
    if (coverages.some((coverage) => coverage.failedMonths.length > 0)) {
      warnings.push('일부 조회 월의 원본 응답이 실패해 확인된 월만 집계했습니다.');
    }
    if (unavailableCoverage(rentAResult.coverage)) {
      warnings.push('전세 원본을 확인하지 못해 전세가율과 단순 갭을 표시하지 않았습니다.');
    } else if (recentRents.length === 0) {
      warnings.push('선택 조건과 일치하는 최근 전세 표본이 없어 전세가율과 단순 갭을 표시하지 않았습니다.');
    }
    if (complexB && signal === 'insufficient') {
      warnings.push('과거 기준 구간이 3개월 미만이거나 변동이 없어 통계적 위치 판정을 보류했습니다.');
    }

    const result: GapResult = {
      status: warnings.length > 0 ? 'partial' : 'ok',
      complexA: { name: complexA.name, district: complexA.district, dong: complexA.dong, size: complexA.size, prices: pricesA },
      complexB: complexB
        ? { name: complexB.name, district: complexB.district, dong: complexB.dong, size: complexB.size, prices: pricesB }
        : undefined,
      monthlyGap,
      historicalAvgGap: Math.round(historicalAvgGap),
      currentGap: Math.round(currentGap),
      margin: Math.round(margin),
      signal,
      zScore: zScore === null ? null : Number(zScore.toFixed(2)),
      dataWarning: warnings.join(' '),
      rentAvg: avgRentA,
      rentRatio: avgRentA !== null && latestA !== null ? Number(((avgRentA / latestA) * 100).toFixed(1)) : null,
      investmentGap: avgRentA !== null && latestA !== null ? latestA - avgRentA : null,
      latestPrice: latestA,
      tradeCount: tradesA.length,
      rentCount: recentRents.length,
      coverage: {
        requestedMonths: monthList,
        saleA: saleAResult.coverage,
        rentA: rentAResult.coverage,
        saleB: saleBResult?.coverage,
      },
      method: '선택한 법정동·전용면적(±0.6㎡)의 취소 제외 실거래를 월별 산술평균했습니다. 전세는 최근 계약월 최대 3개월의 전세 보증금 산술평균입니다.',
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: unknown) {
    console.error('[gap-analysis API]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { status: 'unavailable', error: '갭 분석 원본 데이터를 불러오지 못했습니다.' },
      { status: 502 },
    );
  }
}

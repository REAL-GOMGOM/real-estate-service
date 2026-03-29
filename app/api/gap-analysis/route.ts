import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import type { GapResult, MonthlyPrice } from '@/types/gap-analysis';

const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';

async function fetchTrades(apiKey: string, lawdCd: string, dealYmd: string, aptName?: string) {
  const url = `${API_URL}?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();

  const trades: { name: string; price: number; area: number; date: string }[] = [];
  const names = text.match(/<aptNm>([^<]+)<\/aptNm>/g) || [];
  const amounts = text.match(/<dealAmount>([^<]+)<\/dealAmount>/g) || [];
  const areas = text.match(/<excluUseAr>([^<]+)<\/excluUseAr>/g) || [];
  const years = text.match(/<dealYear>([^<]+)<\/dealYear>/g) || [];
  const months = text.match(/<dealMonth>([^<]+)<\/dealMonth>/g) || [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i].replace(/<\/?aptNm>/g, '').trim();
    if (aptName && !name.includes(aptName)) continue;

    const price = parseInt((amounts[i] || '').replace(/<\/?dealAmount>/g, '').replace(/,/g, '').trim()) || 0;
    const area = parseFloat((areas[i] || '').replace(/<\/?excluUseAr>/g, '').trim()) || 0;
    const y = (years[i] || '').replace(/<\/?dealYear>/g, '').trim();
    const m = (months[i] || '').replace(/<\/?dealMonth>/g, '').trim().padStart(2, '0');

    if (price > 0) {
      trades.push({ name, price, area, date: `${y}-${m}` });
    }
  }
  return trades;
}

function aggregateMonthly(trades: { price: number; date: string }[]): MonthlyPrice[] {
  const map: Record<string, { total: number; count: number }> = {};
  for (const t of trades) {
    if (!map[t.date]) map[t.date] = { total: 0, count: 0 };
    map[t.date].total += t.price;
    map[t.date].count++;
  }
  return Object.entries(map)
    .map(([date, { total, count }]) => ({ date, avgPrice: Math.round(total / count), count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateGap(pricesA: MonthlyPrice[], pricesB: MonthlyPrice[]): GapResult['monthlyGap'] {
  const mapB: Record<string, number> = {};
  for (const p of pricesB) mapB[p.date] = p.avgPrice;

  return pricesA
    .filter((p) => mapB[p.date] != null)
    .map((p) => ({ date: p.date, gap: p.avgPrice - mapB[p.date] }));
}

/**
 * POST /api/gap-analysis
 * body: { complexA: { district, name, size? }, complexB: { district, name, size? }, period: 36 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { complexA, complexB, period = 36 } = body;

    if (!complexA?.district || !complexA?.name) {
      return NextResponse.json({ error: 'complexA 필수' }, { status: 400 });
    }

    const apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API키 미설정' }, { status: 500 });
    }

    const lawdA = DISTRICT_CODE[complexA.district];
    if (!lawdA) {
      return NextResponse.json({ error: `${complexA.district} 코드 없음` }, { status: 400 });
    }

    // 월 목록 생성
    const now = new Date();
    const monthList: string[] = [];
    for (let i = 0; i < Math.min(period, 36); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthList.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // A 단지 데이터 수집
    const tradesA: { price: number; area: number; date: string }[] = [];
    for (const m of monthList) {
      const t = await fetchTrades(apiKey, lawdA, m, complexA.name);
      const filtered = complexA.size
        ? t.filter((x) => Math.abs(x.area - complexA.size) < 5)
        : t;
      tradesA.push(...filtered.map((x) => ({ price: x.price, area: x.area, date: x.date })));
    }

    const pricesA = aggregateMonthly(tradesA);

    // B 단지 데이터 (있으면)
    let pricesB: MonthlyPrice[] = [];
    if (complexB?.district && complexB?.name) {
      const lawdB = DISTRICT_CODE[complexB.district] || lawdA;
      const tradesB: { price: number; area: number; date: string }[] = [];
      for (const m of monthList) {
        const t = await fetchTrades(apiKey, lawdB, m, complexB.name);
        const filtered = complexB.size
          ? t.filter((x) => Math.abs(x.area - complexB.size) < 5)
          : t;
        tradesB.push(...filtered.map((x) => ({ price: x.price, area: x.area, date: x.date })));
      }
      pricesB = aggregateMonthly(tradesB);
    }

    // 갭 계산
    const monthlyGap = pricesB.length > 0
      ? calculateGap(pricesA, pricesB)
      : pricesA.map((p) => ({ date: p.date, gap: p.avgPrice }));

    if (monthlyGap.length === 0) {
      return NextResponse.json({
        error: '거래 데이터가 부족합니다',
        complexA: { name: complexA.name, district: complexA.district, prices: pricesA },
      }, { status: 404 });
    }

    const gaps = monthlyGap.map((g) => g.gap);
    const historicalAvgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const recentGaps = gaps.slice(-3);
    const currentGap = recentGaps.reduce((s, g) => s + g, 0) / recentGaps.length;
    const margin = currentGap - historicalAvgGap;

    // Z-score
    const std = Math.sqrt(gaps.reduce((s, g) => s + (g - historicalAvgGap) ** 2, 0) / gaps.length);
    const zScore = std > 0 ? margin / std : 0;

    const signal: GapResult['signal'] = zScore > 1 ? 'overvalued' : zScore < -1 ? 'undervalued' : 'normal';

    // 데이터 부족 경고
    const recentCount = pricesA.filter((p) => {
      const d = new Date(p.date + '-01');
      const diff = (now.getTime() - d.getTime()) / (30 * 24 * 60 * 60 * 1000);
      return diff <= 3;
    }).reduce((s, p) => s + p.count, 0);

    const avgCount = pricesA.reduce((s, p) => s + p.count, 0) / Math.max(pricesA.length, 1);
    const dataWarning = recentCount < avgCount * 0.5
      ? '최신 데이터(최근 3개월)는 신고 지연으로 불안정할 수 있습니다'
      : undefined;

    const result: GapResult = {
      complexA: { name: complexA.name, district: complexA.district, prices: pricesA },
      complexB: complexB?.name
        ? { name: complexB.name, district: complexB.district, prices: pricesB }
        : undefined,
      monthlyGap,
      historicalAvgGap: Math.round(historicalAvgGap),
      currentGap: Math.round(currentGap),
      margin: Math.round(margin),
      signal,
      zScore: +zScore.toFixed(2),
      dataWarning,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '오류' }, { status: 500 });
  }
}

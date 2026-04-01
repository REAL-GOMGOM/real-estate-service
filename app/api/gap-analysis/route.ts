import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import type { GapResult, MonthlyPrice } from '@/types/gap-analysis';

const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const RENT_API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';

async function fetchTrades(apiKey: string, lawdCd: string, dealYmd: string, aptName?: string) {
  const url = `${API_URL}?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
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
    if (price > 0) trades.push({ name, price, area, date: `${y}-${m}` });
  }
  return trades;
}

async function fetchRents(apiKey: string, lawdCd: string, dealYmd: string, aptName?: string) {
  const url = `${RENT_API_URL}?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
    const text = await res.text();
    const trades: { name: string; deposit: number; area: number; date: string }[] = [];
    const names = text.match(/<aptNm>([^<]+)<\/aptNm>/g) || [];
    const deposits = text.match(/<deposit>([^<]+)<\/deposit>/g) || [];
    const areas = text.match(/<excluUseAr>([^<]+)<\/excluUseAr>/g) || [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i].replace(/<\/?aptNm>/g, '').trim();
      if (aptName && !name.includes(aptName)) continue;
      const dep = parseInt((deposits[i] || '').replace(/<\/?deposit>/g, '').replace(/,/g, '').trim()) || 0;
      const area = parseFloat((areas[i] || '').replace(/<\/?excluUseAr>/g, '').trim()) || 0;
      if (dep > 0) trades.push({ name, deposit: dep, area, date: '' });
    }
    return trades;
  } catch { return []; }
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { complexA, complexB, period = 6 } = body;

    if (!complexA?.district || !complexA?.name) {
      return NextResponse.json({ error: 'complexA 필수' }, { status: 400 });
    }

    const apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      console.error('[gap-analysis API] PUBLIC_DATA_API_KEY 미설정');
      return NextResponse.json({ error: '갭분석 데이터를 불러올 수 없습니다' }, { status: 500 });
    }

    const lawdA = DISTRICT_CODE[complexA.district];
    if (!lawdA) return NextResponse.json({ error: `${complexA.district} 코드 없음` }, { status: 400 });

    // 최근 6개월 (성능 개선)
    const now = new Date();
    const monthList: string[] = [];
    for (let i = 0; i < Math.min(period, 12); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthList.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // 병렬 호출 (A 매매 + A 전세)
    const [tradesAAll, rentsAAll] = await Promise.all([
      Promise.all(monthList.map((m) => fetchTrades(apiKey, lawdA, m, complexA.name))),
      Promise.all(monthList.map((m) => fetchRents(apiKey, lawdA, m, complexA.name))),
    ]);

    const tradesA = tradesAAll.flat();
    const rentsA = rentsAAll.flat();

    const filteredTradesA = complexA.size
      ? tradesA.filter((x) => Math.abs(x.area - complexA.size) < 5)
      : tradesA;

    const filteredRentsA = complexA.size
      ? rentsA.filter((x) => Math.abs(x.area - complexA.size) < 5)
      : rentsA;

    const pricesA = aggregateMonthly(filteredTradesA);
    const avgRentA = filteredRentsA.length > 0
      ? Math.round(filteredRentsA.reduce((s, r) => s + r.deposit, 0) / filteredRentsA.length)
      : null;

    // B 단지 (있으면 병렬)
    let pricesB: MonthlyPrice[] = [];
    if (complexB?.district && complexB?.name) {
      const lawdB = DISTRICT_CODE[complexB.district] || lawdA;
      const tradesBALL = await Promise.all(monthList.map((m) => fetchTrades(apiKey, lawdB, m, complexB.name)));
      const tradesB = tradesBALL.flat();
      const filtered = complexB.size ? tradesB.filter((x) => Math.abs(x.area - complexB.size) < 5) : tradesB;
      pricesB = aggregateMonthly(filtered);
    }

    // 갭 계산
    const latestA = pricesA.length > 0 ? pricesA[pricesA.length - 1].avgPrice : 0;
    const monthlyGap = pricesB.length > 0
      ? pricesA.filter((p) => pricesB.find((b) => b.date === p.date))
        .map((p) => ({ date: p.date, gap: p.avgPrice - (pricesB.find((b) => b.date === p.date)?.avgPrice || 0) }))
      : pricesA.map((p) => ({ date: p.date, gap: p.avgPrice }));

    const gaps = monthlyGap.map((g) => g.gap);
    const historicalAvgGap = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
    const recentGaps = gaps.slice(-3);
    const currentGap = recentGaps.length > 0 ? recentGaps.reduce((s, g) => s + g, 0) / recentGaps.length : 0;
    const margin = currentGap - historicalAvgGap;
    const std = gaps.length > 0 ? Math.sqrt(gaps.reduce((s, g) => s + (g - historicalAvgGap) ** 2, 0) / gaps.length) : 0;
    const zScore = std > 0 ? margin / std : 0;
    const signal: GapResult['signal'] = zScore > 1 ? 'overvalued' : zScore < -1 ? 'undervalued' : 'normal';

    // 전세가율 계산
    const rentRatio = avgRentA && latestA > 0 ? +((avgRentA / latestA) * 100).toFixed(1) : null;
    const investmentGap = avgRentA ? latestA - avgRentA : null;

    const result: GapResult = {
      complexA: { name: complexA.name, district: complexA.district, prices: pricesA },
      complexB: complexB?.name ? { name: complexB.name, district: complexB.district, prices: pricesB } : undefined,
      monthlyGap,
      historicalAvgGap: Math.round(historicalAvgGap),
      currentGap: Math.round(currentGap),
      margin: Math.round(margin),
      signal,
      zScore: +zScore.toFixed(2),
      // 추가 데이터
      rentAvg: avgRentA,
      rentRatio,
      investmentGap,
      latestPrice: latestA,
      tradeCount: filteredTradesA.length,
      rentCount: filteredRentsA.length,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[gap-analysis API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '갭분석 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

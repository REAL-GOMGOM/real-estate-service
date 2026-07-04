import { NextResponse } from 'next/server';

/**
 * 금리 추이 API — 사이클 Y (대출 시뮬레이터 금리 변화 표시)
 *
 * GET /api/loan/rate-history
 * → 최근 12개월 COFIX(신규취급액)·한국은행 기준금리 시계열.
 *   은행대출 탭 = COFIX (변동금리 기준지표), 정부대출 탭 = 기준금리 (정책 방향).
 *
 * 출처: 한국은행 ECOS. 일 1회 캐시.
 */

const BOK_API_KEY = process.env.BOK_API_KEY ?? '';
const BOK_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

// COFIX 신규취급액: 121Y006/010190000 (월), 한은 기준금리: 722Y001/0101000 (월)
const SERIES = {
  cofix: { stat: '121Y006', item: '010190000', name: 'COFIX 신규취급액' },
  base:  { stat: '722Y001', item: '0101000',   name: '한국은행 기준금리' },
} as const;

interface RatePoint { period: string; rate: number }

function formatMonth(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchSeries(key: keyof typeof SERIES, from: string, to: string): Promise<RatePoint[]> {
  const { stat, item } = SERIES[key];
  const url = `${BOK_BASE}/${BOK_API_KEY}/json/kr/1/100/${stat}/M/${from}/${to}/${item}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const data = await res.json();
  const rows: { TIME: string; DATA_VALUE: string }[] = data?.StatisticSearch?.row ?? [];
  return rows
    .map((r) => ({ period: r.TIME, rate: parseFloat(r.DATA_VALUE) }))
    .filter((p) => Number.isFinite(p.rate))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export async function GET() {
  if (!BOK_API_KEY) {
    return NextResponse.json({ error: 'BOK API 키 미설정' }, { status: 500 });
  }

  const now = new Date();
  const to = formatMonth(now);
  const from = formatMonth(new Date(now.getFullYear() - 1, now.getMonth(), 1));

  try {
    const [cofix, base] = await Promise.all([
      fetchSeries('cofix', from, to),
      fetchSeries('base', from, to),
    ]);

    if (cofix.length === 0 && base.length === 0) {
      return NextResponse.json({ error: '금리 데이터를 찾을 수 없습니다' }, { status: 502 });
    }

    return NextResponse.json(
      {
        cofix: { name: SERIES.cofix.name, points: cofix.slice(-12) },
        base:  { name: SERIES.base.name,  points: base.slice(-12) },
        updatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
    );
  } catch (e) {
    console.error('[loan/rate-history API] 조회 실패:', e);
    return NextResponse.json({ error: '금리 추이 조회 실패' }, { status: 500 });
  }
}

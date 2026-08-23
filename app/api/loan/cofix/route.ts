import { NextResponse } from 'next/server';

const BOK_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

// 예금은행 대출금리(신규취급액 기준) 통계코드 121Y006, 대출평균 항목 BECBLA01.
// (기존 010190000 은 존재하지 않는 항목코드라 항상 빈 결과였음. COFIX 는 ECOS 미제공이라
//  변동금리 기준지표로 예금은행 대출평균금리를 사용한다.)
const STAT_CODE = '121Y006';
const ITEM_CODE = 'BECBLA01';
const LOOKBACK_MONTHS = 12;

interface EcosRateRow {
  DATA_VALUE?: unknown;
  TIME?: unknown;
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function recentMonths(now: Date): string[] {
  return Array.from({ length: LOOKBACK_MONTHS }, (_, offset) =>
    formatMonth(new Date(now.getFullYear(), now.getMonth() - offset, 1))
  );
}

function findValidRate(data: unknown, periods: readonly string[]): { period: string; rate: number } | null {
  const rows = (data as { StatisticSearch?: { row?: unknown } } | null)?.StatisticSearch?.row;
  if (!Array.isArray(rows)) return null;

  const byPeriod = new Map(
    (rows as EcosRateRow[])
      .filter((candidate) => typeof candidate?.TIME === 'string')
      .map((candidate) => [candidate.TIME as string, candidate]),
  );
  for (const period of periods) {
    const candidate = byPeriod.get(period);
    if (!candidate) continue;

    const rawRate = candidate.DATA_VALUE;
    if ((typeof rawRate !== 'string' && typeof rawRate !== 'number') || String(rawRate).trim() === '') {
      continue;
    }

    const rate = Number(rawRate);
    if (Number.isFinite(rate) && rate >= 0) return { period, rate };
  }

  return null;
}

export async function GET() {
  const apiKey = process.env.BOK_API_KEY?.trim() ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'BOK API 키 미설정' }, { status: 500 });
  }

  // 월간 통계는 공표가 늦을 수 있으므로 최근 12개월을 한 번에 받고 최신 유효값을 고른다.
  const periods = recentMonths(new Date());
  const url = `${BOK_BASE}/${apiKey}/json/kr/1/100/${STAT_CODE}/M/${periods.at(-1)}/${periods[0]}/${ITEM_CODE}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: '최근 12개월 내 예금은행 대출평균금리 데이터를 찾을 수 없습니다.' },
          { status: 404 },
        );
      }
      throw new Error(`ECOS HTTP ${res.status}`);
    }

    const match = findValidRate(await res.json(), periods);
    if (match) {
      return NextResponse.json(
        {
          rate: match.rate,
          period: match.period,
          name: '예금은행 대출평균금리(신규취급액)',
        },
        {
          headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: '예금은행 대출평균금리 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: '최근 12개월 내 예금은행 대출평균금리 데이터를 찾을 수 없습니다.' },
    { status: 404 }
  );
}

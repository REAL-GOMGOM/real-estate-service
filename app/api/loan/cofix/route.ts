import { NextResponse } from 'next/server';

const BOK_API_KEY = process.env.BOK_API_KEY ?? '';
const BOK_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

// COFIX 신규취급액 기준 통계코드: 121Y006, 항목코드: 010190000
const STAT_CODE = '121Y006';
const ITEM_CODE = '010190000';

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

export async function GET() {
  try {
    if (!BOK_API_KEY) {
      return NextResponse.json({ error: 'BOK API 키 미설정' }, { status: 500 });
    }

    const now = new Date();
    const thisMonth = formatMonth(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = formatMonth(prevDate);

    // 당월 시도 → 없으면 전월 fallback
    for (const period of [thisMonth, prevMonth]) {
      const url = `${BOK_BASE}/${BOK_API_KEY}/json/kr/1/1/${STAT_CODE}/M/${period}/${period}/${ITEM_CODE}`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      const row = data?.StatisticSearch?.row?.[0];
      if (row) {
        return NextResponse.json(
          {
            rate: parseFloat(row.DATA_VALUE),
            period: row.TIME,
            name: 'COFIX 신규취급액 기준',
          },
          {
            headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
          }
        );
      }
    }

    return NextResponse.json(
      { error: 'COFIX 데이터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: 'COFIX 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

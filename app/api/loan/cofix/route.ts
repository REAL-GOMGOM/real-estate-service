import { NextResponse } from 'next/server';

const BOK_API_KEY = process.env.BOK_API_KEY ?? '';
const BOK_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

// 예금은행 대출금리(신규취급액 기준) 통계코드 121Y006, 대출평균 항목 BECBLA01.
// (기존 010190000 은 존재하지 않는 항목코드라 항상 빈 결과였음. COFIX 는 ECOS 미제공이라
//  변동금리 기준지표로 예금은행 대출평균금리를 사용한다.)
const STAT_CODE = '121Y006';
const ITEM_CODE = 'BECBLA01';

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
            name: '예금은행 대출평균금리(신규취급액)',
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

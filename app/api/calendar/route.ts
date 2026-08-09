import { NextRequest, NextResponse } from 'next/server';
import {
  CALENDAR_NOTE,
  CALENDAR_SOURCES,
  CALENDAR_VERIFIED_AT,
  getCalendarEvents,
} from '@/lib/calendar-events';

function currentKoreanYearMonth() {
  const koreaNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    year: koreaNow.getUTCFullYear(),
    month: koreaNow.getUTCMonth() + 1,
  };
}

function parseYear(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 2000 && year <= 2100 ? year : null;
}

function parseMonth(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^(?:0?[1-9]|1[0-2])$/.test(value)) return null;
  return Number(value);
}

export async function GET(request: NextRequest) {
  const current = currentKoreanYearMonth();
  const year = parseYear(request.nextUrl.searchParams.get('year'), current.year);
  const month = parseMonth(request.nextUrl.searchParams.get('month'), current.month);

  if (year === null || month === null) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'year는 2000~2100 사이의 4자리 연도, month는 1~12 사이여야 합니다.',
      },
      { status: 400 },
    );
  }

  const events = getCalendarEvents(year, month).map((event, index) => ({
    ...event,
    id: index + 1,
  }));

  return NextResponse.json(
    {
      status: 'ok',
      year,
      month,
      events,
      note:
        year === 2026
          ? CALENDAR_NOTE
          : `${year}년 공식 경제 일정은 아직 수록하지 않았습니다. 한국부동산원 일정은 통상 발표일을 표시한 미확정 참고 일정이며 변경될 수 있습니다.`,
      sources: CALENDAR_SOURCES,
      verifiedAt: CALENDAR_VERIFIED_AT,
    },
    {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    },
  );
}

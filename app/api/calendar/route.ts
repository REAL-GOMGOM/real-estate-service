import { NextRequest, NextResponse } from 'next/server';
import { getEventsByMonth, seedDummyEvents } from '@/lib/calendar-db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const now = new Date();
    const year = Number(searchParams.get('year')) || now.getFullYear();
    const month = Number(searchParams.get('month')) || now.getMonth() + 1;

    if (month < 1 || month > 12) {
      return NextResponse.json({ error: '유효하지 않은 월입니다.' }, { status: 400 });
    }

    // 더미 데이터 시딩 (이벤트가 없을 때만)
    seedDummyEvents();

    const events = getEventsByMonth(year, month);
    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

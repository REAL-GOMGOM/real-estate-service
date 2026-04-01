import { NextRequest, NextResponse } from 'next/server';
import { getCalendarEvents, type CalendarEvent } from '@/lib/calendar-events';

function tryDbEvents(year: number, month: number) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(process.cwd(), 'data', 'calendar.db'), { readonly: true });
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const rows = db.prepare(
      'SELECT id, event_date, category, title, description, source_url, icon, importance FROM calendar_events WHERE event_date >= ? AND event_date < ? ORDER BY event_date ASC'
    ).all(startDate, endDate);
    db.close();
    return rows as CalendarEvent[];
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const now = new Date();
    const year = Number(searchParams.get('year')) || now.getFullYear();
    const month = Number(searchParams.get('month')) || now.getMonth() + 1;

    // 1) SQLite 시도
    const dbEvents = tryDbEvents(year, month);

    // 2) 확정 정기 이벤트
    const fixedEvents = getCalendarEvents(year, month);

    // 경제지표 이벤트만 (DB 우선, 없으면 정기 이벤트)
    const allEvents = [...(dbEvents || fixedEvents)];

    // 중복 제거 (같은 날짜 + 같은 타이틀)
    const seen = new Set<string>();
    const deduped = allEvents.filter((e) => {
      const key = `${e.event_date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.event_date.localeCompare(b.event_date));

    // id 재할당 (충돌 방지)
    const events = deduped.map((e, i) => ({ ...e, id: i + 1 }));

    return NextResponse.json({ events }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error: unknown) {
    console.error('[calendar API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '달력 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}

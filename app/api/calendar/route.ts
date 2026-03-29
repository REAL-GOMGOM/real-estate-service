import { NextRequest, NextResponse } from 'next/server';
import { getCalendarEvents } from '@/lib/calendar-events';

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
    return rows;
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

    // 1) SQLite 시도 (로컬 + 크롤링 데이터 있을 때)
    const dbEvents = tryDbEvents(year, month);
    if (dbEvents && dbEvents.length > 0) {
      return NextResponse.json({ events: dbEvents });
    }

    // 2) 확정 정기 이벤트 (Vercel fallback)
    const events = getCalendarEvents(year, month);
    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

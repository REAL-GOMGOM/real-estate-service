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

// 청약 데이터에서 달력 이벤트 생성
async function fetchSubscriptionEvents(year: number, month: number): Promise<CalendarEvent[]> {
  try {
    // 내부 API 호출 대신 직접 subscription-api 호출
    const { fetchSubscriptions } = await import('@/lib/subscription-api');
    const items = await fetchSubscriptions();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const events: CalendarEvent[] = [];
    let id = 1000;

    for (const item of items) {
      // 시작일이 해당 월인 경우
      if (item.startDate?.startsWith(prefix)) {
        events.push({
          id: id++,
          event_date: item.startDate,
          category: 'subscription',
          title: `${item.name} 청약`,
          description: `${item.district} · ${item.totalUnits > 0 ? item.totalUnits + '세대' : ''} · ${item.houseType || ''}`,
          source_url: 'https://www.applyhome.co.kr',
          icon: '🏠',
          importance: item.competitionRate && item.competitionRate > 10 ? 'high' : 'normal',
        });
      }
      // 발표일이 해당 월인 경우
      if (item.announceDate?.startsWith(prefix)) {
        events.push({
          id: id++,
          event_date: item.announceDate,
          category: 'subscription',
          title: `${item.name} 당첨 발표`,
          description: `${item.district}`,
          source_url: 'https://www.applyhome.co.kr',
          icon: '🏠',
          importance: 'normal',
        });
      }
    }
    return events;
  } catch {
    return [];
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

    // 3) 청약 이벤트
    const subEvents = await fetchSubscriptionEvents(year, month);

    // 합치기 (DB > 정기 > 청약, 중복 제거)
    const allEvents = [...(dbEvents || fixedEvents), ...subEvents];
    const seen = new Set<string>();
    const deduped = allEvents.filter((e) => {
      const key = `${e.event_date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.event_date.localeCompare(b.event_date));

    return NextResponse.json({ events: deduped });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

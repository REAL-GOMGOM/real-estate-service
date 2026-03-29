'use client';

import { useMemo } from 'react';
import EventBadge from './EventBadge';
import type { CalendarEvent, EventCategory } from '@/types/calendar';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_VISIBLE_EVENTS = 2;

interface CalendarGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  activeCategories: Set<EventCategory>;
  onEventClick: (event: CalendarEvent) => void;
}

interface DayCell {
  date: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0=일, 6=토
  dateStr: string;   // "2026-03-27"
}

export default function CalendarGrid({ year, month, events, activeCategories, onEventClick }: CalendarGridProps) {
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const filteredEvents = useMemo(
    () => events.filter((e) => activeCategories.has(e.category)),
    [events, activeCategories],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of filteredEvents) {
      (map[e.event_date] ||= []).push(e);
    }
    return map;
  }, [filteredEvents]);

  return (
    <div>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            style={{
              padding: '6px 0', textAlign: 'center',
              fontSize: '11px', fontWeight: 600,
              color: i === 0 ? '#EF4444' : i === 6 ? 'var(--accent)' : 'var(--text-dim)',
              backgroundColor: 'var(--bg-overlay)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
        {cells.map((cell, idx) => {
          const dayEvents = eventsByDate[cell.dateStr] || [];
          const hasMore = dayEvents.length > MAX_VISIBLE_EVENTS;

          return (
            <div
              key={idx}
              style={{
                minHeight: '72px',
                padding: '4px',
                backgroundColor: cell.isToday
                  ? 'var(--accent-bg)'
                  : cell.isCurrentMonth
                    ? 'var(--bg-overlay)'
                    : 'var(--bg-overlay)',
                borderRadius: '4px',
                border: cell.isToday ? '1px solid var(--accent-border)' : '1px solid var(--border-light)',
                opacity: cell.isCurrentMonth ? 1 : 0.4,
              }}
            >
              {/* 날짜 숫자 */}
              <div style={{
                fontSize: '12px', fontWeight: cell.isToday ? 700 : 500,
                color: cell.isToday
                  ? 'var(--accent)'
                  : cell.dayOfWeek === 0
                    ? '#EF4444'
                    : cell.dayOfWeek === 6
                      ? 'var(--accent)'
                      : 'var(--text-secondary)',
                marginBottom: '4px',
              }}>
                {cell.date}
              </div>

              {/* 이벤트 배지 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((ev) => (
                  <EventBadge key={ev.id} event={ev} onClick={onEventClick} />
                ))}
                {hasMore && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-dim)', paddingLeft: '4px', cursor: 'default',
                  }}>
                    +{dayEvents.length - MAX_VISIBLE_EVENTS}건 더보기
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildCells(year: number, month: number): DayCell[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDay = new Date(year, month - 1, 1);
  const startDow = firstDay.getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();

  // 이전달 날짜
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

  const cells: DayCell[] = [];

  // 이전달 마지막 며칠
  for (let i = startDow - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({
      date: d,
      isCurrentMonth: false,
      isToday: false,
      dayOfWeek: cells.length % 7,
      dateStr: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  // 이번달
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      date: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      dayOfWeek: cells.length % 7,
      dateStr,
    });
  }

  // 다음달 (6주 채우기)
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const totalCells = Math.ceil(cells.length / 7) * 7;
  let nextD = 1;
  while (cells.length < totalCells) {
    cells.push({
      date: nextD,
      isCurrentMonth: false,
      isToday: false,
      dayOfWeek: cells.length % 7,
      dateStr: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`,
    });
    nextD++;
  }

  return cells;
}

'use client';

import CalendarCell from './CalendarCell';
import type { SubscriptionCalendarEvent } from '@/lib/calendar-subscription';
import type { EconomicEvent } from '@/app/api/calendar/route';

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

// ─────────────────────────────────────────
// 날짜 문자열 생성 — toISOString() 미사용 (UTC 변환 방지)
// ─────────────────────────────────────────
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────
// 해당 월의 달력 날짜 배열 생성 (42칸 고정)
// ─────────────────────────────────────────
function buildCalendarDays(year: number, month: number): Array<{ dateStr: string; isCurrentMonth: boolean }> {
  const firstDay      = new Date(year, month - 1, 1);
  const startDayOfWeek = firstDay.getDay(); // 0=일
  const daysInMonth   = new Date(year, month, 0).getDate();
  const prevLastDay   = new Date(year, month - 1, 0).getDate();

  const days: Array<{ dateStr: string; isCurrentMonth: boolean }> = [];

  // 이전 달 채우기
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      dateStr:        toLocalDateStr(new Date(year, month - 2, prevLastDay - i)),
      isCurrentMonth: false,
    });
  }
  // 이번 달
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      dateStr:        toLocalDateStr(new Date(year, month - 1, d)),
      isCurrentMonth: true,
    });
  }
  // 다음 달 채우기 (42칸 = 6행)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      dateStr:        toLocalDateStr(new Date(year, month, d)),
      isCurrentMonth: false,
    });
  }

  return days;
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────
interface CalendarGridProps {
  year:          number;
  month:         number;
  subscriptions: SubscriptionCalendarEvent[];
  economic:      EconomicEvent[];
  onSubscriptionClick: (e: SubscriptionCalendarEvent) => void;
  onEconomicClick:     (e: EconomicEvent) => void;
}

export default function CalendarGrid({
  year, month,
  subscriptions, economic,
  onSubscriptionClick, onEconomicClick,
}: CalendarGridProps) {
  // 날짜 → 이벤트 맵
  const subsByDate = new Map<string, SubscriptionCalendarEvent[]>();
  for (const e of subscriptions) {
    const list = subsByDate.get(e.date) ?? [];
    list.push(e);
    subsByDate.set(e.date, list);
  }

  const ecoByDate = new Map<string, EconomicEvent[]>();
  for (const e of economic) {
    const list = ecoByDate.get(e.date) ?? [];
    list.push(e);
    ecoByDate.set(e.date, list);
  }

  const days = buildCalendarDays(year, month);

  return (
    <div style={{
      borderRadius: '16px', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* 요일 헤더 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        backgroundColor: '#111827',
      }}>
        {DAY_HEADERS.map((day, i) => (
          <div
            key={day}
            style={{
              textAlign: 'center', padding: '12px 0',
              fontSize: '13px', fontWeight: 700,
              color: i === 0 ? '#EF4444' : i === 6 ? '#60A5FA' : '#94A3B8',
              borderRight: i < 6 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        backgroundColor: '#0F1629',
      }}>
        {days.map(({ dateStr, isCurrentMonth }) => (
          <CalendarCell
            key={dateStr}
            dateStr={dateStr}
            isCurrentMonth={isCurrentMonth}
            subscriptions={subsByDate.get(dateStr) ?? []}
            economic={ecoByDate.get(dateStr) ?? []}
            onSubscriptionClick={onSubscriptionClick}
            onEconomicClick={onEconomicClick}
          />
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { SubscriptionBadge, EconomicBadge } from './EventBadge';
import type { SubscriptionCalendarEvent } from '@/lib/calendar-subscription';
import type { EconomicEvent } from '@/app/api/calendar/route';

// 한 셀에 일정이 많을 때 접기 임계값
const MAX_VISIBLE_EVENTS = 3;

interface CalendarCellProps {
  dateStr:       string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  subscriptions: SubscriptionCalendarEvent[];
  economic:      EconomicEvent[];
  onSubscriptionClick: (e: SubscriptionCalendarEvent) => void;
  onEconomicClick:     (e: EconomicEvent) => void;
}

export default function CalendarCell({
  dateStr,
  isCurrentMonth,
  subscriptions,
  economic,
  onSubscriptionClick,
  onEconomicClick,
}: CalendarCellProps) {
  const [expanded, setExpanded] = useState(false);

  const day       = parseInt(dateStr.split('-')[2], 10);
  const dayOfWeek = new Date(dateStr).getDay(); // 0=일, 6=토

  const isSunday   = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  const isHoliday = economic.some(e => e.category === 'holiday');

  const dateColor = !isCurrentMonth
    ? '#334155'
    : isHoliday || isSunday
      ? '#EF4444'
      : isSaturday
        ? '#60A5FA'
        : '#F1F5F9';

  // 공휴일 배경
  const hasHoliday = isCurrentMonth && isHoliday;

  // 이벤트 표시 순서: 경제(공휴일 제외 먼저) → 청약
  const economicNonHoliday = economic.filter(e => e.category !== 'holiday');
  const holidays            = economic.filter(e => e.category === 'holiday');
  const allEvents: Array<
    | { kind: 'sub'; data: SubscriptionCalendarEvent }
    | { kind: 'eco'; data: EconomicEvent }
  > = [
    ...holidays.map(d    => ({ kind: 'eco' as const, data: d })),
    ...economicNonHoliday.map(d => ({ kind: 'eco' as const, data: d })),
    ...subscriptions.map(d => ({ kind: 'sub' as const, data: d })),
  ];

  const visibleEvents = expanded ? allEvents : allEvents.slice(0, MAX_VISIBLE_EVENTS);
  const hiddenCount   = allEvents.length - MAX_VISIBLE_EVENTS;

  return (
    <div style={{
      minHeight: '110px',
      padding: '6px 5px 4px',
      backgroundColor: hasHoliday ? 'rgba(239,68,68,0.04)' : 'transparent',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 날짜 숫자 */}
      <span style={{
        fontSize: '13px', fontWeight: 700,
        color: dateColor,
        marginBottom: '4px', lineHeight: 1,
        opacity: isCurrentMonth ? 1 : 0.35,
      }}>
        {day}
      </span>

      {/* 이벤트 목록 */}
      <div style={{ flex: 1 }}>
        {visibleEvents.map((item) =>
          item.kind === 'eco'
            ? <EconomicBadge    key={item.data.id} event={item.data} onClick={onEconomicClick} />
            : <SubscriptionBadge key={item.data.id} event={item.data} onClick={onSubscriptionClick} />
        )}

        {/* 더보기 / 접기 */}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              fontSize: '9px', color: '#475569', background: 'none',
              border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            +{hiddenCount}개 더보기
          </button>
        )}
        {expanded && allEvents.length > MAX_VISIBLE_EVENTS && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              fontSize: '9px', color: '#475569', background: 'none',
              border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}

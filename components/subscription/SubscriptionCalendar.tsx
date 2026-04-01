'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SubscriptionItem, SupplyDate } from '@/lib/types';

interface Props {
  items: SubscriptionItem[];
  onSelect: (item: SubscriptionItem) => void;
}

const SUPPLY_COLORS: Record<SupplyDate['type'], string> = {
  special: '#E74C3C',
  first:   '#27AE60',
  second:  '#F39C12',
  etc:     '#8E44AD',
};

const SUPPLY_LABELS: Record<SupplyDate['type'], string> = {
  special: '특별',
  first:   '1순위',
  second:  '2순위',
  etc:     '무순위',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function SubscriptionCalendar({ items, onSelect }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const goToPrev = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };
  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  const dateEventsMap = useMemo(() => {
    const map: Record<string, { item: SubscriptionItem; supply: SupplyDate }[]> = {};
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    for (const item of items) {
      if (!item.supplyDates) continue;
      for (const sd of item.supplyDates) {
        if (sd.date.startsWith(prefix)) {
          if (!map[sd.date]) map[sd.date] = [];
          map[sd.date].push({ item, supply: sd });
        }
      }
    }
    return map;
  }, [items, year, month]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  return (
    <div>
      {/* 헤더: 이전/다음 월 + 오늘 버튼 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={goToPrev} style={navBtnStyle} aria-label="이전 월">
            <ChevronLeft size={18} />
          </button>
          <h3 style={{
            fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)',
            minWidth: '140px', textAlign: 'center',
          }}>
            {year}년 {month}월
          </h3>
          <button onClick={goToNext} style={navBtnStyle} aria-label="다음 월">
            <ChevronRight size={18} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button onClick={goToToday} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            backgroundColor: 'var(--accent-bg)', color: 'var(--accent)',
            border: '1px solid var(--accent-border)', cursor: 'pointer',
          }}>
            오늘
          </button>
        )}
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {(['special', 'first', 'second', 'etc'] as const).map((type) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: SUPPLY_COLORS[type] }} />
            {SUPPLY_LABELS[type]}
          </div>
        ))}
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{
            padding: '8px 0', textAlign: 'center', fontSize: '12px', fontWeight: 600,
            color: i === 0 ? '#E74C3C' : i === 6 ? '#3B82F6' : 'var(--text-dim)',
            backgroundColor: 'var(--bg-card)',
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px',
        backgroundColor: 'var(--border-light)', borderRadius: '12px', overflow: 'hidden',
      }}>
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} style={{ backgroundColor: 'var(--bg-primary)', minHeight: '80px' }} />;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const events = dateEventsMap[dateStr] || [];
          const isToday = dateStr === todayStr;
          const dayOfWeek = new Date(year, month - 1, day).getDay();

          return (
            <div key={dateStr} style={{
              backgroundColor: 'var(--bg-card)', minHeight: '80px', padding: '4px',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '50%',
                fontSize: '12px', fontWeight: isToday ? 800 : 500,
                fontFamily: 'Roboto Mono, monospace',
                backgroundColor: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : dayOfWeek === 0 ? '#E74C3C' : dayOfWeek === 6 ? '#3B82F6' : 'var(--text-secondary)',
              }}>
                {day}
              </span>
              <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {events.slice(0, 3).map((ev, i) => (
                  <button
                    key={i}
                    onClick={() => onSelect(ev.item)}
                    title={`${ev.item.name} (${ev.supply.label})`}
                    style={{
                      display: 'block', width: '100%', padding: '2px 4px',
                      borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                      backgroundColor: SUPPLY_COLORS[ev.supply.type] + '20',
                      color: SUPPLY_COLORS[ev.supply.type],
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}
                  >
                    {ev.supply.label} {ev.item.name.length > 6 ? ev.item.name.slice(0, 6) + '\u2026' : ev.item.name}
                  </button>
                ))}
                {events.length > 3 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', paddingLeft: '4px' }}>
                    +{events.length - 3}건
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

const navBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)',
  color: 'var(--text-secondary)', cursor: 'pointer',
};

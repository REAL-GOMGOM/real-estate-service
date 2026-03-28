'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Header from '@/components/layout/Header';
import MonthNavigator from '@/components/calendar/MonthNavigator';
import CategoryFilter from '@/components/calendar/CategoryFilter';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import EventDetailModal from '@/components/calendar/EventDetailModal';
import { CATEGORY_MAP, type CalendarEvent, type EventCategory } from '@/types/calendar';

const ALL_CATEGORIES: EventCategory[] = [
  'subscription', 'rate', 'move_in', 'policy', 'loan', 'index', 'other',
];

function CalendarContent() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`);
      const json = await res.json();
      setEvents(json.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(year, month);
  }, [year, month, fetchEvents]);

  const goToday = () => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
  };

  const goPrev = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const goNext = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const toggleCategory = (cat: EventCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filteredEvents = events.filter((e) => activeCategories.has(e.category));
  const sortedForList = [...filteredEvents].sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <>
      <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 20px' }}>

          {/* 상단: 타이틀 + 네비게이터 */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: '16px', marginBottom: '20px',
          }}>
            <div>
              <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '4px' }}>
                부동산 달력
              </h1>
              <p style={{ fontSize: '13px', color: '#64748B' }}>
                청약·금리·입주·정책 일정을 한눈에
              </p>
            </div>
            <MonthNavigator year={year} month={month} onPrev={goPrev} onNext={goNext} onToday={goToday} />
          </div>

          {/* 카테고리 필터 */}
          <div style={{ marginBottom: '20px' }}>
            <CategoryFilter activeCategories={activeCategories} onToggle={toggleCategory} />
          </div>

          {/* 로딩 */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: '14px' }}>
              불러오는 중...
            </div>
          )}

          {/* 달력 그리드 (데스크탑) / 리스트 (모바일) */}
          {!loading && (
            isMobile ? (
              <MobileListView events={sortedForList} onEventClick={setSelectedEvent} />
            ) : (
              <CalendarGrid
                year={year}
                month={month}
                events={events}
                activeCategories={activeCategories}
                onEventClick={setSelectedEvent}
              />
            )
          )}
        </div>
      </main>

      {/* 이벤트 상세 모달 */}
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  );
}

export default function CalendarPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: 'var(--text-dim)', paddingTop: '64px' }}>
          로딩 중...
        </div>
      }>
        <CalendarContent />
      </Suspense>
    </>
  );
}

/* 모바일 리스트 뷰 */
function MobileListView({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
        이벤트가 없습니다
      </div>
    );
  }

  const grouped: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    (grouped[e.event_date] ||= []).push(e);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8', marginBottom: '8px' }}>
            {date}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {dayEvents.map((ev) => {
              const cat = CATEGORY_MAP[ev.category];
              return (
                <button
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '12px 14px', borderRadius: '12px',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    backgroundColor: cat.color + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', flexShrink: 0,
                  }}>
                    {ev.icon || cat.icon}
                  </span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{
                      fontSize: '14px', fontWeight: 600, color: '#F1F5F9',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ev.title}
                    </p>
                    {ev.description && (
                      <p style={{
                        fontSize: '12px', color: '#64748B', marginTop: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.description}
                      </p>
                    )}
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    backgroundColor: cat.color + '22', color: cat.color, flexShrink: 0,
                  }}>
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

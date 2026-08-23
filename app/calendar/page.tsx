'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Header from '@/components/layout/Header';
import MonthNavigator from '@/components/calendar/MonthNavigator';
import CategoryFilter from '@/components/calendar/CategoryFilter';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import EventDetailModal from '@/components/calendar/EventDetailModal';
import { CATEGORY_MAP, type CalendarEvent, type EventCategory } from '@/types/calendar';

const ALL_CATEGORIES: EventCategory[] = [
  'rate', 'move_in', 'policy', 'loan', 'index', 'us_economic', 'other',
];

interface CalendarSource {
  name: string;
  url: string;
}

interface CalendarMeta {
  note: string;
  sources: CalendarSource[];
  verifiedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'number'
    && typeof value.event_date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.event_date)
    && typeof value.category === 'string'
    && ALL_CATEGORIES.includes(value.category as EventCategory)
    && typeof value.title === 'string'
    && (value.description === null || typeof value.description === 'string')
    && (value.source_url === null || typeof value.source_url === 'string')
    && (value.icon === null || typeof value.icon === 'string')
    && (value.importance === 'high' || value.importance === 'normal' || value.importance === 'low')
  );
}

function parseCalendarPayload(value: unknown): { events: CalendarEvent[]; meta: CalendarMeta } | null {
  if (!isRecord(value) || value.status !== 'ok' || !Array.isArray(value.events)) return null;
  if (!value.events.every(isCalendarEvent)) return null;
  if (typeof value.note !== 'string' || typeof value.verifiedAt !== 'string') return null;
  if (!Array.isArray(value.sources) || !value.sources.every((source) => (
    isRecord(source) && typeof source.name === 'string' && typeof source.url === 'string'
  ))) return null;

  return {
    events: value.events,
    meta: {
      note: value.note,
      verifiedAt: value.verifiedAt,
      sources: value.sources as CalendarSource[],
    },
  };
}

function CalendarContent() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<CalendarMeta | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestIdRef = useRef(0);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  // 모바일 리스트 뷰 도입 전까지 미사용 (렌더 분기 예정) — lint 무시 패턴 `_`
  const [_isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      setEvents([]);
      setMeta(null);
      setSelectedEvent(null);

      try {
        const response = await fetch(`/api/calendar?year=${year}&month=${month}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`calendar request failed: ${response.status}`);

        const payload = parseCalendarPayload(await response.json());
        if (!payload) throw new Error('invalid calendar response');

        if (requestId === requestIdRef.current) {
          setEvents(payload.events);
          setMeta(payload.meta);
        }
      } catch (fetchError: unknown) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        if (requestId === requestIdRef.current) {
          setEvents([]);
          setMeta(null);
          setError('일정 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    void fetchEvents();
    return () => controller.abort();
  }, [year, month, retryKey]);

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
              <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                경제 달력
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                금리 결정, 경제 지표 발표 등 부동산 시장에 영향을 주는 주요 일정입니다
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
            <div role="status" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
              불러오는 중...
            </div>
          )}

          {!loading && error && (
            <div
              role="alert"
              style={{
                padding: '28px 20px', border: '1px solid var(--border)', borderRadius: '14px',
                backgroundColor: 'var(--bg-secondary)', textAlign: 'center',
              }}
            >
              <p style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '14px' }}>
                {error}
              </p>
              <button
                type="button"
                onClick={() => setRetryKey((key) => key + 1)}
                style={{
                  border: 0, borderRadius: '9px', padding: '9px 16px', cursor: 'pointer',
                  backgroundColor: 'var(--accent)', color: '#fff', fontWeight: 700,
                }}
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 정상 응답일 때만 출처 안내와 달력을 표시한다. */}
          {!loading && !error && meta && (
            <>
              <aside
                aria-label="일정 출처와 변경 안내"
                style={{
                  marginBottom: '18px', padding: '14px 16px', border: '1px solid var(--border)',
                  borderRadius: '12px', backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.65 }}>
                  {meta.note}
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '7px', lineHeight: 1.65 }}>
                  공식 일정 확인일 {meta.verifiedAt} · 출처{' '}
                  {meta.sources.map((source, index) => (
                    <span key={source.url}>
                      {index > 0 && ' · '}
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                      >
                        {source.name}
                      </a>
                    </span>
                  ))}
                </p>
              </aside>
              <CalendarGrid
                year={year}
                month={month}
                events={events}
                activeCategories={activeCategories}
                onEventClick={setSelectedEvent}
              />
              {events.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '16px', fontSize: '14px' }}>
                  이번 달 등록된 이벤트가 없습니다
                </p>
              )}
            </>
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
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', paddingTop: '64px', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>불러오는 중...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }>
        <CalendarContent />
      </Suspense>
    </>
  );
}

/* 모바일 리스트 뷰 — 렌더 분기 도입 전까지 미사용 (lint 무시 패턴 `_`) */
function _MobileListView({
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
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
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
                    backgroundColor: 'var(--border-light)',
                    border: '1px solid var(--border-light)',
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
                      fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ev.title}
                    </p>
                    {ev.description && (
                      <p style={{
                        fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px',
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

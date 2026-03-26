'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import Header from '@/components/layout/Header';
import MonthNavigator from '@/components/calendar/MonthNavigator';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import type { SubscriptionCalendarEvent } from '@/lib/calendar-subscription';
import type { EconomicEvent } from '@/app/api/calendar/route';

// ─────────────────────────────────────────
// 카테고리 레이블
// ─────────────────────────────────────────
const SUBSCRIPTION_LABELS: Record<SubscriptionCalendarEvent['type'], string> = {
  special:  '특별공급',
  first:    '1순위',
  second:   '2순위',
  announce: '당첨자 발표',
  contract: '계약',
};

const ECONOMIC_CATEGORY_LABELS: Record<EconomicEvent['category'], string> = {
  rate_bok:  '한국은행 금통위',
  rate_fomc: '미국 FOMC',
  policy:    '부동산 정책',
  tax:       '세금',
  movein:    '입주',
  holiday:   '공휴일',
  etc:       '기타',
};

// ─────────────────────────────────────────
// 범례 데이터
// ─────────────────────────────────────────
const LEGEND_ITEMS = [
  { color: '#1D4ED8', label: '특별공급' },
  { color: '#2563EB', label: '1순위' },
  { color: '#7C3AED', label: '당첨발표' },
  { color: '#A78BFA', label: '한국 금통위' },
  { color: '#8B5CF6', label: 'FOMC' },
  { color: '#FBBF24', label: '정책' },
  { color: '#F87171', label: '세금' },
];

// ─────────────────────────────────────────
// 이벤트 상세 모달
// ─────────────────────────────────────────
type SelectedEvent =
  | { kind: 'sub'; data: SubscriptionCalendarEvent }
  | { kind: 'eco'; data: EconomicEvent };

function EventModal({ selected, onClose }: { selected: SelectedEvent; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0F1629', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '24px', maxWidth: '400px', width: '100%',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            {selected.kind === 'sub' ? (
              <>
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#60A5FA',
                  backgroundColor: 'rgba(59,130,246,0.15)',
                  padding: '2px 8px', borderRadius: '999px',
                  display: 'inline-block', marginBottom: '6px',
                }}>
                  청약 · {SUBSCRIPTION_LABELS[selected.data.type]}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>
                  {selected.data.name}
                </h3>
              </>
            ) : (
              <>
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#A78BFA',
                  backgroundColor: 'rgba(124,58,237,0.15)',
                  padding: '2px 8px', borderRadius: '999px',
                  display: 'inline-block', marginBottom: '6px',
                }}>
                  {ECONOMIC_CATEGORY_LABELS[selected.data.category]}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>
                  {selected.data.emoji} {selected.data.title}
                </h3>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#475569', padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 상세 정보 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <InfoRow label="날짜" value={selected.data.date} />
          {selected.kind === 'sub' && (
            <>
              <InfoRow label="지역"   value={selected.data.district} />
              <InfoRow label="주소"   value={selected.data.address} />
              <InfoRow label="공급세대" value={`${selected.data.totalUnits.toLocaleString()}세대`} />
            </>
          )}
          {selected.kind === 'eco' && selected.data.description && (
            <InfoRow label="설명" value={selected.data.description} />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '12px', color: '#475569', minWidth: '56px', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: '12px', color: '#CBD5E1' }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────
export default function CalendarPage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [subscriptions, setSubscriptions] = useState<SubscriptionCalendarEvent[]>([]);
  const [economic,      setEconomic]      = useState<EconomicEvent[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [selected,      setSelected]      = useState<SelectedEvent | null>(null);

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/calendar?year=${y}&month=${m}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSubscriptions(json.subscriptions ?? []);
      setEconomic(json.economic ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로딩 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(year, month);
  }, [year, month, fetchEvents]);

  function goToPrev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else              { setMonth(m => m - 1); }
  }

  function goToNext() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else              { setMonth(m => m + 1); }
  }

  return (
    <>
      <Header />
      <main style={{ backgroundColor: '#0A0E1A', minHeight: '100vh', paddingTop: '64px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>

          {/* 페이지 헤더 */}
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '4px' }}>
              부동산 달력
            </h1>
            <p style={{ fontSize: '13px', color: '#475569' }}>
              청약 일정 · 금리결정 · 부동산 정책을 한눈에
            </p>
          </div>

          {/* 월 네비게이터 */}
          <MonthNavigator year={year} month={month} onPrev={goToPrev} onNext={goToNext} />

          {/* 상태 표시 */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#475569', fontSize: '13px' }}>
              불러오는 중...
            </div>
          )}
          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
              backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#F87171', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {/* 달력 그리드 */}
          {!isLoading && (
            <CalendarGrid
              year={year}
              month={month}
              subscriptions={subscriptions}
              economic={economic}
              onSubscriptionClick={(e) => setSelected({ kind: 'sub', data: e })}
              onEconomicClick={(e) => setSelected({ kind: 'eco', data: e })}
            />
          )}

          {/* 범례 */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '12px',
            marginTop: '20px', padding: '16px 20px',
            backgroundColor: '#0F1629', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {LEGEND_ITEMS.map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '3px',
                  backgroundColor: color,
                }} />
                <span style={{ fontSize: '11px', color: '#64748B' }}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* 이벤트 상세 모달 */}
      {selected && (
        <EventModal selected={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

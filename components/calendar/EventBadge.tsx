'use client';

import type { SubscriptionCalendarEvent } from '@/lib/calendar-subscription';
import type { EconomicEvent } from '@/app/api/calendar/route';

// ─────────────────────────────────────────
// 카테고리별 스타일 정의
// ─────────────────────────────────────────
const SUBSCRIPTION_STYLE: Record<
  SubscriptionCalendarEvent['type'],
  { bg: string; label: string }
> = {
  special:  { bg: '#1D4ED8', label: '특별공급' },
  first:    { bg: '#2563EB', label: '1순위'   },
  second:   { bg: '#3B82F6', label: '2순위'   },
  announce: { bg: '#7C3AED', label: '당첨발표' },
  contract: { bg: '#059669', label: '계약'    },
};

const ECONOMIC_STYLE: Record<EconomicEvent['category'], { bg: string; textColor: string }> = {
  rate_bok:  { bg: 'rgba(124,58,237,0.15)',  textColor: '#A78BFA' },
  rate_fomc: { bg: 'rgba(109,40,217,0.15)',  textColor: '#8B5CF6' },
  policy:    { bg: 'rgba(217,119,6,0.15)',   textColor: '#FBBF24' },
  tax:       { bg: 'rgba(185,28,28,0.15)',   textColor: '#F87171' },
  movein:    { bg: 'rgba(5,150,105,0.15)',   textColor: '#34D399' },
  holiday:   { bg: 'rgba(55,65,81,0.4)',     textColor: '#9CA3AF' },
  etc:       { bg: 'rgba(71,85,105,0.15)',   textColor: '#94A3B8' },
};

// ─────────────────────────────────────────
// 청약 이벤트 뱃지
// ─────────────────────────────────────────
interface SubscriptionBadgeProps {
  event:   SubscriptionCalendarEvent;
  onClick: (e: SubscriptionCalendarEvent) => void;
}

export function SubscriptionBadge({ event, onClick }: SubscriptionBadgeProps) {
  const style = SUBSCRIPTION_STYLE[event.type];
  return (
    <button
      onClick={() => onClick(event)}
      style={{
        width: '100%', textAlign: 'left', padding: '3px 6px',
        borderRadius: '5px', backgroundColor: style.bg,
        border: 'none', cursor: 'pointer',
        marginBottom: '2px',
      }}
    >
      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: 700, marginBottom: '1px' }}>
        {style.label}
      </div>
      <div style={{
        fontSize: '10px', color: '#fff', fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {event.name}
      </div>
      {event.district && (
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>
          {event.district}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────
// 경제 이벤트 뱃지
// ─────────────────────────────────────────
interface EconomicBadgeProps {
  event:   EconomicEvent;
  onClick: (e: EconomicEvent) => void;
}

export function EconomicBadge({ event, onClick }: EconomicBadgeProps) {
  const style = ECONOMIC_STYLE[event.category];
  return (
    <button
      onClick={() => onClick(event)}
      style={{
        width: '100%', textAlign: 'left', padding: '3px 6px',
        borderRadius: '5px', backgroundColor: style.bg,
        border: 'none', cursor: 'pointer',
        marginBottom: '2px',
      }}
    >
      <div style={{
        fontSize: '10px', color: style.textColor, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {event.emoji && <span style={{ marginRight: '3px' }}>{event.emoji}</span>}
        {event.title}
      </div>
    </button>
  );
}

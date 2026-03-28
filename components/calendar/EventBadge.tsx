'use client';

import { CATEGORY_MAP, type CalendarEvent } from '@/types/calendar';

interface EventBadgeProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

export default function EventBadge({ event, onClick }: EventBadgeProps) {
  const cat = CATEGORY_MAP[event.category];

  return (
    <button
      onClick={() => onClick(event)}
      style={{
        display: 'flex', alignItems: 'center', gap: '4px', width: '100%',
        padding: '2px 6px', borderRadius: '4px', border: 'none', cursor: 'pointer',
        backgroundColor: cat.color + '18',
        fontSize: '11px', fontWeight: 500, color: cat.color,
        textAlign: 'left', lineHeight: '1.3',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}
      title={event.title}
    >
      <span style={{ flexShrink: 0 }}>{event.icon || cat.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</span>
    </button>
  );
}

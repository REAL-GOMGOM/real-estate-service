'use client';

import { CATEGORY_MAP, type CalendarEvent } from '@/types/calendar';

interface EventBadgeProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

// 제목에서 핵심 키워드만 추출 (단지명 또는 이벤트 요약)
function shortenTitle(title: string): string {
  // "래미안 원베일리 특별공급" → "래미안 원베일리"
  // "한국은행 기준금리 결정" → "기준금리"
  // "FOMC 회의 결과 발표" → "FOMC"
  // "주간 아파트 가격 동향" → "주간동향"
  // "고덕 자연앤 하우스디 당첨 발표" → "고덕 자연앤"

  const removeWords = ['청약', '당첨 발표', '당첨발표', '특별공급', '1순위', '2순위', '회의 결과 발표', '결과 발표', '가격 동향'];
  let short = title;
  for (const w of removeWords) {
    short = short.replace(w, '').trim();
  }
  // 12자 초과 시 자름
  if (short.length > 12) short = short.slice(0, 12) + '…';
  return short || title.slice(0, 10);
}

export default function EventBadge({ event, onClick }: EventBadgeProps) {
  const cat = CATEGORY_MAP[event.category];

  return (
    <button
      onClick={() => onClick(event)}
      style={{
        display: 'block', width: '100%',
        padding: '2px 4px', borderRadius: '3px', border: 'none', cursor: 'pointer',
        backgroundColor: cat.color + '20',
        borderLeft: `3px solid ${cat.color}`,
        fontSize: '10px', fontWeight: 600, color: cat.color,
        textAlign: 'left', lineHeight: '1.3',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}
      title={event.title}
    >
      {shortenTitle(event.title)}
    </button>
  );
}

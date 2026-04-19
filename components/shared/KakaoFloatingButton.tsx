'use client';

import { useState } from 'react';
import { BRAND } from '@/lib/design-tokens';

export function KakaoFloatingButton() {
  const [hovered, setHovered] = useState(false);
  const url = process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL;

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="카카오톡 오픈채팅방 참여하기"
      className="group fixed right-6 z-50 flex items-center gap-2 transition-all duration-300 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] motion-reduce:transition-none focus-visible:outline-none"
      style={{
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {/* 툴팁 */}
      <div
        className="px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300"
        style={{
          backgroundColor: BRAND.ink,
          color: 'white',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateX(0)' : 'translateX(10px)',
          pointerEvents: hovered ? 'auto' : 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        내집 커뮤니티 참여 →
      </div>

      {/* 카카오 옐로우 버튼 */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 motion-reduce:transition-none group-focus-visible:ring-4 group-focus-visible:ring-offset-2 group-focus-visible:ring-black"
        style={{
          backgroundColor: '#FEE500',
          boxShadow: hovered
            ? '0 8px 24px rgba(0,0,0,0.2)'
            : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3C6.48 3 2 6.58 2 11c0 2.89 1.91 5.42 4.79 6.81L5.5 21.5l4.34-2.28c.7.13 1.42.19 2.16.19 5.52 0 10-3.58 10-8S17.52 3 12 3z"
            fill="#391B1B"
          />
        </svg>
      </div>
    </a>
  );
}

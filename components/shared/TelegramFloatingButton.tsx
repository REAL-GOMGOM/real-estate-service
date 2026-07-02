'use client';

import { useState } from 'react';
import { BRAND } from '@/lib/design-tokens';

// 텔레그램 채널 플로팅 버튼 (컴포넌트/파일명 rename은 리디자인 사이클에서 처리)
export function KakaoFloatingButton() {
  const [hovered, setHovered] = useState(false);
  const url = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL;

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="내집 텔레그램 채널 참여하기"
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

      {/* 텔레그램 블루 버튼 */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 motion-reduce:transition-none group-focus-visible:ring-4 group-focus-visible:ring-offset-2 group-focus-visible:ring-black"
        style={{
          backgroundColor: '#229ED9',
          boxShadow: hovered
            ? '0 8px 24px rgba(0,0,0,0.2)'
            : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        <svg
          aria-hidden="true"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4 20-7z" />
        </svg>
      </div>
    </a>
  );
}

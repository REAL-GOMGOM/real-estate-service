'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BRAND } from '@/lib/design-tokens';
import { shouldShowTelegramFab } from '@/lib/marketing-routes';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';

export function TelegramFloatingButton() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const url = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip';

  if (!shouldShowTelegramFab(pathname)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={() => trackAnalyticsEvent('telegram_click', {
        placement: 'floating_button',
        page_path: pathname,
      })}
      aria-label="내집 텔레그램 채널 참여하기"
      className="group fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-300 motion-reduce:transition-none md:right-6 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
      style={{ transform: active ? 'translateY(-2px)' : 'translateY(0)' }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 hidden rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-all duration-300 motion-reduce:transition-none md:block"
        style={{
          right: 'calc(100% + 8px)',
          backgroundColor: BRAND.ink,
          color: 'white',
          opacity: active ? 1 : 0,
          transform: active ? 'translate(0, -50%)' : 'translate(10px, -50%)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        내집 커뮤니티 참여 →
      </span>

      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-shadow duration-300 group-focus-visible:ring-4 group-focus-visible:ring-black group-focus-visible:ring-offset-2 motion-reduce:transition-none"
        style={{
          backgroundColor: '#1B4DDB',
          boxShadow: active
            ? '0 8px 24px rgba(0,0,0,0.2)'
            : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        <svg
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
      </span>
    </a>
  );
}

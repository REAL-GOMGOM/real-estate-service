'use client';

import { COOKIE_SETTINGS_OPEN_EVENT } from '@/lib/cookie-consent';

interface CookieSettingsButtonProps {
  floating?: boolean;
}

export function CookieSettingsButton({ floating = false }: CookieSettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_OPEN_EVENT))}
      className={floating
        ? 'fixed left-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[35] rounded-full border bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm md:bottom-4'
        : undefined}
      style={floating
        ? { color: 'var(--text-muted)', borderColor: 'var(--border)' }
        : { fontSize: '14px', color: '#6B5B4F', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      aria-label={floating ? '쿠키 및 광고 설정 열기' : undefined}
    >
      쿠키 설정
    </button>
  );
}

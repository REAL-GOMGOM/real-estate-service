'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getConsent, setConsent } from '@/lib/cookie-consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const consent = getConsent();
    setVisible(consent === null);

    const handleReopen = () => setVisible(true);
    window.addEventListener('naezip:cookie-settings-open', handleReopen);

    const handleChanged = () => {
      const c = getConsent();
      if (c !== null) setVisible(false);
    };
    window.addEventListener('naezip:consent-changed', handleChanged);

    return () => {
      window.removeEventListener('naezip:cookie-settings-open', handleReopen);
      window.removeEventListener('naezip:consent-changed', handleChanged);
    };
  }, []);

  if (!mounted || !visible) return null;

  const accept = () => {
    setConsent(true);
    setVisible(false);
  };
  const reject = () => {
    setConsent(false);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="쿠키 사용 동의"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur-sm shadow-lg"
      style={{
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto max-w-5xl p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <p className="flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          본 사이트는 방문 분석을 위해 쿠키를 사용합니다. 자세한 내용은{' '}
          <Link
            href="/privacy"
            className="underline underline-offset-2"
            style={{ color: 'var(--text-primary)' }}
          >
            개인정보 처리방침
          </Link>
          을 참고해주세요.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={reject}
            className="px-4 py-2 text-sm rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            거부
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm rounded-md text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none"
            style={{
              backgroundColor: 'var(--text-primary)',
            }}
          >
            수락하고 계속
          </button>
        </div>
      </div>
    </div>
  );
}

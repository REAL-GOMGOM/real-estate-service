'use client';

import { useEffect } from 'react';
import { useConsent } from '@/hooks/useConsent';

/** 분석 동의가 있는 브라우저만 동일 출처의 익명 방문 집계에 참여한다. */
export function VisitorAnalytics() {
  const consent = useConsent();

  useEffect(() => {
    if (consent?.analytics !== true) return;

    void fetch('/api/analytics/visit', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'x-naezip-analytics-consent': 'granted' },
    }).catch(() => undefined);
  }, [consent?.analytics]);

  return null;
}

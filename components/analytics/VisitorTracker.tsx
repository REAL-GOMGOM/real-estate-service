'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 자체 방문자 카운터 트래커
 *
 * - 모든 라우트 진입·변경 시 /api/track 호출
 * - fingerprint(IP+UA) 기반 server-side dedupe로 중복 카운트 흡수
 *   (lib/visitor-tracking.ts의 visitors:day:* / active24h Set 단위)
 * - 봇·관리자 IP 제외는 server-side(lib/visitor-tracking.ts) 처리
 * - dev mode StrictMode 더블 mount는 fingerprint dedupe로 흡수
 *
 * 본 컴포넌트는 DOM 렌더 0, side-effect 전용
 */
export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // keepalive: 빠른 navigation 직후 race 안전
    fetch('/api/track', { method: 'POST', keepalive: true })
      .catch(() => { /* fail-open */ });
  }, [pathname]);

  return null;
}

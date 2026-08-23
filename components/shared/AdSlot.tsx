'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useConsent } from '@/hooks/useConsent';
import { ADSENSE_READY_EVENT } from './AdSenseLoader';
import { useAdSenseRegionEligibility } from '@/hooks/useAdSenseRegionEligibility';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

interface AdSlotProps {
  type: 'article' | 'bottom';
  slotId?: string;
  label?: string;
}

/** 광고 동의 후 수동 요청하며, 광고 크기만큼 공간을 먼저 예약한다. */
export function AdSlot({ type, slotId, label = '광고' }: AdSlotProps) {
  const consent = useConsent();
  const pushed = useRef(false);
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const isProduction = process.env.NODE_ENV === 'production';
  const baseEnabled = isProduction && Boolean(publisherId && slotId) && consent?.advertising === true;
  const enabled = useAdSenseRegionEligibility(baseEnabled);

  const requestAd = useCallback(() => {
    if (!enabled || pushed.current) return;
    try {
      window.adsbygoogle = window.adsbygoogle ?? [];
      window.adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // 차단 확장 프로그램이나 공급자 스크립트 실패 시 빈 예약 영역만 유지한다.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      pushed.current = false;
      return;
    }
    requestAd();
    window.addEventListener(ADSENSE_READY_EVENT, requestAd);
    return () => window.removeEventListener(ADSENSE_READY_EVENT, requestAd);
  }, [enabled, requestAd]);

  if (!enabled || !publisherId || !slotId) return null;

  const reservedHeight = type === 'article' ? 280 : 250;

  return (
    <aside className="mx-auto max-w-5xl px-4 py-6 md:px-6" aria-label={`${label} 영역`}>
      <div className="mb-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ minHeight: `${reservedHeight}px` }}>
        <ins
          className="adsbygoogle block"
          style={{ display: 'block', minHeight: `${reservedHeight}px` }}
          data-ad-client={publisherId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}

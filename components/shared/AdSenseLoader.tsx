'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useConsent } from '@/hooks/useConsent';
import { shouldLoadAdSense } from '@/lib/marketing-routes';
import { useAdSenseRegionEligibility } from '@/hooks/useAdSenseRegionEligibility';

export const ADSENSE_READY_EVENT = 'naezip:adsense-ready';

/** 광고 동의가 있고 실제 슬롯이 있는 경로에서만 AdSense를 불러온다. */
export function AdSenseLoader() {
  const pathname = usePathname();
  const consent = useConsent();
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const hasConfiguredSlot = Boolean(
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE
    || process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM,
  );
  const isProduction = process.env.NODE_ENV === 'production';
  const baseEnabled = Boolean(
    isProduction
    && publisherId
    && hasConfiguredSlot
    && consent?.advertising === true
    && shouldLoadAdSense(pathname),
  );
  const regionEligible = useAdSenseRegionEligibility(baseEnabled);

  if (!baseEnabled || !regionEligible || !publisherId) {
    return null;
  }

  return (
    <Script
      id="google-adsense"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onReady={() => {
        window.dispatchEvent(new Event(ADSENSE_READY_EVENT));
      }}
    />
  );
}

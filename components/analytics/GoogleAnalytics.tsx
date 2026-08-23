'use client';

import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google';
import { useConsent } from '@/hooks/useConsent';

export function GoogleAnalytics() {
  const consent = useConsent();
  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

  if (consent?.analytics !== true || !gaId) return null;

  return <NextGoogleAnalytics gaId={gaId} />;
}

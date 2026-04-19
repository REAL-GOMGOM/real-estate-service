'use client';

import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google';
import { useEffect, useState } from 'react';
import { getConsent } from '@/lib/cookie-consent';

export function GoogleAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = () => {
      const consent = getConsent();
      setAllowed(consent?.analytics === true);
    };
    check();

    window.addEventListener('naezip:consent-changed', check);
    window.addEventListener('storage', check);

    return () => {
      window.removeEventListener('naezip:consent-changed', check);
      window.removeEventListener('storage', check);
    };
  }, []);

  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

  if (!allowed || !gaId) return null;

  return <NextGoogleAnalytics gaId={gaId} />;
}

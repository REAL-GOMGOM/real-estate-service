/**
 * AdSense Loader — Phase 5c-7 Stage 3.5
 *
 * 프로덕션 환경 + Publisher ID 설정 시에만 AdSense 스크립트 로드.
 * 개발 환경에서는 렌더 안 함.
 */

import Script from 'next/script';

export function AdSenseLoader() {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction || !publisherId) return null;

  return (
    <Script
      id="google-adsense"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}

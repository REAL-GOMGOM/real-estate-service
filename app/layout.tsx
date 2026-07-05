import type { Metadata } from 'next';
import './globals.css';
import { TelegramFloatingButton } from '@/components/shared/TelegramFloatingButton';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { CookieConsent } from '@/components/analytics/CookieConsent';
import { AdSenseLoader } from '@/components/shared/AdSenseLoader';

export const metadata: Metadata = {
  title: '내집(My.ZIP) | 실거래가·투자분석·건축정보 — 부동산 통합 플랫폼',
  description: '집값이 궁금할 때, 투자 고민될 때, 우리 동네 뭐가 생기는지 알고 싶을 때 — 부동산의 모든 답을 내집에서 한번에.',
  keywords: ['내집', 'My.ZIP', '실거래가', '아파트시세', '부동산투자', '청약정보', '입지분석'],
  openGraph: {
    title: '내집(My.ZIP) | 부동산의 모든 답, 한곳에',
    description: '실거래가·투자분석·입지점수·청약정보를 한곳에 압축.',
    type: 'website',
    url: 'https://www.naezipkorea.com',
    siteName: '내집(My.ZIP)',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '내집(My.ZIP) | 부동산의 모든 답, 한곳에',
    description: '실거래가·투자분석·입지점수·청약정보를 한곳에 압축.',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  manifest: '/manifest.json',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: { 'naver-site-verification': '794ff6d4d4f358c239962451d25e8f040d10603f' },
  },
  other: { 'theme-color': '#1B4DDB' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.removeAttribute('data-theme');localStorage.removeItem('theme');` }} />
      </head>
      <body>
        {/* 구조화 데이터 — 브랜드 검색·사이트링크 시그널 (사이클 Z4) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: '내집 My.ZIP',
                alternateName: ['내집', 'My.ZIP', 'naezipkorea'],
                url: 'https://www.naezipkorea.com',
              },
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: '내집 My.ZIP',
                url: 'https://www.naezipkorea.com',
                logo: 'https://www.naezipkorea.com/icon.png',
              },
            ]),
          }}
        />
        {children}
        <TelegramFloatingButton />
        <GoogleAnalytics />
        <CookieConsent />
        <AdSenseLoader />
      </body>
    </html>
  );
}

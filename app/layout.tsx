import type { Metadata } from 'next';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: '내집(Naezip) | 실거래가·투자분석·건축정보 — 부동산 통합 플랫폼',
  description: '집값이 궁금할 때, 투자 고민될 때, 우리 동네 뭐가 생기는지 알고 싶을 때 — 부동산의 모든 답을 내집에서 한번에.',
  keywords: ['내집', 'Naezip', '실거래가', '아파트시세', '부동산투자', '청약정보', '입지분석'],
  openGraph: {
    title: '내집(Naezip) | 부동산의 모든 답, 한곳에',
    description: '실거래가·투자분석·입지점수·청약정보를 한곳에 압축.',
    type: 'website',
    url: 'https://www.naezipkorea.com',
    siteName: '내집(Naezip)',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '내집(Naezip) | 부동산의 모든 답, 한곳에',
    description: '실거래가·투자분석·입지점수·청약정보를 한곳에 압축.',
  },
  other: { 'theme-color': '#C4654A' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var t = localStorage.getItem('theme');
              if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            })();
          `,
        }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

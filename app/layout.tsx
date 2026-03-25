import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '부동산 인사이트 | 시세·입지·청약 토탈 서비스',
  description: '서울 및 수도권 부동산 시세 분석, 입지 점수 지도, 청약 정보를 한 곳에서 확인하세요.',
  keywords: ['부동산', '시세', '청약', '입지분석', '아파트'],
  openGraph: {
    title: '부동산 인사이트',
    description: '서울 및 수도권 부동산 토탈 서비스',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
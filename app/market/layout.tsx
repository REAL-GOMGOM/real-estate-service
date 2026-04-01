import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '시장 개요 | 내집(My.ZIP)',
  description: '주요 지역 아파트 시세 현황을 확인하세요.',
  openGraph: {
    title: '시장 개요 | 내집',
    description: '주요 지역 아파트 시세 현황',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

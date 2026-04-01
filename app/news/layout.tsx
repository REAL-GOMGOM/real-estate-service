import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '부동산 뉴스 | 내집(My.ZIP)',
  description: '부동산 시장 최신 뉴스를 한눈에 확인하세요.',
  openGraph: {
    title: '부동산 뉴스 | 내집',
    description: '부동산 시장 최신 뉴스',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

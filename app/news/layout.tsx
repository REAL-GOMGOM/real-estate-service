import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/metadata';

export const metadata: Metadata = {
  ...createPageMetadata({
    title: '부동산 뉴스 | 내집(My.ZIP)',
    description: '자동 수집한 부동산 관련 최신 기사를 출처 링크와 함께 확인하세요.',
    path: '/news',
  }),
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) { return children; }

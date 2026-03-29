import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '부동산 지도 | 부동산 인사이트',
  description: '전국 입지 점수 지도와 학군 정보를 한번에 확인하세요.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

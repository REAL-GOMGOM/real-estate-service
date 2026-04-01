import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '상승률 대시보드 | 내집',
  description: '시도별 아파트 가격 변동률 추이를 시각화한 대시보드.',
  openGraph: {
    title: '상승률 대시보드 | 내집',
    description: '시도별 아파트 가격 변동률 추이를 시각화한 대시보드.',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

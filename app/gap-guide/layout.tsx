import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '갭투자 가이드 | 내집',
  description: '갭투자의 개념, 시뮬레이터, 체크포인트, 리스크를 한눈에 알아보세요.',
  openGraph: {
    title: '갭투자 가이드 | 내집',
    description: '갭투자의 개념, 시뮬레이터, 체크포인트, 리스크를 한눈에 알아보세요.',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '청약 정보 | 내집(My.ZIP)',
  description: '수도권 청약 일정, 경쟁률, 분양가 정보를 한 곳에서 확인하세요.',
  openGraph: {
    title: '청약 정보 | 내집',
    description: '수도권 청약 일정·경쟁률·분양가',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

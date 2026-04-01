import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '경제 달력 | 내집',
  description: '청약·금리·입주·정책 일정을 달력으로 한눈에 확인하세요.',
  openGraph: {
    title: '경제 달력 | 내집',
    description: '청약·금리·입주·정책 일정을 달력으로 한눈에 확인하세요.',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '갭 분석 | 내집',
  description: '두 단지 실거래가 갭을 비교하여 저평가/고평가를 분석합니다.',
  openGraph: {
    title: '갭 분석 | 내집',
    description: '두 단지 실거래가 갭을 비교하여 저평가/고평가를 분석합니다.',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '아파트 시세 차트 | 내집(My.ZIP)',
  description: '서울·경기·인천 아파트 실거래가 시세를 차트로 분석하세요. 이동평균, 거래량, 변동률을 한눈에 확인합니다.',
  openGraph: {
    title: '아파트 시세 차트 | 내집',
    description: '실거래가 시세 차트 분석 — 서울·경기·인천',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

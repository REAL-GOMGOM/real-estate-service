import type { Metadata } from 'next';
import HighlightsClient from './HighlightsClient';

export const metadata: Metadata = {
  title: '오늘의 주요거래 — 신고가·급등·국평 고가 | 내집 My.ZIP',
  description:
    '오늘 공개된 아파트 실거래 중 신고가, 급등, 국민평형(84㎡) 고가 거래를 한눈에. 국토교통부 실거래가 공개시스템 기준.',
};

export default function HighlightsPage() {
  return <HighlightsClient />;
}

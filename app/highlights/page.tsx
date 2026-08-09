import HighlightsClient from './HighlightsClient';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '최근 30일 주요거래 — 신고가·급등·국평 고가 | 내집 My.ZIP',
  description:
    '최근 30일 신고된 아파트 실거래 중 신고가, 급등, 국민평형(84㎡) 고가 거래를 한눈에. 국토교통부 실거래가 공개시스템 기준.',
  path: '/highlights',
});

export default function HighlightsPage() {
  return <HighlightsClient />;
}

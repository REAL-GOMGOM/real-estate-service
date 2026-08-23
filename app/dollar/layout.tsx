import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '아파트 실질가치 비교 | 내집(My.ZIP)',
  description: '달러·비트코인·금 기준으로 아파트 실질 가치가 어떻게 변했는지 비교 분석합니다.',
  path: '/dollar',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

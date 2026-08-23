import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '갭 분석 | 내집',
  description: '두 단지 실거래가 갭을 비교하여 저평가/고평가를 분석합니다.',
  path: '/gap-analysis',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

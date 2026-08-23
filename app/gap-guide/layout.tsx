import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '갭투자 가이드 | 내집',
  description: '갭투자의 개념, 시뮬레이터, 체크포인트, 리스크를 한눈에 알아보세요.',
  path: '/gap-guide',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

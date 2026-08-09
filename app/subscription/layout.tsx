import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '청약 정보 | 내집(My.ZIP)',
  description: '수도권 청약 일정, 경쟁률, 분양가 정보를 한 곳에서 확인하세요.',
  path: '/subscription',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

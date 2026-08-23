import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '부동산 지도 | 내집',
  description: '등록된 주요 권역의 자체 입지 점수와 학교알리미 학군 정보를 지도에서 확인하세요.',
  path: '/location-map',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

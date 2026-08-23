import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '매매/전세 변동률 지도 | 내집',
  description: '한국부동산원 공식 데이터 기반 시도별 아파트 가격 변동률 현황.',
  path: '/price-map',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

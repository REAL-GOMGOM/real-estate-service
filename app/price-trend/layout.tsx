import { createPageMetadata } from '@/lib/metadata';
export const metadata = createPageMetadata({
  title: '아파트 매매가격지수 추이 | 내집',
  description: '한국부동산원 월간 아파트 매매가격지수를 선택 기간의 첫 공개 월 대비 누적 변동률로 비교합니다.',
  path: '/price-trend',
});
export default function Layout({ children }: { children: React.ReactNode }) { return children; }

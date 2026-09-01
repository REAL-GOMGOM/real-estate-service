import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import FieldReportsHome from '@/components/field-reports/FieldReportsHome';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '현장 제보가격 | 내집(My.ZIP)',
  description: '공식 실거래 공개 전, 이웃이 전하는 계약 소식. 현장 제보가격은 공식 실거래와 별개인 미확인 정보이며 검수 후 공개됩니다.',
  path: '/field-reports',
});

export default function FieldReportsPage() {
  return <><Header /><main><FieldReportsHome expanded /></main><Footer /></>;
}

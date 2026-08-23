import { Suspense } from 'react';
import TransactionsClient from './TransactionsClient';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '아파트 실거래가 조회 | 내집(My.ZIP)',
  description:
    '국토교통부 공개자료 기반 아파트 매매·전세·월세·분양권 실거래를 지역과 단지별로 조회하세요.',
  path: '/transactions',
});

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsClient />
    </Suspense>
  );
}

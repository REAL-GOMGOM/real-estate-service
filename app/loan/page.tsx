import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import LoanSimulator from '@/components/loan/LoanSimulator';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '주택담보대출 시뮬레이터 | 내집(My.ZIP)',
  description:
    '주택 가격과 소득, 금리, 기간을 입력해 예상 원리금과 DSR을 계산합니다. 실제 대출 조건은 금융기관 심사를 확인하세요.',
  path: '/loan',
});

export default function LoanPage() {
  return (
    <>
      <Header />
      <LoanSimulator />
      <Footer />
    </>
  );
}

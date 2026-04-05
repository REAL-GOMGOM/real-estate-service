import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import LoanSimulator from '@/components/loan/LoanSimulator';

export const metadata = { title: '대출 시뮬레이터 | 내집' };

export default function LoanPage() {
  return (
    <>
      <Header />
      <LoanSimulator />
      <Footer />
    </>
  );
}

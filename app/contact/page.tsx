import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ContactClient from '@/components/contact/ContactClient';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '문의하기 | 내집(My.ZIP)',
  description:
    '데이터 오류 제보, 제휴, 광고 및 서비스 이용 문의를 내집(My.ZIP) 운영팀에 보내주세요.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <Header />
      <ContactClient />
      <Footer />
    </>
  );
}

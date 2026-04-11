import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ContactClient from '@/components/contact/ContactClient';

export const metadata = { title: '문의하기 | 내집(My.ZIP)' };

export default function ContactPage() {
  return (
    <>
      <Header />
      <ContactClient />
      <Footer />
    </>
  );
}

import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import SchoolsClient from './SchoolsClient';
import { createPageMetadata } from '@/lib/metadata';

/**
 * 학교 랭킹 페이지 (2026-07) — 시군구별 초·중·고 리스트.
 * 데이터는 학교알리미 공시 정적 JSON (연 1회 갱신) — DB·외부 API 무의존.
 */

export const metadata = createPageMetadata({
  title: '학교 랭킹 — 전국 초·중·고 학생수·학급당·전출입 | 내집',
  description:
    '전국 11,973개 초·중·고등학교의 학생수, 학급당 학생수, 전출입(학군 수요) 랭킹. 학교알리미 공시 기반, 시군구별 비교.',
  path: '/schools',
});

export default function SchoolsPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <SchoolsClient />
      </main>
      <Footer />
    </>
  );
}

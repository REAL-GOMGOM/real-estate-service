import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// auth()가 cookies()를 사용하므로 정적 prerender 비활성
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '어드민 — 내집(My.ZIP)',
  robots: { index: false, follow: false },
};

/**
 * 어드민 대시보드 (임시).
 *
 * PR 2C에서 layout으로 보호 일관화 예정. 그 전엔 페이지 자체에서 auth() 검증.
 * 본격 대시보드 UI는 PR 4 (글 CRUD) 시점.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/admin/login');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">어드민 대시보드</h1>
        <p className="mt-2 text-sm text-slate-600">
          {session.user.email} 으로 로그인됨
        </p>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            본격 대시보드 UI는 PR 4 (글 CRUD)에서 구축 예정입니다.
          </p>
        </div>
      </div>
    </main>
  );
}

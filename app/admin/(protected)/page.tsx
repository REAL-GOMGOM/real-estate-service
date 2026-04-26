import { Suspense } from 'react';
import { auth } from '@/auth';

export const metadata = {
  title: '어드민 — 내집(My.ZIP)',
  robots: { index: false, follow: false },
};

/**
 * 어드민 대시보드.
 *
 * 인증 검증은 (protected) layout이 처리. 이 페이지는 UI만.
 * 본격 대시보드는 PR 4 (글 CRUD)에서 구축 예정.
 */
export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">어드민 대시보드</h1>
        <Suspense
          fallback={
            <p className="mt-2 text-sm text-slate-400">로그인 정보 로딩...</p>
          }
        >
          <UserInfo />
        </Suspense>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            본격 대시보드 UI는 PR 4 (글 CRUD)에서 구축 예정입니다.
          </p>
        </div>
      </div>
    </main>
  );
}

async function UserInfo() {
  const session = await auth();
  return (
    <p className="mt-2 text-sm text-slate-600">
      {session?.user?.email ?? '알 수 없음'} 으로 로그인됨
    </p>
  );
}

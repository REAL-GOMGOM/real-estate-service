import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: '어드민 로그인 — 내집(My.ZIP)',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ error?: string; callbackUrl?: string }>;

/**
 * 어드민 로그인 페이지 (PPR 호환).
 *
 * - 정적 shell: 헤더, 폼 컨테이너 (정적 prerender)
 * - 동적 영역: LoginShell 안에서 searchParams + auth() await
 *
 * cacheComponents 모드 규칙: searchParams Promise는 Page 함수 본문에서 직접
 * await하지 말고 Suspense 자식 컴포넌트로 전달해서 거기서 await.
 */
export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">내집(My.ZIP) 어드민</h1>
          <p className="mt-2 text-sm text-slate-600">관리자 로그인</p>
        </div>
        <Suspense fallback={<LoginFormFallback />}>
          <LoginShell searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginShell({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, auth()]);

  if (session?.user) {
    redirect('/admin');
  }

  return (
    <LoginForm
      errorParam={params.error}
      callbackUrl={params.callbackUrl ?? '/admin'}
    />
  );
}

function LoginFormFallback() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div className="h-9 rounded-md bg-slate-100" />
        <div className="h-9 rounded-md bg-slate-100" />
        <div className="h-9 rounded-md bg-slate-200" />
      </div>
    </div>
  );
}

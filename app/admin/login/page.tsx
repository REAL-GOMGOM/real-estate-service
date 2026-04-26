import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from './LoginForm';

// auth()가 cookies()를 사용하므로 정적 prerender 비활성 (단독 어드민이라 캐싱 무의미)
export const dynamic = 'force-dynamic';

/**
 * 어드민 로그인 페이지 (Server Component).
 *
 * 이미 로그인된 상태면 /admin으로 redirect.
 * 폼 자체는 LoginForm (Client Component)에 위임.
 */
export const metadata = {
  title: '어드민 로그인 — 내집(My.ZIP)',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect('/admin');
  }

  const params = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">내집(My.ZIP) 어드민</h1>
          <p className="mt-2 text-sm text-slate-600">관리자 로그인</p>
        </div>
        <LoginForm errorParam={params.error} callbackUrl={params.callbackUrl ?? '/admin'} />
      </div>
    </main>
  );
}

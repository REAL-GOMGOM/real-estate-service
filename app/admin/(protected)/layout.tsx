import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AdminHeader } from './AdminHeader';

/**
 * /admin 보호 영역 공통 레이아웃.
 *
 * - route group (protected) 안의 모든 페이지에 인증 필수
 * - /admin/login은 그룹 밖이라 보호 X
 * - 인증 통과 시 공통 헤더(AdminHeader) + children 렌더
 *
 * PPR: AuthShell만 Suspense 안에서 dynamic. 정적 shell은 prerender.
 * auth() 한 번 호출로 검증·이메일 추출 모두 처리.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}

async function AuthShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/admin/login');
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader email={session.user.email} />
      {children}
    </div>
  );
}

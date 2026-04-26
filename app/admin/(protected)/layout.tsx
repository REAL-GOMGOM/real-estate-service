import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/**
 * /admin 보호 영역 공통 레이아웃.
 *
 * 보호 정책: route group (protected) 안의 모든 페이지에 인증 필수.
 * /admin/login은 이 그룹 밖이라 보호 X.
 *
 * PPR 호환: auth() 호출을 Suspense 경계 안의 자식 컴포넌트로 격리.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}

async function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/admin/login');
  }
  return <>{children}</>;
}

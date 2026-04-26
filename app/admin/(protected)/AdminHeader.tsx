import Link from 'next/link';
import { logoutAction } from '@/app/admin/actions';

/**
 * 어드민 공통 헤더.
 *
 * 좌측: 로고 + 네비게이션 (대시보드, 카테고리)
 * 우측: 사용자 이메일 + 로그아웃
 *
 * Server Component (props만, 정적 prerender 가���).
 * 인증·이메일은 부모 layout(AuthShell)에서 props 전달.
 */
export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-sm font-semibold text-slate-900">
            내집(My.ZIP) 어드민
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-slate-600 hover:text-slate-900">
              대시보드
            </Link>
            <Link href="/admin/posts" className="text-slate-600 hover:text-slate-900">
              글
            </Link>
            <Link href="/admin/categories" className="text-slate-600 hover:text-slate-900">
              카테고리
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{email}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              ��그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

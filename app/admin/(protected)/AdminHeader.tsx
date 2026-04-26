import { logoutAction } from '@/app/admin/actions';

/**
 * 어드민 공통 헤더.
 *
 * Server Component (props만) — 정적 prerender 가능.
 * 인증·이메일 조회는 부모 layout(AuthShell)에서 처리하고 props로 전달.
 * 로그아웃: form action으로 Server Action 호출 (CSRF 보호 자동).
 */
export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">
          내집(My.ZIP) 어드민
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{email}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

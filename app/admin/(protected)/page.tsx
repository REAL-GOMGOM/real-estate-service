export const metadata = {
  title: '어드민 — 내집(My.ZIP)',
  robots: { index: false, follow: false },
};

/**
 * 어드민 대시보드.
 *
 * 인증·이메일 표시는 (protected) layout이 처리.
 * 본격 대시보드 UI는 PR 4 (글 CRUD)에서 구축.
 *
 * 정적 마크업이라 prerender 가능 — PPR 효과 극대화.
 */
export default function AdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          본격 대시보드 UI는 PR 4 (글 CRUD)에서 구축 예정입니다.
        </p>
      </div>
    </main>
  );
}

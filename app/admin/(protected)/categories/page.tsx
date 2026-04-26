import { Suspense } from 'react';
import { desc } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { CategoryCreateForm } from './CategoryCreateForm';

export const metadata = {
  title: '카테고리 — 내집(My.ZIP) 어드민',
  robots: { index: false, follow: false },
};

/**
 * 카테고리 관리 페이지.
 *
 * 정적 shell: 헤더, 폼 컨테이너, 섹션 제목 (PPR prerender)
 * 동적: CategoryList (DB select) — Suspense 격리
 * 인증은 (protected) layout이 자동 처리.
 */
export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">카테고리 관리</h1>
      <p className="mt-1 text-sm text-slate-600">
        칼럼 글을 분류하는 카테고리를 추가하고 관리합니다.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">새 카테고리 추가</h2>
        <div className="mt-3">
          <CategoryCreateForm />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold text-slate-700">전체 카테고리</h2>
        <div className="mt-3">
          <Suspense fallback={<TableSkeleton />}>
            <CategoryList />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function CategoryList() {
  const rows = await getBlogDb()
    .select()
    .from(categories)
    .orderBy(desc(categories.createdAt));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">
          아직 카테고리가 없습니다. 위 폼에서 추가하거나{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:seed</code>로
          초기 카테고리를 시드하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">slug</th>
            <th className="px-4 py-2">이름</th>
            <th className="px-4 py-2">설명</th>
            <th className="px-4 py-2">생성일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2 font-mono text-xs text-slate-700">{c.slug}</td>
              <td className="px-4 py-2 text-slate-900">{c.name}</td>
              <td className="px-4 py-2 text-slate-600">{c.description ?? '—'}</td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {new Date(c.createdAt).toLocaleDateString('ko-KR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-10 rounded bg-slate-100" />
      <div className="h-10 rounded bg-slate-50" />
      <div className="h-10 rounded bg-slate-50" />
    </div>
  );
}

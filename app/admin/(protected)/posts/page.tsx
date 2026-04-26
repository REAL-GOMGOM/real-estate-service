import { Suspense } from 'react';
import Link from 'next/link';
import { desc, eq, and } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts, categories, type Category } from '@/lib/db/schema';
import { publishPostAction, unpublishPostAction } from './actions';
import { PostFilters } from './PostFilters';
import { DeleteButton } from './DeleteButton';

export const metadata = {
  title: '글 관리 — 내집(My.ZIP) 어드민',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ status?: string; category?: string }>;

/**
 * 글 목록 페이지.
 *
 * PPR 호환:
 * - 정적 shell: 헤더, "+ 새 글" 버튼, 섹션 제목
 * - 동적: PostListSection (searchParams + DB select) — Suspense 격리
 *
 * 인증은 (protected) layout이 처리.
 */
export default function PostsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">글 관리</h1>
        <Link
          href="/admin/posts/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          + 새 글
        </Link>
      </div>

      <Suspense fallback={<ListSkeleton />}>
        <PostListSection searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PostListSection({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const db = getBlogDb();

  // 카테고리 목록 (필터 드롭다운용)
  const allCategories = await db
    .select()
    .from(categories)
    .orderBy(categories.name);

  // 필터 조건 빌드
  const conditions = [];
  if (params.status === 'draft' || params.status === 'published') {
    conditions.push(eq(posts.status, params.status));
  }
  if (params.category && params.category !== 'all') {
    conditions.push(eq(posts.categoryId, params.category));
  }

  // 글 목록 (카테고리 leftJoin)
  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      status: posts.status,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      categoryName: categories.name,
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(posts.updatedAt));

  return (
    <div className="mt-8">
      <div className="mb-6">
        <PostFilters categories={allCategories as Category[]} />
      </div>

      <p className="mb-4 text-sm text-slate-500">{rows.length}개의 글</p>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">제목</th>
                <th className="px-4 py-2">카테고리</th>
                <th className="px-4 py-2">상태</th>
                <th className="px-4 py-2">수정일</th>
                <th className="px-4 py-2 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <PostRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PostRow({
  row,
}: {
  row: {
    id: string;
    slug: string;
    title: string;
    status: 'draft' | 'published';
    publishedAt: Date | null;
    updatedAt: Date;
    categoryName: string | null;
  };
}) {
  const isDraft = row.status === 'draft';
  const toggleAction = isDraft
    ? publishPostAction.bind(null, row.id)
    : unpublishPostAction.bind(null, row.id);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <Link
          href={`/admin/posts/${row.id}/edit`}
          className="font-medium text-slate-900 hover:text-slate-700"
        >
          {row.title}
        </Link>
        <p className="mt-0.5 font-mono text-xs text-slate-400">{row.slug}</p>
      </td>
      <td className="px-4 py-3 text-slate-600">
        {row.categoryName ?? '—'}
      </td>
      <td className="px-4 py-3">
        <form action={toggleAction} className="inline">
          <button
            type="submit"
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              isDraft
                ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                : 'bg-green-100 text-green-700 hover:bg-slate-100 hover:text-slate-600'
            }`}
          >
            {isDraft ? '임시저장' : '발행됨'}
          </button>
        </form>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {new Date(row.updatedAt).toLocaleDateString('ko-KR')}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/posts/${row.id}/edit`}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            수정
          </Link>
          <DeleteButton id={row.id} title={row.title} />
        </div>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
      <p className="text-sm text-slate-500">
        아직 글이 없습니다.{' '}
        <Link href="/admin/posts/new" className="font-medium text-slate-900 hover:underline">
          새 글 작성하기
        </Link>
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8 space-y-3">
      <div className="h-10 rounded bg-slate-100" />
      <div className="h-12 rounded bg-slate-50" />
      <div className="h-12 rounded bg-slate-50" />
      <div className="h-12 rounded bg-slate-50" />
    </div>
  );
}

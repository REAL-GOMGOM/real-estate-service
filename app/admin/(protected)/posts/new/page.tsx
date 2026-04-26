import { Suspense } from 'react';
import { getBlogDb } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { PostForm } from '../PostForm';

export const metadata = {
  title: '새 글 작성 — 내집(My.ZIP) 어드민',
  robots: { index: false, follow: false },
};

/**
 * 새 글 작성 페이지.
 *
 * 정적 shell: 헤더, 폼 컨테이너 (PPR로 prerender)
 * 동적: PostFormShell — 카테고리 list fetch (Suspense 격리)
 */
export default function NewPostPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">새 글 작성</h1>
      <p className="mt-1 text-sm text-slate-600">
        칼럼을 작성하고 임시저장 또는 즉시 발행합니다.
      </p>

      <div className="mt-8">
        <Suspense fallback={<FormSkeleton />}>
          <PostFormShell />
        </Suspense>
      </div>
    </main>
  );
}

async function PostFormShell() {
  const cats = await getBlogDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(categories.name);

  return <PostForm mode="create" categories={cats} />;
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 rounded bg-slate-100" />
      <div className="h-96 rounded bg-slate-100" />
    </div>
  );
}

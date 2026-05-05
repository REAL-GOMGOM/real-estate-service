import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts, categories } from '@/lib/db/schema';
import { PostForm } from '../../PostForm';
import { DeleteButton } from '../../DeleteButton';
import { unpublishPostAction } from '../../actions';

export const metadata = {
  title: '글 수정 — 내집(My.ZIP) 어드민',
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ id: string }>;

/**
 * 글 수정 페이지.
 *
 * URL의 id가 UUID 형식이 아니면 notFound (404).
 * DB에 글 없으면 notFound (404).
 *
 * 추가 액션 (PostForm 외부에 별도 form):
 * - 임시저장으로 되돌리기 (이미 published 상태인 경우만)
 * - 삭제
 */
export default function EditPostPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">글 수정</h1>

      <div className="mt-8">
        <Suspense fallback={<FormSkeleton />}>
          <EditShell params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function EditShell({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const db = getBlogDb();
  const [postRows, cats] = await Promise.all([
    db.select().from(posts).where(eq(posts.id, id)).limit(1),
    db
      .select({ id: categories.id, slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(categories.name),
  ]);

  const post = postRows[0];
  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PostForm mode="edit" post={post} categories={cats} />

      {/* 추가 액션 영역 — PostForm 외부 (form 중첩 회피) */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-600">
          현재 상태:{' '}
          <span
            className={
              post.status === 'published'
                ? 'font-semibold text-green-700'
                : 'font-semibold text-slate-700'
            }
          >
            {post.status === 'published' ? '발행됨' : '임시저장'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/posts/${post.id}/preview`}
            target="_blank"
            rel="noopener"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            발행 페이지 미리보기 ↗
          </Link>
          {post.status === 'published' && (
            <form action={unpublishPostAction.bind(null, post.id)}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                임시저장으로 되돌리기
              </button>
            </form>
          )}
          <DeleteButton id={post.id} title={post.title} />
        </div>
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 rounded bg-slate-100" />
      <div className="h-96 rounded bg-slate-100" />
    </div>
  );
}

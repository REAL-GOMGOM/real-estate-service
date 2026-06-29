import { Suspense } from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import remarkGfm from 'remark-gfm';

import { mdxComponents } from '@/app/blog/components/mdx-components';
import { getPostByIdForAdmin } from '@/lib/blog/queries';
import { preprocessMdxContent } from '@/lib/blog/preprocessor';
import { evaluatePreviewAccess } from './access';

/**
 * 공개 미리보기 라우트 (어드민 그룹 밖).
 *
 * 봇이 텔레그램으로 보낸 서명 토큰 링크를 본인이 폰 브라우저에서
 * 어드민 로그인 없이 열어 draft 글의 실제 렌더 결과를 확인하는 용도.
 *
 * 보안:
 * - ?token= 의 HMAC 서명·만료·postId 바인딩을 evaluatePreviewAccess 로 검증.
 * - 검증 실패 시 글 내용을 절대 조회/노출하지 않고 안내 페이지만 표시.
 * - robots noindex 강제(아래 metadata).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: '미리보기 — 내집(My.ZIP)',
};

interface PublicPreviewProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

/** 유효하지 않은 링크 안내 (글 내용 미노출). */
function InvalidNotice() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-slate-800">
        유효하지 않거나 만료된 미리보기 링크
      </h1>
      <p className="mt-3 text-sm text-slate-500">
        링크가 만료되었거나 올바르지 않습니다. 새 미리보기 링크를 요청해 주세요.
      </p>
    </main>
  );
}

/** 로딩 폴백 (정적 셸과 함께 즉시 프리렌더되는 부분). */
function LoadingNotice() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm text-slate-500">미리보기를 불러오는 중…</p>
    </main>
  );
}

/**
 * 런타임 의존부 — searchParams(요청별 token)와 캐시 불가한 draft 조회를 모두 수행.
 * Cache Components(PPR) 규칙상 이 동적 작업은 반드시 <Suspense> 경계 안에서 일어나야 한다.
 */
export async function PreviewContent({ params, searchParams }: PublicPreviewProps) {
  const { id } = await params;
  const { token } = await searchParams;

  // 1) 보안 게이트 — 실패 시 글 조회조차 하지 않음
  const access = evaluatePreviewAccess(id, token);
  if (!access.ok) {
    return <InvalidNotice />;
  }

  // 2) draft 포함 조회 (status 무관)
  const post = await getPostByIdForAdmin(id);
  if (!post) notFound();

  // 3) 렌더 — app/blog/[slug] / 어드민 preview 와 동일한 MDXRemote 옵션 미러링
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        🔍 미리보기 (비공개 링크) · status: <strong>{post.status}</strong>
      </div>
      <article className="prose prose-slate max-w-none">
        <h1>{post.title}</h1>
        <MDXRemote
          source={preprocessMdxContent(post.mdxContent)}
          components={mdxComponents}
          options={{
            blockJS: false,
            mdxOptions: {
              format: 'mdx',
              remarkPlugins: [remarkGfm],
            },
          }}
        />
      </article>
    </main>
  );
}

export default function PublicPreviewPage({
  params,
  searchParams,
}: PublicPreviewProps) {
  // 정적 셸은 즉시 프리렌더, 동적 미리보기 본문은 Suspense 경계 안에서 런타임 처리.
  return (
    <Suspense fallback={<LoadingNotice />}>
      <PreviewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

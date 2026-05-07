import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import remarkGfm from 'remark-gfm';

import { mdxComponents } from '@/app/blog/components/mdx-components';
import { getPostByIdForAdmin } from '@/lib/blog/queries';
import { preprocessMdxContent } from '@/lib/blog/preprocessor';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

// 외부 색인 차단 — admin 전용 라우트 (이미 (protected) 인증 보호)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: '미리보기 — 내집(My.ZIP)',
};

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const post = await getPostByIdForAdmin(id);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* admin 컨텍스트 + status 배너 + 편집 복귀 링크 */}
      <div className="mb-6 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <span className="text-amber-900">
          🔍 발행 페이지 미리보기 · status: <strong>{post.status}</strong>
        </span>
        <Link
          href={`/admin/posts/${post.id}/edit`}
          className="font-semibold text-amber-900 underline hover:text-amber-700"
        >
          ← 편집으로 돌아가기
        </Link>
      </div>

      {/* 발행 페이지 prose 패턴 미러링 — app/blog/[slug]/page.tsx의 article 클래스와 동일 */}
      <article className="prose prose-slate max-w-none">
        <h1>{post.title}</h1>
        <MDXRemote
          source={preprocessMdxContent(post.mdxContent)}
          components={mdxComponents}
          options={{
            // blockJS:false — JSX expression props ({...}) 활성화 (사이클 A8.3)
            // blockDangerousJS:true(v6 default) 유지로 RCE 안전망 확보
            blockJS: false,
            mdxOptions: {
              format: 'mdx',
              remarkPlugins: [remarkGfm],
              // rehype-sanitize 제거 — mdxJsxFlowElement 노드 strip 이슈 (사이클 A8.2)
              // 본문 출처 admin only + format='mdx' + blockJS:true(v6 default)로 XSS 안전망 확보
              // 참고: hashicorp/next-mdx-remote#229
            },
          }}
        />
      </article>
    </main>
  );
}

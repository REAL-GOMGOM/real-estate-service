import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BlogBreadcrumb from '@/components/blog/BlogBreadcrumb';
import { getPublishedPostBySlug } from '@/lib/blog/queries';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { mdxSanitizeSchema } from '@/lib/mdx/sanitize-schema';
import { mdxComponents } from '../components/mdx-components';

const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

const KST_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
};

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return { title: `칼럼 — ${SITE_NAME}` };
  }
  const post = await getPublishedPostBySlug(slug);
  if (!post) {
    return { title: `칼럼 — ${SITE_NAME}` };
  }

  const url = `${SITE_URL}/blog/${post.slug}`;
  const description = post.excerpt ?? `${post.title} — 부동산 칼럼`;

  return {
    title: `${post.title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ko_KR',
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(post.categoryName && { section: post.categoryName }),
      images: [
        {
          url: `${url}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: [`${url}/opengraph-image`],
    },
  };
}

export default function PostDetailPage({ params }: { params: Params }) {
  return (
    <>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      {/* fixed Header(64px) 회피용 spacer */}
      <div aria-hidden="true" className="h-16" />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Suspense fallback={<DetailSkeleton />}>
          <PostDetail params={params} />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}

async function PostDetail({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();

  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const dateStr = new Intl.DateTimeFormat('ko-KR', KST_DATE_FORMAT).format(
    post.publishedAt,
  );

  // JSON-LD Article schema
  const url = `${SITE_URL}/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? `${post.title} — 부동산 칼럼`,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    ...(post.coverImageUrl && { image: post.coverImageUrl }),
    ...(post.categoryName && { articleSection: post.categoryName }),
  };

  // 검색 결과 breadcrumb 노출용 schema.org BreadcrumbList
  // categoryName/categorySlug가 모두 있으면 4단계, 없으면 3단계로 fallback
  const hasCategory = !!post.categorySlug && !!post.categoryName;
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: hasCategory
      ? [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '칼럼', item: `${SITE_URL}/blog` },
          {
            '@type': 'ListItem',
            position: 3,
            name: post.categoryName,
            item: `${SITE_URL}/blog/category/${post.categorySlug}`,
          },
          { '@type': 'ListItem', position: 4, name: post.title },
        ]
      : [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '칼럼', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title },
        ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {hasCategory && (
        <BlogBreadcrumb
          variant="post"
          categorySlug={post.categorySlug as string}
          categoryName={post.categoryName as string}
          postTitle={post.title}
        />
      )}

      <article className="mt-6">
        <header>
          {post.categoryName && post.categorySlug && (
            <Link
              href={`/blog/category/${post.categorySlug}`}
              className="inline-block rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              {post.categoryName}
            </Link>
          )}
          <h1 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <div className="mt-3 text-sm text-slate-500">
            <time dateTime={post.publishedAt.toISOString()}>{dateStr}</time>
          </div>
          {post.excerpt && (
            <p className="mt-4 text-base text-slate-600">{post.excerpt}</p>
          )}
        </header>

        {post.coverImageUrl && (
          <div className="mt-8 overflow-hidden rounded-lg bg-slate-100">
            <Image
              src={post.coverImageUrl}
              alt=""
              width={1200}
              height={675}
              sizes="(max-width: 768px) 100vw, 768px"
              className="h-auto w-full"
              priority
            />
          </div>
        )}

        <div className="prose prose-slate mt-10 max-w-none">
          <MDXRemote
            source={post.mdxContent}
            components={mdxComponents}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                // sanitize는 markdown HAST 위험 패턴 방어 (현 published 글에 raw HTML 없음, 미래 prep)
                // raw HTML 처리(rehype-raw)는 사이클 A2에서 MDX JSX 모드 충돌 검증 후 박음
                rehypePlugins: [[rehypeSanitize, mdxSanitizeSchema]],
              },
            }}
          />
        </div>
      </article>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-20 rounded bg-slate-100" />
      <div className="h-10 w-3/4 rounded bg-slate-100" />
      <div className="h-4 w-32 rounded bg-slate-100" />
      <div className="mt-8 h-64 rounded bg-slate-100" />
    </div>
  );
}

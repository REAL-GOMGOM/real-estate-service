import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getPublishedPostBySlug } from '@/lib/blog/queries';
import { SITE_URL, SITE_NAME } from '@/lib/site';
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
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Suspense fallback={<DetailSkeleton />}>
        <PostDetail params={params} />
      </Suspense>
    </main>
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/blog"
        className="inline-flex text-sm text-slate-500 hover:text-slate-700"
      >
        ← 칼럼 목록
      </Link>

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.coverImageUrl}
              alt=""
              className="h-auto w-full"
              loading="eager"
            />
          </div>
        )}

        <div className="prose prose-slate mt-10 max-w-none">
          <MDXRemote source={post.mdxContent} components={mdxComponents} />
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

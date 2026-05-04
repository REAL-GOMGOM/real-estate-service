import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BlogBreadcrumb from '@/components/blog/BlogBreadcrumb';
import {
  getPublishedPosts,
  getAllCategories,
} from '@/lib/blog/queries';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { PostCard } from '../../components/PostCard';
import { CategoryTabs } from '../../components/CategoryTabs';
import { Pagination } from '../../components/Pagination';

const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

type Params = Promise<{ categorySlug: string }>;
type SearchParams = Promise<{ page?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { categorySlug } = await params;
  if (!SLUG_PATTERN.test(categorySlug)) {
    return { title: `칼럼 — ${SITE_NAME}` };
  }
  const cats = await getAllCategories();
  const cat = cats.find((c) => c.slug === categorySlug);
  if (!cat) return { title: `칼럼 — ${SITE_NAME}` };

  const url = `${SITE_URL}/blog/category/${cat.slug}`;
  const description = `${cat.name} 분야의 칼럼·인사이트.`;

  return {
    title: `${cat.name} — 칼럼 — ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${cat.name} — 칼럼`,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cat.name} — 칼럼`,
      description,
    },
  };
}

export default function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      {/* fixed Header(64px) 회피용 spacer */}
      <div aria-hidden="true" className="h-16" />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">칼럼</h1>
        </header>

        <div className="mt-8">
          <Suspense fallback={null}>
            <Shell params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}

async function Shell({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { categorySlug } = await params;
  if (!SLUG_PATTERN.test(categorySlug)) notFound();

  const cats = await getAllCategories();
  const cat = cats.find((c) => c.slug === categorySlug);
  if (!cat) notFound();

  const sp = await searchParams;
  const page = Number(sp.page ?? 1) || 1;

  const { rows, totalPages } = await getPublishedPosts({
    page,
    categorySlug,
  });

  // 검색 결과 breadcrumb 노출용 schema.org BreadcrumbList
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '칼럼', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: cat.name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <BlogBreadcrumb variant="category" categoryName={cat.name} />

      <div className="mt-6">
        <CategoryTabs categories={cats} currentSlug={categorySlug} />
      </div>

      <div className="mt-8">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-500">
              {cat.name} 분야에 아직 발행된 칼럼이 없습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
            <div className="mt-10">
              <Pagination
                page={page}
                totalPages={totalPages}
                baseHref={`/blog/category/${categorySlug}`}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

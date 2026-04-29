import { Suspense } from 'react';
import { getPublishedPosts, getAllCategories } from '@/lib/blog/queries';
import { SITE_URL, SITE_NAME } from '@/lib/site';
import { PostCard } from './components/PostCard';
import { CategoryTabs } from './components/CategoryTabs';
import { Pagination } from './components/Pagination';

export const metadata = {
  title: `칼럼 — ${SITE_NAME}`,
  description: '부동산 시장·청약·대출·세금·정책에 대한 인사이트와 가이드.',
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
  openGraph: {
    title: `칼럼 — ${SITE_NAME}`,
    description: '부동산 시장·청약·대출·세금·정책에 대한 인사이트와 가이드.',
    url: `${SITE_URL}/blog`,
    siteName: SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `칼럼 — ${SITE_NAME}`,
    description: '부동산 시장·청약·대출·세금·정책에 대한 인사이트와 가이드.',
  },
};

type SearchParams = Promise<{ page?: string }>;

export default function BlogIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">칼럼</h1>
        <p className="mt-2 text-slate-600">
          부동산 시장·청약·대출·세금·정책에 대한 인사이트와 가이드.
        </p>
      </header>

      <div className="mt-8">
        <Suspense fallback={<TabsSkeleton />}>
          <Tabs />
        </Suspense>
      </div>

      <div className="mt-8">
        <Suspense fallback={<GridSkeleton />}>
          <PostGrid searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Tabs() {
  const cats = await getAllCategories();
  return <CategoryTabs categories={cats} currentSlug={null} />;
}

async function PostGrid({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Number(params.page ?? 1) || 1;

  const { rows, totalPages } = await getPublishedPosts({ page });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-slate-500">아직 발행된 칼럼이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
      <div className="mt-10">
        <Pagination page={page} totalPages={totalPages} baseHref="/blog" />
      </div>
    </>
  );
}

function TabsSkeleton() {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-7 w-16 rounded-full bg-slate-100" />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="aspect-[16/9] bg-slate-100" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-16 rounded bg-slate-100" />
            <div className="h-5 w-3/4 rounded bg-slate-100" />
            <div className="h-3 w-full rounded bg-slate-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

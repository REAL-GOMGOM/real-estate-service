import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
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

type SearchParams = Promise<{ page?: string; q?: string }>;

export default function BlogIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      {/* fixed Header(64px) 회피용 spacer — 다른 public 페이지의 paddingTop:80과 등가 */}
      <div aria-hidden="true" className="h-16" />
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

        {/* 칼럼 검색 (2026-07-12) — GET 폼이라 JS 불필요, ?q= 로 서버 검색 */}
        <div className="mt-6">
          <Suspense fallback={<SearchSkeleton />}>
            <SearchBox searchParams={searchParams} />
          </Suspense>
        </div>

        <div className="mt-8">
          <Suspense fallback={<GridSkeleton />}>
            <PostGrid searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}

async function Tabs() {
  const cats = await getAllCategories();
  return <CategoryTabs categories={cats} currentSlug={null} />;
}

async function SearchBox({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  return (
    <form action="/blog" className="flex max-w-md gap-2">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="칼럼 검색 — 단지·지역·키워드"
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        검색
      </button>
    </form>
  );
}

function SearchSkeleton() {
  return <div className="h-9 max-w-md rounded-lg bg-slate-100" />;
}

async function PostGrid({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Number(params.page ?? 1) || 1;
  const q = (params.q ?? '').trim();

  const { rows, total, totalPages } = await getPublishedPosts({ page, q: q || undefined });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-slate-500">
          {q ? <>&lsquo;{q}&rsquo; 검색 결과가 없습니다. 다른 키워드로 시도해보세요.</> : '아직 발행된 칼럼이 없습니다.'}
        </p>
      </div>
    );
  }

  const baseHref = q ? `/blog?q=${encodeURIComponent(q)}` : '/blog';

  return (
    <>
      {q && (
        <p className="mb-4 text-sm text-slate-500">
          &lsquo;<span className="font-semibold text-slate-700">{q}</span>&rsquo; 검색 결과 {total}건
        </p>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
      <div className="mt-10">
        <Pagination page={page} totalPages={totalPages} baseHref={baseHref} />
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

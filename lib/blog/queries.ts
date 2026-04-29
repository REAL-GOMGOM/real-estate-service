import 'server-only';
import { and, count, desc, eq } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts, categories } from '@/lib/db/schema';

const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

export type PublicPostListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: Date;
  categorySlug: string | null;
  categoryName: string | null;
};

export type PublicPostDetail = PublicPostListItem & {
  mdxContent: string;
};

export type PublicCategory = {
  id: string;
  slug: string;
  name: string;
};

export type PostsPage = {
  rows: PublicPostListItem[];
  total: number;
  page: number;
  totalPages: number;
};

const PER_PAGE = 12;

/**
 * 발행된 글 목록 (페이지네이션, 카테고리 필터).
 *
 * 모든 쿼리는 status='published' 강제.
 * draft 글은 외부에서 절대 노출되지 않도록 이 함수만 사용.
 */
export async function getPublishedPosts({
  page = 1,
  categorySlug,
}: {
  page?: number;
  categorySlug?: string;
} = {}): Promise<PostsPage> {
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * PER_PAGE;

  const db = getBlogDb();

  // 카테고리 slug 검증
  let categoryId: string | null = null;
  if (categorySlug) {
    if (!SLUG_PATTERN.test(categorySlug)) {
      return { rows: [], total: 0, page: safePage, totalPages: 0 };
    }
    const cat = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);
    if (cat.length === 0) {
      return { rows: [], total: 0, page: safePage, totalPages: 0 };
    }
    categoryId = cat[0].id;
  }

  const conditions = [eq(posts.status, 'published')];
  if (categoryId) conditions.push(eq(posts.categoryId, categoryId));

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        excerpt: posts.excerpt,
        coverImageUrl: posts.coverImageUrl,
        publishedAt: posts.publishedAt,
        categorySlug: categories.slug,
        categoryName: categories.name,
      })
      .from(posts)
      .leftJoin(categories, eq(posts.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(posts.publishedAt))
      .limit(PER_PAGE)
      .offset(offset),
    db
      .select({ total: count() })
      .from(posts)
      .where(and(...conditions)),
  ]);

  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.ceil(total / PER_PAGE);

  // publishedAt이 null이면 noop (status='published' 조건상 거의 없음)
  const safeRows = rows
    .filter((r): r is typeof r & { publishedAt: Date } => r.publishedAt !== null)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      coverImageUrl: r.coverImageUrl,
      publishedAt: r.publishedAt,
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
    }));

  return { rows: safeRows, total, page: safePage, totalPages };
}

/**
 * 발행된 글 상세 (slug로 조회).
 * 못 찾거나 draft면 null 반환 → 페이지에서 notFound().
 */
export async function getPublishedPostBySlug(
  slug: string,
): Promise<PublicPostDetail | null> {
  if (!SLUG_PATTERN.test(slug)) return null;

  const db = getBlogDb();
  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      coverImageUrl: posts.coverImageUrl,
      mdxContent: posts.mdxContent,
      publishedAt: posts.publishedAt,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(posts.slug, slug), eq(posts.status, 'published')))
    .limit(1);

  const r = rows[0];
  if (!r || !r.publishedAt) return null;

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImageUrl: r.coverImageUrl,
    mdxContent: r.mdxContent,
    publishedAt: r.publishedAt,
    categorySlug: r.categorySlug,
    categoryName: r.categoryName,
  };
}

/**
 * 카테고리 list (탭용).
 */
export async function getAllCategories(): Promise<PublicCategory[]> {
  return getBlogDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(categories.name);
}

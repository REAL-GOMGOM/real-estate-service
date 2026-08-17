import type {
  PublicBlogSnapshotPayload,
  PublicBlogSnapshotPost,
} from './contract';

const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

export const PUBLIC_BLOG_POSTS_PER_PAGE = 12;

export type SnapshotPublicPostListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: Date;
  categorySlug: string | null;
  categoryName: string | null;
};

export type SnapshotPublicPostDetail = SnapshotPublicPostListItem & {
  mdxContent: string;
  updatedAt: Date;
};

export type SnapshotPublicCategory = {
  id: string;
  slug: string;
  name: string;
};

export type SnapshotPostsPage = {
  rows: SnapshotPublicPostListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type SnapshotPublishedSlugItem = {
  slug: string;
  updatedAt: Date;
  publishedAt: Date;
};

export type SnapshotFeedItem = {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
  updatedAt: Date;
  categoryName: string | null;
};

function listItem(post: PublicBlogSnapshotPost): SnapshotPublicPostListItem {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    publishedAt: new Date(post.publishedAt),
    categorySlug: post.categorySlug,
    categoryName: post.categoryName,
  };
}

function foldSearchText(value: string): string {
  return value.toLocaleLowerCase('ko-KR');
}

function matchesLiteralQuery(post: PublicBlogSnapshotPost, query: string): boolean {
  const title = foldSearchText(post.title);
  const excerpt = post.excerpt === null ? null : foldSearchText(post.excerpt);
  return title.includes(query) || Boolean(excerpt?.includes(query));
}

export function getPublishedPostsFromSnapshot(
  payload: PublicBlogSnapshotPayload,
  {
    page = 1,
    categorySlug,
    q,
  }: {
    page?: number;
    categorySlug?: string;
    q?: string;
  } = {},
): SnapshotPostsPage {
  const safePage = Math.max(1, Math.floor(page));

  if (categorySlug) {
    const categoryExists = SLUG_PATTERN.test(categorySlug)
      && payload.categories.some((category) => category.slug === categorySlug);
    if (!categoryExists) {
      return { rows: [], total: 0, page: safePage, totalPages: 0 };
    }
  }

  const query = foldSearchText((q ?? '').trim().slice(0, 100));
  const matches = payload.posts.filter((post) => (
    (!categorySlug || post.categorySlug === categorySlug)
      && (!query || matchesLiteralQuery(post, query))
  ));
  const offset = (safePage - 1) * PUBLIC_BLOG_POSTS_PER_PAGE;
  const total = matches.length;

  return {
    rows: matches
      .slice(offset, offset + PUBLIC_BLOG_POSTS_PER_PAGE)
      .map(listItem),
    total,
    page: safePage,
    totalPages: Math.ceil(total / PUBLIC_BLOG_POSTS_PER_PAGE),
  };
}

export function getPublishedPostBySlugFromSnapshot(
  payload: PublicBlogSnapshotPayload,
  slug: string,
): SnapshotPublicPostDetail | null {
  if (!SLUG_PATTERN.test(slug)) return null;
  const post = payload.posts.find((candidate) => candidate.slug === slug);
  if (!post) return null;

  return {
    ...listItem(post),
    mdxContent: post.mdxContent,
    updatedAt: new Date(post.updatedAt),
  };
}

export function getAllCategoriesFromSnapshot(
  payload: PublicBlogSnapshotPayload,
): SnapshotPublicCategory[] {
  return payload.categories
    .map((category) => ({ ...category }))
    .sort((left, right) => (
      left.name.localeCompare(right.name, 'ko-KR')
        || left.slug.localeCompare(right.slug)
    ));
}

export function getAllPublishedSlugsFromSnapshot(
  payload: PublicBlogSnapshotPayload,
): SnapshotPublishedSlugItem[] {
  return payload.posts.map((post) => ({
    slug: post.slug,
    updatedAt: new Date(post.updatedAt),
    publishedAt: new Date(post.publishedAt),
  }));
}

export function getRecentPublishedPostsForFeedFromSnapshot(
  payload: PublicBlogSnapshotPayload,
  limit = 50,
): SnapshotFeedItem[] {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
  return payload.posts.slice(0, safeLimit).map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: new Date(post.publishedAt),
    updatedAt: new Date(post.updatedAt),
    categoryName: post.categoryName,
  }));
}

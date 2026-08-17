import { describe, expect, it } from 'vitest';

import {
  PUBLIC_BLOG_PAYLOAD_SCHEMA,
  type PublicBlogSnapshotPayload,
  type PublicBlogSnapshotPost,
} from '../contract';
import {
  PUBLIC_BLOG_POSTS_PER_PAGE,
  getAllCategoriesFromSnapshot,
  getAllPublishedSlugsFromSnapshot,
  getPublishedPostBySlugFromSnapshot,
  getPublishedPostsFromSnapshot,
  getRecentPublishedPostsForFeedFromSnapshot,
} from '../projection';

const RELEASE_ID = '20260817T010203Z-aaaaaaaaaaaa';
const GENERATED_AT = '2026-08-17T01:02:03.000Z';

function post(index: number, overrides: Partial<PublicBlogSnapshotPost> = {}): PublicBlogSnapshotPost {
  const day = String(30 - index).padStart(2, '0');
  return {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `post-${String(index).padStart(2, '0')}`,
    title: `글 ${index}`,
    excerpt: index % 2 === 0 ? `요약 ${index}` : null,
    coverImageUrl: null,
    publishedAt: `2026-07-${day}T00:00:00.000Z`,
    categorySlug: index % 2 === 0 ? 'first' : 'second',
    categoryName: index % 2 === 0 ? 'Zulu' : 'Alpha',
    mdxContent: `# 글 ${index}`,
    updatedAt: `2026-07-${day}T01:00:00.000Z`,
    ...overrides,
  };
}

function payload(posts = Array.from({ length: 25 }, (_, index) => post(index))): PublicBlogSnapshotPayload {
  return {
    schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
    releaseId: RELEASE_ID,
    generatedAt: GENERATED_AT,
    categories: [
      { id: '11111111-1111-4111-8111-111111111111', slug: 'first', name: 'Zulu' },
      { id: '22222222-2222-4222-8222-222222222222', slug: 'second', name: 'Alpha' },
      { id: '33333333-3333-4333-8333-333333333333', slug: 'unused', name: 'Middle' },
    ],
    posts,
  };
}

describe('public blog snapshot projections', () => {
  it('hydrates every public timestamp as Date while preserving DTO fields', () => {
    const input = payload([post(0)]);

    const list = getPublishedPostsFromSnapshot(input);
    const detail = getPublishedPostBySlugFromSnapshot(input, 'post-00');
    const slugs = getAllPublishedSlugsFromSnapshot(input);
    const feed = getRecentPublishedPostsForFeedFromSnapshot(input);

    expect(list.rows[0].publishedAt).toBeInstanceOf(Date);
    expect(detail).toMatchObject({
      id: input.posts[0].id,
      slug: 'post-00',
      mdxContent: '# 글 0',
    });
    expect(detail?.publishedAt).toBeInstanceOf(Date);
    expect(detail?.updatedAt).toBeInstanceOf(Date);
    expect(slugs[0].publishedAt).toBeInstanceOf(Date);
    expect(slugs[0].updatedAt).toBeInstanceOf(Date);
    expect(feed[0].publishedAt).toBeInstanceOf(Date);
    expect(feed[0].updatedAt).toBeInstanceOf(Date);
  });

  it('paginates by 12 after filtering and keeps totals from the full match set', () => {
    const input = payload();

    const secondPage = getPublishedPostsFromSnapshot(input, { page: 2 });
    expect(PUBLIC_BLOG_POSTS_PER_PAGE).toBe(12);
    expect(secondPage).toMatchObject({ page: 2, total: 25, totalPages: 3 });
    expect(secondPage.rows).toHaveLength(12);
    expect(secondPage.rows[0].slug).toBe('post-12');

    const beyondLast = getPublishedPostsFromSnapshot(input, { page: 4 });
    expect(beyondLast).toMatchObject({ page: 4, total: 25, totalPages: 3, rows: [] });

    const category = getPublishedPostsFromSnapshot(input, { categorySlug: 'first' });
    expect(category.total).toBe(13);
    expect(category.totalPages).toBe(2);
    expect(category.rows.every((row) => row.categorySlug === 'first')).toBe(true);
  });

  it('distinguishes valid empty categories and missing/invalid category misses', () => {
    const input = payload([post(0)]);

    expect(getPublishedPostsFromSnapshot(input, { categorySlug: 'unused' }))
      .toEqual({ rows: [], total: 0, page: 1, totalPages: 0 });
    expect(getPublishedPostsFromSnapshot(input, { categorySlug: 'missing' }))
      .toEqual({ rows: [], total: 0, page: 1, totalPages: 0 });
    expect(getPublishedPostsFromSnapshot(input, { categorySlug: '../unsafe' }))
      .toEqual({ rows: [], total: 0, page: 1, totalPages: 0 });
  });

  it('matches title/excerpt case-insensitively with literal wildcard characters', () => {
    const input = payload([
      post(0, { title: 'Mixed CASE %_\\ 키워드', excerpt: null }),
      post(1, { title: '다른 글', excerpt: 'Needle In Excerpt' }),
    ]);

    expect(getPublishedPostsFromSnapshot(input, { q: ' mixed case ' }).rows)
      .toHaveLength(1);
    expect(getPublishedPostsFromSnapshot(input, { q: '%_\\' }).rows[0].slug)
      .toBe('post-00');
    expect(getPublishedPostsFromSnapshot(input, { q: 'needle in excerpt' }).rows[0].slug)
      .toBe('post-01');
  });

  it('sorts categories by public name without mutating canonical payload order', () => {
    const input = payload([post(0)]);

    expect(getAllCategoriesFromSnapshot(input).map((category) => category.name))
      .toEqual(['Alpha', 'Middle', 'Zulu']);
    expect(input.categories.map((category) => category.slug))
      .toEqual(['first', 'second', 'unused']);
  });

  it('treats missing/invalid detail slugs as null and honors feed limits', () => {
    const input = payload();

    expect(getPublishedPostBySlugFromSnapshot(input, 'missing')).toBeNull();
    expect(getPublishedPostBySlugFromSnapshot(input, '../unsafe')).toBeNull();
    expect(getRecentPublishedPostsForFeedFromSnapshot(input, 5)).toHaveLength(5);
    expect(getRecentPublishedPostsForFeedFromSnapshot(input, 50)).toHaveLength(25);
    expect(getRecentPublishedPostsForFeedFromSnapshot(input, 0)).toEqual([]);
  });
});

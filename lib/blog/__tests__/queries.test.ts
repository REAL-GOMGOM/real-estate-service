import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_BLOG_PAYLOAD_SCHEMA,
  type PublicBlogSnapshotPayload,
} from '@/lib/blog-snapshots/contract';

const mocks = vi.hoisted(() => ({
  getBlogDb: vi.fn(),
  readPublicBlogSnapshotFromEnv: vi.fn(),
  requestCache: null as Map<unknown, unknown> | null,
}));

vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => (
    (...args: Parameters<T>): ReturnType<T> => {
      const store = mocks.requestCache;
      if (!store) return fn(...args) as ReturnType<T>;
      if (!store.has(fn)) store.set(fn, fn(...args));
      return store.get(fn) as ReturnType<T>;
    }
  ),
}));
vi.mock('@/lib/db/client', () => ({ getBlogDb: mocks.getBlogDb }));
vi.mock('@/lib/blog-snapshots/reader', () => ({
  readPublicBlogSnapshotFromEnv: mocks.readPublicBlogSnapshotFromEnv,
}));

import {
  getAllCategories,
  getAllPublishedSlugs,
  getPostByIdForAdmin,
  getPublishedPostBySlug,
  getPublishedPosts,
  getRecentPublishedPostsForFeed,
} from '../queries';

const POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

function payload(): PublicBlogSnapshotPayload {
  return {
    schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
    releaseId: '20260817T010203Z-aaaaaaaaaaaa',
    generatedAt: '2026-08-17T01:02:03.000Z',
    categories: [{ id: CATEGORY_ID, slug: 'market', name: '시장' }],
    posts: [{
      id: POST_ID,
      slug: 'snapshot-post',
      title: 'Snapshot Post',
      excerpt: '공개 요약',
      coverImageUrl: null,
      publishedAt: '2026-08-16T00:00:00.000Z',
      categorySlug: 'market',
      categoryName: '시장',
      mdxContent: '# Snapshot Post',
      updatedAt: '2026-08-16T01:00:00.000Z',
    }],
  };
}

function fakeDb({
  categories = [],
  adminPost = null,
}: {
  categories?: Array<{ id: string; slug: string; name: string }>;
  adminPost?: Record<string, unknown> | null;
} = {}) {
  const limit = vi.fn().mockResolvedValue(adminPost ? [adminPost] : []);
  const where = vi.fn(() => ({ limit }));
  const orderBy = vi.fn().mockResolvedValue(categories);
  const from = vi.fn(() => ({ limit, orderBy, where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select }, limit, orderBy, select };
}

beforeEach(() => {
  mocks.getBlogDb.mockReset();
  mocks.readPublicBlogSnapshotFromEnv.mockReset();
  // React cache is request-scoped. A fresh store models a new server render.
  mocks.requestCache = new Map();
});

describe('public blog query source selection', () => {
  it('serves all five public query shapes from the configured snapshot without DB access', async () => {
    const snapshot = payload();
    mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
      status: 'available',
      payload: snapshot,
    });

    const [page, detail, categories, slugs, feed] = await Promise.all([
      getPublishedPosts(),
      getPublishedPostBySlug('snapshot-post'),
      getAllCategories(),
      getAllPublishedSlugs(),
      getRecentPublishedPostsForFeed(5),
    ]);

    expect(page.rows[0]).toMatchObject({ id: POST_ID, slug: 'snapshot-post' });
    expect(page.rows[0].publishedAt).toBeInstanceOf(Date);
    expect(detail?.updatedAt).toBeInstanceOf(Date);
    expect(categories).toEqual([{ id: CATEGORY_ID, slug: 'market', name: '시장' }]);
    expect(slugs[0].updatedAt).toBeInstanceOf(Date);
    expect(feed[0].publishedAt).toBeInstanceOf(Date);
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
    expect(mocks.readPublicBlogSnapshotFromEnv).toHaveBeenCalledOnce();

    // A later request must re-read the mutable discovery manifest.
    mocks.requestCache = new Map();
    await getAllCategories();
    expect(mocks.readPublicBlogSnapshotFromEnv).toHaveBeenCalledTimes(2);
  });

  it('uses the legacy DB only when the explicit reader reports disabled', async () => {
    const databaseCategories = [{ id: CATEGORY_ID, slug: 'market', name: '시장 DB' }];
    const database = fakeDb({ categories: databaseCategories });
    mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
      status: 'unavailable',
      reason: 'disabled',
    });
    mocks.getBlogDb.mockReturnValue(database.db);

    await expect(getAllCategories()).resolves.toEqual(databaseCategories);
    expect(mocks.readPublicBlogSnapshotFromEnv).toHaveBeenCalled();
    expect(mocks.getBlogDb).toHaveBeenCalledOnce();
    expect(database.orderBy).toHaveBeenCalledOnce();
  });

  it('propagates configured snapshot failures and never falls back to DB', async () => {
    const error = new Error('Public blog snapshot payload request failed');
    mocks.readPublicBlogSnapshotFromEnv.mockRejectedValue(error);

    const results = await Promise.allSettled([
      getPublishedPosts(),
      getPublishedPostBySlug('snapshot-post'),
      getAllCategories(),
      getAllPublishedSlugs(),
      getRecentPublishedPostsForFeed(5),
    ]);

    expect(results.every((result) => (
      result.status === 'rejected' && result.reason === error
    ))).toBe(true);
    expect(mocks.readPublicBlogSnapshotFromEnv).toHaveBeenCalledOnce();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();

    // A rejected read is scoped to this request and is retried next request.
    mocks.requestCache = new Map();
    mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
      status: 'available',
      payload: payload(),
    });
    await expect(getAllCategories()).resolves.toHaveLength(1);
    expect(mocks.readPublicBlogSnapshotFromEnv).toHaveBeenCalledTimes(2);
  });

  it('treats valid snapshot misses as authoritative null/empty results', async () => {
    mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
      status: 'available',
      payload: payload(),
    });

    await expect(getPublishedPostBySlug('missing-post')).resolves.toBeNull();
    await expect(getPublishedPosts({ categorySlug: 'missing-category' })).resolves.toEqual({
      rows: [], total: 0, page: 1, totalPages: 0,
    });
    await expect(getPublishedPosts({ q: 'no match' })).resolves.toEqual({
      rows: [], total: 0, page: 1, totalPages: 0,
    });
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });

  it('keeps admin draft lookup DB-only even when the public snapshot reader is broken', async () => {
    const adminPost = { id: POST_ID, slug: 'draft-post', status: 'draft' };
    const database = fakeDb({ adminPost });
    mocks.readPublicBlogSnapshotFromEnv.mockRejectedValue(
      new Error('Public blog snapshot manifest request failed'),
    );
    mocks.getBlogDb.mockReturnValue(database.db);

    await expect(getPostByIdForAdmin(POST_ID)).resolves.toEqual(adminPost);
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).toHaveBeenCalledOnce();
  });

  it('rejects an invalid public slug as a logical miss without any source I/O', async () => {
    await expect(getPublishedPostBySlug('../unsafe')).resolves.toBeNull();
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
    expect(mocks.getBlogDb).not.toHaveBeenCalled();
  });
});

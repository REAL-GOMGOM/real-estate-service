import { describe, expect, it } from 'vitest';

import {
  PUBLIC_BLOG_MANIFEST_SCHEMA,
  PUBLIC_BLOG_PAYLOAD_SCHEMA,
  PUBLIC_BLOG_SNAPSHOT_PREFIX,
  PublicBlogSnapshotValidationError,
  assertPublicBlogPayloadMatchesManifest,
  assertPublicBlogSnapshotManifest,
  assertPublicBlogSnapshotPayload,
  serializePublicBlogTimestamp,
  type PublicBlogSnapshotManifest,
  type PublicBlogSnapshotPayload,
} from '../contract';

const RELEASE_ID = '20260817T010203Z-aaaaaaaaaaaa';
const GENERATED_AT = '2026-08-17T01:02:03.000Z';
const NOW = new Date('2026-08-17T02:00:00.000Z');

function payload(): PublicBlogSnapshotPayload {
  return {
    schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
    releaseId: RELEASE_ID,
    generatedAt: GENERATED_AT,
    categories: [
      { id: '11111111-1111-4111-8111-111111111111', slug: 'market', name: '시장' },
      { id: '22222222-2222-4222-8222-222222222222', slug: 'policy', name: '정책' },
    ],
    posts: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        slug: 'newest-post',
        title: '최신 글',
        excerpt: null,
        coverImageUrl: 'https://assets.example.com/cover.jpg',
        publishedAt: '2026-08-16T00:00:00.000Z',
        categorySlug: 'market',
        categoryName: '시장',
        mdxContent: '# 최신 글',
        updatedAt: '2026-08-16T01:00:00.000Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        slug: 'older-a',
        title: '이전 글 A',
        excerpt: '요약',
        coverImageUrl: null,
        publishedAt: '2026-08-15T00:00:00.000Z',
        categorySlug: null,
        categoryName: null,
        mdxContent: '# 이전 글 A',
        updatedAt: '2026-08-15T00:30:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        slug: 'older-b',
        title: '이전 글 B',
        excerpt: '',
        coverImageUrl: null,
        publishedAt: '2026-08-15T00:00:00.000Z',
        categorySlug: 'policy',
        categoryName: '정책',
        mdxContent: '# 이전 글 B',
        updatedAt: '2026-08-15T00:30:00.000Z',
      },
    ],
  };
}

function manifest(snapshot = payload()): PublicBlogSnapshotManifest {
  return {
    schema: PUBLIC_BLOG_MANIFEST_SCHEMA,
    releaseId: snapshot.releaseId,
    publishedAt: snapshot.generatedAt,
    payload: {
      key: `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/${snapshot.releaseId}/payload.json`,
      schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
      contentType: 'application/json',
      sha256: 'a'.repeat(64),
      byteLength: 1_024,
      postCount: snapshot.posts.length,
      categoryCount: snapshot.categories.length,
    },
  };
}

describe('public blog snapshot contract', () => {
  it('preserves exact public DTO fields and canonical UTC timestamps', () => {
    const snapshot: unknown = payload();
    const discovery: unknown = manifest();

    expect(() => assertPublicBlogSnapshotPayload(snapshot, { now: NOW })).not.toThrow();
    expect(() => assertPublicBlogSnapshotManifest(discovery, { now: NOW })).not.toThrow();
    assertPublicBlogSnapshotPayload(snapshot, { now: NOW });
    assertPublicBlogSnapshotManifest(discovery, { now: NOW });
    expect(() => assertPublicBlogPayloadMatchesManifest(snapshot, discovery)).not.toThrow();
    expect(Object.keys(snapshot.posts[0]).sort()).toEqual([
      'categoryName', 'categorySlug', 'coverImageUrl', 'excerpt', 'id', 'mdxContent',
      'publishedAt', 'slug', 'title', 'updatedAt',
    ].sort());
    expect(serializePublicBlogTimestamp(new Date(GENERATED_AT))).toBe(GENERATED_AT);
  });

  it('does not expire old static content', () => {
    const snapshot = payload();
    snapshot.generatedAt = '2020-01-01T00:00:00.000Z';
    snapshot.releaseId = '20200101T000000Z-bbbbbbbbbbbb';
    snapshot.posts.forEach((post, index) => {
      post.publishedAt = `2019-12-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`;
      post.updatedAt = post.publishedAt;
    });
    const discovery = manifest(snapshot);

    expect(() => assertPublicBlogSnapshotPayload(snapshot, {
      now: new Date('2035-01-01T00:00:00.000Z'),
    })).not.toThrow();
    expect(() => assertPublicBlogSnapshotManifest(discovery, {
      now: new Date('2035-01-01T00:00:00.000Z'),
    })).not.toThrow();
  });

  it('accepts a canonical empty snapshot and matching zero-count manifest', () => {
    const snapshot = payload();
    snapshot.categories = [];
    snapshot.posts = [];
    const discovery = manifest(snapshot);

    expect(() => assertPublicBlogSnapshotPayload(snapshot, { now: NOW })).not.toThrow();
    expect(() => assertPublicBlogSnapshotManifest(discovery, { now: NOW })).not.toThrow();
    expect(() => assertPublicBlogPayloadMatchesManifest(snapshot, discovery)).not.toThrow();

    const categoriesWithoutPosts = payload();
    categoriesWithoutPosts.posts = [];
    expect(() => assertPublicBlogSnapshotPayload(categoriesWithoutPosts, { now: NOW }))
      .toThrow('must not contain categories');
  });

  it('rejects unsupported schemas, extra database fields, unsafe keys, and future timestamps', () => {
    const schema = payload() as unknown as Record<string, unknown>;
    schema.schema = 'naezip.public-blog.payload.v2';
    expect(() => assertPublicBlogSnapshotPayload(schema, { now: NOW })).toThrow('unsupported');

    const draftLeak = payload() as unknown as { posts: Array<Record<string, unknown>> };
    draftLeak.posts[0].status = 'published';
    expect(() => assertPublicBlogSnapshotPayload(draftLeak, { now: NOW })).toThrow('forbidden');

    const unsafeManifest = manifest();
    unsafeManifest.payload.key = `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/../private.json`;
    expect(() => assertPublicBlogSnapshotManifest(unsafeManifest, { now: NOW })).toThrow('not pinned');

    const future = payload();
    future.generatedAt = '2026-08-18T00:00:00.000Z';
    future.releaseId = '20260818T000000Z-aaaaaaaaaaaa';
    expect(() => assertPublicBlogSnapshotPayload(future, { now: NOW })).toThrow('future');
  });

  it('rejects duplicate or noncanonical IDs/slugs and category mapping drift', () => {
    const duplicate = payload();
    duplicate.posts[1].id = duplicate.posts[0].id;
    duplicate.posts[1].slug = duplicate.posts[0].slug;
    expect(() => assertPublicBlogSnapshotPayload(duplicate, { now: NOW })).toThrow('unique');

    const noncanonical = payload();
    noncanonical.posts[0].id = noncanonical.posts[0].id.toUpperCase();
    noncanonical.posts[0].slug = 'Newest--Post';
    expect(() => assertPublicBlogSnapshotPayload(noncanonical, { now: NOW }))
      .toThrow('canonical');

    const categoryDrift = payload();
    categoryDrift.posts[0].categoryName = '다른 이름';
    expect(() => assertPublicBlogSnapshotPayload(categoryDrift, { now: NOW }))
      .toThrow('must match payload.categories');

    const partialCategory = payload();
    partialCategory.posts[0].categoryName = null;
    expect(() => assertPublicBlogSnapshotPayload(partialCategory, { now: NOW }))
      .toThrow('must both be null or both be strings');
  });

  it('requires deterministic publishedAt-desc/slug-asc and category-slug ordering', () => {
    const postOrder = payload();
    [postOrder.posts[1], postOrder.posts[2]] = [postOrder.posts[2], postOrder.posts[1]];
    expect(() => assertPublicBlogSnapshotPayload(postOrder, { now: NOW }))
      .toThrow('strictly ordered');

    const categoryOrder = payload();
    categoryOrder.categories.reverse();
    expect(() => assertPublicBlogSnapshotPayload(categoryOrder, { now: NOW }))
      .toThrow('categories must be strictly ordered');
  });

  it('binds post/category counts, release identity, and publication timestamp', () => {
    const snapshot = payload();
    const discovery = manifest(snapshot);
    discovery.payload.postCount += 1;
    expect(() => assertPublicBlogPayloadMatchesManifest(snapshot, discovery)).toThrow('post count');

    const identity = manifest(snapshot);
    identity.releaseId = '20260817T010203Z-bbbbbbbbbbbb';
    expect(() => assertPublicBlogPayloadMatchesManifest(snapshot, identity)).toThrow('release IDs');

    const timestamp = manifest(snapshot);
    timestamp.publishedAt = '2026-08-17T01:02:02.000Z';
    expect(() => assertPublicBlogPayloadMatchesManifest(snapshot, timestamp))
      .toThrow('publication timestamps');
  });

  it('enforces publishedAt <= updatedAt <= payload.generatedAt', () => {
    const publishedAfterUpdate = payload();
    publishedAfterUpdate.posts[0].publishedAt = '2026-08-16T02:00:00.000Z';
    expect(() => assertPublicBlogSnapshotPayload(publishedAfterUpdate, { now: NOW }))
      .toThrow('must not be after updatedAt');

    const updateAfterSnapshot = payload();
    updateAfterSnapshot.posts[0].updatedAt = '2026-08-17T01:02:04.000Z';
    expect(() => assertPublicBlogSnapshotPayload(updateAfterSnapshot, { now: NOW }))
      .toThrow('must not be after payload.generatedAt');
  });

  it('uses a dedicated validation error without echoing field values', () => {
    let failure: unknown;
    try {
      assertPublicBlogSnapshotPayload({ privateToken: 'must-not-be-echoed' }, { now: NOW });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PublicBlogSnapshotValidationError);
    expect((failure as Error).message).not.toContain('must-not-be-echoed');
  });
});

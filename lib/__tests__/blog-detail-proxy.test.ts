import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Next 16.2.11 still exports the testing helper under its former name.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server';

const mocks = vi.hoisted(() => ({
  readPublicBlogSnapshotFromEnv: vi.fn(),
  getPublishedPostBySlugFromSnapshot: vi.fn(),
  isPublicBlogEnabled: vi.fn(),
}));

vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled: mocks.isPublicBlogEnabled }));

vi.mock('@/lib/blog-snapshots/reader', () => ({
  readPublicBlogSnapshotFromEnv: mocks.readPublicBlogSnapshotFromEnv,
}));
vi.mock('@/lib/blog-snapshots/projection', () => ({
  getPublishedPostBySlugFromSnapshot: mocks.getPublishedPostBySlugFromSnapshot,
}));

import { config, proxy } from '@/proxy';

const originalSource = process.env.NAEZIP_PUBLIC_BLOG_SOURCE;

beforeEach(() => {
  mocks.isPublicBlogEnabled.mockReturnValue(true);
  process.env.NAEZIP_PUBLIC_BLOG_SOURCE = 'snapshot';
  mocks.readPublicBlogSnapshotFromEnv.mockReset();
  mocks.getPublishedPostBySlugFromSnapshot.mockReset();
  mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
    status: 'available',
    payload: { posts: [] },
  });
});

describe('paused public blog proxy', () => {
  beforeEach(() => {
    mocks.isPublicBlogEnabled.mockReturnValue(false);
  });

  it.each(['/blog', '/blog/sample-post', '/blog/category/market', '/blog/anything/nested'])(
    '%s를 삭제하지 않고 홈으로 임시 이동하며 외부 자료를 조회하지 않는다',
    async (pathname) => {
      expect(doesProxyMatch({ config, nextConfig: {}, url: pathname })).toBe(true);
      const response = await proxy(new NextRequest(`https://www.naezipkorea.com${pathname}?q=private-search`));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://www.naezipkorea.com/');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      expect(response.headers.get('x-naezip-data-status')).toBe('paused');
      expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
    },
  );

  it('RSS는 자체 paused 응답을 반환하도록 통과시킨다', async () => {
    const response = await proxy(new NextRequest('https://www.naezipkorea.com/blog/rss.xml'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
  });

  it('상세 OG는 글 조회 없이 기본 OG 이미지로 임시 이동한다', async () => {
    const response = await proxy(new NextRequest('https://www.naezipkorea.com/blog/old-post/opengraph-image?secret=removed'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://www.naezipkorea.com/opengraph-image');
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
  });

  it('관리자 미리보기·일반 페이지에는 공개 칼럼 pause를 적용하지 않는다', async () => {
    for (const pathname of ['/admin/posts/1/preview', '/transactions', '/blogging']) {
      expect(doesProxyMatch({ config, nextConfig: {}, url: pathname })).toBe(false);
      const response = await proxy(new NextRequest(`https://www.naezipkorea.com${pathname}`));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  if (originalSource === undefined) {
    delete process.env.NAEZIP_PUBLIC_BLOG_SOURCE;
  } else {
    process.env.NAEZIP_PUBLIC_BLOG_SOURCE = originalSource;
  }
  vi.restoreAllMocks();
});

describe('public blog detail proxy gate', () => {
  it('authoritative snapshot miss를 built-in not-found로 rewrite하며 HTTP 404를 보존한다', async () => {
    mocks.getPublishedPostBySlugFromSnapshot.mockReturnValue(null);

    const response = await proxy(new NextRequest(
      'https://www.naezipkorea.com/blog/removed-column',
    ));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://www.naezipkorea.com/_not-found',
    );
  });

  it('snapshot에 존재하는 글은 원래 상세 route로 통과시킨다', async () => {
    mocks.getPublishedPostBySlugFromSnapshot.mockReturnValue({ slug: 'new-column' });

    const response = await proxy(new NextRequest(
      'https://www.naezipkorea.com/blog/new-column',
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('snapshot 장애를 글 부재로 오판하지 않는다', async () => {
    const error = new Error('blob unavailable');
    mocks.readPublicBlogSnapshotFromEnv.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await proxy(new NextRequest(
      'https://www.naezipkorea.com/blog/temporarily-unavailable',
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(consoleError).toHaveBeenCalledWith(
      '[blog/proxy] snapshot preflight unavailable',
      error,
    );
  });

  it('RSS 경로는 snapshot 상세 판정을 거치지 않는다', async () => {
    const response = await proxy(new NextRequest(
      'https://www.naezipkorea.com/blog/rss.xml',
    ));

    expect(response.status).toBe(200);
    expect(mocks.readPublicBlogSnapshotFromEnv).not.toHaveBeenCalled();
  });
});

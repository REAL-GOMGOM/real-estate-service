import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readPublicBlogSnapshotFromEnv: vi.fn(),
  getPublishedPostBySlugFromSnapshot: vi.fn(),
}));

vi.mock('@/lib/blog-snapshots/reader', () => ({
  readPublicBlogSnapshotFromEnv: mocks.readPublicBlogSnapshotFromEnv,
}));
vi.mock('@/lib/blog-snapshots/projection', () => ({
  getPublishedPostBySlugFromSnapshot: mocks.getPublishedPostBySlugFromSnapshot,
}));

import { proxy } from '@/proxy';

const originalSource = process.env.NAEZIP_PUBLIC_BLOG_SOURCE;

beforeEach(() => {
  process.env.NAEZIP_PUBLIC_BLOG_SOURCE = 'snapshot';
  mocks.readPublicBlogSnapshotFromEnv.mockReset();
  mocks.getPublishedPostBySlugFromSnapshot.mockReset();
  mocks.readPublicBlogSnapshotFromEnv.mockResolvedValue({
    status: 'available',
    payload: { posts: [] },
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

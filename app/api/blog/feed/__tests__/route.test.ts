import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connection, getRecentPublishedPostsForFeed, isPublicBlogEnabled } = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getRecentPublishedPostsForFeed: vi.fn(),
  isPublicBlogEnabled: vi.fn(),
}));

vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled }));

vi.mock('next/server', () => ({ connection }));
vi.mock('@/lib/blog/queries', () => ({ getRecentPublishedPostsForFeed }));

import { GET } from '../route';

describe('GET /api/blog/feed', () => {
  beforeEach(() => {
    isPublicBlogEnabled.mockReturnValue(true);
    connection.mockClear();
    getRecentPublishedPostsForFeed.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('발행 pause는 장애나 정상 빈 목록과 구별하고 자료를 조회하지 않는다', async () => {
    isPublicBlogEnabled.mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'paused', data: [] });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-naezip-data-status')).toBe('paused');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(connection).not.toHaveBeenCalled();
    expect(getRecentPublishedPostsForFeed).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('발행 글의 공개 필드만 반환하고 CDN 캐시를 허용한다', async () => {
    getRecentPublishedPostsForFeed.mockResolvedValue([{
      slug: 'verified-post',
      title: '검증 글',
      excerpt: '응답에 포함하지 않을 요약',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      categoryName: '시장',
    }]);

    const response = await GET();
    const json = await response.json();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=600');
    expect(json).toEqual({
      status: 'ok',
      data: [{
        slug: 'verified-post',
        title: '검증 글',
        publishedAt: '2026-08-01T00:00:00.000Z',
        categoryName: '시장',
      }],
    });
  });

  it('DB 한도·장애를 빈 정상 목록으로 위장하지 않는다', async () => {
    getRecentPublishedPostsForFeed.mockRejectedValue(new Error('quota exceeded'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(json.status).toBe('unavailable');
    expect(json.data).toBeUndefined();
  });
});

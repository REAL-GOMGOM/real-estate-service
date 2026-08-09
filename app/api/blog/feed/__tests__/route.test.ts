import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connection, getRecentPublishedPostsForFeed } = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getRecentPublishedPostsForFeed: vi.fn(),
}));

vi.mock('next/server', () => ({ connection }));
vi.mock('@/lib/blog/queries', () => ({ getRecentPublishedPostsForFeed }));

import { GET } from '../route';

describe('GET /api/blog/feed', () => {
  beforeEach(() => {
    connection.mockClear();
    getRecentPublishedPostsForFeed.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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

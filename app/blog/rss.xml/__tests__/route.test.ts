import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getRecentPublishedPostsForFeed } = vi.hoisted(() => ({
  getRecentPublishedPostsForFeed: vi.fn(),
}));

vi.mock('@/lib/blog/queries', () => ({ getRecentPublishedPostsForFeed }));

import { GET } from '../route';

describe('GET /blog/rss.xml', () => {
  beforeEach(() => {
    getRecentPublishedPostsForFeed.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('정상 피드에 발행 글과 fresh 상태를 담는다', async () => {
    getRecentPublishedPostsForFeed.mockResolvedValue([
      {
        slug: 'sample-post',
        title: '샘플 글',
        excerpt: '샘플 요약',
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        categoryName: '시장',
      },
    ]);

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-status')).toBe('fresh');
    expect(xml).toContain('<title><![CDATA[샘플 글]]></title>');
    expect(xml).toContain('/blog/sample-post');
  });

  it('DB 장애 때도 유효한 빈 RSS와 degraded 상태를 반환한다', async () => {
    getRecentPublishedPostsForFeed.mockRejectedValue(
      new Error('database unavailable'),
    );

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-naezip-data-status')).toBe('degraded');
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).not.toContain('<item>');
  });
});

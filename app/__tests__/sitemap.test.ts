import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAllRegionIds, getAllCategories, getAllPublishedSlugs, isPublicBlogEnabled } = vi.hoisted(
  () => ({
    getAllRegionIds: vi.fn(),
    getAllCategories: vi.fn(),
    getAllPublishedSlugs: vi.fn(),
    isPublicBlogEnabled: vi.fn(),
  }),
);

vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled }));

vi.mock('@/lib/region-data', () => ({ getAllRegionIds }));
vi.mock('@/lib/blog/queries', () => ({
  getAllCategories,
  getAllPublishedSlugs,
}));

import sitemap from '../sitemap';
import { SITE_URL } from '@/lib/site';

describe('sitemap', () => {
  beforeEach(() => {
    isPublicBlogEnabled.mockReturnValue(true);
    getAllRegionIds.mockReset();
    getAllCategories.mockReset();
    getAllPublishedSlugs.mockReset();
    getAllRegionIds.mockResolvedValue(['gangnam-gu']);
    getAllCategories.mockResolvedValue([
      { id: 'category-1', slug: 'market', name: '시장' },
    ]);
    getAllPublishedSlugs.mockResolvedValue([
      {
        slug: 'sample-post',
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedAt: new Date('2026-07-31T00:00:00.000Z'),
      },
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('칼럼 pause 동안 칼럼 URL을 제외하고 공개 칼럼 자료를 아예 조회하지 않는다', async () => {
    isPublicBlogEnabled.mockReturnValue(false);
    const result = await sitemap();
    expect(result.some((entry) => entry.url === SITE_URL)).toBe(true);
    expect(result.some((entry) => entry.url === `${SITE_URL}/region/gangnam-gu`)).toBe(true);
    expect(result.some((entry) => entry.url.startsWith(`${SITE_URL}/blog`))).toBe(false);
    expect(getAllCategories).not.toHaveBeenCalled();
    expect(getAllPublishedSlugs).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('정적·지역·카테고리·발행 글 URL을 함께 만든다', async () => {
    const result = await sitemap();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: SITE_URL }),
        expect.objectContaining({ url: `${SITE_URL}/region/gangnam-gu` }),
        expect.objectContaining({ url: `${SITE_URL}/blog/category/market` }),
        expect.objectContaining({
          url: `${SITE_URL}/blog/sample-post`,
          lastModified: new Date('2026-08-01T00:00:00.000Z'),
        }),
      ]),
    );

    const home = result.find((entry) => entry.url === SITE_URL);
    expect(home).not.toHaveProperty('lastModified');
    expect(result.some((entry) => entry.url === `${SITE_URL}/news`)).toBe(false);
    expect(result.some((entry) => entry.url === `${SITE_URL}/telegram`)).toBe(false);
  });

  it('블로그 DB가 실패해도 정적·지역 URL을 반환한다', async () => {
    getAllCategories.mockRejectedValue(new Error('database unavailable'));
    getAllPublishedSlugs.mockRejectedValue(new Error('database unavailable'));

    const result = await sitemap();

    expect(result.some((entry) => entry.url === SITE_URL)).toBe(true);
    expect(
      result.some((entry) => entry.url === `${SITE_URL}/region/gangnam-gu`),
    ).toBe(true);
    expect(
      result.some((entry) => entry.url === `${SITE_URL}/blog/sample-post`),
    ).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '@/next.config';
import RootOpenGraphImage from '@/app/opengraph-image';
import RegionOpenGraphImage from '@/app/region/[id]/opengraph-image';
import BlogOpenGraphImage from '@/app/blog/[slug]/opengraph-image';
import { isPublicBlogEnabled } from '@/lib/public-features';
import { getPublishedPostBySlug } from '@/lib/blog/queries';
import { SITE_URL } from '@/lib/site';

vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled: vi.fn() }));

vi.mock('@/lib/blog/queries', () => ({
  getPublishedPostBySlug: vi.fn().mockResolvedValue({
    title: '서울 아파트 시장 점검',
    categoryName: '시장 분석',
    publishedAt: new Date('2026-08-16T00:00:00.000Z'),
  }),
}));

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function expectPng(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(Array.from(bytes.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);
  expect(bytes.byteLength).toBeGreaterThan(1_000);
}

describe('Open Graph images', () => {
  beforeEach(() => {
    vi.mocked(isPublicBlogEnabled).mockReturnValue(true);
    vi.mocked(getPublishedPostBySlug).mockClear();
  });

  it('paused blog OG redirects temporarily without querying the post', async () => {
    vi.mocked(isPublicBlogEnabled).mockReturnValue(false);
    const response = await BlogOpenGraphImage({ params: Promise.resolve({ slug: 'saved-column' }) });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${SITE_URL}/opengraph-image`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-naezip-data-status')).toBe('paused');
    expect(getPublishedPostBySlug).not.toHaveBeenCalled();
  });
  it('includes the local Pretendard font in every OG server trace', () => {
    expect(nextConfig.outputFileTracingIncludes).toMatchObject({
      '/opengraph-image': ['./public/fonts/Pretendard-Bold.otf'],
    });
  });

  it('renders the root image as a PNG', async () => {
    await expectPng(await RootOpenGraphImage());
  });

  it('renders a region image as a PNG', async () => {
    await expectPng(
      await RegionOpenGraphImage({
        params: Promise.resolve({ id: 'seoul-city' }),
      }),
    );
  });

  it('renders a blog image as a PNG', async () => {
    await expectPng(
      await BlogOpenGraphImage({
        params: Promise.resolve({ slug: 'og-regression-test' }),
      }),
    );
  });
});

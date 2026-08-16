import { describe, expect, it, vi } from 'vitest';
import nextConfig from '@/next.config';
import RootOpenGraphImage from '@/app/opengraph-image';
import RegionOpenGraphImage from '@/app/region/[id]/opengraph-image';
import BlogOpenGraphImage from '@/app/blog/[slug]/opengraph-image';

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

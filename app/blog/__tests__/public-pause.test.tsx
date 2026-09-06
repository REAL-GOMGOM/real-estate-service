import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isPublicBlogEnabled: vi.fn(),
  getAllCategories: vi.fn(),
  getPublishedPosts: vi.fn(),
  getPublishedPostBySlug: vi.fn(),
}));

vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled: mocks.isPublicBlogEnabled }));
vi.mock('@/lib/blog/queries', () => ({
  getAllCategories: mocks.getAllCategories,
  getPublishedPosts: mocks.getPublishedPosts,
  getPublishedPostBySlug: mocks.getPublishedPostBySlug,
}));
vi.mock('next-mdx-remote/rsc', () => ({ MDXRemote: () => null }));

import BlogIndexPage, { generateMetadata as indexMetadata } from '../page';
import CategoryPage, { generateMetadata as categoryMetadata } from '../category/[categorySlug]/page';
import PostDetailPage, { generateMetadata as postMetadata } from '../[slug]/page';

describe('public blog route pause', () => {
  beforeEach(() => {
    mocks.isPublicBlogEnabled.mockReturnValue(false);
    mocks.getAllCategories.mockReset();
    mocks.getPublishedPosts.mockReset();
    mocks.getPublishedPostBySlug.mockReset();
  });

  it('index·category·detail은 하위 데이터를 렌더링하기 전에 임시 홈 이동을 시작한다', () => {
    const pages = [
      () => BlogIndexPage({ searchParams: Promise.resolve({ q: 'saved-column' }) }),
      () => CategoryPage({ params: Promise.resolve({ categorySlug: 'market' }), searchParams: Promise.resolve({}) }),
      () => PostDetailPage({ params: Promise.resolve({ slug: 'saved-column' }) }),
    ];
    for (const page of pages) {
      expect(page).toThrow('NEXT_REDIRECT');
      try {
        page();
      } catch (error) {
        expect(error).toMatchObject({ digest: 'NEXT_REDIRECT;replace;/;307;' });
      }
    }
    expect(mocks.getPublishedPosts).not.toHaveBeenCalled();
    expect(mocks.getPublishedPostBySlug).not.toHaveBeenCalled();
    expect(mocks.getAllCategories).not.toHaveBeenCalled();
  });

  it('빌드/metadata도 조회 없이 noindex pause 설명만 반환한다', async () => {
    const metadata = await Promise.all([
      indexMetadata(),
      categoryMetadata({ params: Promise.resolve({ categorySlug: 'market' }) }),
      postMetadata({ params: Promise.resolve({ slug: 'saved-column' }) }),
    ]);
    for (const entry of metadata) {
      expect(entry.title).toContain('칼럼 발행 일시 중단');
      expect(entry).toMatchObject({ robots: { index: false, follow: true } });
      expect(entry).not.toHaveProperty('openGraph');
    }
    expect(mocks.getPublishedPostBySlug).not.toHaveBeenCalled();
    expect(mocks.getAllCategories).not.toHaveBeenCalled();
  });

  it('다시 활성화하면 원래 index와 상세 metadata 경로를 보존한다', async () => {
    mocks.isPublicBlogEnabled.mockReturnValue(true);
    mocks.getAllCategories.mockResolvedValue([{ slug: 'market', name: '시장' }]);
    mocks.getPublishedPostBySlug.mockResolvedValue({
      slug: 'saved-column', title: '보관된 칼럼', excerpt: '보관된 요약',
      categoryName: '시장', publishedAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    expect(() => BlogIndexPage({ searchParams: Promise.resolve({}) })).not.toThrow();
    expect(indexMetadata().title).not.toContain('일시 중단');
    expect((await categoryMetadata({ params: Promise.resolve({ categorySlug: 'market' }) })).title).toContain('시장');
    expect((await postMetadata({ params: Promise.resolve({ slug: 'saved-column' }) })).title).toContain('보관된 칼럼');
    expect(mocks.getAllCategories).toHaveBeenCalledOnce();
    expect(mocks.getPublishedPostBySlug).toHaveBeenCalledWith('saved-column');
  });
});

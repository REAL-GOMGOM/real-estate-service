import type { MetadataRoute } from 'next';
import { getAllRegionIds } from '@/lib/region-data';
import { getAllPublishedSlugs, getAllCategories } from '@/lib/blog/queries';
import { SITE_URL } from '@/lib/site';
import { isPublicBlogEnabled } from '@/lib/public-features';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const publicBlogEnabled = isPublicBlogEnabled();

  // 변경 시각을 알 수 없는 정적 페이지에 요청 시각을 넣지 않는다.
  // 매 요청마다 갱신된 것처럼 보이면 검색엔진의 변경 신호가 오염된다.
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/transactions`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/chart`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/location-map`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/region`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/subscription`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/calendar`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/gap-analysis`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/dollar`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/price-map`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/price-trend`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/gap-guide`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/market`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/loan`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/highlights`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/ranking`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/schools`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  ];
  if (publicBlogEnabled) {
    staticPages.push({ url: `${baseUrl}/blog`, changeFrequency: 'daily', priority: 0.8 });
  }

  // 블로그 DB가 중단돼도 정적·지역 URL은 계속 제공해야 한다.
  const [regionResult, categoryResult, postResult] = await Promise.allSettled([
    getAllRegionIds(),
    publicBlogEnabled ? getAllCategories() : Promise.resolve([]),
    publicBlogEnabled ? getAllPublishedSlugs() : Promise.resolve([]),
  ]);

  if (regionResult.status === 'rejected') {
    console.error('[sitemap] region URLs unavailable', regionResult.reason);
  }
  if (categoryResult.status === 'rejected') {
    console.error('[sitemap] blog categories unavailable', categoryResult.reason);
  }
  if (postResult.status === 'rejected') {
    console.error('[sitemap] blog posts unavailable', postResult.reason);
  }

  const regionIds = regionResult.status === 'fulfilled' ? regionResult.value : [];
  const regionUrls: MetadataRoute.Sitemap = regionIds.map((id) => ({
    url: `${baseUrl}/region/${id}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const cats = categoryResult.status === 'fulfilled' ? categoryResult.value : [];
  const categoryUrls: MetadataRoute.Sitemap = cats.map((c) => ({
    url: `${baseUrl}/blog/category/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const slugs = postResult.status === 'fulfilled' ? postResult.value : [];
  const postUrls: MetadataRoute.Sitemap = slugs.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // 단지 전용 페이지(/apt/[id])는 sitemap 에서 의도적으로 제외 (SEO 개선 2026-07-19).
  //
  // 배경: 단지 마스터 29,334개 전체를 나열하니 신생 도메인의 크롤 예산이
  // 자동생성 단지 페이지에 소진되어 핵심 콘텐츠(region 146·블로그·도구)가
  // 색인되지 않았다 (GSC 색인 2페이지 사고). 단지 페이지는 색인 금지가
  // 아니라 미나열일 뿐 — 내부 링크로 자연 발견·색인된다.
  // 색인 안정화 후(2~3개월) 세대수 상위 단지부터 선별 재도입 예정.

  return [...staticPages, ...regionUrls, ...categoryUrls, ...postUrls];
}

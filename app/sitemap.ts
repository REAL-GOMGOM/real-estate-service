import type { MetadataRoute } from 'next';
import { getAllRegionIds } from '@/lib/region-data';
import { getAllPublishedSlugs, getAllCategories } from '@/lib/blog/queries';
import { SITE_URL } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const now = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/transactions`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/chart`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/location-map`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/region`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/subscription`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/calendar`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/gap-analysis`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/dollar`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/price-map`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/news`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/gap-guide`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ];

  // 126개 region URL
  const regionIds = await getAllRegionIds();
  const regionUrls: MetadataRoute.Sitemap = regionIds.map((id) => ({
    url: `${baseUrl}/region/${id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  // /blog 카테고리 페이지
  const cats = await getAllCategories();
  const categoryUrls: MetadataRoute.Sitemap = cats.map((c) => ({
    url: `${baseUrl}/blog/category/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  // /blog 발행 글 상세
  const slugs = await getAllPublishedSlugs();
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

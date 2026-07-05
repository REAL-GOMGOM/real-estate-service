import type { MetadataRoute } from 'next';
import { getAllRegionIds } from '@/lib/region-data';
import { getAllPublishedSlugs, getAllCategories } from '@/lib/blog/queries';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
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

  // 단지 전용 페이지 전체 (사이클 DD — "단지명 실거래" 검색 유입).
  // 실패는 fail-open: 단지 URL 만 생략하고 기존 sitemap 은 유지.
  let aptUrls: MetadataRoute.Sitemap = [];
  try {
    const rows = await getBlogDb()
      .select({ id: apartments.id, updatedAt: apartments.updatedAt })
      .from(apartments);
    aptUrls = rows.map((a) => ({
      url: `${baseUrl}/apt/${encodeURIComponent(a.id)}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch (e) {
    console.error('[sitemap] 단지 목록 조회 실패 (단지 URL 생략):', e);
  }

  return [...staticPages, ...regionUrls, ...categoryUrls, ...postUrls, ...aptUrls];
}

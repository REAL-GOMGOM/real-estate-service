import type { MetadataRoute } from 'next';
import { getAllRegionIds } from '@/lib/region-data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.naezipkorea.com';
  const now = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/transactions`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/chart`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/location-map`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/subscription`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/calendar`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/gap-analysis`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/dollar`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/price-map`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/news`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/gap-guide`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // 126개 region URL
  const regionIds = await getAllRegionIds();
  const regionUrls: MetadataRoute.Sitemap = regionIds.map((id) => ({
    url: `${baseUrl}/region/${id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticPages, ...regionUrls];
}

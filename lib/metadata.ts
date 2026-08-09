import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/site';

type PageMetadataOptions = {
  title: string;
  description: string;
  path: `/${string}` | '/';
  keywords?: Metadata['keywords'];
};

const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — 부동산 데이터 플랫폼`,
};

/** 페이지별 canonical·Open Graph·X 카드가 빠지지 않게 만드는 공용 메타데이터. */
export function createPageMetadata({
  title,
  description,
  path,
  keywords,
}: PageMetadataOptions): Metadata {
  const url = path === '/' ? SITE_URL : `${SITE_URL}${path}`;

  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ko_KR',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

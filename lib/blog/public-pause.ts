import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

/** A deliberate publishing pause is neither a data outage nor a deleted post. */
export const PUBLIC_BLOG_PAUSED_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'X-Naezip-Data-Status': 'paused',
} as const;

export const PUBLIC_BLOG_PAUSED_METADATA: Metadata = {
  title: `칼럼 발행 일시 중단 — ${SITE_NAME}`,
  description: '칼럼은 잠시 쉬고 있습니다. 실거래와 부동산 정보는 홈페이지에서 확인하세요.',
  robots: { index: false, follow: true },
};

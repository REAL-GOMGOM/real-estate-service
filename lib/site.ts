/**
 * 사이트 URL — 모든 절대 URL의 단일 출처.
 *
 * NEXT_PUBLIC_SITE_URL 환경변수 우선, 미설정 시 production URL 폴백.
 * canonical, OG, sitemap, RSS 모두 이 값 사용.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.naezipkorea.com';

export const SITE_NAME = '내집(My.ZIP)';

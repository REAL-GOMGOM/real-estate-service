import { isPublicBlogEnabled } from '@/lib/public-features';

export type SiteNavLink = { label: string; href: string; desc?: string; emoji?: string };
export type SiteNavItem = SiteNavLink | { label: string; children: SiteNavLink[]; href?: never };

/** One set of destinations and labels for the home, subpages and mobile menus. */
const SITE_NAVIGATION: SiteNavItem[] = [
  {
    label: '부동산 분석',
    children: [
      { emoji: '💰', label: '실거래가', href: '/transactions', desc: '최근 거래된 가격' },
      { emoji: '🔥', label: '주요 거래', href: '/highlights', desc: '신고가·급등·국평 고가' },
      { emoji: '📊', label: '시세 차트', href: '/chart', desc: '단지별 가격 추이' },
      { emoji: '🗺️', label: '부동산 지도', href: '/location-map', desc: '지역별 입지 점수' },
      { emoji: '📍', label: '지역 분석', href: '/region', desc: '전국 지역 비교 허브' },
      { emoji: '🏆', label: '실거래 랭킹', href: '/ranking', desc: '등록 표본 최고가·거래량' },
    ],
  },
  { label: '청약', href: '/subscription' },
  {
    label: '내집마련 도구',
    children: [
      { emoji: '💳', label: '대출 계산기', href: '/loan', desc: '얼마까지 빌릴 수 있나' },
      { emoji: '🏠', label: '갭투자 가이드', href: '/gap-guide', desc: '매매-전세 전략' },
      { emoji: '💵', label: '실질 가치', href: '/dollar', desc: '달러·금 환산 비교' },
    ],
  },
  {
    label: '시장 동향',
    children: [
      { emoji: '📈', label: '시장 한눈에', href: '/market', desc: '시장 흐름 요약' },
      { emoji: '📈', label: '가격 변동률', href: '/price-map', desc: '지역별 상승·하락' },
      { emoji: '🔄', label: '갭 분석', href: '/gap-analysis', desc: '매매가-전세가 차이' },
      { emoji: '📅', label: '경제 달력', href: '/calendar', desc: '금리·지표 일정' },
    ],
  },
  { label: '칼럼', href: '/blog' },
];

export function getSiteNavigation(): SiteNavItem[] {
  return SITE_NAVIGATION.filter((item) => item.href !== '/blog' || isPublicBlogEnabled());
}

export function isNavigationActive(href: string, pathname: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

// Keep the established quick-access order. The full header menu exposes the rest.
const MOBILE_MORE_PATHS = ['/highlights', '/location-map', '/market', '/loan', '/calendar', '/blog'];

export function getMobileMoreNavigation(): SiteNavLink[] {
  const links = getSiteNavigation().flatMap((item) => 'children' in item ? item.children : [item]);
  return MOBILE_MORE_PATHS.flatMap((href) => links.filter((item) => item.href === href));
}

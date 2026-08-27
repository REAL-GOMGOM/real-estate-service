function normalisePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '');
}

const COUPANG_FOOTER_HIDDEN_EXACT = new Set([
  '/',
  '/contact',
  '/loan',
  '/privacy',
  '/schools',
  '/telegram',
  '/terms',
  '/transactions',
]);

/** 인라인 지면이 있거나 광고 문맥이 부적절한 경로에서는 푸터 배너를 숨긴다. */
export function shouldShowFooterCoupang(pathname: string): boolean {
  const path = normalisePathname(pathname);
  if (COUPANG_FOOTER_HIDDEN_EXACT.has(path)) return false;

  if (path === '/admin' || path.startsWith('/admin/')) return false;
  if (path === '/preview' || path.startsWith('/preview/')) return false;
  if (path.startsWith('/apt/')) return false;

  const segments = path.split('/').filter(Boolean);
  const isBlogDetail = segments[0] === 'blog' && segments.length === 2;
  return !isBlogDetail;
}

const TELEGRAM_HIDDEN_EXACT = new Set([
  '/',
  '/calendar',
  '/chart',
  '/contact',
  '/gap-analysis',
  '/highlights',
  '/loan',
  '/location-map',
  '/price-map',
  '/price-trend',
  '/privacy',
  '/school-map',
  '/subscription',
  '/telegram',
  '/terms',
  '/transactions',
]);

/** 법적·관리자·입력 집중·이미 텔레그램 CTA가 있는 경로를 제외한다. */
export function shouldShowTelegramFab(pathname: string): boolean {
  const path = normalisePathname(pathname);
  if (TELEGRAM_HIDDEN_EXACT.has(path)) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return false;
  if (path.startsWith('/apt/')) return false;
  if (path.startsWith('/region/')) return false;
  return true;
}

/** 현재 수동 AdSense 슬롯은 지역 상세에만 존재한다. */
export function shouldLoadAdSense(pathname: string): boolean {
  const path = normalisePathname(pathname);
  return path.startsWith('/region/');
}

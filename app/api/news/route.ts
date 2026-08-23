import { NextResponse } from 'next/server';
import { cacheLife } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  pubDateFormatted: string;
  source: string;
  category: 'realestate' | 'general';
  thumbnail: string | null;
}

interface NewsCandidate extends NewsItem {
  naverLink: string;
  pubDateTs: number;
}

// 네이버 뉴스 검색 API 응답 항목(사용 필드만)
interface NaverNewsItem {
  title?: string;
  originallink?: string;
  link?: string;
  pubDate?: string;
}

interface NaverNewsResponse {
  items?: NaverNewsItem[];
}

const REAL_ESTATE_TERMS = [
  '부동산', '아파트', '주택', '주거', '집값', '내집', '전세', '월세', '전월세',
  '매매', '분양', '청약', '재건축', '재개발', '정비사업', '도시정비', '오피스텔',
  '빌라', '토지', '공시가격', '공시지가', '임대', '임차', '임대차', '입주', '미분양', '갭투자',
  '신고가', '실거래', '거래량', '전용면적', '평당', '강남3구', '역전세', '깡통전세',
  '규제지역', '토지거래허가', '분양가', '분양권', '입주권', '전매제한', '가계대출',
  '전세사기', '주담대', '주택담보', '디딤돌', '보금자리론', 'dsr', 'ltv', 'dti',
  '종부세', '취득세', '양도세', '재산세', '주택공급', '건설사', '건설경기', '부동산원',
  '국토교통부', '국토부', '용적률', '건폐율', '프로젝트파이낸싱', 'gtx',
] as const;

const SOURCE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['biz.chosun.com', '조선비즈'],
  ['chosun.com', '조선일보'],
  ['joongang.co.kr', '중앙일보'],
  ['donga.com', '동아일보'],
  ['hankyung.com', '한국경제'],
  ['mk.co.kr', '매일경제'],
  ['sedaily.com', '서울경제'],
  ['edaily.co.kr', '이데일리'],
  ['fnnews.com', '파이낸셜뉴스'],
  ['mt.co.kr', '머니투데이'],
  ['asiae.co.kr', '아시아경제'],
  ['heraldcorp.com', '헤럴드경제'],
  ['etoday.co.kr', '이투데이'],
  ['newsis.com', '뉴시스'],
  ['news1.kr', '뉴스1'],
  ['yna.co.kr', '연합뉴스'],
  ['yonhapnews.co.kr', '연합뉴스'],
  ['hani.co.kr', '한겨레'],
  ['kbs.co.kr', 'KBS'],
  ['imbc.com', 'MBC'],
  ['sbs.co.kr', 'SBS'],
  ['ytn.co.kr', 'YTN'],
  ['nocutnews.co.kr', 'CBS노컷뉴스'],
  ['naver.com', '네이버뉴스'],
];

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(pubDate: string, now = new Date()): string {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return pubDate;

  const diff = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (diff < 1) return '방금 전';
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1_440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1_440)}일 전`;
}

function parseHttpUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const nonPublicHostname = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || hostname === '0.0.0.0'
      || /^127\./.test(hostname)
      || /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^169\.254\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)
      || hostname === '::1'
      || /^f[cd][0-9a-f]*:/i.test(hostname)
      || /^fe[89ab][0-9a-f]*:/i.test(hostname);

    return nonPublicHostname ? null : url;
  } catch {
    return null;
  }
}

function sourceName(link: string): string {
  const url = parseHttpUrl(link);
  if (!url) return '출처 미상';

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const match = SOURCE_NAMES.find(([domain]) => (
    hostname === domain || hostname.endsWith(`.${domain}`)
  ));
  return match?.[1] ?? hostname;
}

function isRealEstateRelevant(title: string): boolean {
  const normalized = stripHtml(title).toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
  return REAL_ESTATE_TERMS.some((term) => normalized.includes(term));
}

function normalizeLink(link: string): string {
  const url = parseHttpUrl(link);
  if (!url) return link;

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|nclick$|sid$|sm$|from$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString().replace(/\/$/, '');
}

function normalizeTitle(title: string): string {
  return stripHtml(title)
    .toLocaleLowerCase('ko-KR')
    .replace(/^\s*[\[\(【][^\]\)】]{1,12}[\]\)】]\s*/g, '')
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((token) => token.length > 1),
  );
}

function areLikelySameStory(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 14 && longer.includes(shorter) && shorter.length / longer.length >= 0.7) {
    return true;
  }

  const aTokens = titleTokens(a);
  const bTokens = titleTokens(b);
  if (aTokens.size < 3 || bTokens.size < 3) return false;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  if (intersection < 3) return false;
  const union = aTokens.size + bTokens.size - intersection;
  const jaccard = intersection / union;
  const overlap = intersection / Math.min(aTokens.size, bTokens.size);
  return jaccard >= 0.58 || overlap >= 0.8;
}

function curateNews(items: NewsCandidate[], limit = 30): NewsCandidate[] {
  const sorted = items
    .filter((item) => isRealEstateRelevant(item.title))
    .sort((a, b) => b.pubDateTs - a.pubDateTs);

  const selected: NewsCandidate[] = [];
  const links = new Set<string>();

  for (const item of sorted) {
    const normalizedLink = normalizeLink(item.link);
    if (links.has(normalizedLink)) continue;
    if (selected.some((kept) => areLikelySameStory(kept.title, item.title))) continue;

    selected.push(item);
    links.add(normalizedLink);
    if (selected.length >= limit) break;
  }

  return selected;
}

async function extractThumbnail(articleUrl: string): Promise<string | null> {
  const parsedArticleUrl = parseHttpUrl(articleUrl);
  if (!parsedArticleUrl) return null;

  try {
    const response = await fetch(parsedArticleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NaezipNewsBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.includes('text/html')) return null;
    const html = await response.text();

    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!match) return null;

    const thumbnailUrl = new URL(stripHtml(match[1]), parsedArticleUrl);
    return thumbnailUrl.protocol === 'http:' || thumbnailUrl.protocol === 'https:'
      ? thumbnailUrl.toString()
      : null;
  } catch {
    return null;
  }
}

async function searchNews(
  query: string,
  display: number,
  category: NewsItem['category'],
  headers: Record<string, string>,
): Promise<NewsCandidate[]> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Naver news API responded with ${response.status}`);
  }

  const json = await response.json() as NaverNewsResponse;
  if (!Array.isArray(json.items)) {
    throw new Error('Naver news API returned an invalid payload');
  }

  return json.items.flatMap((item): NewsCandidate[] => {
    const title = stripHtml(item.title ?? '');
    const originalUrl = parseHttpUrl(item.originallink);
    const naverUrl = parseHttpUrl(item.link);
    const articleUrl = originalUrl ?? naverUrl;
    if (!title || !articleUrl || !item.pubDate) return [];

    const publishedAt = new Date(item.pubDate);
    return [{
      title,
      link: articleUrl.toString(),
      naverLink: naverUrl?.toString() ?? articleUrl.toString(),
      pubDate: item.pubDate,
      source: sourceName(articleUrl.toString()),
      category,
      thumbnail: null,
      pubDateTs: Number.isNaN(publishedAt.getTime()) ? 0 : publishedAt.getTime(),
      pubDateFormatted: formatDate(item.pubDate),
    }];
  });
}

function jsonResponse(body: unknown, status: number, cacheControl: string) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': cacheControl },
  });
}

async function collectNews(): Promise<{ news: NewsItem[]; fetchedAt: string }> {
  'use cache';
  // 5분 미만 expire로 빌드 프리렌더를 피하고, 실제 요청에서만 외부 API를 호출한다.
  cacheLife({ stale: 60, revalidate: 120, expire: 240 });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Naver news API credentials are unavailable');
  }

  const headers = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  const [marketItems, housingItems, policyItems] = await Promise.all([
    searchNews('부동산 아파트 매매', 35, 'realestate', headers),
    searchNews('전세 분양 청약 주택', 25, 'realestate', headers),
    searchNews('주택 정책 주담대 금리', 20, 'general', headers),
  ]);

  const curated = curateNews([...marketItems, ...housingItems, ...policyItems]);
  const thumbnailTargets = curated.slice(0, 12);
  const thumbnails = await Promise.allSettled(thumbnailTargets.map(async (item) => {
    const originalThumbnail = await extractThumbnail(item.link);
    if (originalThumbnail || item.naverLink === item.link) return originalThumbnail;
    return extractThumbnail(item.naverLink);
  }));

  thumbnailTargets.forEach((item, index) => {
    item.thumbnail = thumbnails[index].status === 'fulfilled' ? thumbnails[index].value : null;
  });

  return {
    fetchedAt: new Date().toISOString(),
    news: curated.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      pubDateFormatted: item.pubDateFormatted,
      source: item.source,
      category: item.category,
      thumbnail: item.thumbnail,
    })),
  };
}

export async function GET() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[news API] NAVER_CLIENT_ID/SECRET 미설정');
    return jsonResponse({
      status: 'unavailable',
      news: [],
      fetchedAt: new Date().toISOString(),
      error: '뉴스 제공 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
    }, 503, 'no-store');
  }

  try {
    const { news, fetchedAt } = await collectNews();

    return jsonResponse({
      status: 'ok',
      news,
      count: news.length,
      fetchedAt,
      collection: 'automatic',
    }, 200, 'public, s-maxage=900, stale-while-revalidate=1800');
  } catch (error) {
    unstable_rethrow(error);
    console.error('[news API] 네이버 뉴스 수집 오류:', error);
    return jsonResponse({
      status: 'unavailable',
      news: [],
      fetchedAt: new Date().toISOString(),
      error: '뉴스 제공처 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',
    }, 502, 'no-store');
  }
}

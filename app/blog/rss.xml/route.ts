import { getRecentPublishedPostsForFeed } from '@/lib/blog/queries';
import { SITE_URL, SITE_NAME } from '@/lib/site';

const FEED_TITLE = `${SITE_NAME} 칼럼`;
const FEED_DESCRIPTION =
  '부동산 시장·청약·대출·세금·정책에 대한 인사이트와 가이드.';
const FEED_LIMIT = 50;

/**
 * RSS 2.0 피드.
 *
 * /blog/rss.xml 으로 접근.
 * 최근 발행 50개 글 노출.
 *
 * 보안:
 * - title/description은 CDATA로 감싸기 (XML 특수문자·HTML 모두 안전)
 * - URL은 escape (& → &amp; 등)
 *
 * Cache: max-age=600 (10분), s-maxage=3600 (CDN 1시간)
 */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(s: string): string {
  // CDATA 안에 ']]>' 있으면 split
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export async function GET() {
  const items = await getRecentPublishedPostsForFeed(FEED_LIMIT);
  const lastBuildDate = new Date().toUTCString();
  const lastPubDate =
    items[0]?.publishedAt.toUTCString() ?? lastBuildDate;

  const itemsXml = items
    .map((item) => {
      const link = `${SITE_URL}/blog/${escapeXml(item.slug)}`;
      const pubDate = item.publishedAt.toUTCString();
      const description = item.excerpt ?? `${item.title} — 부동산 칼럼`;
      const category = item.categoryName ?? '';

      return `    <item>
      <title>${cdata(item.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${cdata(description)}</description>${
        category ? `\n      <category>${cdata(category)}</category>` : ''
      }
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${cdata(FEED_TITLE)}</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>${cdata(FEED_DESCRIPTION)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <pubDate>${lastPubDate}</pubDate>
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control':
        'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

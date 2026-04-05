import { NextResponse } from 'next/server';

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: 'realestate' | 'general';
  thumbnail: string | null;
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function formatDate(pubDate: string): string {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return pubDate;
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff < 60)   return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

async function extractThumbnail(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    // 다양한 og:image 패턴 매칭 (속성 순서, 줄바꿈, 추가 속성 허용)
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function searchNews(query: string, display: number, category: NewsItem['category'], headers: Record<string, string>): Promise<(NewsItem & { pubDateTs: number; pubDateFormatted: string })[]> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const res  = await fetch(url, { headers, next: { revalidate: 1800 } });
  const json = await res.json();

  return (json.items ?? []).map((item: any) => ({
    title:            stripHtml(item.title),
    link:             item.originallink || item.link,
    pubDate:          item.pubDate,
    source:           new URL(item.originallink || item.link).hostname.replace('www.', '').split('.')[0],
    category,
    thumbnail:        null,
    pubDateTs:        new Date(item.pubDate).getTime(),
    pubDateFormatted: formatDate(item.pubDate),
  }));
}

export async function GET() {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[news API] NAVER_CLIENT_ID/SECRET 미설정');
    return NextResponse.json({ error: '뉴스 데이터를 불러올 수 없습니다' }, { status: 500 });
  }

  const headers = {
    'X-Naver-Client-Id':     clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  try {
    const [reItems, genItems] = await Promise.all([
      searchNews('부동산 아파트 매매', 24, 'realestate', headers),
      searchNews('경제 이슈 사회', 6, 'general', headers),
    ]);

    const allNews = [...reItems, ...genItems]
      .sort((a, b) => b.pubDateTs - a.pubDateTs)
      .slice(0, 30);

    // 상위 12개만 썸네일 추출 (성능)
    const top12 = allNews.slice(0, 12);
    const rest = allNews.slice(12);

    const thumbnails = await Promise.allSettled(
      top12.map((item) => extractThumbnail(item.link))
    );

    top12.forEach((item, i) => {
      item.thumbnail = thumbnails[i].status === 'fulfilled' ? thumbnails[i].value : null;
    });

    const news = [...top12, ...rest];

    return NextResponse.json({ news });
  } catch (e) {
    console.error('네이버 뉴스 API 오류:', e);
    return NextResponse.json({ news: [] });
  }
}

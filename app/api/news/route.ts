import { NextResponse } from 'next/server';

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: 'realestate' | 'general';
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
    pubDateTs:        new Date(item.pubDate).getTime(),
    pubDateFormatted: formatDate(item.pubDate),
  }));
}

export async function GET() {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: '네이버 API 키 미설정' }, { status: 500 });
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

    const news = [...reItems, ...genItems]
      .sort((a, b) => b.pubDateTs - a.pubDateTs)
      .slice(0, 30);

    return NextResponse.json({ news });
  } catch (e) {
    console.error('네이버 뉴스 API 오류:', e);
    return NextResponse.json({ news: [] });
  }
}

import { NextResponse } from 'next/server';

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: 'realestate' | 'general';
}

function parseItems(xml: string, category: NewsItem['category']): NewsItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items.map((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const title = get('title')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/ - [^-]+$/, ''); // 출처 suffix 제거

    const link    = get('link') || (item.match(/<link\/>([\s\S]*?)<title>/)?.[1]?.trim() ?? '');
    const pubDate = get('pubDate');
    const source  = get('source').replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '언론사';

    return { title, link, pubDate, source, category };
  }).filter((n) => n.title.length > 0);
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

export async function GET() {
  const RE_URL   = 'https://news.google.com/rss/search?q=부동산+아파트+매매&hl=ko&gl=KR&ceid=KR:ko';
  const GEN_URL  = 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0JXdHZMVWRSS0FBUAE?hl=ko&gl=KR&ceid=KR:ko';

  try {
    const [reRes, genRes] = await Promise.all([
      fetch(RE_URL,  { next: { revalidate: 1800 } }),
      fetch(GEN_URL, { next: { revalidate: 1800 } }),
    ]);

    const [reXml, genXml] = await Promise.all([reRes.text(), genRes.text()]);

    const reItems  = parseItems(reXml,  'realestate').slice(0, 24);
    const genItems = parseItems(genXml, 'general').slice(0, 6);

    const news = [...reItems, ...genItems]
      .map((n) => ({ ...n, pubDateFormatted: formatDate(n.pubDate), pubDateTs: new Date(n.pubDate).getTime() }))
      .sort((a, b) => b.pubDateTs - a.pubDateTs)
      .slice(0, 30);

    return NextResponse.json({ news });
  } catch (e) {
    console.error('뉴스 API 오류:', e);
    return NextResponse.json({ news: [] });
  }
}

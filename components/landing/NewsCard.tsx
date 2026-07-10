'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 오늘의 뉴스 카드 — 홈 대시보드 (2a 시안, 벤토 밴드3).
 * /api/news 상위 6건. 표본 즉시 표시 → 라이브 도착 시 교체.
 */

const INK = '#0B1524';

interface Row { title: string; link: string; time: string }

/** 표본 6건 — API 도착 전 즉시 표시용 */
const SAMPLE: Row[] = [
  { title: '서울 아파트 실거래가지수 3개월 연속 상승 전환', link: '/news', time: '1시간 전' },
  { title: '정부, 3기 신도시 사전청약 일정 추가 발표', link: '/news', time: '2시간 전' },
  { title: '한국부동산원 "수도권 전세 상승폭 둔화"', link: '/news', time: '3시간 전' },
  { title: '강남3구 토지거래허가구역 재지정 검토', link: '/news', time: '4시간 전' },
  { title: '시중은행 주담대 금리 4% 초반대로 하락', link: '/news', time: '5시간 전' },
  { title: 'GTX-C 착공식… 연내 우선협상 마무리', link: '/news', time: '6시간 전' },
];

interface NewsItem { title: string; link: string; pubDate: string }

/** pubDate 가 상대 표기("N시간 전")면 그대로, 아니면 MM.DD 로 축약 */
function fmtTime(pubDate: string): string {
  if (pubDate.includes('전') || pubDate.includes('분') || pubDate.includes('시간')) return pubDate;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return pubDate;
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewsCard() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news')
      .then((r) => r.json())
      .then((json: { news?: NewsItem[] }) => {
        if (cancelled) return;
        const live = (json.news ?? []).slice(0, 6).map((n) => ({
          title: n.title,
          link:  n.link,
          time:  fmtTime(n.pubDate),
        }));
        if (live.length) setRows(live);
      })
      .catch(() => { /* 실패 시 표본 유지 */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>오늘의 뉴스</span>
        <Link href="/news" style={{ fontSize: 12.5, fontWeight: 600, color: '#1B4DDB', textDecoration: 'none', flexShrink: 0 }}>
          전체 →
        </Link>
      </div>

      {/* 리스트 6건 */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {rows.map((nw, i) => {
          const external = nw.link.startsWith('http');
          return (
            <a
              key={i}
              href={nw.link}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                borderBottom: '1px solid #F1F3F7', textDecoration: 'none',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-sg, ui-monospace, monospace)',
                fontSize: 11, fontWeight: 700, color: '#C3CAD8', flexShrink: 0, width: 16,
              }}>
                {i + 1}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#2B333F',
                lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {nw.title}
              </span>
              <span style={{ fontSize: 10.5, color: '#B4BBC8', flexShrink: 0 }}>{nw.time}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

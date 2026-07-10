'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 특이 실거래 카드 — 홈 대시보드 (2a 시안, 벤토 밴드1).
 *
 * /api/transactions/highlights 의 3개 카테고리(신고가·급등·국평 TOP)에서 4건 구성.
 * 표본 즉시 표시 → 라이브 도착 시 교체. 데스크톱 2×2 그리드, 모바일 가로 스크롤.
 * 시안의 급락/갭축소 태그는 실제 API 카테고리로 대체.
 */

const INK = '#0B1524';

type Tag = '신고가' | '급등' | '국평 TOP';

const TAG_TINT: Record<Tag, { color: string; bg: string }> = {
  '신고가':    { color: '#C4341C', bg: '#FBEAE5' },
  '급등':      { color: '#8A6D1F', bg: '#FBF1D9' },
  '국평 TOP': { color: '#1B4DDB', bg: '#EAF0FE' },
};

interface Mini {
  tag:        Tag;
  name:       string;
  price:      string;
  delta:      string;
  deltaColor: string;
  href:       string;
}

/** 표본 4건 — API 도착 전 즉시 표시용 */
const SAMPLE: Mini[] = [
  { tag: '신고가',    name: '아크로리버파크',     price: '47.5억', delta: '▲ 2.5억', deltaColor: '#C4341C', href: '/highlights' },
  { tag: '급등',      name: '잠실엘스',           price: '27.3억', delta: '+4.2%',   deltaColor: '#C4341C', href: '/highlights' },
  { tag: '국평 TOP', name: '래미안 원베일리',     price: '49.8억', delta: '84㎡',    deltaColor: '#6B7488', href: '/highlights' },
  { tag: '신고가',    name: '마포프레스티지자이', price: '19.8억', delta: '▲ 0.6억', deltaColor: '#C4341C', href: '/highlights' },
];

interface Deal {
  district: string;
  apt:      string;
  area:     number;
  floor:    number;
  price:    number;
  date:     string;
  masterId?: string | null;
}

interface HighlightsRes {
  newHighs?: (Deal & { prevHigh: number })[];
  surges?:   (Deal & { prevPrice: number; ratePct: number })[];
  pyeong84?: Deal[];
}

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = Math.round((manwon / 10000) * 10) / 10;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}

function dealHref(d: Deal): string {
  return d.masterId
    ? `/apt/${encodeURIComponent(d.masterId)}`
    : `/transactions?district=${encodeURIComponent(d.district)}&q=${encodeURIComponent(d.apt)}`;
}

/** 카테고리별 응답 → 미니 카드 4건 구성 (신고가 → 급등 → 국평 → 신고가2 순, 부족하면 순환 보충) */
function buildMinis(res: HighlightsRes): Mini[] {
  const highs  = res.newHighs ?? [];
  const surges = res.surges ?? [];
  const p84    = res.pyeong84 ?? [];

  const fromHigh = (d: Deal & { prevHigh: number }): Mini => ({
    tag: '신고가', name: d.apt, price: fmtEok(d.price),
    delta: d.price > d.prevHigh ? `▲ ${fmtEok(d.price - d.prevHigh)}` : '',
    deltaColor: '#C4341C', href: dealHref(d),
  });
  const fromSurge = (d: Deal & { ratePct: number }): Mini => ({
    tag: '급등', name: d.apt, price: fmtEok(d.price),
    delta: `+${d.ratePct}%`, deltaColor: '#C4341C', href: dealHref(d),
  });
  const fromP84 = (d: Deal): Mini => ({
    tag: '국평 TOP', name: d.apt, price: fmtEok(d.price),
    delta: `${d.floor}층`, deltaColor: '#6B7488', href: dealHref(d),
  });

  // 우선 배치 후 남는 슬롯은 카테고리 순환으로 보충
  const queue: Mini[] = [
    ...(highs[0]  ? [fromHigh(highs[0])]   : []),
    ...(surges[0] ? [fromSurge(surges[0])] : []),
    ...(p84[0]    ? [fromP84(p84[0])]      : []),
    ...(highs[1]  ? [fromHigh(highs[1])]   : []),
    ...(surges[1] ? [fromSurge(surges[1])] : []),
    ...(p84[1]    ? [fromP84(p84[1])]      : []),
    ...highs.slice(2).map(fromHigh),
  ];
  return queue.slice(0, 4);
}

export default function NotableDealsCard() {
  const [minis, setMinis] = useState<Mini[]>(SAMPLE);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transactions/highlights')
      .then((r) => r.json())
      .then((json: HighlightsRes) => {
        if (cancelled) return;
        const live = buildMinis(json);
        if (live.length === 4) setMinis(live);
      })
      .catch(() => { /* 실패 시 표본 유지 */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <style>{`
        .nz-notable{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex:1}
        @media (max-width:720px){
          .nz-notable{display:flex;overflow-x:auto;margin:0 -16px;padding:0 16px;scrollbar-width:none}
          .nz-notable::-webkit-scrollbar{display:none}
          .nz-notable>a{flex:0 0 150px}
        }
      `}</style>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#E5484D', animation: 'zipPulse 2s ease-in-out infinite' }} />
          <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>특이 실거래</span>
        </div>
        <Link href="/highlights" style={{ fontSize: 12.5, fontWeight: 600, color: '#1B4DDB', textDecoration: 'none', flexShrink: 0 }}>
          전체 →
        </Link>
      </div>

      {/* 미니 카드 4건 */}
      <div className="nz-notable">
        {minis.map((n, i) => {
          const tint = TAG_TINT[n.tag];
          return (
            <Link key={i} href={n.href} style={{
              border: '1px solid #EEF0F5', borderRadius: 12, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 7,
              background: '#FCFDFE', textDecoration: 'none', minWidth: 0,
            }}>
              <span style={{
                alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700,
                color: tint.color, background: tint.bg, padding: '3px 7px', borderRadius: 6,
              }}>
                {n.tag}
              </span>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: INK, lineHeight: 1.3 }}>{n.name}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto' }}>
                <span style={{ fontFamily: 'var(--font-sg, ui-monospace, monospace)', fontWeight: 700, fontSize: 16, color: INK }}>
                  {n.price}
                </span>
                {n.delta && (
                  <span style={{ fontWeight: 700, fontSize: 11.5, color: n.deltaColor }}>{n.delta}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

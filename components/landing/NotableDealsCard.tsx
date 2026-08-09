'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 특이 실거래 카드 — 홈 대시보드 (2a 시안, 벤토 밴드1).
 *
 * /api/transactions/highlights 의 3개 카테고리(신고가·급등·국평 TOP)에서 최대 4건 구성.
 * 실제 응답만 표시하며 loading·부분·빈 결과·장애 상태를 분리한다.
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
  status?:   'ok' | 'degraded';
  newHighs?: (Deal & { prevHigh: number })[];
  surges?:   (Deal & { prevPrice: number; ratePct: number })[];
  pyeong84?: Deal[];
  note?:      string;
}

type DealsView =
  | { kind: 'loading' }
  | { kind: 'ready'; minis: Mini[]; partial: boolean }
  | { kind: 'empty' }
  | { kind: 'degraded'; message: string };

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

  // 카테고리를 순환하며 배치하고, 한 카테고리만 있어도 최대 4건까지 보충한다.
  const categories = [highs.map(fromHigh), surges.map(fromSurge), p84.map(fromP84)];
  const queue: Mini[] = [];
  const longest = Math.max(0, ...categories.map((items) => items.length));
  for (let index = 0; index < longest && queue.length < 4; index += 1) {
    for (const items of categories) {
      if (items[index]) queue.push(items[index]);
      if (queue.length === 4) break;
    }
  }
  return queue;
}

export default function NotableDealsCard() {
  const [view, setView] = useState<DealsView>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transactions/highlights')
      .then(async (r) => {
        if (!r.ok) throw new Error(`highlights HTTP ${r.status}`);
        return r.json() as Promise<HighlightsRes>;
      })
      .then((json: HighlightsRes) => {
        if (cancelled) return;
        if (json.status !== 'ok') {
          setView({
            kind: 'degraded',
            message: json.note ?? '집계 데이터를 잠시 불러오지 못했습니다.',
          });
          return;
        }
        const live = buildMinis(json);
        setView(live.length === 0
          ? { kind: 'empty' }
          : { kind: 'ready', minis: live, partial: live.length < 4 });
      })
      .catch(() => {
        if (!cancelled) {
          setView({ kind: 'degraded', message: '집계 데이터를 잠시 불러오지 못했습니다.' });
        }
      });
    return () => { cancelled = true; };
  }, [attempt]);

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

      {view.kind === 'loading' && (
        <div role="status" style={{ color: '#6B7488', fontSize: 13, padding: '26px 4px' }}>
          특이 실거래를 불러오는 중입니다.
        </div>
      )}

      {view.kind === 'empty' && (
        <div role="status" style={{ color: '#6B7488', fontSize: 13, padding: '26px 4px', lineHeight: 1.5 }}>
          최근 30일 조건에 맞는 특이 실거래가 없습니다.
        </div>
      )}

      {view.kind === 'degraded' && (
        <div role="alert" style={{ color: '#6B7488', fontSize: 13, padding: '18px 4px', lineHeight: 1.5 }}>
          <div>{view.message}</div>
          <button
            type="button"
            onClick={() => {
              setView({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
            style={{
              marginTop: 10, border: '1px solid #D9DEEA', borderRadius: 8, background: '#FFFFFF',
              color: '#1B4DDB', fontWeight: 700, fontSize: 12, padding: '6px 10px', cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {view.kind === 'ready' && (
        <>
          <div className="nz-notable">
            {view.minis.map((n, i) => {
              const tint = TAG_TINT[n.tag];
              return (
                <Link key={`${n.tag}-${n.name}-${i}`} href={n.href} style={{
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
          {view.partial && (
            <div role="status" style={{ color: '#8A93A3', fontSize: 11, marginTop: 9 }}>
              현재 집계된 {view.minis.length}건만 표시합니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}

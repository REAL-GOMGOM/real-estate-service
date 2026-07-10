'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 최근 실거래 카드 — 홈 대시보드 (2a 시안, 벤토 밴드1).
 *
 * 지역 칩 탭 ↔ 최근 매매 4건. 표본을 즉시 그리고 /api/transactions 도착 시 교체
 * (기존 HeroLive 의 라이브 로딩 패턴 이식).
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';

interface Tx {
  name: string; dong: string; area: string; floor: string; price: string; date: string;
}

const REGIONS = ['강남구', '서초구', '송파구', '마포구', '용산구'] as const;
type Region = (typeof REGIONS)[number];

/** 표본 데이터 — API 도착 전 즉시 표시용 (도착하면 교체) */
const TX: Record<Region, Tx[]> = {
  강남구: [
    { name: '래미안 대치팰리스', dong: '대치동', area: '84㎡', floor: '15층', price: '34.5억', date: '07.07' },
    { name: '은마아파트', dong: '대치동', area: '76㎡', floor: '3층', price: '26.8억', date: '07.06' },
    { name: '도곡렉슬', dong: '도곡동', area: '114㎡', floor: '20층', price: '39.2억', date: '07.05' },
    { name: '개포자이 프레지던스', dong: '개포동', area: '84㎡', floor: '8층', price: '31.9억', date: '07.04' },
  ],
  서초구: [
    { name: '반포자이', dong: '반포동', area: '84㎡', floor: '12층', price: '38억', date: '07.07' },
    { name: '아크로리버파크', dong: '반포동', area: '84㎡', floor: '22층', price: '45억', date: '07.06' },
    { name: '래미안 퍼스티지', dong: '반포동', area: '84㎡', floor: '9층', price: '39.5억', date: '07.05' },
    { name: '서초 그랑자이', dong: '서초동', area: '59㎡', floor: '7층', price: '24.7억', date: '07.04' },
  ],
  송파구: [
    { name: '잠실엘스', dong: '잠실동', area: '84㎡', floor: '14층', price: '27.3억', date: '07.07' },
    { name: '리센츠', dong: '잠실동', area: '84㎡', floor: '18층', price: '26.9억', date: '07.06' },
    { name: '파크리오', dong: '신천동', area: '84㎡', floor: '5층', price: '24.5억', date: '07.05' },
    { name: '헬리오시티', dong: '가락동', area: '84㎡', floor: '25층', price: '23.8억', date: '07.04' },
  ],
  마포구: [
    { name: '마포 래미안푸르지오', dong: '아현동', area: '84㎡', floor: '10층', price: '18.9억', date: '07.07' },
    { name: '마포프레스티지자이', dong: '염리동', area: '84㎡', floor: '16층', price: '19.8억', date: '07.06' },
    { name: '공덕자이', dong: '공덕동', area: '59㎡', floor: '8층', price: '14.2억', date: '07.05' },
    { name: 'e편한세상 마포리버파크', dong: '신공덕동', area: '84㎡', floor: '12층', price: '17.5억', date: '07.04' },
  ],
  용산구: [
    { name: '한강맨션', dong: '이촌동', area: '87㎡', floor: '4층', price: '42억', date: '07.07' },
    { name: '래미안 첼리투스', dong: '한강로동', area: '124㎡', floor: '30층', price: '55억', date: '07.06' },
    { name: '용산 센트럴파크', dong: '한강로동', area: '84㎡', floor: '20층', price: '28.9억', date: '07.05' },
    { name: '이촌 코오롱', dong: '이촌동', area: '59㎡', floor: '6층', price: '19.3억', date: '07.04' },
  ],
};

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = Math.round((manwon / 10000) * 10) / 10;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}
function fmtDay(date: string): string {
  const p = date.split('-');
  return p.length >= 3 ? `${p[1]}.${p[2]}` : (p[1] ?? '');
}

export default function RecentDealsCard() {
  const [region, setRegion] = useState<Region>('강남구');
  const [live, setLive] = useState<{ region: Region; rows: Tx[] } | null>(null);
  const list = live && live.region === region ? live.rows : TX[region];

  // 지역 변경 시 최근 매매 4건 라이브 로드 (실패 시 표본 유지)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transactions?district=${encodeURIComponent(region)}&months=2`)
      .then((r) => r.json())
      .then((json: { data?: Array<{ name: string; dong?: string | null; transactions: Array<{ dong?: string | null; area: number; floor: number; price: number; date: string }> }> }) => {
        if (cancelled) return;
        const rows = (json.data ?? []).flatMap((g) => g.transactions.map((t) => ({ g, t })));
        rows.sort((a, b) => b.t.date.localeCompare(a.t.date));
        const top4 = rows.slice(0, 4).map(({ g, t }) => ({
          name: g.name,
          dong: t.dong ?? g.dong ?? '',
          area: `${t.area}㎡`,
          floor: `${t.floor}층`,
          price: fmtEok(t.price),
          date: fmtDay(t.date),
        }));
        if (top4.length) setLive({ region, rows: top4 });
      })
      .catch(() => { /* 실패 시 표본 유지 */ });
    return () => { cancelled = true; };
  }, [region]);

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: '#12B76A', boxShadow: '0 0 0 4px #E6F7EE', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          최근 실거래 · {region}
        </span>
      </div>

      {/* 지역 칩 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {REGIONS.map((r) => {
          const active = r === region;
          return (
            <button
              key={r}
              onClick={() => setRegion(r)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', transition: '.15s', fontFamily: 'inherit',
                background: active ? BLUE : '#FFFFFF',
                color:      active ? '#FFFFFF' : '#3A4453',
                border: `1px solid ${active ? BLUE : '#E2E6EF'}`,
              }}
            >
              {r}
            </button>
          );
        })}
      </div>

      {/* 거래 4건 */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {list.map((tx, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 0', borderBottom: '1px solid #F1F3F7',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.name}
              </div>
              <div style={{ fontSize: 11.5, color: '#8A93A3', marginTop: 2 }}>
                {tx.dong} · 전용 {tx.area} · {tx.floor}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: BLUE, fontFamily: 'Roboto Mono, monospace' }}>{tx.price}</div>
              <div style={{ fontSize: 10.5, color: '#A0A8B5', marginTop: 2 }}>{tx.date}</div>
            </div>
          </div>
        ))}
      </div>

      <Link
        href={`/transactions?district=${encodeURIComponent(region)}`}
        style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none' }}
      >
        {region} 실거래 더 보기 →
      </Link>
    </div>
  );
}

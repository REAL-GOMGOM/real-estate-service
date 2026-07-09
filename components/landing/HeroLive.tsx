'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 랜딩 히어로 (디자인 개편) — 지역 탭 ↔ 실거래 카드 인터랙션.
 * 좌: 카피·지역 선택·CTA / 우: 선택 지역의 최근 실거래 카드.
 * 색상·카피는 Claude Design 캔버스 시안 기준. 데이터는 시안 표본(추후 라이브 API 연동 가능).
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const BODY = '#5B6472';
const MUTED = '#8A93A3';
const META = '#A0A8B5';
const BORDER = '#E7EAF0';

interface Tx {
  name: string; dong: string; area: string; floor: string; price: string; date: string;
}

const REGIONS = ['강남구', '서초구', '송파구', '마포구', '용산구'] as const;
type Region = (typeof REGIONS)[number];

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

const EYEBROW: React.CSSProperties = {
  fontFamily: 'var(--font-sg, ui-monospace, monospace)',
  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#98A1B0',
};

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = manwon / 10000;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}
function fmtDay(date: string): string {
  const p = date.split('-');
  return p.length >= 3 ? `${p[1]}.${p[2]}` : (p[1] ?? '');
}

export default function HeroLive() {
  const [region, setRegion] = useState<Region>('강남구');
  const [live, setLive] = useState<{ region: Region; rows: Tx[] } | null>(null);
  const list = live && live.region === region ? live.rows : TX[region];

  // 지역 변경 시 실거래 API 로 최근 매매 4건 라이브 로드 (매칭 전엔 표본, 도착하면 교체).
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
    <section style={{ background: 'linear-gradient(180deg, #FBFCFE, #F3F6FD)' }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '74px 24px 66px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
        gap: 44, alignItems: 'center',
      }}>
        {/* 좌측 — 카피 + 지역 선택 + CTA */}
        <div style={{ minWidth: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 13px', borderRadius: 999, background: '#FFFFFF',
            border: '1px solid #D7E0F5', fontSize: 12.5, fontWeight: 600, color: BLUE,
          }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#12B76A', boxShadow: '0 0 0 4px #E6F7EE', animation: 'zipPulse 1.8s ease-in-out infinite' }} />
            </span>
            실거래 데이터 실시간 반영 중
          </span>

          <h1 style={{
            margin: '20px 0 0', fontSize: 'clamp(32px, 5vw, 53px)', lineHeight: 1.08,
            fontWeight: 800, letterSpacing: '-0.038em', color: INK,
          }}>
            부동산의 모든 답을,<br />한 곳에 압축하다
          </h1>

          <p style={{ margin: '18px 0 0', fontSize: 17, lineHeight: 1.65, color: BODY, maxWidth: 450 }}>
            국토교통부·한국부동산원 공식 데이터를 가공 없이. 지역을 고르면 최근 실거래가가 카드로 흐릅니다.
          </p>

          <div style={{ marginTop: 30 }}>
            <span style={EYEBROW}>SELECT REGION</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {REGIONS.map((r) => {
                const active = r === region;
                return (
                  <button
                    key={r}
                    onClick={() => setRegion(r)}
                    style={{
                      padding: '9px 16px', borderRadius: 11, fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', transition: 'all .15s',
                      background: active ? BLUE : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#3A4453',
                      border: `1px solid ${active ? BLUE : '#E2E6EF'}`,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30, flexWrap: 'wrap' }}>
            <Link href="/region" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '13px 22px', borderRadius: 13, background: BLUE, color: '#FFFFFF',
              fontSize: 15, fontWeight: 700, textDecoration: 'none',
            }}>
              지역 둘러보기 →
            </Link>
            <Link href="/price-map" style={{ fontSize: 15, fontWeight: 700, color: BLUE, textDecoration: 'none' }}>
              시세 지도로 보기
            </Link>
          </div>
        </div>

        {/* 우측 — 최근 실거래 카드 */}
        <div style={{
          background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 20,
          padding: 24, boxShadow: '0 24px 60px -28px rgba(15,30,60,0.35)', minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#12B76A', boxShadow: '0 0 0 4px #E6F7EE', flexShrink: 0 }} />
              <span style={{ fontSize: 14.5, fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                최근 실거래 · {region}
              </span>
            </div>
            <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>국토부 공개 · 계약일순</span>
          </div>

          <div>
            {list.map((tx, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '13px 8px', borderRadius: 10,
                borderTop: i === 0 ? 'none' : '1px solid #F1F3F7',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.name}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: MUTED }}>
                    {tx.dong} · 전용 {tx.area} · {tx.floor}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: BLUE, fontFamily: 'Roboto Mono, monospace' }}>{tx.price}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: META }}>매매 · {tx.date}</p>
                </div>
              </div>
            ))}
          </div>

          <Link href={`/transactions?district=${encodeURIComponent(region)}`} style={{
            display: 'block', marginTop: 12, padding: '12px 14px', borderRadius: 12,
            background: '#F7F9FE', color: BLUE, fontSize: 13, fontWeight: 700,
            textAlign: 'center', textDecoration: 'none',
          }}>
            {region} 실거래 더 보기 →
          </Link>
        </div>
      </div>
      <style>{`@keyframes zipPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </section>
  );
}

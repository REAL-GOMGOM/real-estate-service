'use client';

/**
 * 실질 가치 티저 카드 — 홈 대시보드 (2026-07-12).
 *
 * /dollar 의 핵심 메시지("원화로는 올랐지만 금·BTC로 재면?")를 홈에서 맛보기로.
 * 대표 단지를 일별 로테이션(재방문 유도)하고, 해석 문장은 /dollar 와 동일한
 * buildRealValueInsight 를 재사용한다. API 도착 전에는 은마 표본을 즉시 표시.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildRealValueInsight } from '@/lib/real-value-shared';

const INK = '#0B1524';

/** 일별 로테이션 풀 — /dollar 인기 단지 서브셋 */
const ROTATION = [
  { district: '강남구', aptName: '은마아파트' },
  { district: '서초구', aptName: '반포자이' },
  { district: '송파구', aptName: '헬리오시티' },
  { district: '강남구', aptName: '도곡렉슬' },
  { district: '마포구', aptName: '마포래미안푸르지오' },
  { district: '서초구', aptName: '아크로리버파크' },
] as const;

const BASE_YEAR = 2020;

interface RowView { icon: string; label: string; accent: string; pct: number | null; }

interface CardState {
  aptName: string;
  district: string;
  compareYear: number;
  krwPct: number | null;
  usdPct: number | null;
  btcPct: number | null;
  goldPct: number | null;
}

/** 표본 — API 도착 전 즉시 표시용 (은마 2020→2025 실측 근사) */
const SAMPLE: CardState = {
  aptName: '은마아파트', district: '강남구', compareYear: 2025,
  krwPct: 73.7, usdPct: 39.5, btcPct: -82.6, goldPct: -38.5,
};

function pctOf(base: number | null, compare: number | null): number | null {
  if (base === null || compare === null || base === 0) return null;
  return ((compare - base) / base) * 100;
}

export default function RealValueCard() {
  const [card, setCard] = useState<CardState>(SAMPLE);

  useEffect(() => {
    let cancelled = false;
    // 날짜 계산은 클라이언트에서만 (hydration 안전)
    const pick = ROTATION[new Date().getDate() % ROTATION.length];
    const compareYear = new Date().getFullYear(); // 연중 시세 (2026-07-12 최신화)
    const params = new URLSearchParams({
      district: pick.district, aptName: pick.aptName,
      baseYear: String(BASE_YEAR), compareYear: String(compareYear),
    });
    fetch(`/api/dollar?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const krwPct = pctOf(d.basePriceKrw, d.comparePriceKrw);
        if (krwPct === null) return; // 데이터 없으면 표본 유지
        const baseUsd    = d.basePriceKrw    !== null ? (d.basePriceKrw    * 10000) / d.baseExchangeRate    : null;
        const compareUsd = d.comparePriceKrw !== null ? (d.comparePriceKrw * 10000) / d.compareExchangeRate : null;
        const baseBtc    = d.basePriceKrw    !== null && d.baseBtcKrw    ? (d.basePriceKrw    * 10000) / d.baseBtcKrw    : null;
        const compareBtc = d.comparePriceKrw !== null && d.compareBtcKrw ? (d.comparePriceKrw * 10000) / d.compareBtcKrw : null;
        const baseAu     = d.basePriceKrw    !== null && d.baseGoldKrwPerGram    ? (d.basePriceKrw    * 10000) / d.baseGoldKrwPerGram    : null;
        const compareAu  = d.comparePriceKrw !== null && d.compareGoldKrwPerGram ? (d.comparePriceKrw * 10000) / d.compareGoldKrwPerGram : null;
        setCard({
          aptName: pick.aptName, district: pick.district, compareYear,
          krwPct,
          usdPct:  pctOf(baseUsd, compareUsd),
          btcPct:  pctOf(baseBtc, compareBtc),
          goldPct: pctOf(baseAu, compareAu),
        });
      })
      .catch(() => { /* 실패 시 표본 유지 */ });
    return () => { cancelled = true; };
  }, []);

  const insight = buildRealValueInsight({
    aptName: card.aptName, district: card.district,
    baseYear: BASE_YEAR, compareYear: card.compareYear,
    krwPct: card.krwPct, usdPct: card.usdPct, btcPct: card.btcPct, goldPct: card.goldPct,
  });

  const rows: RowView[] = [
    { icon: '₩',  label: '원화', accent: '#64708A', pct: card.krwPct },
    { icon: 'Au', label: '금',   accent: '#C9A227', pct: card.goldPct },
    { icon: '₿',  label: '비트', accent: '#F0A24B', pct: card.btcPct },
  ];

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>
          실질 가치 <span style={{ fontWeight: 600, fontSize: 11.5, color: '#8A94A8' }}>금·BTC로 재보기</span>
        </span>
        <Link href="/dollar" style={{ fontSize: 12.5, fontWeight: 600, color: '#1B4DDB', textDecoration: 'none', flexShrink: 0 }}>
          전체 →
        </Link>
      </div>

      {/* 오늘의 단지 */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>{card.aptName}</span>
        <span style={{ fontSize: 11.5, color: '#8A94A8', marginLeft: 7 }}>
          {card.district} · {BASE_YEAR}→{card.compareYear}
        </span>
      </div>

      {/* 자산별 변동률 3줄 */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {rows.map((r) => {
          const up = r.pct !== null && r.pct >= 0;
          const fill = r.pct === null ? 0 : Math.min(Math.abs(r.pct), 150) / 150 * 100;
          return (
            <div key={r.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid #F1F3F7',
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: r.accent, background: `${r.accent}16`,
              }}>
                {r.icon}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4A5568', width: 34, flexShrink: 0 }}>{r.label}</span>
              {/* 미니 바 */}
              <span style={{ flex: 1, height: 5, borderRadius: 3, background: '#F1F3F7', overflow: 'hidden' }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 3,
                  width: `${fill}%`,
                  background: up ? '#6FC08A' : '#E85D5D', opacity: 0.9,
                }} />
              </span>
              <span style={{
                fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-sg, ui-monospace, monospace)',
                color: r.pct === null ? '#C3CAD8' : up ? '#2E7A4C' : '#C92F2F',
                width: 74, textAlign: 'right', flexShrink: 0,
              }}>
                {r.pct === null ? '—' : `${up ? '▲' : '▼'}${Math.abs(r.pct).toFixed(1)}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* 해석 한 줄 */}
      {insight && (
        <p style={{
          margin: '10px 0 0', padding: '9px 12px', borderRadius: 10,
          background: '#F4F7FE', fontSize: 11.5, lineHeight: 1.55, color: '#3D4E6E',
        }}>
          💡 {insight}
        </p>
      )}

      {/* CTA */}
      <Link href="/dollar" style={{
        marginTop: 12, textAlign: 'center', padding: '9px 0', borderRadius: 10,
        background: '#EEF2FB', color: '#1B4DDB', fontSize: 12.5, fontWeight: 700,
        textDecoration: 'none',
      }}>
        내 단지도 금·BTC로 재보기 →
      </Link>
    </div>
  );
}

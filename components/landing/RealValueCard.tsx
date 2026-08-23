'use client';

/**
 * 실질 가치 티저 카드 — 홈 대시보드 (2026-07-12).
 *
 * /dollar 의 핵심 메시지("원화로는 올랐지만 금·BTC로 재면?")를 홈에서 맛보기로.
 * 대표 단지를 일별 로테이션(재방문 유도)하고, 해석 문장은 /dollar 와 동일한
 * buildRealValueInsight 를 재사용한다. 검증된 API 응답이 있을 때만 수치를 표시한다.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildRealValueInsight } from '@/lib/real-value-shared';

const INK = '#0B1524';

/** 일별 로테이션 풀 — /dollar 인기 단지 서브셋 */
// /dollar 기본 목록(Eric 선정)과 동기 — 한강맨션은 2026 거래 부재(재건축 이주)로
// 홈 로테이션에서만 제외한다.
// 한강맨션은 재건축 이주, 올림픽파크포레온은 2024년 입주라 2020 기준 비교가 어렵다.
const ROTATION = [
  { district: '강남구', aptName: '은마아파트',        label: '은마아파트' },
  { district: '강남구', aptName: '신현대',            label: '압구정 신현대' },
  { district: '강남구', aptName: '도곡렉슬',          label: '도곡렉슬' },
  { district: '송파구', aptName: '잠실엘스',          label: '잠실엘스' },
  { district: '송파구', aptName: '리센츠',            label: '리센츠' },
  { district: '송파구', aptName: '트리지움',          label: '트리지움' },
  { district: '송파구', aptName: '헬리오시티',        label: '헬리오시티' },
  { district: '마포구', aptName: '마포래미안푸르지오', label: '마포래미안푸르지오' },
  { district: '용산구', aptName: '신동아',            label: '서빙고 신동아' },
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
  isPartial: boolean;
}

function pctOf(base: number | null, compare: number | null): number | null {
  if (base === null || compare === null || base === 0) return null;
  return ((compare - base) / base) * 100;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export default function RealValueCard() {
  const [card, setCard] = useState<CardState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    // 날짜 계산은 클라이언트에서만 (hydration 안전)
    const pick = ROTATION[new Date().getDate() % ROTATION.length];
    const compareYear = new Date().getFullYear(); // 연중 시세 (2026-07-12 최신화)
    const params = new URLSearchParams({
      district: pick.district, aptName: pick.aptName,
      baseYear: String(BASE_YEAR), compareYear: String(compareYear),
    });
    fetch(`/api/dollar?${params}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`실질 가치 API HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d?.status !== 'ok' && d?.status !== 'partial') {
          throw new Error('실질 가치 API 응답 계약 오류');
        }
        const basePrice = finiteNumber(d?.basePriceKrw);
        const comparePrice = finiteNumber(d?.comparePriceKrw);
        const krwPct = pctOf(basePrice, comparePrice);
        if (krwPct === null) {
          setStatus('empty');
          return;
        }
        const baseExchange = finiteNumber(d?.baseExchangeRate);
        const compareExchange = finiteNumber(d?.compareExchangeRate);
        const baseBtcKrw = finiteNumber(d?.baseBtcKrw);
        const compareBtcKrw = finiteNumber(d?.compareBtcKrw);
        const baseGold = finiteNumber(d?.baseGoldKrwPerGram);
        const compareGold = finiteNumber(d?.compareGoldKrwPerGram);
        const baseUsd = baseExchange ? (basePrice! * 10000) / baseExchange : null;
        const compareUsd = compareExchange ? (comparePrice! * 10000) / compareExchange : null;
        const baseBtc = baseBtcKrw ? (basePrice! * 10000) / baseBtcKrw : null;
        const compareBtc = compareBtcKrw ? (comparePrice! * 10000) / compareBtcKrw : null;
        const baseAu = baseGold ? (basePrice! * 10000) / baseGold : null;
        const compareAu = compareGold ? (comparePrice! * 10000) / compareGold : null;
        setCard({
          aptName: pick.label, district: pick.district, compareYear,
          krwPct,
          usdPct:  pctOf(baseUsd, compareUsd),
          btcPct:  pctOf(baseBtc, compareBtc),
          goldPct: pctOf(baseAu, compareAu),
          isPartial: d.status === 'partial',
        });
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const insight = card
    ? buildRealValueInsight({
        aptName: card.aptName, district: card.district,
        baseYear: BASE_YEAR, compareYear: card.compareYear,
        krwPct: card.krwPct, usdPct: card.usdPct, btcPct: card.btcPct, goldPct: card.goldPct,
      })
    : null;

  const rows: RowView[] = card ? [
    { icon: '₩',  label: '원화', accent: '#64708A', pct: card.krwPct },
    { icon: 'Au', label: '금',   accent: '#C9A227', pct: card.goldPct },
    { icon: '₿',  label: '비트', accent: '#F0A24B', pct: card.btcPct },
  ] : [];

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

      {status === 'loading' ? (
        <div role="status" style={{ flex: 1, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A94A8', fontSize: 13 }}>
          실거래와 자산 기준값을 확인하는 중입니다.
        </div>
      ) : !card ? (
        <div role={status === 'error' ? 'alert' : 'status'} style={{ flex: 1, minHeight: 180, padding: '16px', borderRadius: 12, background: '#F8FAFD', color: '#5B6472' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>
            {status === 'error' ? '실질 가치 데이터를 잠시 불러오지 못했습니다.' : '오늘 비교할 수 있는 실거래 표본이 없습니다.'}
          </p>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, lineHeight: 1.6 }}>
            임시 수치 대신 확인된 데이터만 표시합니다. 상세 페이지에서 다른 단지를 검색해 보세요.
          </p>
        </div>
      ) : (
        <>
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
          {card.isPartial && (
            <p style={{ margin: '7px 0 0', fontSize: 10.5, lineHeight: 1.5, color: '#7A8498' }}>
              일부 조회 월 또는 환산 기준에 추정치가 포함될 수 있습니다. 상세 화면의 출처·기준일을 확인해 주세요.
            </p>
          )}
        </>
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

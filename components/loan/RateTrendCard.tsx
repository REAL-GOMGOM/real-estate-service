'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * 금리 추이 카드 — 사이클 Y (대출 시뮬레이터 탭별 금리 변화)
 *
 * /api/loan/rate-history 의 12개월 시계열을 순수 SVG 라인으로 렌더.
 * variant='cofix' → 은행대출 탭 (변동금리 기준지표)
 * variant='base'  → 정부대출 탭 (한은 기준금리, 정책 방향 참고)
 */

interface RatePoint { period: string; rate: number }
interface RateHistory {
  cofix: { name: string; points: RatePoint[] };
  base:  { name: string; points: RatePoint[] };
}

// 모듈 캐시 — 두 탭 전환 시 재요청 방지
let cached: RateHistory | null = null;

interface RateTrendCardProps {
  variant: 'cofix' | 'base';
}

function fmtPeriod(period: string): string {
  // 202607 → 26.07
  return `${period.slice(2, 4)}.${period.slice(4, 6)}`;
}

export default function RateTrendCard({ variant }: RateTrendCardProps) {
  const [history, setHistory] = useState<RateHistory | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetch('/api/loan/rate-history')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.cofix?.points) {
          cached = json;
          setHistory(json);
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return null;               // 금리 추이는 부가 정보 — 실패 시 조용히 생략
  const series = history?.[variant];
  if (!history || !series || series.points.length < 2) {
    return (
      <div style={{
        height: '128px', borderRadius: '14px',
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
        animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 20,
      }}>
        <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
      </div>
    );
  }

  const pts = series.points;
  const rates = pts.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || 0.1;

  const W = 560, H = 84, PAD = 8;
  const coords = pts.map((p, i) => ({
    x: PAD + (i / (pts.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (p.rate - min) / span) * (H - PAD * 2),
  }));

  const latest = pts[pts.length - 1];
  const first  = pts[0];
  const diff   = Math.round((latest.rate - first.rate) * 100) / 100;
  const dirColor = diff > 0 ? 'var(--up-color, #C92F2F)' : diff < 0 ? 'var(--down-color, #1636A8)' : 'var(--text-dim)';
  const DirIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-strong)' }}>
            {series.name} 추이
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>최근 12개월 · 한국은행 ECOS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
            {latest.rate.toFixed(2)}%
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '12px', fontWeight: 700, color: dirColor }}>
            <DirIcon size={13} />
            {diff > 0 ? '+' : ''}{diff.toFixed(2)}%p
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '84px', display: 'block' }} aria-label={`${series.name} 12개월 추이`}>
        <polyline
          points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r="3.5"
          fill="var(--accent)"
        />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPeriod(first.period)}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPeriod(latest.period)}</span>
      </div>
    </div>
  );
}

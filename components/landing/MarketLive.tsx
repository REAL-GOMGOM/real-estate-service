'use client';

import { useEffect, useState } from 'react';

/**
 * 랜딩 '수도권 국평 실거래가' — 구별 84㎡ 최근 30일 평균 + 직전 30일 대비 변동률 라이브.
 * /api/transactions 로 6개 구를 병렬 조회해 클라이언트 집계 (표본 즉시 표시, 도착하면 교체).
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const INK2 = '#2B333F';
const MUTED = '#8A93A3';
const BORDER = '#E7EAF0';

const REGIONS = ['강남구', '서초구', '송파구', '마포구', '용산구', '성동구'];

interface Row { region: string; price: string; change: number | null }

const SAMPLE: Row[] = [
  { region: '강남구', price: '25.7억', change: -15.5 },
  { region: '서초구', price: '25.1억', change: -25.6 },
  { region: '송파구', price: '18.9억', change: -8.2 },
  { region: '마포구', price: '14.5억', change: -12.6 },
  { region: '용산구', price: '21.5억', change: -1.1 },
  { region: '성동구', price: '17.2억', change: 2.4 },
];

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-sg, ui-monospace, monospace)',
  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#98A1B0',
};

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = Math.round((manwon / 10000) * 10) / 10;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}

export default function MarketLive() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const D = 24 * 3600 * 1000;
      const now = Date.now();
      const live = await Promise.all(REGIONS.map(async (region): Promise<Row | null> => {
        try {
          const res = await fetch(`/api/transactions?district=${encodeURIComponent(region)}&months=2`);
          const json: { data?: Array<{ transactions: Array<{ area: number; price: number; date: string }> }> } = await res.json();
          const recent: number[] = [];
          const prior: number[] = [];
          for (const g of json.data ?? []) {
            for (const t of g.transactions) {
              if (t.area < 80 || t.area > 88) continue;
              const ts = new Date(t.date).getTime();
              if (Number.isNaN(ts)) continue;
              const age = now - ts;
              if (age <= 30 * D) recent.push(t.price);
              else if (age <= 60 * D) prior.push(t.price);
            }
          }
          const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
          const rAvg = avg(recent);
          if (rAvg === null) return null;
          const pAvg = avg(prior);
          const change = pAvg && pAvg > 0 ? Math.round(((rAvg - pAvg) / pAvg) * 1000) / 10 : null;
          return { region, price: fmtEok(Math.round(rAvg)), change };
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      setRows((prev) => prev.map((row) => live.find((l) => l && l.region === row.region) ?? row));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 20, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <span style={eyebrow}>MARKET · 84㎡</span>
        <span style={{ fontSize: 12, color: MUTED }}>최근 30일 평균 · 직전 대비</span>
      </div>
      <h3 style={{ margin: '4px 0 16px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>수도권 국평 실거래가</h3>
      {rows.map((m, i) => {
        const up = m.change !== null && m.change > 0;
        return (
          <div key={m.region} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F3F7',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: INK2 }}>{m.region}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: INK, fontFamily: 'Roboto Mono, monospace' }}>{m.price}</span>
              {m.change !== null && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: up ? '#E5484D' : BLUE, fontFamily: 'Roboto Mono, monospace', minWidth: 62, textAlign: 'right' }}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}{m.change}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

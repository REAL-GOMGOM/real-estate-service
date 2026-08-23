'use client';

import { useState, useEffect } from 'react';
import { Bitcoin, DollarSign, RefreshCw } from 'lucide-react';
import type { DollarQuoteProvenance } from '@/lib/types';

interface Props {
  baseYear:    number;
  baseRate:    number | null;
  compareYear: number;
  compareRate: number | null;
  baseSource?: DollarQuoteProvenance;
  compareSource?: DollarQuoteProvenance;
}

interface CryptoData {
  btcUsd:          number | null;
  btcKrw:          number | null;
  goldUsdPerGram:  number | null;
  goldKrwPerGram:  number | null;
  updatedAt:       number | null;
  error?:          string;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 금 아이콘 — lucide에 없어서 간단한 SVG 사용
function GoldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function CryptoTicker({
  baseYear, baseRate, compareYear, compareRate,
  baseSource, compareSource,
}: Props) {
  const [data, setData]       = useState<CryptoData | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res  = await fetch('/api/crypto');
      const json = await res.json() as CryptoData;
      setData(json);
    } catch {
      setData({
        btcUsd: null, btcKrw: null, goldUsdPerGram: null,
        goldKrwPerGram: null, updatedAt: null, error: '현재 시세 조회 실패',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const rateChange = baseRate !== null && compareRate !== null && baseRate > 0
    ? ((compareRate - baseRate) / baseRate) * 100
    : null;
  const weakened = rateChange !== null && rateChange > 0;

  const cards = [
    // ── 달러 ──
    {
      group: 'USD',
      icon:  <DollarSign size={15} />,
      label: `${baseYear}년 USD/KRW`,
      value: baseRate !== null ? `₩${baseRate.toLocaleString()}` : '—',
      sub:   baseSource?.source ?? '출처 확인 중',
      color: '#F0A24B',
      bg:    'rgba(245,158,11,0.07)',
      bd:    'rgba(245,158,11,0.18)',
      live:  false,
    },
    {
      group: 'USD',
      icon:  <DollarSign size={15} />,
      label: `${compareYear}년 USD/KRW`,
      value: compareRate !== null ? `₩${compareRate.toLocaleString()}` : '—',
      sub: rateChange !== null
        ? `${weakened ? '▲' : '▼'} ${Math.abs(rateChange).toFixed(1)}% · ${compareSource?.source ?? '출처 확인 중'}`
        : compareSource?.source ?? '출처 확인 중',
      color: weakened ? '#E85D5D' : '#2E7A4C',
      bg:    weakened ? 'rgba(232,93,93,0.07)' : 'rgba(111,192,138,0.07)',
      bd:    weakened ? 'rgba(232,93,93,0.18)'  : 'rgba(111,192,138,0.18)',
      live:  false,
    },
    // ── 비트코인 ──
    {
      group: 'BTC',
      icon:  <Bitcoin size={15} />,
      label: 'BTC / USD',
      value: data?.btcUsd != null ? `$${data.btcUsd.toLocaleString()}` : '—',
      sub:   '실시간',
      color: '#E8663C',
      bg:    'rgba(249,115,22,0.07)',
      bd:    'rgba(249,115,22,0.2)',
      live:  true,
    },
    {
      group: 'BTC',
      icon:  <Bitcoin size={15} />,
      label: 'BTC / KRW',
      value: data?.btcKrw != null
        ? `₩${(data.btcKrw / 100_000_000).toFixed(1)}억`
        : '—',
      sub:   '실시간',
      color: '#E8663C',
      bg:    'rgba(249,115,22,0.07)',
      bd:    'rgba(249,115,22,0.2)',
      live:  true,
    },
    // ── 금 ──
    {
      group: 'GOLD',
      icon:  <GoldIcon size={15} />,
      label: '금 (Au) 현재 시세',
      value: data?.goldKrwPerGram != null
        ? `₩${data.goldKrwPerGram.toLocaleString()}/g`
        : '—',
      sub: (() => {
        if (!data?.goldKrwPerGram) return '실시간 · 한돈(3.75g) 기준';
        const don = Math.round(data.goldKrwPerGram * 3.75);
        const usd  = data.goldUsdPerGram != null ? ` · $${data.goldUsdPerGram}/g` : '';
        return `한돈 ₩${don.toLocaleString()}${usd}`;
      })(),
      color: '#EBC15C',
      bg:    'rgba(251,191,36,0.07)',
      bd:    'rgba(251,191,36,0.2)',
      live:  true,
    },
  ];

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '10px',
        marginBottom: '8px',
      }}>
        {cards.map((c) => (
          <div key={c.label} style={{
            padding: '18px 20px',
            borderRadius: '16px',
            backgroundColor: c.bg,
            border: `1px solid ${c.bd}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{ color: c.color }}>{c.icon}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.03em' }}>{c.label}</span>
            </div>
            <p style={{
              fontSize: 'clamp(17px, 2vw, 24px)',
              fontWeight: 800,
              fontFamily: 'Roboto Mono, monospace',
              color: c.color,
              marginBottom: '4px',
              lineHeight: 1.1,
            }}>
              {loading && c.live ? <span style={{ opacity: 0.4 }}>···</span> : c.value}
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
        {data?.error && (
          <span role="status" style={{ fontSize: '10px', color: '#B7791F', marginRight: 'auto' }}>
            {data.error} — 현재 BTC·PAXG 값은 표시하지 않습니다.
          </span>
        )}
        {data?.updatedAt && (
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            {fmtTime(data.updatedAt)} 기준 · CoinGecko BTC·PAX Gold(PAXG) 호가
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', color: 'var(--text-dim)', background: 'none', border: 'none',
            cursor: 'pointer', opacity: loading ? 0.4 : 1,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          새로고침
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

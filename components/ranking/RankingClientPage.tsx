'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trophy, BarChart3, TrendingUp, Flame } from 'lucide-react';

// ── 타입 ────────────────────────────────────────────
interface TopPriceItem {
  rank: number; aptName: string; district: string; dong: string;
  price: number; priceFormatted: string; dollarPrice: string;
  area: number; pyeong: number; floor: number; dealDate: string;
}
interface VolumeItem {
  rank: number; aptName: string; district: string;
  count: number; avgPrice: number; avgPriceFormatted: string;
}
interface NewHighItem {
  rank: number; aptName: string; district: string;
  price: number; prevHigh: number; diffPercent: number; diffFormatted: string;
}
interface PriceChangeItem {
  rank: number; name: string; changeRate: number; direction: 'up' | 'down' | 'flat';
}
interface RankingData {
  period: string; area: string; updatedAt: string;
  topPrice: Record<string, TopPriceItem[]>;
  volume: Record<string, VolumeItem[]>;
  newHigh: Record<string, NewHighItem[]>;
  priceChange: { regions: PriceChangeItem[]; seoulDistricts: PriceChangeItem[] };
}

type TabKey = 'topPrice' | 'volume' | 'newHigh' | 'priceChange';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'topPrice',    label: '최고가',  icon: <Trophy size={14} /> },
  { key: 'volume',      label: '거래TOP', icon: <BarChart3 size={14} /> },
  { key: 'newHigh',     label: '신고가',  icon: <Flame size={14} /> },
  { key: 'priceChange', label: '상승률',  icon: <TrendingUp size={14} /> },
];
const AREA_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '59',  label: '59㎡' },
  { key: '84',  label: '84㎡' },
  { key: 'large', label: '대형' },
];
const PERIOD_OPTIONS = [
  { key: '3',  label: '최근 3개월' },
  { key: '12', label: '최근 1년' },
];

const MEDAL: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };

function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

// ── 순위 뱃지 ───────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  const color = MEDAL[rank] || 'var(--text-dim)';
  const isMedal = rank <= 3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0,
      fontSize: '12px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
      backgroundColor: isMedal ? color + '22' : 'var(--border-light)',
      color: isMedal ? color : 'var(--text-dim)',
      border: isMedal ? `1.5px solid ${color}44` : '1px solid var(--border)',
    }}>
      {rank === 1 ? '🏆' : rank}
    </span>
  );
}

// ── 카드 컴포넌트들 ─────────────────────────────────
function TopPriceCard({ item }: { item: TopPriceItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} {item.dong} · {item.area}㎡({item.pyeong}평) · {item.floor}층</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ ...priceStyle, color: 'var(--text-primary)' }}>{item.priceFormatted}</p>
        <p style={dollarStyle}>{item.dollarPrice}</p>
      </div>
    </div>
  );
}

function VolumeCard({ item }: { item: VolumeItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} · 평균 {item.avgPriceFormatted}</p>
      </div>
      <p style={{ ...priceStyle, color: '#F59E0B' }}>
        {item.count}<span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-dim)' }}>건</span>
      </p>
    </div>
  );
}

function NewHighCard({ item }: { item: NewHighItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} · 이전 {formatPrice(item.prevHigh)}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ ...priceStyle, color: '#22C55E' }}>{formatPrice(item.price)}</p>
        <p style={{ fontSize: '11px', color: '#22C55E', fontFamily: 'Roboto Mono, monospace' }}>{item.diffFormatted} ({item.diffPercent}%)</p>
      </div>
    </div>
  );
}

function PriceChangeCard({ item }: { item: PriceChangeItem }) {
  const isUp = item.direction === 'up';
  const color = isUp ? '#22C55E' : item.direction === 'down' ? '#EF4444' : 'var(--text-dim)';
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <p style={{ ...nameStyle, flex: 1 }}>{item.name}</p>
      <p style={{ ...priceStyle, color }}>
        {isUp ? '+' : ''}{item.changeRate.toFixed(2)}%
      </p>
    </div>
  );
}

// ── 시도별 카드 ─────────────────────────────────────
function RegionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '20px', borderRadius: '16px',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      transition: 'box-shadow 0.15s',
    }}>
      <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState() {
  return <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: '13px' }}>데이터 없음</p>;
}

// ── 메인 ────────────────────────────────────────────
export default function RankingClientPage() {
  const [tab, setTab] = useState<TabKey>('topPrice');
  const [area, setArea] = useState('all');
  const [period, setPeriod] = useState('3');
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ranking?period=${period}&area=${area}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [period, area]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const regionNames = data ? Object.keys(data.topPrice).filter((k) => k !== '전국') : [];

  function renderTab() {
    if (!data) return null;

    if (tab === 'priceChange') {
      const { regions, seoulDistricts } = data.priceChange;
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '16px',
        }}>
          <RegionCard title="시도별 상승률">
            {regions.length > 0
              ? <div style={listStyle}>{regions.map((it) => <PriceChangeCard key={it.rank} item={it} />)}</div>
              : <EmptyState />}
          </RegionCard>
          <RegionCard title="서울 구별 상승률">
            {seoulDistricts.length > 0
              ? <div style={listStyle}>{seoulDistricts.map((it) => <PriceChangeCard key={it.rank} item={it} />)}</div>
              : <EmptyState />}
          </RegionCard>
        </div>
      );
    }

    const allRegions = ['전국', ...regionNames];
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
        gap: '16px',
      }}>
        {allRegions.map((region) => {
          const items = tab === 'topPrice' ? data.topPrice[region]
            : tab === 'volume' ? data.volume[region]
            : data.newHigh[region];
          return (
            <RegionCard key={region} title={region}>
              {items && items.length > 0 ? (
                <div style={listStyle}>
                  {items.map((it: any) =>
                    tab === 'topPrice' ? <TopPriceCard key={it.rank} item={it} />
                    : tab === 'volume' ? <VolumeCard key={it.rank} item={it} />
                    : <NewHighCard key={it.rank} item={it} />
                  )}
                </div>
              ) : <EmptyState />}
            </RegionCard>
          );
        })}
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
            주간 랭킹
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            최근 실거래 데이터를 기반으로 최고가, 거래량, 신고가, 상승률을 분석합니다. 출처: 국토교통부
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {' · '}{PERIOD_OPTIONS.find((o) => o.key === period)?.label}
              {tab !== 'priceChange' && ` · ${AREA_OPTIONS.find((o) => o.key === area)?.label} 면적`}
            </span>
          </p>
        </div>

        {/* 탭 */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '16px', padding: '4px',
          borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {TABS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                backgroundColor: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 면적 */}
            <div style={{
              display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)',
              opacity: tab === 'priceChange' ? 0.4 : 1,
              pointerEvents: tab === 'priceChange' ? 'none' : 'auto',
            }}>
              {AREA_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setArea(opt.key)}
                  style={{
                    padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    backgroundColor: area === opt.key ? 'var(--bg-card)' : 'transparent',
                    color: area === opt.key ? 'var(--text-primary)' : 'var(--text-dim)',
                    boxShadow: area === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 구분선 */}
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }} />
            {/* 기간 */}
            <div style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)' }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPeriod(opt.key)}
                  style={{
                    padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    backgroundColor: period === opt.key ? 'var(--bg-card)' : 'transparent',
                    color: period === opt.key ? 'var(--text-primary)' : 'var(--text-dim)',
                    boxShadow: period === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
        </div>

        {/* 콘텐츠 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
            <div style={{ width: '32px', height: '32px', margin: '0 auto 12px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: '14px' }}>랭킹 데이터 수집 중...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : data ? renderTab() : (
          <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            데이터를 불러올 수 없습니다
          </p>
        )}

        {/* 면책 */}
        <p style={{
          marginTop: '48px', padding: '16px 20px', borderRadius: '12px',
          backgroundColor: 'var(--border-light)', fontSize: '12px',
          color: 'var(--text-dim)', lineHeight: 1.8,
        }}>
          ※ 거래량·최고가·신고가는 국토교통부 실거래가 공공데이터 기반(시도별 대표 구 표본),
          상승률은 한국부동산원 매매가격지수 기준입니다. 신고 지연 등으로 실제와 차이가 있을 수 있습니다.
        </p>
      </div>
    </main>
  );
}

// ── 공통 스타일 ─────────────────────────────────────
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '12px 0', borderBottom: '1px solid var(--border-light)',
};
const nameStyle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)',
  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
};
const subStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px',
};
const priceStyle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
};
const dollarStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', fontFamily: 'Roboto Mono, monospace',
};
const listStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
};

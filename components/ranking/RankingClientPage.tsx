'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TrendingUp, BarChart3 } from 'lucide-react';

interface VolumeItem {
  rank: number;
  name: string;
  district: string;
  count: number;
  avgPrice: number;
}

interface PriceChangeItem {
  rank: number;
  name: string;
  changeRate: number;
  direction: 'up' | 'down' | 'flat';
}

interface Props {
  volumeData: VolumeItem[];
  volumePeriod: string;
  priceData: PriceChangeItem[];
  pricePeriod: string;
}

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

function RankBadge({ rank }: { rank: number }) {
  const color = MEDAL_COLORS[rank] || 'var(--text-dim)';
  const isMedal = rank <= 3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
      fontSize: '13px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
      backgroundColor: isMedal ? color + '22' : 'var(--border-light)',
      color: isMedal ? color : 'var(--text-dim)',
      border: isMedal ? `1.5px solid ${color}44` : '1px solid var(--border)',
    }}>
      {rank}
    </span>
  );
}

function VolumeCard({ item }: { item: VolumeItem }) {
  return (
    <Link
      href={`/transactions?district=${encodeURIComponent(item.district)}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '16px', borderRadius: '14px',
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        textDecoration: 'none', transition: 'border-color 0.15s',
      }}
    >
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {item.name}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
          {item.district}
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{
          fontSize: '15px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace',
          color: '#F59E0B',
        }}>
          {item.count}<span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-dim)', marginLeft: '2px' }}>건</span>
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'Roboto Mono, monospace' }}>
          평균 {formatPrice(item.avgPrice)}
        </p>
      </div>
    </Link>
  );
}

function PriceChangeCard({ item }: { item: PriceChangeItem }) {
  const isUp = item.direction === 'up';
  const isDown = item.direction === 'down';
  const color = isUp ? '#22C55E' : isDown ? '#EF4444' : 'var(--text-dim)';
  const sign = isUp ? '+' : '';

  return (
    <Link
      href="/price-map"
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '16px', borderRadius: '14px',
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        textDecoration: 'none', transition: 'border-color 0.15s',
      }}
    >
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
        }}>
          {item.name}
        </p>
      </div>
      <p style={{
        fontSize: '15px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace',
        color, flexShrink: 0,
      }}>
        {sign}{item.changeRate.toFixed(2)}%
      </p>
    </Link>
  );
}

export default function RankingClientPage({ volumeData, volumePeriod, priceData, pricePeriod }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'volume' | 'price'>('volume');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const volumeSection = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <BarChart3 size={18} color="#F59E0B" />
        <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
          거래량 TOP 10
        </h2>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>
        {volumePeriod} · 서울 기준
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {volumeData.length > 0 ? (
          volumeData.map((item) => <VolumeCard key={item.rank} item={item} />)
        ) : (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            데이터를 불러올 수 없습니다
          </p>
        )}
      </div>
    </div>
  );

  const priceSection = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <TrendingUp size={18} color="#22C55E" />
        <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
          가격 상승률 TOP 10
        </h2>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>
        {pricePeriod} · 매매가격지수 기준
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {priceData.length > 0 ? (
          priceData.map((item) => <PriceChangeCard key={item.rank} item={item} />)
        ) : (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            데이터를 불러올 수 없습니다
          </p>
        )}
      </div>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 페이지 헤더 */}
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            주간 랭킹
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
            이번 주 가장 활발한 거래와 가격 변동
          </p>
        </div>

        {isMobile ? (
          <>
            {/* 모바일: 탭 전환 */}
            <div style={{
              display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px',
              borderRadius: '12px', backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              {([
                { key: 'volume' as const, icon: <BarChart3 size={14} />, label: '거래량' },
                { key: 'price' as const,  icon: <TrendingUp size={14} />, label: '상승률' },
              ]).map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px 0', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    backgroundColor: activeTab === key ? 'var(--accent)' : 'transparent',
                    color: activeTab === key ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            {activeTab === 'volume' ? volumeSection : priceSection}
          </>
        ) : (
          /* 데스크탑: 2컬럼 */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            {volumeSection}
            {priceSection}
          </div>
        )}

        {/* 면책 문구 */}
        <p style={{
          marginTop: '48px', padding: '16px 20px',
          borderRadius: '12px', backgroundColor: 'var(--border-light)',
          fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.8,
        }}>
          ※ 거래량은 국토교통부 실거래가 공공데이터 기반이며, 상승률은 한국부동산원 매매가격지수 기준입니다.
          신고 지연 등으로 실제와 차이가 있을 수 있습니다.
        </p>
      </div>
    </main>
  );
}

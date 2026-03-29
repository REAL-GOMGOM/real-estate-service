'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';

// 목업 시세 데이터 (최근 8개월)
const MARKET_DATA = [
  {
    id: 'gangnam',
    region: '강남구',
    currentPrice: 28.4,
    changeRate: 2.1,
    isUp: true,
    chartData: [24.1, 24.8, 25.3, 25.9, 26.4, 27.1, 27.8, 28.4],
  },
  {
    id: 'seocho',
    region: '서초구',
    currentPrice: 24.7,
    changeRate: 1.8,
    isUp: true,
    chartData: [21.2, 21.8, 22.1, 22.9, 23.4, 23.8, 24.2, 24.7],
  },
  {
    id: 'mapo',
    region: '마포구',
    currentPrice: 12.3,
    changeRate: -0.8,
    isUp: false,
    chartData: [13.1, 13.0, 12.8, 12.9, 12.7, 12.5, 12.4, 12.3],
  },
];

// SVG 스파크라인 컴포넌트
function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  const W = 140;
  const H = 48;
  const PAD = 4;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const linePath = `M ${pts.map(([x, y]) => `${x},${y}`).join(' L ')}`;
  // 채움 영역: 라인 경로 → 우하단 → 좌하단 → 닫기
  const fillPath = `${linePath} L ${pts[pts.length - 1][0]},${H - PAD} L ${pts[0][0]},${H - PAD} Z`;

  const color = isUp ? '#22C55E' : '#EF4444';
  const gradId = `grad-${isUp ? 'up' : 'dn'}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MarketPreview() {
  return (
    <section style={{ padding: '96px 0', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>

        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '48px' }}
        >
          <div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>주요 지역 시세</h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>최근 8개월 실거래가 기준 · 단위: 억원</p>
          </div>
          <Link href="/market" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
            전체 차트 보기 <ArrowRight size={16} />
          </Link>
        </motion.div>

        {/* 시세 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
          {MARKET_DATA.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              style={{ padding: '28px', borderRadius: '20px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              {/* 지역 + 변동률 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{item.region}</p>
                  <p style={{ fontSize: '26px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)' }}>
                    {item.currentPrice}억
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, backgroundColor: item.isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: item.isUp ? '#22C55E' : '#EF4444' }}>
                  {item.isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {item.isUp ? '+' : ''}{item.changeRate}%
                </div>
              </div>

              {/* 스파크라인 */}
              <Sparkline data={item.chartData} isUp={item.isUp} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}